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
    (nsjail passes no environment to the child by default, so restricted_imports.py --
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


def test_run_test_case_mounts_tmp_read_only_in_addition_to_root(monkeypatch):
    """
    --bindmount_ro / alone does not make the jail's /tmp read-only in
    practice (it is a separate tmpfs mount at the container level, and does
    not inherit read-only through nsjail's recursive bind of /). Listing
    /tmp as its own --bindmount_ro target makes nsjail enforce read-only on
    that mount point directly -- verified against the real sandbox
    container. This test locks in that the flag is actually passed.
    """
    captured = {}

    def fake_run(cmd, **kwargs):
        captured['cmd'] = cmd
        return subprocess.CompletedProcess(cmd, 0, stdout='ignored\n', stderr='')

    monkeypatch.setattr(executor.subprocess, 'run', fake_run)

    executor.run_test_case('print(1)', '', 'ignored', 5, 128)

    cmd = captured['cmd']
    bindmount_ro_values = [cmd[i + 1] for i, v in enumerate(cmd) if v == '--bindmount_ro']
    assert '/' in bindmount_ro_values
    assert '/tmp' in bindmount_ro_values
