"""
Database Schemas for DevFlow Monitor.

Defines SQL schema definitions for all database tables used in the
DevFlow Monitor storage layer.
"""

from __future__ import annotations


# Events table schema
EVENTS_SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'system',
    severity TEXT NOT NULL DEFAULT 'info',
    timestamp INTEGER NOT NULL,
    source TEXT NOT NULL,
    data TEXT DEFAULT '{}',
    metadata TEXT DEFAULT '{}',
    correlation_id TEXT,
    parent_id TEXT,
    sync_status TEXT DEFAULT 'pending',
    sync_id TEXT,
    device_id TEXT,
    user_id TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);
"""

# Events indexes
EVENTS_INDEXES = """
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
CREATE INDEX IF NOT EXISTS idx_events_severity ON events(severity);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
CREATE INDEX IF NOT EXISTS idx_events_sync_status ON events(sync_status);
CREATE INDEX IF NOT EXISTS idx_events_type_timestamp ON events(type, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_correlation_id ON events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_events_parent_id ON events(parent_id);
"""

# Activities table schema
ACTIVITIES_SCHEMA = """
CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER,
    stage TEXT NOT NULL,
    action TEXT NOT NULL,
    description TEXT,
    details TEXT,
    actor TEXT,
    metadata TEXT,
    timestamp INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
);
"""

# Activities indexes
ACTIVITIES_INDEXES = """
CREATE INDEX IF NOT EXISTS idx_activities_event_id ON activities(event_id);
CREATE INDEX IF NOT EXISTS idx_activities_stage ON activities(stage);
CREATE INDEX IF NOT EXISTS idx_activities_action ON activities(action);
CREATE INDEX IF NOT EXISTS idx_activities_timestamp ON activities(timestamp);
CREATE INDEX IF NOT EXISTS idx_activities_stage_action ON activities(stage, action);
CREATE INDEX IF NOT EXISTS idx_activities_actor_timestamp ON activities(actor, timestamp);
"""

# Metrics table schema
METRICS_SCHEMA = """
CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    metric_type TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    value REAL NOT NULL,
    timestamp INTEGER NOT NULL,
    timeframe TEXT DEFAULT 'instant',
    tags TEXT DEFAULT '[]',
    metadata TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);
"""

# Metrics indexes
METRICS_INDEXES = """
CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(name);
CREATE INDEX IF NOT EXISTS idx_metrics_type ON metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_metrics_full ON metrics(metric_type, metric_name, timeframe, timestamp);
"""

# Stage transitions table schema
STAGE_TRANSITIONS_SCHEMA = """
CREATE TABLE IF NOT EXISTS stage_transitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_stage TEXT,
    to_stage TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    confidence REAL NOT NULL DEFAULT 1.0,
    metadata TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);
"""

# Stage transitions indexes
STAGE_TRANSITIONS_INDEXES = """
CREATE INDEX IF NOT EXISTS idx_stage_transitions_from ON stage_transitions(from_stage);
CREATE INDEX IF NOT EXISTS idx_stage_transitions_to ON stage_transitions(to_stage);
CREATE INDEX IF NOT EXISTS idx_stage_transitions_timestamp ON stage_transitions(timestamp);
CREATE INDEX IF NOT EXISTS idx_stage_transitions_confidence ON stage_transitions(confidence);
"""

# File monitor cache table schema
FILE_MONITOR_CACHE_SCHEMA = """
CREATE TABLE IF NOT EXISTS file_monitor_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL UNIQUE,
    file_hash TEXT NOT NULL,
    last_modified INTEGER NOT NULL,
    file_size INTEGER NOT NULL,
    metadata TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);
"""

# File monitor cache indexes
FILE_MONITOR_CACHE_INDEXES = """
CREATE INDEX IF NOT EXISTS idx_file_monitor_cache_path ON file_monitor_cache(file_path);
CREATE INDEX IF NOT EXISTS idx_file_monitor_cache_hash ON file_monitor_cache(file_hash);
"""

# Migrations table schema
MIGRATIONS_SCHEMA = """
CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
);
"""

# All table schemas in order
TABLE_SCHEMAS = [
    ("events", EVENTS_SCHEMA, EVENTS_INDEXES),
    ("activities", ACTIVITIES_SCHEMA, ACTIVITIES_INDEXES),
    ("metrics", METRICS_SCHEMA, METRICS_INDEXES),
    ("stage_transitions", STAGE_TRANSITIONS_SCHEMA, STAGE_TRANSITIONS_INDEXES),
    ("file_monitor_cache", FILE_MONITOR_CACHE_SCHEMA, FILE_MONITOR_CACHE_INDEXES),
    ("migrations", MIGRATIONS_SCHEMA, ""),
]


def get_all_schemas() -> list[str]:
    """
    Get all table schemas as SQL statements.

    Returns:
        List of SQL schema creation statements.
    """
    schemas = []
    for _name, schema, indexes in TABLE_SCHEMAS:
        schemas.append(schema.strip())
        if indexes:
            schemas.append(indexes.strip())
    return schemas


def get_initial_migration_sql() -> str:
    """
    Get the complete initial migration SQL.

    Returns:
        Complete SQL for initial database setup.
    """
    return "\n".join(get_all_schemas())


def get_schema_for_table(table_name: str) -> str | None:
    """
    Get the schema for a specific table.

    Args:
        table_name: Name of the table.

    Returns:
        SQL schema string or None if table not found.
    """
    for name, schema, indexes in TABLE_SCHEMAS:
        if name == table_name:
            result = schema.strip()
            if indexes:
                result += "\n" + indexes.strip()
            return result
    return None


# Migration definitions for incremental updates
MIGRATIONS = [
    {
        "version": 1,
        "name": "initial_schema",
        "sql": get_initial_migration_sql(),
    },
    {
        "version": 2,
        "name": "add_performance_indexes",
        "sql": """
            -- Composite index for event queries
            CREATE INDEX IF NOT EXISTS idx_events_type_category ON events(type, category);

            -- Composite index for time-based queries
            CREATE INDEX IF NOT EXISTS idx_events_timestamp_type ON events(timestamp, type);

            -- Index for metadata search (JSON)
            CREATE INDEX IF NOT EXISTS idx_activities_metadata ON activities(metadata);
        """,
    },
    {
        "version": 3,
        "name": "add_event_correlation",
        "sql": """
            -- Already included in initial schema but kept for migration reference
            -- Correlation and parent indexes are part of initial schema
        """,
    },
]


def get_pending_migrations(current_version: int) -> list[dict]:
    """
    Get migrations that need to be applied.

    Args:
        current_version: Current database schema version.

    Returns:
        List of migration dictionaries to apply.
    """
    return [m for m in MIGRATIONS if m["version"] > current_version]
