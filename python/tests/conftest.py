"""
Pytest configuration and fixtures for DevFlow Monitor tests.

This module provides shared fixtures for all test modules including:
- Event engine setup and teardown
- Storage manager with test database
- Temporary directories for file monitoring
- Mock HTTP clients for integration testing
"""

from __future__ import annotations

import asyncio
import os
import tempfile
from pathlib import Path
from typing import Any, AsyncGenerator, Generator
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio

from devflow_monitor.events.engine import EventEngine
from devflow_monitor.events.queue import EventQueue, QueueOptions
from devflow_monitor.events.types.base import (
    BaseEvent,
    EventCategory,
    EventMetadata,
    EventSeverity,
)
from devflow_monitor.storage.database import DatabaseConfig, DatabaseManager


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    """Create an event loop for the test session.

    Returns:
        Event loop instance for async tests.
    """
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def event_engine() -> Generator[EventEngine, None, None]:
    """Provide a fresh EventEngine instance for each test.

    The singleton is reset before and after each test to ensure
    test isolation.

    Yields:
        Fresh EventEngine instance.
    """
    # Reset singleton to ensure clean state
    EventEngine.reset_instance()
    engine = EventEngine(max_history=1000)

    yield engine

    # Cleanup: clear subscriptions and history
    engine.clear_all_subscriptions()
    engine.clear_history()
    EventEngine.reset_instance()


@pytest.fixture
def event_queue() -> Generator[EventQueue, None, None]:
    """Provide a fresh EventQueue instance for each test.

    Yields:
        Fresh EventQueue instance with default options.
    """
    options = QueueOptions(
        max_size=1000,
        max_memory_mb=50,
        batch_size=10,
        flush_interval=0.1,
        priority_levels=5,
        enable_metrics=True,
        retry_attempts=3,
        retry_delay=0.1,
    )
    queue = EventQueue(options)

    yield queue

    # Cleanup
    queue.clear()


@pytest_asyncio.fixture
async def storage_manager(
    tmp_path: Path,
) -> AsyncGenerator[DatabaseManager, None]:
    """Provide a DatabaseManager with a temporary test database.

    Args:
        tmp_path: Pytest temporary path fixture.

    Yields:
        Initialized DatabaseManager instance.
    """
    db_path = tmp_path / "test_devflow.db"
    config = DatabaseConfig(
        path=str(db_path),
        timeout=5.0,
    )

    db = DatabaseManager(config)
    await db.initialize()

    yield db

    # Cleanup
    await db.close()
    if db_path.exists():
        db_path.unlink()


