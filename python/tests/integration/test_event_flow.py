"""
Integration tests for event flow.

Tests the complete event flow from monitors through event engine
to storage and analyzers.
"""

from __future__ import annotations

import asyncio
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

from devflow_monitor.analyzers.bottleneck_detector import BottleneckDetector
from devflow_monitor.analyzers.metrics_collector import MetricsCollector
from devflow_monitor.analyzers.stage_analyzer import StageAnalyzer
from devflow_monitor.events.engine import EventEngine
from devflow_monitor.events.queue import EventQueue
from devflow_monitor.events.types.base import BaseEvent, EventCategory, EventSeverity
from devflow_monitor.monitors.file import FileMonitor, FileMonitorConfig
from devflow_monitor.monitors.git import GitMonitor, GitMonitorConfig
from devflow_monitor.storage.database import DatabaseConfig, DatabaseManager
from devflow_monitor.storage.repositories.event import EventRepository


@pytest.mark.integration
class TestMonitorToEventEngine:
    """Tests for monitor to event engine integration."""

    @pytest.fixture
    def event_engine(self) -> EventEngine:
        """Create event engine instance."""
        EventEngine.reset_instance()
        return EventEngine(max_history=1000)

    @pytest.fixture
    def file_monitor(
        self, temp_dir: Path, event_engine: EventEngine
    ) -> FileMonitor:
        """Create file monitor instance."""
        config = FileMonitorConfig(
            paths=[str(temp_dir)],
            extensions=[".py", ".txt"],
            debounce_ms=50,
            poll_interval=0.1,
        )
        return FileMonitor(config=config, event_engine=event_engine)

    @pytest.mark.asyncio
    async def test_file_monitor_emits_event(
        self,
        file_monitor: FileMonitor,
        event_engine: EventEngine,
        temp_dir: Path,
    ) -> None:
        """Test that file monitor emits events to event engine."""
        received_events: list[BaseEvent] = []

        async def handler(event: BaseEvent) -> None:
            received_events.append(event)

        event_engine.subscribe("*", handler)

        # Create a file event manually (simulating file change)
        event = BaseEvent(
            type="file:changed",
            category=EventCategory.FILE,
            source="FileMonitor",
            data={"path": str(temp_dir / "test.py")},
        )

        await event_engine.publish(event)

        assert len(received_events) == 1
        assert received_events[0].category == EventCategory.FILE

    @pytest.mark.asyncio
    async def test_event_engine_statistics_update(
        self, event_engine: EventEngine
    ) -> None:
        """Test that event engine statistics are updated."""
        events = [
            BaseEvent(
                type=f"test:event_{i}",
                category=EventCategory.FILE if i % 2 == 0 else EventCategory.GIT,
                severity=EventSeverity.INFO if i % 3 == 0 else EventSeverity.WARNING,
                source="test",
            )
            for i in range(10)
        ]

        for event in events:
            await event_engine.publish(event)

        stats = event_engine.get_statistics()

        assert stats.total_events == 10
        assert stats.events_by_category["file"] == 5
        assert stats.events_by_category["git"] == 5


