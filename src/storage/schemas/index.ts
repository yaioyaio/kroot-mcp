/**
 * Database schema definitions
 */

export const SCHEMA_SQL = `
-- DevFlow Monitor MCP Database Schema
-- SQLite3 Database Schema for storing events, activities, metrics, and more

-- Events table: Core event storage
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    data TEXT NOT NULL, -- JSON data
    sync_id TEXT,
    sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'failed')),
    device_id TEXT,
    user_id TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Index for event queries
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_sync_status ON events(sync_status);

-- Activity logs table: Processed activities from events
CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stage TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    actor TEXT NOT NULL,
    metadata TEXT, -- JSON metadata
    timestamp INTEGER NOT NULL,
    event_id INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

-- Index for activity queries
CREATE INDEX IF NOT EXISTS idx_activities_stage ON activities(stage);
CREATE INDEX IF NOT EXISTS idx_activities_timestamp ON activities(timestamp);
CREATE INDEX IF NOT EXISTS idx_activities_actor ON activities(actor);

-- Metrics table: Aggregated metrics storage
CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_type TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    value REAL NOT NULL,
    timestamp INTEGER NOT NULL,
    timeframe TEXT NOT NULL, -- '1h', '1d', '1w', '1m'
    metadata TEXT, -- JSON metadata
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Index for metrics queries
CREATE INDEX IF NOT EXISTS idx_metrics_type_name ON metrics(metric_type, metric_name);
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_metrics_timeframe ON metrics(timeframe);

-- Stage transitions table: Track development stage changes
CREATE TABLE IF NOT EXISTS stage_transitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_stage TEXT,
    to_stage TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
    metadata TEXT, -- JSON metadata
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Index for stage transition queries
CREATE INDEX IF NOT EXISTS idx_stage_transitions_timestamp ON stage_transitions(timestamp);
CREATE INDEX IF NOT EXISTS idx_stage_transitions_stages ON stage_transitions(from_stage, to_stage);

-- File monitor cache table: Cache file states to detect changes
CREATE TABLE IF NOT EXISTS file_monitor_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL UNIQUE,
    file_hash TEXT NOT NULL,
    last_modified INTEGER NOT NULL,
    file_size INTEGER NOT NULL,
    metadata TEXT, -- JSON metadata
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Index for file monitor cache
CREATE INDEX IF NOT EXISTS idx_file_monitor_cache_path ON file_monitor_cache(file_path);
CREATE INDEX IF NOT EXISTS idx_file_monitor_cache_modified ON file_monitor_cache(last_modified);

-- Migrations table: Track database migrations
CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL,
    applied_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Triggers to update timestamps
CREATE TRIGGER IF NOT EXISTS update_events_timestamp 
AFTER UPDATE ON events
BEGIN
    UPDATE events SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_file_monitor_cache_timestamp 
AFTER UPDATE ON file_monitor_cache
BEGIN
    UPDATE file_monitor_cache SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;
`;
