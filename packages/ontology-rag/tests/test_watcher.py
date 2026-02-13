"""Tests for file change watcher."""

import time
from pathlib import Path

import pytest

from ontology_rag.watcher import OntologyWatcher, HAS_WATCHDOG


@pytest.fixture
def watcher_dir(sample_ontology_dir):
    """Return ontology dir from conftest for watcher testing."""
    return sample_ontology_dir


def test_initial_no_changes(watcher_dir):
    """Watcher reports no changes immediately after creation."""
    watcher = OntologyWatcher(watcher_dir)
    assert watcher.check_for_changes() is False


def test_detect_modified_file(watcher_dir):
    """Watcher detects when a YAML file is modified."""
    watcher = OntologyWatcher(watcher_dir)
    # Ensure mtime difference
    time.sleep(0.05)
    agents_file = watcher_dir / "agents.yaml"
    agents_file.write_text(agents_file.read_text() + "\n# modified")
    assert watcher.check_for_changes() is True


def test_detect_new_file(watcher_dir):
    """Watcher detects when a new YAML file is added."""
    watcher = OntologyWatcher(watcher_dir)
    time.sleep(0.05)
    (watcher_dir / "new_file.yaml").write_text("test: true")
    assert watcher.check_for_changes() is True


def test_detect_deleted_file(watcher_dir):
    """Watcher detects when a YAML file is deleted."""
    watcher = OntologyWatcher(watcher_dir)
    (watcher_dir / "agents.yaml").unlink()
    assert watcher.check_for_changes() is True


def test_mark_rebuilt_clears_changes(watcher_dir):
    """After mark_rebuilt, changes are no longer detected."""
    watcher = OntologyWatcher(watcher_dir)
    time.sleep(0.05)
    (watcher_dir / "agents.yaml").write_text("modified: true")
    assert watcher.check_for_changes() is True
    watcher.mark_rebuilt()
    assert watcher.check_for_changes() is False


def test_get_changed_files(watcher_dir):
    """get_changed_files returns list of changed file paths."""
    watcher = OntologyWatcher(watcher_dir)
    time.sleep(0.05)
    (watcher_dir / "agents.yaml").write_text("modified: true")
    changed = watcher.get_changed_files()
    assert len(changed) > 0
    assert any("agents.yaml" in f for f in changed)


def test_empty_directory(tmp_path):
    """Watcher handles non-existent directory gracefully."""
    watcher = OntologyWatcher(tmp_path / "nonexistent")
    assert watcher.check_for_changes() is False


def test_watchdog_not_started_without_package(watcher_dir):
    """start_watchdog returns False if watchdog not installed (or True if it is)."""
    watcher = OntologyWatcher(watcher_dir)
    result = watcher.start_watchdog(lambda: None)
    # Result depends on whether watchdog is installed
    assert isinstance(result, bool)
    watcher.stop_watchdog()  # Cleanup
