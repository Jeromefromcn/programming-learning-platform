# Performance Test Scripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `scripts/perf/run.py`, a repeatable, dependency-light performance measurement tool
that produces the 7 numbers Table 6.3 of the final report needs, plus a separate
`scripts/perf/cold_start.sh` for the one disruptive measurement.

**Architecture:** A single Python script (stdlib + `requests`) that logs in, seeds its own
disposable exercise fixtures through the real API, measures response times / grading throughput /
memory against the live deployed stack, prints a report shaped like Table 6.3, and cleans up after
itself. A tiny separate bash script handles the disruptive cold-start timing.

**Tech Stack:** Python 3 (stdlib `concurrent.futures`, `subprocess`, `statistics`, `zipfile`,
`argparse`, `json`, `time`) + `requests` (already available in this environment). No new
dependencies added to the project.

## Global Constraints

- No new project dependencies (spec: "No new dependencies").
- `run.py` must never leave partial fixtures behind on failure (spec: seeding/cleanup in
  try/finally).
- Default behavior cleans up seeded data; `--keep` skips cleanup (spec: cleanup section).
- `--dry-run` does one of each request and exits, for fast iteration during development (spec:
  Testing section).
- Output must be laid out to match Table 6.3's 7 rows directly, plus a timestamped copy under
  `scripts/perf/results/` (spec: Output section).
- `cold_start.sh` requires an explicit `--yes` flag before it will run (spec: separate disruptive
  script).

---

## File Structure

