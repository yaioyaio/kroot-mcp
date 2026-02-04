"""
In-Memory Event Queue System.

Priority-based event queue with batch processing, memory limits,
and retry logic.
"""

from __future__ import annotations

import asyncio
import heapq
import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Coroutine

from .types import BaseEvent, EventSeverity


@dataclass(order=True)
class QueueItem:
    """Priority queue item wrapper."""

    # Negative priority for max-heap behavior (higher priority first)
    sort_priority: int = field(compare=True)
    timestamp: float = field(compare=True)
    event: BaseEvent = field(compare=False)
    priority: int = field(compare=False, default=0)
    retry_count: int = field(compare=False, default=0)
    size: int = field(compare=False, default=0)


class QueueStatistics:
    """Queue statistics container."""

    def __init__(self):
        """Initialize queue statistics."""
        self.size: int = 0
        self.memory_usage: int = 0
        self.enqueued_count: int = 0
        self.dequeued_count: int = 0
        self.dropped_count: int = 0
        self.failed_count: int = 0
        self.processing_time: float = 0.0
        self.throughput: float = 0.0
        self.priority_distribution: dict[int, int] = {}
        self.oldest_event_age: float | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert statistics to dictionary."""
        return {
            "size": self.size,
            "memory_usage": self.memory_usage,
            "enqueued_count": self.enqueued_count,
            "dequeued_count": self.dequeued_count,
            "dropped_count": self.dropped_count,
            "failed_count": self.failed_count,
            "processing_time": self.processing_time,
            "throughput": self.throughput,
            "priority_distribution": self.priority_distribution,
            "oldest_event_age": self.oldest_event_age,
        }


class QueueOptions:
    """Queue configuration options."""

    def __init__(
        self,
        max_size: int = 10000,
        max_memory_mb: int = 100,
        batch_size: int = 100,
        flush_interval: float = 1.0,
        priority_levels: int = 5,
        enable_metrics: bool = True,
        enable_persistence: bool = False,
        retry_attempts: int = 3,
        retry_delay: float = 1.0,
    ):
        """
        Initialize queue options.

        Args:
            max_size: Maximum number of events in queue.
            max_memory_mb: Maximum memory usage in MB.
            batch_size: Number of events per batch processing.
            flush_interval: Auto-flush interval in seconds.
            priority_levels: Number of priority levels (0 to n-1).
            enable_metrics: Whether to track metrics.
            enable_persistence: Whether to persist events.
            retry_attempts: Maximum retry attempts for failed events.
            retry_delay: Delay between retries in seconds.
        """
        self.max_size = max_size
        self.max_memory_mb = max_memory_mb
        self.batch_size = batch_size
        self.flush_interval = flush_interval
        self.priority_levels = priority_levels
        self.enable_metrics = enable_metrics
        self.enable_persistence = enable_persistence
        self.retry_attempts = retry_attempts
        self.retry_delay = retry_delay


# Event handler type
ProcessHandler = Callable[[list[BaseEvent]], Coroutine[Any, Any, None]]


class EventQueue:
    """
    Event Queue class.

    Priority-based in-memory event queue with batch processing,
    memory limits, and retry logic.

    Attributes:
        options: Queue configuration options.
    """

    def __init__(self, options: QueueOptions | None = None):
        """
        Initialize event queue.

        Args:
            options: Queue configuration options.
        """
        self.options = options or QueueOptions()
        self._heap: list[QueueItem] = []
        self._stats = QueueStatistics()
        self._memory_usage: int = 0
        self._is_processing: bool = False
        self._retry_tracking: dict[str, int] = {}
        self._flush_task: asyncio.Task | None = None
        self._process_handler: ProcessHandler | None = None
        self._running: bool = False

        # Event callbacks
        self._on_enqueue: list[Callable[[BaseEvent], None]] = []
        self._on_dequeue: list[Callable[[BaseEvent], None]] = []
        self._on_process: list[ProcessHandler] = []
        self._on_error: list[Callable[[Exception], None]] = []
        self._on_overflow: list[Callable[[list[BaseEvent]], None]] = []

    async def start(self) -> None:
        """Start auto-flush timer."""
        if self._running:
            return
        self._running = True
        if self.options.flush_interval > 0:
            self._flush_task = asyncio.create_task(self._auto_flush_loop())

    async def stop(self) -> None:
        """Stop auto-flush timer."""
        self._running = False
        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass
            self._flush_task = None

    async def enqueue(self, event: BaseEvent) -> bool:
        """
        Add event to queue.

        Args:
            event: Event to add.

        Returns:
            True if successfully added, False otherwise.
        """
        try:
            # Check capacity
            if not self._check_capacity(event):
                return False

            priority = self._calculate_priority(event)
            size = self._estimate_event_size(event)
            timestamp = datetime.utcnow().timestamp()

            item = QueueItem(
                sort_priority=-priority,  # Negative for max-heap
                timestamp=timestamp,
                event=event,
                priority=priority,
                retry_count=0,
                size=size,
            )

            heapq.heappush(self._heap, item)
            self._update_stats("enqueue", item)

            # Notify listeners
            for callback in self._on_enqueue:
                callback(event)

            # Check if batch size reached
            if len(self._heap) >= self.options.batch_size:
                await self.flush()

            return True

        except Exception as e:
            self._emit_error(e)
            return False

    async def enqueue_batch(self, events: list[BaseEvent]) -> int:
        """
        Add multiple events to queue.

        Args:
            events: List of events to add.

        Returns:
            Number of successfully added events.
        """
        success_count = 0
        for event in events:
            if await self.enqueue(event):
                success_count += 1
        return success_count

    def dequeue(self, count: int = 1) -> list[BaseEvent]:
        """
        Remove and return events from queue.

        Args:
            count: Number of events to dequeue.

        Returns:
            List of dequeued events.
        """
        events: list[BaseEvent] = []

        for _ in range(min(count, len(self._heap))):
            if not self._heap:
                break

            item = heapq.heappop(self._heap)
            events.append(item.event)
            self._update_stats("dequeue", item)

            # Notify listeners
            for callback in self._on_dequeue:
                callback(item.event)

        return events

    async def flush(self) -> None:
        """Process pending events in batch."""
        if self._is_processing or not self._heap:
            return

        self._is_processing = True
        start_time = datetime.utcnow().timestamp()

        try:
            events = self.dequeue(self.options.batch_size)
            if events:
                # Notify process handlers
                for handler in self._on_process:
                    await handler(events)

                if self._process_handler:
                    await self._process_handler(events)

                # Update timing stats
                processing_time = datetime.utcnow().timestamp() - start_time
                self._stats.processing_time = processing_time
                if processing_time > 0:
                    self._stats.throughput = len(events) / processing_time

        except Exception as e:
            self._emit_error(e)
        finally:
            self._is_processing = False

    async def retry(self, event: BaseEvent, error: Exception | None = None) -> bool:
        """
        Retry a failed event.

        Args:
            event: Event to retry.
            error: Optional error that caused failure.

        Returns:
            True if retry scheduled, False if max retries exceeded.
        """
        current_retry = self._retry_tracking.get(event.id, 0)

        if current_retry >= self.options.retry_attempts:
            self._stats.failed_count += 1
            self._emit_error(
                Exception(f"Event {event.id} failed after {current_retry} retries")
            )
            return False

        self._retry_tracking[event.id] = current_retry + 1
        retry_count = current_retry + 1

        # Schedule retry with delay
        delay = self.options.retry_delay * retry_count

        async def delayed_enqueue():
            await asyncio.sleep(delay)
            priority = self._calculate_priority(event)
            size = self._estimate_event_size(event)
            timestamp = datetime.utcnow().timestamp()

            item = QueueItem(
                sort_priority=-priority,
                timestamp=timestamp,
                event=event,
                priority=priority,
                retry_count=retry_count,
                size=size,
            )
            heapq.heappush(self._heap, item)
            self._update_stats("retry", item)

        asyncio.create_task(delayed_enqueue())
        return True

    def clear(self) -> None:
        """Clear all events from queue."""
        self._heap.clear()
        self._memory_usage = 0
        self._stats.size = 0
        self._stats.priority_distribution.clear()

    def get_stats(self) -> QueueStatistics:
        """
        Get queue statistics.

        Returns:
            Current queue statistics.
        """
        self._stats.size = len(self._heap)
        self._stats.memory_usage = self._memory_usage

        # Update priority distribution
        self._stats.priority_distribution.clear()
        for item in self._heap:
            priority = item.priority
            self._stats.priority_distribution[priority] = (
                self._stats.priority_distribution.get(priority, 0) + 1
            )

        # Calculate oldest event age
        if self._heap:
            # Find oldest timestamp (heap is ordered by priority, not time)
            oldest = min(item.timestamp for item in self._heap)
            self._stats.oldest_event_age = datetime.utcnow().timestamp() - oldest
        else:
            self._stats.oldest_event_age = None

        return self._stats

    async def shutdown(self) -> None:
        """Shutdown the queue gracefully."""
        await self.stop()

        # Process remaining events
        while self._heap:
            await self.flush()

        self.clear()

    def on_enqueue(self, callback: Callable[[BaseEvent], None]) -> None:
        """Register enqueue callback."""
        self._on_enqueue.append(callback)

    def on_dequeue(self, callback: Callable[[BaseEvent], None]) -> None:
        """Register dequeue callback."""
        self._on_dequeue.append(callback)

    def on_process(self, callback: ProcessHandler) -> None:
        """Register process callback."""
        self._on_process.append(callback)

    def on_error(self, callback: Callable[[Exception], None]) -> None:
        """Register error callback."""
        self._on_error.append(callback)

    def on_overflow(self, callback: Callable[[list[BaseEvent]], None]) -> None:
        """Register overflow callback."""
        self._on_overflow.append(callback)

    def set_process_handler(self, handler: ProcessHandler) -> None:
        """Set the main process handler."""
        self._process_handler = handler

    # Private methods

    def _calculate_priority(self, event: BaseEvent) -> int:
        """Calculate event priority based on severity."""
        severity_priority = {
            EventSeverity.CRITICAL.value: 4,
            EventSeverity.ERROR.value: 3,
            EventSeverity.WARNING.value: 2,
            EventSeverity.WARN.value: 2,
            EventSeverity.INFO.value: 1,
            EventSeverity.DEBUG.value: 0,
        }

        severity = event.severity
        if isinstance(severity, EventSeverity):
            severity = severity.value

        base_priority = severity_priority.get(severity, 1)
        return min(max(base_priority, 0), self.options.priority_levels - 1)

    def _estimate_event_size(self, event: BaseEvent) -> int:
        """Estimate event memory size in bytes."""
        try:
            return len(json.dumps(event.model_dump())) * 2  # UTF-16
        except Exception:
            return 1024  # Default 1KB

    def _check_capacity(self, event: BaseEvent) -> bool:
        """Check if queue has capacity for event."""
        event_size = self._estimate_event_size(event)

        # Check size limit
        if len(self._heap) >= self.options.max_size:
            dropped = self._evict_oldest_events(1)
            self._emit_overflow(dropped)

        # Check memory limit
        max_memory_bytes = self.options.max_memory_mb * 1024 * 1024
        if self._memory_usage + event_size > max_memory_bytes:
            dropped = self._evict_by_memory(event_size)
            self._emit_overflow(dropped)

        return True

    def _evict_oldest_events(self, count: int) -> list[BaseEvent]:
        """Evict oldest low-priority events."""
        evicted: list[BaseEvent] = []

        # Sort by priority (lowest first) then by timestamp (oldest first)
        sorted_items = sorted(
            self._heap,
            key=lambda x: (x.priority, -x.timestamp),
        )

        for i in range(min(count, len(sorted_items))):
            item = sorted_items[i]
            if item in self._heap:
                self._heap.remove(item)
                heapq.heapify(self._heap)
                evicted.append(item.event)
                self._memory_usage -= item.size
                self._stats.dropped_count += 1

        return evicted

    def _evict_by_memory(self, required_size: int) -> list[BaseEvent]:
        """Evict events to free required memory."""
        evicted: list[BaseEvent] = []
        freed_memory = 0

        # Sort by priority (lowest first)
        sorted_items = sorted(self._heap, key=lambda x: x.priority)

        for item in sorted_items:
            if freed_memory >= required_size:
                break
            if item in self._heap:
                self._heap.remove(item)
                evicted.append(item.event)
                freed_memory += item.size
                self._memory_usage -= item.size
                self._stats.dropped_count += 1

        heapq.heapify(self._heap)
        return evicted

    def _update_stats(
        self,
        operation: str,
        item: QueueItem,
    ) -> None:
        """Update queue statistics."""
        if operation == "enqueue":
            self._stats.enqueued_count += 1
            self._memory_usage += item.size
        elif operation == "dequeue":
            self._stats.dequeued_count += 1
            self._memory_usage -= item.size

    def _emit_error(self, error: Exception) -> None:
        """Emit error to callbacks."""
        for callback in self._on_error:
            try:
                callback(error)
            except Exception:
                pass

    def _emit_overflow(self, events: list[BaseEvent]) -> None:
        """Emit overflow notification."""
        for callback in self._on_overflow:
            try:
                callback(events)
            except Exception:
                pass

    async def _auto_flush_loop(self) -> None:
        """Auto-flush loop."""
        while self._running:
            await asyncio.sleep(self.options.flush_interval)
            if self._heap:
                await self.flush()


# Default queue instance
event_queue = EventQueue(
    QueueOptions(
        max_size=10000,
        max_memory_mb=100,
        batch_size=100,
        flush_interval=1.0,
        priority_levels=5,
        enable_metrics=True,
    )
)