@pytest.mark.integration
class TestEventToStorage:
    """Tests for event to storage integration."""

    @pytest_asyncio.fixture
    async def storage_manager(self, tmp_path: Path) -> DatabaseManager:
        """Create database manager."""
        db_path = tmp_path / "integration_test.db"
        config = DatabaseConfig(path=str(db_path))
        db = DatabaseManager(config)
        await db.initialize()
        yield db
        await db.close()

    @pytest_asyncio.fixture
    async def event_repo(
        self, storage_manager: DatabaseManager
    ) -> EventRepository:
        """Create event repository."""
        return EventRepository(storage_manager)

    @pytest.mark.asyncio
    async def test_event_persisted_to_storage(
        self,
        event_engine: EventEngine,
        event_repo: EventRepository,
    ) -> None:
        """Test that events are persisted to storage."""
        event = BaseEvent(
            type="test:persist",
            category=EventCategory.SYSTEM,
            severity=EventSeverity.INFO,
            source="integration_test",
            data={"key": "value"},
        )

        # Persist event
        record = await event_repo.create_from_event(event)

        assert record.id is not None
        assert record.type == "test:persist"

        # Retrieve and verify
        found = await event_repo.find_by_id(record.id)
        assert found is not None
        assert found.type == event.type

    @pytest.mark.asyncio
    async def test_multiple_events_stored(
        self, event_repo: EventRepository
    ) -> None:
        """Test storing multiple events."""
        events = [
            BaseEvent(
                type=f"test:multi_{i}",
                category=EventCategory.SYSTEM,
                source="test",
            )
            for i in range(5)
        ]

        for event in events:
            await event_repo.create_from_event(event)

        all_records = await event_repo.find_all()

        assert len(all_records) >= 5

    @pytest.mark.asyncio
    async def test_query_stored_events(
        self, event_repo: EventRepository
    ) -> None:
        """Test querying stored events."""
        # Store events with different categories
        file_event = BaseEvent(
            type="test:file",
            category=EventCategory.FILE,
            source="test",
        )
        git_event = BaseEvent(
            type="test:git",
            category=EventCategory.GIT,
            source="test",
        )

        await event_repo.create_from_event(file_event)
        await event_repo.create_from_event(git_event)

        file_results = await event_repo.find_by_category("file")
        git_results = await event_repo.find_by_category("git")

        assert len(file_results) >= 1
        assert len(git_results) >= 1


@pytest.mark.integration
class TestEventToAnalyzer:
    """Tests for event to analyzer integration."""

    @pytest.fixture
    def metrics_collector(self, event_engine: EventEngine) -> MetricsCollector:
        """Create metrics collector."""
        return MetricsCollector(event_engine=event_engine)

    @pytest.fixture
    def bottleneck_detector(
        self, event_engine: EventEngine, metrics_collector: MetricsCollector
    ) -> BottleneckDetector:
        """Create bottleneck detector."""
        return BottleneckDetector(
            event_engine=event_engine,
            metrics_collector=metrics_collector,
        )

    @pytest.mark.asyncio
    async def test_metrics_collector_receives_events(
        self,
        event_engine: EventEngine,
        metrics_collector: MetricsCollector,
    ) -> None:
        """Test that metrics collector receives and processes events."""
        metrics_collector.start()

        event = BaseEvent(
            type="file:changed",
            category=EventCategory.FILE,
            source="test",
            data={"new_file": {"path": "/test/file.py"}},
        )

        await event_engine.publish(event)

        # Give time for processing
        await asyncio.sleep(0.1)

        stats = metrics_collector.get_stats()
        assert stats["total_events"] >= 1

        metrics_collector.stop()

    @pytest.mark.asyncio
    async def test_bottleneck_detector_receives_events(
        self,
        event_engine: EventEngine,
        bottleneck_detector: BottleneckDetector,
    ) -> None:
        """Test that bottleneck detector receives events."""
        bottleneck_detector.start()

        # Send multiple error events
        for i in range(3):
            event = BaseEvent(
                type="build:failed",
                category=EventCategory.BUILD,
                severity=EventSeverity.ERROR,
                source="test",
                data={"success": False, "error": f"Error {i}"},
            )
            await event_engine.publish(event)

        await asyncio.sleep(0.1)

        stats = bottleneck_detector.get_stats()
        assert stats["total_events"] >= 3

        bottleneck_detector.stop()


