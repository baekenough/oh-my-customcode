"""File change detection for ontology auto-rebuild.

Primary mode: mtime comparison (zero dependencies).
Optional mode: watchdog filesystem events (requires watchdog package).
"""

import os
import time
from pathlib import Path
from typing import Callable, Optional

try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
    HAS_WATCHDOG = True
except ImportError:
    HAS_WATCHDOG = False


class OntologyWatcher:
    """Watch ontology files for changes and trigger rebuilds.

    Two modes:
    1. Polling (default): check_for_changes() compares mtime snapshots.
       Called on each MCP tool invocation. Cost: < 0.1ms.
    2. Watchdog (optional): start_watchdog() uses OS file events.
       Requires watchdog package.

    Monitored paths:
    - ontology_dir/*.yaml (agents, skills, rules definitions)
    - ontology_dir/graphs/*.json (graph data)
    """

    def __init__(self, ontology_dir: str | Path):
        """Initialize watcher.

        Args:
            ontology_dir: Path to ontology directory containing YAML/JSON files.
        """
        self.ontology_dir = Path(ontology_dir)
        self._mtime_snapshot: dict[str, float] = {}
        self._observer = None  # watchdog Observer if started
        self._rebuild_callback: Optional[Callable] = None
        self._take_snapshot()

    def _get_watched_files(self) -> list[Path]:
        """Get list of files to monitor.

        Returns:
            List of Path objects for YAML and JSON files in ontology dir.
        """
        files = []
        if self.ontology_dir.exists():
            files.extend(self.ontology_dir.glob("*.yaml"))
            files.extend(self.ontology_dir.glob("*.yml"))
            graphs_dir = self.ontology_dir / "graphs"
            if graphs_dir.exists():
                files.extend(graphs_dir.glob("*.json"))
        return sorted(files)

    def _take_snapshot(self):
        """Record current mtime for all watched files."""
        self._mtime_snapshot = {}
        for f in self._get_watched_files():
            try:
                self._mtime_snapshot[str(f)] = f.stat().st_mtime
            except OSError:
                pass

    def check_for_changes(self) -> bool:
        """Check if any watched files changed since last snapshot.

        Compares current mtimes against stored snapshot.
        Cost: < 0.1ms for typical ontology directory.

        Returns:
            True if any file was added, removed, or modified.
        """
        current_files = self._get_watched_files()
        current_mtimes = {}
        for f in current_files:
            try:
                current_mtimes[str(f)] = f.stat().st_mtime
            except OSError:
                pass

        # Check for changes
        changed = False

        # New or modified files
        for path, mtime in current_mtimes.items():
            old_mtime = self._mtime_snapshot.get(path)
            if old_mtime is None or mtime != old_mtime:
                changed = True
                break

        # Deleted files
        if not changed:
            for path in self._mtime_snapshot:
                if path not in current_mtimes:
                    changed = True
                    break

        return changed

    def mark_rebuilt(self):
        """Update snapshot after successful rebuild."""
        self._take_snapshot()

    def get_changed_files(self) -> list[str]:
        """Get list of files that changed since last snapshot.

        Returns:
            List of changed file paths (added, modified, or deleted).
        """
        current_files = {}
        for f in self._get_watched_files():
            try:
                current_files[str(f)] = f.stat().st_mtime
            except OSError:
                pass

        changed = []
        # Modified or new
        for path, mtime in current_files.items():
            old_mtime = self._mtime_snapshot.get(path)
            if old_mtime is None or mtime != old_mtime:
                changed.append(path)

        # Deleted
        for path in self._mtime_snapshot:
            if path not in current_files:
                changed.append(path)

        return changed

    def start_watchdog(self, callback: Callable[[], None]) -> bool:
        """Start watchdog-based file monitoring (optional).

        Args:
            callback: Function to call when changes detected.

        Returns:
            True if watchdog started successfully, False if watchdog not installed.
        """
        if not HAS_WATCHDOG:
            return False

        self._rebuild_callback = callback

        handler = _OntologyEventHandler(callback)
        self._observer = Observer()
        self._observer.schedule(handler, str(self.ontology_dir), recursive=True)
        self._observer.daemon = True
        self._observer.start()
        return True

    def stop_watchdog(self):
        """Stop the watchdog observer if running."""
        if self._observer is not None:
            self._observer.stop()
            self._observer.join(timeout=2.0)
            self._observer = None


if HAS_WATCHDOG:
    class _OntologyEventHandler(FileSystemEventHandler):
        """Handle file system events for ontology files."""

        WATCHED_EXTENSIONS = {".yaml", ".yml", ".json"}

        def __init__(self, callback: Callable[[], None]):
            super().__init__()
            self._callback = callback
            self._last_trigger = 0.0
            self._debounce_seconds = 1.0

        def on_modified(self, event):
            if event.is_directory:
                return
            if Path(event.src_path).suffix in self.WATCHED_EXTENSIONS:
                self._trigger()

        def on_created(self, event):
            if event.is_directory:
                return
            if Path(event.src_path).suffix in self.WATCHED_EXTENSIONS:
                self._trigger()

        def on_deleted(self, event):
            if event.is_directory:
                return
            if Path(event.src_path).suffix in self.WATCHED_EXTENSIONS:
                self._trigger()

        def _trigger(self):
            now = time.time()
            if now - self._last_trigger >= self._debounce_seconds:
                self._last_trigger = now
                self._callback()
