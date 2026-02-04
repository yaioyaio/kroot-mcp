"""
Database Manager for DevFlow Monitor.

Provides async SQLite database access using aiosqlite with connection pooling,
automatic migrations, and transaction support.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator

import aiosqlite

logger = logging.getLogger(__name__)


class DatabaseConfig:
    """Database configuration options."""

    def __init__(
        self,
        path: str = "data/devflow.db",
        timeout: float = 30.0,
        check_same_thread: bool = False,
        isolation_level: str | None = None,
    ) -> None:
        """
        Initialize database configuration.

        Args:
            path: Path to the SQLite database file.
            timeout: Connection timeout in seconds.
            check_same_thread: Whether to check thread safety.
            isolation_level: SQLite isolation level.
        """
        self.path = path
        self.timeout = timeout
        self.check_same_thread = check_same_thread
        self.isolation_level = isolation_level


# Table creation SQL statements
MIGRATIONS = [
    # Migration 1: Initial schema
    {
        "version": 1,
        "name": "initial_schema",
        "sql": """
            -- Events table
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                category TEXT NOT NULL,
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

            -- Activities table
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

            -- Metrics table
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

            -- Migrations table
            CREATE TABLE IF NOT EXISTS migrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version INTEGER NOT NULL UNIQUE,
                name TEXT NOT NULL,
                applied_at INTEGER NOT NULL
            );

            -- Create indexes
            CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
            CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
            CREATE INDEX IF NOT EXISTS idx_events_severity ON events(severity);
            CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
            CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
            CREATE INDEX IF NOT EXISTS idx_events_sync_status ON events(sync_status);

            CREATE INDEX IF NOT EXISTS idx_activities_event_id ON activities(event_id);
            CREATE INDEX IF NOT EXISTS idx_activities_stage ON activities(stage);
            CREATE INDEX IF NOT EXISTS idx_activities_timestamp ON activities(timestamp);

            CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(name);
            CREATE INDEX IF NOT EXISTS idx_metrics_type ON metrics(metric_type);
            CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);
        """,
    },
]


class DatabaseManager:
    """
    Async SQLite database manager with connection pooling.

    Provides database access, automatic migrations, and transaction support.
    Uses aiosqlite for asynchronous operations.

    Example:
        async with DatabaseManager() as db:
            await db.execute("SELECT * FROM events")
    """

    def __init__(self, config: DatabaseConfig | None = None) -> None:
        """
        Initialize the database manager.

        Args:
            config: Database configuration options.
        """
        self._config = config or DatabaseConfig()
        self._connection: aiosqlite.Connection | None = None
        self._lock = asyncio.Lock()
        self._initialized = False
        self._stats = {
            "queries_executed": 0,
            "transactions_committed": 0,
            "transactions_rolled_back": 0,
            "connections_opened": 0,
            "connections_closed": 0,
        }

    @property
    def is_initialized(self) -> bool:
        """Check if database is initialized."""
        return self._initialized

    @property
    def stats(self) -> dict[str, int]:
        """Get database statistics."""
        return self._stats.copy()

    async def initialize(self) -> None:
        """Initialize the database connection and run migrations."""
        if self._initialized:
            return

        async with self._lock:
            if self._initialized:
                return

            # Ensure directory exists
            db_path = Path(self._config.path)
            db_path.parent.mkdir(parents=True, exist_ok=True)

            # Open connection
            self._connection = await aiosqlite.connect(
                self._config.path,
                timeout=self._config.timeout,
                check_same_thread=self._config.check_same_thread,
                isolation_level=self._config.isolation_level,
            )

            # Enable foreign keys and WAL mode
            await self._connection.execute("PRAGMA foreign_keys = ON")
            await self._connection.execute("PRAGMA journal_mode = WAL")
            await self._connection.execute("PRAGMA synchronous = NORMAL")

            self._stats["connections_opened"] += 1

            # Run migrations
            await self._run_migrations()

            self._initialized = True
            logger.info(f"Database initialized: {self._config.path}")

    async def close(self) -> None:
        """Close the database connection."""
        if self._connection:
            async with self._lock:
                if self._connection:
                    await self._connection.close()
                    self._connection = None
                    self._initialized = False
                    self._stats["connections_closed"] += 1
                    logger.info("Database connection closed")

    async def _ensure_connection(self) -> aiosqlite.Connection:
        """Ensure database connection is available."""
        if not self._initialized or not self._connection:
            await self.initialize()
        return self._connection  # type: ignore

    async def _run_migrations(self) -> None:
        """Run pending database migrations."""
        if not self._connection:
            return

        # Get applied migrations
        try:
            cursor = await self._connection.execute(
                "SELECT version FROM migrations ORDER BY version"
            )
            applied = {row[0] async for row in cursor}
        except aiosqlite.OperationalError:
            # migrations table doesn't exist yet
            applied = set()

        # Apply pending migrations
        for migration in MIGRATIONS:
            version = migration["version"]
            if version not in applied:
                logger.info(f"Applying migration {version}: {migration['name']}")

                # Execute migration SQL
                await self._connection.executescript(migration["sql"])

                # Record migration
                now = int(datetime.now(timezone.utc).timestamp() * 1000)
                await self._connection.execute(
                    "INSERT INTO migrations (version, name, applied_at) VALUES (?, ?, ?)",
                    (version, migration["name"], now),
                )
                await self._connection.commit()

                logger.info(f"Migration {version} applied successfully")

    async def execute(
        self, sql: str, parameters: tuple[Any, ...] | None = None
    ) -> aiosqlite.Cursor:
        """
        Execute a SQL statement.

        Args:
            sql: SQL statement to execute.
            parameters: Query parameters.

        Returns:
            Database cursor.
        """
        conn = await self._ensure_connection()
        self._stats["queries_executed"] += 1

        if parameters:
            return await conn.execute(sql, parameters)
        return await conn.execute(sql)

    async def execute_many(
        self, sql: str, parameters_list: list[tuple[Any, ...]]
    ) -> aiosqlite.Cursor:
        """
        Execute a SQL statement with multiple parameter sets.

        Args:
            sql: SQL statement to execute.
            parameters_list: List of parameter tuples.

        Returns:
            Database cursor.
        """
        conn = await self._ensure_connection()
        self._stats["queries_executed"] += len(parameters_list)
        return await conn.executemany(sql, parameters_list)

    async def fetch_one(
        self, sql: str, parameters: tuple[Any, ...] | None = None
    ) -> dict[str, Any] | None:
        """
        Fetch a single row as a dictionary.

        Args:
            sql: SQL query to execute.
            parameters: Query parameters.

        Returns:
            Row as dictionary or None.
        """
        conn = await self._ensure_connection()
        conn.row_factory = aiosqlite.Row
        self._stats["queries_executed"] += 1

        cursor = await conn.execute(sql, parameters or ())
        row = await cursor.fetchone()

        if row:
            return dict(row)
        return None

    async def fetch_all(
        self, sql: str, parameters: tuple[Any, ...] | None = None
    ) -> list[dict[str, Any]]:
        """
        Fetch all rows as dictionaries.

        Args:
            sql: SQL query to execute.
            parameters: Query parameters.

        Returns:
            List of rows as dictionaries.
        """
        conn = await self._ensure_connection()
        conn.row_factory = aiosqlite.Row
        self._stats["queries_executed"] += 1

        cursor = await conn.execute(sql, parameters or ())
        rows = await cursor.fetchall()

        return [dict(row) for row in rows]

    async def commit(self) -> None:
        """Commit the current transaction."""
        conn = await self._ensure_connection()
        await conn.commit()
        self._stats["transactions_committed"] += 1

    async def rollback(self) -> None:
        """Rollback the current transaction."""
        conn = await self._ensure_connection()
        await conn.rollback()
        self._stats["transactions_rolled_back"] += 1

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[None]:
        """
        Context manager for database transactions.

        Example:
            async with db.transaction():
                await db.execute("INSERT INTO events ...")
                await db.execute("UPDATE activities ...")
        """
        conn = await self._ensure_connection()
        try:
            yield
            await conn.commit()
            self._stats["transactions_committed"] += 1
        except Exception:
            await conn.rollback()
            self._stats["transactions_rolled_back"] += 1
            raise

    async def vacuum(self) -> None:
        """Vacuum the database to reclaim space."""
        conn = await self._ensure_connection()
        await conn.execute("VACUUM")
        logger.info("Database vacuumed")

    async def backup(self, destination_path: str) -> None:
        """
        Create a backup of the database.

        Args:
            destination_path: Path to save the backup.
        """
        conn = await self._ensure_connection()

        # Ensure destination directory exists
        dest = Path(destination_path)
        dest.parent.mkdir(parents=True, exist_ok=True)

        # Create backup
        async with aiosqlite.connect(destination_path) as backup_conn:
            await conn.backup(backup_conn)

        logger.info(f"Database backed up to: {destination_path}")

    async def get_table_stats(self) -> dict[str, int]:
        """Get row counts for all tables."""
        tables = ["events", "activities", "metrics", "migrations"]
        stats = {}

        for table in tables:
            try:
                result = await self.fetch_one(f"SELECT COUNT(*) as count FROM {table}")
                stats[table] = result["count"] if result else 0
            except aiosqlite.OperationalError:
                stats[table] = 0

        return stats

    def get_stats(self) -> dict[str, Any]:
        """Get database statistics."""
        return {
            "path": self._config.path,
            "initialized": self._initialized,
            "queries_executed": self._stats["queries_executed"],
            "transactions_committed": self._stats["transactions_committed"],
            "transactions_rolled_back": self._stats["transactions_rolled_back"],
        }

    async def __aenter__(self) -> "DatabaseManager":
        """Async context manager entry."""
        await self.initialize()
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Async context manager exit."""
        await self.close()


# Singleton instance
_database_instance: DatabaseManager | None = None
_instance_lock = asyncio.Lock()


async def get_database_manager(
    config: DatabaseConfig | None = None,
) -> DatabaseManager:
    """
    Get the singleton database manager instance.

    Args:
        config: Database configuration (only used on first call).

    Returns:
        DatabaseManager singleton instance.
    """
    global _database_instance

    if _database_instance is None:
        async with _instance_lock:
            if _database_instance is None:
                _database_instance = DatabaseManager(config)
                await _database_instance.initialize()

    return _database_instance


async def close_database_manager() -> None:
    """Close the singleton database manager."""
    global _database_instance

    if _database_instance:
        async with _instance_lock:
            if _database_instance:
                await _database_instance.close()
                _database_instance = None