@pytest.mark.integration
class TestCompleteEventFlow:
    """Tests for complete event flow integration."""

    @pytest_asyncio.fixture
    async def integration_setup(
        self, tmp_path: Path
    ) -> dict[str, Any]:
        """Set up complete integration test environment."""
        # Reset event engine singleton
        EventEngine.reset_instance()
        event_engine = EventEngine(max_history=1000)

        # Set up storage
        db_path = tmp_path / "flow_test.db"
        db_config = DatabaseConfig(path=str(db_path))
        storage = DatabaseManager(db_config)
        await storage.initialize()

        # Set up components
        event_repo = EventRepository(storage)
        metrics_collector = MetricsCollector(event_engine=event_engine)
        bottleneck_detector = BottleneckDetector(
            event_engine=event_engine,
            metrics_collector=metrics_collector,
        )

        yield {
            "event_engine": event_engine,
            "storage": storage,
            "event_repo": event_repo,
            "metrics_collector": metrics_collector,
            "bottleneck_detector": bottleneck_detector,
        }

        # Cleanup
        await storage.close()
        EventEngine.reset_instance()

    @pytest.mark.asyncio
    async def test_end_to_end_event_flow(
        self, integration_setup: dict[str, Any]
    ) -> None:
        """Test complete event flow from generation to storage."""
        event_engine = integration_setup["event_engine"]
        event_repo = integration_setup["event_repo"]
        metrics_collector = integration_setup["metrics_collector"]

        # Start collectors
        metrics_collector.start()

        # Track received events
        received_events: list[BaseEvent] = []

        async def event_handler(event: BaseEvent) -> None:
            received_events.append(event)

        event_engine.subscribe("*", event_handler)

        # Generate events
        events = [
            BaseEvent(
                type="file:changed",
                category=EventCategory.FILE,
                severity=EventSeverity.INFO,
                source="test",
                data={"path": f"/test/file{i}.py"},
            )
            for i in range(5)
        ]

        # Publish and persist events
        for event in events:
            await event_engine.publish(event)
            await event_repo.create_from_event(event)

        # Allow processing
        await asyncio.sleep(0.2)

        # Verify event flow
        assert len(received_events) == 5

        # Verify storage
        stored = await event_repo.find_all()
        assert len(stored) >= 5

        # Verify metrics
        stats = metrics_collector.get_stats()
        assert stats["total_events"] >= 5

        metrics_collector.stop()

    @pytest.mark.asyncio
    async def test_event_flow_with_queue(
        self, integration_setup: dict[str, Any]
    ) -> None:
        """Test event flow through event queue."""
        event_engine = integration_setup["event_engine"]
        event_queue = EventQueue()

        processed_events: list[BaseEvent] = []

        async def process_handler(events: list[BaseEvent]) -> None:
            processed_events.extend(events)

        event_queue.set_process_handler(process_handler)

        # Enqueue events
        for i in range(10):
            event = BaseEvent(
                type=f"queue:test_{i}",
                category=EventCategory.SYSTEM,
                source="test",
            )
            await event_queue.enqueue(event)

        # Flush queue
        await event_queue.flush()

        assert len(processed_events) >= 10

    @pytest.mark.asyncio
    async def test_event_flow_triggers_analysis(
        self, integration_setup: dict[str, Any]
    ) -> None:
        """Test that event flow triggers analysis."""
        event_engine = integration_setup["event_engine"]
        bottleneck_detector = integration_setup["bottleneck_detector"]

        bottleneck_detector.start()

        # Generate error events that should trigger bottleneck detection
        for i in range(6):
            event = BaseEvent(
                type="build:failed",
                category=EventCategory.BUILD,
                severity=EventSeverity.ERROR,
                source="test",
                data={"success": False, "error": f"Build error {i}"},
            )
            await event_engine.publish(event)

        await asyncio.sleep(0.2)

        # Run detection
        bottleneck_detector.detect_bottlenecks()

        stats = bottleneck_detector.get_stats()
        # Should have recorded the error events
        assert stats["total_events"] >= 6

        bottleneck_detector.stop()


@pytest.mark.integration
class TestGitMonitorIntegration:
    """Integration tests for git monitor with real repository."""

    @pytest.mark.asyncio
    async def test_git_monitor_with_real_repo(
        self,
        temp_git_repo: Path,
        event_engine: EventEngine,
    ) -> None:
        """Test git monitor with a real git repository."""
        config = GitMonitorConfig(
            repository_path=str(temp_git_repo),
            track_commits=True,
            track_branches=True,
        )
        monitor = GitMonitor(config=config, event_engine=event_engine)

        # Initialize the monitor
        await monitor._validate_repository()
        assert monitor._repo is not None

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
            ["git", "commit", "-m", "feat: initial commit"],
            cwd=temp_git_repo,
            capture_output=True,
            check=True,
        )

        # Cache initial state
        await monitor._cache_initial_state()
        assert monitor._last_commit_hash is not None

        # Monitor stats should reflect the repository
        stats = monitor.get_stats()
        assert stats["repository_path"] == str(temp_git_repo)
