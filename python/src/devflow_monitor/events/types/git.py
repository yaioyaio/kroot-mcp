"""
Git Activity Event Types.

This module defines event types for Git operations including
commits, branches, merges, pushes, pulls, and conflicts.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field

from .base import BaseEvent, EventCategory, EventMetadata, EventSeverity


class GitEventType(str, Enum):
    """Git event types."""

    # Commit related
    COMMIT_CREATED = "git:commit:created"
    COMMIT_AMENDED = "git:commit:amended"

    # Branch related
    BRANCH_CREATED = "git:branch:created"
    BRANCH_DELETED = "git:branch:deleted"
    BRANCH_SWITCHED = "git:branch:switched"
    BRANCH_MERGED = "git:branch:merged"
    BRANCH_REBASED = "git:branch:rebased"

    # Tag related
    TAG_CREATED = "git:tag:created"
    TAG_DELETED = "git:tag:deleted"

    # Remote repository related
    PUSH = "git:push"
    PULL = "git:pull"
    FETCH = "git:fetch"
    CLONE = "git:clone"

    # Merge related
    MERGE_STARTED = "git:merge:started"
    MERGE_COMPLETED = "git:merge:completed"
    MERGE_CONFLICT = "git:merge:conflict"
    MERGE_ABORTED = "git:merge:aborted"

    # Stash related
    STASH_CREATED = "git:stash:created"
    STASH_APPLIED = "git:stash:applied"
    STASH_DROPPED = "git:stash:dropped"

    # Rebase related
    REBASE_STARTED = "git:rebase:started"
    REBASE_COMPLETED = "git:rebase:completed"
    REBASE_CONFLICT = "git:rebase:conflict"
    REBASE_ABORTED = "git:rebase:aborted"


class BranchType(str, Enum):
    """Git branch type patterns."""

    FEATURE = "feature"
    BUGFIX = "bugfix"
    HOTFIX = "hotfix"
    RELEASE = "release"
    MAIN = "main"
    DEVELOP = "develop"
    OTHER = "other"


class GitAuthor(BaseModel):
    """Git author/committer information."""

    name: str
    email: str
    date: datetime


class GitCommitInfo(BaseModel):
    """Git commit information."""

    hash: str
    short_hash: str
    message: str
    author: GitAuthor
    committer: GitAuthor | None = None
    parents: list[str] = Field(default_factory=list)
    files_changed: int | None = None
    insertions: int | None = None
    deletions: int | None = None
    type: str | None = None  # Conventional Commits type
    scope: str | None = None  # Conventional Commits scope
    breaking: bool = False


class TrackingInfo(BaseModel):
    """Branch tracking information (ahead/behind)."""

    ahead: int = 0
    behind: int = 0


class GitBranchInfo(BaseModel):
    """Git branch information."""

    name: str
    is_remote: bool = False
    is_current: bool = False
    upstream: str | None = None
    last_commit_hash: str | None = None
    last_commit_message: str | None = None
    last_commit_date: datetime | None = None
    tracking: TrackingInfo | None = None


class GitTagInfo(BaseModel):
    """Git tag information."""

    name: str
    type: Literal["lightweight", "annotated"]
    commit_hash: str
    message: str | None = None
    tagger: GitAuthor | None = None


class GitRemoteInfo(BaseModel):
    """Git remote repository information."""

    name: str
    url: str
    type: Literal["fetch", "push"]


class ConflictDetail(BaseModel):
    """Conflict detail for a single file."""

    file: str
    conflict_type: Literal[
        "both-modified",
        "deleted-by-them",
        "deleted-by-us",
        "added-by-them",
        "added-by-us",
    ]


class GitConflictInfo(BaseModel):
    """Git conflict information."""

    files: list[str]
    type: Literal["merge", "rebase", "cherry-pick"]
    source_branch: str | None = None
    target_branch: str | None = None
    details: list[ConflictDetail] = Field(default_factory=list)


class CommitFileChange(BaseModel):
    """File change in a commit."""

    path: str
    status: Literal["added", "modified", "deleted", "renamed"]
    additions: int = 0
    deletions: int = 0


class CommitAnalysis(BaseModel):
    """Commit pattern analysis."""

    is_feature: bool = False
    is_bugfix: bool = False
    is_refactor: bool = False
    is_chore: bool = False
    is_docs: bool = False
    is_test: bool = False


class GitCommitEventData(BaseModel):
    """Git commit event data."""

    commit: GitCommitInfo
    branch: GitBranchInfo
    files: list[CommitFileChange] = Field(default_factory=list)
    analysis: CommitAnalysis | None = None


class MergeInfo(BaseModel):
    """Merge operation information."""

    commits: int
    files: int
    strategy: Literal["fast-forward", "recursive", "octopus", "ours", "subtree"]


class GitBranchEventData(BaseModel):
    """Git branch event data."""

    branch: GitBranchInfo
    previous_branch: str | None = None
    source_branch: str | None = None
    merge_info: MergeInfo | None = None


class GitSyncEventData(BaseModel):
    """Git push/pull/fetch event data."""

    remote: GitRemoteInfo
    branch: str
    commits: int | None = None
    bytes: int | None = None
    direction: Literal["push", "pull", "fetch"]
    success: bool
    error: str | None = None


class GitEvent(BaseEvent):
    """
    Git activity event.

    Represents a Git operation event with detailed information
    about the operation type and affected resources.

    Attributes:
        type: Git event type.
        category: Always EventCategory.GIT.
        data: Git event data payload.
    """

    type: str  # GitEventType value
    category: EventCategory = EventCategory.GIT
    data: dict[str, Any] = Field(default_factory=dict)


class GitEventBuilder:
    """Helper class for creating Git events."""

    @staticmethod
    def create_commit_event(
        event_type: GitEventType,
        data: GitCommitEventData,
        severity: EventSeverity = EventSeverity.INFO,
        correlation_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> GitEvent:
        """
        Create a commit event.

        Args:
            event_type: Type of git event.
            data: Commit event data.
            severity: Event severity level.
            correlation_id: Optional correlation ID.
            metadata: Optional metadata.

        Returns:
            GitEvent instance.
        """
        event_metadata = None
        if metadata:
            event_metadata = EventMetadata(**metadata)

        return GitEvent(
            type=event_type.value,
            category=EventCategory.GIT,
            severity=severity,
            source="GitMonitor",
            data=data.model_dump(),
            correlation_id=correlation_id,
            metadata=event_metadata,
        )

    @staticmethod
    def create_branch_event(
        event_type: GitEventType,
        data: GitBranchEventData,
        severity: EventSeverity = EventSeverity.INFO,
        correlation_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> GitEvent:
        """
        Create a branch event.

        Args:
            event_type: Type of git event.
            data: Branch event data.
            severity: Event severity level.
            correlation_id: Optional correlation ID.
            metadata: Optional metadata.

        Returns:
            GitEvent instance.
        """
        event_metadata = None
        if metadata:
            event_metadata = EventMetadata(**metadata)

        return GitEvent(
            type=event_type.value,
            category=EventCategory.GIT,
            severity=severity,
            source="GitMonitor",
            data=data.model_dump(),
            correlation_id=correlation_id,
            metadata=event_metadata,
        )

    @staticmethod
    def create_sync_event(
        event_type: GitEventType,
        data: GitSyncEventData,
        correlation_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> GitEvent:
        """
        Create a sync (push/pull/fetch) event.

        Args:
            event_type: Type of git event.
            data: Sync event data.
            correlation_id: Optional correlation ID.
            metadata: Optional metadata.

        Returns:
            GitEvent instance.
        """
        event_metadata = None
        if metadata:
            event_metadata = EventMetadata(**metadata)

        severity = EventSeverity.INFO if data.success else EventSeverity.ERROR

        return GitEvent(
            type=event_type.value,
            category=EventCategory.GIT,
            severity=severity,
            source="GitMonitor",
            data=data.model_dump(),
            correlation_id=correlation_id,
            metadata=event_metadata,
        )

    @staticmethod
    def create_conflict_event(
        event_type: GitEventType,
        data: GitConflictInfo,
        correlation_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> GitEvent:
        """
        Create a conflict event.

        Args:
            event_type: Type of git event.
            data: Conflict information.
            correlation_id: Optional correlation ID.
            metadata: Optional metadata.

        Returns:
            GitEvent instance.
        """
        event_metadata = None
        if metadata:
            event_metadata = EventMetadata(**metadata)

        return GitEvent(
            type=event_type.value,
            category=EventCategory.GIT,
            severity=EventSeverity.WARNING,
            source="GitMonitor",
            data=data.model_dump(),
            correlation_id=correlation_id,
            metadata=event_metadata,
        )


def is_git_event(event: BaseEvent) -> bool:
    """Check if event is a git event."""
    return event.category == EventCategory.GIT


def is_git_commit_event(event: BaseEvent) -> bool:
    """Check if event is a git commit event."""
    return event.category == EventCategory.GIT and event.type in (
        GitEventType.COMMIT_CREATED.value,
        GitEventType.COMMIT_AMENDED.value,
    )


def is_git_branch_event(event: BaseEvent) -> bool:
    """Check if event is a git branch event."""
    return (
        event.category == EventCategory.GIT
        and event.type.startswith("git:branch:")
    )


def is_git_sync_event(event: BaseEvent) -> bool:
    """Check if event is a git sync event."""
    return event.category == EventCategory.GIT and event.type in (
        GitEventType.PUSH.value,
        GitEventType.PULL.value,
        GitEventType.FETCH.value,
        GitEventType.CLONE.value,
    )
