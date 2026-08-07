#!/usr/bin/env bash
# Measures cold-start time: docker compose down, then up, timed until the API
# answers a health check. This is disruptive -- it stops the running stack --
# so it requires --yes and prints a clear warning first.
#
# See docs/superpowers/specs/2026-08-07-perf-test-scripts-design.md
set -euo pipefail

if [[ "${1:-}" != "--yes" ]]; then
  echo "This will run 'docker compose down' then 'docker compose up -d' on the" >&2
  echo "current deployment, interrupting it for the duration of the test." >&2
  echo "Re-run as: scripts/perf/cold_start.sh --yes" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

echo "Stopping the stack ..."
docker compose down

echo "Starting the stack and timing until healthy ..."
START=$(date +%s)
docker compose up -d

# export-csv is the only GET endpoint SecurityConfig permits without a JWT
# (see backend SecurityConfig.java); every other /api/v1/* route requires
# auth and would 401 forever here, so it doubles as the readiness probe.
until curl -sf http://localhost:8080/api/v1/submissions/export-csv >/dev/null 2>&1; do
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
