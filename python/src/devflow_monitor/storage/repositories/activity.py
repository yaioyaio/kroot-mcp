"""
Activity Repository Implementation.

Provides data access methods for activity log storage and retrieval.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from ..database import DatabaseManager
from .base import BaseRepository, OrderDirection, QueryOptions


@dataclass
class ActivityRecord:
    """
    Activity database record.

    Represents a stored activity log entry in the database.
    """

    id: int | None = None
    event_id: int | None = None
    stage: str = ""
    action: str = ""
    description: str | None = None
    details: str | None = None
    actor: str | None = None
    metadata: str | None = None
    timestamp: int = 0
    created_at: int | None = None


class ActivityRepository(BaseRepository[ActivityRecord]):
    """
    Repository for activity log persistence.

    Provides methods for storing and querying activity logs with support for
    filtering by stage, actor, and time range.
    """

    def __init__(self, db: DatabaseManager) -> None:
        """
        Initialize the activity repository.

        Args:
            db: Database manager instance.
        """
        super().__init__(db, "activities")

    def _to_entity(self, row: dict[str, Any]) -> ActivityRecord:
        """Convert database row to ActivityRecord."""
        return ActivityRecord(
            id=row.get("id"),
            event_id=row.get("event_id"),
            stage=row.get("stage", ""),
            action=row.get("action", ""),
            description=row.get("description"),
            details=row.get("details"),
            actor=row.get("actor"),
            metadata=row.get("metadata"),
            timestamp=row.get("timestamp", 0),
            created_at=row.get("created_at"),
        )

    def _to_row(self, entity: ActivityRecord) -> dict[str, Any]:
        """Convert ActivityRecord to database row."""
        return {
            "id": entity.id,
            "event_id": entity.event_id,
            "stage": entity.stage,
            "action": entity.action,
            "description": entity.description,
            "details": entity.details,
            "actor": entity.actor,
            "metadata": entity.metadata,
            "timestamp": entity.timestamp,
        }

    async def find_by_stage(
        self, stage: str, options: QueryOptions | None = None
    ) -> list[ActivityRecord]:
        """
        Find activities by stage.

        Args:
            stage: Development stage to filter by.
            options: Additional query options.

        Returns:
            List of matching activities.
        """
        return await self.find_by_criteria({"stage": stage}, options)

    async def find_by_actor(
        self, actor: str, options: QueryOptions | None = None
    ) -> list[ActivityRecord]:
        """
        Find activities by actor.

        Args:
            actor: Actor identifier to filter by.
            options: Additional query options.

        Returns:
            List of matching activities.
        """
        return await self.find_by_criteria({"actor": actor}, options)

    async def find_by_time_range(
        self,
        start_time: int | datetime,
        end_time: int | datetime,
        options: QueryOptions | None = None,
    ) -> list[ActivityRecord]:
        """
        Find activities within a time range.

        Args:
            start_time: Start timestamp (ms) or datetime.
            end_time: End timestamp (ms) or datetime.
            options: Additional query options.

        Returns:
            List of activities within the time range.
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

    async def find_by_stage_and_action(
        self, stage: str, action: str, options: QueryOptions | None = None
    ) -> list[ActivityRecord]:
        """
        Find activities by stage and action.

        Args:
            stage: Development stage to filter by.
            action: Action type to filter by.
            options: Additional query options.

        Returns:
            List of matching activities.
        """
        return await self.find_by_criteria({"stage": stage, "action": action}, options)

    async def find_by_event_id(self, event_id: int) -> list[ActivityRecord]:
        """
        Find activities by associated event ID.

        Args:
            event_id: Event ID to filter by.

        Returns:
            List of activities for the event.
        """
        return await self.find_by_criteria({"event_id": event_id})

    async def get_recent(self, limit: int = 10) -> list[ActivityRecord]:
        """
        Get recent activities.

        Args:
            limit: Maximum number of activities to return.

        Returns:
            List of recent activities.
        """
        sql = f"SELECT * FROM {self._table_name} ORDER BY timestamp DESC LIMIT ?"
        rows = await self.execute_query(sql, (limit,))
        return [self._to_entity(row) for row in rows]

    async def get_statistics_by_stage(
        self,
    ) -> dict[str, dict[str, Any]]:
        """
        Get activity statistics grouped by stage.

        Returns:
            Dictionary mapping stage to statistics.
        """
        # Get count by stage
        stage_sql = (
            f"SELECT stage, COUNT(*) as count FROM {self._table_name} GROUP BY stage"
        )
        stage_rows = await self.execute_query(stage_sql)

        # Get count by stage and action
        action_sql = f"""
            SELECT stage, action, COUNT(*) as count
            FROM {self._table_name}
            GROUP BY stage, action
        """
        action_rows = await self.execute_query(action_sql)

        # Build statistics
        stats: dict[str, dict[str, Any]] = {}

        for row in stage_rows:
            stats[row["stage"]] = {"count": row["count"], "actions": {}}

        for row in action_rows:
            stage = row["stage"]
            if stage in stats:
                stats[stage]["actions"][row["action"]] = row["count"]

        return stats

    async def count_by_stage(self) -> dict[str, int]:
        """
        Get activity counts grouped by stage.

        Returns:
            Dictionary mapping stage to count.
        """
        sql = f"SELECT stage, COUNT(*) as count FROM {self._table_name} GROUP BY stage"
        rows = await self.execute_query(sql)
        return {row["stage"]: row["count"] for row in rows}

    async def count_by_action(self) -> dict[str, int]:
        """
        Get activity counts grouped by action.

        Returns:
            Dictionary mapping action to count.
        """
        sql = f"SELECT action, COUNT(*) as count FROM {self._table_name} GROUP BY action"
        rows = await self.execute_query(sql)
        return {row["action"]: row["count"] for row in rows}

    async def get_stage_timeline(
        self, stage: str, days: int = 7
    ) -> list[dict[str, Any]]:
        """
        Get activity timeline for a stage.

        Args:
            stage: Development stage.
            days: Number of days to include.

        Returns:
            List of daily activity counts.
        """
        cutoff_ms = int(
            (datetime.now(timezone.utc).timestamp() - days * 24 * 60 * 60) * 1000
        )

        sql = f"""
            SELECT
                date(timestamp / 1000, 'unixepoch') as date,
                COUNT(*) as count
            FROM {self._table_name}
            WHERE stage = ? AND timestamp >= ?
            GROUP BY date(timestamp / 1000, 'unixepoch')
            ORDER BY date ASC
        """

        rows = await self.execute_query(sql, (stage, cutoff_ms))
        return [{"date": row["date"], "count": row["count"]} for row in rows]

    async def clean_old_activities(self, older_than_timestamp: int) -> int:
        """
        Clean old activities.

        Args:
            older_than_timestamp: Timestamp threshold in milliseconds.

        Returns:
            Number of deleted activities.
        """
        sql = f"DELETE FROM {self._table_name} WHERE timestamp < ?"
        return await self.execute_command(sql, (older_than_timestamp,))

    async def create_from_event(
        self,
        event_id: int,
        stage: str,
        action: str,
        actor: str,
        timestamp: int | datetime,
        details: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> ActivityRecord:
        """
        Create an activity record from event data.

        Args:
            event_id: Associated event ID.
            stage: Development stage.
            action: Action performed.
            actor: Actor identifier.
            timestamp: Activity timestamp.
            details: Activity details.
            metadata: Additional metadata.

        Returns:
            Created ActivityRecord.
        """
        # Convert datetime to milliseconds if needed
        if isinstance(timestamp, datetime):
            timestamp_ms = int(timestamp.timestamp() * 1000)
        else:
            timestamp_ms = timestamp

        record = ActivityRecord(
            event_id=event_id,
            stage=stage,
            action=action,
            actor=actor,
            timestamp=timestamp_ms,
            details=details,
            metadata=json.dumps(metadata) if metadata else None,
        )

        return await self.create(self._to_row(record))
