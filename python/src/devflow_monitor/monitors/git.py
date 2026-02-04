"""
Git Monitor.

Monitors Git repository changes using gitpython and emits events
through the central event engine. Supports commit detection,
branch tracking, merge detection, and conventional commits parsing.
"""

from __future__ import annotations

import asyncio
import re
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, Field

from ..events.types.base import BaseEvent, EventCategory, EventSeverity
from ..events.types.git import (
    BranchType,
    CommitAnalysis,
    GitAuthor,
    GitBranchEventData,
    GitBranchInfo,
    GitCommitEventData,
    GitCommitInfo,
    GitEvent,
    GitEventType,
)
from .base import BaseMonitor, MonitorConfig

if TYPE_CHECKING:
    from git import Commit, Repo

    from ..events.engine import EventEngine


class GitMonitorConfig(MonitorConfig):
    """
    Git monitor specific configuration.

    Attributes:
        repository_path: Path to the Git repository.
        track_branches: Whether to track branch changes.
        track_commits: Whether to track new commits.
        track_merges: Whether to track merge operations.
        analyze_commit_messages: Whether to parse conventional commits.
    """

    repository_path: str = "."
    track_branches: bool = True
    track_commits: bool = True
    track_merges: bool = True
    analyze_commit_messages: bool = True


class ConventionalCommitAnalysis(BaseModel):
    """Conventional commit message analysis result."""

    type: str = "unknown"
    scope: str | None = None
    conventional: bool = False
    breaking: bool = False
    keywords: list[str] = Field(default_factory=list)


class BranchPatternAnalysis(BaseModel):
    """Branch pattern analysis result."""

    type: str = "custom"
    conventional: bool = False


