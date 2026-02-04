"""
Unit tests for the events module.

Tests cover event creation, serialization, event engine subscription,
event publishing, pattern matching, and queue priority handling.
"""

from __future__ import annotations

import asyncio
import re
from datetime import datetime
from typing import Any
from unittest.mock import AsyncMock

import pytest

from devflow_monitor.events.engine import EventEngine, EventSubscriber
from devflow_monitor.events.queue import EventQueue, QueueOptions
from devflow_monitor.events.types.base import (
    BaseEvent,
    EventBatch,
    EventCategory,
    EventMetadata,
    EventPublishOptions,
    EventSeverity,
    EventSubscriptionOptions,
)


class TestEventCreation:
    """Tests for event creation and initialization."""

    def test_event_creation_with_defaults(self) -> None:
        """Test creating an event with default values."""
        event = BaseEvent(
            type="test:event",
            category=EventCategory.SYSTEM,
            source="test",
        )

        assert event.type == "test:event"
        assert event.category == EventCategory.SYSTEM
        assert event.source == "test"
        assert event.severity == EventSeverity.INFO
        assert event.id is not None
        assert isinstance(event.timestamp, datetime)

    def test_event_creation_with_all_fields(self) -> None:
        """Test creating an event with all fields specified."""
        metadata = EventMetadata(
            environment="test",
            user_id="user123",
            session_id="session456",
            tags=["test", "unit"],
        )

        event = BaseEvent(
            type="test:complete_event",
            category=EventCategory.FILE,
            severity=EventSeverity.WARNING,
            source="test_source",
            data={"key": "value", "count": 42},
            metadata=metadata,
            correlation_id="corr123",
            parent_id="parent456",
        )

        assert event.type == "test:complete_event"
        assert event.category == EventCategory.FILE
        assert event.severity == EventSeverity.WARNING
        assert event.source == "test_source"
        assert event.data == {"key": "value", "count": 42}
        assert event.metadata is not None
        assert event.metadata.environment == "test"
        assert event.correlation_id == "corr123"
        assert event.parent_id == "parent456"

    def test_event_id_is_unique(self) -> None:
        """Test that each event gets a unique ID."""
        event1 = BaseEvent(
            type="test:event",
            category=EventCategory.SYSTEM,
            source="test",
        )
        event2 = BaseEvent(
            type="test:event",
            category=EventCategory.SYSTEM,
            source="test",
        )

        assert event1.id != event2.id

    def test_event_timestamp_is_set(self) -> None:
        """Test that timestamp is automatically set."""
        before = datetime.utcnow()
        event = BaseEvent(
            type="test:event",
            category=EventCategory.SYSTEM,
            source="test",
        )
        after = datetime.utcnow()

        assert before <= event.timestamp <= after


class TestEventSerialization:
    """Tests for event serialization and deserialization."""

    def test_event_serialization_to_dict(self) -> None:
        """Test serializing an event to a dictionary."""
        event = BaseEvent(
            type="test:serialize",
            category=EventCategory.GIT,
            severity=EventSeverity.INFO,
            source="test",
            data={"message": "hello"},
        )

        data = event.model_dump()

        assert data["type"] == "test:serialize"
        assert data["category"] == "git"
        assert data["severity"] == "info"
        assert data["source"] == "test"
        assert data["data"]["message"] == "hello"

    def test_event_serialization_to_json(self) -> None:
        """Test serializing an event to JSON string."""
        event = BaseEvent(
            type="test:json",
            category=EventCategory.BUILD,
            source="test",
            data={"status": "success"},
        )

        json_str = event.model_dump_json()

        assert '"type":"test:json"' in json_str
        assert '"category":"build"' in json_str

    def test_event_deserialization_from_dict(self) -> None:
        """Test deserializing an event from a dictionary."""
        data = {
            "id": "test-id-123",
            "type": "test:deserialize",
            "category": "test",
            "severity": "warning",
            "source": "test",
            "data": {"key": "value"},
            "timestamp": datetime.utcnow().isoformat(),
        }

        event = BaseEvent(**data)

        assert event.id == "test-id-123"
        assert event.type == "test:deserialize"
        assert event.category == EventCategory.TEST

    def test_event_metadata_serialization(self) -> None:
        """Test that metadata serializes correctly."""
        metadata = EventMetadata(
            environment="production",
            user_id="user1",
            tags=["critical", "alert"],
        )
        event = BaseEvent(
            type="test:meta",
            category=EventCategory.SYSTEM,
            source="test",
            metadata=metadata,
        )

        data = event.model_dump()

        assert data["metadata"]["environment"] == "production"
        assert data["metadata"]["user_id"] == "user1"
        assert "critical" in data["metadata"]["tags"]


