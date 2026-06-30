# Monitoring Dashboards: Grading, Security, and Usage Metrics

**Date:** 2026-06-30
**Status:** Approved for planning

## Problem

The platform already runs Prometheus + Grafana (`docker-compose.yml`, `monitoring/`) with one dashboard (`platform.json`) covering generic Spring Boot infra metrics: request rate, p95 latency, 5xx rate, JVM heap, DB connections. None of these are specific to this platform's actual risk surface: the grading pipeline (Rhino sandbox for Blockly, nsjail sandbox for Python), abuse/security signals (rate limiting, auth failures, malicious ZIP imports), or usage/adoption (submissions, active students, published exercises).

Today, only one custom metric exists at all: `sandbox.grading.duration`, a timer in `PythonGrader`. There are no counters for grading outcomes, security events, or business activity. Building useful dashboards for these areas requires adding instrumentation to the backend first — this is not a Grafana-only change.

## Goals

1. Add backend metrics instrumentation for grading pipeline health, security/abuse signals, and business/usage activity.
2. Add three new Grafana dashboards (provisioned as code, like the existing `platform.json`) surfacing these metrics.
3. Keep all new code testable in isolation per the project's TDD mandate.
4. No new infrastructure (no Alertmanager, no MySQL exporter, no Redis) — stay within the existing Prometheus/Grafana/Spring Boot Actuator stack.

## Non-goals

- Alerting (Alertmanager rules, Grafana alert notifications) — visibility only, not paging.
- Historical metric retention/persistence tuning (e.g., adding a Prometheus data volume) — flagged as a separate, unrelated consideration.
- Changing existing `platform.json` infra dashboard.

## Architecture

Three small, domain-scoped metrics components wrap `MeterRegistry` so that:
- Metric/tag naming lives in one place per domain (no drift between code and dashboard queries).
- Call sites (`BlocklyGrader`, `PythonGrader`, `RateLimitFilter`, `AuthService`, `FileImportService`, `SubmissionService`) stay free of Prometheus API details.
- Each component is unit-testable in isolation with `SimpleMeterRegistry`.

```
backend/src/main/java/com/platform/exercise/metrics/
  GradingMetrics.java     # used by BlocklyGrader, PythonGrader
  SecurityMetrics.java    # used by RateLimitFilter, AuthService, FileImportService
  BusinessMetrics.java    # used by SubmissionService, BusinessMetricsScheduler
  BusinessMetricsScheduler.java   # the one scheduled job in this effort
```

