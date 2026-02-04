"""
Audit Logger
보안 감사 로그 시스템

This module provides audit logging functionality with SQLite persistence,
log rotation, and query capabilities.
"""

import asyncio
import json
import os
import shutil
import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

from .types import (
    AuditLogConfig,
    AuditLogEntry,
    SecurityEvent,
    SecurityEventType,
)


class AuditQuery:
    """Audit log query parameters."""

    def __init__(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        event_types: Optional[list[SecurityEventType]] = None,
        user_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        resource: Optional[str] = None,
        success: Optional[bool] = None,
        severity: Optional[list[str]] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> None:
        """Initialize audit query."""
        self.start_date = start_date
        self.end_date = end_date
        self.event_types = event_types
        self.user_id = user_id
        self.ip_address = ip_address
        self.resource = resource
        self.success = success
        self.severity = severity
        self.limit = limit
        self.offset = offset


class AuditSummary:
    """Audit log summary statistics."""

    def __init__(
        self,
        total_events: int,
        successful_events: int,
        failed_events: int,
        event_type_distribution: dict[str, int],
        severity_distribution: dict[str, int],
        top_users: list[dict[str, Any]],
        top_ip_addresses: list[dict[str, Any]],
        time_range: dict[str, datetime],
    ) -> None:
        """Initialize audit summary."""
        self.total_events = total_events
        self.successful_events = successful_events
        self.failed_events = failed_events
        self.event_type_distribution = event_type_distribution
        self.severity_distribution = severity_distribution
        self.top_users = top_users
        self.top_ip_addresses = top_ip_addresses
        self.time_range = time_range


class AuditLogger:
    """
    Audit Logger for security event tracking.

    Provides functionality for:
    - Logging security events to SQLite database
    - Querying audit logs with filters
    - Generating audit summaries
    - Log rotation and cleanup

    Args:
        config: Audit log configuration

    Example:
        >>> logger = AuditLogger(config)
        >>> await logger.log(security_event)
        >>> entries = await logger.query(AuditQuery(user_id="user123"))
    """

    BUFFER_SIZE = 100
    FLUSH_INTERVAL = 5  # seconds

    def __init__(self, config: AuditLogConfig) -> None:
        """Initialize the audit logger."""
        self.config = config
        self._log_buffer: list[AuditLogEntry] = []
        self._current_log_file: Optional[str] = None
        self._rotation_timer: Optional[threading.Timer] = None
        self._flush_timer: Optional[threading.Timer] = None
        self._event_handlers: list[Any] = []
        self._lock = threading.Lock()

        # Initialize database and log rotation
        self._absolute_log_dir = self._get_absolute_log_dir()
        self._ensure_log_directory()
        self._initialize_database()
        self._start_periodic_flush()
        self._initialize_log_rotation()

    def _get_absolute_log_dir(self) -> str:
        """Get absolute path for log directory."""
        log_dir = self.config.log_directory
        if os.path.isabs(log_dir):
            return log_dir
        return os.path.abspath(log_dir)

    def _ensure_log_directory(self) -> None:
        """Ensure log directory exists."""
        Path(self._absolute_log_dir).mkdir(parents=True, exist_ok=True)

    def _initialize_database(self) -> None:
        """Initialize SQLite database for audit logs."""
        db_path = os.path.join(self._absolute_log_dir, "audit.db")
        self._db_path = db_path

        with sqlite3.connect(db_path) as conn:
            cursor = conn.cursor()

            # Create audit logs table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id TEXT PRIMARY KEY,
                    timestamp INTEGER NOT NULL,
                    event_type TEXT NOT NULL,
                    user_id TEXT,
                    username TEXT,
                    ip_address TEXT NOT NULL,
                    user_agent TEXT NOT NULL,
                    resource TEXT,
                    action TEXT,
                    success INTEGER NOT NULL,
                    message TEXT NOT NULL,
                    metadata TEXT,
                    severity TEXT NOT NULL,
                    category TEXT NOT NULL,
                    session_id TEXT,
                    correlation_id TEXT,
                    created_at INTEGER DEFAULT (strftime('%s', 'now'))
                )
            """)

            # Create indexes
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_audit_timestamp "
                "ON audit_logs(timestamp)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_audit_event_type "
                "ON audit_logs(event_type)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_audit_user_id "
                "ON audit_logs(user_id)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_audit_ip_address "
                "ON audit_logs(ip_address)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_audit_severity "
                "ON audit_logs(severity)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_audit_success "
                "ON audit_logs(success)"
            )

            # Enable WAL mode
            cursor.execute("PRAGMA journal_mode = WAL")
            cursor.execute("PRAGMA synchronous = NORMAL")
            cursor.execute("PRAGMA cache_size = 10000")

            conn.commit()

    def on_event(self, event_name: str, handler: Any) -> None:
        """Register an event handler."""
        self._event_handlers.append((event_name, handler))

    def _emit_event(self, event_name: str, data: Any) -> None:
        """Emit an event to registered handlers."""
        for name, handler in self._event_handlers:
            if name == event_name:
                try:
                    handler(data)
                except Exception:
                    pass

    def _determine_severity(
        self, event: SecurityEvent
    ) -> str:
        """Determine the severity of a security event."""
        critical_events = [
            SecurityEventType.UNAUTHORIZED_ACCESS,
            SecurityEventType.ACCOUNT_LOCKED,
            SecurityEventType.SUSPICIOUS_ACTIVITY,
        ]

        high_events = [
            SecurityEventType.LOGIN_FAILURE,
            SecurityEventType.PERMISSION_DENIED,
            SecurityEventType.ROLE_CHANGED,
        ]

        medium_events = [
            SecurityEventType.LOGIN_SUCCESS,
            SecurityEventType.LOGOUT,
            SecurityEventType.TOKEN_REFRESH,
            SecurityEventType.PASSWORD_CHANGED,
        ]

        if event.type in critical_events:
            return "critical"
        elif event.type in high_events:
            return "high"
        elif event.type in medium_events:
            return "medium"
        else:
            return "low"

    def _determine_category(self, event: SecurityEvent) -> str:
        """Determine the category of a security event."""
        auth_events = [
            SecurityEventType.LOGIN_ATTEMPT,
            SecurityEventType.LOGIN_SUCCESS,
            SecurityEventType.LOGIN_FAILURE,
            SecurityEventType.LOGOUT,
            SecurityEventType.TOKEN_REFRESH,
        ]

        access_events = [
            SecurityEventType.PERMISSION_DENIED,
            SecurityEventType.UNAUTHORIZED_ACCESS,
        ]

        admin_events = [
            SecurityEventType.ROLE_CHANGED,
            SecurityEventType.PASSWORD_CHANGED,
            SecurityEventType.ACCOUNT_LOCKED,
        ]

        if event.type in auth_events:
            return "authentication"
        elif event.type in access_events:
            return "access_control"
        elif event.type in admin_events:
            return "administration"
        else:
            return "system"

    async def log(
        self,
        event: SecurityEvent,
        severity: Optional[str] = None,
        category: Optional[str] = None,
    ) -> None:
        """
        Log a security event.

        Args:
            event: Security event to log
            severity: Optional severity override (low, medium, high, critical)
            category: Optional category override
        """
        try:
            audit_entry = AuditLogEntry(
                id=event.id,
                timestamp=event.timestamp,
                event_type=event.type,
                user_id=event.user_id,
                username=event.username,
                ip_address=event.ip_address,
                user_agent=event.user_agent,
                resource=event.resource,
                action=event.action,
                success=event.success,
                message=event.message,
                metadata=event.metadata,
                severity=severity or self._determine_severity(event),
                category=category or self._determine_category(event),
                session_id=(
                    event.metadata.get("session_id")
                    if event.metadata
                    else None
                ),
                correlation_id=(
                    event.metadata.get("correlation_id")
                    if event.metadata
                    else None
                ),
            )

            # Add to buffer
            with self._lock:
                self._log_buffer.append(audit_entry)

                # Flush if buffer is full
                if len(self._log_buffer) >= self.BUFFER_SIZE:
                    await self._flush_buffer()

                # Immediately flush critical/high severity events
                if audit_entry.severity in ("critical", "high"):
                    await self._flush_buffer()

            self._emit_event("audit_logged", audit_entry)

        except Exception as e:
            self._emit_event(
                "audit_error",
                {
                    "message": f"Failed to log audit entry: {str(e)}",
                    "original_event": event,
                    "error": e,
                },
            )

    async def _flush_buffer(self) -> None:
        """Flush the log buffer to database."""
        with self._lock:
            if not self._log_buffer:
                return

            entries = self._log_buffer[:]
            self._log_buffer = []

        try:
            with sqlite3.connect(self._db_path) as conn:
                cursor = conn.cursor()

                for entry in entries:
                    cursor.execute(
                        """
                        INSERT INTO audit_logs (
                            id, timestamp, event_type, user_id, username,
                            ip_address, user_agent, resource, action, success,
                            message, metadata, severity, category, session_id,
                            correlation_id
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            entry.id,
                            int(entry.timestamp.timestamp() * 1000),
                            entry.event_type.value,
                            entry.user_id,
                            entry.username,
                            entry.ip_address,
                            entry.user_agent,
                            entry.resource,
                            entry.action,
                            1 if entry.success else 0,
                            entry.message,
                            (
                                json.dumps(entry.metadata)
                                if entry.metadata
                                else None
                            ),
                            entry.severity,
                            entry.category,
                            entry.session_id,
                            entry.correlation_id,
                        ),
                    )

                conn.commit()

            # Write to log file if configured
            if self.config.log_directory:
                await self._write_to_log_file(entries)

        except Exception as e:
            # Put entries back in buffer
            with self._lock:
                self._log_buffer = entries + self._log_buffer

            self._emit_event(
                "audit_error",
                {
                    "message": f"Failed to flush audit buffer: {str(e)}",
                    "entries_count": len(entries),
                    "error": e,
                },
            )

    async def _write_to_log_file(self, entries: list[AuditLogEntry]) -> None:
        """Write entries to log file."""
        try:
            log_filename = self._get_log_filename()
            log_content = "\n".join(
                json.dumps(
                    {
                        "id": e.id,
                        "timestamp": e.timestamp.isoformat(),
                        "event_type": e.event_type.value,
                        "user_id": e.user_id,
                        "username": e.username,
                        "ip_address": e.ip_address,
                        "user_agent": e.user_agent,
                        "resource": e.resource,
                        "action": e.action,
                        "success": e.success,
                        "message": e.message,
                        "metadata": e.metadata,
                        "severity": e.severity,
                        "category": e.category,
                    }
                )
                for e in entries
            ) + "\n"

            with open(log_filename, "a", encoding="utf-8") as f:
                f.write(log_content)

            # Check file size and rotate if needed
            stats = os.stat(log_filename)
            if stats.st_size > self.config.max_file_size:
                await self._rotate_log_file()

        except Exception as e:
            self._emit_event(
                "audit_error",
                {
                    "message": f"Failed to write to log file: {str(e)}",
                    "error": e,
                },
            )

    def _get_log_filename(self) -> str:
        """Get current log filename."""
        if not self._current_log_file:
            date_str = datetime.now().strftime("%Y-%m-%d")
            self._current_log_file = os.path.join(
                self._absolute_log_dir, f"audit-{date_str}.log"
            )
        return self._current_log_file

    async def _rotate_log_file(self) -> None:
        """Rotate the current log file."""
        try:
            if not self._current_log_file:
                return

            timestamp = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
            rotated_filename = self._current_log_file.replace(
                ".log", f"-{timestamp}.log"
            )

            os.rename(self._current_log_file, rotated_filename)
            self._current_log_file = None

            # Compress if enabled
            if self.config.compression_enabled:
                await self._compress_log_file(rotated_filename)

            # Clean up old files
            await self._cleanup_old_log_files()

            self._emit_event("log_rotated", {"rotated_file": rotated_filename})

        except Exception as e:
            self._emit_event(
                "audit_error",
                {
                    "message": f"Failed to rotate log file: {str(e)}",
                    "error": e,
                },
            )

    async def _compress_log_file(self, file_path: str) -> None:
        """Compress a log file."""
        import gzip

        compressed_path = f"{file_path}.gz"
        with open(file_path, "rb") as f_in:
            with gzip.open(compressed_path, "wb") as f_out:
                shutil.copyfileobj(f_in, f_out)

        os.remove(file_path)
        self._emit_event(
            "file_compressed",
            {"original_file": file_path, "compressed_file": compressed_path},
        )

    async def _cleanup_old_log_files(self) -> None:
        """Clean up old log files."""
        try:
            log_files = [
                f
                for f in os.listdir(self._absolute_log_dir)
                if f.startswith("audit-") and f.endswith(".log")
            ]

            if len(log_files) > self.config.max_files:
                log_files.sort()
                files_to_delete = log_files[
                    : len(log_files) - self.config.max_files
                ]

                for file in files_to_delete:
                    file_path = os.path.join(self._absolute_log_dir, file)
                    os.remove(file_path)

                self._emit_event(
                    "old_files_cleaned_up", {"deleted_files": files_to_delete}
                )

        except Exception as e:
            self._emit_event(
                "audit_error",
                {
                    "message": f"Failed to cleanup old log files: {str(e)}",
                    "error": e,
                },
            )

    def _initialize_log_rotation(self) -> None:
        """Initialize log rotation timer."""
        interval_seconds = self.config.rotation_interval / 1000

        def rotate() -> None:
            asyncio.run(self._rotate_log_file())
            self._initialize_log_rotation()

        self._rotation_timer = threading.Timer(interval_seconds, rotate)
        self._rotation_timer.daemon = True
        self._rotation_timer.start()

    def _start_periodic_flush(self) -> None:
        """Start periodic buffer flush timer."""

        def flush() -> None:
            asyncio.run(self._flush_buffer())
            self._start_periodic_flush()

        self._flush_timer = threading.Timer(self.FLUSH_INTERVAL, flush)
        self._flush_timer.daemon = True
        self._flush_timer.start()

    async def query(self, query: AuditQuery) -> list[AuditLogEntry]:
        """
        Query audit logs.

        Args:
            query: Query parameters

        Returns:
            List of matching audit log entries
        """
        try:
            sql = "SELECT * FROM audit_logs WHERE 1=1"
            params: list[Any] = []

            if query.start_date:
                sql += " AND timestamp >= ?"
                params.append(int(query.start_date.timestamp() * 1000))

            if query.end_date:
                sql += " AND timestamp <= ?"
                params.append(int(query.end_date.timestamp() * 1000))

            if query.event_types:
                placeholders = ",".join("?" * len(query.event_types))
                sql += f" AND event_type IN ({placeholders})"
                params.extend([et.value for et in query.event_types])

            if query.user_id:
                sql += " AND user_id = ?"
                params.append(query.user_id)

            if query.ip_address:
                sql += " AND ip_address = ?"
                params.append(query.ip_address)

            if query.resource:
                sql += " AND resource = ?"
                params.append(query.resource)

            if query.success is not None:
                sql += " AND success = ?"
                params.append(1 if query.success else 0)

            if query.severity:
                placeholders = ",".join("?" * len(query.severity))
                sql += f" AND severity IN ({placeholders})"
                params.extend(query.severity)

            sql += " ORDER BY timestamp DESC"

            if query.limit:
                sql += " LIMIT ?"
                params.append(query.limit)

                if query.offset:
                    sql += " OFFSET ?"
                    params.append(query.offset)

            with sqlite3.connect(self._db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute(sql, params)
                rows = cursor.fetchall()

            return [
                AuditLogEntry(
                    id=row["id"],
                    timestamp=datetime.fromtimestamp(row["timestamp"] / 1000),
                    event_type=SecurityEventType(row["event_type"]),
                    user_id=row["user_id"],
                    username=row["username"],
                    ip_address=row["ip_address"],
                    user_agent=row["user_agent"],
                    resource=row["resource"],
                    action=row["action"],
                    success=row["success"] == 1,
                    message=row["message"],
                    metadata=(
                        json.loads(row["metadata"]) if row["metadata"] else None
                    ),
                    severity=row["severity"],
                    category=row["category"],
                    session_id=row["session_id"],
                    correlation_id=row["correlation_id"],
                )
                for row in rows
            ]

        except Exception as e:
            self._emit_event(
                "audit_error",
                {
                    "message": f"Failed to query audit logs: {str(e)}",
                    "error": e,
                },
            )
            return []

    async def get_summary(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> AuditSummary:
        """
        Get audit log summary statistics.

        Args:
            start_date: Optional start date filter
            end_date: Optional end date filter

        Returns:
            AuditSummary with statistics
        """
        try:
            where_clause = "1=1"
            params: list[Any] = []

            if start_date:
                where_clause += " AND timestamp >= ?"
                params.append(int(start_date.timestamp() * 1000))

            if end_date:
                where_clause += " AND timestamp <= ?"
                params.append(int(end_date.timestamp() * 1000))

            with sqlite3.connect(self._db_path) as conn:
                cursor = conn.cursor()

                # Total events
                cursor.execute(
                    f"SELECT COUNT(*) FROM audit_logs WHERE {where_clause}",
                    params,
                )
                total_events = cursor.fetchone()[0]

                # Success/failure distribution
                cursor.execute(
                    f"""SELECT success, COUNT(*) as count
                        FROM audit_logs WHERE {where_clause}
                        GROUP BY success""",
                    params,
                )
                success_results = {
                    row[0]: row[1] for row in cursor.fetchall()
                }
                successful_events = success_results.get(1, 0)
                failed_events = success_results.get(0, 0)

                # Event type distribution
                cursor.execute(
                    f"""SELECT event_type, COUNT(*) as count
                        FROM audit_logs WHERE {where_clause}
                        GROUP BY event_type ORDER BY count DESC""",
                    params,
                )
                event_type_distribution = {
                    row[0]: row[1] for row in cursor.fetchall()
                }

                # Severity distribution
                cursor.execute(
                    f"""SELECT severity, COUNT(*) as count
                        FROM audit_logs WHERE {where_clause}
                        GROUP BY severity ORDER BY count DESC""",
                    params,
                )
                severity_distribution = {
                    row[0]: row[1] for row in cursor.fetchall()
                }

                # Top users
                cursor.execute(
                    f"""SELECT user_id, username, COUNT(*) as count
                        FROM audit_logs
                        WHERE {where_clause} AND user_id IS NOT NULL
                        GROUP BY user_id, username
                        ORDER BY count DESC LIMIT 10""",
                    params,
                )
                top_users = [
                    {
                        "user_id": row[0],
                        "username": row[1],
                        "count": row[2],
                    }
                    for row in cursor.fetchall()
                ]

                # Top IP addresses
                cursor.execute(
                    f"""SELECT ip_address, COUNT(*) as count
                        FROM audit_logs WHERE {where_clause}
                        GROUP BY ip_address ORDER BY count DESC LIMIT 10""",
                    params,
                )
                top_ip_addresses = [
                    {"ip_address": row[0], "count": row[1]}
                    for row in cursor.fetchall()
                ]

                # Time range
                cursor.execute(
                    f"""SELECT MIN(timestamp), MAX(timestamp)
                        FROM audit_logs WHERE {where_clause}""",
                    params,
                )
                time_range_result = cursor.fetchone()

            return AuditSummary(
                total_events=total_events,
                successful_events=successful_events,
                failed_events=failed_events,
                event_type_distribution=event_type_distribution,
                severity_distribution=severity_distribution,
                top_users=top_users,
                top_ip_addresses=top_ip_addresses,
                time_range={
                    "start": (
                        datetime.fromtimestamp(time_range_result[0] / 1000)
                        if time_range_result[0]
                        else datetime.now()
                    ),
                    "end": (
                        datetime.fromtimestamp(time_range_result[1] / 1000)
                        if time_range_result[1]
                        else datetime.now()
                    ),
                },
            )

        except Exception as e:
            self._emit_event(
                "audit_error",
                {
                    "message": f"Failed to generate audit summary: {str(e)}",
                    "error": e,
                },
            )

            return AuditSummary(
                total_events=0,
                successful_events=0,
                failed_events=0,
                event_type_distribution={},
                severity_distribution={},
                top_users=[],
                top_ip_addresses=[],
                time_range={"start": datetime.now(), "end": datetime.now()},
            )

    async def get_user_activity(
        self, user_id: str, limit: int = 100
    ) -> list[AuditLogEntry]:
        """
        Get activity logs for a specific user.

        Args:
            user_id: User ID
            limit: Maximum number of entries

        Returns:
            List of audit log entries for the user
        """
        return await self.query(AuditQuery(user_id=user_id, limit=limit))

    async def export_logs(
        self,
        start: datetime,
        end: datetime,
        format: str = "json",
    ) -> bytes:
        """
        Export audit logs in specified format.

        Args:
            start: Start date
            end: End date
            format: Export format (json, csv)

        Returns:
            Exported data as bytes
        """
        entries = await self.query(
            AuditQuery(start_date=start, end_date=end)
        )

        if format == "json":
            data = json.dumps(
                [
                    {
                        "id": e.id,
                        "timestamp": e.timestamp.isoformat(),
                        "event_type": e.event_type.value,
                        "user_id": e.user_id,
                        "username": e.username,
                        "ip_address": e.ip_address,
                        "user_agent": e.user_agent,
                        "resource": e.resource,
                        "action": e.action,
                        "success": e.success,
                        "message": e.message,
                        "severity": e.severity,
                        "category": e.category,
                    }
                    for e in entries
                ],
                indent=2,
            )
            return data.encode("utf-8")

        elif format == "csv":
            import csv
            import io

            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(
                [
                    "id",
                    "timestamp",
                    "event_type",
                    "user_id",
                    "username",
                    "ip_address",
                    "user_agent",
                    "resource",
                    "action",
                    "success",
                    "message",
                    "severity",
                    "category",
                ]
            )
            for e in entries:
                writer.writerow(
                    [
                        e.id,
                        e.timestamp.isoformat(),
                        e.event_type.value,
                        e.user_id,
                        e.username,
                        e.ip_address,
                        e.user_agent,
                        e.resource,
                        e.action,
                        e.success,
                        e.message,
                        e.severity,
                        e.category,
                    ]
                )
            return output.getvalue().encode("utf-8")

        else:
            raise ValueError(f"Unsupported export format: {format}")

    def get_audit_stats(self) -> dict[str, Any]:
        """Get audit logger statistics."""
        return {
            "buffer_size": len(self._log_buffer),
            "max_buffer_size": self.BUFFER_SIZE,
            "flush_interval": self.FLUSH_INTERVAL,
            "current_log_file": self._current_log_file,
            "config": {
                "max_file_size": self.config.max_file_size,
                "max_files": self.config.max_files,
                "rotation_interval": self.config.rotation_interval,
                "compression_enabled": self.config.compression_enabled,
                "encryption_enabled": self.config.encryption_enabled,
            },
        }

    async def cleanup(self) -> None:
        """Clean up resources."""
        # Flush remaining buffer
        if self._log_buffer:
            await self._flush_buffer()

        # Cancel timers
        if self._rotation_timer:
            self._rotation_timer.cancel()

        if self._flush_timer:
            self._flush_timer.cancel()

        self._event_handlers.clear()
