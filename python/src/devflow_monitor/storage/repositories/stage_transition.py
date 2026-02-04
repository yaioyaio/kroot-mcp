"""
Stage Transition Repository Implementation.

Provides data access for stage transition records with specialized
query methods for analyzing development workflow transitions.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from ..database import DatabaseManager
from ..types import (
    QueryOptions,
    StageTransitionRecord,
    TransitionStatistics,
    StageSequenceEntry,
)
from .base import BaseRepository


class StageTransitionRepository(BaseRepository[StageTransitionRecord]):
    """
    Repository for stage transition records.

    Provides specialized methods for querying and analyzing
    development stage transitions in the workflow.

    Example:
        repo = StageTransitionRepository(db)
        transitions = await repo.find_by_stage("coding", "to")
        stats = await repo.get_statistics()
    """

    def __init__(self, db: DatabaseManager) -> None:
        """
        Initialize the stage transition repository.

        Args:
            db: Database manager instance.
        """
        super().__init__(db, "stage_transitions")

    def _to_entity(self, row: dict[str, Any]) -> StageTransitionRecord:
        """
        Convert database row to StageTransitionRecord.

        Args:
            row: Database row dictionary.

        Returns:
            StageTransitionRecord instance.
        """
        return StageTransitionRecord(
            id=row.get("id"),
            from_stage=row.get("from_stage"),
            to_stage=row["to_stage"],
            timestamp=row["timestamp"],
            confidence=row.get("confidence", 1.0),
            metadata=row.get("metadata"),
            created_at=row.get("created_at"),
        )

    def _to_row(self, entity: StageTransitionRecord) -> dict[str, Any]:
        """
        Convert StageTransitionRecord to database row.

        Args:
            entity: StageTransitionRecord instance.

        Returns:
            Row data dictionary.
        """
        now = int(datetime.now(timezone.utc).timestamp() * 1000)
        return {
            "from_stage": entity.from_stage,
            "to_stage": entity.to_stage,
            "timestamp": entity.timestamp,
            "confidence": entity.confidence,
            "metadata": entity.metadata,
            "created_at": entity.created_at or now,
        }

    async def find_by_stage(
        self,
        stage: str,
        direction: str = "to",
        options: QueryOptions | None = None,
    ) -> list[StageTransitionRecord]:
        """
        Find transitions by stage.

        Args:
            stage: Stage name to search for.
            direction: Direction to search ('from' or 'to').
            options: Optional query options.

        Returns:
            List of matching transitions.
        """
        field = "from_stage" if direction == "from" else "to_stage"
        return await self.find_by_criteria({field: stage}, options)

    async def find_by_stages(
        self,
        from_stage: str | None,
        to_stage: str,
        options: QueryOptions | None = None,
    ) -> list[StageTransitionRecord]:
        """
        Find transitions by stage pair.

        Args:
            from_stage: Source stage (None for any).
            to_stage: Target stage.
            options: Optional query options.

        Returns:
            List of matching transitions.
        """
        criteria: dict[str, Any] = {"to_stage": to_stage}
        if from_stage is not None:
            criteria["from_stage"] = from_stage

        return await self.find_by_criteria(criteria, options)

    async def find_by_time_range(
        self,
        start_time: int,
        end_time: int,
        options: QueryOptions | None = None,
    ) -> list[StageTransitionRecord]:
        """
        Find transitions within a time range.

        Args:
            start_time: Start timestamp in milliseconds.
            end_time: End timestamp in milliseconds.
            options: Optional query options.

        Returns:
            List of transitions in the time range.
        """
        sql = f"SELECT * FROM {self.table_name} WHERE timestamp >= ? AND timestamp <= ?"
        params: list[Any] = [start_time, end_time]

        if options and options.order_by:
            direction = options.order_direction.value
            sql += f" ORDER BY {options.order_by} {direction}"
        else:
            sql += " ORDER BY timestamp DESC"

        if options and options.limit:
            sql += " LIMIT ?"
            params.append(options.limit)

            if options.offset:
                sql += " OFFSET ?"
                params.append(options.offset)

        rows = await self.execute_query(sql, tuple(params))
        return [self._to_entity(row) for row in rows]

    async def find_by_confidence(
        self,
        min_confidence: float,
        options: QueryOptions | None = None,
    ) -> list[StageTransitionRecord]:
        """
        Find transitions with confidence above threshold.

        Args:
            min_confidence: Minimum confidence score (0.0 to 1.0).
            options: Optional query options.

        Returns:
            List of transitions meeting the confidence threshold.
        """
        sql = f"SELECT * FROM {self.table_name} WHERE confidence >= ?"
        params: list[Any] = [min_confidence]

        if options and options.order_by:
            direction = options.order_direction.value
            sql += f" ORDER BY {options.order_by} {direction}"
        else:
            sql += " ORDER BY timestamp DESC"

        if options and options.limit:
            sql += " LIMIT ?"
            params.append(options.limit)

            if options.offset:
                sql += " OFFSET ?"
                params.append(options.offset)

        rows = await self.execute_query(sql, tuple(params))
        return [self._to_entity(row) for row in rows]

    async def get_latest(self) -> StageTransitionRecord | None:
        """
        Get the most recent transition.

        Returns:
            Latest transition or None if no transitions exist.
        """
        sql = f"SELECT * FROM {self.table_name} ORDER BY timestamp DESC LIMIT 1"
        rows = await self.execute_query(sql)

        if rows:
            return self._to_entity(rows[0])
        return None

    async def get_statistics(self) -> TransitionStatistics:
        """
        Get transition statistics.

        Returns comprehensive statistics about stage transitions
        including counts, averages, and distributions.

        Returns:
            TransitionStatistics with aggregated data.
        """
        total = await self.count()

        # Get average confidence
        avg_sql = f"SELECT AVG(confidence) as avg FROM {self.table_name}"
        avg_result = await self.execute_query(avg_sql)
        average_confidence = avg_result[0]["avg"] if avg_result and avg_result[0]["avg"] else 0.0

        # Get transitions count and average confidence per path
        transitions_sql = f"""
            SELECT from_stage, to_stage, COUNT(*) as count, AVG(confidence) as avg_confidence
            FROM {self.table_name}
            GROUP BY from_stage, to_stage
            ORDER BY count DESC
        """
        transition_results = await self.execute_query(transitions_sql)

        # Calculate by_stage statistics
        by_stage: dict[str, dict[str, int]] = {}

        for row in transition_results:
            from_stage = row["from_stage"]
            to_stage = row["to_stage"]
            count = row["count"]

            # Outgoing transitions
            if from_stage:
                if from_stage not in by_stage:
                    by_stage[from_stage] = {"incoming": 0, "outgoing": 0}
                by_stage[from_stage]["outgoing"] += count

            # Incoming transitions
            if to_stage not in by_stage:
                by_stage[to_stage] = {"incoming": 0, "outgoing": 0}
            by_stage[to_stage]["incoming"] += count

        # Format transitions list
        transitions = [
            {
                "from": row["from_stage"],
                "to": row["to_stage"],
                "count": row["count"],
                "avg_confidence": row["avg_confidence"],
            }
            for row in transition_results
        ]

        return TransitionStatistics(
            total_transitions=total,
            by_stage=by_stage,
            average_confidence=average_confidence,
            transitions=transitions,
        )

    async def get_stage_sequence(
        self,
        start_time: int,
        end_time: int,
    ) -> list[StageSequenceEntry]:
        """
        Get the sequence of stage transitions for a time period.

        Args:
            start_time: Start timestamp in milliseconds.
            end_time: End timestamp in milliseconds.

        Returns:
            Ordered list of stage transitions.
        """
        sql = f"""
            SELECT timestamp, from_stage, to_stage, confidence
            FROM {self.table_name}
            WHERE timestamp >= ? AND timestamp <= ?
            ORDER BY timestamp ASC
        """

        rows = await self.execute_query(sql, (start_time, end_time))

        return [
            StageSequenceEntry(
                timestamp=row["timestamp"],
                from_stage=row["from_stage"],
                to_stage=row["to_stage"],
                confidence=row["confidence"],
            )
            for row in rows
        ]

    async def clean_old_transitions(self, older_than_timestamp: int) -> int:
        """
        Delete transitions older than a timestamp.

        Args:
            older_than_timestamp: Timestamp threshold in milliseconds.

        Returns:
            Number of deleted records.
        """
        sql = f"DELETE FROM {self.table_name} WHERE timestamp < ?"
        return await self.execute_command(sql, (older_than_timestamp,))

    async def get_most_common_path(
        self,
        from_stage: str | None = None,
    ) -> dict[str, Any] | None:
        """
        Get the most common transition path.

        Args:
            from_stage: Optional source stage filter.

        Returns:
            Most common path info or None.
        """
        if from_stage:
            sql = f"""
                SELECT from_stage, to_stage, COUNT(*) as count
                FROM {self.table_name}
                WHERE from_stage = ?
                GROUP BY from_stage, to_stage
                ORDER BY count DESC
                LIMIT 1
            """
            rows = await self.execute_query(sql, (from_stage,))
        else:
            sql = f"""
                SELECT from_stage, to_stage, COUNT(*) as count
                FROM {self.table_name}
                GROUP BY from_stage, to_stage
                ORDER BY count DESC
                LIMIT 1
            """
            rows = await self.execute_query(sql)

        if rows:
            return {
                "from": rows[0]["from_stage"],
                "to": rows[0]["to_stage"],
                "count": rows[0]["count"],
            }
        return None

    async def get_average_time_in_stage(self, stage: str) -> float | None:
        """
        Calculate average time spent in a stage.

        Args:
            stage: Stage name.

        Returns:
            Average time in milliseconds or None.
        """
        # Get transitions entering and leaving the stage
        sql = f"""
            SELECT
                (SELECT AVG(next_ts - curr_ts) FROM (
                    SELECT
                        t1.timestamp as curr_ts,
                        (SELECT MIN(t2.timestamp)
                         FROM {self.table_name} t2
                         WHERE t2.from_stage = t1.to_stage
                         AND t2.timestamp > t1.timestamp) as next_ts
                    FROM {self.table_name} t1
                    WHERE t1.to_stage = ?
                ) WHERE next_ts IS NOT NULL) as avg_time
        """

        rows = await self.execute_query(sql, (stage,))
        if rows and rows[0]["avg_time"]:
            return float(rows[0]["avg_time"])
        return None
