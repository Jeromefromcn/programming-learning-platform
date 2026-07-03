# Grafana NoData False Alerts Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the `High API Error Rate`, `High API Latency (p99)`, and `Python Sandbox Unavailable` Grafana alerts from permanently firing `DatasourceNoData` every 4h, by fixing the one genuinely broken query (latency) and correcting alert semantics for the two queries where "no data" is actually a healthy state.

**Architecture:** Two config edits, no application code changes. (1) `backend/src/main/resources/application.yml` gains a Micrometer distribution config so Spring Boot Actuator exports `http_server_requests_seconds_bucket`. (2) `monitoring/grafana/provisioning/alerting/alert-rules.yaml` flips `noDataState` from `NoData` to `OK` on two rules where an absent series is a legitimate healthy state, not an unknown one. Both services are redeployed and the fix is verified directly against the running Prometheus/Grafana APIs (no unit tests apply — this is infra config, not app logic).

**Tech Stack:** Spring Boot Actuator / Micrometer, Prometheus, Grafana provisioning YAML, Docker Compose.

## Global Constraints

- Full spec: `docs/superpowers/specs/2026-07-03-grafana-nodata-alerts-design.md`
- Do NOT touch `alert-jvm-heap`, `alert-db-connections`, `alert-cpu-usage`, or `alert-api-down` — their `NoData` semantics are already correct.
- Do NOT change `repeat_interval` (stays `4h`).
- Do NOT add synthetic 5xx traffic or fake sandbox-failure events to test alert transitions — verify via direct Prometheus/Grafana API queries instead.
- After development work in this session ends, rebuild and redeploy changed containers (`api-server`, `grafana`) — per project deploy convention.

---

### Task 1: Enable Actuator histogram export for HTTP request latency

**Files:**
- Modify: `backend/src/main/resources/application.yml:26-37` (existing `management:` block)

**Interfaces:**
- Consumes: nothing (standalone config change)
- Produces: `http_server_requests_seconds_bucket` series exported at `GET /api/actuator/prometheus`, consumed by Task 3's verification and by the existing `alert-api-latency` rule (unchanged) in `alert-rules.yaml`.

- [ ] **Step 1: Read current management block to confirm exact indentation**

Read `backend/src/main/resources/application.yml` lines 26-38. Confirm it currently reads:

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,prometheus
  endpoint:
    health:
      show-details: never
  metrics:
    export:
      prometheus:
        enabled: true
```

- [ ] **Step 2: Add the histogram distribution config**

Edit the `metrics:` block so it becomes:

```yaml
  metrics:
    export:
      prometheus:
        enabled: true
    distribution:
      percentiles-histogram:
        http.server.requests: true
```

(i.e. add a `distribution.percentiles-histogram.http.server.requests: true` key as a sibling of `export`, under `metrics:`.)

- [ ] **Step 3: Verify the YAML parses**

Run: `python3 -c "import yaml; yaml.safe_load(open('backend/src/main/resources/application.yml'))" && echo OK`

Expected: prints `OK` with no traceback.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/resources/application.yml
git commit -m "fix(monitoring): export http_server_requests histogram buckets for p99 latency alert"
```

---

### Task 2: Rebuild and redeploy api-server, verify histogram metric is exported

**Files:**
- None (deploy + verification only)

**Interfaces:**
- Consumes: Task 1's `application.yml` change
- Produces: a running `api-server` container that exports `http_server_requests_seconds_bucket`, which Task 4 depends on to confirm the Prometheus query returns data.

- [ ] **Step 1: Rebuild and restart the api-server container**

```bash
cd /home/ubuntu/jerome/programming-learning-platform
docker compose build api-server
docker compose up -d api-server
```

- [ ] **Step 2: Wait for the container to become healthy and hit the actuator endpoint directly**

```bash
sleep 10
docker compose exec api-server curl -s localhost:8080/api/actuator/prometheus | grep -c http_server_requests_seconds_bucket
```

Expected: a number greater than `0` (bucket lines exist). If `0`, re-check Task 1's YAML indentation — a misplaced `distribution:` key (e.g. nested under `export` instead of as its sibling) is the most likely cause.

- [ ] **Step 3: Confirm Prometheus has scraped the new series**

```bash
sleep 20   # allow at least one 15s scrape interval to pass
curl -s 'http://localhost:9090/api/v1/query?query=http_server_requests_seconds_bucket' | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['data']['result']))"
```

Expected: output `> 0`.

No commit for this task — it's a deploy + verification step, not a code change.

---

### Task 3: Flip noDataState to OK for the two false-positive alert rules

