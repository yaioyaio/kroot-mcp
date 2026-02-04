"""
Event Queue Manager.

Manages multiple event queues with routing rules and batch processing.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable, Coroutine

from .queue import EventQueue, ProcessHandler, QueueOptions, QueueStatistics
from .types import BaseEvent, EventCategory


@dataclass
class RoutingRule:
    """Event routing rule."""

    name: str
    predicate: Callable[[BaseEvent], bool]
    queue_name: str
    priority: int = 0


@dataclass
class QueueInfo:
    """Queue information container."""

    name: str
    queue: EventQueue
    options: QueueOptions
    created_at: datetime
    event_count: int = 0


class QueueManagerOptions:
    """Queue manager configuration options."""

    def __init__(
        self,
        default_queue_options: QueueOptions | None = None,
        enable_auto_routing: bool = True,
        enable_metrics: bool = True,
        metrics_interval: float = 5.0,
        max_queues: int = 10,
    ):
        """
        Initialize queue manager options.

        Args:
            default_queue_options: Default options for new queues.
            enable_auto_routing: Whether to enable automatic routing.
            enable_metrics: Whether to collect metrics.
            metrics_interval: Metrics collection interval in seconds.
            max_queues: Maximum number of queues allowed.
        """
        self.default_queue_options = default_queue_options or QueueOptions()
        self.enable_auto_routing = enable_auto_routing
        self.enable_metrics = enable_metrics
        self.metrics_interval = metrics_interval
        self.max_queues = max_queues


class QueueManager:
    """
    Queue Manager class.

    Manages multiple event queues with routing rules,
    batch processing, and metrics collection.

    Attributes:
        options: Queue manager configuration.
    """

    _instance: QueueManager | None = None

    def __init__(self, options: QueueManagerOptions | None = None):
        """
        Initialize queue manager.

        Args:
            options: Queue manager configuration options.
        """
        self.options = options or QueueManagerOptions()
        self._queues: dict[str, QueueInfo] = {}
        self._routing_rules: list[RoutingRule] = []
        self._processing_handlers: dict[str, ProcessHandler] = {}
        self._metrics_task: asyncio.Task | None = None
        self._running: bool = False

        # Event callbacks
        self._on_queue_created: list[Callable[[str, EventQueue], None]] = []
        self._on_queue_destroyed: list[Callable[[str], None]] = []
        self._on_event_routed: list[Callable[[BaseEvent, str], None]] = []
        self._on_batch_processed: list[Callable[[list[BaseEvent], str], None]] = []
        self._on_error: list[Callable[[Exception, str | None], None]] = []
        self._on_stats_update: list[Callable[[dict[str, QueueStatistics]], None]] = []

        # Create default queues
        self._create_default_queues()

        # Setup auto routing
        if self.options.enable_auto_routing:
            self._setup_auto_routing()

    @classmethod
    def get_instance(cls) -> QueueManager:
        """
        Get singleton instance of QueueManager.

        Returns:
            QueueManager singleton instance.
        """
        if cls._instance is None:
            cls._instance = QueueManager()
        return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        """Reset the singleton instance (useful for testing)."""
        cls._instance = None

    async def start(self) -> None:
        """Start the queue manager and all queues."""
        if self._running:
            return
        self._running = True

        # Start all queues
        for queue_info in self._queues.values():
            await queue_info.queue.start()

        # Start metrics collection
        if self.options.enable_metrics:
            self._metrics_task = asyncio.create_task(self._metrics_loop())

    async def stop(self) -> None:
        """Stop the queue manager and all queues."""
        self._running = False

        if self._metrics_task:
            self._metrics_task.cancel()
            try:
                await self._metrics_task
            except asyncio.CancelledError:
                pass
            self._metrics_task = None

        # Stop all queues
        for queue_info in self._queues.values():
            await queue_info.queue.stop()

    def create_queue(
        self,
        name: str,
        options: QueueOptions | None = None,
    ) -> EventQueue:
        """
        Create a new queue.

        Args:
            name: Queue name.
            options: Queue options.

        Returns:
            Created EventQueue instance.

        Raises:
            ValueError: If queue already exists or max queues reached.
        """
        if name in self._queues:
            raise ValueError(f"Queue '{name}' already exists")

        if len(self._queues) >= self.options.max_queues:
            raise ValueError(f"Maximum number of queues ({self.options.max_queues}) reached")

        queue_options = QueueOptions(
            max_size=options.max_size if options else self.options.default_queue_options.max_size,
            max_memory_mb=options.max_memory_mb if options else self.options.default_queue_options.max_memory_mb,
            batch_size=options.batch_size if options else self.options.default_queue_options.batch_size,
            flush_interval=options.flush_interval if options else self.options.default_queue_options.flush_interval,
            priority_levels=options.priority_levels if options else self.options.default_queue_options.priority_levels,
            enable_metrics=options.enable_metrics if options else self.options.default_queue_options.enable_metrics,
            retry_attempts=options.retry_attempts if options else self.options.default_queue_options.retry_attempts,
            retry_delay=options.retry_delay if options else self.options.default_queue_options.retry_delay,
        )

        queue = EventQueue(queue_options)

        # Setup queue event handlers
        queue.on_process(lambda events: self._handle_batch_process(name, events))
        queue.on_error(lambda error: self._emit_error(error, name))

        queue_info = QueueInfo(
            name=name,
            queue=queue,
            options=queue_options,
            created_at=datetime.utcnow(),
        )

        self._queues[name] = queue_info

        # Notify listeners
        for callback in self._on_queue_created:
            callback(name, queue)

        return queue

    async def destroy_queue(self, name: str) -> None:
        """
        Destroy a queue.

        Args:
            name: Queue name.

        Raises:
            ValueError: If queue not found or is a system queue.
        """
        if name not in self._queues:
            raise ValueError(f"Queue '{name}' not found")

        # Prevent destroying system queues
        if name in ("default", "priority", "batch", "failed"):
            raise ValueError(f"Cannot destroy system queue '{name}'")

        queue_info = self._queues[name]
        await queue_info.queue.shutdown()
        del self._queues[name]

        # Notify listeners
        for callback in self._on_queue_destroyed:
            callback(name)

    def get_queue(self, name: str) -> EventQueue | None:
        """
        Get a queue by name.

        Args:
            name: Queue name.

        Returns:
            EventQueue or None if not found.
        """
        queue_info = self._queues.get(name)
        return queue_info.queue if queue_info else None

    def get_queue_names(self) -> list[str]:
        """
        Get all queue names.

        Returns:
            List of queue names.
        """
        return list(self._queues.keys())

    def add_routing_rule(self, rule: RoutingRule) -> None:
        """
        Add a routing rule.

        Args:
            rule: Routing rule to add.
        """
        self._routing_rules.append(rule)
        # Sort by priority (higher first)
        self._routing_rules.sort(key=lambda r: r.priority, reverse=True)

    def remove_routing_rule(self, name: str) -> bool:
        """
        Remove a routing rule.

        Args:
            name: Rule name.

        Returns:
            True if removed, False otherwise.
        """
        for i, rule in enumerate(self._routing_rules):
            if rule.name == name:
                self._routing_rules.pop(i)
                return True
        return False

    async def route_event(self, event: BaseEvent) -> bool:
        """
        Route an event to appropriate queue.

        Args:
            event: Event to route.

        Returns:
            True if successfully routed, False otherwise.
        """
        # Try routing rules
        for rule in self._routing_rules:
            if rule.predicate(event):
                queue = self.get_queue(rule.queue_name)
                if queue:
                    success = await queue.enqueue(event)
                    if success:
                        queue_info = self._queues.get(rule.queue_name)
                        if queue_info:
                            queue_info.event_count += 1
                        self._emit_event_routed(event, rule.queue_name)
                        return True

        # Fall back to default queue
        default_queue = self.get_queue("default")
        if default_queue:
            success = await default_queue.enqueue(event)
            if success:
                queue_info = self._queues.get("default")
                if queue_info:
                    queue_info.event_count += 1
                self._emit_event_routed(event, "default")
                return True

        return False

    async def route_event_batch(self, events: list[BaseEvent]) -> int:
        """
        Route multiple events.

        Args:
            events: Events to route.

        Returns:
            Number of successfully routed events.
        """
        success_count = 0
        for event in events:
            if await self.route_event(event):
                success_count += 1
        return success_count

    def register_processor(
        self,
        queue_name: str,
        handler: ProcessHandler,
    ) -> None:
        """
        Register a batch processor for a queue.

        Args:
            queue_name: Queue name.
            handler: Batch processing handler.
        """
        self._processing_handlers[queue_name] = handler

    def unregister_processor(self, queue_name: str) -> None:
        """
        Unregister a batch processor.

        Args:
            queue_name: Queue name.
        """
        self._processing_handlers.pop(queue_name, None)

    def get_all_stats(self) -> dict[str, QueueStatistics]:
        """
        Get statistics for all queues.

        Returns:
            Dictionary mapping queue names to statistics.
        """
        return {
            name: queue_info.queue.get_stats()
            for name, queue_info in self._queues.items()
        }

    def get_queue_stats(self, name: str) -> QueueStatistics | None:
        """
        Get statistics for a specific queue.

        Args:
            name: Queue name.

        Returns:
            QueueStatistics or None if not found.
        """
        queue = self.get_queue(name)
        return queue.get_stats() if queue else None

    async def flush_all(self) -> None:
        """Flush all queues."""
        tasks = [
            queue_info.queue.flush()
            for queue_info in self._queues.values()
        ]
        await asyncio.gather(*tasks)

    async def shutdown(self) -> None:
        """Shutdown the queue manager."""
        await self.stop()

        # Shutdown all queues
        tasks = [
            queue_info.queue.shutdown()
            for queue_info in self._queues.values()
        ]
        await asyncio.gather(*tasks)

        self._queues.clear()
        self._routing_rules.clear()
        self._processing_handlers.clear()

    # Event callback registration

    def on_queue_created(
        self,
        callback: Callable[[str, EventQueue], None],
    ) -> None:
        """Register queue created callback."""
        self._on_queue_created.append(callback)

    def on_queue_destroyed(self, callback: Callable[[str], None]) -> None:
        """Register queue destroyed callback."""
        self._on_queue_destroyed.append(callback)

    def on_event_routed(
        self,
        callback: Callable[[BaseEvent, str], None],
    ) -> None:
        """Register event routed callback."""
        self._on_event_routed.append(callback)

    def on_batch_processed(
        self,
        callback: Callable[[list[BaseEvent], str], None],
    ) -> None:
        """Register batch processed callback."""
        self._on_batch_processed.append(callback)

    def on_error(
        self,
        callback: Callable[[Exception, str | None], None],
    ) -> None:
        """Register error callback."""
        self._on_error.append(callback)

    def on_stats_update(
        self,
        callback: Callable[[dict[str, QueueStatistics]], None],
    ) -> None:
        """Register stats update callback."""
        self._on_stats_update.append(callback)

    # Private methods

    def _create_default_queues(self) -> None:
        """Create default system queues."""
        # Default queue
        self.create_queue(
            "default",
            QueueOptions(
                max_size=5000,
                batch_size=50,
                flush_interval=1.0,
            ),
        )

        # Priority queue
        self.create_queue(
            "priority",
            QueueOptions(
                max_size=1000,
                batch_size=10,
                flush_interval=0.1,
                priority_levels=10,
            ),
        )

        # Batch processing queue
        self.create_queue(
            "batch",
            QueueOptions(
                max_size=10000,
                batch_size=500,
                flush_interval=5.0,
            ),
        )

        # Failed events queue
        self.create_queue(
            "failed",
            QueueOptions(
                max_size=1000,
                batch_size=10,
                flush_interval=10.0,
                retry_attempts=5,
                retry_delay=5.0,
            ),
        )

    def _setup_auto_routing(self) -> None:
        """Setup automatic routing rules."""
        # Critical/error events go to priority queue
        self.add_routing_rule(
            RoutingRule(
                name="critical-events",
                predicate=lambda e: e.severity in ("critical", "error"),
                queue_name="priority",
                priority=100,
            )
        )

        # File events go to batch queue
        self.add_routing_rule(
            RoutingRule(
                name="file-events",
                predicate=lambda e: e.category == EventCategory.FILE.value or e.category == EventCategory.FILE,
                queue_name="batch",
                priority=50,
            )
        )

        # Git events go to priority queue
        self.add_routing_rule(
            RoutingRule(
                name="git-events",
                predicate=lambda e: e.category == EventCategory.GIT.value or e.category == EventCategory.GIT,
                queue_name="priority",
                priority=60,
            )
        )

    async def _handle_batch_process(
        self,
        queue_name: str,
        events: list[BaseEvent],
    ) -> Coroutine[Any, Any, None]:
        """Handle batch processing for a queue."""
        handler = self._processing_handlers.get(queue_name)

        if handler:
            try:
                await handler(events)
                self._emit_batch_processed(events, queue_name)
            except Exception as e:
                self._emit_error(e, queue_name)

                # Move failed events to failed queue
                failed_queue = self.get_queue("failed")
                if failed_queue and queue_name != "failed":
                    for event in events:
                        await failed_queue.enqueue(event)
        else:
            # No handler, just emit completion
            self._emit_batch_processed(events, queue_name)

    def _emit_event_routed(self, event: BaseEvent, queue_name: str) -> None:
        """Emit event routed notification."""
        for callback in self._on_event_routed:
            try:
                callback(event, queue_name)
            except Exception:
                pass

    def _emit_batch_processed(
        self,
        events: list[BaseEvent],
        queue_name: str,
    ) -> None:
        """Emit batch processed notification."""
        for callback in self._on_batch_processed:
            try:
                callback(events, queue_name)
            except Exception:
                pass

    def _emit_error(self, error: Exception, queue_name: str | None) -> None:
        """Emit error notification."""
        for callback in self._on_error:
            try:
                callback(error, queue_name)
            except Exception:
                pass

    async def _metrics_loop(self) -> None:
        """Metrics collection loop."""
        while self._running:
            await asyncio.sleep(self.options.metrics_interval)
            stats = self.get_all_stats()
            for callback in self._on_stats_update:
                try:
                    callback(stats)
                except Exception:
                    pass


# Singleton accessor function
def get_queue_manager() -> QueueManager:
    """
    Get the singleton QueueManager instance.

    Returns:
        QueueManager singleton instance.
    """
    return QueueManager.get_instance()


# Default singleton instance
queue_manager = QueueManager.get_instance()
