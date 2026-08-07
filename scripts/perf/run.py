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


def cleanup_fixtures(session, fixture_ids, submission_ids):
    """Delete whatever fixtures exist. Tolerates a partially-populated
    `fixture_ids` (e.g. after seed_fixtures raised partway through) by
    skipping any missing key, and prints a warning for any delete that
    doesn't come back OK instead of silently swallowing it.
    """
    base = session.base_url

    def _delete(url, label):
        resp = session.delete(url, timeout=10)
        if not resp.ok:
            print(f"WARNING: failed to delete {label}: "
                  f"{resp.status_code} {resp.text}")

    for sub_id in submission_ids:
        _delete(f"{base}/api/v1/submissions/{sub_id}", f"submission {sub_id}")

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


def main():
    args = parse_args()
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
    try:
        print("Seeding perf-test fixtures ...")
        seed_fixtures(session, fixture_ids)
        print(f"Seeded: {fixture_ids}")

        if args.dry_run:
            print("(--dry-run) fixtures seeded; later stages not wired up yet in this task.")
            return

        print("Measuring exercise list response time (200 requests, concurrency 10) ...")
        list_timings = measure_response_times(session, "/api/v1/student/exercises?page=0&size=20")
        print(f"  p50={list_timings['p50_ms']:.0f}ms p95={list_timings['p95_ms']:.0f}ms")

        print("Measuring exercise detail response time ...")
        detail_path = f"/api/v1/student/exercises/{fixture_ids['blockly_exercise_id']}"
        detail_timings = measure_response_times(session, detail_path)
        print(f"  p50={detail_timings['p50_ms']:.0f}ms p95={detail_timings['p95_ms']:.0f}ms")

        print("(grading throughput and memory stages not wired up yet in this task)")
    finally:
        if fixture_ids and not args.keep:
            print("Cleaning up fixtures ...")
            cleanup_fixtures(session, fixture_ids, submission_ids)
            print("Cleaned up.")
        elif fixture_ids:
            print(f"--keep set; leaving fixtures in place: {fixture_ids}")


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


if __name__ == "__main__":
    main()
