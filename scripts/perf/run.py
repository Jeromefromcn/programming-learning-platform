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
# Fixtures
# ---------------------------------------------------------------------------

# Shared password for the synthetic STUDENT accounts ensure_student_users
# provisions so grading-throughput submissions have a real username to
# resolve against (see ensure_student_users docstring). Not a secret — these
# are disposable perf-test fixture accounts, disabled again by cleanup_fixtures.
PERF_TEST_STUDENT_PASSWORD = "Perf-Test-P4ssword!"

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


def seed_fixtures(session, fixture_ids=None):
    """Create the perf-test category + Blockly/Python exercises.

    `fixture_ids` may be passed in as a dict to populate in place (e.g. an
    empty dict owned by the caller): each id is recorded the moment its
    create call succeeds, *before* the next call is attempted, so that a
    caller inspecting the same dict object after an exception still sees
    whatever was actually created on the server. If omitted, a fresh dict
    is used and returned on full success as before.
    """
    if fixture_ids is None:
        fixture_ids = {}
    base = session.base_url

    cat = session.post(f"{base}/api/v1/categories",
                        json={"name": "perf-test"}, timeout=10)
    cat.raise_for_status()
    fixture_ids["category_id"] = cat.json()["id"]
    category_id = fixture_ids["category_id"]

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
    fixture_ids["blockly_exercise_id"] = blockly.json()["id"]
    session.patch(f"{base}/api/v1/exercises/{fixture_ids['blockly_exercise_id']}/publish",
                  timeout=10).raise_for_status()

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
    fixture_ids["python_exercise_id"] = python.json()["id"]
    session.patch(f"{base}/api/v1/exercises/{fixture_ids['python_exercise_id']}/publish",
                  timeout=10).raise_for_status()

    return fixture_ids


def cleanup_fixtures(session, fixture_ids, submission_ids, user_ids=()):
    """Delete whatever fixtures exist. Tolerates a partially-populated
    `fixture_ids` (e.g. after seed_fixtures raised partway through) by
    skipping any missing key, and prints a warning for any delete that
    doesn't come back OK instead of silently swallowing it.

    `user_ids` are the perf-test STUDENT accounts provisioned by
    ensure_student_users for the grading-throughput batches. There's no
    user-delete endpoint, so they're disabled instead (PATCH .../status ->
    DISABLED), matching this project's existing "disable, don't delete"
    convention for users. Same warn-on-failure pattern as `_delete` below.
    """
    base = session.base_url

    def _delete(url, label):
        resp = session.delete(url, timeout=10)
        if not resp.ok:
            print(f"WARNING: failed to delete {label}: "
                  f"{resp.status_code} {resp.text}")

    def _disable_user(user_id):
        resp = session.patch(f"{base}/api/v1/users/{user_id}/status",
                              json={"status": "DISABLED"}, timeout=10)
        if not resp.ok:
            print(f"WARNING: failed to disable user {user_id}: "
                  f"{resp.status_code} {resp.text}")

    for sub_id in submission_ids:
        _delete(f"{base}/api/v1/submissions/{sub_id}", f"submission {sub_id}")

    for user_id in user_ids:
        _disable_user(user_id)

    if "blockly_exercise_id" in fixture_ids:
        eid = fixture_ids["blockly_exercise_id"]
        _delete(f"{base}/api/v1/exercises/{eid}", f"blockly exercise {eid}")

    if "python_exercise_id" in fixture_ids:
        eid = fixture_ids["python_exercise_id"]
        _delete(f"{base}/api/v1/exercises/{eid}", f"python exercise {eid}")

    if "category_id" in fixture_ids:
        cid = fixture_ids["category_id"]
        _delete(f"{base}/api/v1/categories/{cid}", f"category {cid}")


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

    # Owned here (not just assigned from seed_fixtures' return value) so that
    # if seed_fixtures raises partway through, this dict still reflects
    # whatever was actually created on the server — seed_fixtures mutates it
    # in place as each id is confirmed, rather than only returning at the end.
    fixture_ids = {}
    submission_ids = []
    # Default for cleanup_fixtures if measure_grading_throughput never runs
    # (e.g. an earlier stage raises). Populated from throughput["user_ids"]
    # below once grading-throughput fixtures (perf-test STUDENT accounts)
    # actually exist, so cleanup can disable them.
    user_ids = []
    rows = []
    try:
        print("Seeding perf-test fixtures ...")
        seed_fixtures(session, fixture_ids)
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
        user_ids = throughput["user_ids"]
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
            cleanup_fixtures(session, fixture_ids, submission_ids, user_ids)
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


def ensure_student_users(session, usernames, password=PERF_TEST_STUDENT_PASSWORD):
    """Create STUDENT accounts for `usernames` if they don't already exist,
    returning the id of each (whether just-created or pre-existing) so the
    caller can disable them again in cleanup.

    Not part of the original task brief for this stage: manual verification
    against the live deployment showed FileImportService.validateFile()
    (backend/src/main/java/com/platform/exercise/submission/FileImportService.java)
    rejects any submission whose `studentName` isn't an existing `users.username`
    ("Username '...' not found in the system."). CLAUDE.md's note that
    "submissions are keyed by name string (students may lack accounts)" is stale
    — superseded by the two-phase import + username-existence gate added later.
    Without this, build_submission_zip's synthetic student names are all
    rejected and measure_grading_throughput would time import failures, not
    grading.

    One request per username rather than the bulk POST /v1/users/import:
    that endpoint pre-validates the whole batch and rejects it all-or-nothing
    on a single duplicate (see UserService.importUsers), which would break
    the tolerate-and-reuse behavior below on any run after the first.

    Tolerates 409 USERNAME_TAKEN (looking the existing user up by username to
    get its id) so these fixture usernames are safely reusable across
    repeated runs. There is no user-delete endpoint, only PATCH .../status to
    disable — cleanup_fixtures does that for every id this returns.
    """
    base = session.base_url
    user_ids = []
    for username in usernames:
        resp = session.post(f"{base}/api/v1/users", json={
            "username": username,
            "displayName": username,
            "password": password,
            "role": "STUDENT",
        }, timeout=10)
        if resp.status_code == 409:
            lookup = session.get(f"{base}/api/v1/users",
                                  params={"name": username, "size": 50}, timeout=10)
            lookup.raise_for_status()
            match = next((u for u in lookup.json()["content"] if u["username"] == username), None)
            if match is not None:
                user_ids.append(match["id"])
            continue
        resp.raise_for_status()
        user_ids.append(resp.json()["id"])
    return user_ids


def measure_grading_throughput(session, fixture_ids):
    blockly_user_ids = ensure_student_users(
        session, [f"perf-test-student-blockly-{i}" for i in range(30)])
    blockly_zip = build_submission_zip(
        fixture_ids["blockly_exercise_id"], "perf-test-blockly", "BLOCKLY",
        "print('hello');", count=30)
    start = time.monotonic()
    blockly_ids = import_zip(session, blockly_zip)
    blockly_elapsed_ms = (time.monotonic() - start) * 1000

    python_user_ids = ensure_student_users(
        session, [f"perf-test-student-python-{i}" for i in range(10)])
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
        "user_ids": blockly_user_ids + python_user_ids,
    }


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


if __name__ == "__main__":
    main()
