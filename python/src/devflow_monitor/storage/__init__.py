"""
Storage module for DevFlow Monitor.

Provides database management and repository pattern implementation
for persisting events, activities, and metrics.
"""

from .database import (
    DatabaseConfig,
    DatabaseManager,
    get_database_manager,
    close_database_manager,
)
from .storage_manager import (
    StorageManager,
    get_storage_manager,
    close_storage_manager,
)
from .repositories.base import BaseRepository, QueryOptions, OrderDirection
from .repositories.event import EventRepository, EventRecord
from .repositories.activity import ActivityRepository, ActivityRecord
from .repositories.metrics import MetricsRepository, MetricsRecord, AggregationType
from .repositories.stage_transition import StageTransitionRepository
from .types import (
    StageTransitionRecord,
    FileMonitorCacheRecord,
    MigrationRecord,
    TransitionStatistics,
    StageSequenceEntry,
    SyncStatus,
)
from .schemas import (
    TABLE_SCHEMAS,
    MIGRATIONS,
    get_all_schemas,
    get_initial_migration_sql,
    get_schema_for_table,
    get_pending_migrations,
)

__all__ = [
    # Database
    "DatabaseConfig",
    "DatabaseManager",
    "get_database_manager",
    "close_database_manager",
    # Storage Manager
    "StorageManager",
    "get_storage_manager",
    "close_storage_manager",
    # Base Repository
    "BaseRepository",
    "QueryOptions",
    "OrderDirection",
    # Event Repository
    "EventRepository",
    "EventRecord",
    # Activity Repository
    "ActivityRepository",
    "ActivityRecord",
    # Metrics Repository
    "MetricsRepository",
    "MetricsRecord",
    "AggregationType",
    # Stage Transition Repository
    "StageTransitionRepository",
    "StageTransitionRecord",
    "TransitionStatistics",
    "StageSequenceEntry",
    # Additional Types
    "FileMonitorCacheRecord",
    "MigrationRecord",
    "SyncStatus",
    # Schemas
    "TABLE_SCHEMAS",
    "MIGRATIONS",
    "get_all_schemas",
    "get_initial_migration_sql",
    "get_schema_for_table",
    "get_pending_migrations",
]
