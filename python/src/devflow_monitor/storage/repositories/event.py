"""
Event Repository Implementation.

Provides data access methods for event storage and retrieval.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from ...events.types.base import BaseEvent, EventCategory, EventMetadata, EventSeverity
from ..database import DatabaseManager
from .base import BaseRepository, OrderDirection, QueryOptions


@dataclass
class EventRecord:
    """
    Event database record.

    Represents a stored event in the database with all persisted fields.
    """

    id: int | None = None
    type: str = ""
    category: str = ""
    severity: str = "info"
    timestamp: int = 0
    source: str = ""
    data: str = "{}"
    metadata: str = "{}"
    correlation_id: str | None = None
    parent_id: str | None = None
    sync_status: str = "pending"
    sync_id: str | None = None
    device_id: str | None = None
    user_id: str | None = None
    created_at: int | None = None
    updated_at: int | None = None


class EventRepository(BaseRepository[EventRecord]):
    """
    Repository for event persistence.

    Provides methods for storing and querying events with support for
    filtering by category, severity, time range, and source.
    """

    def __init__(self, db: DatabaseManager) -> None:
        """
        Initialize the event repository.

        Args:
            db: Database manager instance.
        """
        super().__init__(db, "events")

    def _to_entity(self, row: dict[str, Any]) -> EventRecord:
        """Convert database row to EventRecord."""
        return EventRecord(
            id=row.get("id"),
            type=row.get("type", ""),
            category=row.get("category", ""),
            severity=row.get("severity", "info"),
            timestamp=row.get("timestamp", 0),
            source=row.get("source", ""),
            data=row.get("data", "{}"),
            metadata=row.get("metadata", "{}"),
            correlation_id=row.get("correlation_id"),
            parent_id=row.get("parent_id"),
            sync_status=row.get("sync_status", "pending"),
            sync_id=row.get("sync_id"),
            device_id=row.get("device_id"),
            user_id=row.get("user_id"),
            created_at=row.get("created_at"),
            updated_at=row.get("updated_at"),
        )

    def _to_row(self, entity: EventRecord) -> dict[str, Any]:
        """Convert EventRecord to database row."""
        return {
            "id": entity.id,
            "type": entity.type,
            "category": entity.category,
            "severity": entity.severity,
            "timestamp": entity.timestamp,
            "source": entity.source,
            "data": entity.data,
            "metadata": entity.metadata,
            "correlation_id": entity.correlation_id,
            "parent_id": entity.parent_id,
            "sync_status": entity.sync_status,
            "sync_id": entity.sync_id,
            "device_id": entity.device_id,
            "user_id": entity.user_id,
        }

    async def create_from_event(self, event: BaseEvent) -> EventRecord:
        """
        Create a record from a BaseEvent.

        Args:
            event: BaseEvent instance to persist.

        Returns:
            Created EventRecord with ID.
        """
        # Convert timestamp to milliseconds
        if isinstance(event.timestamp, datetime):
            timestamp_ms = int(event.timestamp.timestamp() * 1000)
        else:
            timestamp_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

        # Extract device_id and user_id from metadata
        device_id = None
        user_id = None
        if event.metadata:
            if hasattr(event.metadata, "model_dump"):
                meta_dict = event.metadata.model_dump()
            else:
                meta_dict = event.metadata if isinstance(event.metadata, dict) else {}
            device_id = meta_dict.get("device_id")
            user_id = meta_dict.get("user_id")

        record = EventRecord(
            type=event.type,
            category=event.category if isinstance(event.category, str) else event.category.value,
            severity=event.severity if isinstance(event.severity, str) else event.severity.value,
            timestamp=timestamp_ms,
            source=event.source,
            data=json.dumps(event.data) if isinstance(event.data, dict) else str(event.data),
            metadata=json.dumps(
                event.metadata.model_dump() if event.metadata and hasattr(event.metadata, "model_dump")
                else event.metadata if isinstance(event.metadata, dict)
                else {}
            ),
            correlation_id=event.correlation_id,
            parent_id=event.parent_id,
            device_id=device_id,
            user_id=user_id,
        )

        return await self.create(self._to_row(record))

    async def find_by_type(
        self, event_type: str, options: QueryOptions | None = None
    ) -> list[EventRecord]:
        """
        Find events by type.

        Args:
            event_type: Event type to filter by.
            options: Additional query options.

        Returns:
            List of matching events.
        """
        return await self.find_by_criteria({"type": event_type}, options)

    async def find_by_category(
        self, category: EventCategory | str, options: QueryOptions | None = None
    ) -> list[EventRecord]:
        """
        Find events by category.

        Args:
            category: Event category to filter by.
            options: Additional query options.

        Returns:
            List of matching events.
        """
        cat_value = category if isinstance(category, str) else category.value
        return await self.find_by_criteria({"category": cat_value}, options)

    async def find_by_severity(
        self, severity: EventSeverity | str, options: QueryOptions | None = None
    ) -> list[EventRecord]:
        """
        Find events by severity.

        Args:
            severity: Event severity to filter by.
            options: Additional query options.

        Returns:
            List of matching events.
        """
        sev_value = severity if isinstance(severity, str) else severity.value
        return await self.find_by_criteria({"severity": sev_value}, options)

    async def find_by_time_range(
        self,
        start_time: int | datetime,
        end_time: int | datetime,
        options: QueryOptions | None = None,
    ) -> list[EventRecord]:
        """
        Find events within a time range.

        Args:
            start_time: Start timestamp (ms) or datetime.
            end_time: End timestamp (ms) or datetime.
            options: Additional query options.

        Returns:
            List of events within the time range.
        """
        # Convert datetime to milliseconds if needed
        if isinstance(start_time, datetime):
            start_ms = int(start_time.timestamp() * 1000)
        else:
            start_ms = start_time

        if isinstance(end_time, datetime):
            end_ms = int(end_time.timestamp() * 1000)
        else:
            end_ms = end_time

        sql = f"SELECT * FROM {self._table_name} WHERE timestamp >= ? AND timestamp <= ?"
        params: list[Any] = [start_ms, end_ms]

        # Add ORDER BY
        opt = options or QueryOptions()
        if opt.order_by:
            sql += f" ORDER BY {opt.order_by} {opt.order_dir.value}"
        else:
            sql += " ORDER BY timestamp DESC"

        # Add LIMIT and OFFSET
        if opt.limit:
            sql += " LIMIT ?"
            params.append(opt.limit)
            if opt.offset:
                sql += " OFFSET ?"
                params.append(opt.offset)

        rows = await self.execute_query(sql, tuple(params))
        return [self._to_entity(row) for row in rows]

    async def find_by_source(
        self, source: str, options: QueryOptions | None = None
    ) -> list[EventRecord]:
        """
        Find events by source.

        Args:
            source: Event source to filter by.
            options: Additional query options.

        Returns:
            List of matching events.
        """
        return await self.find_by_criteria({"source": source}, options)

    async def find_unsynced(self, limit: int | None = None) -> list[EventRecord]:
        """
        Find unsynced events.

        Args:
            limit: Maximum number of events to return.

        Returns:
            List of unsynced events.
        """
        sql = f"SELECT * FROM {self._table_name} WHERE sync_status = 'pending' ORDER BY timestamp ASC"
        params: list[Any] = []

        if limit:
            sql += " LIMIT ?"
            params.append(limit)

        rows = await self.execute_query(sql, tuple(params) if params else None)
        return [self._to_entity(row) for row in rows]

    async def mark_as_synced(self, ids: list[int], sync_id: str) -> int:
        """
        Mark events as synced.

        Args:
            ids: List of event IDs to mark.
            sync_id: Sync batch identifier.

        Returns:
            Number of updated records.
        """
        if not ids:
            return 0

        placeholders = ", ".join(["?" for _ in ids])
        sql = f"UPDATE {self._table_name} SET sync_status = 'synced', sync_id = ? WHERE id IN ({placeholders})"

        params = [sync_id] + ids
        return await self.execute_command(sql, tuple(params))

    async def count_by_category(self) -> dict[str, int]:
        """
        Get event counts grouped by category.

        Returns:
            Dictionary mapping category to count.
        """
        sql = f"SELECT category, COUNT(*) as count FROM {self._table_name} GROUP BY category"
        rows = await self.execute_query(sql)

        return {row["category"]: row["count"] for row in rows}

    async def count_by_severity(self) -> dict[str, int]:
        """
        Get event counts grouped by severity.

        Returns:
            Dictionary mapping severity to count.
        """
        sql = f"SELECT severity, COUNT(*) as count FROM {self._table_name} GROUP BY severity"
        rows = await self.execute_query(sql)

        return {row["severity"]: row["count"] for row in rows}

    async def get_statistics(self) -> dict[str, Any]:
        """
        Get comprehensive event statistics.

        Returns:
            Dictionary with event statistics.
        """
        total = await self.count()

        # Count by type
        by_type_sql = f"SELECT type, COUNT(*) as count FROM {self._table_name} GROUP BY type"
        by_type_rows = await self.execute_query(by_type_sql)
        by_type = {row["type"]: row["count"] for row in by_type_rows}

        # Count by sync status
        by_sync_sql = f"SELECT sync_status, COUNT(*) as count FROM {self._table_name} GROUP BY sync_status"
        by_sync_rows = await self.execute_query(by_sync_sql)
        by_sync_status = {row["sync_status"]: row["count"] for row in by_sync_rows}

        # Get oldest and newest events
        time_sql = f"SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest FROM {self._table_name}"
        time_result = await self._db.fetch_one(time_sql)

        result: dict[str, Any] = {
            "total": total,
            "by_type": by_type,
            "by_sync_status": by_sync_status,
        }

        if time_result:
            if time_result.get("oldest"):
                result["oldest_event"] = datetime.fromtimestamp(
                    time_result["oldest"] / 1000
                )
            if time_result.get("newest"):
                result["newest_event"] = datetime.fromtimestamp(
                    time_result["newest"] / 1000
                )

        return result

    async def clean_old_events(self, older_than_timestamp: int) -> int:
        """
        Clean old synced events.

        Args:
            older_than_timestamp: Timestamp threshold in milliseconds.

        Returns:
            Number of deleted events.
        """
        sql = f"DELETE FROM {self._table_name} WHERE timestamp < ? AND sync_status = 'synced'"
        return await self.execute_command(sql, (older_than_timestamp,))

    async def to_base_event(self, record: EventRecord) -> BaseEvent:
        """
        Convert EventRecord back to BaseEvent.

        Args:
            record: EventRecord to convert.

        Returns:
            BaseEvent instance.
        """
        # Parse JSON fields
        data = json.loads(record.data) if record.data else {}
        metadata_dict = json.loads(record.metadata) if record.metadata else {}

        # Create metadata object
        metadata = EventMetadata(**metadata_dict) if metadata_dict else None

        # Create BaseEvent
        return BaseEvent(
            id=str(record.id) if record.id else None,
            type=record.type,
            category=EventCategory(record.category),
            severity=EventSeverity(record.severity),
            timestamp=datetime.fromtimestamp(record.timestamp / 1000),
            source=record.source,
            data=data,
            metadata=metadata,
            correlation_id=record.correlation_id,
            parent_id=record.parent_id,
        )
