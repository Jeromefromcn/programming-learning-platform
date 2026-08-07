# Repeatable Performance Test Scripts

## Problem

The final report's Table 6.3 (performance results against the NFR targets in Table 3.2) needs
real measurements: API response time percentiles, auto-grading throughput, memory footprint, and
cold-start time. These numbers should come from a script checked into the repository, not a
one-off set of manual commands, so they can be reproduced by re-running the same script against
the deployed stack at any point.

## Approach

Two independent scripts, split by whether they disrupt the running deployment:

- **`scripts/perf/run.py`** — the six non-disruptive measurements (Table 6.3 rows 1-4, 6-7). Safe
  to run anytime against the live stack; does not restart anything.
- **`scripts/perf/cold_start.sh`** — the one disruptive measurement (row 5, cold start time), kept
  separate because it requires `docker compose down && up`, which interrupts the running service.
  Prints a warning and requires an explicit `--yes` flag to proceed.

No new dependencies: `run.py` uses only the Python standard library plus `requests`, both already
available in this environment. This matches the project's "no extra infrastructure" principle —
a load-testing binary is not worth adding for a report appendix.

## `run.py` stages

1. **Login.** Authenticate as the seeded admin account (`admin` / `admin123`, from
   `V2__seed_admin.sql` — already a public default, not a secret) to get a JWT. Credentials can be
   overridden via `PERF_TEST_USERNAME` / `PERF_TEST_PASSWORD` env vars.

2. **Seed fixtures.** Create a dedicated `perf-test` category and two published, auto-grade
   exercises through the real API (one Blockly, one Python), so the measurements don't depend on
   whatever happens to already be in the database, and are reproducible independent of the current
   state of the live deployment.

3. **Measure**, in order:
   - Exercise list / detail endpoints: 200 requests, concurrency 10, via
     `concurrent.futures.ThreadPoolExecutor`; report p50 and p95.
   - Auto-grading throughput: build a ZIP of 30 Blockly answers and a ZIP of 10 Python answers,
     submit each through the real `/submissions/import` endpoint, time the whole batch, divide by
     count for an average.
   - Memory: `docker stats --no-stream` sampled once at idle and once immediately after the batch
     import above.

4. **Clean up.** Soft-delete the seeded exercises and the submissions created against them, in a
   `finally` block so a mid-run failure doesn't leave partial fixtures behind. `--keep` skips this
   and leaves the data for manual inspection.

## Output

A plain-text summary printed to stdout, laid out to match the seven rows of Table 6.3 directly
(measurement, target, actual, pass/fail), and also written to a timestamped file under
`scripts/perf/results/` so successive runs can be compared later.

## Error handling

Any failure in login or fixture seeding aborts immediately with a clear message; nothing partial
is left behind because seeding and cleanup are both wrapped in try/finally.

## Testing

This is a measurement tool, not application logic — its correctness is the numbers it produces
when pointed at a real deployment, so it is not a candidate for conventional unit tests. A
`--dry-run` flag logs in, seeds fixtures, makes one request of each kind, prints what it would
have measured, and exits — enough to catch a broken script (bad endpoint, bad auth, bad JSON
shape) in a few seconds without waiting through the full 200-request / batch-grading run every
time during development.

## Out of scope

- `cold_start.sh` is specified here only at the level of "what it measures and why it's separate";
  it is a short, disruptive shell script and does not need its own design section.
- No CI integration — this is a manual, on-demand tool for producing report evidence, not a
  regression gate.
