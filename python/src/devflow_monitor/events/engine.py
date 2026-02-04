"""
Event Engine.

Central event bus and event processing system. Provides pub/sub
functionality with pattern matching, priority-based subscription,
and async event processing.
"""

from __future__ import annotations

import asyncio
import re
from collections import deque
from datetime import datetime
from typing import Any, Callable, Coroutine
from uuid import uuid4

from .types import (
    BaseEvent,
    EventBatch,
    EventCategory,
    EventFilter,
    EventPublishOptions,
    EventSeverity,
    EventStatistics,
    EventSubscriptionOptions,
)


# Type alias for event handlers
EventHandlerType = Callable[[BaseEvent], Coroutine[Any, Any, None] | None]


class EventSubscriber:
    """Event subscriber information."""

    def __init__(
        self,
        subscriber_id: str,
        pattern: str | re.Pattern[str],
        handler: EventHandlerType,
        options: EventSubscriptionOptions,
    ):
        """
        Initialize event subscriber.

        Args:
            subscriber_id: Unique subscriber identifier.
            pattern: Event type pattern (string or regex).
            handler: Event handler function.
            options: Subscription options.
        """
        self.id = subscriber_id
        self.pattern = pattern
        self.handler = handler
        self.options = options
        self.created_at = datetime.utcnow()

    def matches(self, event_type: str) -> bool:
        """
        Check if event type matches this subscriber's pattern.

        Args:
            event_type: Event type string to match.

        Returns:
            True if pattern matches, False otherwise.
        """
        if isinstance(self.pattern, re.Pattern):
            return bool(self.pattern.match(event_type))
        elif self.pattern == "*":
            return True
        else:
            return self.pattern == event_type


class EventStats:
    """Event statistics tracking."""

    def __init__(self):
        """Initialize event statistics."""
        self.total_events = 0
        self.events_by_category: dict[str, int] = {}
        self.events_by_severity: dict[str, int] = {}
        self.events_per_hour: list[int] = [0] * 24
        self.last_event_time: datetime | None = None

        # Initialize category counts
        for category in EventCategory:
            self.events_by_category[category.value] = 0

        # Initialize severity counts
        for severity in EventSeverity:
            self.events_by_severity[severity.value] = 0


