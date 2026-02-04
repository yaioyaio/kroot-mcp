"""
DevFlow Monitor - Feedback Collector.

Collects and manages user feedback from various sources.
"""

from __future__ import annotations

import json
import os
import platform
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

from ..storage.database import DatabaseManager
from ..utils.logger import Logger
from .types import (
    Feedback,
    FeedbackAttachment,
    FeedbackContext,
    FeedbackEvent,
    FeedbackEventType,
    FeedbackFilter,
    FeedbackPriority,
    FeedbackSource,
    FeedbackStats,
    FeedbackStatus,
    FeedbackType,
    PerformanceInfo,
    ProjectInfo,
    Submitter,
    SystemInfo,
    UsabilityMetrics,
)

logger = Logger("FeedbackCollector")


@dataclass
class FeedbackSubmitOptions:
    """Options for submitting feedback."""

    type: FeedbackType
    title: str
    description: str
    source: FeedbackSource | None = None
    priority: FeedbackPriority | None = None
    project_id: str | None = None
    submitter: Submitter | None = None
    tags: list[str] = field(default_factory=list)
    attachments: list[FeedbackAttachment] | None = None
    custom_context: dict[str, Any] | None = None
    usability_metrics: UsabilityMetrics | None = None
    auto_categorize: bool = True
    notify_team: bool = False
    attach_context: bool = True


@dataclass
class FeedbackCollectorConfig:
    """Configuration for feedback collector."""

    auto_collect_context: bool = True
    allow_anonymous: bool = True
    max_attachment_size: int = 10 * 1024 * 1024  # 10MB
    max_attachments: int = 5
    title_max_length: int = 200
    description_max_length: int = 5000


