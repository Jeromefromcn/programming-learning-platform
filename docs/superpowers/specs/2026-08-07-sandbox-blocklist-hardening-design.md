# Sandbox Hardening: Close Import-Blocklist and Read-Only Mount Gaps

## Problem

While re-verifying the security test evidence for the final report (S5–S7), live probing of the
running sandbox (`POST /execute`) found two real gaps, not just documentation inaccuracies:

1. **Import blocklist bypass.** `restricted_imports.py` blocks `socket`, `os`, `subprocess`,
   `ctypes`, `signal`, `resource` by name, but Python exposes the C-extension module each of
   these wraps under a separate importable name that the blocklist does not cover:
   `_socket`, `posix`, `_posixsubprocess`, `_ctypes`/`_ctypes_test`, `_signal`, `fcntl`, `mmap`.
   A submission that does `import _socket` today gets full, unblocked socket access.
   Confirmed live: `import _socket; s.connect(('mysql', 3306))` succeeds from inside a graded
   submission, reaching another container on the internal Docker network.

2. **`/tmp` is not actually read-only inside the jail.** `executor.py` passes `--bindmount_ro /`
   to nsjail intending the whole filesystem, including the jail's working directory, to be
   read-only. Empirically this does not hold for `/tmp`: `open('/tmp/x', 'w')` succeeds from
   inside a graded submission. `/app` (the real grading source) is correctly read-only — only
   `/tmp`, which is its own separate tmpfs mount at the container level (`docker-compose.yml`),
   fails to inherit read-only through nsjail's recursive bind. Verified fix: adding `/tmp` as its
   own explicit `--bindmount_ro` target (in addition to `/`) makes nsjail apply read-only to that
   mount point directly, and a normal test script is still readable and runs.

Neither gap allows escaping the container — `/app` is correctly protected and nsjail's PID/CPU/
memory limits still apply — but both contradict the isolation the report claims (S6, S7) and the
first one gives a submission real reach onto the internal Docker network.

## Fix

1. Extend `BLOCKED` in `sandbox/restricted_imports.py` with the confirmed bypass modules:
   `_socket`, `posix`, `_posixsubprocess`, `_ctypes`, `_ctypes_test`, `_signal`, `fcntl`, `mmap`,
   plus the CPython internal/test-only C modules and account-info modules that have no legitimate
   use in a beginner Python exercise and were also found importable: `_testcapi`, `_testbuffer`,
   `_testclinic`, `_testimportmultiple`, `_testinternalcapi`, `_testmultiphase`,
   `_testsinglephase`, `_xxtestfuzz`, `_multiprocessing`, `_posixshmem`, `_xxinterpchannels`,
   `_xxsubinterpreters`, `pwd`, `grp`, `spwd`, `syslog`.
2. Add `'/tmp'` as a second `--bindmount_ro` entry in `executor.py`'s nsjail invocation, alongside
   the existing `'/'`.

## Testing (TDD)

- `sandbox/tests/test_restricted_imports.py`: parametrized test asserting every module in the
  expanded list raises `ImportError` through `_restricted_import`, plus a regression check that
  ordinary modules a Python exercise needs (`math`, `json`, `re`, `random`, `itertools`, `string`)
  still import cleanly.
- `sandbox/tests/test_executor.py`: assert the constructed nsjail command contains
  `['--bindmount_ro', '/tmp']` in addition to `['--bindmount_ro', '/']`.
- Full `pytest sandbox/tests/` run after the fix, plus a live re-probe of the two exploited
  scenarios against the rebuilt container to confirm both are closed.

## Out of scope

- Switching the blocklist to a whitelist model (safer in general, but a larger redesign than this
  fix warrants; noted as a possible future improvement, not done here).
- Any change to the client-side (Blockly/Web Worker) execution path — this fix is sandbox-only.
