"""
Event Validation Schemas for DevFlow Monitor.

Provides Pydantic-based validation schemas for all event types
and helper functions for event creation and validation.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator

from ..types.base import EventCategory, EventSeverity


class FileStats(BaseModel):
    """File statistics data."""

    size: int
    modified: datetime


class FileInfo(BaseModel):
    """Detailed file information."""

    path: str
    relative_path: str
    name: str
    extension: str
    size: int
    modified_at: datetime
    is_directory: bool = False


class FileEventDataSchema(BaseModel):
    """
    Schema for file event data.

    Validates file-related event payloads including file changes,
    creations, deletions, and renames.
    """

    action: str
    path: str | None = None
    relative_path: str | None = None
    extension: str | None = None
    old_file: FileInfo | None = None
    new_file: FileInfo | None = None
    stats: FileStats | None = None
    description: str | None = None
    context: str | None = None

    @field_validator("action")
    @classmethod
    def validate_action(cls, v: str) -> str:
        """Validate file action type."""
        valid_actions = {"created", "changed", "deleted", "renamed", "moved"}
        if v.lower() not in valid_actions:
            raise ValueError(f"Invalid file action: {v}. Must be one of {valid_actions}")
        return v.lower()


class CommitInfo(BaseModel):
    """Git commit information."""

    hash: str
    message: str
    author: str
    timestamp: datetime


class GitEventDataSchema(BaseModel):
    """
    Schema for git event data.

    Validates git-related event payloads including commits,
    branches, merges, pushes, and pulls.
    """

    action: str
    repository: str
    branch: str
    from_branch: str | None = None
    to_branch: str | None = None
    commit: CommitInfo | None = None
    files: list[str] | None = None

    @field_validator("action")
    @classmethod
    def validate_action(cls, v: str) -> str:
        """Validate git action type."""
        valid_actions = {"committed", "branched", "merged", "pushed", "pulled", "checkout"}
        if v.lower() not in valid_actions:
            raise ValueError(f"Invalid git action: {v}. Must be one of {valid_actions}")
        return v.lower()


class ActivityEventDataSchema(BaseModel):
    """
    Schema for activity event data.

    Validates activity tracking event payloads.
    """

    stage: str
    action: str
    details: str
    actor: str
    timestamp: datetime
    metadata: dict[str, Any] | None = None


class StageEventDataSchema(BaseModel):
    """
    Schema for stage transition event data.

    Validates development stage transition events.
    """

    from_stage: str | None = None
    to_stage: str
    confidence: float = Field(ge=0.0, le=1.0)
    timestamp: datetime
    metadata: dict[str, Any] | None = None

    @field_validator("confidence")
    @classmethod
    def validate_confidence(cls, v: float) -> float:
        """Ensure confidence is between 0 and 1."""
        if not 0.0 <= v <= 1.0:
            raise ValueError("Confidence must be between 0.0 and 1.0")
        return v


class SystemEventDataSchema(BaseModel):
    """
    Schema for system event data.

    Validates system-related event payloads.
    """

    component: str
    message: str
    error: str | None = None
    metrics: dict[str, Any] | None = None
    timestamp: datetime


class BaseEventSchema(BaseModel):
    """
    Base event validation schema.

    Validates the common structure for all events in the system.
    """

    id: str = Field(default_factory=lambda: str(uuid4()))
    type: str
    category: EventCategory
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    severity: EventSeverity = EventSeverity.INFO
    source: str
    data: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] | None = None
    tags: list[str] | None = None

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        """Validate event type format."""
        # Event types should be in format: category:action
        pattern = r"^[a-z]+:[a-z_]+$"
        if not re.match(pattern, v):
            raise ValueError(f"Event type '{v}' must match format 'category:action'")
        return v


class ValidationResult(BaseModel):
    """Result of event validation."""

    valid: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


def validate_event(event: dict[str, Any]) -> ValidationResult:
    """
    Validate an event against the base schema.

    Args:
        event: Event data dictionary.

    Returns:
        ValidationResult with validation status and any errors.
    """
    errors: list[str] = []
    warnings: list[str] = []

    try:
        BaseEventSchema(**event)
    except Exception as e:
        errors.append(str(e))

    return ValidationResult(valid=len(errors) == 0, errors=errors, warnings=warnings)


def validate_file_event(event: dict[str, Any]) -> ValidationResult:
    """
    Validate a file event.

    Args:
        event: File event data dictionary.

    Returns:
        ValidationResult with validation status and any errors.
    """
    errors: list[str] = []
    warnings: list[str] = []

    # Validate base event structure
    base_result = validate_event(event)
    errors.extend(base_result.errors)

    # Validate file-specific data
    if "data" in event:
        try:
            FileEventDataSchema(**event["data"])
        except Exception as e:
            errors.append(f"Invalid file event data: {e}")

    return ValidationResult(valid=len(errors) == 0, errors=errors, warnings=warnings)


def validate_git_event(event: dict[str, Any]) -> ValidationResult:
    """
    Validate a git event.

    Args:
        event: Git event data dictionary.

    Returns:
        ValidationResult with validation status and any errors.
    """
    errors: list[str] = []
    warnings: list[str] = []

    # Validate base event structure
    base_result = validate_event(event)
    errors.extend(base_result.errors)

    # Validate git-specific data
    if "data" in event:
        try:
            GitEventDataSchema(**event["data"])
        except Exception as e:
            errors.append(f"Invalid git event data: {e}")

    return ValidationResult(valid=len(errors) == 0, errors=errors, warnings=warnings)


def create_file_event(
    action: str,
    data: dict[str, Any],
    source: str = "FileMonitor",
) -> dict[str, Any]:
    """
    Create a validated file event.

    Args:
        action: File action type (created, changed, deleted).
        data: Event-specific data.
        source: Event source identifier.

    Returns:
        Complete event dictionary.

    Raises:
        ValueError: If validation fails.
    """
    event = {
        "id": f"file-{int(datetime.now().timestamp() * 1000)}-{uuid4().hex[:7]}",
        "type": f"file:{action}",
        "category": EventCategory.FILE,
        "timestamp": datetime.now(timezone.utc),
        "severity": EventSeverity.INFO,
        "source": source,
        "data": data,
    }

    result = validate_file_event(event)
    if not result.valid:
        raise ValueError(f"Invalid file event: {result.errors}")

    return event


def create_git_event(
    action: str,
    data: dict[str, Any],
    source: str = "GitMonitor",
) -> dict[str, Any]:
    """
    Create a validated git event.

    Args:
        action: Git action type (committed, branched, merged, pushed, pulled).
        data: Event-specific data.
        source: Event source identifier.

    Returns:
        Complete event dictionary.

    Raises:
        ValueError: If validation fails.
    """
    event = {
        "id": f"git-{int(datetime.now().timestamp() * 1000)}-{uuid4().hex[:7]}",
        "type": f"git:{action}",
        "category": EventCategory.GIT,
        "timestamp": datetime.now(timezone.utc),
        "severity": EventSeverity.INFO,
        "source": source,
        "data": data,
    }

    result = validate_git_event(event)
    if not result.valid:
        raise ValueError(f"Invalid git event: {result.errors}")

    return event


def create_activity_event(
    data: dict[str, Any],
    source: str = "ActivityTracker",
) -> dict[str, Any]:
    """
    Create a validated activity event.

    Args:
        data: Activity event data.
        source: Event source identifier.

    Returns:
        Complete event dictionary.
    """
    return {
        "id": f"activity-{int(datetime.now().timestamp() * 1000)}-{uuid4().hex[:7]}",
        "type": "activity:tracked",
        "category": EventCategory.ACTIVITY,
        "timestamp": datetime.now(timezone.utc),
        "severity": EventSeverity.INFO,
        "source": source,
        "data": {
            "stage": data.get("stage"),
            "action": data.get("action"),
            "details": data.get("details"),
            "actor": data.get("actor"),
            "timestamp": data.get("timestamp", datetime.now(timezone.utc)),
        },
        "metadata": data.get("metadata"),
    }


def create_stage_event(
    data: dict[str, Any],
    source: str = "StageAnalyzer",
) -> dict[str, Any]:
    """
    Create a validated stage transition event.

    Args:
        data: Stage transition data.
        source: Event source identifier.

    Returns:
        Complete event dictionary.
    """
    return {
        "id": f"stage-{int(datetime.now().timestamp() * 1000)}-{uuid4().hex[:7]}",
        "type": "stage:transitioned",
        "category": EventCategory.STAGE,
        "timestamp": datetime.now(timezone.utc),
        "severity": EventSeverity.INFO,
        "source": source,
        "data": data,
    }


def create_system_event(
    event_type: str,
    data: dict[str, Any],
    source: str = "System",
) -> dict[str, Any]:
    """
    Create a validated system event.

    Args:
        event_type: System event type (started, stopped, error, warning, metrics).
        data: System event data.
        source: Event source identifier.

    Returns:
        Complete event dictionary.
    """
    severity_map = {
        "error": EventSeverity.ERROR,
        "warning": EventSeverity.WARNING,
        "metrics": EventSeverity.INFO,
        "started": EventSeverity.INFO,
        "stopped": EventSeverity.INFO,
    }

    severity = severity_map.get(event_type, EventSeverity.INFO)

    event_data: dict[str, Any] = {
        "component": data.get("component"),
        "message": data.get("message"),
        "timestamp": data.get("timestamp", datetime.now(timezone.utc)),
    }

    if "error" in data:
        error = data["error"]
        if isinstance(error, Exception):
            event_data["error"] = str(error)
        else:
            event_data["error"] = error

    if "metrics" in data:
        event_data["metrics"] = data["metrics"]

    return {
        "id": f"system-{int(datetime.now().timestamp() * 1000)}-{uuid4().hex[:7]}",
        "type": f"system:{event_type}",
        "category": EventCategory.SYSTEM,
        "timestamp": datetime.now(timezone.utc),
        "severity": severity,
        "source": source,
        "data": event_data,
    }
