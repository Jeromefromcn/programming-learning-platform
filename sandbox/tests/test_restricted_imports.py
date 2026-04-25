import pytest
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

BLOCKED = ['os', 'sys', 'subprocess', 'socket', 'shutil', 'ctypes', 'importlib']
ALLOWED = ['math', 'random', 'json', 'datetime', 'collections']

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
