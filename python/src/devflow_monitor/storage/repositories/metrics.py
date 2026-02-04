"""
Metrics Repository Implementation.

Provides data access methods for metrics storage, retrieval, and aggregation.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from ..database import DatabaseManager
from .base import BaseRepository, OrderDirection, QueryOptions


class AggregationType(str, Enum):
    """Aggregation types for metric calculations."""

    AVG = "avg"
    SUM = "sum"
    MIN = "min"
    MAX = "max"
    COUNT = "count"


@dataclass
class MetricsRecord:
    """
    Metrics database record.

    Represents a stored metric value in the database.
    """

    id: int | None = None
    name: str = ""
    metric_type: str = ""
    metric_name: str = ""
    value: float = 0.0
    timestamp: int = 0
    timeframe: str = "instant"
    tags: str = "[]"
    metadata: str | None = None
    created_at: int | None = None


class MetricsRepository(BaseRepository[MetricsRecord]):
    """
    Repository for metrics persistence.

    Provides methods for storing, querying, and aggregating metrics with
    support for time-series data, trends, and statistical calculations.
    """

    def __init__(self, db: DatabaseManager) -> None:
        """
        Initialize the metrics repository.

        Args:
            db: Database manager instance.
        """
        super().__init__(db, "metrics")

    def _to_entity(self, row: dict[str, Any]) -> MetricsRecord:
        """Convert database row to MetricsRecord."""
        return MetricsRecord(
            id=row.get("id"),
            name=row.get("name", ""),
            metric_type=row.get("metric_type", ""),
            metric_name=row.get("metric_name", ""),
            value=row.get("value", 0.0),
            timestamp=row.get("timestamp", 0),
            timeframe=row.get("timeframe", "instant"),
            tags=row.get("tags", "[]"),
            metadata=row.get("metadata"),
            created_at=row.get("created_at"),
        )

    def _to_row(self, entity: MetricsRecord) -> dict[str, Any]:
        """Convert MetricsRecord to database row."""
        return {
            "id": entity.id,
            "name": entity.name,
            "metric_type": entity.metric_type,
            "metric_name": entity.metric_name,
            "value": entity.value,
            "timestamp": entity.timestamp,
            "timeframe": entity.timeframe,
            "tags": entity.tags,
            "metadata": entity.metadata,
        }

    async def find_by_type(
        self, metric_type: str, options: QueryOptions | None = None
    ) -> list[MetricsRecord]:
        """
        Find metrics by type.

        Args:
            metric_type: Metric type to filter by.
            options: Additional query options.

        Returns:
            List of matching metrics.
        """
        return await self.find_by_criteria({"metric_type": metric_type}, options)

    async def find_by_type_and_name(
        self,
        metric_type: str,
        metric_name: str,
        options: QueryOptions | None = None,
    ) -> list[MetricsRecord]:
        """
        Find metrics by type and name.

        Args:
            metric_type: Metric type to filter by.
            metric_name: Metric name to filter by.
            options: Additional query options.

        Returns:
            List of matching metrics.
        """
        return await self.find_by_criteria(
            {"metric_type": metric_type, "metric_name": metric_name}, options
        )

    async def find_by_time_range(
        self,
        start_time: int | datetime,
        end_time: int | datetime,
        options: QueryOptions | None = None,
    ) -> list[MetricsRecord]:
        """
        Find metrics within a time range.

        Args:
            start_time: Start timestamp (ms) or datetime.
            end_time: End timestamp (ms) or datetime.
            options: Additional query options.

        Returns:
            List of metrics within the time range.
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

    async def find_by_timeframe(
        self, timeframe: str, options: QueryOptions | None = None
    ) -> list[MetricsRecord]:
        """
        Find metrics by timeframe.

        Args:
            timeframe: Timeframe to filter by (e.g., 'instant', 'hourly', 'daily').
            options: Additional query options.

        Returns:
            List of matching metrics.
        """
        return await self.find_by_criteria({"timeframe": timeframe}, options)

    async def get_latest_value(
        self, metric_type: str, metric_name: str
    ) -> float | None:
        """
        Get the latest value for a metric.

        Args:
            metric_type: Metric type.
            metric_name: Metric name.

        Returns:
            Latest value or None if not found.
        """
        sql = f"""
            SELECT value FROM {self._table_name}
            WHERE metric_type = ? AND metric_name = ?
            ORDER BY timestamp DESC LIMIT 1
        """
        result = await self._db.fetch_one(sql, (metric_type, metric_name))
        return result["value"] if result else None

    async def get_aggregated(
        self,
        metric_type: str,
        metric_name: str,
        start_time: int | datetime,
        end_time: int | datetime,
        aggregation: AggregationType = AggregationType.AVG,
    ) -> float | None:
        """
        Get aggregated metric value.

        Args:
            metric_type: Metric type.
            metric_name: Metric name.
            start_time: Start timestamp.
            end_time: End timestamp.
            aggregation: Aggregation type.

        Returns:
            Aggregated value or None.
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

        sql = f"""
            SELECT {aggregation.value}(value) as result FROM {self._table_name}
            WHERE metric_type = ? AND metric_name = ?
            AND timestamp >= ? AND timestamp <= ?
        """

        result = await self._db.fetch_one(
            sql, (metric_type, metric_name, start_ms, end_ms)
        )
        return result["result"] if result and result["result"] is not None else None

    async def get_trends(
        self,
        metric_type: str,
        metric_name: str,
        timeframe: str,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """
        Get metric trends over time.

        Args:
            metric_type: Metric type.
            metric_name: Metric name.
            timeframe: Timeframe to filter by.
            limit: Maximum number of data points.

        Returns:
            List of timestamp-value pairs in chronological order.
        """
        sql = f"""
            SELECT timestamp, value FROM {self._table_name}
            WHERE metric_type = ? AND metric_name = ? AND timeframe = ?
            ORDER BY timestamp DESC LIMIT ?
        """

        rows = await self.execute_query(sql, (metric_type, metric_name, timeframe, limit))

        # Return in chronological order
        return [
            {"timestamp": row["timestamp"], "value": row["value"]}
            for row in reversed(rows)
        ]

    async def get_metric_types(self) -> list[str]:
        """
        Get all distinct metric types.

        Returns:
            List of metric types.
        """
        sql = f"SELECT DISTINCT metric_type FROM {self._table_name} ORDER BY metric_type"
        rows = await self.execute_query(sql)
        return [row["metric_type"] for row in rows]

    async def get_metric_names_by_type(self, metric_type: str) -> list[str]:
        """
        Get metric names for a given type.

        Args:
            metric_type: Metric type to filter by.

        Returns:
            List of metric names.
        """
        sql = f"""
            SELECT DISTINCT metric_name FROM {self._table_name}
            WHERE metric_type = ? ORDER BY metric_name
        """
        rows = await self.execute_query(sql, (metric_type,))
        return [row["metric_name"] for row in rows]

    async def get_statistics(
        self, metric_type: str | None = None
    ) -> dict[str, Any]:
        """
        Get metric statistics.

        Args:
            metric_type: Optional metric type to filter by.

        Returns:
            Dictionary with metric statistics.
        """
        total = await self.count()

        # Count by type
        by_type_sql = (
            f"SELECT metric_type, COUNT(*) as count FROM {self._table_name} GROUP BY metric_type"
        )
        by_type_rows = await self.execute_query(by_type_sql)
        by_type = {row["metric_type"]: row["count"] for row in by_type_rows}

        # Get value statistics
        stats_sql = f"""
            SELECT
                MIN(value) as min_value,
                MAX(value) as max_value,
                AVG(value) as avg_value
            FROM {self._table_name}
        """
        if metric_type:
            stats_sql += " WHERE metric_type = ?"
            stats_result = await self._db.fetch_one(stats_sql, (metric_type,))
        else:
            stats_result = await self._db.fetch_one(stats_sql)

        return {
            "total": total,
            "by_type": by_type,
            "min_value": stats_result["min_value"] if stats_result else None,
            "max_value": stats_result["max_value"] if stats_result else None,
            "avg_value": stats_result["avg_value"] if stats_result else None,
        }

    async def clean_old_metrics(self, older_than_timestamp: int) -> int:
        """
        Clean old metrics.

        Args:
            older_than_timestamp: Timestamp threshold in milliseconds.

        Returns:
            Number of deleted metrics.
        """
        sql = f"DELETE FROM {self._table_name} WHERE timestamp < ?"
        return await self.execute_command(sql, (older_than_timestamp,))

    async def upsert(self, data: dict[str, Any] | MetricsRecord) -> MetricsRecord:
        """
        Upsert a metric (update if exists, create if not).

        Args:
            data: MetricsRecord or dictionary with metric data.

        Returns:
            Created or updated MetricsRecord.
        """
        if isinstance(data, MetricsRecord):
            row_data = self._to_row(data)
        else:
            row_data = data.copy()

        # Check for existing record
        existing = await self.find_by_criteria(
            {
                "metric_type": row_data.get("metric_type"),
                "metric_name": row_data.get("metric_name"),
                "timestamp": row_data.get("timestamp"),
                "timeframe": row_data.get("timeframe"),
            }
        )

        if existing:
            # Update existing record
            updated = await self.update(
                existing[0].id,  # type: ignore
                {"value": row_data.get("value")},
            )
            return updated if updated else existing[0]
        else:
            # Create new record
            return await self.create(row_data)

    async def record_metric(
        self,
        metric_type: str,
        metric_name: str,
        value: float,
        timestamp: int | datetime | None = None,
        timeframe: str = "instant",
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> MetricsRecord:
        """
        Record a new metric value.

        Args:
            metric_type: Type of metric.
            metric_name: Name of metric.
            value: Metric value.
            timestamp: Optional timestamp (defaults to now).
            timeframe: Timeframe classification.
            tags: Optional tags.
            metadata: Optional metadata.

        Returns:
            Created MetricsRecord.
        """
        # Determine timestamp
        if timestamp is None:
            timestamp_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        elif isinstance(timestamp, datetime):
            timestamp_ms = int(timestamp.timestamp() * 1000)
        else:
            timestamp_ms = timestamp

        record = MetricsRecord(
            name=f"{metric_type}.{metric_name}",
            metric_type=metric_type,
            metric_name=metric_name,
            value=value,
            timestamp=timestamp_ms,
            timeframe=timeframe,
            tags=json.dumps(tags) if tags else "[]",
            metadata=json.dumps(metadata) if metadata else None,
        )

        return await self.create(self._to_row(record))

    async def get_hourly_aggregates(
        self,
        metric_type: str,
        metric_name: str,
        hours: int = 24,
    ) -> list[dict[str, Any]]:
        """
        Get hourly aggregated values.

        Args:
            metric_type: Metric type.
            metric_name: Metric name.
            hours: Number of hours to include.

        Returns:
            List of hourly aggregates.
        """
        cutoff_ms = int(
            (datetime.now(timezone.utc).timestamp() - hours * 60 * 60) * 1000
        )

        sql = f"""
            SELECT
                strftime('%Y-%m-%d %H:00', timestamp / 1000, 'unixepoch') as hour,
                AVG(value) as avg_value,
                MIN(value) as min_value,
                MAX(value) as max_value,
                COUNT(*) as count
            FROM {self._table_name}
            WHERE metric_type = ? AND metric_name = ? AND timestamp >= ?
            GROUP BY strftime('%Y-%m-%d %H:00', timestamp / 1000, 'unixepoch')
            ORDER BY hour ASC
        """

        rows = await self.execute_query(sql, (metric_type, metric_name, cutoff_ms))
        return [
            {
                "hour": row["hour"],
                "avg_value": row["avg_value"],
                "min_value": row["min_value"],
                "max_value": row["max_value"],
                "count": row["count"],
            }
            for row in rows
        ]

    async def get_daily_aggregates(
        self,
        metric_type: str,
        metric_name: str,
        days: int = 30,
    ) -> list[dict[str, Any]]:
        """
        Get daily aggregated values.

        Args:
            metric_type: Metric type.
            metric_name: Metric name.
            days: Number of days to include.

        Returns:
            List of daily aggregates.
        """
        cutoff_ms = int(
            (datetime.now(timezone.utc).timestamp() - days * 24 * 60 * 60) * 1000
        )

        sql = f"""
            SELECT
                date(timestamp / 1000, 'unixepoch') as date,
                AVG(value) as avg_value,
                MIN(value) as min_value,
                MAX(value) as max_value,
                COUNT(*) as count
            FROM {self._table_name}
            WHERE metric_type = ? AND metric_name = ? AND timestamp >= ?
            GROUP BY date(timestamp / 1000, 'unixepoch')
            ORDER BY date ASC
        """

        rows = await self.execute_query(sql, (metric_type, metric_name, cutoff_ms))
        return [
            {
                "date": row["date"],
                "avg_value": row["avg_value"],
                "min_value": row["min_value"],
                "max_value": row["max_value"],
                "count": row["count"],
            }
            for row in rows
        ]
