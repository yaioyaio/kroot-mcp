"""
Storage Types for DevFlow Monitor.

Defines all storage-related types, records, and interfaces used
for database operations and data persistence.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Protocol, TypeVar

from pydantic import BaseModel, Field


class OrderDirection(str, Enum):
    """Order direction for queries."""

    ASC = "ASC"
    DESC = "DESC"


class SyncStatus(str, Enum):
    """Synchronization status for records."""

    PENDING = "pending"
    SYNCED = "synced"
    FAILED = "failed"
    CONFLICT = "conflict"


@dataclass
class QueryOptions:
    """
    Query options for filtering and pagination.

    Attributes:
        limit: Maximum number of records to return.
        offset: Number of records to skip.
        order_by: Column name to order by.
        order_direction: Order direction (ASC or DESC).
        filters: Additional filter conditions.
    """

    limit: int | None = None
    offset: int | None = None
    order_by: str | None = None
    order_direction: OrderDirection = OrderDirection.ASC
    filters: dict[str, Any] = field(default_factory=dict)


class EventRecord(BaseModel):
    """
    Event storage record.

    Represents an event record as stored in the database.

    Attributes:
        id: Record ID (auto-generated).
        type: Event type string.
        category: Event category.
        severity: Event severity level.
        timestamp: Event timestamp in milliseconds.
        source: Event source identifier.
        data: Event-specific data as JSON string.
        metadata: Event metadata as JSON string.
        correlation_id: Optional correlation ID.
        parent_id: Optional parent event ID.
        sync_id: Synchronization ID.
        sync_status: Synchronization status.
        device_id: Device identifier.
        user_id: User identifier.
        created_at: Record creation timestamp.
        updated_at: Record update timestamp.
    """

    id: int | None = None
    type: str
    category: str = "system"
    severity: str = "info"
    timestamp: int
    source: str
    data: str = "{}"
    metadata: str | None = None
    correlation_id: str | None = None
    parent_id: str | None = None
    sync_id: str | None = None
    sync_status: str = "pending"
    device_id: str | None = None
    user_id: str | None = None
    created_at: int | None = None
    updated_at: int | None = None


class ActivityRecord(BaseModel):
    """
    Activity log storage record.

    Represents an activity record as stored in the database.

    Attributes:
        id: Record ID (auto-generated).
        event_id: Related event ID.
        stage: Development stage.
        action: Action performed.
        description: Activity description.
        details: Additional details.
        actor: Actor identifier.
        metadata: Additional metadata as JSON string.
        timestamp: Activity timestamp in milliseconds.
        created_at: Record creation timestamp.
    """

    id: int | None = None
    event_id: int | None = None
    stage: str
    action: str
    description: str | None = None
    details: str | None = None
    actor: str | None = None
    metadata: str | None = None
    timestamp: int
    created_at: int | None = None


class MetricsRecord(BaseModel):
    """
    Metrics storage record.

    Represents a metrics record as stored in the database.

    Attributes:
        id: Record ID (auto-generated).
        name: Metric name.
        metric_type: Type of metric.
        metric_name: Specific metric name.
        value: Metric value.
        timestamp: Metric timestamp in milliseconds.
        timeframe: Timeframe for the metric.
        tags: Tags as JSON string.
        metadata: Additional metadata as JSON string.
        created_at: Record creation timestamp.
    """

    id: int | None = None
    name: str
    metric_type: str
    metric_name: str
    value: float
    timestamp: int
    timeframe: str = "instant"
    tags: str = "[]"
    metadata: str | None = None
    created_at: int | None = None


class StageTransitionRecord(BaseModel):
    """
    Stage transition storage record.

    Represents a development stage transition as stored in the database.

    Attributes:
        id: Record ID (auto-generated).
        from_stage: Source stage (null for initial stage).
        to_stage: Target stage.
        timestamp: Transition timestamp in milliseconds.
        confidence: Confidence score (0.0 to 1.0).
        metadata: Additional metadata as JSON string.
        created_at: Record creation timestamp.
    """

    id: int | None = None
    from_stage: str | None = None
    to_stage: str
    timestamp: int
    confidence: float = 1.0
    metadata: str | None = None
    created_at: int | None = None


class FileMonitorCacheRecord(BaseModel):
    """
    File monitor cache record.

    Caches file state for change detection.

    Attributes:
        id: Record ID (auto-generated).
        file_path: Absolute file path.
        file_hash: File content hash.
        last_modified: Last modification timestamp.
        file_size: File size in bytes.
        metadata: Additional metadata as JSON string.
        created_at: Record creation timestamp.
        updated_at: Record update timestamp.
    """

    id: int | None = None
    file_path: str
    file_hash: str
    last_modified: int
    file_size: int
    metadata: str | None = None
    created_at: int | None = None
    updated_at: int | None = None


class MigrationRecord(BaseModel):
    """
    Migration record.

    Tracks applied database migrations.

    Attributes:
        id: Record ID (auto-generated).
        version: Migration version number.
        name: Migration name.
        applied_at: Timestamp when migration was applied.
    """

    id: int | None = None
    version: int
    name: str
    applied_at: int


class DatabaseConfig(BaseModel):
    """
    Database configuration.

    Attributes:
        path: Path to the SQLite database file.
        verbose: Enable verbose logging.
        readonly: Open database in read-only mode.
        file_must_exist: Require database file to exist.
        timeout: Connection timeout in seconds.
        memory: Use in-memory database.
    """

    path: str = "data/devflow.db"
    verbose: bool = False
    readonly: bool = False
    file_must_exist: bool = False
    timeout: float = 30.0
    memory: bool = False


# Type variable for generic repository
T = TypeVar("T")


class Repository(Protocol[T]):
    """
    Repository interface protocol.

    Defines the contract for all repositories with generic CRUD operations.
    """

    async def create(self, data: T) -> T:
        """
        Create a new record.

        Args:
            data: Entity data to create.

        Returns:
            Created entity with ID.
        """
        ...

    async def find_by_id(self, id: int) -> T | None:
        """
        Find a record by ID.

        Args:
            id: Record ID.

        Returns:
            Entity if found, None otherwise.
        """
        ...

    async def find_all(self, options: QueryOptions | None = None) -> list[T]:
        """
        Find all records.

        Args:
            options: Query options for filtering and pagination.

        Returns:
            List of entities.
        """
        ...

    async def update(self, id: int, data: dict[str, Any]) -> T | None:
        """
        Update a record.

        Args:
            id: Record ID.
            data: Fields to update.

        Returns:
            Updated entity if found, None otherwise.
        """
        ...

    async def delete(self, id: int) -> bool:
        """
        Delete a record.

        Args:
            id: Record ID.

        Returns:
            True if deleted, False if not found.
        """
        ...

    async def count(self) -> int:
        """
        Count total records.

        Returns:
            Total record count.
        """
        ...


class TransitionStatistics(BaseModel):
    """
    Stage transition statistics.

    Attributes:
        total_transitions: Total number of transitions.
        by_stage: Transitions grouped by stage.
        average_confidence: Average confidence score.
        transitions: Individual transition summaries.
    """

    total_transitions: int = 0
    by_stage: dict[str, dict[str, int]] = Field(default_factory=dict)
    average_confidence: float = 0.0
    transitions: list[dict[str, Any]] = Field(default_factory=list)


class StageSequenceEntry(BaseModel):
    """
    Entry in a stage sequence.

    Attributes:
        timestamp: Transition timestamp.
        from_stage: Source stage.
        to_stage: Target stage.
        confidence: Confidence score.
    """

    timestamp: int
    from_stage: str | None
    to_stage: str
    confidence: float