class TestEventEngineSubscribe:
    """Tests for event engine subscription functionality."""

    def test_subscribe_returns_id(self, event_engine: EventEngine) -> None:
        """Test that subscribing returns a subscription ID."""
        handler = AsyncMock()
        sub_id = event_engine.subscribe("test:event", handler)

        assert sub_id is not None
        assert sub_id.startswith("sub-")

    def test_subscribe_exact_pattern(self, event_engine: EventEngine) -> None:
        """Test subscribing to exact event type."""
        handler = AsyncMock()
        event_engine.subscribe("test:exact", handler)

        assert event_engine.get_subscriber_count() == 1

    def test_subscribe_wildcard_pattern(self, event_engine: EventEngine) -> None:
        """Test subscribing to all events with wildcard."""
        handler = AsyncMock()
        event_engine.subscribe("*", handler)

        assert event_engine.get_subscriber_count() == 1

    def test_subscribe_with_options(self, event_engine: EventEngine) -> None:
        """Test subscribing with custom options."""
        handler = AsyncMock()
        options = EventSubscriptionOptions(
            priority=10,
            once=True,
            async_handler=True,
        )
        sub_id = event_engine.subscribe("test:options", handler, options)

        assert sub_id is not None

    def test_unsubscribe_removes_handler(self, event_engine: EventEngine) -> None:
        """Test that unsubscribing removes the handler."""
        handler = AsyncMock()
        sub_id = event_engine.subscribe("test:unsub", handler)

        assert event_engine.get_subscriber_count() == 1

        result = event_engine.unsubscribe(sub_id)

        assert result is True
        assert event_engine.get_subscriber_count() == 0

    def test_unsubscribe_nonexistent_returns_false(
        self, event_engine: EventEngine
    ) -> None:
        """Test that unsubscribing a nonexistent ID returns False."""
        result = event_engine.unsubscribe("nonexistent-id")

        assert result is False

    def test_multiple_subscriptions(self, event_engine: EventEngine) -> None:
        """Test multiple handlers for same event type."""
        handler1 = AsyncMock()
        handler2 = AsyncMock()

        event_engine.subscribe("test:multi", handler1)
        event_engine.subscribe("test:multi", handler2)

        assert event_engine.get_subscriber_count() == 2


class TestEventEnginePublish:
    """Tests for event engine publishing functionality."""

    @pytest.mark.asyncio
    async def test_publish_calls_handler(self, event_engine: EventEngine) -> None:
        """Test that publishing an event calls the subscribed handler."""
        handler = AsyncMock()
        event_engine.subscribe("test:publish", handler)

        event = BaseEvent(
            type="test:publish",
            category=EventCategory.SYSTEM,
            source="test",
        )

        await event_engine.publish(event)

        handler.assert_called_once()
        call_arg = handler.call_args[0][0]
        assert call_arg.type == "test:publish"

    @pytest.mark.asyncio
    async def test_publish_adds_to_history(self, event_engine: EventEngine) -> None:
        """Test that published events are added to history."""
        event = BaseEvent(
            type="test:history",
            category=EventCategory.SYSTEM,
            source="test",
        )

        await event_engine.publish(event)

        history = event_engine.get_history()
        assert len(history) == 1
        assert history[0].type == "test:history"

    @pytest.mark.asyncio
    async def test_publish_updates_statistics(
        self, event_engine: EventEngine
    ) -> None:
        """Test that publishing updates statistics."""
        event = BaseEvent(
            type="test:stats",
            category=EventCategory.FILE,
            severity=EventSeverity.WARNING,
            source="test",
        )

        await event_engine.publish(event)

        stats = event_engine.get_statistics()
        assert stats.total_events == 1
        assert stats.events_by_category.get("file", 0) == 1
        assert stats.events_by_severity.get("warning", 0) == 1

    @pytest.mark.asyncio
    async def test_publish_batch(self, event_engine: EventEngine) -> None:
        """Test publishing a batch of events."""
        handler = AsyncMock()
        event_engine.subscribe("*", handler)

        events = [
            BaseEvent(
                type=f"test:batch_{i}",
                category=EventCategory.SYSTEM,
                source="test",
            )
            for i in range(5)
        ]
        batch = EventBatch(events=events)

        await event_engine.publish_batch(batch)

        assert handler.call_count == 5

    @pytest.mark.asyncio
    async def test_publish_with_filter(self, event_engine: EventEngine) -> None:
        """Test that global filters can block events."""

        def filter_func(event: BaseEvent) -> bool:
            return event.severity != EventSeverity.DEBUG

        event_engine.add_global_filter(filter_func)
        handler = AsyncMock()
        event_engine.subscribe("*", handler)

        debug_event = BaseEvent(
            type="test:filtered",
            category=EventCategory.SYSTEM,
            severity=EventSeverity.DEBUG,
            source="test",
        )
        info_event = BaseEvent(
            type="test:not_filtered",
            category=EventCategory.SYSTEM,
            severity=EventSeverity.INFO,
            source="test",
        )

        await event_engine.publish(debug_event)
        await event_engine.publish(info_event)

        # Only info event should reach handler
        assert handler.call_count == 1


