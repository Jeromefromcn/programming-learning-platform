import subprocess
import tempfile
import os
import time

PYTHON_BIN = '/usr/local/bin/python3'


def run_test_case(code: str, test_input: str, expected_output: str,
                  time_limit: int, memory_limit_mb: int) -> dict:
    # restricted_imports patches builtins.__import__ as a side effect of
    # being imported, so it must run before any student code does.
    script = f"import restricted_imports\n{code}\n{test_input}\n"

    with tempfile.NamedTemporaryFile(
        mode='w', suffix='.py', dir='/tmp', delete=False, prefix='student_'
    ) as f:
        f.write(script)
        tmp_path = f.name

    # nsjail's own init/diagnostic log is kept off the real stderr (fd 2) so
    # it doesn't clutter genuine program errors, but still captured via a
    # pipe on fd 3 -- if nsjail itself fails to launch the child (e.g. a
    # sandbox environment/capability problem), this is the only place that
    # failure is visible; otherwise it's silently discarded.
    log_read_fd, log_write_fd = os.pipe()
    try:
        start = time.monotonic()
        try:
            proc = subprocess.run(
                [
                    'nsjail',
                    '--mode', 'o',
                    '--time_limit', str(time_limit),
                    '--rlimit_as', str(memory_limit_mb * 1024 * 1024),
                    '--disable_clone_newnet',
                    '--disable_clone_newuser',
                    '--log_fd', '3',
                    # restricted_imports.py lives in /app, not /tmp where the
                    # generated script runs, and nsjail passes no environment
                    # to the child by default -- make the module importable.
                    '--env', 'PYTHONPATH=/app',
                    '--bindmount_ro', '/',
                    '--cwd', '/tmp',
                    '--', PYTHON_BIN, tmp_path
                ],
                capture_output=True,
                text=True,
                timeout=time_limit + 2,
                pass_fds=(log_write_fd,),
                preexec_fn=lambda: os.dup2(log_write_fd, 3),
            )
        except subprocess.TimeoutExpired:
            return {
                'passed': False,
                'actual': None,
                'error': 'TIME_LIMIT_EXCEEDED',
                'executionTimeMs': (time_limit + 2) * 1000
            }
        finally:
            os.close(log_write_fd)

        elapsed_ms = int((time.monotonic() - start) * 1000)
        actual = proc.stdout.strip()
        passed = actual == expected_output.strip()
        error = proc.stderr.strip() if proc.returncode != 0 else None
        if proc.returncode != 0 and not error:
            nsjail_log = os.read(log_read_fd, 65536).decode(errors='replace').strip()
            error = nsjail_log or f'Sandbox exited with status {proc.returncode}'
        return {
            'passed': passed,
            'actual': actual,
            'error': error,
            'executionTimeMs': elapsed_ms
        }
    finally:
        os.close(log_read_fd)
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
