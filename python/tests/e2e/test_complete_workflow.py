"""
End-to-end tests for complete workflow.

Tests the complete flow from file changes through events, analysis, to report generation.
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
from devflow_monitor.analyzers.methodology_analyzer import MethodologyAnalyzer
from devflow_monitor.analyzers.stage_analyzer import StageAnalyzer
from devflow_monitor.events.engine import EventEngine
from devflow_monitor.events.queue import EventQueue
from devflow_monitor.events.types.base import BaseEvent, EventCategory, EventSeverity
from devflow_monitor.monitors.file import FileMonitor, FileMonitorConfig
from devflow_monitor.monitors.git import GitMonitor, GitMonitorConfig
from devflow_monitor.server.main import DevFlowMonitorServer
from devflow_monitor.storage.database import DatabaseConfig, DatabaseManager
from devflow_monitor.storage.repositories.event import EventRepository


@pytest.mark.e2e
class TestFileChangeToReport:
    """End-to-end test for file change to report flow."""

    @pytest_asyncio.fixture
    async def e2e_setup(
        self,
        tmp_path: Path,
    ) -> dict[str, Any]:
        """Set up complete E2E test environment."""
        # Reset event engine singleton
        EventEngine.reset_instance()
        event_engine = EventEngine(max_history=1000)

        # Set up storage
        db_path = tmp_path / "e2e_test.db"
        db_config = DatabaseConfig(path=str(db_path))
        storage = DatabaseManager(db_config)
        await storage.initialize()

        # Set up event repository
        event_repo = EventRepository(storage)

        # Set up event queue
        event_queue = EventQueue()

        # Set up analyzers
        metrics_collector = MetricsCollector(event_engine=event_engine)
        bottleneck_detector = BottleneckDetector(
            event_engine=event_engine,
            metrics_collector=metrics_collector,
        )
        stage_analyzer = StageAnalyzer(event_engine=event_engine)

        # Set up file monitor
        watch_dir = tmp_path / "watch"
        watch_dir.mkdir()
        file_monitor_config = FileMonitorConfig(
            paths=[str(watch_dir)],
            extensions=[".py", ".ts", ".md"],
            debounce_ms=50,
            poll_interval=0.1,
        )
        file_monitor = FileMonitor(
            config=file_monitor_config,
            event_engine=event_engine,
        )

        # Set up MCP server
        mcp_server = DevFlowMonitorServer()

        yield {
            "event_engine": event_engine,
            "storage": storage,
            "event_repo": event_repo,
            "event_queue": event_queue,
            "metrics_collector": metrics_collector,
            "bottleneck_detector": bottleneck_detector,
            "stage_analyzer": stage_analyzer,
            "file_monitor": file_monitor,
            "mcp_server": mcp_server,
            "watch_dir": watch_dir,
            "tmp_path": tmp_path,
        }

        # Cleanup
        await storage.close()
        EventEngine.reset_instance()

    @pytest.mark.asyncio
    async def test_file_change_to_report(
        self,
        e2e_setup: dict[str, Any],
    ) -> None:
        """
        Test complete flow: file creation -> event -> analysis -> report.

        This test verifies the complete workflow:
        1. Create a file (simulated file change)
        2. Event is generated and published
        3. Event is stored in database
        4. Metrics are collected
        5. Analysis is performed
        6. Report can be generated
        """
        event_engine = e2e_setup["event_engine"]
        event_repo = e2e_setup["event_repo"]
        metrics_collector = e2e_setup["metrics_collector"]
        bottleneck_detector = e2e_setup["bottleneck_detector"]
        stage_analyzer = e2e_setup["stage_analyzer"]
        mcp_server = e2e_setup["mcp_server"]
        watch_dir = e2e_setup["watch_dir"]

        # Start collectors
        metrics_collector.start()
        bottleneck_detector.start()
        stage_analyzer.start()

        # Track events
        received_events: list[BaseEvent] = []

        async def event_handler(event: BaseEvent) -> None:
            received_events.append(event)

        event_engine.subscribe("*", event_handler)

        # Step 1: Simulate file creation
        test_file = watch_dir / "test_module.py"
        test_file.write_text(
            '''"""Test module for E2E testing."""

class TestService:
    """A test service class."""

    def process(self, data: dict) -> dict:
        """Process the data."""
        return {"processed": True, "data": data}
'''
        )

        # Step 2: Generate file change event
        file_event = BaseEvent(
            type="file:created",
            category=EventCategory.FILE,
            severity=EventSeverity.INFO,
            source="FileMonitor",
            data={
                "path": str(test_file),
                "action": "created",
                "extension": ".py",
                "size": test_file.stat().st_size,
            },
        )

        await event_engine.publish(file_event)

        # Step 3: Store event in database
        record = await event_repo.create_from_event(file_event)
        assert record.id is not None

        # Step 4: Generate more events for analysis
        coding_events = [
            BaseEvent(
                type="file:modified",
                category=EventCategory.FILE,
                severity=EventSeverity.INFO,
                source="FileMonitor",
                data={"path": f"/src/module_{i}.py"},
            )
            for i in range(5)
        ]

        for event in coding_events:
            await event_engine.publish(event)
            await event_repo.create_from_event(event)

        # Allow time for processing
        await asyncio.sleep(0.2)

        # Step 5: Verify events were received
        assert len(received_events) >= 6

        # Step 6: Verify storage
        stored_events = await event_repo.find_all()
        assert len(stored_events) >= 6

        # Step 7: Check metrics collection
        metrics_stats = metrics_collector.get_stats()
        assert metrics_stats["total_events"] >= 6

        # Step 8: Generate report via MCP server
        report_result = await mcp_server._handle_tool_call(
            "generateReport",
            {"reportType": "daily", "format": "summary", "includeMetrics": True},
        )

        assert len(report_result) == 1
        assert "Generated Report" in report_result[0].text

        # Stop collectors
        metrics_collector.stop()
        bottleneck_detector.stop()
        stage_analyzer.stop()

    @pytest.mark.asyncio
    async def test_git_commit_to_analysis(
        self,
        e2e_setup: dict[str, Any],
        temp_git_repo: Path,
    ) -> None:
        """Test complete flow: git commit -> event -> analysis."""
        event_engine = e2e_setup["event_engine"]
        event_repo = e2e_setup["event_repo"]
        metrics_collector = e2e_setup["metrics_collector"]
        mcp_server = e2e_setup["mcp_server"]

        # Start collectors
        metrics_collector.start()

        # Track events
        received_events: list[BaseEvent] = []

        async def event_handler(event: BaseEvent) -> None:
            received_events.append(event)

        event_engine.subscribe("*", event_handler)

        # Create a file and commit
        test_file = temp_git_repo / "feature.py"
        test_file.write_text("# New feature\ndef feature(): pass")

        subprocess.run(
            ["git", "add", "."],
            cwd=temp_git_repo,
            capture_output=True,
            check=True,
        )
        subprocess.run(
            ["git", "commit", "-m", "feat: add new feature"],
            cwd=temp_git_repo,
            capture_output=True,
            check=True,
        )

        # Simulate git commit event
        commit_event = BaseEvent(
            type="git:commit",
            category=EventCategory.GIT,
            severity=EventSeverity.INFO,
            source="GitMonitor",
            data={
                "message": "feat: add new feature",
                "files_changed": 1,
                "insertions": 2,
                "deletions": 0,
            },
        )

        await event_engine.publish(commit_event)
        await event_repo.create_from_event(commit_event)

        await asyncio.sleep(0.1)

        # Verify event flow
        assert len(received_events) >= 1

        # Check methodology analysis via MCP
        methodology_result = await mcp_server._handle_tool_call(
            "checkMethodology",
            {"methodology": "all", "includeRecommendations": True},
        )

        assert "Methodology Check" in methodology_result[0].text

        metrics_collector.stop()

    @pytest.mark.asyncio
    async def test_multiple_events_trigger_bottleneck_analysis(
        self,
        e2e_setup: dict[str, Any],
    ) -> None:
        """Test that multiple error events trigger bottleneck analysis."""
        event_engine = e2e_setup["event_engine"]
        event_repo = e2e_setup["event_repo"]
        bottleneck_detector = e2e_setup["bottleneck_detector"]
        mcp_server = e2e_setup["mcp_server"]

        # Start detector
        bottleneck_detector.start()

        # Generate multiple error events (potential bottleneck)
        error_events = [
            BaseEvent(
                type="build:failed",
                category=EventCategory.BUILD,
                severity=EventSeverity.ERROR,
                source="BuildSystem",
                data={"success": False, "error": f"Build error {i}"},
            )
            for i in range(10)
        ]

        for event in error_events:
            await event_engine.publish(event)
            await event_repo.create_from_event(event)

        await asyncio.sleep(0.2)

        # Run bottleneck detection
        bottleneck_detector.detect_bottlenecks()

        # Verify via MCP
        bottleneck_result = await mcp_server._handle_tool_call(
            "analyzeBottlenecks",
            {"analysisDepth": "detailed"},
        )

        assert "Bottleneck Analysis" in bottleneck_result[0].text

        bottleneck_detector.stop()

    @pytest.mark.asyncio
    async def test_stage_transitions(
        self,
        e2e_setup: dict[str, Any],
    ) -> None:
        """Test development stage transitions."""
        event_engine = e2e_setup["event_engine"]
        stage_analyzer = e2e_setup["stage_analyzer"]

        # Start analyzer
        stage_analyzer.start()

        # Simulate coding stage events
        coding_events = [
            BaseEvent(
                type="file:created",
                category=EventCategory.FILE,
                severity=EventSeverity.INFO,
                source="FileMonitor",
                data={"path": "/src/service.py"},
            ),
            BaseEvent(
                type="file:modified",
                category=EventCategory.FILE,
                severity=EventSeverity.INFO,
                source="FileMonitor",
                data={"path": "/src/service.py"},
            ),
        ]

        for event in coding_events:
            await event_engine.publish(event)

        # Simulate testing stage events
        test_events = [
            BaseEvent(
                type="test:run",
                category=EventCategory.TEST,
                severity=EventSeverity.INFO,
                source="TestRunner",
                data={"suite": "unit", "passed": 10, "failed": 0},
            ),
        ]

        for event in test_events:
            await event_engine.publish(event)

        await asyncio.sleep(0.2)

        # Check stage analyzer stats
        stats = stage_analyzer.get_stats()
        assert stats["total_events"] >= 3

        stage_analyzer.stop()

    @pytest.mark.asyncio
    async def test_event_queue_batch_processing(
        self,
        e2e_setup: dict[str, Any],
    ) -> None:
        """Test event queue batch processing."""
        event_queue = e2e_setup["event_queue"]

        processed_events: list[BaseEvent] = []

        async def process_handler(events: list[BaseEvent]) -> None:
            processed_events.extend(events)

        event_queue.set_process_handler(process_handler)

        # Enqueue many events
        for i in range(50):
            event = BaseEvent(
                type=f"batch:test_{i}",
                category=EventCategory.SYSTEM,
                source="BatchTest",
            )
            await event_queue.enqueue(event)

        # Flush queue
        await event_queue.flush()

        assert len(processed_events) >= 50

    @pytest.mark.asyncio
    async def test_complete_development_cycle(
        self,
        e2e_setup: dict[str, Any],
    ) -> None:
        """Test a complete development cycle simulation."""
        event_engine = e2e_setup["event_engine"]
        event_repo = e2e_setup["event_repo"]
        metrics_collector = e2e_setup["metrics_collector"]
        mcp_server = e2e_setup["mcp_server"]

        metrics_collector.start()

        # Simulate complete development cycle
        cycle_events = [
            # Planning
            BaseEvent(
                type="task:created",
                category=EventCategory.SYSTEM,
                severity=EventSeverity.INFO,
                source="TaskManager",
                data={"task": "Implement feature X"},
            ),
            # Coding
            BaseEvent(
                type="file:created",
                category=EventCategory.FILE,
                severity=EventSeverity.INFO,
                source="FileMonitor",
                data={"path": "/src/feature_x.py"},
            ),
            BaseEvent(
                type="file:modified",
                category=EventCategory.FILE,
                severity=EventSeverity.INFO,
                source="FileMonitor",
                data={"path": "/src/feature_x.py"},
            ),
            # Testing
            BaseEvent(
                type="test:created",
                category=EventCategory.TEST,
                severity=EventSeverity.INFO,
                source="TestFramework",
                data={"path": "/tests/test_feature_x.py"},
            ),
            BaseEvent(
                type="test:run",
                category=EventCategory.TEST,
                severity=EventSeverity.INFO,
                source="TestRunner",
                data={"passed": 5, "failed": 0, "coverage": 85.0},
            ),
            # Git commit
            BaseEvent(
                type="git:commit",
                category=EventCategory.GIT,
                severity=EventSeverity.INFO,
                source="GitMonitor",
                data={"message": "feat: implement feature X"},
            ),
            # Build
            BaseEvent(
                type="build:success",
                category=EventCategory.BUILD,
                severity=EventSeverity.INFO,
                source="BuildSystem",
                data={"success": True, "duration_ms": 1500},
            ),
            # Deploy
            BaseEvent(
                type="deploy:success",
                category=EventCategory.SYSTEM,
                severity=EventSeverity.INFO,
                source="DeploySystem",
                data={"environment": "staging"},
            ),
        ]

        for event in cycle_events:
            await event_engine.publish(event)
            await event_repo.create_from_event(event)

        await asyncio.sleep(0.2)

        # Verify all events stored
        stored = await event_repo.find_all()
        assert len(stored) >= len(cycle_events)

        # Verify metrics
        stats = metrics_collector.get_stats()
        assert stats["total_events"] >= len(cycle_events)

        # Generate comprehensive report
        report = await mcp_server._handle_tool_call(
            "generateReport",
            {
                "reportType": "daily",
                "format": "summary",
                "includeMetrics": True,
                "includeTrends": True,
            },
        )

        assert "Generated Report" in report[0].text

        # Check project status
        status = await mcp_server._handle_tool_call(
            "getProjectStatus",
            {"includeDetails": True},
        )

        assert "Project Status" in status[0].text

        metrics_collector.stop()


@pytest.mark.e2e
class TestSystemResilience:
    """End-to-end tests for system resilience."""

    @pytest.mark.asyncio
    async def test_system_handles_rapid_events(
        self,
        event_engine: EventEngine,
    ) -> None:
        """Test that system handles rapid event publishing."""
        received_count = 0

        async def handler(event: BaseEvent) -> None:
            nonlocal received_count
            received_count += 1

        event_engine.subscribe("*", handler)

        # Publish events rapidly
        events = [
            BaseEvent(
                type=f"rapid:event_{i}",
                category=EventCategory.SYSTEM,
                source="RapidTest",
            )
            for i in range(100)
        ]

        # Publish all at once
        await asyncio.gather(*[event_engine.publish(e) for e in events])

        await asyncio.sleep(0.1)

        assert received_count == 100

    @pytest.mark.asyncio
    async def test_system_recovers_from_handler_error(
        self,
        event_engine: EventEngine,
    ) -> None:
        """Test that system continues after handler error."""
        processed = []

        async def failing_handler(event: BaseEvent) -> None:
            if "fail" in event.type:
                raise ValueError("Intentional error")
            processed.append(event)

        event_engine.subscribe("*", failing_handler)

        # Publish mix of failing and succeeding events
        events = [
            BaseEvent(type="fail:event", category=EventCategory.SYSTEM, source="test"),
            BaseEvent(type="success:event1", category=EventCategory.SYSTEM, source="test"),
            BaseEvent(type="success:event2", category=EventCategory.SYSTEM, source="test"),
        ]

        for event in events:
            try:
                await event_engine.publish(event)
            except ValueError:
                pass  # Expected for failing events

        # Successful events should still be processed
        assert len(processed) >= 2