@pytest.fixture
def temp_dir() -> Generator[Path, None, None]:
    """Provide a temporary directory for file monitoring tests.

    Yields:
        Path to a temporary directory that is cleaned up after the test.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def temp_git_repo(temp_dir: Path) -> Generator[Path, None, None]:
    """Provide a temporary Git repository for Git monitor tests.

    Args:
        temp_dir: Temporary directory fixture.

    Yields:
        Path to a temporary Git repository.
    """
    import subprocess

    # Initialize git repo
    subprocess.run(
        ["git", "init"],
        cwd=temp_dir,
        capture_output=True,
        check=True,
    )

    # Configure git user for commits
    subprocess.run(
        ["git", "config", "user.email", "test@example.com"],
        cwd=temp_dir,
        capture_output=True,
        check=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "Test User"],
        cwd=temp_dir,
        capture_output=True,
        check=True,
    )

    yield temp_dir


@pytest.fixture
def mock_http_client() -> MagicMock:
    """Provide a mock HTTP client for API integration tests.

    Returns:
        Mock httpx client with async methods.
    """
    client = MagicMock()

    # Mock async methods
    client.get = AsyncMock(
        return_value=MagicMock(
            status_code=200,
            json=MagicMock(return_value={"success": True, "data": {}}),
            text="{}",
        )
    )
    client.post = AsyncMock(
        return_value=MagicMock(
            status_code=201,
            json=MagicMock(return_value={"success": True, "id": "123"}),
            text='{"success": true, "id": "123"}',
        )
    )
    client.put = AsyncMock(
        return_value=MagicMock(
            status_code=200,
            json=MagicMock(return_value={"success": True}),
            text='{"success": true}',
        )
    )
    client.delete = AsyncMock(
        return_value=MagicMock(
            status_code=204,
            json=MagicMock(return_value=None),
            text="",
        )
    )

    # Context manager support
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)

    return client


@pytest.fixture
def sample_event() -> BaseEvent:
    """Provide a sample event for testing.

    Returns:
        Sample BaseEvent instance.
    """
    return BaseEvent(
        type="test:sample_event",
        category=EventCategory.SYSTEM,
        severity=EventSeverity.INFO,
        source="test_fixture",
        data={"test_key": "test_value"},
        metadata=EventMetadata(
            environment="test",
            user_id="test_user",
            session_id="test_session",
            tags=["test", "fixture"],
        ),
    )


@pytest.fixture
def sample_file_event() -> BaseEvent:
    """Provide a sample file event for testing.

    Returns:
        Sample file event.
    """
    return BaseEvent(
        type="file:changed",
        category=EventCategory.FILE,
        severity=EventSeverity.INFO,
        source="FileMonitor",
        data={
            "action": "change",
            "new_file": {
                "path": "/test/path/file.py",
                "relative_path": "file.py",
                "name": "file.py",
                "extension": ".py",
                "is_directory": False,
            },
            "context": {
                "type": "source",
            },
        },
    )


@pytest.fixture
def sample_git_event() -> BaseEvent:
    """Provide a sample git event for testing.

    Returns:
        Sample git event.
    """
    return BaseEvent(
        type="git:commit:created",
        category=EventCategory.GIT,
        severity=EventSeverity.INFO,
        source="GitMonitor",
        data={
            "commit": {
                "hash": "abc123def456",
                "short_hash": "abc123",
                "message": "feat: add new feature",
                "author": {
                    "name": "Test User",
                    "email": "test@example.com",
                },
                "files_changed": 3,
                "insertions": 50,
                "deletions": 10,
            },
            "branch": {
                "name": "feature/test",
                "is_current": True,
            },
        },
    )


@pytest.fixture
def multiple_events() -> list[BaseEvent]:
    """Provide multiple events for batch testing.

    Returns:
        List of varied events for testing.
    """
    events = []
    categories = [
        EventCategory.FILE,
        EventCategory.GIT,
        EventCategory.TEST,
        EventCategory.BUILD,
        EventCategory.SYSTEM,
    ]
    severities = [
        EventSeverity.DEBUG,
        EventSeverity.INFO,
        EventSeverity.WARNING,
        EventSeverity.ERROR,
    ]

    for i in range(20):
        event = BaseEvent(
            type=f"test:event_{i}",
            category=categories[i % len(categories)],
            severity=severities[i % len(severities)],
            source="test_fixture",
            data={"index": i, "batch": "test_batch"},
        )
        events.append(event)

    return events


@pytest.fixture
def security_config() -> dict[str, Any]:
    """Provide security configuration for security tests.

    Returns:
        Security configuration dictionary.
    """
    return {
        "jwt_secret": "test-secret-key-for-testing-only-32bytes!",
        "jwt_algorithm": "HS256",
        "access_token_expire": "1h",
        "refresh_token_expire": "7d",
        "issuer": "devflow-monitor-test",
        "audience": "devflow-test-users",
        "rate_limit_window_ms": 60000,
        "rate_limit_max_attempts": 10,
        "session_max_sessions": 3,
        "session_timeout_ms": 3600000,
        "encryption_key_length": 32,
    }


# Markers for slow tests
def pytest_configure(config: pytest.Config) -> None:
    """Configure pytest markers.

    Args:
        config: Pytest configuration object.
    """
    config.addinivalue_line(
        "markers",
        "slow: marks tests as slow (deselect with '-m \"not slow\"')",
    )
    config.addinivalue_line(
        "markers",
        "integration: marks tests as integration tests",
    )
    config.addinivalue_line(
        "markers",
        "e2e: marks tests as end-to-end tests",
    )
    config.addinivalue_line(
        "markers",
        "performance: marks tests as performance tests",
    )
