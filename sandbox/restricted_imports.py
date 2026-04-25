import builtins

BLOCKED = frozenset({
    'os', 'sys', 'subprocess', 'socket', 'shutil', 'ctypes',
    'importlib', 'pathlib', 'glob', 'pty', 'signal', 'resource'
})

_original_import = builtins.__import__


def _restricted_import(name, *args, **kwargs):
    base = name.split('.')[0]
    if base in BLOCKED:
        raise ImportError(f"Import of '{name}' is not allowed in the sandbox")
    return _original_import(name, *args, **kwargs)


builtins.__import__ = _restricted_import
