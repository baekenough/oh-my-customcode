"""Root conftest.py — adds the project root to sys.path for all tests."""
import sys
import os

# Ensure project root is importable as the top-level package namespace.
# This allows `from scripts.backfill_changelog import ...` to work regardless
# of how pytest resolves the rootdir.
_ROOT = os.path.dirname(os.path.abspath(__file__))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
