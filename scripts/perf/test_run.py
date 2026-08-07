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
