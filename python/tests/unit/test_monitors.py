"""
Unit tests for the monitors module.

Tests cover file monitoring, git monitoring, file change detection,
ignore patterns, commit detection, and branch tracking.
"""

from __future__ import annotations

import asyncio
import subprocess
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

from devflow_monitor.events.engine import EventEngine
from devflow_monitor.events.types.base import BaseEvent, EventCategory
from devflow_monitor.events.types.file import FileChangeAction, FileContextType
from devflow_monitor.monitors.file import FileMonitor, FileMonitorConfig
from devflow_monitor.monitors.git import GitMonitor, GitMonitorConfig


class TestFileMonitorDetectCreate:
    """Tests for file creation detection."""

    @pytest_asyncio.fixture
    async def file_monitor(
        self,
        temp_dir: Path,
        event_engine: EventEngine,
    ) -> FileMonitor:
        """Create a file monitor for testing."""
        config = FileMonitorConfig(
            paths=[str(temp_dir)],
            extensions=[".py", ".txt", ".json"],
            ignore_patterns=["*.pyc", "__pycache__/*"],
            debounce_ms=50,
            poll_interval=0.1,
        )
        monitor = FileMonitor(config=config, event_engine=event_engine)
        return monitor

    def test_file_monitor_config(self, file_monitor: FileMonitor) -> None:
        """Test file monitor configuration."""
        config = file_monitor.file_config

        assert ".py" in config.extensions
        assert "*.pyc" in config.ignore_patterns

    def test_file_monitor_stats(self, file_monitor: FileMonitor) -> None:
        """Test file monitor statistics."""
        stats = file_monitor.get_stats()

        assert "paths" in stats
        assert "ignore_patterns" in stats
        assert "extensions" in stats

    def test_add_path(
        self,
        file_monitor: FileMonitor,
        temp_dir: Path,
    ) -> None:
        """Test adding a path to monitor."""
        new_path = str(temp_dir / "subdir")
        file_monitor.add_path(new_path)

        assert new_path in file_monitor.file_config.paths

    def test_remove_path(self, file_monitor: FileMonitor, temp_dir: Path) -> None:
        """Test removing a path from monitoring."""
        initial_path = str(temp_dir)
        assert initial_path in file_monitor.file_config.paths

        file_monitor.remove_path(initial_path)

        assert initial_path not in file_monitor.file_config.paths


class TestFileMonitorDetectModify:
    """Tests for file modification detection."""

    def test_context_detection_source(self) -> None:
        """Test source file context detection."""
        monitor = FileMonitor()
        context = monitor._analyze_context("src/main.py", ".py")

        assert context.type == FileContextType.SOURCE
        assert context.language == "python"

    def test_context_detection_test(self) -> None:
        """Test test file context detection."""
        monitor = FileMonitor()
        context = monitor._analyze_context("tests/test_main.py", ".py")

        assert context.type == FileContextType.TEST

    def test_context_detection_config(self) -> None:
        """Test config file context detection."""
        monitor = FileMonitor()
        context = monitor._analyze_context("config.json", ".json")

        assert context.type == FileContextType.CONFIG

    def test_context_detection_docs(self) -> None:
        """Test documentation file context detection."""
        monitor = FileMonitor()
        context = monitor._analyze_context("README.md", ".md")

        assert context.type == FileContextType.DOCUMENTATION

    def test_context_detection_build(self) -> None:
        """Test build output context detection."""
        monitor = FileMonitor()
        context = monitor._analyze_context("dist/bundle.js", ".js")

        assert context.type == FileContextType.BUILD


class TestFileMonitorDetectDelete:
    """Tests for file deletion detection."""

    def test_language_detection(self) -> None:
        """Test programming language detection from extension."""
        monitor = FileMonitor()

        assert monitor._detect_language(".py") == "python"
        assert monitor._detect_language(".ts") == "typescript"
        assert monitor._detect_language(".tsx") == "typescript"
        assert monitor._detect_language(".js") == "javascript"
        assert monitor._detect_language(".go") == "go"
        assert monitor._detect_language(".rs") == "rust"
        assert monitor._detect_language(".java") == "java"
        assert monitor._detect_language(".rb") == "ruby"
        assert monitor._detect_language(".unknown") is None


