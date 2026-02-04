"""
Performance tests for throughput and latency.

Tests system performance under load including event throughput,
latency percentiles, memory usage, and concurrent operations.
"""

from __future__ import annotations

import asyncio
import gc
import sys
import time
import tracemalloc
from pathlib import Path
from typing import Any

import pytest
import pytest_asyncio

from devflow_monitor.analyzers.bottleneck_detector import BottleneckDetector
from devflow_monitor.analyzers.metrics_collector import MetricsCollector
from devflow_monitor.events.engine import EventEngine
from devflow_monitor.events.queue import EventQueue
from devflow_monitor.events.types.base import BaseEvent, EventCategory, EventSeverity
from devflow_monitor.monitors.file import FileMonitor, FileMonitorConfig
from devflow_monitor.storage.database import DatabaseConfig, DatabaseManager
from devflow_monitor.storage.repositories.event import EventRepository


@pytest.mark.performance
class TestEventThroughput:
    """Tests for event processing throughput."""

    @pytest.mark.asyncio
    async def test_10000_events_under_5_seconds(
        self,
        event_engine: EventEngine,
    ) -> None:
        """Test processing 10,000 events in under 5 seconds."""
        event_count = 10000
        received_count = 0

        async def handler(event: BaseEvent) -> None:
            nonlocal received_count
            received_count += 1

        event_engine.subscribe("*", handler)

        # Generate events
        events = [
            BaseEvent(
                type=f"throughput:event_{i}",
                category=EventCategory.SYSTEM,
                severity=EventSeverity.INFO,
                source="ThroughputTest",
                data={"index": i},
            )
            for i in range(event_count)
        ]

        # Measure time
        start_time = time.perf_counter()

        # Publish all events
        for event in events:
            await event_engine.publish(event)

        end_time = time.perf_counter()
        elapsed = end_time - start_time

        # Allow some time for async processing
        await asyncio.sleep(0.1)

        # Assertions
        assert elapsed < 5.0, f"Processing took {elapsed:.2f}s, expected < 5s"
        assert received_count == event_count, (
            f"Received {received_count}, expected {event_count}"
        )

        # Calculate throughput
        throughput = event_count / elapsed
        print(f"\nThroughput: {throughput:.0f} events/second")

    @pytest.mark.asyncio
    async def test_concurrent_event_publishing(
        self,
        event_engine: EventEngine,
    ) -> None:
        """Test concurrent event publishing."""
        event_count = 1000
        received_events: list[BaseEvent] = []
        lock = asyncio.Lock()

        async def handler(event: BaseEvent) -> None:
            async with lock:
                received_events.append(event)

        event_engine.subscribe("*", handler)

        events = [
            BaseEvent(
                type=f"concurrent:event_{i}",
                category=EventCategory.SYSTEM,
                source="ConcurrentTest",
            )
            for i in range(event_count)
        ]

        start_time = time.perf_counter()

        # Publish concurrently
        await asyncio.gather(*[event_engine.publish(e) for e in events])

        end_time = time.perf_counter()

        await asyncio.sleep(0.1)

        assert len(received_events) == event_count
        print(f"\nConcurrent publishing: {end_time - start_time:.3f}s")

    @pytest.mark.asyncio
    async def test_queue_batch_throughput(self) -> None:
        """Test event queue batch processing throughput."""
        event_queue = EventQueue()
        processed_count = 0

        async def batch_handler(events: list[BaseEvent]) -> None:
            nonlocal processed_count
            processed_count += len(events)

        event_queue.set_process_handler(batch_handler)

        event_count = 5000

        start_time = time.perf_counter()

        # Enqueue all events
        for i in range(event_count):
            event = BaseEvent(
                type=f"batch:event_{i}",
                category=EventCategory.SYSTEM,
                source="BatchTest",
            )
            await event_queue.enqueue(event)

        # Flush
        await event_queue.flush()

        end_time = time.perf_counter()

        assert processed_count >= event_count
        print(f"\nBatch throughput: {event_count / (end_time - start_time):.0f} events/s")


