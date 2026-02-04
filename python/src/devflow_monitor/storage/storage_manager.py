"""
Storage Manager for DevFlow Monitor.

Provides unified access to all repositories and manages database lifecycle.
Integrates with the EventEngine for automatic event persistence.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, TYPE_CHECKING

from .database import (
    DatabaseConfig,
    DatabaseManager,
    get_database_manager,
    close_database_manager,
)
from .repositories.activity import ActivityRecord, ActivityRepository
from .repositories.event import EventRecord, EventRepository
from .repositories.metrics import MetricsRecord, MetricsRepository

if TYPE_CHECKING:
    from ..events.types.base import BaseEvent, EventCategory

logger = logging.getLogger(__name__)


class StorageManager:
    """
    Central storage manager for coordinating database operations.

    Provides unified access to all repositories and handles automatic
    event persistence when connected to an EventEngine.

    Example:
        async with StorageManager() as storage:
            events = await storage.events.find_all()
            activities = await storage.activities.get_recent(10)
    """

    def __init__(self, config: DatabaseConfig | None = None) -> None:
        """
        Initialize the storage manager.

        Args:
            config: Database configuration options.
        """
        self._config = config
        self._db: DatabaseManager | None = None
        self._event_repo: EventRepository | None = None
        self._activity_repo: ActivityRepository | None = None
        self._metrics_repo: MetricsRepository | None = None
        self._event_engine: Any = None
        self._initialized = False
        self._subscription_id: str | None = None

    @property
    def is_initialized(self) -> bool:
        """Check if storage manager is initialized."""
        return self._initialized

    @property
    def events(self) -> EventRepository:
        """Get the event repository."""
        if not self._event_repo:
            raise RuntimeError("StorageManager not initialized. Call initialize() first.")
        return self._event_repo

    @property
    def activities(self) -> ActivityRepository:
        """Get the activity repository."""
        if not self._activity_repo:
            raise RuntimeError("StorageManager not initialized. Call initialize() first.")
        return self._activity_repo

    @property
    def metrics(self) -> MetricsRepository:
        """Get the metrics repository."""
        if not self._metrics_repo:
            raise RuntimeError("StorageManager not initialized. Call initialize() first.")
        return self._metrics_repo

    @property
    def database(self) -> DatabaseManager:
        """Get the database manager."""
        if not self._db:
            raise RuntimeError("StorageManager not initialized. Call initialize() first.")
        return self._db

    async def initialize(self) -> None:
        """Initialize the storage manager and all repositories."""
        if self._initialized:
            return

        # Initialize database
        self._db = DatabaseManager(self._config)
        await self._db.initialize()

        # Initialize repositories
        self._event_repo = EventRepository(self._db)
        self._activity_repo = ActivityRepository(self._db)
        self._metrics_repo = MetricsRepository(self._db)

        self._initialized = True
        logger.info("StorageManager initialized")

    async def close(self) -> None:
        """Close the storage manager and release resources."""
        if not self._initialized:
            return

        # Unsubscribe from event engine if connected
        if self._event_engine and self._subscription_id:
            try:
                self._event_engine.unsubscribe(self._subscription_id)
            except Exception as e:
                logger.warning(f"Failed to unsubscribe from EventEngine: {e}")

        # Close database connection
        if self._db:
            await self._db.close()
            self._db = None

        self._event_repo = None
        self._activity_repo = None
        self._metrics_repo = None
        self._event_engine = None
        self._subscription_id = None
        self._initialized = False

        logger.info("StorageManager closed")

    def connect_event_engine(self, event_engine: Any) -> None:
        """
        Connect to EventEngine for automatic event persistence.

        Args:
            event_engine: EventEngine instance to connect to.
        """
        self._event_engine = event_engine

        # Subscribe to all events for persistence
        async def persist_handler(event: "BaseEvent") -> None:
            await self._persist_event(event)

        # Store subscription ID for later cleanup
        self._subscription_id = self._event_engine.subscribe(
            "*",  # Subscribe to all events
            persist_handler,
            priority=1,  # Low priority, runs after other handlers
        )

        logger.info("StorageManager connected to EventEngine")

    async def _persist_event(self, event: "BaseEvent") -> None:
        """
        Persist an event to storage.

        Args:
            event: Event to persist.
        """
        try:
            # Validate event
            if not event or not event.type or not event.timestamp:
                logger.warning(f"Invalid event received: {event}")
                return

            # Save the event
            event_record = await self.events.create_from_event(event)

            # Process based on event category
            await self._process_event_by_category(event, event_record)

        except Exception as e:
            logger.error(f"Failed to persist event: {e}")

    async def _process_event_by_category(
        self, event: "BaseEvent", event_record: EventRecord
    ) -> None:
        """
        Process event based on its category.

        Args:
            event: The event to process.
            event_record: The persisted event record.
        """
        from ..events.types.base import EventCategory

        category = event.category
        if isinstance(category, str):
            try:
                category = EventCategory(category)
            except ValueError:
                return

        if category == EventCategory.ACTIVITY:
            await self._process_activity_event(event, event_record.id)
        elif category == EventCategory.STAGE:
            await self._process_stage_event(event)
        elif category == EventCategory.FILE:
            await self._process_file_event(event)
        elif category == EventCategory.GIT:
            # Git events might update activity logs
            if event.data.get("action"):
                await self._process_activity_event(event, event_record.id)

    async def _process_activity_event(
        self, event: "BaseEvent", event_id: int | None
    ) -> None:
        """
        Process activity event.

        Args:
            event: The activity event.
            event_id: Associated event record ID.
        """
        stage = event.data.get("stage")
        action = event.data.get("action")
        actor = event.data.get("actor")

        if stage and action and actor and event_id:
            await self.activities.create_from_event(
                event_id=event_id,
                stage=stage,
                action=action,
                actor=actor,
                timestamp=event.timestamp,
                details=event.data.get("details"),
                metadata=event.metadata.model_dump() if event.metadata else None,
            )

    async def _process_stage_event(self, event: "BaseEvent") -> None:
        """
        Process stage transition event.

        Args:
            event: The stage event.
        """
        # Stage transitions can be recorded as activities
        from_stage = event.data.get("from_stage")
        to_stage = event.data.get("to_stage")
        confidence = event.data.get("confidence")

        if to_stage and confidence is not None:
            logger.debug(
                f"Stage transition: {from_stage} -> {to_stage} (confidence: {confidence})"
            )

    async def _process_file_event(self, event: "BaseEvent") -> None:
        """
        Process file event.

        Args:
            event: The file event.
        """
        # File events can be used for tracking file changes
        file_path = event.data.get("file_path")
        if file_path:
            logger.debug(f"File event: {file_path}")

    async def get_statistics(self) -> dict[str, Any]:
        """
        Get comprehensive storage statistics.

        Returns:
            Dictionary with storage statistics.
        """
        if not self._initialized:
            return {"error": "StorageManager not initialized"}

        db_stats = self._db.get_stats() if self._db else {}
        table_stats = await self._db.get_table_stats() if self._db else {}
        event_stats = await self.events.get_statistics()
        activity_stats = await self.activities.get_statistics_by_stage()
        metrics_stats = await self.metrics.get_statistics()

        return {
            "database": db_stats,
            "tables": table_stats,
            "events": event_stats,
            "activities": activity_stats,
            "metrics": metrics_stats,
        }

    async def clean_old_data(self, older_than_days: int = 30) -> dict[str, int]:
        """
        Clean old data from all tables.

        Args:
            older_than_days: Number of days to keep data.

        Returns:
            Dictionary with counts of deleted records.
        """
        cutoff_timestamp = int(
            (datetime.now(timezone.utc).timestamp() - older_than_days * 24 * 60 * 60) * 1000
        )

        events_deleted = await self.events.clean_old_events(cutoff_timestamp)
        activities_deleted = await self.activities.clean_old_activities(cutoff_timestamp)
        metrics_deleted = await self.metrics.clean_old_metrics(cutoff_timestamp)

        # Vacuum database to reclaim space
        if self._db:
            await self._db.vacuum()

        return {
            "events": events_deleted,
            "activities": activities_deleted,
            "metrics": metrics_deleted,
        }

    async def backup(self, destination_path: str) -> None:
        """
        Create a backup of the database.

        Args:
            destination_path: Path to save the backup.
        """
        if self._db:
            await self._db.backup(destination_path)

    def get_metrics_summary(self) -> dict[str, Any]:
        """
        Get a quick summary of storage metrics.

        Returns:
            Dictionary with basic storage metrics.
        """
        if not self._db:
            return {"error": "StorageManager not initialized"}

        return {
            "initialized": self._initialized,
            "database_stats": self._db.get_stats(),
            "connected_to_event_engine": self._event_engine is not None,
        }

    async def __aenter__(self) -> "StorageManager":
        """Async context manager entry."""
        await self.initialize()
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Async context manager exit."""
        await self.close()


# Singleton instance
_storage_instance: StorageManager | None = None
_instance_lock = asyncio.Lock()


async def get_storage_manager(
    config: DatabaseConfig | None = None,
) -> StorageManager:
    """
    Get the singleton storage manager instance.

    Args:
        config: Database configuration (only used on first call).

    Returns:
        StorageManager singleton instance.
    """
    global _storage_instance

    if _storage_instance is None:
        async with _instance_lock:
            if _storage_instance is None:
                _storage_instance = StorageManager(config)
                await _storage_instance.initialize()

    return _storage_instance


async def close_storage_manager() -> None:
    """Close the singleton storage manager."""
    global _storage_instance

    if _storage_instance:
        async with _instance_lock:
            if _storage_instance:
                await _storage_instance.close()
                _storage_instance = None