class FeedbackCollector:
    """
    Collects and manages user feedback.

    Provides methods for submitting, retrieving, and managing user feedback
    with automatic context collection and validation.

    Example:
        collector = FeedbackCollector(db)
        await collector.initialize()

        feedback = await collector.submit(
            FeedbackSubmitOptions(
                type=FeedbackType.BUG_REPORT,
                title="Application crashes on startup",
                description="The app crashes when I try to open it..."
            )
        )
    """

    def __init__(
        self,
        database: DatabaseManager,
        config: FeedbackCollectorConfig | None = None,
    ) -> None:
        """
        Initialize feedback collector.

        Args:
            database: Database manager instance.
            config: Collector configuration.
        """
        self._db = database
        self._config = config or FeedbackCollectorConfig()
        self._event_handlers: dict[str, list[Callable]] = {}

    async def initialize(self) -> None:
        """Initialize database tables for feedback."""
        # Feedback table
        await self._db.execute("""
            CREATE TABLE IF NOT EXISTS feedback (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                status TEXT NOT NULL,
                priority TEXT NOT NULL,
                source TEXT NOT NULL,
                submitter_id TEXT,
                submitter_email TEXT,
                submitter_name TEXT,
                project_id TEXT,
                submitted_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                tags TEXT,
                context TEXT,
                usability_metrics TEXT
            )
        """)
        await self._db.commit()

        # Feedback attachments table
        await self._db.execute("""
            CREATE TABLE IF NOT EXISTS feedback_attachments (
                id TEXT PRIMARY KEY,
                feedback_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                size INTEGER NOT NULL,
                url TEXT NOT NULL,
                uploaded_at INTEGER NOT NULL,
                FOREIGN KEY (feedback_id) REFERENCES feedback(id) ON DELETE CASCADE
            )
        """)
        await self._db.commit()

        # Create indexes
        await self._db.execute(
            "CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(type)"
        )
        await self._db.execute(
            "CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status)"
        )
        await self._db.execute(
            "CREATE INDEX IF NOT EXISTS idx_feedback_priority ON feedback(priority)"
        )
        await self._db.execute(
            "CREATE INDEX IF NOT EXISTS idx_feedback_project ON feedback(project_id)"
        )
        await self._db.execute(
            "CREATE INDEX IF NOT EXISTS idx_feedback_submitted_at ON feedback(submitted_at)"
        )
        await self._db.commit()

        logger.info("Feedback collector initialized")

    def on(self, event: str, handler: Callable) -> None:
        """Register an event handler."""
        if event not in self._event_handlers:
            self._event_handlers[event] = []
        self._event_handlers[event].append(handler)

    def _emit(self, event: str, data: Any) -> None:
        """Emit an event to registered handlers."""
        if event in self._event_handlers:
            for handler in self._event_handlers[event]:
                try:
                    handler(data)
                except Exception as e:
                    logger.error(f"Event handler error: {e}")

    async def submit(self, options: FeedbackSubmitOptions) -> Feedback:
        """
        Submit new feedback.

        Args:
            options: Feedback submission options.

        Returns:
            Created feedback object.

        Raises:
            ValueError: If validation fails.
        """
        # Validate feedback
        self._validate_feedback(options)

        # Calculate priority if not provided
        priority = options.priority or self._calculate_priority(options)

        # Create feedback
        now = int(datetime.now(timezone.utc).timestamp() * 1000)
        feedback = Feedback(
            id=str(uuid.uuid4()),
            type=options.type,
            title=options.title,
            description=options.description,
            status=FeedbackStatus.NEW,
            priority=priority,
            source=options.source or FeedbackSource.IN_APP,
            submitter=options.submitter or Submitter(),
            project_id=options.project_id,
            submitted_at=now,
            updated_at=now,
            tags=options.tags or [],
            attachments=options.attachments,
        )

        # Check anonymous feedback
        if not self._config.allow_anonymous:
            if not feedback.submitter.id and not feedback.submitter.email:
                raise ValueError("Anonymous feedback is not allowed")

        # Collect context if enabled
        context = None
        if self._config.auto_collect_context and options.attach_context:
            context = await self._collect_context(options.project_id)
            feedback.context = context

        # Save to database
        await self._save_feedback(feedback, options.usability_metrics)

        # Save attachments
        if feedback.attachments:
            await self._save_attachments(feedback.id, feedback.attachments)

        # Emit event
        event = FeedbackEvent(
            type=FeedbackEventType.FEEDBACK_SUBMITTED,
            feedback_id=feedback.id,
            timestamp=now,
            details={"type": feedback.type.value, "priority": feedback.priority.value},
        )
        self._emit("feedback_submitted", event)

        logger.info(
            "Feedback submitted",
            {"id": feedback.id, "type": feedback.type.value, "priority": feedback.priority.value},
        )

        return feedback

    def _validate_feedback(self, options: FeedbackSubmitOptions) -> None:
        """Validate feedback submission options."""
        if not options.title or not options.title.strip():
            raise ValueError("Feedback title is required")

        if not options.description or not options.description.strip():
            raise ValueError("Feedback description is required")

        if len(options.title) > self._config.title_max_length:
            raise ValueError(
                f"Feedback title is too long (max {self._config.title_max_length} characters)"
            )

        if len(options.description) > self._config.description_max_length:
            raise ValueError(
                f"Feedback description is too long (max {self._config.description_max_length} characters)"
            )

        # Validate attachments
        if options.attachments:
            if len(options.attachments) > self._config.max_attachments:
                raise ValueError(
                    f"Too many attachments (max {self._config.max_attachments})"
                )

            for attachment in options.attachments:
                if attachment.size > self._config.max_attachment_size:
                    raise ValueError(
                        f"Attachment {attachment.filename} is too large "
                        f"(max {self._config.max_attachment_size} bytes)"
                    )

    def _calculate_priority(self, options: FeedbackSubmitOptions) -> FeedbackPriority:
        """Calculate priority based on feedback type and content."""
        # Type-based default priority
        type_priority = {
            FeedbackType.BUG_REPORT: FeedbackPriority.HIGH,
            FeedbackType.PERFORMANCE_ISSUE: FeedbackPriority.HIGH,
            FeedbackType.USABILITY_ISSUE: FeedbackPriority.MEDIUM,
            FeedbackType.FEATURE_REQUEST: FeedbackPriority.MEDIUM,
            FeedbackType.DOCUMENTATION: FeedbackPriority.LOW,
            FeedbackType.GENERAL: FeedbackPriority.LOW,
            FeedbackType.PRAISE: FeedbackPriority.LOW,
        }

        priority = type_priority.get(options.type, FeedbackPriority.MEDIUM)

        # Keyword-based priority adjustment
        critical_keywords = [
            "crash",
            "error",
            "broken",
            "security",
            "data loss",
            "critical",
        ]
        high_keywords = ["bug", "issue", "problem", "slow", "performance"]

        lower_description = options.description.lower()

        if any(keyword in lower_description for keyword in critical_keywords):
            priority = FeedbackPriority.CRITICAL
        elif (
            any(keyword in lower_description for keyword in high_keywords)
            and priority == FeedbackPriority.MEDIUM
        ):
            priority = FeedbackPriority.HIGH

        return priority

    async def _collect_context(self, project_id: str | None = None) -> FeedbackContext:
        """Collect system and project context."""
        import psutil

        # System info
        memory = psutil.virtual_memory()
        system_info = SystemInfo(
            platform=platform.system(),
            version=platform.version(),
            node_version=platform.python_version(),
            cpu_arch=platform.machine(),
            memory_total=memory.total,
            memory_free=memory.available,
        )

        context = FeedbackContext(system=system_info)

        # Performance info
        try:
            cpu_percent = psutil.cpu_percent(interval=0.1)
            context.performance = PerformanceInfo(
                cpu_usage=cpu_percent,
                memory_usage=memory.percent,
                event_queue_size=0,
                response_time=0,
            )
        except Exception as e:
            logger.warn(f"Failed to collect performance context: {e}")

        return context

    async def _save_feedback(
        self,
        feedback: Feedback,
        usability_metrics: UsabilityMetrics | None = None,
    ) -> None:
        """Save feedback to database."""
        await self._db.execute(
            """
            INSERT INTO feedback (
                id, type, title, description, status, priority, source,
                submitter_id, submitter_email, submitter_name, project_id,
                submitted_at, updated_at, tags, context, usability_metrics
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                feedback.id,
                feedback.type.value,
                feedback.title,
                feedback.description,
                feedback.status.value,
                feedback.priority.value,
                feedback.source.value,
                feedback.submitter.id,
                feedback.submitter.email,
                feedback.submitter.name,
                feedback.project_id,
                feedback.submitted_at,
                feedback.updated_at,
                json.dumps(feedback.tags),
                json.dumps(feedback.context.model_dump()) if feedback.context else None,
                json.dumps(usability_metrics.model_dump()) if usability_metrics else None,
            ),
        )
        await self._db.commit()

    async def _save_attachments(
        self, feedback_id: str, attachments: list[FeedbackAttachment]
    ) -> None:
        """Save feedback attachments to database."""
        for attachment in attachments:
            await self._db.execute(
                """
                INSERT INTO feedback_attachments (
                    id, feedback_id, filename, mime_type, size, url, uploaded_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    attachment.id,
                    feedback_id,
                    attachment.filename,
                    attachment.mime_type,
                    attachment.size,
                    attachment.url,
                    attachment.uploaded_at,
                ),
            )
        await self._db.commit()

    async def get_feedback(self, feedback_id: str) -> Feedback | None:
        """
        Get feedback by ID.

        Args:
            feedback_id: Feedback ID.

        Returns:
            Feedback object or None if not found.
        """
        row = await self._db.fetch_one(
            "SELECT * FROM feedback WHERE id = ?", (feedback_id,)
        )

        if not row:
            return None

        # Get attachments
        attachment_rows = await self._db.fetch_all(
            "SELECT * FROM feedback_attachments WHERE feedback_id = ?",
            (feedback_id,),
        )

        attachments = [
            FeedbackAttachment(
                id=att["id"],
                filename=att["filename"],
                mime_type=att["mime_type"],
                size=att["size"],
                url=att["url"],
                uploaded_at=att["uploaded_at"],
            )
            for att in attachment_rows
        ]

        return Feedback(
            id=row["id"],
            type=FeedbackType(row["type"]),
            title=row["title"],
            description=row["description"],
            status=FeedbackStatus(row["status"]),
            priority=FeedbackPriority(row["priority"]),
            source=FeedbackSource(row["source"]),
            submitter=Submitter(
                id=row.get("submitter_id"),
                email=row.get("submitter_email"),
                name=row.get("submitter_name"),
            ),
            project_id=row.get("project_id"),
            submitted_at=row["submitted_at"],
            updated_at=row["updated_at"],
            tags=json.loads(row["tags"]) if row.get("tags") else [],
            attachments=attachments if attachments else None,
        )

    async def list_feedbacks(
        self,
        filters: FeedbackFilter | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Feedback]:
        """
        List feedbacks with optional filters.

        Args:
            filters: Optional filter criteria.
            limit: Maximum number of results.
            offset: Result offset for pagination.

        Returns:
            List of feedback objects.
        """
        query = "SELECT * FROM feedback WHERE 1=1"
        params: list[Any] = []

        if filters:
            if filters.types:
                placeholders = ",".join("?" * len(filters.types))
                query += f" AND type IN ({placeholders})"
                params.extend([t.value for t in filters.types])

            if filters.statuses:
                placeholders = ",".join("?" * len(filters.statuses))
                query += f" AND status IN ({placeholders})"
                params.extend([s.value for s in filters.statuses])

            if filters.priorities:
                placeholders = ",".join("?" * len(filters.priorities))
                query += f" AND priority IN ({placeholders})"
                params.extend([p.value for p in filters.priorities])

            if filters.sources:
                placeholders = ",".join("?" * len(filters.sources))
                query += f" AND source IN ({placeholders})"
                params.extend([s.value for s in filters.sources])

            if filters.project_id:
                query += " AND project_id = ?"
                params.append(filters.project_id)

            if filters.date_start:
                query += " AND submitted_at >= ?"
                params.append(filters.date_start)

            if filters.date_end:
                query += " AND submitted_at <= ?"
                params.append(filters.date_end)

            if filters.query:
                query += " AND (title LIKE ? OR description LIKE ?)"
                search_term = f"%{filters.query}%"
                params.extend([search_term, search_term])

        query += " ORDER BY submitted_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        rows = await self._db.fetch_all(query, tuple(params))

        return [
            Feedback(
                id=row["id"],
                type=FeedbackType(row["type"]),
                title=row["title"],
                description=row["description"],
                status=FeedbackStatus(row["status"]),
                priority=FeedbackPriority(row["priority"]),
                source=FeedbackSource(row["source"]),
                submitter=Submitter(
                    id=row.get("submitter_id"),
                    email=row.get("submitter_email"),
                    name=row.get("submitter_name"),
                ),
                project_id=row.get("project_id"),
                submitted_at=row["submitted_at"],
                updated_at=row["updated_at"],
                tags=json.loads(row["tags"]) if row.get("tags") else [],
            )
            for row in rows
        ]

    async def update_status(
        self, feedback_id: str, status: FeedbackStatus
    ) -> Feedback | None:
        """
        Update feedback status.

        Args:
            feedback_id: Feedback ID.
            status: New status.

        Returns:
            Updated feedback or None if not found.
        """
        now = int(datetime.now(timezone.utc).timestamp() * 1000)

        await self._db.execute(
            "UPDATE feedback SET status = ?, updated_at = ? WHERE id = ?",
            (status.value, now, feedback_id),
        )
        await self._db.commit()

        # Emit event
        event = FeedbackEvent(
            type=FeedbackEventType.FEEDBACK_STATUS_CHANGED,
            feedback_id=feedback_id,
            timestamp=now,
            details={"new_status": status.value},
        )
        self._emit("feedback_status_changed", event)

        logger.info("Feedback status updated", {"id": feedback_id, "status": status.value})

        return await self.get_feedback(feedback_id)

    async def update_priority(
        self, feedback_id: str, priority: FeedbackPriority
    ) -> Feedback | None:
        """
        Update feedback priority.

        Args:
            feedback_id: Feedback ID.
            priority: New priority.

        Returns:
            Updated feedback or None if not found.
        """
        now = int(datetime.now(timezone.utc).timestamp() * 1000)

        await self._db.execute(
            "UPDATE feedback SET priority = ?, updated_at = ? WHERE id = ?",
            (priority.value, now, feedback_id),
        )
        await self._db.commit()

        logger.info("Feedback priority updated", {"id": feedback_id, "priority": priority.value})

        return await self.get_feedback(feedback_id)

    async def add_comment(self, feedback_id: str, comment: str) -> Feedback | None:
        """
        Add a comment to feedback (stored in tags for simplicity).

        Args:
            feedback_id: Feedback ID.
            comment: Comment text.

        Returns:
            Updated feedback or None if not found.
        """
        feedback = await self.get_feedback(feedback_id)
        if not feedback:
            return None

        # Add comment as a tag with timestamp
        now = int(datetime.now(timezone.utc).timestamp() * 1000)
        comment_tag = f"comment:{now}:{comment}"
        feedback.tags.append(comment_tag)

        await self._db.execute(
            "UPDATE feedback SET tags = ?, updated_at = ? WHERE id = ?",
            (json.dumps(feedback.tags), now, feedback_id),
        )
        await self._db.commit()

        return await self.get_feedback(feedback_id)

    async def delete_feedback(self, feedback_id: str) -> bool:
        """
        Delete feedback.

        Args:
            feedback_id: Feedback ID.

        Returns:
            True if deleted, False if not found.
        """
        cursor = await self._db.execute(
            "DELETE FROM feedback WHERE id = ?", (feedback_id,)
        )
        await self._db.commit()

        if cursor.rowcount > 0:
            logger.info("Feedback deleted", {"id": feedback_id})
            return True

        return False

    async def get_stats(self, project_id: str | None = None) -> FeedbackStats:
        """
        Get feedback statistics.

        Args:
            project_id: Optional project filter.

        Returns:
            Feedback statistics.
        """
        base_query = "FROM feedback"
        params: list[Any] = []

        if project_id:
            base_query += " WHERE project_id = ?"
            params.append(project_id)

        # Total count
        total_row = await self._db.fetch_one(
            f"SELECT COUNT(*) as count {base_query}", tuple(params)
        )
        total = total_row["count"] if total_row else 0

        # By type
        type_rows = await self._db.fetch_all(
            f"SELECT type, COUNT(*) as count {base_query} GROUP BY type",
            tuple(params),
        )
        by_type = {row["type"]: row["count"] for row in type_rows}

        # By status
        status_rows = await self._db.fetch_all(
            f"SELECT status, COUNT(*) as count {base_query} GROUP BY status",
            tuple(params),
        )
        by_status = {row["status"]: row["count"] for row in status_rows}

        # By priority
        priority_rows = await self._db.fetch_all(
            f"SELECT priority, COUNT(*) as count {base_query} GROUP BY priority",
            tuple(params),
        )
        by_priority = {row["priority"]: row["count"] for row in priority_rows}

        return FeedbackStats(
            total=total,
            by_type=by_type,
            by_status=by_status,
            by_priority=by_priority,
        )
