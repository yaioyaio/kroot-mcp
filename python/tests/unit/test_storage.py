"""
Unit tests for the storage module.

Tests cover database connections, event repository CRUD operations,
query options, and JSON serialization.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import pytest_asyncio

from devflow_monitor.events.types.base import (
    BaseEvent,
    EventCategory,
    EventMetadata,
    EventSeverity,
)
from devflow_monitor.storage.database import DatabaseConfig, DatabaseManager
from devflow_monitor.storage.repositories.base import OrderDirection, QueryOptions
from devflow_monitor.storage.repositories.event import EventRecord, EventRepository


class TestDatabaseConnection:
    """Tests for database connection and initialization."""

    @pytest.mark.asyncio
    async def test_database_initialize(self, tmp_path: Path) -> None:
        """Test database initialization."""
        db_path = tmp_path / "test.db"
        config = DatabaseConfig(path=str(db_path))
        db = DatabaseManager(config)

        await db.initialize()

        assert db.is_initialized is True
        assert db_path.exists()

        await db.close()

    @pytest.mark.asyncio
    async def test_database_context_manager(self, tmp_path: Path) -> None:
        """Test database as async context manager."""
        db_path = tmp_path / "test_ctx.db"
        config = DatabaseConfig(path=str(db_path))

        async with DatabaseManager(config) as db:
            assert db.is_initialized is True

        # After context exit, should be closed
        assert db.is_initialized is False

    @pytest.mark.asyncio
    async def test_database_execute_query(
        self, storage_manager: DatabaseManager
    ) -> None:
        """Test executing raw SQL queries."""
        result = await storage_manager.fetch_all(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )

        table_names = [row["name"] for row in result]
        assert "events" in table_names
        assert "activities" in table_names
        assert "metrics" in table_names

    @pytest.mark.asyncio
    async def test_database_transaction(
        self, storage_manager: DatabaseManager
    ) -> None:
        """Test database transaction handling."""
        async with storage_manager.transaction():
            await storage_manager.execute(
                "INSERT INTO events (type, category, severity, timestamp, source, data) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                ("test:tx", "system", "info", 1234567890000, "test", "{}"),
            )

        # Verify data was committed
        result = await storage_manager.fetch_one(
            "SELECT * FROM events WHERE type = ?",
            ("test:tx",),
        )
        assert result is not None
        assert result["type"] == "test:tx"

    @pytest.mark.asyncio
    async def test_database_transaction_rollback(
        self, storage_manager: DatabaseManager
    ) -> None:
        """Test transaction rollback on error."""
        try:
            async with storage_manager.transaction():
                await storage_manager.execute(
                    "INSERT INTO events (type, category, severity, timestamp, source, data) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    ("test:rollback", "system", "info", 1234567890000, "test", "{}"),
                )
                # Force an error
                raise ValueError("Test rollback")
        except ValueError:
            pass

        # Verify data was not committed
        result = await storage_manager.fetch_one(
            "SELECT * FROM events WHERE type = ?",
            ("test:rollback",),
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_database_stats(self, storage_manager: DatabaseManager) -> None:
        """Test getting database statistics."""
        stats = storage_manager.get_stats()

        assert "path" in stats
        assert "initialized" in stats
        assert stats["initialized"] is True

    @pytest.mark.asyncio
    async def test_database_table_stats(
        self, storage_manager: DatabaseManager
    ) -> None:
        """Test getting table row counts."""
        table_stats = await storage_manager.get_table_stats()

        assert "events" in table_stats
        assert "activities" in table_stats
        assert "metrics" in table_stats


class TestEventRepositoryCreate:
    """Tests for event repository create operations."""

    @pytest_asyncio.fixture
    async def event_repo(
        self, storage_manager: DatabaseManager
    ) -> EventRepository:
        """Create event repository instance."""
        return EventRepository(storage_manager)

    @pytest.mark.asyncio
    async def test_create_event_record(
        self, event_repo: EventRepository
    ) -> None:
        """Test creating an event record."""
        record_data = {
            "type": "test:create",
            "category": "system",
            "severity": "info",
            "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
            "source": "test",
            "data": "{}",
            "metadata": "{}",
        }

        created = await event_repo.create(record_data)

        assert created.id is not None
        assert created.type == "test:create"

    @pytest.mark.asyncio
    async def test_create_from_base_event(
        self, event_repo: EventRepository
    ) -> None:
        """Test creating a record from a BaseEvent."""
        event = BaseEvent(
            type="test:from_event",
            category=EventCategory.FILE,
            severity=EventSeverity.WARNING,
            source="test_source",
            data={"key": "value"},
            metadata=EventMetadata(
                environment="test",
                user_id="user123",
            ),
        )

        record = await event_repo.create_from_event(event)

        assert record.id is not None
        assert record.type == "test:from_event"
        assert record.category == "file"
        assert record.severity == "warning"


class TestEventRepositoryFind:
    """Tests for event repository find operations."""

    @pytest_asyncio.fixture
    async def event_repo_with_data(
        self, storage_manager: DatabaseManager
    ) -> EventRepository:
        """Create event repository with test data."""
        repo = EventRepository(storage_manager)

        # Insert test events
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        test_events = [
            {
                "type": "test:find_1",
                "category": "file",
                "severity": "info",
                "timestamp": now_ms - 3600000,
                "source": "source_a",
                "data": "{}",
                "metadata": "{}",
            },
            {
                "type": "test:find_2",
                "category": "git",
                "severity": "warning",
                "timestamp": now_ms - 1800000,
                "source": "source_b",
                "data": "{}",
                "metadata": "{}",
            },
            {
                "type": "test:find_3",
                "category": "file",
                "severity": "error",
                "timestamp": now_ms,
                "source": "source_a",
                "data": "{}",
                "metadata": "{}",
            },
        ]

        for event_data in test_events:
            await repo.create(event_data)

        return repo

    @pytest.mark.asyncio
    async def test_find_by_id(
        self, event_repo_with_data: EventRepository
    ) -> None:
        """Test finding event by ID."""
        # First create an event we know the ID of
        record_data = {
            "type": "test:find_by_id",
            "category": "system",
            "severity": "info",
            "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
            "source": "test",
            "data": "{}",
            "metadata": "{}",
        }
        created = await event_repo_with_data.create(record_data)

        found = await event_repo_with_data.find_by_id(created.id)

        assert found is not None
        assert found.id == created.id
        assert found.type == "test:find_by_id"

    @pytest.mark.asyncio
    async def test_find_by_type(
        self, event_repo_with_data: EventRepository
    ) -> None:
        """Test finding events by type."""
        results = await event_repo_with_data.find_by_type("test:find_1")

        assert len(results) == 1
        assert results[0].type == "test:find_1"

    @pytest.mark.asyncio
    async def test_find_by_category(
        self, event_repo_with_data: EventRepository
    ) -> None:
        """Test finding events by category."""
        results = await event_repo_with_data.find_by_category("file")

        assert len(results) == 2
        for result in results:
            assert result.category == "file"

    @pytest.mark.asyncio
    async def test_find_by_severity(
        self, event_repo_with_data: EventRepository
    ) -> None:
        """Test finding events by severity."""
        results = await event_repo_with_data.find_by_severity("warning")

        assert len(results) == 1
        assert results[0].severity == "warning"

    @pytest.mark.asyncio
    async def test_find_by_source(
        self, event_repo_with_data: EventRepository
    ) -> None:
        """Test finding events by source."""
        results = await event_repo_with_data.find_by_source("source_a")

        assert len(results) == 2
        for result in results:
            assert result.source == "source_a"

    @pytest.mark.asyncio
    async def test_find_all(
        self, event_repo_with_data: EventRepository
    ) -> None:
        """Test finding all events."""
        results = await event_repo_with_data.find_all()

        assert len(results) >= 3


class TestQueryOptions:
    """Tests for query options functionality."""

    @pytest_asyncio.fixture
    async def event_repo_with_many(
        self, storage_manager: DatabaseManager
    ) -> EventRepository:
        """Create event repository with many test events."""
        repo = EventRepository(storage_manager)

        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        for i in range(20):
            event_data = {
                "type": f"test:query_{i}",
                "category": "system",
                "severity": "info",
                "timestamp": now_ms - (i * 60000),  # 1 minute apart
                "source": f"source_{i % 3}",
                "data": json.dumps({"index": i}),
                "metadata": "{}",
            }
            await repo.create(event_data)

        return repo

    @pytest.mark.asyncio
    async def test_query_with_limit(
        self, event_repo_with_many: EventRepository
    ) -> None:
        """Test querying with limit."""
        options = QueryOptions(limit=5)
        results = await event_repo_with_many.find_all(options)

        assert len(results) == 5

    @pytest.mark.asyncio
    async def test_query_with_offset(
        self, event_repo_with_many: EventRepository
    ) -> None:
        """Test querying with offset."""
        # Get all first
        all_results = await event_repo_with_many.find_all()

        # Then with offset
        options = QueryOptions(limit=5, offset=5)
        results = await event_repo_with_many.find_all(options)

        assert len(results) == 5
        # Check that offset skipped the first 5
        assert results[0].id == all_results[5].id

    @pytest.mark.asyncio
    async def test_query_with_order_asc(
        self, event_repo_with_many: EventRepository
    ) -> None:
        """Test querying with ascending order."""
        options = QueryOptions(
            order_by="timestamp",
            order_dir=OrderDirection.ASC,
            limit=5,
        )
        results = await event_repo_with_many.find_all(options)

        # Verify ascending order
        timestamps = [r.timestamp for r in results]
        assert timestamps == sorted(timestamps)

    @pytest.mark.asyncio
    async def test_query_with_order_desc(
        self, event_repo_with_many: EventRepository
    ) -> None:
        """Test querying with descending order."""
        options = QueryOptions(
            order_by="timestamp",
            order_dir=OrderDirection.DESC,
            limit=5,
        )
        results = await event_repo_with_many.find_all(options)

        # Verify descending order
        timestamps = [r.timestamp for r in results]
        assert timestamps == sorted(timestamps, reverse=True)

    @pytest.mark.asyncio
    async def test_find_by_time_range(
        self, event_repo_with_many: EventRepository
    ) -> None:
        """Test finding events by time range."""
        now = datetime.now(timezone.utc)
        start = now - timedelta(minutes=10)
        end = now

        results = await event_repo_with_many.find_by_time_range(start, end)

        # Should have events within the time range
        assert len(results) > 0
        for result in results:
            assert start.timestamp() * 1000 <= result.timestamp <= end.timestamp() * 1000


class TestJSONSerialization:
    """Tests for JSON serialization in storage."""

    @pytest_asyncio.fixture
    async def event_repo(
        self, storage_manager: DatabaseManager
    ) -> EventRepository:
        """Create event repository instance."""
        return EventRepository(storage_manager)

    @pytest.mark.asyncio
    async def test_store_complex_data(
        self, event_repo: EventRepository
    ) -> None:
        """Test storing complex JSON data."""
        complex_data = {
            "nested": {
                "key": "value",
                "list": [1, 2, 3],
                "deep": {
                    "level": 3,
                    "data": {"a": 1, "b": 2},
                },
            },
            "array": ["one", "two", "three"],
            "number": 42,
            "boolean": True,
            "null_value": None,
        }

        event = BaseEvent(
            type="test:complex_data",
            category=EventCategory.SYSTEM,
            source="test",
            data=complex_data,
        )

        record = await event_repo.create_from_event(event)

        # Retrieve and verify
        found = await event_repo.find_by_id(record.id)
        assert found is not None

        stored_data = json.loads(found.data)
        assert stored_data["nested"]["key"] == "value"
        assert stored_data["nested"]["list"] == [1, 2, 3]
        assert stored_data["number"] == 42

    @pytest.mark.asyncio
    async def test_store_unicode_data(
        self, event_repo: EventRepository
    ) -> None:
        """Test storing unicode data."""
        unicode_data = {
            "korean": "한글 테스트",
            "japanese": "日本語テスト",
            "emoji": "test",
            "special": "quote \"test\" and 'test'",
        }

        event = BaseEvent(
            type="test:unicode_data",
            category=EventCategory.SYSTEM,
            source="test",
            data=unicode_data,
        )

        record = await event_repo.create_from_event(event)
        found = await event_repo.find_by_id(record.id)

        assert found is not None
        stored_data = json.loads(found.data)
        assert stored_data["korean"] == "한글 테스트"
        assert stored_data["japanese"] == "日本語テスト"

    @pytest.mark.asyncio
    async def test_convert_record_to_base_event(
        self, event_repo: EventRepository
    ) -> None:
        """Test converting EventRecord back to BaseEvent."""
        original = BaseEvent(
            type="test:conversion",
            category=EventCategory.GIT,
            severity=EventSeverity.WARNING,
            source="test_source",
            data={"key": "value"},
            metadata=EventMetadata(
                environment="test",
                tags=["tag1", "tag2"],
            ),
        )

        record = await event_repo.create_from_event(original)
        found = await event_repo.find_by_id(record.id)

        assert found is not None
        converted = await event_repo.to_base_event(found)

        assert converted.type == original.type
        assert converted.category == EventCategory.GIT
        assert converted.severity == EventSeverity.WARNING
        assert converted.source == original.source
        assert converted.data["key"] == "value"


class TestEventRepositoryStatistics:
    """Tests for event repository statistics."""

    @pytest_asyncio.fixture
    async def event_repo_with_varied_data(
        self, storage_manager: DatabaseManager
    ) -> EventRepository:
        """Create event repository with varied test data."""
        repo = EventRepository(storage_manager)

        categories = ["file", "git", "system", "test"]
        severities = ["info", "warning", "error"]
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

        for i in range(12):
            event_data = {
                "type": f"test:stats_{i}",
                "category": categories[i % len(categories)],
                "severity": severities[i % len(severities)],
                "timestamp": now_ms - (i * 60000),
                "source": "test",
                "data": "{}",
                "metadata": "{}",
                "sync_status": "synced" if i % 2 == 0 else "pending",
            }
            await repo.create(event_data)

        return repo

    @pytest.mark.asyncio
    async def test_count_by_category(
        self, event_repo_with_varied_data: EventRepository
    ) -> None:
        """Test counting events by category."""
        counts = await event_repo_with_varied_data.count_by_category()

        assert "file" in counts
        assert "git" in counts
        assert "system" in counts
        assert sum(counts.values()) == 12

    @pytest.mark.asyncio
    async def test_count_by_severity(
        self, event_repo_with_varied_data: EventRepository
    ) -> None:
        """Test counting events by severity."""
        counts = await event_repo_with_varied_data.count_by_severity()

        assert "info" in counts
        assert "warning" in counts
        assert "error" in counts
        assert sum(counts.values()) == 12

    @pytest.mark.asyncio
    async def test_get_statistics(
        self, event_repo_with_varied_data: EventRepository
    ) -> None:
        """Test getting comprehensive statistics."""
        stats = await event_repo_with_varied_data.get_statistics()

        assert stats["total"] == 12
        assert "by_type" in stats
        assert "by_sync_status" in stats

    @pytest.mark.asyncio
    async def test_count(
        self, event_repo_with_varied_data: EventRepository
    ) -> None:
        """Test counting total events."""
        count = await event_repo_with_varied_data.count()

        assert count == 12
