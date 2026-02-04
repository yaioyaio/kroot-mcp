"""
Event Schemas module for DevFlow Monitor.

Provides Pydantic validation schemas and helper functions for
all event types in the system.
"""

from .validation import (
    # Schemas
    BaseEventSchema,
    FileEventDataSchema,
    GitEventDataSchema,
    ActivityEventDataSchema,
    StageEventDataSchema,
    SystemEventDataSchema,
    FileStats,
    FileInfo,
    CommitInfo,
    ValidationResult,
    # Validators
    validate_event,
    validate_file_event,
    validate_git_event,
    # Creators
    create_file_event,
    create_git_event,
    create_activity_event,
    create_stage_event,
    create_system_event,
)

__all__ = [
    # Schemas
    "BaseEventSchema",
    "FileEventDataSchema",
    "GitEventDataSchema",
    "ActivityEventDataSchema",
    "StageEventDataSchema",
    "SystemEventDataSchema",
    "FileStats",
    "FileInfo",
    "CommitInfo",
    "ValidationResult",
    # Validators
    "validate_event",
    "validate_file_event",
    "validate_git_event",
    # Creators
    "create_file_event",
    "create_git_event",
    "create_activity_event",
    "create_stage_event",
    "create_system_event",
]
