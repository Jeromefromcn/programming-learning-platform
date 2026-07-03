# Grafana "DatasourceNoData" false alerts — design

## Problem

Three Grafana alerts (`High API Error Rate`, `High API Latency (p99)`, `Python Sandbox Unavailable`) have been continuously firing as `DatasourceNoData`, re-notifying every 4h via the `repeat_interval: 4h` notification policy. Investigation (see conversation) found Prometheus itself is healthy — the target is `up` and scraping every 15s. Root causes, one per alert:

1. **High API Latency (p99)** — `histogram_quantile(...http_server_requests_seconds_bucket...)` can never return data. `application.yml` never enables `management.metrics.distribution.percentiles-histogram.http.server.requests`, so Spring Boot Actuator never exports the `_bucket` series. Confirmed via `curl :9090/api/v1/query?query=http_server_requests_seconds_bucket` → empty vector.
2. **High API Error Rate** — no 5xx response has ever occurred on this instance, so `http_server_requests_seconds_count{status=~"5.."}` has no series yet. Prometheus returns an empty vector (not zero) for a label value with no matching series, so the division query returns no data.
3. **Python Sandbox Unavailable** — `grading_python_result_total{outcome="sandbox_unavailable"}` (incremented at `PythonGrader.java:69`) only gets a series once that outcome actually happens. Since the sandbox has never failed, the series doesn't exist, and `for: 0s` means the rule fires as NoData on every single evaluation.

For (2) and (3), "no data" is actually the correct, healthy state (zero errors / zero sandbox failures) — the alert rules are just conflating "series absent" with "something is wrong."

## Fix

1. **application.yml** — add histogram export so the latency alert has real data to evaluate:
   ```yaml
   management:
     metrics:
       distribution:
         percentiles-histogram:
           http.server.requests: true
   ```

2. **alert-rules.yaml** — change `noDataState: NoData` → `noDataState: OK` for:
   - `alert-api-error-rate`
   - `alert-sandbox-unavailable`

   Rationale: total outage (Prometheus can't reach api-server at all) is already covered by the dedicated `alert-api-down` rule (`up{job="exercise-platform"}`, `noDataState: Alerting`), so these two rules don't need to double as outage detectors. Absence of their specific series is a legitimate healthy state, not an unknown state.

No changes to `alert-jvm-heap`, `alert-db-connections`, `alert-cpu-usage`, or `alert-api-down` — those query gauges that always exist while the JVM is running, so `NoData` there still indicates a real problem (e.g. scrape failure). `alert-api-latency` keeps `noDataState: NoData` since after the histogram fix it will always have real data while the app is up.

## Verification

Config/infra change, not app logic — verified against the live stack rather than automated tests:

1. Rebuild + redeploy `api-server`; confirm `/actuator/prometheus` now emits `http_server_requests_seconds_bucket`.
2. Query Prometheus directly for `histogram_quantile(0.99, sum(rate(http_server_requests_seconds_bucket[5m])) by (le))` and confirm it returns a value instead of an empty vector.
3. Redeploy `grafana` (re-provisions `alert-rules.yaml`); confirm via Grafana's alerting API that all three alerts are no longer `active`/firing.

## Out of scope

- Not changing `repeat_interval` (4h) — moot once the false positives are fixed.
- Not adding synthetic 5xx traffic or a fake sandbox-unavailable event to "test" the alert paths — no safe way to do that against the live sandbox without disrupting service, and the query logic itself is standard Prometheus behavior, not custom code.
