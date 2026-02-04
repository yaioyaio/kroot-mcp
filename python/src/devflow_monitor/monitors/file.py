"""
File System Monitor.

Monitors file system changes using watchfiles and emits events
through the central event engine. Supports file filtering,
ignore patterns, and automatic context classification.
"""

from __future__ import annotations

import asyncio
import fnmatch
import os
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, Field

from ..events.types.base import EventCategory, EventSeverity
from ..events.types.file import (
    FileChangeAction,
    FileContext,
    FileContextType,
    FileEvent,
    FileEventData,
    FileEventType,
    FileInfo,
)
from .base import BaseMonitor, MonitorConfig

if TYPE_CHECKING:
    from watchfiles import Change

    from ..events.engine import EventEngine


class FileMonitorConfig(MonitorConfig):
    """
    File monitor specific configuration.

    Attributes:
        debounce_ms: Debounce time for file changes in milliseconds.
        recursive: Whether to monitor directories recursively.
        follow_symlinks: Whether to follow symbolic links.
    """

    debounce_ms: int = 200
    recursive: bool = True
    follow_symlinks: bool = False


class FileChangeEvent(BaseModel):
    """Internal file change event representation."""

    action: FileChangeAction
    path: str
    relative_path: str
    extension: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    size: int | None = None
    modified_at: datetime | None = None