class EventEngine:
    """
    Event Engine class.

    Central event bus for publishing and subscribing to events.
    Supports pattern matching, priority-based subscription,
    and async event processing.

    Attributes:
        max_history: Maximum number of events to keep in history.
    """

    _instance: EventEngine | None = None

    def __init__(self, max_history: int = 10000):
        """
        Initialize event engine.

        Args:
            max_history: Maximum number of events to keep in history.
        """
        self._subscribers: dict[str, list[EventSubscriber]] = {}
        self._event_history: deque[BaseEvent] = deque(maxlen=max_history)
        self._stats = EventStats()
        self._transformers: dict[str, list[Callable]] = {}
        self._global_filters: list[EventFilter] = []
        self._listeners: dict[str, list[EventHandlerType]] = {}
        self._queue_manager: Any = None
        self._use_queue_manager = False
        self._max_history = max_history

    @classmethod
    def get_instance(cls) -> EventEngine:
        """
        Get singleton instance of EventEngine.

        Returns:
            EventEngine singleton instance.
        """
        if cls._instance is None:
            cls._instance = EventEngine()
        return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        """Reset the singleton instance (useful for testing)."""
        cls._instance = None

    def subscribe(
        self,
        pattern: str | re.Pattern[str],
        handler: EventHandlerType,
        options: EventSubscriptionOptions | None = None,
    ) -> str:
        """
        Subscribe to events matching a pattern.

        Args:
            pattern: Event type pattern (string, regex, or "*" for all).
            handler: Event handler function.
            options: Subscription options.

        Returns:
            Subscription ID for later unsubscription.
        """
        if options is None:
            options = EventSubscriptionOptions()

        subscriber_id = self._generate_subscriber_id()
        subscriber = EventSubscriber(subscriber_id, pattern, handler, options)

        # Get pattern key for storage
        key = pattern.pattern if isinstance(pattern, re.Pattern) else pattern

        if key not in self._subscribers:
            self._subscribers[key] = []

        # Insert by priority (higher priority first)
        subscribers = self._subscribers[key]
        priority = options.priority
        insert_index = len(subscribers)

        for i, sub in enumerate(subscribers):
            if sub.options.priority < priority:
                insert_index = i
                break

        subscribers.insert(insert_index, subscriber)

        return subscriber_id

    def unsubscribe(self, subscriber_id: str) -> bool:
        """
        Unsubscribe from events.

        Args:
            subscriber_id: Subscription ID returned from subscribe().

        Returns:
            True if successfully unsubscribed, False otherwise.
        """
        for key, subscribers in list(self._subscribers.items()):
            for i, sub in enumerate(subscribers):
                if sub.id == subscriber_id:
                    subscribers.pop(i)
                    if not subscribers:
                        del self._subscribers[key]
                    return True
        return False

    def on(self, event_type: str, handler: EventHandlerType) -> str:
        """
        Register an event listener (convenience method).

        Args:
            event_type: Event type to listen for.
            handler: Event handler function.

        Returns:
            Subscription ID.
        """
        return self.subscribe(event_type, handler)

    def off(self, subscriber_id: str) -> bool:
        """
        Remove an event listener (convenience method).

        Args:
            subscriber_id: Subscription ID.

        Returns:
            True if removed, False otherwise.
        """
        return self.unsubscribe(subscriber_id)

    async def publish(
        self,
        event: BaseEvent,
        options: EventPublishOptions | None = None,
    ) -> None:
        """
        Publish an event to all matching subscribers.

        Args:
            event: Event to publish.
            options: Publish options.
        """
        if options is None:
            options = EventPublishOptions()

        # Update statistics
        self._update_statistics(event)

        # Apply global filters
        if not self._apply_global_filters(event):
            return

        # Apply transformers
        transformed_event = await self._apply_transformers(event)

        # Add to history
        self._event_history.append(transformed_event)

        # Route to queue manager if enabled
        if self._use_queue_manager and self._queue_manager and options.use_queue:
            routed = await self._queue_manager.route_event(transformed_event)
            if routed:
                await self._emit("event:queued", transformed_event)
                return

        # Process subscribers
        await self._process_event_subscribers(transformed_event)

        # Emit published event
        await self._emit("event:published", transformed_event)

    async def publish_batch(
        self,
        batch: EventBatch,
        options: EventPublishOptions | None = None,
    ) -> None:
        """
        Publish a batch of events.

        Args:
            batch: Event batch to publish.
            options: Publish options.
        """
        for event in batch.events:
            await self.publish(event, options)

    def register_transformer(
        self,
        pattern: str | re.Pattern[str],
        transformer: Callable[[BaseEvent], BaseEvent | Coroutine[Any, Any, BaseEvent]],
    ) -> None:
        """
        Register an event transformer.

        Args:
            pattern: Event type pattern.
            transformer: Transformer function.
        """
        key = pattern.pattern if isinstance(pattern, re.Pattern) else pattern
        if key not in self._transformers:
            self._transformers[key] = []
        self._transformers[key].append(transformer)

    def add_global_filter(self, filter_func: EventFilter) -> None:
        """
        Add a global event filter.

        Args:
            filter_func: Filter function that returns True to allow event.
        """
        self._global_filters.append(filter_func)

    def remove_global_filter(self, filter_func: EventFilter) -> bool:
        """
        Remove a global event filter.

        Args:
            filter_func: Filter function to remove.

        Returns:
            True if removed, False otherwise.
        """
        try:
            self._global_filters.remove(filter_func)
            return True
        except ValueError:
            return False

    def get_statistics(self) -> EventStatistics:
        """
        Get event statistics.

        Returns:
            Current event statistics.
        """
        return EventStatistics(
            total_events=self._stats.total_events,
            events_by_category=self._stats.events_by_category.copy(),
            events_by_severity=self._stats.events_by_severity.copy(),
            events_per_hour=self._calculate_events_per_hour(),
            last_event_time=self._stats.last_event_time,
        )

    def get_history(self, limit: int | None = None) -> list[BaseEvent]:
        """
        Get event history.

        Args:
            limit: Maximum number of events to return.

        Returns:
            List of recent events.
        """
        if limit is None:
            return list(self._event_history)
        return list(self._event_history)[-limit:]

    def get_queue_size(self) -> int:
        """Get the size of the event history."""
        return len(self._event_history)

    def get_subscriber_count(self) -> int:
        """Get the total number of subscribers."""
        count = 0
        for subscribers in self._subscribers.values():
            count += len(subscribers)
        return count

    def clear_history(self) -> None:
        """Clear event history."""
        self._event_history.clear()

    def clear_all_subscriptions(self) -> None:
        """Clear all subscriptions."""
        self._subscribers.clear()
        self._listeners.clear()

    def get_stats(self) -> dict[str, Any]:
        """
        Get detailed statistics.

        Returns:
            Dictionary with detailed statistics.
        """
        return {
            "total_events": self._stats.total_events,
            "last_event_time": self._stats.last_event_time,
            "events_by_category": self._stats.events_by_category,
            "events_by_severity": self._stats.events_by_severity,
            "events_per_hour": self._stats.events_per_hour,
            "subscriber_count": self.get_subscriber_count(),
            "transformer_count": sum(len(t) for t in self._transformers.values()),
            "global_filter_count": len(self._global_filters),
            "history_size": len(self._event_history),
        }

    async def set_use_queue_manager(self, enabled: bool) -> None:
        """
        Enable or disable queue manager integration.

        Args:
            enabled: Whether to use queue manager.
        """
        self._use_queue_manager = enabled
        if enabled and self._queue_manager is None:
            await self._setup_queue_manager_integration()

    def get_queue_manager(self) -> Any:
        """Get the queue manager instance."""
        return self._queue_manager

    # Private methods

    def _generate_subscriber_id(self) -> str:
        """Generate a unique subscriber ID."""
        return f"sub-{uuid4().hex[:12]}"

    def _update_statistics(self, event: BaseEvent) -> None:
        """Update event statistics."""
        self._stats.total_events += 1
        self._stats.last_event_time = datetime.utcnow()

        # Category count
        category = event.category
        if isinstance(category, EventCategory):
            category = category.value
        self._stats.events_by_category[category] = (
            self._stats.events_by_category.get(category, 0) + 1
        )

        # Severity count
        severity = event.severity
        if isinstance(severity, EventSeverity):
            severity = severity.value
        self._stats.events_by_severity[severity] = (
            self._stats.events_by_severity.get(severity, 0) + 1
        )

        # Hourly count
        hour = datetime.utcnow().hour
        self._stats.events_per_hour[hour] += 1

    def _apply_global_filters(self, event: BaseEvent) -> bool:
        """Apply global filters to event."""
        for filter_func in self._global_filters:
            if not filter_func(event):
                return False
        return True

    async def _apply_transformers(self, event: BaseEvent) -> BaseEvent:
        """Apply transformers to event."""
        transformed = event

        # Exact type match transformers
        if event.type in self._transformers:
            for transformer in self._transformers[event.type]:
                result = transformer(transformed)
                if asyncio.iscoroutine(result):
                    transformed = await result
                else:
                    transformed = result

        # Regex pattern transformers
        for pattern, transformers in self._transformers.items():
            if pattern != event.type:
                try:
                    regex = re.compile(pattern)
                    if regex.match(event.type):
                        for transformer in transformers:
                            result = transformer(transformed)
                            if asyncio.iscoroutine(result):
                                transformed = await result
                            else:
                                transformed = result
                except re.error:
                    pass

        return transformed

    async def _process_event_subscribers(self, event: BaseEvent) -> None:
        """Process all matching subscribers for an event."""
        all_subscribers: list[EventSubscriber] = []

        # Find all matching subscribers
        for key, subscribers in self._subscribers.items():
            for sub in subscribers:
                if sub.matches(event.type):
                    all_subscribers.append(sub)

        # Sort by priority (higher first)
        all_subscribers.sort(key=lambda s: s.options.priority, reverse=True)

        # Execute handlers
        for subscriber in all_subscribers:
            try:
                # Apply subscriber filter
                if subscriber.options.filter and not subscriber.options.filter(event):
                    continue

                # Execute handler
                result = subscriber.handler(event)
                if asyncio.iscoroutine(result):
                    await result

                # Remove if once
                if subscriber.options.once:
                    self.unsubscribe(subscriber.id)

            except Exception as e:
                # Create error event
                error_event = BaseEvent(
                    type="system:error",
                    category=EventCategory.SYSTEM,
                    severity=EventSeverity.ERROR,
                    source="EventEngine",
                    data={
                        "original_event_id": event.id,
                        "subscriber_id": subscriber.id,
                        "error": str(e),
                    },
                )
                await self._emit("event:error", error_event)

    async def _emit(self, event_type: str, event: BaseEvent) -> None:
        """Emit an internal event."""
        if event_type in self._listeners:
            for handler in self._listeners[event_type]:
                try:
                    result = handler(event)
                    if asyncio.iscoroutine(result):
                        await result
                except Exception:
                    pass  # Silently ignore internal event errors

    def _calculate_events_per_hour(self) -> float:
        """Calculate average events per hour."""
        total = sum(self._stats.events_per_hour)
        return total / 24.0

    async def _setup_queue_manager_integration(self) -> None:
        """Set up queue manager integration."""
        try:
            from .queue_manager import get_queue_manager

            self._queue_manager = get_queue_manager()

            # Register default processors
            self._queue_manager.register_processor(
                "default",
                self._process_queued_events,
            )
            self._queue_manager.register_processor(
                "priority",
                self._process_queued_events,
            )
            self._queue_manager.register_processor(
                "batch",
                self._process_batch_events,
            )
            self._queue_manager.register_processor(
                "failed",
                self._process_failed_events,
            )

        except ImportError:
            self._use_queue_manager = False

    async def _process_queued_events(self, events: list[BaseEvent]) -> None:
        """Process events from queue."""
        for event in events:
            await self._process_event_subscribers(event)

    async def _process_batch_events(self, events: list[BaseEvent]) -> None:
        """Process batch events."""
        # Group by type for batch processing
        events_by_type: dict[str, list[BaseEvent]] = {}
        for event in events:
            if event.type not in events_by_type:
                events_by_type[event.type] = []
            events_by_type[event.type].append(event)

        # Process each type group
        for event_list in events_by_type.values():
            for event in event_list:
                await self._process_event_subscribers(event)

    async def _process_failed_events(self, events: list[BaseEvent]) -> None:
        """Process failed events with retry logic."""
        for event in events:
            try:
                await self._process_event_subscribers(event)
            except Exception as e:
                # Log error but don't re-raise
                print(f"Failed to reprocess event {event.id}: {e}")


# Singleton accessor function
def get_event_engine() -> EventEngine:
    """
    Get the singleton EventEngine instance.

    Returns:
        EventEngine singleton instance.
    """
    return EventEngine.get_instance()


# Default singleton instance
event_engine = EventEngine.get_instance()
