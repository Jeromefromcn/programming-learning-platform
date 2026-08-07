import builtins

BLOCKED = frozenset({
    'os', 'sys', 'subprocess', 'socket', 'shutil', 'ctypes',
    'importlib', 'pathlib', 'glob', 'pty', 'signal', 'resource',
    # C-extension modules that back a name already above. Blocking the
    # pure-Python wrapper is not enough -- these are separately importable
    # and give the same underlying capability.
    '_socket', 'posix', '_posixsubprocess', '_ctypes', '_ctypes_test',
    '_signal', 'fcntl', 'mmap',
    # CPython internal/test-only C API and account-info modules. No
    # legitimate use in a beginner Python exercise.
    '_testcapi', '_testbuffer', '_testclinic', '_testimportmultiple',
    '_testinternalcapi', '_testmultiphase', '_testsinglephase',
    '_xxtestfuzz', '_multiprocessing', '_posixshmem',
    '_xxinterpchannels', '_xxsubinterpreters',
    'pwd', 'grp', 'spwd', 'syslog',
})

_original_import = builtins.__import__

# Common stdlib modules a beginner Python exercise needs. Several of these
# have an internal `import sys` (or similar) buried in their own module
# body as an implementation detail -- e.g. json -> re -> enum -> sys -- and
# that would otherwise raise through the blocked-module check below the
# first time student code imports them in a fresh interpreter, since
# nothing is cached yet. Warming them here, with the real import and before
# the patch takes effect, means a later `import json` just hits the cache
# instead of re-running that internal chain through the patched
# __import__. This does not weaken the block: student code still can't
# `import sys` directly, since that name is checked on every import call
# below regardless of what is already cached.
for _name in ('math', 'random', 'json', 'datetime', 'collections', 're', 'itertools', 'string'):
    _original_import(_name)


def _restricted_import(name, *args, **kwargs):
    base = name.split('.')[0]
    if base in BLOCKED:
        raise ImportError(f"Import of '{name}' is not allowed in the sandbox")
    return _original_import(name, *args, **kwargs)


builtins.__import__ = _restricted_import