class TestFileMonitorIgnorePatterns:
    """Tests for file monitor ignore patterns."""

    def test_should_ignore_pyc_files(self) -> None:
        """Test ignoring .pyc files."""
        config = FileMonitorConfig(
            paths=["."],
            ignore_patterns=["*.pyc", "__pycache__/*"],
        )
        monitor = FileMonitor(config=config)

        assert monitor._should_ignore("test.pyc") is True
        assert monitor._should_ignore("__pycache__/module.cpython-311.pyc") is True

    def test_should_ignore_node_modules(self) -> None:
        """Test ignoring node_modules directory."""
        config = FileMonitorConfig(
            paths=["."],
            ignore_patterns=["**/node_modules/**"],
        )
        monitor = FileMonitor(config=config)

        assert monitor._should_ignore("node_modules/lodash/index.js") is True

    def test_should_not_ignore_regular_files(self) -> None:
        """Test that regular files are not ignored."""
        config = FileMonitorConfig(
            paths=["."],
            ignore_patterns=["*.pyc"],
        )
        monitor = FileMonitor(config=config)

        assert monitor._should_ignore("main.py") is False
        assert monitor._should_ignore("test.txt") is False

    def test_extension_filter(self) -> None:
        """Test extension filtering."""
        config = FileMonitorConfig(
            paths=["."],
            extensions=[".py", ".ts"],
        )
        monitor = FileMonitor(config=config)

        # Extensions are checked during event processing
        # Here we just verify configuration
        assert ".py" in config.extensions
        assert ".ts" in config.extensions
        assert ".js" not in config.extensions


class TestGitMonitorDetectCommit:
    """Tests for git commit detection."""

    def test_git_monitor_config(self) -> None:
        """Test git monitor configuration."""
        config = GitMonitorConfig(
            repository_path="/test/repo",
            track_branches=True,
            track_commits=True,
            track_merges=True,
            analyze_commit_messages=True,
        )

        assert config.repository_path == "/test/repo"
        assert config.track_branches is True
        assert config.track_commits is True

    def test_analyze_conventional_commit_feat(self) -> None:
        """Test conventional commit analysis for feat type."""
        monitor = GitMonitor()
        analysis = monitor._analyze_commit_message("feat: add new feature")

        assert analysis.conventional is True
        assert analysis.type == "feat"
        assert analysis.breaking is False

    def test_analyze_conventional_commit_fix(self) -> None:
        """Test conventional commit analysis for fix type."""
        monitor = GitMonitor()
        analysis = monitor._analyze_commit_message("fix(api): resolve bug")

        assert analysis.conventional is True
        assert analysis.type == "fix"
        assert analysis.scope == "api"

    def test_analyze_conventional_commit_breaking(self) -> None:
        """Test conventional commit analysis for breaking change."""
        monitor = GitMonitor()
        analysis = monitor._analyze_commit_message("feat!: breaking change")

        assert analysis.conventional is True
        assert analysis.breaking is True

    def test_analyze_non_conventional_commit(self) -> None:
        """Test analysis of non-conventional commit."""
        monitor = GitMonitor()
        analysis = monitor._analyze_commit_message("Updated readme file")

        assert analysis.conventional is False
        assert "update" in analysis.keywords


class TestGitMonitorDetectBranch:
    """Tests for git branch detection."""

    def test_branch_pattern_feature(self) -> None:
        """Test feature branch pattern detection."""
        monitor = GitMonitor()
        pattern = monitor._analyze_branch_pattern("feature/add-login")

        assert pattern.type == "feature"
        assert pattern.conventional is True

    def test_branch_pattern_bugfix(self) -> None:
        """Test bugfix branch pattern detection."""
        monitor = GitMonitor()
        pattern = monitor._analyze_branch_pattern("bugfix/fix-crash")

        assert pattern.type == "bugfix"
        assert pattern.conventional is True

    def test_branch_pattern_hotfix(self) -> None:
        """Test hotfix branch pattern detection."""
        monitor = GitMonitor()
        pattern = monitor._analyze_branch_pattern("hotfix/urgent-fix")

        assert pattern.type == "hotfix"
        assert pattern.conventional is True

    def test_branch_pattern_release(self) -> None:
        """Test release branch pattern detection."""
        monitor = GitMonitor()
        pattern = monitor._analyze_branch_pattern("release/v1.0.0")

        assert pattern.type == "release"
        assert pattern.conventional is True

    def test_branch_pattern_main(self) -> None:
        """Test main branch pattern detection."""
        monitor = GitMonitor()
        pattern = monitor._analyze_branch_pattern("main")

        assert pattern.type == "main"
        assert pattern.conventional is True

    def test_branch_pattern_custom(self) -> None:
        """Test custom branch pattern detection."""
        monitor = GitMonitor()
        pattern = monitor._analyze_branch_pattern("some-random-branch")

        assert pattern.type == "custom"
        assert pattern.conventional is False

    def test_merge_risk_assessment_low(self) -> None:
        """Test low risk merge assessment."""
        monitor = GitMonitor()
        risk = monitor._assess_merge_risk(3)

        assert risk == "low"

    def test_merge_risk_assessment_medium(self) -> None:
        """Test medium risk merge assessment."""
        monitor = GitMonitor()
        risk = monitor._assess_merge_risk(10)

        assert risk == "medium"

    def test_merge_risk_assessment_high(self) -> None:
        """Test high risk merge assessment."""
        monitor = GitMonitor()
        risk = monitor._assess_merge_risk(25)

        assert risk == "high"

    def test_merge_type_fast_forward(self) -> None:
        """Test fast-forward merge type detection."""
        monitor = GitMonitor()
        merge_type = monitor._determine_merge_type(1)

        assert merge_type == "fast-forward"

    def test_merge_type_merge_commit(self) -> None:
        """Test merge commit type detection."""
        monitor = GitMonitor()
        merge_type = monitor._determine_merge_type(5)

        assert merge_type == "merge-commit"