Rejected alternatives:
- **Direct `MeterRegistry` injection per-service** (today's pattern in `PythonGrader`): rejected because metric naming/tags would scatter across 5+ files with no single source of truth, increasing risk of dashboard queries silently breaking when code changes.
- **AOP/`@Timed` annotations**: rejected because most metrics need outcome-specific tags (timeout vs. instruction-limit vs. passed) determined deep inside method bodies — annotations can't express that without equivalent manual plumbing anyway.

## Grading Pipeline Metrics

**`GradingMetrics` component:**

| Metric | Type | Tags | Notes |
|---|---|---|---|
| `grading_blockly_result_total` | Counter | `outcome` ∈ `passed`, `failed`, `time_limit_exceeded`, `instruction_limit_exceeded`, `execution_error`, `no_rules_configured` | One increment per `BlocklyGrader.grade()` call |
| `grading_python_result_total` | Counter | `outcome` ∈ `completed`, `sandbox_unavailable`, `error` | "completed" = grading ran successfully; the score itself (pass/fail per test case) is already stored per-submission in the DB, not duplicated here |
| `grading_blockly_duration_seconds` | Timer | — | New; Rhino execution currently isn't timed at all |
| `grading_python_duration_seconds` | Timer | — | Renamed from `sandbox.grading.duration` (safe — not referenced by any existing dashboard) |

**Code changes:**
- `BlocklyGrader.grade()` — wrap the `future.get()` call in a `Timer.Sample`; call `gradingMetrics.recordBlocklyResult(outcome)` on every return path.
- `PythonGrader.grade()` — call `gradingMetrics.recordPythonResult(outcome)` alongside the existing timer (renamed).

**Dashboard: "Grading Pipeline"** (`monitoring/grafana/provisioning/dashboards/grading-pipeline.json`)
1. Grading throughput/min, split Blockly vs. Python
2. Failure breakdown, stacked by outcome (timeout / instruction-limit / execution-error / sandbox-unavailable / error)
3. p95 grading duration, by type
4. Sandbox unavailable count — stat panel (signals the Python sandbox container is down)
5. Blockly pass rate % (`passed` / (`passed` + `failed`) — excludes `time_limit_exceeded`, `instruction_limit_exceeded`, `execution_error`, and `no_rules_configured`, since those aren't graded attempts)

## Security & Abuse Metrics

**`SecurityMetrics` component:**

| Metric | Type | Tags | Notes |
|---|---|---|---|
| `security_rate_limit_exceeded_total` | Counter | `endpoint` ∈ `login`, `import`, `submit` | Matches the three limiters in `RateLimitFilter` |
| `security_auth_failure_total` | Counter | `reason` ∈ `bad_credentials`, `account_disabled` | `account_disabled` flags attempted use of a revoked account |
| `security_import_rejected_total` | Counter | `reason` ∈ `path_traversal`, `too_large`, `invalid`, `duplicate` | Maps to `ZIP_PATH_TRAVERSAL`, `ZIP_TOO_LARGE`, `IMPORT_FILE_INVALID`, `IMPORT_DUPLICATE` |

**Code changes:**
- `RateLimitFilter.writeRateLimitResponse()` — pass the endpoint label through to record the right tag at each of the three call sites.
- `AuthService` — record at the bad-credentials check and at the disabled-account check.
- `FileImportService` — record at each of the four rejection paths.

**Dashboard: "Security & Abuse"** (`monitoring/grafana/provisioning/dashboards/security-abuse.json`)
1. Rate-limit hits/min by endpoint
2. Auth failures/min by reason
3. Import rejections by reason
4. Path-traversal attempt count — stat panel (should sit at ~0; any nonzero warrants a look)

## Business/Usage Metrics

**`BusinessMetrics` component:**

| Metric | Type | Tags | Update mechanism |
|---|---|---|---|
| `business_submission_created_total` | Counter | `exercise_type` ∈ `BLOCKLY`, `PYTHON` | In-process increment when a submission is persisted — free, no DB hit |
| `business_published_exercises` | Gauge | — | Direct supplier, cheap `COUNT` on each scrape |
| `business_active_courses` | Gauge | — | Direct supplier, cheap `COUNT` on each scrape |
| `business_active_students_30d` | Gauge | — | Backed by `AtomicLong`, refreshed every 5 min by `BusinessMetricsScheduler` — NOT a live per-scrape query, because `COUNT(DISTINCT student_name)` over a date range is too expensive to run every 15s for a number that doesn't need second-level freshness |

**Code changes:**
- `SubmissionService` — call `businessMetrics.recordSubmissionCreated(exerciseType)` where submissions are persisted.
- New `BusinessMetricsScheduler` (`@Scheduled(fixedRate = 5 * 60 * 1000)`) — the one scheduled job in this effort, refreshing the active-students gauge via `SubmissionRepository`.

**Dashboard: "Usage"** (`monitoring/grafana/provisioning/dashboards/usage.json`)
1. Submissions/hour, by exercise type (stacked)
2. Active students (30-day distinct) — stat panel
3. Published exercises / active courses — stat panels

## Testing Plan (TDD)

- `GradingMetrics`, `SecurityMetrics`, `BusinessMetrics`: unit tests using `SimpleMeterRegistry`, written first — call each `record*` method, assert the expected counter/timer name+tags+value.
- `BlocklyGrader`, `PythonGrader`, `RateLimitFilter`, `AuthService`, `FileImportService`: existing tests extended to assert the metrics component is invoked with the correct outcome/reason per branch, using a mock/spy rather than re-asserting registry internals in every call site's test.
- `BusinessMetricsScheduler`: unit test with a mocked `SubmissionRepository`, asserting the gauge value updates after `refresh()`.
- Dashboard JSON: not unit-testable. Verified manually — `docker compose up -d prometheus grafana api-server`, exercise each code path (submit an exercise, trigger a rate limit, trigger a ZIP rejection), confirm each panel renders non-empty data.

## Deployment Notes

- Dashboard/Prometheus config changes are config-only — no rebuild needed, just restart the `grafana`/`prometheus` containers (bind-mounted from `monitoring/`).
- The metrics themselves require rebuilding and redeploying the `api-server` image, since they're emitted by compiled backend code.
- Everything here is committed to git, so a fresh `git clone` + `docker compose up -d` on any server reproduces the full setup identically — no manual Grafana UI configuration involved.
- Out of scope, flagged separately: Prometheus currently has no persistent volume, so metric history doesn't survive a container recreate (only the config/dashboards do). Not addressed by this spec.
