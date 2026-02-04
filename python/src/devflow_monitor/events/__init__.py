"""
Events Module.

This module provides the event system for DevFlow Monitor including:
- Event types (base, file, git)
- Event engine (pub/sub with pattern matching)
- Event queue (priority-based with batch processing)
- Queue manager (multi-queue management with routing)
"""

from .engine import EventEngine, event_engine, get_event_engine
from .queue import EventQueue, QueueOptions, QueueStatistics, event_queue
from .queue_manager import (
    QueueManager,
    QueueManagerOptions,
    RoutingRule,
    get_queue_manager,
    queue_manager,
)
from .types import (
    # Base types
    BaseEvent,
    EventBatch,
    EventCategory,
    EventFilter,
    EventHandler,
    EventMetadata,
    EventPublishOptions,
    EventSeverity,
    EventStatistics,
    EventSubscriptionOptions,
    EventTransformer,
    # File types
    FileChangeAction,
    FileChangeInfo,
    FileContext,
    FileContextType,
    FileEvent,
    FileEventBuilder,
    FileEventData,
    FileEventType,
    FileInfo,
    FileBatchEvent,
    FileBatchEventData,
    # Git types
    BranchType,
    GitAuthor,
    GitBranchEventData,
    GitBranchInfo,
    GitCommitEventData,
    GitCommitInfo,
    GitConflictInfo,
    GitEvent,
    GitEventBuilder,
    GitEventType,
    GitRemoteInfo,
    GitSyncEventData,
    # Type guards
    is_file_batch_event,
    is_file_event,
    is_git_branch_event,
    is_git_commit_event,
    is_git_event,
    is_git_sync_event,
)

__all__ = [
    # Engine
    "EventEngine",
    "event_engine",
    "get_event_engine",
    # Queue
    "EventQueue",
    "QueueOptions",
    "QueueStatistics",
    "event_queue",
    # Queue Manager
    "QueueManager",
    "QueueManagerOptions",
    "RoutingRule",
    "get_queue_manager",
    "queue_manager",
    # Base types
    "BaseEvent",
    "EventBatch",
    "EventCategory",
    "EventFilter",
    "EventHandler",
    "EventMetadata",
    "EventPublishOptions",
    "EventSeverity",
    "EventStatistics",
    "EventSubscriptionOptions",
    "EventTransformer",
    # File types
    "FileChangeAction",
    "FileChangeInfo",
    "FileContext",
    "FileContextType",
    "FileEvent",
    "FileEventBuilder",
    "FileEventData",
    "FileEventType",
    "FileInfo",
    "FileBatchEvent",
    "FileBatchEventData",
    # Git types
    "BranchType",
    "GitAuthor",
    "GitBranchEventData",
    "GitBranchInfo",
    "GitCommitEventData",
    "GitCommitInfo",
    "GitConflictInfo",
    "GitEvent",
    "GitEventBuilder",
    "GitEventType",
    "GitRemoteInfo",
    "GitSyncEventData",
    # Type guards
    "is_file_batch_event",
    "is_file_event",
    "is_git_branch_event",
    "is_git_commit_event",
    "is_git_event",
    "is_git_sync_event",
]