@pytest.mark.performance
class TestLatencyPercentiles:
    """Tests for latency percentiles."""

    @pytest.mark.asyncio
    async def test_latency_percentiles(
        self,
        event_engine: EventEngine,
    ) -> None:
        """
        Test latency percentiles meet requirements:
        - P50 < 10ms
        - P95 < 50ms
        - P99 < 100ms
        """
        latencies: list[float] = []
        event_count = 1000

        async def timed_handler(event: BaseEvent) -> None:
            # Record time event was received
            receive_time = time.perf_counter()
            # Extract send time from data
            if event.data and "send_time" in event.data:
                send_time = event.data["send_time"]
                latency_ms = (receive_time - send_time) * 1000
                latencies.append(latency_ms)

        event_engine.subscribe("*", timed_handler)

        # Publish events with timing
        for i in range(event_count):
            event = BaseEvent(
                type=f"latency:event_{i}",
                category=EventCategory.SYSTEM,
                source="LatencyTest",
                data={"send_time": time.perf_counter()},
            )
            await event_engine.publish(event)

        await asyncio.sleep(0.1)

        # Calculate percentiles
        if latencies:
            sorted_latencies = sorted(latencies)
            p50_idx = int(len(sorted_latencies) * 0.50)
            p95_idx = int(len(sorted_latencies) * 0.95)
            p99_idx = int(len(sorted_latencies) * 0.99)

            p50 = sorted_latencies[p50_idx]
            p95 = sorted_latencies[p95_idx]
            p99 = sorted_latencies[p99_idx]

            print(f"\nLatency percentiles:")
            print(f"  P50: {p50:.3f}ms")
            print(f"  P95: {p95:.3f}ms")
            print(f"  P99: {p99:.3f}ms")

            # Assertions (relaxed for CI environment)
            assert p50 < 10.0, f"P50 latency {p50:.3f}ms exceeds 10ms"
            assert p95 < 50.0, f"P95 latency {p95:.3f}ms exceeds 50ms"
            assert p99 < 100.0, f"P99 latency {p99:.3f}ms exceeds 100ms"

    @pytest.mark.asyncio
    async def test_sustained_low_latency(
        self,
        event_engine: EventEngine,
    ) -> None:
        """Test that latency stays low under sustained load."""
        latencies: list[float] = []

        async def handler(event: BaseEvent) -> None:
            if event.data and "send_time" in event.data:
                latency = (time.perf_counter() - event.data["send_time"]) * 1000
                latencies.append(latency)

        event_engine.subscribe("*", handler)

        # Sustained load for 2 seconds
        duration = 2.0
        start = time.perf_counter()
        event_idx = 0

        while time.perf_counter() - start < duration:
            event = BaseEvent(
                type=f"sustained:event_{event_idx}",
                category=EventCategory.SYSTEM,
                source="SustainedTest",
                data={"send_time": time.perf_counter()},
            )
            await event_engine.publish(event)
            event_idx += 1
            # Small delay to avoid overwhelming
            await asyncio.sleep(0.001)

        await asyncio.sleep(0.1)

        if latencies:
            avg_latency = sum(latencies) / len(latencies)
            max_latency = max(latencies)

            print(f"\nSustained load test:")
            print(f"  Events processed: {len(latencies)}")
            print(f"  Avg latency: {avg_latency:.3f}ms")
            print(f"  Max latency: {max_latency:.3f}ms")

            assert avg_latency < 20.0, f"Avg latency {avg_latency:.3f}ms too high"


@pytest.mark.performance
class TestMemoryUsage:
    """Tests for memory usage."""

    @pytest.mark.asyncio
    async def test_memory_usage_under_limit(
        self,
        event_engine: EventEngine,
    ) -> None:
        """Test that memory usage stays under 100MB limit."""
        # Start tracking memory
        tracemalloc.start()
        gc.collect()

        initial_memory = tracemalloc.get_traced_memory()[0]

        # Generate and process many events
        event_count = 5000
        received = 0

        async def handler(event: BaseEvent) -> None:
            nonlocal received
            received += 1

        event_engine.subscribe("*", handler)

        for i in range(event_count):
            event = BaseEvent(
                type=f"memory:event_{i}",
                category=EventCategory.SYSTEM,
                source="MemoryTest",
                data={"payload": "x" * 100},  # 100 bytes per event
            )
            await event_engine.publish(event)

        await asyncio.sleep(0.1)

        # Check memory
        current_memory = tracemalloc.get_traced_memory()[0]
        peak_memory = tracemalloc.get_traced_memory()[1]

        tracemalloc.stop()

        memory_used_mb = (current_memory - initial_memory) / (1024 * 1024)
        peak_memory_mb = peak_memory / (1024 * 1024)

        print(f"\nMemory usage:")
        print(f"  Current: {memory_used_mb:.2f}MB")
        print(f"  Peak: {peak_memory_mb:.2f}MB")

        # Memory limit assertion (100MB)
        assert peak_memory_mb < 100.0, (
            f"Peak memory {peak_memory_mb:.2f}MB exceeds 100MB limit"
        )

    @pytest.mark.asyncio
    async def test_no_memory_leak_on_repeated_operations(
        self,
        event_engine: EventEngine,
    ) -> None:
        """Test that repeated operations don't leak memory."""
        gc.collect()
        tracemalloc.start()

        async def handler(event: BaseEvent) -> None:
            pass

        event_engine.subscribe("*", handler)

        memory_samples: list[float] = []

        for iteration in range(5):
            # Generate events
            for i in range(1000):
                event = BaseEvent(
                    type=f"leak:event_{iteration}_{i}",
                    category=EventCategory.SYSTEM,
                    source="LeakTest",
                )
                await event_engine.publish(event)

            gc.collect()
            current = tracemalloc.get_traced_memory()[0] / (1024 * 1024)
            memory_samples.append(current)

        tracemalloc.stop()

        # Check memory growth
        if len(memory_samples) >= 2:
            growth = memory_samples[-1] - memory_samples[0]
            print(f"\nMemory growth over iterations: {growth:.2f}MB")

            # Allow some growth, but not excessive
            assert growth < 50.0, f"Memory grew {growth:.2f}MB, possible leak"