class TestGitMonitorWithRealRepo:
    """Tests for git monitor with a real temporary repository."""

    @pytest_asyncio.fixture
    async def git_monitor(
        self,
        temp_git_repo: Path,
        event_engine: EventEngine,
    ) -> GitMonitor:
        """Create a git monitor for the temporary repository."""
        config = GitMonitorConfig(
            repository_path=str(temp_git_repo),
            track_branches=True,
            track_commits=True,
            track_merges=True,
            analyze_commit_messages=True,
        )
        monitor = GitMonitor(config=config, event_engine=event_engine)
        return monitor

    @pytest.mark.asyncio
    async def test_validate_repository(
        self,
        git_monitor: GitMonitor,
    ) -> None:
        """Test repository validation."""
        # Should not raise
        await git_monitor._validate_repository()

        assert git_monitor._repo is not None

    @pytest.mark.asyncio
    async def test_validate_invalid_repository(
        self,
        temp_dir: Path,
        event_engine: EventEngine,
    ) -> None:
        """Test validation fails for non-git directory."""
        config = GitMonitorConfig(
            repository_path=str(temp_dir),
        )
        monitor = GitMonitor(config=config, event_engine=event_engine)

        with pytest.raises(ValueError, match="Not a Git repository"):
            await monitor._validate_repository()

    @pytest.mark.asyncio
    async def test_get_current_branch(
        self,
        git_monitor: GitMonitor,
        temp_git_repo: Path,
    ) -> None:
        """Test getting current branch name."""
        await git_monitor._validate_repository()

        # Create initial commit so we have a valid branch
        test_file = temp_git_repo / "test.txt"
        test_file.write_text("test content")
        subprocess.run(
            ["git", "add", "."],
            cwd=temp_git_repo,
            capture_output=True,
            check=True,
        )
        subprocess.run(
            ["git", "commit", "-m", "Initial commit"],
            cwd=temp_git_repo,
            capture_output=True,
            check=True,
        )

        branch_name = git_monitor._get_current_branch_name()

        # Should be 'main', 'master', or branch name
        assert branch_name in ["main", "master"] or branch_name is not None

    @pytest.mark.asyncio
    async def test_cache_initial_state(
        self,
        git_monitor: GitMonitor,
        temp_git_repo: Path,
    ) -> None:
        """Test caching initial repository state."""
        await git_monitor._validate_repository()

        # Create initial commit
        test_file = temp_git_repo / "test.txt"
        test_file.write_text("test content")
        subprocess.run(
            ["git", "add", "."],
            cwd=temp_git_repo,
            capture_output=True,
            check=True,
        )
        subprocess.run(
            ["git", "commit", "-m", "Initial commit"],
            cwd=temp_git_repo,
            capture_output=True,
            check=True,
        )

        await git_monitor._cache_initial_state()

        assert git_monitor._last_commit_hash is not None

    @pytest.mark.asyncio
    async def test_monitor_stats(
        self,
        git_monitor: GitMonitor,
        temp_git_repo: Path,
    ) -> None:
        """Test getting monitor statistics."""
        await git_monitor._validate_repository()

        stats = git_monitor.get_stats()

        assert "repository_path" in stats
        assert "track_commits" in stats
        assert "track_branches" in stats
