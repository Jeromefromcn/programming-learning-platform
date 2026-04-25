import subprocess
import tempfile
import os
import time


def run_test_case(code: str, test_input: str, expected_output: str,
                  time_limit: int, memory_limit_mb: int) -> dict:
    script = f"{code}\n{test_input}\n"

    with tempfile.NamedTemporaryFile(
        mode='w', suffix='.py', dir='/tmp', delete=False, prefix='student_'
    ) as f:
        f.write(script)
        tmp_path = f.name

    try:
        start = time.monotonic()
        proc = subprocess.run(
            [
                'nsjail',
                '--mode', 'o',
                '--time_limit', str(time_limit),
                '--rlimit_as', str(memory_limit_mb * 1024 * 1024),
                '--disable_clone_newnet',
                '--log_fd', '3',
                '--bindmount_ro', '/',
                '--tmpfsmount', '/tmp',
                '--cwd', '/tmp',
                '--', 'python3', tmp_path
            ],
            capture_output=True,
            text=True,
            timeout=time_limit + 2
        )
        elapsed_ms = int((time.monotonic() - start) * 1000)
        actual = proc.stdout.strip()
        passed = actual == expected_output.strip()
        error = proc.stderr.strip() if proc.returncode != 0 else None
        return {
            'passed': passed,
            'actual': actual,
            'error': error,
            'executionTimeMs': elapsed_ms
        }
    except subprocess.TimeoutExpired:
        return {
            'passed': False,
            'actual': None,
            'error': 'TIME_LIMIT_EXCEEDED',
            'executionTimeMs': (time_limit + 2) * 1000
        }
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
