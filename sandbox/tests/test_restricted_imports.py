import pytest
import subprocess
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

BLOCKED = [
    'os', 'sys', 'subprocess', 'socket', 'shutil', 'ctypes', 'importlib',
    'pathlib', 'glob', 'pty', 'signal', 'resource',
    # C-extension modules that back a name already above, and were found
    # importable directly (bypassing the block on the wrapper module).
    '_socket', 'posix', '_posixsubprocess', '_ctypes', '_ctypes_test',
    '_signal', 'fcntl', 'mmap',
    # CPython internal/test-only C API and account-info modules: no
    # legitimate use in a beginner Python exercise.
    '_testcapi', '_testbuffer', '_testclinic', '_testimportmultiple',
    '_testinternalcapi', '_testmultiphase', '_testsinglephase',
    '_xxtestfuzz', '_multiprocessing', '_posixshmem',
    '_xxinterpchannels', '_xxsubinterpreters',
    'pwd', 'grp', 'spwd', 'syslog',
]
ALLOWED = ['math', 'random', 'json', 'datetime', 'collections', 're', 'itertools', 'string']

def test_blocked_modules_raise_import_error():
    import restricted_imports
    for name in BLOCKED:
        with pytest.raises(ImportError, match="not allowed"):
            restricted_imports._restricted_import(name, {}, {}, [], 0)

def test_allowed_modules_import_successfully():
    import restricted_imports
    for name in ALLOWED:
        mod = restricted_imports._restricted_import(name, {}, {}, [], 0)
        assert mod is not None


def test_allowed_modules_import_in_a_fresh_process():
    """
    The test above runs inside the pytest process, which has already
    imported json/re/enum for its own purposes by the time this test runs --
    so it can't catch a module whose *internal* import chain hits something
    on BLOCKED (e.g. json -> re -> enum -> sys, and sys is blocked). A real
    graded submission always starts from a brand new nsjail subprocess with
    nothing cached, so that's what has to be tested here too.
    """
    for name in ALLOWED:
        script = f"import restricted_imports\nimport {name}\nprint('OK')\n"
        result = subprocess.run(
            [sys.executable, '-c', script],
            capture_output=True, text=True, timeout=10,
            cwd=os.path.dirname(os.path.dirname(__file__)),
        )
        assert result.returncode == 0 and result.stdout.strip() == 'OK', (
            f"import {name} failed in a fresh process:\n{result.stderr}"
        )
