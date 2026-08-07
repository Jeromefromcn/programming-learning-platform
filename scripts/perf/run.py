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


if __name__ == "__main__":
    main()