@pytest.mark.performance
class TestConcurrentMonitors:
    """Tests for concurrent monitor operations."""

    @pytest.mark.asyncio
    async def test_concurrent_monitors(
        self,
        event_engine: EventEngine,
        tmp_path: Path,
    ) -> None:
        """Test multiple monitors running concurrently."""
        # Create multiple watch directories
        watch_dirs = [tmp_path / f"watch_{i}" for i in range(3)]
        for d in watch_dirs:
            d.mkdir()

        # Create file monitors
        monitors = []
        for watch_dir in watch_dirs:
            config = FileMonitorConfig(
                paths=[str(watch_dir)],
                extensions=[".py", ".txt"],
                poll_interval=0.1,
            )
            monitor = FileMonitor(config=config, event_engine=event_engine)
            monitors.append(monitor)

        received_events: list[BaseEvent] = []

        async def handler(event: BaseEvent) -> None:
            received_events.append(event)

        event_engine.subscribe("*", handler)

        # Simulate events from all monitors
        start_time = time.perf_counter()

        async def generate_events(monitor_id: int) -> None:
            for i in range(100):
                event = BaseEvent(
                    type=f"monitor_{monitor_id}:event_{i}",
                    category=EventCategory.FILE,
                    source=f"FileMonitor_{monitor_id}",
                )
                await event_engine.publish(event)

        # Run all monitors concurrently
        await asyncio.gather(*[generate_events(i) for i in range(3)])

        end_time = time.perf_counter()

        await asyncio.sleep(0.1)

        print(f"\nConcurrent monitors test:")
        print(f"  Monitors: 3")
        print(f"  Total events: {len(received_events)}")
        print(f"  Time: {end_time - start_time:.3f}s")

        assert len(received_events) == 300

    @pytest.mark.asyncio
    async def test_monitor_isolation(
        self,
        event_engine: EventEngine,
    ) -> None:
        """Test that monitors don't interfere with each other."""
        events_by_source: dict[str, list[BaseEvent]] = {}

        async def handler(event: BaseEvent) -> None:
            source = event.source
            if source not in events_by_source:
                events_by_source[source] = []
            events_by_source[source].append(event)

        event_engine.subscribe("*", handler)

        # Simulate multiple independent monitors
        async def simulate_monitor(name: str, count: int) -> None:
            for i in range(count):
                event = BaseEvent(
                    type=f"{name}:event_{i}",
                    category=EventCategory.FILE,
                    source=name,
                )
                await event_engine.publish(event)
                await asyncio.sleep(0.001)

        await asyncio.gather(
            simulate_monitor("FileMonitor", 50),
            simulate_monitor("GitMonitor", 30),
            simulate_monitor("TestMonitor", 20),
        )

        await asyncio.sleep(0.1)

        assert len(events_by_source.get("FileMonitor", [])) == 50
        assert len(events_by_source.get("GitMonitor", [])) == 30
        assert len(events_by_source.get("TestMonitor", [])) == 20


