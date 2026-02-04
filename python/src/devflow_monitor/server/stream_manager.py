"""
Real-time Event Stream Manager.

Handles event filtering, buffering, routing, and rate limiting
for the DevFlow Monitor event streaming system.
"""

from __future__ import annotations

import asyncio
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Callable, Coroutine
from uuid import uuid4

from ..events.engine import event_engine, EventEngine
from ..events.types import BaseEvent


# Type alias for event callbacks
EventCallback = Callable[[BaseEvent], Coroutine[Any, Any, None] | None]


@dataclass
class StreamFilter:
    """
    Stream filter conditions.

    Attributes:
        categories: List of allowed event categories.
        severities: List of allowed event severities.
        sources: List of allowed event sources.
        time_window: Minimum time between events in milliseconds.
        rate_limit: Maximum events per second.
    """

    categories: list[str] = field(default_factory=list)
    severities: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)
    time_window: int | None = None  # Milliseconds
    rate_limit: int | None = None  # Events per second


@dataclass
class StreamSubscriber:
    """
    Stream subscriber information.

    Attributes:
        id: Unique subscriber identifier.
        callback: Event callback function.
        filter: Stream filter conditions.
        last_event_time: Timestamp of last delivered event.
        event_count: Total events delivered to this subscriber.
        rate_limit_buffer: Timestamps for rate limiting.
    """

    id: str
    callback: EventCallback
    filter: StreamFilter = field(default_factory=StreamFilter)
    last_event_time: float = 0
    event_count: int = 0
    rate_limit_buffer: list[float] = field(default_factory=list)


@dataclass
class BufferedEvent:
    """
    Buffered event structure.

    Attributes:
        event: The base event.
        timestamp: Buffer timestamp.
        processed: Whether the event has been processed.
    """

    event: BaseEvent
    timestamp: float
    processed: bool = False


@dataclass
class StreamStats:
    """
    Stream statistics.

    Attributes:
        total_subscribers: Number of active subscribers.
        total_events: Total events processed.
        events_per_second: Average events per second.
        buffered_events: Number of events in buffer.
        dropped_events: Number of dropped events.
        uptime: Server uptime in seconds.
    """

    total_subscribers: int
    total_events: int
    events_per_second: float
    buffered_events: int
    dropped_events: int
    uptime: float


