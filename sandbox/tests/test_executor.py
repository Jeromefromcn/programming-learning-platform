import sys
import os
import subprocess
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import executor


def test_run_test_case_activates_the_import_guard(monkeypatch):
    """
    restricted_imports.py defines the blocked-module patch but only takes
    effect if something actually imports it before the student's code runs.
    Verify run_test_case wires it in: prepends "import restricted_imports"
    to the executed script, and makes the module importable inside the jail
    (nsjail passes no environment by default, so restricted_imports.py --
    which lives in /app, not /tmp where the script runs -- needs PYTHONPATH
    set explicitly).
    """
    captured = {}

    def fake_run(cmd, **kwargs):
        script_path = cmd[-1]
        with open(script_path) as f:
            captured['script'] = f.read()
        captured['cmd'] = cmd
        return subprocess.CompletedProcess(cmd, 0, stdout='ignored\n', stderr='')

    monkeypatch.setattr(executor.subprocess, 'run', fake_run)

    executor.run_test_case('def add(a, b):\n    return a + b',
                            'print(add(1, 2))', 'ignored', 5, 128)

    assert captured['script'].startswith('import restricted_imports\n')
    cmd = captured['cmd']
    assert '--env' in cmd
    env_flag_index = cmd.index('--env')
    assert cmd[env_flag_index + 1] == 'PYTHONPATH=/app'
