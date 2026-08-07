# scripts/perf — performance measurement tools

Two scripts together produce all 7 rows of the final report's performance
table (Table 6.3): `run.py` produces 6, `cold_start.sh` produces the 7th.

Both scripts talk to a **live, running deployment** — start the stack first
(`docker compose up -d`, see the repo root `CLAUDE.md`).

## `run.py` — response time, grading throughput, memory (6 rows)

```bash
cd scripts/perf
python3 run.py                                  # against http://localhost:8080, admin/admin123
python3 run.py --base-url http://staging:8080 --username admin --password ...
PERF_TEST_USERNAME=admin PERF_TEST_PASSWORD=... python3 run.py   # avoid creds in argv/shell history
python3 run.py --dry-run                         # smoke-test the script itself, see below
python3 run.py --keep                            # leave fixtures/accounts behind, see below
```

Key flags:
- `--base-url` — Nginx entry point (default `http://localhost:8080`).
- `--username` / `--password` — login credentials. Default to
  `$PERF_TEST_USERNAME` / `$PERF_TEST_PASSWORD` if set, else `admin` /
  `admin123`. Prefer the env vars over the CLI flags on a shared machine —
  CLI args are visible in shell history and `ps` output.
- `--dry-run` — use 1 request (instead of 200) for each response-time stage,
  then print and exit; the grading-throughput stage still runs its full
  batch either way. **This is for smoke-testing the script, not for
  producing report data** — with `n=1` the "p95" is a single sample, not a
  real percentile. The printed/saved report is clearly marked
  `*** DRY RUN — NOT REPORT DATA ***` so a dry-run file can't be mistaken
  for a real one later.
- `--keep` — skip cleanup at the end of the run.

### What it mutates on the target deployment

`run.py` is not read-only. Each run:
- Creates one category and two exercises (a Blockly and a Python fixture,
  both published) under the category, used for the response-time and
  grading measurements.
- Provisions up to ~40 STUDENT accounts (30 for the Blockly grading batch,
  10 for the Python batch), all sharing one fixture password. These exist
  because the backend's submission import requires each submission's
  `studentName` to match an existing username — there's no way to measure
  grading throughput without accounts to attribute the submissions to.
- Imports the grading-throughput submission batches (creating real
  `submissions` rows).

By default, all of the above is cleaned up at the end of the run: fixtures
and submissions are deleted, and STUDENT accounts are disabled (there's no
user-delete endpoint in this platform — see the repo's "soft deletes only"
convention). Cleanup runs even if a measurement stage fails partway through,
and a cleanup failure itself is caught and reported as a warning rather than
crashing the process — so a completed run's report is always printed and
saved regardless of cleanup outcome.

`--keep` skips that cleanup, leaving the category, both exercises, the
imported submissions, **and the ~40 STUDENT accounts (ACTIVE, shared
password)** in place. Use it when you want to poke around the fixtures
afterward (e.g. to manually verify a grading result) — just remember those
accounts stay active with a known password until you clean them up by hand
or by re-running without `--keep`.

### Output

Prints a report to stdout and saves it to `scripts/perf/results/<timestamp>.txt`.
The report starts with a header (timestamp, base URL, request count used for
the response-time stages, grading batch sizes, and the dry-run banner if
applicable) followed by the 7-row table — 6 measured rows plus a 7th "Cold
start" placeholder row (result `MANUAL`) pointing at `cold_start.sh`, so the
table is self-describing as all 7 report rows rather than silently 6 of 7.

## `cold_start.sh` — cold start time (1 row)

```bash
scripts/perf/cold_start.sh --yes                          # against http://localhost:8080
scripts/perf/cold_start.sh --yes http://staging:8080       # optional base-url override
```

This is disruptive: it runs `docker compose down` then `docker compose up -d`
on the current deployment and times how long it takes for
`GET <base-url>/api/actuator/health` to respond, so it requires the `--yes`
flag (running it without `--yes` just prints a warning and exits). It gives
up and fails loudly after 10 minutes if the stack never becomes healthy,
rather than polling forever.

## Dev Commands

See the repo root `CLAUDE.md` for the rest of the dev command list; this
tool is referenced there too.
