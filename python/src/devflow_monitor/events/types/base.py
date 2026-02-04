"""
Base Event Types and Interfaces.

All events in the system inherit from BaseEvent. This module defines
the core event structure, categories, severities, and related types.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Callable, Coroutine, TypeVar
from uuid import uuid4

from pydantic import BaseModel, Field


class EventSeverity(str, Enum):
    """Event severity levels."""

    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    WARN = "warn"  # Alias for WARNING
    ERROR = "error"
    CRITICAL = "critical"


class EventCategory(str, Enum):
    """Event categories for classification."""

    SYSTEM = "system"
    FILE = "file"
    GIT = "git"
    BUILD = "build"
    TEST = "test"
    DEPLOY = "deploy"
    API = "api"
    USER = "user"
    AI = "ai"
    ACTIVITY = "activity"
    STAGE = "stage"
    PROCESS = "process"
    METHOD = "method"
    METHODOLOGY = "methodology"
    AI_COLLABORATION = "ai_collaboration"
    DEVELOPMENT = "development"
    SECURITY = "security"


class EventMetadata(BaseModel):
    """Event metadata for additional context."""

    environment: str | None = None
    user_id: str | None = None
    session_id: str | None = None
    project_id: str | None = None
    tags: list[str] = Field(default_factory=list)

    class Config:
        """Pydantic config to allow extra fields."""

        extra = "allow"


class BaseEvent(BaseModel):
    """
    Base event interface.

    All events in the system inherit from this class. It provides
    the common structure for all events including identification,
    classification, and metadata.

    Attributes:
        id: Unique event identifier (auto-generated UUID4).
        type: Event type string (e.g., 'file:changed', 'git:commit').
        category: Event category for classification.
        severity: Event severity level.
        timestamp: Event timestamp (auto-generated UTC datetime).
        source: Event source identifier.
        data: Event-specific data payload.
        metadata: Optional event metadata.
        correlation_id: Optional correlation ID for event tracing.
        parent_id: Optional parent event ID.
    """

    id: str = Field(default_factory=lambda: str(uuid4()))
    type: str
    category: EventCategory
    severity: EventSeverity = EventSeverity.INFO
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    source: str
    data: dict[str, Any] = Field(default_factory=dict)
    metadata: EventMetadata | None = None
    correlation_id: str | None = None
    parent_id: str | None = None

    class Config:
        """Pydantic configuration."""

        use_enum_values = True


# Type variable for generic event handling
T = TypeVar("T", bound=BaseEvent)
R = TypeVar("R", bound=BaseEvent)

# Type aliases for event handlers and filters
EventHandler = Callable[[T], Coroutine[Any, Any, None] | None]
EventFilter = Callable[[T], bool]
EventTransformer = Callable[[T], Coroutine[Any, Any, R] | R]


class EventSubscriptionOptions(BaseModel):
    """Options for event subscription."""

    filter: EventFilter | None = None
    priority: int = 0
    once: bool = False
    async_handler: bool = True

    class Config:
        """Pydantic configuration."""

        arbitrary_types_allowed = True


class EventPublishOptions(BaseModel):
    """Options for event publishing."""

    sync: bool = False
    timeout: float | None = None
    retries: int = 0
    use_queue: bool = True
    persist: bool = True


class EventBatch(BaseModel):
    """Batch of events for bulk processing."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    events: list[BaseEvent]
    created_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)


class EventStatistics(BaseModel):
    """Event statistics for monitoring."""

    total_events: int = 0
    events_by_category: dict[str, int] = Field(default_factory=dict)
    events_by_severity: dict[str, int] = Field(default_factory=dict)
    events_per_hour: float = 0.0
    last_event_time: datetime | None = None