class GitMonitor(BaseMonitor):
    """
    Git repository monitor using gitpython.

    Monitors Git repository for commits, branch changes, and merges.
    Uses polling-based detection to track repository state changes.

    Attributes:
        config: Git monitor configuration.
        repo: GitPython Repo instance.
    """

    # Branch pattern mapping
    BRANCH_PATTERNS = {
        BranchType.FEATURE: re.compile(r"^(feature|feat)/"),
        BranchType.BUGFIX: re.compile(r"^(bugfix|fix)/"),
        BranchType.HOTFIX: re.compile(r"^hotfix/"),
        BranchType.RELEASE: re.compile(r"^release/"),
        BranchType.DEVELOP: re.compile(r"^(develop|dev)$"),
        BranchType.MAIN: re.compile(r"^(main|master)$"),
    }

    # Conventional commits pattern
    CONVENTIONAL_COMMIT_PATTERN = re.compile(
        r"^(feat|fix|docs|style|refactor|test|chore|perf|ci|build)"
        r"(\(.+\))?\!?:\s*(.+)"
    )

    def __init__(
        self,
        config: GitMonitorConfig | None = None,
        event_engine: "EventEngine | None" = None,
    ):
        """
        Initialize Git monitor.

        Args:
            config: Git monitor configuration.
            event_engine: Event engine for publishing events.
        """
        super().__init__(
            config=config or GitMonitorConfig(),
            event_engine=event_engine,
            name="GitMonitor",
        )
        self._git_config = config or GitMonitorConfig()
        self._repo: "Repo | None" = None
        self._poll_task: asyncio.Task[None] | None = None
        self._stop_event = asyncio.Event()

        # State tracking
        self._last_commit_hash: str | None = None
        self._last_branch_state: dict[str, str] = {}

    @property
    def git_config(self) -> GitMonitorConfig:
        """Get Git-specific configuration."""
        return self._git_config

    async def _on_start(self) -> None:
        """Start Git monitoring."""
        # Validate and initialize repository
        await self._validate_repository()

        # Cache initial state
        await self._cache_initial_state()

        # Emit start event
        await self._emit_start_event()

        self._log_info(f"Monitoring repository: {self._git_config.repository_path}")

    async def _on_stop(self) -> None:
        """Stop Git monitoring and cleanup resources."""
        self._stop_event.set()

        # Cancel poll task if running
        if self._poll_task:
            self._poll_task.cancel()
            try:
                await self._poll_task
            except asyncio.CancelledError:
                pass
            self._poll_task = None

        # Emit stop event
        await self._emit_stop_event()

    async def _validate_repository(self) -> None:
        """
        Validate that the path is a Git repository.

        Raises:
            ValueError: If path is not a valid Git repository.
        """
        try:
            from git import Repo
            from git.exc import InvalidGitRepositoryError
        except ImportError:
            raise ImportError(
                "gitpython not installed. Install with: pip install gitpython"
            )

        repo_path = Path(self._git_config.repository_path).resolve()

        if not repo_path.exists():
            raise ValueError(f"Path does not exist: {repo_path}")

        git_dir = repo_path / ".git"
        if not git_dir.exists():
            raise ValueError(f"Not a Git repository: {repo_path}")

        try:
            self._repo = Repo(str(repo_path))
        except InvalidGitRepositoryError:
            raise ValueError(f"Invalid Git repository: {repo_path}")

    async def _cache_initial_state(self) -> None:
        """Cache initial repository state for change detection."""
        if not self._repo:
            return

        try:
            # Cache current commit hash
            if self._repo.head.is_valid():
                self._last_commit_hash = self._repo.head.commit.hexsha

            # Cache branch states
            if self._git_config.track_branches:
                for branch in self._repo.branches:
                    self._last_branch_state[branch.name] = branch.commit.hexsha

        except Exception as e:
            self._log_warning(f"Failed to cache initial Git state: {e}")

    async def _emit_start_event(self) -> None:
        """Emit monitor started event."""
        event = BaseEvent(
            type="git:monitor_started",
            category=EventCategory.GIT,
            severity=EventSeverity.INFO,
            source=self._name,
            data={
                "repository_path": self._git_config.repository_path,
                "config": self._git_config.model_dump(),
            },
        )
        await self._emit_event(event)

    async def _emit_stop_event(self) -> None:
        """Emit monitor stopped event."""
        event = BaseEvent(
            type="git:monitor_stopped",
            category=EventCategory.GIT,
            severity=EventSeverity.INFO,
            source=self._name,
            data={
                "repository_path": self._git_config.repository_path,
            },
        )
        await self._emit_event(event)

    async def check_git_changes(self) -> None:
        """
        Check for Git changes on-demand.

        This is the primary method for detecting Git repository changes.
        Called manually or via scheduled polling.
        """
        if not self._repo:
            self._log_warning("Repository not initialized")
            return

        try:
            if self._git_config.track_commits:
                await self._check_for_new_commits()
                # Small delay to prevent resource contention
                await asyncio.sleep(0.1)

            if self._git_config.track_branches:
                await self._check_for_branch_changes()

        except Exception as e:
            self._log_error(f"Error checking Git changes: {e}")

    async def _check_for_new_commits(self) -> None:
        """Check for new commits since last check."""
        if not self._repo:
            return

        try:
            if not self._repo.head.is_valid():
                return

            current_hash = self._repo.head.commit.hexsha

            if self._last_commit_hash and current_hash != self._last_commit_hash:
                # Find new commits
                new_commits = list(
                    self._repo.iter_commits(
                        f"{self._last_commit_hash}..{current_hash}"
                    )
                )

                # Process in chronological order
                for commit in reversed(new_commits):
                    await self._process_new_commit(commit)

            self._last_commit_hash = current_hash

        except Exception as e:
            self._log_error(f"Error checking for new commits: {e}")

    async def _process_new_commit(self, commit: "Commit") -> None:
        """
        Process and emit event for a new commit.

        Args:
            commit: GitPython Commit object.
        """
        try:
            # Get commit statistics
            stats = self._get_commit_stats(commit)

            # Analyze commit message
            analysis = None
            if self._git_config.analyze_commit_messages:
                analysis = self._analyze_commit_message(commit.message)

            # Build commit info
            commit_info = GitCommitInfo(
                hash=commit.hexsha,
                short_hash=commit.hexsha[:7],
                message=commit.message.strip(),
                author=GitAuthor(
                    name=commit.author.name or "Unknown",
                    email=commit.author.email or "",
                    date=datetime.fromtimestamp(commit.authored_date),
                ),
                files_changed=stats.get("files", 0),
                insertions=stats.get("insertions", 0),
                deletions=stats.get("deletions", 0),
                type=analysis.type if analysis else None,
                scope=analysis.scope if analysis else None,
                breaking=analysis.breaking if analysis else False,
            )

            # Build branch info
            branch_info = GitBranchInfo(
                name=self._get_current_branch_name(),
                is_current=True,
            )

            # Create event data
            event_data = GitCommitEventData(
                commit=commit_info,
                branch=branch_info,
                analysis=self._build_commit_analysis(analysis),
            )

            # Create and emit event
            event = GitEvent(
                type=GitEventType.COMMIT_CREATED.value,
                category=EventCategory.GIT,
                severity=EventSeverity.INFO,
                source=self._name,
                data=event_data.model_dump(),
            )

            await self._emit_event(event)
            self._log_info(
                f"New commit: {commit.hexsha[:7]} - {commit.message.split(chr(10))[0]}"
            )

        except Exception as e:
            self._log_error(f"Error processing commit {commit.hexsha}: {e}")

    async def _check_for_branch_changes(self) -> None:
        """Check for branch changes (created, deleted, updated)."""
        if not self._repo:
            return

        try:
            current_state: dict[str, str] = {}

            # Collect current branch states
            for branch in self._repo.branches:
                current_state[branch.name] = branch.commit.hexsha

            # Detect new and updated branches
            for branch_name, commit_hash in current_state.items():
                last_hash = self._last_branch_state.get(branch_name)

                if last_hash is None:
                    # New branch
                    await self._process_branch_created(branch_name, commit_hash)
                elif last_hash != commit_hash:
                    # Branch updated
                    await self._process_branch_updated(
                        branch_name, last_hash, commit_hash
                    )

            # Detect deleted branches
            for branch_name in self._last_branch_state:
                if branch_name not in current_state:
                    await self._process_branch_deleted(branch_name)

            self._last_branch_state = current_state

        except Exception as e:
            self._log_error(f"Error checking for branch changes: {e}")

    async def _process_branch_created(
        self, branch_name: str, commit_hash: str
    ) -> None:
        """
        Process and emit event for a new branch.

        Args:
            branch_name: Name of the new branch.
            commit_hash: Commit hash at branch tip.
        """
        pattern = self._analyze_branch_pattern(branch_name)

        branch_info = GitBranchInfo(
            name=branch_name,
            last_commit_hash=commit_hash,
        )

        event_data = GitBranchEventData(branch=branch_info)

        event = GitEvent(
            type=GitEventType.BRANCH_CREATED.value,
            category=EventCategory.GIT,
            severity=EventSeverity.INFO,
            source=self._name,
            data={
                **event_data.model_dump(),
                "pattern": pattern.model_dump(),
            },
        )

        await self._emit_event(event)
        self._log_info(f"New branch created: {branch_name}")

    async def _process_branch_updated(
        self, branch_name: str, old_commit: str, new_commit: str
    ) -> None:
        """
        Process and emit event for a branch update.

        Args:
            branch_name: Name of the updated branch.
            old_commit: Previous commit hash.
            new_commit: New commit hash.
        """
        # Check if this is a merge
        is_merge = await self._check_if_merge(old_commit, new_commit)

        if is_merge and self._git_config.track_merges:
            await self._process_merge(branch_name, old_commit, new_commit)
            return

        pattern = self._analyze_branch_pattern(branch_name)

        branch_info = GitBranchInfo(
            name=branch_name,
            last_commit_hash=new_commit,
        )

        event_data = GitBranchEventData(
            branch=branch_info,
            previous_branch=None,
        )

        event = GitEvent(
            type="git:branch_updated",
            category=EventCategory.GIT,
            severity=EventSeverity.INFO,
            source=self._name,
            data={
                **event_data.model_dump(),
                "previous_commit": old_commit,
                "pattern": pattern.model_dump(),
            },
        )

        await self._emit_event(event)

    async def _process_branch_deleted(self, branch_name: str) -> None:
        """
        Process and emit event for a deleted branch.

        Args:
            branch_name: Name of the deleted branch.
        """
        pattern = self._analyze_branch_pattern(branch_name)

        branch_info = GitBranchInfo(name=branch_name)
        event_data = GitBranchEventData(branch=branch_info)

        event = GitEvent(
            type=GitEventType.BRANCH_DELETED.value,
            category=EventCategory.GIT,
            severity=EventSeverity.INFO,
            source=self._name,
            data={
                **event_data.model_dump(),
                "pattern": pattern.model_dump(),
            },
        )

        await self._emit_event(event)
        self._log_info(f"Branch deleted: {branch_name}")

    async def _process_merge(
        self, branch_name: str, old_commit: str, new_commit: str
    ) -> None:
        """
        Process and emit event for a merge operation.

        Args:
            branch_name: Target branch of the merge.
            old_commit: Commit hash before merge.
            new_commit: Commit hash after merge.
        """
        if not self._repo:
            return

        try:
            # Count commits in merge
            commit_count = len(
                list(self._repo.iter_commits(f"{old_commit}..{new_commit}"))
            )

            # Determine merge type and risk
            merge_type = self._determine_merge_type(commit_count)
            risk = self._assess_merge_risk(commit_count)

            branch_info = GitBranchInfo(
                name=branch_name,
                last_commit_hash=new_commit,
            )

            event = GitEvent(
                type=GitEventType.BRANCH_MERGED.value,
                category=EventCategory.GIT,
                severity=EventSeverity.INFO,
                source=self._name,
                data={
                    "branch": branch_info.model_dump(),
                    "merge_commit": new_commit,
                    "previous_commit": old_commit,
                    "commit_count": commit_count,
                    "analysis": {
                        "merge_type": merge_type,
                        "risk": risk,
                    },
                },
            )

            await self._emit_event(event)
            self._log_info(f"Merge detected on {branch_name}: {commit_count} commits")

        except Exception as e:
            self._log_error(f"Error processing merge on {branch_name}: {e}")

    async def _check_if_merge(self, old_commit: str, new_commit: str) -> bool:
        """
        Check if a branch update is a merge operation.

        Args:
            old_commit: Previous commit hash.
            new_commit: New commit hash.

        Returns:
            True if the update appears to be a merge.
        """
        if not self._repo:
            return False

        try:
            commits = list(
                self._repo.iter_commits(f"{old_commit}..{new_commit}", max_count=10)
            )

            # Check for merge indicators
            for commit in commits:
                message = commit.message.lower()
                if "merge" in message:
                    return True

            # Multiple commits might indicate a merge
            return len(commits) > 1

        except Exception:
            return False

    def _get_commit_stats(self, commit: "Commit") -> dict[str, int]:
        """
        Get statistics for a commit.

        Args:
            commit: GitPython Commit object.

        Returns:
            Dictionary with insertions, deletions, and files counts.
        """
        try:
            stats = commit.stats.total
            return {
                "insertions": stats.get("insertions", 0),
                "deletions": stats.get("deletions", 0),
                "files": stats.get("files", 0),
            }
        except Exception:
            return {"insertions": 0, "deletions": 0, "files": 0}

    def _get_current_branch_name(self) -> str:
        """
        Get the current branch name.

        Returns:
            Current branch name or 'HEAD' if detached.
        """
        if not self._repo:
            return "unknown"

        try:
            return self._repo.active_branch.name
        except TypeError:
            return "HEAD"

    def _analyze_commit_message(self, message: str) -> ConventionalCommitAnalysis:
        """
        Analyze a commit message for conventional commits format.

        Args:
            message: Commit message to analyze.

        Returns:
            ConventionalCommitAnalysis result.
        """
        analysis = ConventionalCommitAnalysis()

        # Check for conventional commits pattern
        match = self.CONVENTIONAL_COMMIT_PATTERN.match(message)
        if match:
            analysis.conventional = True
            analysis.type = match.group(1)
            scope_group = match.group(2)
            if scope_group:
                analysis.scope = scope_group[1:-1]  # Remove parentheses
            analysis.breaking = "!" in message or "breaking" in message.lower()

        # Extract keywords
        keywords = ["add", "remove", "update", "fix", "implement", "refactor", "test", "docs"]
        analysis.keywords = [kw for kw in keywords if kw in message.lower()]

        return analysis

    def _analyze_branch_pattern(self, branch_name: str) -> BranchPatternAnalysis:
        """
        Analyze a branch name for common patterns.

        Args:
            branch_name: Branch name to analyze.

        Returns:
            BranchPatternAnalysis result.
        """
        for branch_type, pattern in self.BRANCH_PATTERNS.items():
            if pattern.match(branch_name):
                return BranchPatternAnalysis(
                    type=branch_type.value,
                    conventional=True,
                )

        return BranchPatternAnalysis(type="custom", conventional=False)

    def _build_commit_analysis(
        self, analysis: ConventionalCommitAnalysis | None
    ) -> CommitAnalysis | None:
        """
        Build CommitAnalysis from ConventionalCommitAnalysis.

        Args:
            analysis: Conventional commit analysis result.

        Returns:
            CommitAnalysis or None.
        """
        if not analysis:
            return None

        return CommitAnalysis(
            is_feature=analysis.type == "feat",
            is_bugfix=analysis.type == "fix",
            is_refactor=analysis.type == "refactor",
            is_chore=analysis.type == "chore",
            is_docs=analysis.type == "docs",
            is_test=analysis.type == "test",
        )

    def _determine_merge_type(self, commit_count: int) -> str:
        """
        Determine the merge type based on commit count.

        Args:
            commit_count: Number of commits in the merge.

        Returns:
            Merge type string.
        """
        if commit_count == 1:
            return "fast-forward"
        return "merge-commit"

    def _assess_merge_risk(self, commit_count: int) -> str:
        """
        Assess the risk level of a merge.

        Args:
            commit_count: Number of commits in the merge.

        Returns:
            Risk level (low, medium, high).
        """
        if commit_count > 20:
            return "high"
        elif commit_count > 5:
            return "medium"
        return "low"

    def get_stats(self) -> dict[str, Any]:
        """
        Get Git monitor statistics.

        Returns:
            Statistics dictionary.
        """
        base_stats = super().get_stats()

        repo_info = {}
        if self._repo:
            try:
                repo_info = {
                    "current_branch": self._get_current_branch_name(),
                    "last_commit": self._last_commit_hash,
                    "tracked_branches": len(self._last_branch_state),
                }
            except Exception:
                pass

        return {
            **base_stats,
            "repository_path": self._git_config.repository_path,
            "track_commits": self._git_config.track_commits,
            "track_branches": self._git_config.track_branches,
            "track_merges": self._git_config.track_merges,
            **repo_info,
        }
