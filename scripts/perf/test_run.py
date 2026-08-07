import sys
import os
import json
import zipfile
from io import BytesIO

sys.path.insert(0, os.path.dirname(__file__))

from run import percentile, parse_mem_mb, format_report, build_submission_zip


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


def test_build_submission_zip_entries_and_schema():
    zip_bytes = build_submission_zip(
        exercise_id=42, exercise_title="perf-test-blockly", exercise_type="BLOCKLY",
        answer="print('hello');", count=3)

    with zipfile.ZipFile(BytesIO(zip_bytes)) as zf:
        names = zf.namelist()
        assert len(names) == 3

        expected_keys = {
            "platformVersion", "exerciseId", "exerciseTitle", "exerciseType",
            "exerciseVersion", "studentName", "answer", "exportedAt",
        }
        for name in names:
            payload = json.loads(zf.read(name))
            assert set(payload.keys()) == expected_keys
            assert payload["exerciseId"] == 42
            assert payload["exerciseTitle"] == "perf-test-blockly"
            assert payload["exerciseType"] == "BLOCKLY"
            assert payload["answer"] == "print('hello');"

        student_names = {json.loads(zf.read(n))["studentName"] for n in names}
        assert student_names == {
            "perf-test-student-blockly-0",
            "perf-test-student-blockly-1",
            "perf-test-student-blockly-2",
        }