class FileMonitor(BaseMonitor):
    """
    File system monitor using watchfiles.

    Monitors file system changes and emits events through the
    event engine. Supports filtering by extension, ignore patterns,
    and automatic context classification.

    Attributes:
        config: File monitor configuration.
        watch_task: Async task for watching files.
    """

    def __init__(
        self,
        config: FileMonitorConfig | None = None,
        event_engine: "EventEngine | None" = None,
    ):
        """
        Initialize file monitor.

        Args:
            config: File monitor configuration.
            event_engine: Event engine for publishing events.
        """
        super().__init__(
            config=config or FileMonitorConfig(),
            event_engine=event_engine,
            name="FileMonitor",
        )
        self._file_config = config or FileMonitorConfig()
        self._watch_task: asyncio.Task[None] | None = None
        self._stop_event = asyncio.Event()
        self._change_buffer: dict[str, asyncio.Task[None]] = {}

    @property
    def file_config(self) -> FileMonitorConfig:
        """Get file-specific configuration."""
        return self._file_config

    async def _on_start(self) -> None:
        """Start file watching."""
        self._stop_event.clear()
        self._watch_task = asyncio.create_task(self._watch_files())
        self._log_info(f"Watching paths: {self._file_config.paths}")

    async def _on_stop(self) -> None:
        """Stop file watching and cleanup resources."""
        self._stop_event.set()

        # Cancel pending debounced changes
        for task in self._change_buffer.values():
            task.cancel()
        self._change_buffer.clear()

        # Cancel watch task
        if self._watch_task:
            self._watch_task.cancel()
            try:
                await self._watch_task
            except asyncio.CancelledError:
                pass
            self._watch_task = None

    async def _watch_files(self) -> None:
        """Watch files for changes using watchfiles."""
        try:
            from watchfiles import awatch, Change
        except ImportError:
            self._log_error(
                "watchfiles not installed. Install with: pip install watchfiles"
            )
            return

        paths = [
            Path(p).resolve()
            for p in self._file_config.paths
            if Path(p).exists()
        ]

        if not paths:
            self._log_warning("No valid paths to watch")
            return

        self._log_info(f"Starting file watcher for {len(paths)} path(s)")

        try:
            async for changes in awatch(
                *paths,
                recursive=self._file_config.recursive,
                step=int(self._file_config.poll_interval * 1000),
                stop_event=self._stop_event,
            ):
                for change_type, change_path in changes:
                    await self._handle_file_change(change_type, change_path)

        except asyncio.CancelledError:
            self._log_debug("File watcher cancelled")
        except Exception as e:
            self._log_error(f"File watcher error: {e}")
            raise

    async def _handle_file_change(
        self, change_type: "Change", file_path: str
    ) -> None:
        """
        Handle a file change event with debouncing.

        Args:
            change_type: Type of change (added, modified, deleted).
            file_path: Path to the changed file.
        """
        from watchfiles import Change

        # Map change type to action
        action_map = {
            Change.added: FileChangeAction.ADD,
            Change.modified: FileChangeAction.CHANGE,
            Change.deleted: FileChangeAction.UNLINK,
        }

        action = action_map.get(change_type, FileChangeAction.CHANGE)
        path = Path(file_path)

        # Check if it's a directory
        is_directory = path.is_dir() if path.exists() else False

        if is_directory:
            if action == FileChangeAction.ADD:
                action = FileChangeAction.ADD_DIR
            elif action == FileChangeAction.UNLINK:
                action = FileChangeAction.UNLINK_DIR

        # Check ignore patterns
        if self._should_ignore(str(path)):
            self._log_debug(f"Ignoring: {path}")
            return

        # Check extension filter
        extension = path.suffix.lower()
        if (
            self._file_config.extensions
            and extension not in self._file_config.extensions
            and not is_directory
        ):
            self._log_debug(f"Ignoring extension: {extension}")
            return

        # Debounce the change
        key = f"{action.value}:{file_path}"
        if key in self._change_buffer:
            self._change_buffer[key].cancel()

        self._change_buffer[key] = asyncio.create_task(
            self._process_debounced_change(action, file_path, is_directory)
        )

    async def _process_debounced_change(
        self, action: FileChangeAction, file_path: str, is_directory: bool
    ) -> None:
        """
        Process a debounced file change.

        Args:
            action: File change action.
            file_path: Path to the changed file.
            is_directory: Whether the path is a directory.
        """
        try:
            await asyncio.sleep(self._file_config.debounce_ms / 1000.0)
        except asyncio.CancelledError:
            return

        # Remove from buffer
        key = f"{action.value}:{file_path}"
        self._change_buffer.pop(key, None)

        await self._process_file_event(action, file_path, is_directory)

    async def _process_file_event(
        self, action: FileChangeAction, file_path: str, is_directory: bool
    ) -> None:
        """
        Process and emit a file event.

        Args:
            action: File change action.
            file_path: Path to the changed file.
            is_directory: Whether the path is a directory.
        """
        path = Path(file_path)
        relative_path = self._get_relative_path(path)

        # Build file info
        file_info = FileInfo(
            path=str(path),
            relative_path=relative_path,
            name=path.name,
            extension=path.suffix.lower(),
            is_directory=is_directory,
        )

        # Get file stats if file exists
        if path.exists() and action != FileChangeAction.UNLINK:
            try:
                stat = path.stat()
                file_info.size = stat.st_size
                file_info.modified_at = datetime.fromtimestamp(stat.st_mtime)
            except OSError as e:
                self._log_debug(f"Could not stat {path}: {e}")

        # Determine event type
        event_type = self._map_action_to_event_type(action, is_directory)

        # Analyze context
        context = self._analyze_context(relative_path, path.suffix.lower())

        # Build event data
        event_data = FileEventData(
            action=action,
            new_file=file_info,
            description=f"File {action.value}: {relative_path}",
            context=context,
        )

        # Create and emit event
        event = FileEvent(
            type=event_type.value,
            category=EventCategory.FILE,
            severity=EventSeverity.INFO,
            source=self._name,
            data=event_data.model_dump(),
        )

        await self._emit_event(event)

        # Emit context-specific events
        await self._emit_context_event(event_data, context, action)

    def _should_ignore(self, file_path: str) -> bool:
        """
        Check if a file path should be ignored.

        Args:
            file_path: Path to check.

        Returns:
            True if the path should be ignored.
        """
        for pattern in self._file_config.ignore_patterns:
            if fnmatch.fnmatch(file_path, pattern):
                return True
            # Also check with Path for cross-platform compatibility
            if fnmatch.fnmatch(str(Path(file_path)), pattern):
                return True
        return False

    def _get_relative_path(self, path: Path) -> str:
        """
        Get relative path from the watched directories.

        Args:
            path: Absolute path.

        Returns:
            Relative path string.
        """
        for watch_path in self._file_config.paths:
            try:
                return str(path.relative_to(Path(watch_path).resolve()))
            except ValueError:
                continue
        return str(path)

    def _map_action_to_event_type(
        self, action: FileChangeAction, is_directory: bool
    ) -> FileEventType:
        """
        Map a file change action to an event type.

        Args:
            action: File change action.
            is_directory: Whether the path is a directory.

        Returns:
            Corresponding FileEventType.
        """
        if is_directory:
            if action in (FileChangeAction.ADD, FileChangeAction.ADD_DIR):
                return FileEventType.DIR_CREATED
            elif action in (
                FileChangeAction.UNLINK,
                FileChangeAction.UNLINK_DIR,
            ):
                return FileEventType.DIR_DELETED
            return FileEventType.DIR_CREATED

        if action == FileChangeAction.ADD:
            return FileEventType.FILE_CREATED
        elif action == FileChangeAction.CHANGE:
            return FileEventType.FILE_CHANGED
        elif action == FileChangeAction.UNLINK:
            return FileEventType.FILE_DELETED

        return FileEventType.FILE_CHANGED

    def _analyze_context(
        self, relative_path: str, extension: str
    ) -> FileContext:
        """
        Analyze the context of a file change.

        Args:
            relative_path: Relative path of the file.
            extension: File extension.

        Returns:
            FileContext with classification information.
        """
        path_lower = relative_path.lower()
        patterns: list[str] = []
        confidence = 0.0
        context_type = FileContextType.UNKNOWN

        # Test file detection
        if "test" in path_lower or "spec" in path_lower:
            context_type = FileContextType.TEST
            patterns.append("test")
            confidence = 0.9

        # Configuration file detection
        elif extension in (".json", ".yaml", ".yml", ".toml", ".ini", ".cfg"):
            context_type = FileContextType.CONFIG
            patterns.append("config_extension")
            confidence = 0.8
        elif "config" in path_lower or "settings" in path_lower:
            context_type = FileContextType.CONFIG
            patterns.append("config_path")
            confidence = 0.85

        # Documentation detection
        elif extension in (".md", ".rst", ".txt", ".adoc"):
            context_type = FileContextType.DOCUMENTATION
            patterns.append("docs_extension")
            confidence = 0.85
        elif "docs" in path_lower or "documentation" in path_lower:
            context_type = FileContextType.DOCUMENTATION
            patterns.append("docs_path")
            confidence = 0.8

        # Source code detection
        elif extension in (".py", ".ts", ".js", ".tsx", ".jsx", ".java", ".go", ".rs"):
            if "test" not in path_lower and "spec" not in path_lower:
                context_type = FileContextType.SOURCE
                patterns.append("source_extension")
                confidence = 0.9

        # Build output detection
        elif path_lower.startswith(("dist/", "build/", "out/", "__pycache__/")):
            context_type = FileContextType.BUILD
            patterns.append("build_path")
            confidence = 0.95

        # Detect language
        language = self._detect_language(extension)

        return FileContext(
            type=context_type,
            confidence=confidence,
            patterns=patterns,
            language=language,
        )

    def _detect_language(self, extension: str) -> str | None:
        """
        Detect programming language from file extension.

        Args:
            extension: File extension.

        Returns:
            Language name or None.
        """
        language_map = {
            ".py": "python",
            ".pyx": "python",
            ".pyi": "python",
            ".ts": "typescript",
            ".tsx": "typescript",
            ".js": "javascript",
            ".jsx": "javascript",
            ".java": "java",
            ".go": "go",
            ".rs": "rust",
            ".rb": "ruby",
            ".php": "php",
            ".cs": "csharp",
            ".cpp": "cpp",
            ".c": "c",
            ".h": "c",
            ".hpp": "cpp",
            ".swift": "swift",
            ".kt": "kotlin",
            ".scala": "scala",
        }
        return language_map.get(extension.lower())

    async def _emit_context_event(
        self,
        event_data: FileEventData,
        context: FileContext,
        action: FileChangeAction,
    ) -> None:
        """
        Emit a context-specific event.

        Args:
            event_data: File event data.
            context: File context.
            action: File change action.
        """
        if context.type == FileContextType.UNKNOWN:
            return

        context_type_map = {
            FileContextType.TEST: FileEventType.CONTEXT_TEST,
            FileContextType.CONFIG: FileEventType.CONTEXT_CONFIG,
            FileContextType.DOCUMENTATION: FileEventType.CONTEXT_DOCUMENTATION,
            FileContextType.SOURCE: FileEventType.CONTEXT_SOURCE,
            FileContextType.BUILD: FileEventType.CONTEXT_BUILD,
        }

        event_type = context_type_map.get(context.type)
        if not event_type:
            return

        event = FileEvent(
            type=event_type.value,
            category=EventCategory.FILE,
            severity=EventSeverity.DEBUG,
            source=self._name,
            data={
                **event_data.model_dump(),
                "context_type": context.type.value,
                "description": (
                    f"{context.type.value.title()} file {action.value}: "
                    f"{event_data.new_file.relative_path}"
                ),
            },
        )

        await self._emit_event(event)

    def add_path(self, path: str) -> None:
        """
        Add a path to monitor.

        Note: Requires restart to take effect.

        Args:
            path: Path to add.
        """
        if path not in self._file_config.paths:
            self._file_config.paths.append(path)
            self._log_info(f"Added monitoring path: {path}")

    def remove_path(self, path: str) -> None:
        """
        Remove a path from monitoring.

        Note: Requires restart to take effect.

        Args:
            path: Path to remove.
        """
        if path in self._file_config.paths:
            self._file_config.paths.remove(path)
            self._log_info(f"Removed monitoring path: {path}")

    def get_stats(self) -> dict[str, Any]:
        """
        Get file monitor statistics.

        Returns:
            Statistics dictionary.
        """
        base_stats = super().get_stats()
        return {
            **base_stats,
            "paths": self._file_config.paths,
            "ignore_patterns": self._file_config.ignore_patterns,
            "extensions": self._file_config.extensions,
            "debounce_ms": self._file_config.debounce_ms,
            "recursive": self._file_config.recursive,
        }
