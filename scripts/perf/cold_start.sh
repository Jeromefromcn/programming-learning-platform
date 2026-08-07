#!/usr/bin/env bash
# Measures cold-start time: docker compose down, then up, timed until the API
# answers a health check. This is disruptive -- it stops the running stack --
# so it requires --yes and prints a clear warning first.
#
# Usage: scripts/perf/cold_start.sh --yes [base-url]
#   base-url defaults to http://localhost:8080 (matches run.py's --base-url
#   default). Positional rather than a --base-url flag to keep this
#   single-purpose script's arg handling simple alongside the existing --yes.
#
# See docs/superpowers/specs/2026-08-07-perf-test-scripts-design.md
set -euo pipefail

if [[ "${1:-}" != "--yes" ]]; then
  echo "This will run 'docker compose down' then 'docker compose up -d' on the" >&2
  echo "current deployment, interrupting it for the duration of the test." >&2
  echo "Re-run as: scripts/perf/cold_start.sh --yes [base-url]" >&2
  exit 1
fi

BASE_URL="${2:-http://localhost:8080}"
MAX_WAIT_SECONDS=600

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

echo "Stopping the stack ..."
docker compose down

echo "Starting the stack and timing until healthy (max ${MAX_WAIT_SECONDS}s) ..."
START=$(date +%s)
docker compose up -d

# Spring Boot's actuator is mounted under the app's context-path (/api, see
# application.yml) and is explicitly permitAll in SecurityConfig.java, so
# /api/actuator/health is a real, intentionally public readiness probe --
# unlike app data endpoints, which require a JWT and would 401 forever here.
# Note: the bare (no /api/ prefix) /actuator/health is NOT this endpoint --
# nginx's SPA fallback serves index.html for it with a false 200.
while ! curl -sf "${BASE_URL}/api/actuator/health" >/dev/null 2>&1; do
  NOW=$(date +%s)
  if (( NOW - START >= MAX_WAIT_SECONDS )); then
    echo "" >&2
    echo "FAIL: stack did not become healthy within ${MAX_WAIT_SECONDS}s" >&2
    exit 1
  fi
  sleep 1
done
END=$(date +%s)

ELAPSED=$((END - START))
echo ""
echo "Cold start: ${ELAPSED}s (target: < 180s)"
if [[ "$ELAPSED" -lt 180 ]]; then
  echo "PASS"
else
  echo "FAIL"
fi
