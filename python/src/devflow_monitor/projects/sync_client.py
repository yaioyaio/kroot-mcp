"""
Sync Client for DevFlow Monitor.

Handles synchronization of local project data with a central server.
Supports offline queue, conflict resolution, and batch processing.
"""

from __future__ import annotations

import json
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import uuid4
import asyncio

import httpx
import aiosqlite

from ..utils.logger import Logger

from .types import (
    ConflictResolutionStrategy,
    SyncConfig,
    SyncError,
    SyncEvent,
    SyncResult,
    SyncStatus,
)


@dataclass
class SyncClientStatus:
    """Sync client status information."""

    last_sync_time: datetime | None = None
    pending_events: int = 0
    failed_events: int = 0
    connected: bool = False
    syncing: bool = False
    avg_latency: float = 0.0
    success_rate: float = 0.0


@dataclass
class SyncStats:
    """Synchronization statistics."""

    total_syncs: int = 0
    successful_syncs: int = 0
    failed_syncs: int = 0
    total_latency: float = 0.0


class SyncClient:
    """
    Synchronization Client.

    Manages synchronization of local events and data with a central server.
    Supports offline queue, automatic retry, and conflict resolution.

    Example:
        config = SyncConfig(
            endpoint="https://api.example.com",
            api_key="your-api-key",
            interval=300
        )
        client = SyncClient(config, db)
        await client.start()

        result = await client.sync_batch()
    """

    def __init__(self, config: SyncConfig, db: aiosqlite.Connection) -> None:
        """
        Initialize sync client.

        Args:
            config: Sync configuration.
            db: Database connection.
        """
        self._config = config
        self._db = db
        self._logger = Logger("SyncClient")
        self._http_client: httpx.AsyncClient | None = None

        self._sync_task: asyncio.Task[None] | None = None
        self._is_connected = False
        self._is_syncing = False
        self._stats = SyncStats()

        # Offline queue
        self._offline_queue: deque[SyncEvent] = deque(maxlen=config.max_queue_size)

        self._logger.info(
            f"Sync client initialized for endpoint: {config.endpoint}"
        )

    @property
    def is_connected(self) -> bool:
        """Check if connected to server."""
        return self._is_connected

    @property
    def is_syncing(self) -> bool:
        """Check if sync is in progress."""
        return self._is_syncing

    async def start(self) -> None:
        """Start the sync client."""
        if not self._config.enabled:
            self._logger.info("Sync is disabled")
            return

        # Initialize HTTP client
        self._http_client = httpx.AsyncClient(
            base_url=self._config.endpoint,
            timeout=30.0,
            headers={
                "Authorization": f"Bearer {self._config.api_key}",
                "Content-Type": "application/json",
                "User-Agent": f"DevFlow-Monitor-MCP/1.0.0 ({self._config.device_id})",
            },
        )

        # Test connection
        await self.test_connection()

        # Start periodic sync
        self._start_periodic_sync()

        # Initial sync
        await self.sync_batch()

        self._logger.info("Sync client started")

    async def stop(self) -> None:
        """Stop the sync client."""
        # Cancel periodic sync
        if self._sync_task:
            self._sync_task.cancel()
            try:
                await self._sync_task
            except asyncio.CancelledError:
                pass
            self._sync_task = None

        # Wait for current sync to complete
        while self._is_syncing:
            await asyncio.sleep(0.1)

        # Close HTTP client
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None

        self._is_connected = False
        self._logger.info("Sync client stopped")

    async def test_connection(self) -> bool:
        """
        Test connection to the server.

        Returns:
            True if connected, False otherwise.
        """
        if not self._http_client:
            return False

        try:
            response = await self._http_client.get("/health")
            if response.status_code == 200:
                self._is_connected = True
                self._logger.info("Server connection successful")
                return True
        except Exception as e:
            self._logger.error(f"Server connection failed: {e}")

        self._is_connected = False
        return False

    def _start_periodic_sync(self) -> None:
        """Start periodic synchronization."""
        async def sync_loop() -> None:
            while True:
                try:
                    await asyncio.sleep(self._config.interval)
                    if not self._is_syncing and self._is_connected:
                        await self.sync_batch()
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    self._logger.error(f"Periodic sync error: {e}")

        self._sync_task = asyncio.create_task(sync_loop())

    async def sync_batch(self) -> SyncResult:
        """
        Perform batch synchronization.

        Returns:
            Synchronization result.
        """
        if self._is_syncing:
            raise RuntimeError("Sync already in progress")

        self._is_syncing = True
        start_time = datetime.utcnow()

        result = SyncResult(
            success=False,
            synced_ids=[],
            failed_ids=[],
            errors=[],
            duration=0.0,
            bytes_transferred=0,
        )

        try:
            # Get pending events
            pending_events = await self._get_pending_events()

            if not pending_events:
                result.success = True
                result.duration = (datetime.utcnow() - start_time).total_seconds() * 1000
                return result

            self._logger.info(f"Starting batch sync with {len(pending_events)} events")

            # Split into batches
            batches = self._chunk_list(pending_events, self._config.batch_size)

            for i, batch in enumerate(batches):
                try:
                    batch_result = await self._sync_events_batch(batch)
                    result.synced_ids.extend(batch_result.synced_ids)
                    result.failed_ids.extend(batch_result.failed_ids)
                    result.errors.extend(batch_result.errors)
                    result.bytes_transferred += batch_result.bytes_transferred
                except Exception as e:
                    self._logger.error(f"Batch {i + 1} sync failed: {e}")
                    result.failed_ids.extend([e.sync_id for e in batch])
                    result.errors.append({
                        "id": str(uuid4()),
                        "event_id": "batch",
                        "type": "network",
                        "message": str(e),
                        "retryable": True,
                        "timestamp": datetime.utcnow().isoformat(),
                    })

            result.success = len(result.errors) == 0
            result.duration = (datetime.utcnow() - start_time).total_seconds() * 1000

            # Update stats
            self._update_sync_stats(result)

            # Update sync status in database
            await self._update_sync_status(result)

            self._logger.info(
                f"Batch sync completed: {len(result.synced_ids)} synced, "
                f"{len(result.failed_ids)} failed, {result.duration:.2f}ms"
            )

        except Exception as e:
            result.success = False
            result.duration = (datetime.utcnow() - start_time).total_seconds() * 1000
            result.errors.append({
                "id": str(uuid4()),
                "event_id": "sync",
                "type": "unknown",
                "message": str(e),
                "retryable": True,
                "timestamp": datetime.utcnow().isoformat(),
            })
            self._logger.error(f"Sync failed: {e}")
        finally:
            self._is_syncing = False

        return result

    async def _sync_events_batch(
        self, events: list[SyncEvent]
    ) -> SyncResult:
        """Sync a batch of events."""
        result = SyncResult(
            success=True,
            synced_ids=[],
            failed_ids=[],
            errors=[],
            duration=0.0,
            bytes_transferred=0,
        )

        if not self._http_client:
            result.success = False
            result.failed_ids = [e.sync_id for e in events]
            return result

        try:
            # Prepare payload
            payload = {
                "device_id": self._config.device_id,
                "user_id": self._config.user_id,
                "events": [
                    {
                        "sync_id": event.sync_id,
                        "local_id": event.local_id,
                        "project_id": event.project_id,
                        "event_type": event.event_type,
                        "event_data": event.event_data,
                        "timestamp": event.timestamp.isoformat(),
                    }
                    for event in events
                ],
                "compression": self._config.compression,
            }

            payload_json = json.dumps(payload)
            result.bytes_transferred = len(payload_json.encode())

            # Send to server
            response = await self._http_client.post("/sync/events", json=payload)

            if response.status_code in (200, 201):
                response_data = response.json()
                result.synced_ids = response_data.get("synced_ids", [])
                result.failed_ids = response_data.get("failed_ids", [])

                if response_data.get("errors"):
                    result.errors = response_data["errors"]

                # Mark events as synced
                if result.synced_ids:
                    await self._mark_events_synced(result.synced_ids)

                # Increment retry count for failed events
                if result.failed_ids:
                    await self._increment_retry_count(result.failed_ids)
            else:
                raise RuntimeError(f"Unexpected response: {response.status_code}")

        except Exception as e:
            result.success = False
            result.failed_ids = [event.sync_id for event in events]
            result.errors.append(self._create_sync_error(e, "batch"))

        return result

    async def _get_pending_events(self) -> list[SyncEvent]:
        """Get pending events from database."""
        events: list[SyncEvent] = []

        try:
            async with self._db.execute(
                """
                SELECT sync_id, local_id, project_id, device_id, user_id,
                       event_type, event_data, sync_status, sync_attempts,
                       last_sync_error, synced_at, created_at
                FROM sync_events
                WHERE sync_status = 'pending'
                AND sync_attempts < ?
                ORDER BY created_at ASC
                LIMIT ?
                """,
                (self._config.max_retries, self._config.max_queue_size),
            ) as cursor:
                rows = await cursor.fetchall()
                for row in rows:
                    events.append(
                        SyncEvent(
                            sync_id=row[0],
                            local_id=row[1],
                            project_id=row[2],
                            device_id=row[3],
                            user_id=row[4],
                            event_type=row[5],
                            event_data=json.loads(row[6] or "{}"),
                            sync_status=row[7],
                            sync_attempts=row[8],
                            last_sync_error=row[9],
                            synced_at=datetime.fromisoformat(row[10]) if row[10] else None,
                            timestamp=datetime.fromisoformat(row[11]),
                        )
                    )
        except Exception as e:
            self._logger.error(f"Failed to get pending events: {e}")

        return events

    async def _mark_events_synced(self, sync_ids: list[str]) -> None:
        """Mark events as synced in database."""
        if not sync_ids:
            return

        try:
            placeholders = ",".join(["?" for _ in sync_ids])
            now = datetime.utcnow().isoformat()
            await self._db.execute(
                f"""
                UPDATE sync_events
                SET sync_status = 'synced', synced_at = ?
                WHERE sync_id IN ({placeholders})
                """,
                [now] + sync_ids,
            )
            await self._db.commit()
            self._logger.debug(f"Marked {len(sync_ids)} events as synced")
        except Exception as e:
            self._logger.error(f"Failed to mark events as synced: {e}")

    async def _increment_retry_count(self, sync_ids: list[str]) -> None:
        """Increment retry count for failed events."""
        if not sync_ids:
            return

        try:
            placeholders = ",".join(["?" for _ in sync_ids])
            await self._db.execute(
                f"""
                UPDATE sync_events
                SET sync_attempts = sync_attempts + 1,
                    sync_status = CASE
                        WHEN sync_attempts + 1 >= ? THEN 'failed'
                        ELSE 'pending'
                    END
                WHERE sync_id IN ({placeholders})
                """,
                [self._config.max_retries] + sync_ids,
            )
            await self._db.commit()
            self._logger.debug(f"Incremented retry count for {len(sync_ids)} events")
        except Exception as e:
            self._logger.error(f"Failed to increment retry count: {e}")

    def _update_sync_stats(self, result: SyncResult) -> None:
        """Update synchronization statistics."""
        self._stats.total_syncs += 1
        self._stats.total_latency += result.duration

        if result.success:
            self._stats.successful_syncs += 1
        else:
            self._stats.failed_syncs += 1

    async def _update_sync_status(self, result: SyncResult) -> None:
        """Update sync status (logging)."""
        self._logger.debug(
            f"Sync status: success={result.success}, duration={result.duration}ms"
        )

    def _create_sync_error(self, error: Any, event_id: str) -> dict[str, Any]:
        """Create sync error from exception."""
        error_type = "unknown"
        retryable = True

        if hasattr(error, "response") and error.response:
            status = error.response.status_code
            if status in (401, 403):
                error_type = "auth"
                retryable = False
            elif status in (400, 422):
                error_type = "validation"
                retryable = False
            elif status == 409:
                error_type = "conflict"
            elif status >= 500:
                error_type = "server"
        elif hasattr(error, "request"):
            error_type = "network"

        return {
            "id": str(uuid4()),
            "event_id": event_id,
            "type": error_type,
            "message": str(error),
            "retryable": retryable,
            "timestamp": datetime.utcnow().isoformat(),
        }

    def _chunk_list(self, items: list[Any], chunk_size: int) -> list[list[Any]]:
        """Split list into chunks."""
        return [
            items[i : i + chunk_size] for i in range(0, len(items), chunk_size)
        ]

    async def trigger_sync(self, force: bool = False) -> SyncResult:
        """
        Manually trigger synchronization.

        Args:
            force: Force sync even if already in progress.

        Returns:
            Sync result.
        """
        if self._is_syncing and not force:
            raise RuntimeError("Sync already in progress")

        if force:
            self._is_syncing = False

        return await self.sync_batch()

    async def update_config(self, new_config: dict[str, Any]) -> None:
        """
        Update sync configuration.

        Args:
            new_config: New configuration values.
        """
        was_enabled = self._config.enabled

        # Update config
        for key, value in new_config.items():
            if hasattr(self._config, key):
                setattr(self._config, key, value)

        # Handle enable/disable
        if was_enabled and not self._config.enabled:
            await self.stop()
        elif not was_enabled and self._config.enabled:
            await self.start()

        self._logger.info(f"Sync config updated: {new_config}")

    def get_sync_status(self) -> SyncClientStatus:
        """
        Get current sync status.

        Returns:
            Sync client status.
        """
        return SyncClientStatus(
            last_sync_time=datetime.utcnow() if self._stats.total_syncs > 0 else None,
            pending_events=len(self._offline_queue),
            failed_events=0,  # Would need to query database
            connected=self._is_connected,
            syncing=self._is_syncing,
            avg_latency=(
                self._stats.total_latency / self._stats.total_syncs
                if self._stats.total_syncs > 0
                else 0.0
            ),
            success_rate=(
                self._stats.successful_syncs / self._stats.total_syncs
                if self._stats.total_syncs > 0
                else 0.0
            ),
        )

    async def clear_sync_queue(self) -> int:
        """
        Clear failed events from sync queue.

        Returns:
            Number of deleted events.
        """
        try:
            cursor = await self._db.execute(
                "DELETE FROM sync_events WHERE sync_status = 'failed'"
            )
            await self._db.commit()
            deleted = cursor.rowcount
            self._logger.info(f"Cleared {deleted} failed events from sync queue")
            return deleted
        except Exception as e:
            self._logger.error(f"Failed to clear sync queue: {e}")
            return 0

    async def add_event_to_sync_queue(
        self, event_type: str, event_data: dict[str, Any], project_id: str
    ) -> None:
        """
        Add an event to the sync queue.

        Args:
            event_type: Type of event.
            event_data: Event data payload.
            project_id: Associated project ID.
        """
        try:
            # Check queue size
            async with self._db.execute(
                "SELECT COUNT(*) FROM sync_events WHERE sync_status = 'pending'"
            ) as cursor:
                row = await cursor.fetchone()
                queue_size = row[0] if row else 0

            if queue_size >= self._config.max_queue_size:
                self._logger.warning(
                    f"Sync queue full: {queue_size}/{self._config.max_queue_size}"
                )
                return

            # Create sync event
            sync_id = str(uuid4())
            local_id = int(datetime.utcnow().timestamp() * 1000)
            now = datetime.utcnow().isoformat()

            await self._db.execute(
                """
                INSERT INTO sync_events (
                    sync_id, local_id, project_id, device_id, user_id,
                    event_type, event_data, sync_status, sync_attempts, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    sync_id,
                    local_id,
                    project_id,
                    self._config.device_id,
                    self._config.user_id,
                    event_type,
                    json.dumps(event_data),
                    SyncStatus.PENDING.value,
                    0,
                    now,
                ),
            )
            await self._db.commit()

            self._logger.debug(
                f"Event added to sync queue: {sync_id} ({event_type})"
            )
        except Exception as e:
            self._logger.error(f"Failed to add event to sync queue: {e}")
            raise

    async def _retry_with_backoff(
        self,
        operation: Any,
        max_retries: int | None = None,
        base_delay: float = 1.0,
    ) -> Any:
        """
        Retry an operation with exponential backoff.

        Args:
            operation: Async operation to retry.
            max_retries: Maximum retry attempts.
            base_delay: Base delay in seconds.

        Returns:
            Operation result.
        """
        retries = max_retries or self._config.max_retries
        delay = base_delay

        for attempt in range(retries):
            try:
                return await operation()
            except Exception as e:
                if attempt == retries - 1:
                    raise

                # Exponential backoff with jitter
                import random

                jitter = random.uniform(0, delay * 0.1)
                wait_time = delay + jitter
                self._logger.warning(
                    f"Retry {attempt + 1}/{retries} in {wait_time:.2f}s: {e}"
                )
                await asyncio.sleep(wait_time)
                delay *= 2

    async def _resolve_conflicts(
        self, local_event: SyncEvent, server_event: dict[str, Any]
    ) -> SyncEvent:
        """
        Resolve sync conflict between local and server events.

        Args:
            local_event: Local event.
            server_event: Server event data.

        Returns:
            Resolved event.
        """
        strategy = self._config.conflict_resolution

        if strategy == ConflictResolutionStrategy.LAST_WRITE_WINS:
            # Compare timestamps
            server_time = datetime.fromisoformat(server_event.get("timestamp", ""))
            if server_time > local_event.timestamp:
                # Server wins
                local_event.event_data = server_event.get("event_data", {})
                local_event.sync_status = SyncStatus.SYNCED
            # else local wins, keep as is

        elif strategy == ConflictResolutionStrategy.PRESERVE_ALL:
            # Create merged version
            local_event.event_data = {
                "local": local_event.event_data,
                "server": server_event.get("event_data", {}),
                "conflict_resolved_at": datetime.utcnow().isoformat(),
            }

        elif strategy == ConflictResolutionStrategy.MANUAL_RESOLVE:
            # Mark as conflict for manual resolution
            local_event.sync_status = SyncStatus.CONFLICT
            local_event.last_sync_error = "Conflict requires manual resolution"

        return local_event
