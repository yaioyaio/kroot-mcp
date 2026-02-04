"""
File System Event Types.

This module defines event types for file system monitoring,
including file creation, modification, deletion, and renaming.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from .base import BaseEvent, EventCategory, EventMetadata, EventSeverity


class FileEventType(str, Enum):
    """File event types."""

    # File change events
    FILE_CREATED = "file:created"
    FILE_CHANGED = "file:changed"
    FILE_DELETED = "file:deleted"
    FILE_RENAMED = "file:renamed"

    # Directory events
    DIR_CREATED = "dir:created"
    DIR_DELETED = "dir:deleted"
    DIR_RENAMED = "dir:renamed"

    # Context events
    CONTEXT_TEST = "_context:test"
    CONTEXT_CONFIG = "_context:config"
    CONTEXT_DOCUMENTATION = "_context:documentation"
    CONTEXT_SOURCE = "_context:source"
    CONTEXT_BUILD = "_context:build"


class FileChangeAction(str, Enum):
    """File change action types."""

    ADD = "add"
    CHANGE = "change"
    UNLINK = "unlink"
    ADD_DIR = "addDir"
    UNLINK_DIR = "unlinkDir"


class FileContextType(str, Enum):
    """File context types for classification."""

    TEST = "test"
    CONFIG = "config"
    DOCUMENTATION = "documentation"
    SOURCE = "source"
    BUILD = "build"
    UNKNOWN = "unknown"


class FileInfo(BaseModel):
    """File information model."""

    path: str
    relative_path: str
    name: str
    extension: str
    size: int | None = None
    permissions: str | None = None
    modified_at: datetime | None = None
    created_at: datetime | None = None
    is_directory: bool = False
    is_symbolic_link: bool = False


class ChangedLines(BaseModel):
    """Changed lines information."""

    added: int = 0
    removed: int = 0


class FileChangeInfo(BaseModel):
    """File change information."""

    action: FileChangeAction
    old_file: FileInfo | None = None
    new_file: FileInfo
    description: str | None = None
    change_size: int | None = None
    changed_lines: ChangedLines | None = None


class FileContext(BaseModel):
    """File context information for classification."""

    type: FileContextType = FileContextType.UNKNOWN
    confidence: float = 0.0
    patterns: list[str] = Field(default_factory=list)
    framework: str | None = None
    language: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class GitStatus(BaseModel):
    """Git status for a file."""

    tracked: bool = False
    staged: bool = False
    branch: str | None = None


class FileEventData(FileChangeInfo):
    """File event data payload."""

    context: FileContext | None = None
    related_files: list[str] = Field(default_factory=list)
    affected_modules: list[str] = Field(default_factory=list)
    git_status: GitStatus | None = None


class FileEvent(BaseEvent):
    """
    File system event.

    Represents a file system change event with detailed information
    about the file, change type, and context.

    Attributes:
        type: File event type.
        category: Always EventCategory.FILE.
        data: File event data payload.
    """

    type: str  # FileEventType value
    category: EventCategory = EventCategory.FILE
    data: dict[str, Any] = Field(default_factory=dict)


class FileBatchSummary(BaseModel):
    """Summary of batch file changes."""

    total_files: int = 0
    added: int = 0
    modified: int = 0
    deleted: int = 0
    renamed: int = 0


class FileBatchContext(BaseModel):
    """Context for batch file operations."""

    is_refactoring: bool = False
    is_bulk_rename: bool = False
    is_structural_change: bool = False


class FileBatchEventData(BaseModel):
    """File batch event data payload."""

    description: str
    files: list[FileChangeInfo]
    summary: FileBatchSummary
    context: FileBatchContext | None = None


class FileBatchEvent(BaseEvent):
    """
    Batch file event.

    Represents multiple file changes grouped together,
    typically from a single operation like a refactoring.
    """

    type: str = "file:batch"
    category: EventCategory = EventCategory.FILE
    data: dict[str, Any] = Field(default_factory=dict)


class FileEventBuilder:
    """Helper class for creating file events."""

    @staticmethod
    def create_file_event(
        event_type: FileEventType,
        data: FileEventData,
        severity: EventSeverity = EventSeverity.INFO,
        correlation_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> FileEvent:
        """
        Create a file event.

        Args:
            event_type: Type of file event.
            data: File event data.
            severity: Event severity level.
            correlation_id: Optional correlation ID.
            metadata: Optional metadata.

        Returns:
            FileEvent instance.
        """
        event_metadata = None
        if metadata:
            event_metadata = EventMetadata(**metadata)

        return FileEvent(
            type=event_type.value,
            category=EventCategory.FILE,
            severity=severity,
            source="FileMonitor",
            data=data.model_dump(),
            correlation_id=correlation_id,
            metadata=event_metadata,
        )

    @staticmethod
    def create_batch_event(
        data: FileBatchEventData,
        severity: EventSeverity = EventSeverity.INFO,
        correlation_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> FileBatchEvent:
        """
        Create a batch file event.

        Args:
            data: Batch event data.
            severity: Event severity level.
            correlation_id: Optional correlation ID.
            metadata: Optional metadata.

        Returns:
            FileBatchEvent instance.
        """
        event_metadata = None
        if metadata:
            event_metadata = EventMetadata(**metadata)

        return FileBatchEvent(
            type="file:batch",
            category=EventCategory.FILE,
            severity=severity,
            source="FileMonitor",
            data=data.model_dump(),
            correlation_id=correlation_id,
            metadata=event_metadata,
        )


def is_file_event(event: BaseEvent) -> bool:
    """Check if event is a file event (not batch)."""
    return event.category == EventCategory.FILE and event.type != "file:batch"


def is_file_batch_event(event: BaseEvent) -> bool:
    """Check if event is a file batch event."""
    return event.category == EventCategory.FILE and event.type == "file:batch"