class EventStreamManager:
    """
    Real-time Event Stream Manager.

    Manages event subscriptions, filtering, buffering, and distribution
    for real-time event streaming.

    Attributes:
        buffer_size: Maximum number of events to buffer.
    """

    _instance: EventStreamManager | None = None

    def __init__(self, buffer_size: int = 1000):
        """
        Initialize Event Stream Manager.

        Args:
            buffer_size: Maximum number of events to keep in buffer.
        """
        self._subscribers: dict[str, StreamSubscriber] = {}
        self._event_buffer: deque[BufferedEvent] = deque(maxlen=buffer_size)
        self._buffer_size = buffer_size
        self._stats = {
            "total_events": 0,
            "dropped_events": 0,
            "start_time": time.time(),
        }
        self._cleanup_task: asyncio.Task | None = None
        self._event_subscription_id: str | None = None
        self._initialized = False
        self._event_engine: EventEngine = event_engine
        self._listeners: dict[str, list[EventCallback]] = {}

        # Set up event listeners
        self._setup_event_listeners()
        self._start_cleanup_timer()

    @classmethod
    def get_instance(cls) -> EventStreamManager:
        """
        Get singleton instance of EventStreamManager.

        Returns:
            EventStreamManager singleton instance.
        """
        if cls._instance is None:
            cls._instance = EventStreamManager()
        return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        """Reset the singleton instance (useful for testing)."""
        if cls._instance:
            asyncio.create_task(cls._instance.destroy())
        cls._instance = None

    def is_initialized(self) -> bool:
        """Check if manager is initialized."""
        return self._initialized

    def initialize(self, engine: EventEngine | None = None) -> None:
        """
        Initialize with event engine.

        Args:
            engine: Optional event engine instance.
        """
        if self._initialized:
            return

        if engine:
            self._event_engine = engine

        # Unsubscribe existing subscription
        if self._event_subscription_id:
            self._event_engine.unsubscribe(self._event_subscription_id)

        # Set up new subscription
        self._event_subscription_id = self._event_engine.subscribe(
            "*",
            self._process_event,
        )

        self._initialized = True

    def subscribe(
        self,
        subscriber_id: str,
        callback: EventCallback,
        filter_config: StreamFilter | None = None,
    ) -> None:
        """
        Subscribe to event stream.

        Args:
            subscriber_id: Unique subscriber identifier.
            callback: Event callback function.
            filter_config: Optional stream filter configuration.
        """
        subscriber = StreamSubscriber(
            id=subscriber_id,
            callback=callback,
            filter=filter_config or StreamFilter(),
            last_event_time=0,
            event_count=0,
            rate_limit_buffer=[],
        )

        self._subscribers[subscriber_id] = subscriber
        self._emit("subscriber_added", {"id": subscriber_id, "filter": filter_config})

    def unsubscribe(self, subscriber_id: str) -> bool:
        """
        Unsubscribe from event stream.

        Args:
            subscriber_id: Subscriber identifier.

        Returns:
            True if successfully unsubscribed, False otherwise.
        """
        if subscriber_id in self._subscribers:
            del self._subscribers[subscriber_id]
            self._emit("subscriber_removed", {"id": subscriber_id})
            return True
        return False

    def update_filter(
        self, subscriber_id: str, filter_config: StreamFilter
    ) -> bool:
        """
        Update subscriber filter.

        Args:
            subscriber_id: Subscriber identifier.
            filter_config: New filter configuration.

        Returns:
            True if filter updated, False if subscriber not found.
        """
        subscriber = self._subscribers.get(subscriber_id)
        if subscriber:
            subscriber.filter = filter_config
            self._emit("filter_updated", {"id": subscriber_id, "filter": filter_config})
            return True
        return False

    def _setup_event_listeners(self) -> None:
        """Set up event engine listeners."""
        self._event_subscription_id = self._event_engine.subscribe(
            "*",
            self._process_event,
        )

    async def _process_event(self, event: BaseEvent) -> None:
        """
        Process incoming event.

        Args:
            event: Event to process.
        """
        self._stats["total_events"] += 1

        # Add to buffer
        self._add_to_buffer(event)

        # Distribute to subscribers
        await self._distribute_event(event)

        self._emit("event_processed", event)

    def _add_to_buffer(self, event: BaseEvent) -> None:
        """
        Add event to buffer.

        Args:
            event: Event to buffer.
        """
        buffered = BufferedEvent(
            event=event,
            timestamp=time.time(),
            processed=False,
        )

        # Check if buffer is full
        if len(self._event_buffer) >= self._buffer_size:
            oldest = self._event_buffer[0]
            if not oldest.processed:
                self._stats["dropped_events"] += 1

        self._event_buffer.append(buffered)

    async def _distribute_event(self, event: BaseEvent) -> None:
        """
        Distribute event to all matching subscribers.

        Args:
            event: Event to distribute.
        """
        tasks = []
        for subscriber in self._subscribers.values():
            if self._should_deliver_event(subscriber, event):
                tasks.append(self._deliver_event(subscriber, event))

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _deliver_event(
        self, subscriber: StreamSubscriber, event: BaseEvent
    ) -> None:
        """
        Deliver event to subscriber.

        Args:
            subscriber: Target subscriber.
            event: Event to deliver.
        """
        try:
            result = subscriber.callback(event)
            if asyncio.iscoroutine(result):
                await result

            subscriber.event_count += 1
            subscriber.last_event_time = time.time()
            self._mark_event_as_processed(event)

        except Exception as e:
            print(f"[StreamManager] Error delivering event to {subscriber.id}: {e}")
            self._emit(
                "delivery_error",
                {"subscriberId": subscriber.id, "error": str(e), "event": event},
            )

    def _should_deliver_event(
        self, subscriber: StreamSubscriber, event: BaseEvent
    ) -> bool:
        """
        Determine if event should be delivered to subscriber.

        Args:
            subscriber: Target subscriber.
            event: Event to check.

        Returns:
            True if event should be delivered, False otherwise.
        """
        filter_config = subscriber.filter

        # Category filter
        if filter_config.categories:
            event_category = (
                event.category.value
                if hasattr(event.category, "value")
                else str(event.category)
            )
            if event_category not in filter_config.categories:
                return False

        # Severity filter
        if filter_config.severities:
            event_severity = (
                event.severity.value
                if hasattr(event.severity, "value")
                else str(event.severity)
            )
            if event_severity not in filter_config.severities:
                return False

        # Source filter
        if filter_config.sources:
            if event.source not in filter_config.sources:
                return False

        # Time window filter
        if filter_config.time_window:
            time_since_last = (time.time() - subscriber.last_event_time) * 1000
            if time_since_last < filter_config.time_window:
                return False

        # Rate limiting
        if filter_config.rate_limit:
            if not self._check_rate_limit(subscriber, filter_config.rate_limit):
                return False

        return True

    def _check_rate_limit(
        self, subscriber: StreamSubscriber, rate_limit: int
    ) -> bool:
        """
        Check rate limit for subscriber.

        Args:
            subscriber: Subscriber to check.
            rate_limit: Maximum events per second.

        Returns:
            True if under rate limit, False otherwise.
        """
        now = time.time()
        one_second_ago = now - 1.0

        # Keep only timestamps from the last second
        subscriber.rate_limit_buffer = [
            ts for ts in subscriber.rate_limit_buffer if ts > one_second_ago
        ]

        # Check rate limit
        if len(subscriber.rate_limit_buffer) >= rate_limit:
            return False

        # Add current timestamp
        subscriber.rate_limit_buffer.append(now)
        return True

    def _mark_event_as_processed(self, event: BaseEvent) -> None:
        """
        Mark event as processed in buffer.

        Args:
            event: Event to mark.
        """
        for buffered in self._event_buffer:
            if buffered.event.id == event.id and not buffered.processed:
                buffered.processed = True
                break

    def _start_cleanup_timer(self) -> None:
        """Start the cleanup timer."""

        async def cleanup_loop():
            while True:
                await asyncio.sleep(60)  # Cleanup every minute
                self._cleanup()

        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                self._cleanup_task = asyncio.create_task(cleanup_loop())
            else:
                # Schedule for later when loop starts
                pass
        except RuntimeError:
            # No event loop yet
            pass

    def _cleanup(self) -> None:
        """Clean up old data."""
        now = time.time()
        fifteen_minutes_ago = now - (15 * 60)

        # Remove old buffer events
        original_length = len(self._event_buffer)
        filtered = [
            be for be in self._event_buffer if be.timestamp > fifteen_minutes_ago
        ]
        self._event_buffer.clear()
        self._event_buffer.extend(filtered)

        removed = original_length - len(self._event_buffer)
        if removed > 0:
            pass  # Optionally log cleanup

        # Clean up subscriber rate limit buffers
        for subscriber in self._subscribers.values():
            subscriber.rate_limit_buffer = [
                ts for ts in subscriber.rate_limit_buffer if ts > now - 1.0
            ]

        self._emit("cleanup_completed", {"removedEvents": removed})

    def get_stats(self) -> StreamStats:
        """
        Get stream statistics.

        Returns:
            Current stream statistics.
        """
        now = time.time()
        uptime = now - self._stats["start_time"]
        events_per_second = (
            self._stats["total_events"] / uptime if uptime > 0 else 0.0
        )

        return StreamStats(
            total_subscribers=len(self._subscribers),
            total_events=self._stats["total_events"],
            events_per_second=round(events_per_second, 2),
            buffered_events=len(self._event_buffer),
            dropped_events=self._stats["dropped_events"],
            uptime=round(uptime),
        )

    def get_subscribers(self) -> list[dict[str, Any]]:
        """
        Get subscriber information.

        Returns:
            List of subscriber information dictionaries.
        """
        return [
            {
                "id": sub.id,
                "filter": {
                    "categories": sub.filter.categories,
                    "severities": sub.filter.severities,
                    "sources": sub.filter.sources,
                    "timeWindow": sub.filter.time_window,
                    "rateLimit": sub.filter.rate_limit,
                },
                "eventCount": sub.event_count,
                "lastEventTime": sub.last_event_time,
            }
            for sub in self._subscribers.values()
        ]

    def get_buffered_events(self, limit: int = 50) -> list[BaseEvent]:
        """
        Get buffered events.

        Args:
            limit: Maximum number of events to return.

        Returns:
            List of buffered events.
        """
        events = list(self._event_buffer)[-limit:]
        return [be.event for be in events]

    async def replay_events(
        self, subscriber_id: str, from_timestamp: float | None = None
    ) -> bool:
        """
        Replay events to a subscriber.

        Args:
            subscriber_id: Target subscriber ID.
            from_timestamp: Start timestamp (defaults to 1 minute ago).

        Returns:
            True if replay successful, False if subscriber not found.
        """
        subscriber = self._subscribers.get(subscriber_id)
        if not subscriber:
            return False

        from_time = from_timestamp or (time.time() - 60)

        events_to_replay = [
            be.event
            for be in self._event_buffer
            if be.timestamp >= from_time
        ]

        for event in events_to_replay:
            if self._should_deliver_event(subscriber, event):
                try:
                    result = subscriber.callback(event)
                    if asyncio.iscoroutine(result):
                        await result
                except Exception as e:
                    print(f"[StreamManager] Error replaying event to {subscriber_id}: {e}")

        self._emit(
            "events_replayed",
            {"subscriberId": subscriber_id, "eventCount": len(events_to_replay)},
        )
        return True

    def emit_system_event(self, event_type: str, data: Any) -> None:
        """
        Emit a system event.

        Args:
            event_type: Event type string.
            data: Event data.
        """
        system_event = {
            "type": f"stream:{event_type}",
            "timestamp": time.time(),
            "data": data,
        }
        self._emit("system_event", system_event)

    def _emit(self, event_type: str, data: Any) -> None:
        """
        Emit internal event.

        Args:
            event_type: Event type.
            data: Event data.
        """
        if event_type in self._listeners:
            for listener in self._listeners[event_type]:
                try:
                    result = listener(data)
                    if asyncio.iscoroutine(result):
                        asyncio.create_task(result)
                except Exception:
                    pass

    def on(self, event_type: str, callback: EventCallback) -> None:
        """
        Register internal event listener.

        Args:
            event_type: Event type to listen for.
            callback: Callback function.
        """
        if event_type not in self._listeners:
            self._listeners[event_type] = []
        self._listeners[event_type].append(callback)

    def off(self, event_type: str, callback: EventCallback) -> bool:
        """
        Remove internal event listener.

        Args:
            event_type: Event type.
            callback: Callback to remove.

        Returns:
            True if removed, False otherwise.
        """
        if event_type in self._listeners:
            try:
                self._listeners[event_type].remove(callback)
                return True
            except ValueError:
                pass
        return False

    async def destroy(self) -> None:
        """Clean up and destroy the stream manager."""
        # Cancel cleanup task
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
            self._cleanup_task = None

        # Unsubscribe from event engine
        if self._event_subscription_id:
            self._event_engine.unsubscribe(self._event_subscription_id)
            self._event_subscription_id = None

        # Clear all data
        self._subscribers.clear()
        self._event_buffer.clear()
        self._listeners.clear()
        self._initialized = False


# Global stream manager instance
stream_manager = EventStreamManager.get_instance()


def get_stream_manager() -> EventStreamManager:
    """
    Get the global stream manager instance.

    Returns:
        EventStreamManager singleton instance.
    """
    return stream_manager