@pytest.mark.performance
class TestStoragePerformance:
    """Tests for storage performance."""

    @pytest_asyncio.fixture
    async def storage_setup(
        self,
        tmp_path: Path,
    ) -> dict[str, Any]:
        """Set up storage for performance tests."""
        db_path = tmp_path / "perf_test.db"
        config = DatabaseConfig(path=str(db_path))
        storage = DatabaseManager(config)
        await storage.initialize()

        event_repo = EventRepository(storage)

        yield {
            "storage": storage,
            "event_repo": event_repo,
        }

        await storage.close()

    @pytest.mark.asyncio
    async def test_bulk_insert_performance(
        self,
        storage_setup: dict[str, Any],
    ) -> None:
        """Test bulk event insertion performance."""
        event_repo = storage_setup["event_repo"]

        event_count = 1000
        events = [
            BaseEvent(
                type=f"bulk:event_{i}",
                category=EventCategory.SYSTEM,
                source="BulkTest",
                data={"index": i},
            )
            for i in range(event_count)
        ]

        start_time = time.perf_counter()

        for event in events:
            await event_repo.create_from_event(event)

        end_time = time.perf_counter()
        elapsed = end_time - start_time

        print(f"\nBulk insert performance:")
        print(f"  Events: {event_count}")
        print(f"  Time: {elapsed:.3f}s")
        print(f"  Rate: {event_count / elapsed:.0f} inserts/s")

        assert elapsed < 10.0, f"Bulk insert took {elapsed:.2f}s, expected < 10s"

    @pytest.mark.asyncio
    async def test_query_performance(
        self,
        storage_setup: dict[str, Any],
    ) -> None:
        """Test query performance with populated database."""
        event_repo = storage_setup["event_repo"]

        # Insert test data
        for i in range(500):
            event = BaseEvent(
                type=f"query:event_{i}",
                category=EventCategory.FILE if i % 2 == 0 else EventCategory.GIT,
                source="QueryTest",
            )
            await event_repo.create_from_event(event)

        # Test different queries
        queries = [
            ("find_all", lambda: event_repo.find_all()),
            ("find_by_category_file", lambda: event_repo.find_by_category("file")),
            ("find_by_category_git", lambda: event_repo.find_by_category("git")),
        ]

        print("\nQuery performance:")
        for name, query_func in queries:
            start = time.perf_counter()
            results = await query_func()
            elapsed = (time.perf_counter() - start) * 1000

            print(f"  {name}: {len(results)} results in {elapsed:.2f}ms")

            # Queries should be fast
            assert elapsed < 1000, f"{name} took {elapsed:.2f}ms, expected < 1000ms"


@pytest.mark.performance
class TestAnalyzerPerformance:
    """Tests for analyzer performance."""

    @pytest.mark.asyncio
    async def test_metrics_collector_performance(
        self,
        event_engine: EventEngine,
    ) -> None:
        """Test metrics collector performance under load."""
        metrics_collector = MetricsCollector(event_engine=event_engine)
        metrics_collector.start()

        event_count = 2000

        start_time = time.perf_counter()

        for i in range(event_count):
            event = BaseEvent(
                type=f"metrics:event_{i}",
                category=EventCategory.FILE,
                source="MetricsTest",
            )
            await event_engine.publish(event)

        await asyncio.sleep(0.2)

        end_time = time.perf_counter()

        stats = metrics_collector.get_stats()
        metrics_collector.stop()

        print(f"\nMetrics collector performance:")
        print(f"  Events: {event_count}")
        print(f"  Processed: {stats['total_events']}")
        print(f"  Time: {end_time - start_time:.3f}s")

        assert stats["total_events"] >= event_count * 0.95  # Allow 5% loss

    @pytest.mark.asyncio
    async def test_bottleneck_detector_performance(
        self,
        event_engine: EventEngine,
    ) -> None:
        """Test bottleneck detector performance."""
        metrics_collector = MetricsCollector(event_engine=event_engine)
        bottleneck_detector = BottleneckDetector(
            event_engine=event_engine,
            metrics_collector=metrics_collector,
        )

        metrics_collector.start()
        bottleneck_detector.start()

        # Generate events that might indicate bottlenecks
        for i in range(500):
            event = BaseEvent(
                type="build:failed" if i % 5 == 0 else "build:success",
                category=EventCategory.BUILD,
                severity=EventSeverity.ERROR if i % 5 == 0 else EventSeverity.INFO,
                source="BuildSystem",
            )
            await event_engine.publish(event)

        await asyncio.sleep(0.2)

        start_time = time.perf_counter()
        bottleneck_detector.detect_bottlenecks()
        detection_time = (time.perf_counter() - start_time) * 1000

        stats = bottleneck_detector.get_stats()

        metrics_collector.stop()
        bottleneck_detector.stop()

        print(f"\nBottleneck detector performance:")
        print(f"  Detection time: {detection_time:.2f}ms")
        print(f"  Events analyzed: {stats['total_events']}")

        # Detection should be fast
        assert detection_time < 500, f"Detection took {detection_time:.2f}ms"
