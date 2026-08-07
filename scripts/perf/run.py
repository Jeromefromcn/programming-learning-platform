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