**Files:**
- Modify: `monitoring/grafana/provisioning/alerting/alert-rules.yaml:82` (`alert-api-error-rate`)
- Modify: `monitoring/grafana/provisioning/alerting/alert-rules.yaml:277` (`alert-sandbox-unavailable`)

**Interfaces:**
- Consumes: nothing (standalone config change)
- Produces: updated alert rule provisioning consumed by Task 4's redeploy of `grafana`.

- [ ] **Step 1: Edit `alert-api-error-rate`**

In the `alert-api-error-rate` rule block, change:

```yaml
        noDataState: NoData
        execErrState: Error
        for: 5m
        annotations:
          summary: More than 5% of API requests are returning 5xx errors
```

to:

```yaml
        noDataState: OK
        execErrState: Error
        for: 5m
        annotations:
          summary: More than 5% of API requests are returning 5xx errors
```

- [ ] **Step 2: Edit `alert-sandbox-unavailable`**

In the `alert-sandbox-unavailable` rule block, change:

```yaml
        noDataState: NoData
        execErrState: Error
        for: 0s
        annotations:
          summary: Python sandbox returned sandbox_unavailable — grading container may be down
```

to:

```yaml
        noDataState: OK
        execErrState: Error
        for: 0s
        annotations:
          summary: Python sandbox returned sandbox_unavailable — grading container may be down
```

- [ ] **Step 3: Diff the file to confirm only these two lines changed**

```bash
git diff monitoring/grafana/provisioning/alerting/alert-rules.yaml
```

Expected: exactly two changed lines, both `noDataState: NoData` → `noDataState: OK`, in the `alert-api-error-rate` and `alert-sandbox-unavailable` blocks only.

- [ ] **Step 4: Commit**

```bash
git add monitoring/grafana/provisioning/alerting/alert-rules.yaml
git commit -m "fix(monitoring): stop treating absent 5xx/sandbox-failure series as NoData"
```

---

### Task 4: Redeploy Grafana and verify all three alerts clear

**Files:**
- None (deploy + verification only)

**Interfaces:**
- Consumes: Task 2's live `http_server_requests_seconds_bucket` data and Task 3's updated `alert-rules.yaml`
- Produces: final verification evidence that the fix works.

- [ ] **Step 1: Redeploy Grafana to re-provision the alert rules**

```bash
cd /home/ubuntu/jerome/programming-learning-platform
docker compose up -d --force-recreate grafana
sleep 15
```

- [ ] **Step 2: Confirm the rule definitions picked up the changes**

```bash
curl -s -u "admin:$(grep GRAFANA_ADMIN_PASSWORD .env | cut -d= -f2)" \
  'http://localhost:3001/api/v1/provisioning/alert-rules/alert-api-error-rate' | python3 -c "import sys,json; print(json.load(sys.stdin)['noDataState'])"
curl -s -u "admin:$(grep GRAFANA_ADMIN_PASSWORD .env | cut -d= -f2)" \
  'http://localhost:3001/api/v1/provisioning/alert-rules/alert-sandbox-unavailable' | python3 -c "import sys,json; print(json.load(sys.stdin)['noDataState'])"
```

Expected: both print `OK`.

- [ ] **Step 3: Wait for one evaluation cycle (rule group interval is 1m) then check active alerts**

```bash
sleep 70
curl -s -u "admin:$(grep GRAFANA_ADMIN_PASSWORD .env | cut -d= -f2)" \
  'http://localhost:3001/api/alertmanager/grafana/api/v2/alerts' | python3 -c "
import sys, json
alerts = json.load(sys.stdin)
active = [a['labels'].get('rulename', a['labels']) for a in alerts if a['status']['state'] == 'active']
print('Active alerts:', active)
"
```

Expected: `High API Error Rate`, `High API Latency (p99)`, and `Python Sandbox Unavailable` are no longer in the active list. (If other unrelated alerts happen to be active, that's fine — only these three needed to clear.)

- [ ] **Step 4: If any of the three are still active, diagnose before re-attempting**

Per systematic-debugging: don't blindly retry. Check:
- Latency still active → re-run Task 2 Step 2/3 checks; the bucket metric may not have propagated yet, or `application.yml` indentation is still off.
- Error-rate or sandbox-unavailable still active → confirm via Task 4 Step 2 that `noDataState` actually shows `OK` for that rule; if it does but the alert is still `active`, it means the condition is now genuinely `Alerting` (not `NoData`) — i.e. there's now a real 5xx error or a real sandbox failure. That would no longer be a false positive and should be investigated as its own incident, not silenced.

No commit for this task — it's a deploy + verification step, not a code change.