- Create: `scripts/perf/run.py` — the whole non-disruptive measurement tool (single file; it's a
  linear pipeline of stages, not a library, so one file matches how it's actually used and run).
- Create: `scripts/perf/test_run.py` — unit tests for the pure-logic helpers (percentile
  calculation, memory-string parsing, report formatting). The HTTP-hitting parts are verified via
  `--dry-run`, per the spec's Testing section, not unit tests.
- Create: `scripts/perf/cold_start.sh` — the disruptive cold-start timing, kept separate.
- Create: `scripts/perf/results/.gitkeep` — so the results directory exists in git even though its
  contents (timestamped run outputs) should not be committed.
- Modify: `.gitignore` — add `scripts/perf/results/*.txt` so individual run outputs aren't
  committed, while `.gitkeep` keeps the directory tracked.

---

### Task 1: Pure-logic helpers (percentile, memory parsing, report formatting) with tests

These three functions have no I/O and are the parts of the tool that are actually worth a
conventional TDD cycle, per the spec.

**Files:**
- Create: `scripts/perf/run.py` (helpers only in this task; stages come in later tasks)
- Test: `scripts/perf/test_run.py`

**Interfaces:**
- Produces: `percentile(values: list[float], p: float) -> float`
- Produces: `parse_mem_mb(mem_usage: str) -> float` (parses a `docker stats` `MemUsage` cell like
  `"123.4MiB / 1.5GiB"` and returns the *used* amount in MB)
- Produces: `format_report(rows: list[dict]) -> str` (each row dict has keys `name`, `target`,
  `actual`, `unit`, `passed: bool`)

- [ ] **Step 1: Write the failing tests**

Create `scripts/perf/test_run.py`:

```python
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from run import percentile, parse_mem_mb, format_report


def test_percentile_p50_of_odd_count():
    assert percentile([1, 2, 3, 4, 5], 50) == 3


def test_percentile_p95_interpolates():
    values = list(range(1, 101))  # 1..100
    # p95 of 1..100 should land at 95.05 (linear interpolation, nearest-rank+1 style)
    result = percentile(values, 95)
    assert 95 <= result <= 96


def test_percentile_single_value():
    assert percentile([42], 95) == 42


def test_parse_mem_mb_mebibytes():
    assert abs(parse_mem_mb("123.4MiB / 1.5GiB") - 123.4) < 0.01


def test_parse_mem_mb_gibibytes():
    assert abs(parse_mem_mb("1.2GiB / 4GiB") - 1228.8) < 1.0


def test_parse_mem_mb_kibibytes():
    assert abs(parse_mem_mb("512KiB / 128MiB") - 0.5) < 0.01


def test_format_report_marks_pass_and_fail():
    rows = [
        {"name": "Exercise list p95", "target": "< 500 ms", "actual": "120 ms", "passed": True},
        {"name": "Idle memory", "target": "fits 4096 MB", "actual": "5000 MB", "passed": False},
    ]
    out = format_report(rows)
    assert "Exercise list p95" in out
    assert "PASS" in out
    assert "FAIL" in out
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd scripts/perf && python3 -m pytest test_run.py -v`
Expected: FAIL with `ImportError: cannot import name 'percentile' from 'run'` (or similar — `run.py`
doesn't exist yet, or exists without these names).

- [ ] **Step 3: Write the minimal implementation**

Create `scripts/perf/run.py` with this content (later tasks append to this same file):

```python
#!/usr/bin/env python3
"""
Repeatable performance measurements for the deployed platform.
Produces the 7 numbers in the final report's Table 6.3.

See docs/superpowers/specs/2026-08-07-perf-test-scripts-design.md for the design.
"""
import argparse
import json
import statistics
import subprocess
import sys
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path

import requests


# ---------------------------------------------------------------------------
# Pure-logic helpers (unit tested in test_run.py)
# ---------------------------------------------------------------------------

def percentile(values, p):
    """Nearest-rank percentile with linear interpolation between ranks."""
    if len(values) == 1:
        return values[0]
    ordered = sorted(values)
    k = (len(ordered) - 1) * (p / 100)
    f = int(k)
    c = min(f + 1, len(ordered) - 1)
    if f == c:
        return ordered[f]
    return ordered[f] + (ordered[c] - ordered[f]) * (k - f)


def parse_mem_mb(mem_usage):
    """Parse a `docker stats` MemUsage cell, e.g. '123.4MiB / 1.5GiB', to MB used."""
    used = mem_usage.split('/')[0].strip()
    units = {'KiB': 1 / 1024, 'MiB': 1, 'GiB': 1024, 'B': 1 / (1024 * 1024)}
    for suffix, factor in units.items():
        if used.endswith(suffix):
            return float(used[:-len(suffix)]) * factor
    raise ValueError(f"unrecognized memory unit in: {mem_usage!r}")


def format_report(rows):
    lines = [
        f"{'Measurement':<45} {'Target':<20} {'Actual':<15} {'Result'}",
        "-" * 95,
    ]
    for row in rows:
        result = "PASS" if row["passed"] else "FAIL"
        lines.append(f"{row['name']:<45} {row['target']:<20} {row['actual']:<15} {result}")
    return "\n".join(lines)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd scripts/perf && python3 -m pytest test_run.py -v`
Expected: `6 passed`

- [ ] **Step 5: Commit**

```bash
git add scripts/perf/run.py scripts/perf/test_run.py
git commit -m "test(perf): add percentile, memory-parsing and report-formatting helpers"
```

---

### Task 2: Auth and an authenticated-request helper, with `--dry-run` wired up

**Files:**
- Modify: `scripts/perf/run.py`

**Interfaces:**
- Consumes: nothing new
- Produces: `login(base_url: str, username: str, password: str) -> str` (returns the access token)
- Produces: `Session` class wrapping `requests.Session` with the `Authorization` header set, used
  by every later stage
- Produces: `main()` entry point with `--base-url`, `--username`, `--password`, `--dry-run`,
  `--keep` arguments (later tasks fill in the body; this task makes it runnable end-to-end for
  login alone)

- [ ] **Step 1: Add the login function and CLI skeleton**

Append to `scripts/perf/run.py` (after the helpers from Task 1):

```python
# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def login(base_url, username, password):
    resp = requests.post(
        f"{base_url}/api/v1/auth/login",
        json={"username": username, "password": password},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["accessToken"]


def make_session(base_url, token):
    session = requests.Session()
    session.headers["Authorization"] = f"Bearer {token}"
    session.base_url = base_url
    return session


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8080",
                         help="Nginx entry point (default: http://localhost:8080)")
    parser.add_argument("--username", default="admin")
    parser.add_argument("--password", default="admin123")
    parser.add_argument("--dry-run", action="store_true",
                         help="Seed fixtures, make one request of each kind, print, exit.")
    parser.add_argument("--keep", action="store_true",
                         help="Skip cleanup of seeded fixtures and submissions.")
    return parser.parse_args()


def main():
    args = parse_args()
    print(f"Logging in as {args.username} against {args.base_url} ...")
    token = login(args.base_url, args.username, args.password)
    session = make_session(args.base_url, token)
    print("Logged in.")
    if args.dry_run:
        print("(--dry-run) login succeeded; later stages not wired up yet in this task.")
        return
    print("(full run not wired up yet in this task)")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verify it runs against the live deployment**

Run: `cd scripts/perf && python3 run.py --dry-run`
Expected: prints `Logging in as admin against http://localhost:8080 ...`, then `Logged in.`, then
the dry-run message. If login fails, the script exits with a `requests.HTTPError` traceback —
that's the deployment not being reachable at `http://localhost:8080`, not a bug in this task.

- [ ] **Step 3: Commit**

```bash
git add scripts/perf/run.py
git commit -m "feat(perf): add login and CLI skeleton"
```

---

### Task 3: Seed and clean up disposable exercise fixtures

**Files:**
- Modify: `scripts/perf/run.py`

**Interfaces:**
- Consumes: `Session` from Task 2
- Produces: `seed_fixtures(session) -> dict` returning
  `{"category_id": int, "blockly_exercise_id": int, "python_exercise_id": int}`
- Produces: `cleanup_fixtures(session, fixture_ids: dict, submission_ids: list[int])`

- [ ] **Step 1: Add fixture seeding and cleanup**

Append to `scripts/perf/run.py`:

```python
# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

BLOCKLY_CONFIG = {
    "rubric": {"dimensions": []},
    "autoGrade": True,
    "gradingRules": {
        "outputMatch": {"enabled": True, "expectedOutput": "hello"},
        "requiredBlocks": {"blocks": [], "enabled": False},
        "blockCountLimit": {"max": None, "enabled": False},
        "forbiddenBlocks": {"blocks": [], "enabled": False},
    },
    "showCodeView": False,
    "allowedBlocks": ["text", "text_print"],
    "canViewAnswer": False,
    "answerWorkspaceXml": "<xml xmlns=\"https://developers.google.com/blockly/xml\"></xml>",
    "initialWorkspaceXml": "<xml xmlns=\"https://developers.google.com/blockly/xml\"></xml>",
}

PYTHON_CONFIG = {
    "rubric": {"dimensions": []},
    "autoGrade": True,
    "testCases": [
        {"input": "print(add(1, 2))", "expectedOutput": "3", "visible": True},
    ],
    "starterCode": "def add(a, b):\n    pass",
    "timeLimitSeconds": 5,
    "referenceSolution": "def add(a, b):\n    return a + b",
}


def seed_fixtures(session):
    base = session.base_url
    cat = session.post(f"{base}/api/v1/categories",
                        json={"name": "perf-test"}, timeout=10)
    cat.raise_for_status()
    category_id = cat.json()["id"]

    blockly = session.post(f"{base}/api/v1/exercises", json={
        "title": "perf-test-blockly",
        "description": "perf-test fixture, safe to delete",
        "type": "BLOCKLY",
        "difficulty": "EASY",
        "categoryId": category_id,
        "hints": [],
        "config": BLOCKLY_CONFIG,
    }, timeout=10)
    blockly.raise_for_status()
    blockly_id = blockly.json()["id"]
    session.patch(f"{base}/api/v1/exercises/{blockly_id}/publish", timeout=10).raise_for_status()

    python = session.post(f"{base}/api/v1/exercises", json={
        "title": "perf-test-python",
        "description": "perf-test fixture, safe to delete",
        "type": "PYTHON",
        "difficulty": "EASY",
        "categoryId": category_id,
        "hints": [],
        "config": PYTHON_CONFIG,
    }, timeout=10)
    python.raise_for_status()
    python_id = python.json()["id"]
    session.patch(f"{base}/api/v1/exercises/{python_id}/publish", timeout=10).raise_for_status()

    return {
        "category_id": category_id,
        "blockly_exercise_id": blockly_id,
        "python_exercise_id": python_id,
    }


def cleanup_fixtures(session, fixture_ids, submission_ids):
    base = session.base_url
    for sub_id in submission_ids:
        session.delete(f"{base}/api/v1/submissions/{sub_id}", timeout=10)
    session.delete(f"{base}/api/v1/exercises/{fixture_ids['blockly_exercise_id']}", timeout=10)
    session.delete(f"{base}/api/v1/exercises/{fixture_ids['python_exercise_id']}", timeout=10)
    session.delete(f"{base}/api/v1/categories/{fixture_ids['category_id']}", timeout=10)
```

- [ ] **Step 2: Wire seeding + cleanup into `main()` and verify against the live deployment**

Replace the body of `main()` (from Task 2) with:

```python
def main():
    args = parse_args()
    print(f"Logging in as {args.username} against {args.base_url} ...")
    token = login(args.base_url, args.username, args.password)
    session = make_session(args.base_url, token)
    print("Logged in.")

    fixture_ids = None
    submission_ids = []
    try:
        print("Seeding perf-test fixtures ...")
        fixture_ids = seed_fixtures(session)
        print(f"Seeded: {fixture_ids}")

        if args.dry_run:
            print("(--dry-run) fixtures seeded; later stages not wired up yet in this task.")
            return

        print("(measurement stages not wired up yet in this task)")
    finally:
        if fixture_ids and not args.keep:
            print("Cleaning up fixtures ...")
            cleanup_fixtures(session, fixture_ids, submission_ids)
            print("Cleaned up.")
        elif fixture_ids:
            print(f"--keep set; leaving fixtures in place: {fixture_ids}")
```

Run: `cd scripts/perf && python3 run.py --dry-run`
Expected: logs in, prints `Seeded: {...}` with three real IDs, prints the dry-run message, then
`Cleaning up fixtures ...` and `Cleaned up.`. Verify the cleanup actually worked:
`curl -s http://localhost:8080/api/v1/categories -H "Authorization: Bearer <token>"` should not
list a `perf-test` category afterward (grab a token the same way Task 2's manual check did).

- [ ] **Step 3: Commit**

```bash
git add scripts/perf/run.py
git commit -m "feat(perf): seed and clean up disposable exercise fixtures"
```

---

### Task 4: Response-time measurement (exercise list / detail, p50 / p95)

**Files:**
- Modify: `scripts/perf/run.py`

**Interfaces:**
- Consumes: `Session`, `percentile()` from Task 1
- Produces: `measure_response_times(session, path, n=200, concurrency=10) -> dict` returning
  `{"p50_ms": float, "p95_ms": float}`

- [ ] **Step 1: Add the measurement function**

Append to `scripts/perf/run.py`:

```python
# ---------------------------------------------------------------------------
# Response time
# ---------------------------------------------------------------------------

def _timed_get(session, url):
    start = time.monotonic()
    resp = session.get(url, timeout=10)
    elapsed_ms = (time.monotonic() - start) * 1000
    resp.raise_for_status()
    return elapsed_ms


def measure_response_times(session, path, n=200, concurrency=10):
    url = f"{session.base_url}{path}"
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        timings = list(pool.map(lambda _: _timed_get(session, url), range(n)))
    return {"p50_ms": percentile(timings, 50), "p95_ms": percentile(timings, 95)}
```

- [ ] **Step 2: Wire it into `main()` and verify against the live deployment**

In `main()`, replace `print("(measurement stages not wired up yet in this task)")` with:

```python
        print("Measuring exercise list response time (200 requests, concurrency 10) ...")
        list_timings = measure_response_times(session, "/api/v1/student/exercises?page=0&size=20")
        print(f"  p50={list_timings['p50_ms']:.0f}ms p95={list_timings['p95_ms']:.0f}ms")

        print("Measuring exercise detail response time ...")
        detail_path = f"/api/v1/student/exercises/{fixture_ids['blockly_exercise_id']}"
        detail_timings = measure_response_times(session, detail_path)
        print(f"  p50={detail_timings['p50_ms']:.0f}ms p95={detail_timings['p95_ms']:.0f}ms")

        print("(grading throughput and memory stages not wired up yet in this task)")
```

Run: `cd scripts/perf && python3 run.py --dry-run`

`--dry-run` still exits before this new code runs (it's gated behind the `if args.dry_run: return`
above it in Task 3's wiring) — for this task, temporarily comment out that early return, run once
to confirm real p50/p95 numbers print, then restore it. (Task 6 replaces `--dry-run`'s behavior
properly so it exercises every stage once instead of skipping them; this manual step is only to
verify this task's function works against the real deployment before that rewiring happens.)

Expected: both stages print a `p50=` / `p95=` line with numbers in a plausible range (single-digit
to low-hundreds of ms for a local deployment).

- [ ] **Step 3: Commit**

```bash
git add scripts/perf/run.py
git commit -m "feat(perf): measure exercise list/detail response time percentiles"
```

---

### Task 5: Auto-grading throughput measurement (Blockly + Python batches)

**Files:**
- Modify: `scripts/perf/run.py`

**Interfaces:**
- Consumes: `Session`, fixture IDs from Task 3
- Produces: `build_submission_zip(exercise_id, exercise_type, answer, count) -> bytes`
- Produces: `import_zip(session, zip_bytes) -> list[int]` (returns the created submission IDs)
- Produces: `measure_grading_throughput(session, fixture_ids) -> dict` returning
  `{"blockly_avg_ms": float, "python_avg_ms": float, "submission_ids": list[int]}`

- [ ] **Step 1: Add the batch-import and throughput functions**

Append to `scripts/perf/run.py`:

```python
# ---------------------------------------------------------------------------
# Grading throughput
# ---------------------------------------------------------------------------

def build_submission_zip(exercise_id, exercise_title, exercise_type, answer, count):
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for i in range(count):
            payload = {
                "platformVersion": "1.0",
                "exerciseId": exercise_id,
                "exerciseTitle": exercise_title,
                "exerciseType": exercise_type,
                "exerciseVersion": 1,
                "studentName": f"perf-test-student-{exercise_type.lower()}-{i}",
                "answer": answer,
                "exportedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            zf.writestr(f"submission_{i}.json", json.dumps(payload))
    return buf.getvalue()


def import_zip(session, zip_bytes):
    files = {"files": ("batch.zip", zip_bytes, "application/zip")}
    resp = session.post(f"{session.base_url}/api/v1/submissions/import", files=files, timeout=60)
    resp.raise_for_status()
    body = resp.json()
    return [r["submissionId"] for r in body["results"] if r.get("submissionId") is not None]


def measure_grading_throughput(session, fixture_ids):
    blockly_zip = build_submission_zip(
        fixture_ids["blockly_exercise_id"], "perf-test-blockly", "BLOCKLY",
        "print('hello');", count=30)
    start = time.monotonic()
    blockly_ids = import_zip(session, blockly_zip)
    blockly_elapsed_ms = (time.monotonic() - start) * 1000

    python_zip = build_submission_zip(
        fixture_ids["python_exercise_id"], "perf-test-python", "PYTHON",
        "def add(a, b):\n    return a + b", count=10)
    start = time.monotonic()
    python_ids = import_zip(session, python_zip)
    python_elapsed_ms = (time.monotonic() - start) * 1000

    return {
        "blockly_avg_ms": blockly_elapsed_ms / 30,
        "python_avg_ms": python_elapsed_ms / 10,
        "submission_ids": blockly_ids + python_ids,
    }
```

- [ ] **Step 2: Check the actual import response shape before trusting `submissionId`**

The exact field name for the created submission's ID in `ImportResultDto` needs to be confirmed
against the real backend DTO before this is trusted — response shapes drift. Run:

```bash
grep -n "record ImportResultDto" -A 10 backend/src/main/java/com/platform/exercise/submission/ImportResultDto.java
```

If the field is named differently (e.g. `id` instead of `submissionId`), update the `r["submissionId"]`
lookup in `import_zip` above to match, in this same step, before moving on.

- [ ] **Step 3: Wire it into `main()` and verify against the live deployment**

In `main()`, replace
`print("(grading throughput and memory stages not wired up yet in this task)")` with:

```python
        print("Measuring auto-grading throughput (30 Blockly + 10 Python submissions) ...")
        throughput = measure_grading_throughput(session, fixture_ids)
        submission_ids = throughput["submission_ids"]
        print(f"  Blockly avg={throughput['blockly_avg_ms']:.0f}ms/submission")
        print(f"  Python avg={throughput['python_avg_ms']:.0f}ms/submission")

        print("(memory stage not wired up yet in this task)")
```

Also change `submission_ids = []` earlier in `main()` to just remove that line, since it's now
assigned inside the `try` block above (keep it declared as `submission_ids = []` right before the
`try:` line so the `finally` block still has a valid empty list if seeding fails before this stage
runs — i.e. only add the reassignment inside `try`, don't remove the initial declaration).

Run: `cd scripts/perf && python3 run.py --dry-run` (with the temporary early-return comment-out
from Task 4, same as that task's manual verification step).
Expected: prints Blockly and Python average ms per submission, both plausibly under a few seconds.
Confirm grading actually happened, not just import: `curl -s
"http://localhost:8080/api/v1/submissions?exerciseId=<blockly_exercise_id>"
-H "Authorization: Bearer <token>"` should show `autoScore` populated on the returned submissions.

- [ ] **Step 4: Commit**

```bash
git add scripts/perf/run.py
git commit -m "feat(perf): measure Blockly/Python auto-grading throughput"
```

---

### Task 6: Memory sampling, final report wiring, and proper `--dry-run` behavior

**Files:**
- Modify: `scripts/perf/run.py`
- Create: `scripts/perf/results/.gitkeep`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: everything from Tasks 1-5
- Produces: `sample_memory() -> float` (total MB across this project's containers, via
  `parse_mem_mb` from Task 1)
- Produces: final `main()` that runs every stage once under `--dry-run` (instead of skipping them)
  and prints the full Table-6.3-shaped report either way

- [ ] **Step 1: Add memory sampling**

Append to `scripts/perf/run.py`:

```python
# ---------------------------------------------------------------------------
# Memory
# ---------------------------------------------------------------------------

def sample_memory():
    out = subprocess.run(
        ["docker", "stats", "--no-stream", "--format", "{{.Name}} {{.MemUsage}}"],
        capture_output=True, text=True, timeout=15, check=True,
    ).stdout
    total_mb = 0.0
    for line in out.strip().splitlines():
        name, mem_usage = line.split(" ", 1)
        if name.startswith("programming-learning-platform-"):
            total_mb += parse_mem_mb(mem_usage)
    return total_mb
```

- [ ] **Step 2: Rewrite `main()` to run every stage once under `--dry-run`, build the report, and always print it**

Replace `main()` entirely with:

```python
NFR_TARGETS = {
    "list_p95_ms": 500,
    "detail_p95_ms": 500,
    "blockly_avg_ms": 2000,
    "python_avg_ms": 2000,
    "idle_memory_mb": 4096,
    "batch_memory_mb": 4096,
}


def main():
    args = parse_args()
    n_requests = 1 if args.dry_run else 200

    print(f"Logging in as {args.username} against {args.base_url} ...")
    token = login(args.base_url, args.username, args.password)
    session = make_session(args.base_url, token)
    print("Logged in.")

    fixture_ids = None
    submission_ids = []
    rows = []
    try:
        print("Seeding perf-test fixtures ...")
        fixture_ids = seed_fixtures(session)
        print(f"Seeded: {fixture_ids}")

        print("Sampling idle memory ...")
        idle_mb = sample_memory()
        rows.append({"name": "Idle memory, whole stack", "target": "fits 4096 MB",
                      "actual": f"{idle_mb:.0f} MB", "passed": idle_mb <= NFR_TARGETS["idle_memory_mb"]})

        print("Measuring exercise list response time ...")
        list_timings = measure_response_times(
            session, "/api/v1/student/exercises?page=0&size=20", n=n_requests)
        rows.append({"name": "Exercise list p95", "target": "< 500 ms",
                      "actual": f"{list_timings['p95_ms']:.0f} ms",
                      "passed": list_timings["p95_ms"] < NFR_TARGETS["list_p95_ms"]})

        print("Measuring exercise detail response time ...")
        detail_path = f"/api/v1/student/exercises/{fixture_ids['blockly_exercise_id']}"
        detail_timings = measure_response_times(session, detail_path, n=n_requests)
        rows.append({"name": "Exercise detail p95", "target": "< 500 ms",
                      "actual": f"{detail_timings['p95_ms']:.0f} ms",
                      "passed": detail_timings["p95_ms"] < NFR_TARGETS["detail_p95_ms"]})

        print("Measuring auto-grading throughput ...")
        throughput = measure_grading_throughput(session, fixture_ids)
        submission_ids = throughput["submission_ids"]
        rows.append({"name": "Blockly auto-grade, avg/submission", "target": "< 2000 ms",
                      "actual": f"{throughput['blockly_avg_ms']:.0f} ms",
                      "passed": throughput["blockly_avg_ms"] < NFR_TARGETS["blockly_avg_ms"]})
        rows.append({"name": "Python auto-grade, avg/submission", "target": "< 2000 ms",
                      "actual": f"{throughput['python_avg_ms']:.0f} ms",
                      "passed": throughput["python_avg_ms"] < NFR_TARGETS["python_avg_ms"]})

        print("Sampling memory during/after batch grading ...")
        batch_mb = sample_memory()
        rows.append({"name": "Memory during batch grading", "target": "fits 4096 MB",
                      "actual": f"{batch_mb:.0f} MB",
                      "passed": batch_mb <= NFR_TARGETS["batch_memory_mb"]})

    finally:
        if fixture_ids and not args.keep:
            print("Cleaning up fixtures ...")
            cleanup_fixtures(session, fixture_ids, submission_ids)
            print("Cleaned up.")
        elif fixture_ids:
            print(f"--keep set; leaving fixtures in place: {fixture_ids}")

    report = format_report(rows)
    print("\n" + report)

    results_dir = Path(__file__).parent / "results"
    results_dir.mkdir(exist_ok=True)
    out_path = results_dir / f"{time.strftime('%Y-%m-%d-%H%M%S')}.txt"
    out_path.write_text(report + "\n")
    print(f"\nSaved to {out_path}")
```

- [ ] **Step 3: Create the results directory placeholder and update `.gitignore`**

Run: `mkdir -p scripts/perf/results && touch scripts/perf/results/.gitkeep`

Add this line to `.gitignore`:
```
scripts/perf/results/*.txt
```

- [ ] **Step 4: Run the unit tests, then a real dry run, then a real full run**

Run: `cd scripts/perf && python3 -m pytest test_run.py -v`
Expected: `6 passed` (unchanged from Task 1 — this task didn't touch the pure-logic helpers).

Run: `cd scripts/perf && python3 run.py --dry-run`
Expected: completes in a few seconds, prints the full report table with 6 rows, all real numbers
(the 1-request p50/p95 will be identical to each other, that's expected for `--dry-run`), fixtures
cleaned up afterward, a results file written under `scripts/perf/results/`.

Run: `cd scripts/perf && python3 run.py`
Expected: takes longer (200 real requests per response-time stage), prints the same 6-row report
with realistic p50/p95 spread, a results file written. Read the printed report and sanity-check
every row against the targets in `NFR_TARGETS` — this is the actual data Table 6.3 in the report
will use.

- [ ] **Step 5: Commit**

```bash
git add scripts/perf/run.py scripts/perf/results/.gitkeep .gitignore
git commit -m "feat(perf): wire memory sampling and full report; --dry-run exercises every stage once"
```

---

### Task 7: Cold-start timing script

**Files:**
- Create: `scripts/perf/cold_start.sh`

**Interfaces:**
- Consumes: nothing from earlier tasks (fully standalone)
- Produces: a script invoked as `scripts/perf/cold_start.sh --yes`

- [ ] **Step 1: Write the script**

Create `scripts/perf/cold_start.sh`:

```bash
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

until curl -sf http://localhost:8080/api/v1/settings >/dev/null 2>&1; do
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
```

- [ ] **Step 2: Make it executable and verify**

Run: `chmod +x scripts/perf/cold_start.sh`

Run: `scripts/perf/cold_start.sh` (no `--yes`)
Expected: prints the warning and exits 1, stack untouched — confirm with `docker compose ps` that
all 7 services are still `Up`.

Run: `scripts/perf/cold_start.sh --yes`
Expected: stack goes down and back up, prints `Cold start: <N>s (target: < 180s)` followed by
`PASS` or `FAIL`. Confirm the stack is healthy afterward with `docker compose ps`. This is the
number for Table 6.3's cold-start row.

- [ ] **Step 3: Commit**

```bash
git add scripts/perf/cold_start.sh
git commit -m "feat(perf): add cold-start timing script"
```

---

## Self-Review Notes

- **Spec coverage:** every section of the design doc maps to a task — auth/fixtures (Tasks 2-3),
  response times (Task 4), grading throughput (Task 5), memory (Task 6), report output + cleanup
  wiring (Task 6), `--dry-run` (Task 6), cold start as a separate script (Task 7), pure-logic unit
  tests (Task 1). No gaps found.
- **Placeholder scan:** no TBD/TODO; Task 5's Step 2 is a verification-before-trusting-a-field-name
  step, not a placeholder — it names the exact file and grep to run and what to do with the result.
- **Type/name consistency:** `fixture_ids` keys (`category_id`, `blockly_exercise_id`,
  `python_exercise_id`) are used identically in `seed_fixtures`, `cleanup_fixtures`,
  `measure_response_times` call sites, and `measure_grading_throughput` across Tasks 3-6.
  `submission_ids` flows from `measure_grading_throughput`'s return value into `cleanup_fixtures`'s
  parameter of the same name throughout. `NFR_TARGETS` keys match the row-building code in Task 6
  one-to-one.