class TestPatternMatching:
    """Tests for event type pattern matching."""

    def test_exact_match(self, event_engine: EventEngine) -> None:
        """Test exact pattern matching."""
        handler = AsyncMock()
        sub = EventSubscriber(
            subscriber_id="test-1",
            pattern="test:exact",
            handler=handler,
            options=EventSubscriptionOptions(),
        )

        assert sub.matches("test:exact") is True
        assert sub.matches("test:other") is False

    def test_wildcard_match(self, event_engine: EventEngine) -> None:
        """Test wildcard pattern matching."""
        handler = AsyncMock()
        sub = EventSubscriber(
            subscriber_id="test-2",
            pattern="*",
            handler=handler,
            options=EventSubscriptionOptions(),
        )

        assert sub.matches("test:anything") is True
        assert sub.matches("other:event") is True

    def test_regex_match(self, event_engine: EventEngine) -> None:
        """Test regex pattern matching."""
        handler = AsyncMock()
        pattern = re.compile(r"test:.*")
        sub = EventSubscriber(
            subscriber_id="test-3",
            pattern=pattern,
            handler=handler,
            options=EventSubscriptionOptions(),
        )

        assert sub.matches("test:event1") is True
        assert sub.matches("test:event2") is True
        assert sub.matches("other:event") is False


class TestEventQueuePriority:
    """Tests for event queue priority handling."""

    @pytest.mark.asyncio
    async def test_queue_enqueue(self, event_queue: EventQueue) -> None:
        """Test basic event enqueue."""
        event = BaseEvent(
            type="test:queue",
            category=EventCategory.SYSTEM,
            source="test",
        )

        result = await event_queue.enqueue(event)

        assert result is True
        stats = event_queue.get_stats()
        assert stats.enqueued_count == 1

    @pytest.mark.asyncio
    async def test_queue_dequeue(self, event_queue: EventQueue) -> None:
        """Test event dequeue."""
        event = BaseEvent(
            type="test:dequeue",
            category=EventCategory.SYSTEM,
            source="test",
        )

        await event_queue.enqueue(event)
        events = event_queue.dequeue(1)

        assert len(events) == 1
        assert events[0].type == "test:dequeue"

    @pytest.mark.asyncio
    async def test_queue_priority_ordering(self, event_queue: EventQueue) -> None:
        """Test that events are dequeued by priority."""
        low_priority = BaseEvent(
            type="test:low",
            category=EventCategory.SYSTEM,
            severity=EventSeverity.DEBUG,  # priority 0
            source="test",
        )
        high_priority = BaseEvent(
            type="test:high",
            category=EventCategory.SYSTEM,
            severity=EventSeverity.CRITICAL,  # priority 4
            source="test",
        )

        # Enqueue low priority first
        await event_queue.enqueue(low_priority)
        # Enqueue high priority second
        await event_queue.enqueue(high_priority)

        # High priority should be dequeued first
        events = event_queue.dequeue(1)
        assert events[0].type == "test:high"

    @pytest.mark.asyncio
    async def test_queue_batch_flush(self, event_queue: EventQueue) -> None:
        """Test batch flush processing."""
        processed_events: list[BaseEvent] = []

        async def process_handler(events: list[BaseEvent]) -> None:
            processed_events.extend(events)

        event_queue.set_process_handler(process_handler)

        for i in range(10):
            event = BaseEvent(
                type=f"test:batch_{i}",
                category=EventCategory.SYSTEM,
                source="test",
            )
            await event_queue.enqueue(event)

        await event_queue.flush()

        assert len(processed_events) == 10

    @pytest.mark.asyncio
    async def test_queue_clear(self, event_queue: EventQueue) -> None:
        """Test queue clear functionality."""
        for i in range(5):
            event = BaseEvent(
                type=f"test:clear_{i}",
                category=EventCategory.SYSTEM,
                source="test",
            )
            await event_queue.enqueue(event)

        stats_before = event_queue.get_stats()
        assert stats_before.size == 5

        event_queue.clear()

        stats_after = event_queue.get_stats()
        assert stats_after.size == 0

    @pytest.mark.asyncio
    async def test_queue_stats(self, event_queue: EventQueue) -> None:
        """Test queue statistics tracking."""
        events = [
            BaseEvent(
                type="test:stats",
                category=EventCategory.SYSTEM,
                severity=EventSeverity.INFO,
                source="test",
            )
            for _ in range(5)
        ]

        for event in events:
            await event_queue.enqueue(event)

        stats = event_queue.get_stats()

        assert stats.enqueued_count == 5
        assert stats.size == 5
        assert 1 in stats.priority_distribution  # INFO = priority 1

    @pytest.mark.asyncio
    async def test_queue_callbacks(self, event_queue: EventQueue) -> None:
        """Test queue event callbacks."""
        enqueued_events: list[BaseEvent] = []
        dequeued_events: list[BaseEvent] = []

        event_queue.on_enqueue(lambda e: enqueued_events.append(e))
        event_queue.on_dequeue(lambda e: dequeued_events.append(e))

        event = BaseEvent(
            type="test:callbacks",
            category=EventCategory.SYSTEM,
            source="test",
        )

        await event_queue.enqueue(event)
        event_queue.dequeue(1)

        assert len(enqueued_events) == 1
        assert len(dequeued_events) == 1
