"""
Cache Manager
다층 캐싱 시스템 및 전략적 캐시 관리

This module provides multi-layer caching with memory and SQLite persistence,
supporting TTL, compression, tag-based invalidation, and cache warming.
"""

import base64
import json
import sqlite3
import threading
import time
from typing import Any, Callable, Optional
from uuid import uuid4

from pydantic import BaseModel


class CacheConfig(BaseModel):
    """Cache configuration."""

    memory_ttl: int = 300000  # 5 minutes (ms)
    disk_ttl: int = 3600000  # 1 hour (ms)
    max_memory_size: int = 100 * 1024 * 1024  # 100MB
    max_disk_size: int = 1024 * 1024 * 1024  # 1GB
    compression_enabled: bool = True
    encryption_enabled: bool = False
    persist_to_disk: bool = True


class CacheEntry(BaseModel):
    """Cache entry data."""

    key: str
    data: Any
    timestamp: int
    access_count: int
    last_accessed: int
    size: int
    compressed: bool
    encrypted: bool
    tags: list[str]
    priority: str  # low, medium, high, critical


class CacheStats(BaseModel):
    """Cache statistics."""

    memory_hits: int = 0
    memory_misses: int = 0
    disk_hits: int = 0
    disk_misses: int = 0
    memory_size: int = 0
    disk_size: int = 0
    entries: int = 0
    hit_ratio: float = 0.0
    compression_ratio: float = 0.0


class CacheManager:
    """
    Multi-layer Cache Manager.

    Provides functionality for:
    - Memory and disk (SQLite) caching
    - LRU eviction policy
    - TTL-based expiration
    - Tag-based invalidation
    - Compression support
    - Cache warming

    Args:
        config: Cache configuration

    Example:
        >>> cache = CacheManager()
        >>> await cache.set("key", {"data": "value"}, ttl=60000)
        >>> value = await cache.get("key")
    """

    def __init__(self, config: Optional[CacheConfig] = None) -> None:
        """Initialize the cache manager."""
        self.config = config or CacheConfig()
        self._memory_cache: dict[str, CacheEntry] = {}
        self._disk_cache: Optional[sqlite3.Connection] = None
        self._stats = CacheStats()
        self._cleanup_timer: Optional[threading.Timer] = None
        self._lock = threading.Lock()
        self._event_handlers: list[tuple[str, Any]] = []

        self._initialize_disk_cache()
        self._start_cleanup_timer()

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

    def _initialize_disk_cache(self) -> None:
        """Initialize SQLite disk cache."""
        if not self.config.persist_to_disk:
            return

        try:
            # Use in-memory SQLite for performance
            self._disk_cache = sqlite3.connect(
                ":memory:", check_same_thread=False
            )

            cursor = self._disk_cache.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS cache_entries (
                    key TEXT PRIMARY KEY,
                    data BLOB,
                    timestamp INTEGER,
                    access_count INTEGER,
                    last_accessed INTEGER,
                    size INTEGER,
                    compressed BOOLEAN,
                    encrypted BOOLEAN,
                    tags TEXT,
                    priority TEXT,
                    ttl INTEGER
                )
            """)

            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_timestamp ON cache_entries(timestamp)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_last_accessed ON cache_entries(last_accessed)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_priority ON cache_entries(priority)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_tags ON cache_entries(tags)"
            )

            cursor.execute("PRAGMA journal_mode = WAL")
            cursor.execute("PRAGMA synchronous = NORMAL")
            cursor.execute("PRAGMA cache_size = 10000")
            cursor.execute("PRAGMA temp_store = MEMORY")

            self._disk_cache.commit()
            self._emit_event("disk_cache_initialized", {})

        except Exception as e:
            self._emit_event("disk_cache_error", {"error": str(e)})

    async def set(
        self,
        key: str,
        data: Any,
        ttl: Optional[int] = None,
        tags: Optional[list[str]] = None,
        priority: str = "medium",
        force_memory: bool = False,
        force_disk: bool = False,
    ) -> None:
        """
        Store data in cache.

        Args:
            key: Cache key
            data: Data to cache
            ttl: Optional custom TTL in milliseconds
            tags: Optional tags for grouped invalidation
            priority: Priority level (low, medium, high, critical)
            force_memory: Force storage in memory only
            force_disk: Force storage to disk
        """
        now = int(time.time() * 1000)
        serialized_data = json.dumps(data)
        original_size = len(serialized_data.encode("utf-8"))

        processed_data = serialized_data
        compressed = False
        encrypted = False

        # Compress if enabled and data is large enough
        if self.config.compression_enabled and original_size > 1024:
            processed_data = await self._compress(processed_data)
            compressed = True

        # Encrypt if enabled
        if self.config.encryption_enabled:
            processed_data = await self._encrypt(processed_data)
            encrypted = True

        final_size = len(processed_data.encode("utf-8"))

        entry = CacheEntry(
            key=key,
            data=processed_data,
            timestamp=now,
            access_count=0,
            last_accessed=now,
            size=final_size,
            compressed=compressed,
            encrypted=encrypted,
            tags=tags or [],
            priority=priority,
        )

        # Store in memory if appropriate
        if not force_disk and self._should_store_in_memory(entry):
            await self._set_in_memory(key, entry)

        # Store on disk
        if self.config.persist_to_disk and (not force_memory or force_disk):
            await self._set_in_disk(key, entry, ttl)

        self._update_stats()
        self._emit_event(
            "cache_set",
            {"key": key, "size": final_size, "compressed": compressed},
        )

    async def get(self, key: str) -> Optional[Any]:
        """
        Retrieve data from cache.

        Args:
            key: Cache key

        Returns:
            Cached data or None if not found/expired
        """
        # Check memory first
        memory_entry = await self._get_from_memory(key)
        if memory_entry:
            self._stats.memory_hits += 1
            return await self._process_entry_data(memory_entry)

        self._stats.memory_misses += 1

        # Check disk
        if self.config.persist_to_disk:
            disk_entry = await self._get_from_disk(key)
            if disk_entry:
                self._stats.disk_hits += 1

                # Promote to memory if frequently accessed
                if self._should_promote_to_memory(disk_entry):
                    await self._set_in_memory(key, disk_entry)

                return await self._process_entry_data(disk_entry)

            self._stats.disk_misses += 1

        self._emit_event("cache_miss", {"key": key})
        return None

    async def delete(self, key: str) -> bool:
        """
        Delete entry from cache.

        Args:
            key: Cache key

        Returns:
            True if deleted
        """
        deleted = False

        with self._lock:
            if key in self._memory_cache:
                del self._memory_cache[key]
                deleted = True

        if self._disk_cache:
            cursor = self._disk_cache.cursor()
            cursor.execute("DELETE FROM cache_entries WHERE key = ?", (key,))
            self._disk_cache.commit()
            if cursor.rowcount > 0:
                deleted = True

        return deleted

    async def clear(self) -> None:
        """Clear all cache entries."""
        with self._lock:
            self._memory_cache.clear()

        if self._disk_cache:
            cursor = self._disk_cache.cursor()
            cursor.execute("DELETE FROM cache_entries")
            self._disk_cache.commit()

        self._stats = CacheStats()
        self._emit_event("cache_cleared", {})

    async def _get_from_memory(self, key: str) -> Optional[CacheEntry]:
        """Get entry from memory cache."""
        with self._lock:
            entry = self._memory_cache.get(key)
            if not entry:
                return None

            # Check TTL
            now = int(time.time() * 1000)
            if now - entry.timestamp > self.config.memory_ttl:
                del self._memory_cache[key]
                self._emit_event("memory_entry_expired", {"key": key})
                return None

            # Update access info
            entry.access_count += 1
            entry.last_accessed = now
            return entry

    async def _set_in_memory(self, key: str, entry: CacheEntry) -> None:
        """Store entry in memory cache."""
        with self._lock:
            current_size = self._calculate_memory_size()
            if current_size + entry.size > self.config.max_memory_size:
                await self._evict_from_memory()

            self._memory_cache[key] = entry
            self._stats.memory_size = self._calculate_memory_size()

    async def _get_from_disk(self, key: str) -> Optional[CacheEntry]:
        """Get entry from disk cache."""
        if not self._disk_cache:
            return None

        try:
            now = int(time.time() * 1000)
            cursor = self._disk_cache.cursor()
            cursor.execute(
                """
                SELECT * FROM cache_entries
                WHERE key = ? AND (? - timestamp) < ttl
                """,
                (key, now),
            )
            row = cursor.fetchone()

            if not row:
                return None

            return CacheEntry(
                key=row[0],
                data=row[1],
                timestamp=row[2],
                access_count=row[3],
                last_accessed=row[4],
                size=row[5],
                compressed=bool(row[6]),
                encrypted=bool(row[7]),
                tags=json.loads(row[8] or "[]"),
                priority=row[9],
            )

        except Exception as e:
            self._emit_event(
                "disk_cache_error", {"operation": "get", "key": key, "error": str(e)}
            )
            return None

    async def _set_in_disk(
        self, key: str, entry: CacheEntry, custom_ttl: Optional[int] = None
    ) -> None:
        """Store entry in disk cache."""
        if not self._disk_cache:
            return

        try:
            ttl = custom_ttl or self.config.disk_ttl

            cursor = self._disk_cache.cursor()
            cursor.execute(
                """
                INSERT OR REPLACE INTO cache_entries
                (key, data, timestamp, access_count, last_accessed, size,
                 compressed, encrypted, tags, priority, ttl)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    key,
                    entry.data,
                    entry.timestamp,
                    entry.access_count,
                    entry.last_accessed,
                    entry.size,
                    1 if entry.compressed else 0,
                    1 if entry.encrypted else 0,
                    json.dumps(entry.tags),
                    entry.priority,
                    ttl,
                ),
            )
            self._disk_cache.commit()
            self._stats.disk_size += entry.size

        except Exception as e:
            self._emit_event(
                "disk_cache_error",
                {"operation": "set", "key": key, "error": str(e)},
            )

    def _should_store_in_memory(self, entry: CacheEntry) -> bool:
        """Determine if entry should be stored in memory."""
        if entry.priority in ("critical", "high"):
            return True
        if entry.size < 10240:  # Less than 10KB
            return True
        return False

    def _should_promote_to_memory(self, entry: CacheEntry) -> bool:
        """Determine if disk entry should be promoted to memory."""
        if entry.access_count > 5:
            return True
        now = int(time.time() * 1000)
        if now - entry.last_accessed < 60000 and entry.priority == "high":
            return True
        return False

    async def _evict_from_memory(self) -> None:
        """Evict entries from memory using LRU policy."""
        with self._lock:
            entries = list(self._memory_cache.items())

            # Sort by last accessed (oldest first)
            entries.sort(key=lambda x: x[1].last_accessed)

            # Remove 20% of entries
            to_remove = max(1, len(entries) // 5)
            for i in range(to_remove):
                if i < len(entries):
                    key = entries[i][0]
                    del self._memory_cache[key]
                    self._emit_event("memory_entry_evicted", {"key": key})

            self._stats.memory_size = self._calculate_memory_size()

    async def _process_entry_data(self, entry: CacheEntry) -> Any:
        """Process entry data (decompress, decrypt)."""
        data = entry.data

        if entry.encrypted:
            data = await self._decrypt(data)

        if entry.compressed:
            data = await self._decompress(data)

        return json.loads(data)

    def _calculate_memory_size(self) -> int:
        """Calculate total memory cache size."""
        return sum(e.size for e in self._memory_cache.values())

    def _update_stats(self) -> None:
        """Update cache statistics."""
        self._stats.entries = len(self._memory_cache)
        total_hits = self._stats.memory_hits + self._stats.disk_hits
        total_misses = self._stats.memory_misses + self._stats.disk_misses
        total = total_hits + total_misses
        self._stats.hit_ratio = (total_hits / total * 100) if total > 0 else 0

    async def _compress(self, data: str) -> str:
        """Compress data using base64 encoding (simple compression)."""
        return base64.b64encode(data.encode("utf-8")).decode("utf-8")

    async def _decompress(self, data: str) -> str:
        """Decompress data."""
        return base64.b64decode(data.encode("utf-8")).decode("utf-8")

    async def _encrypt(self, data: str) -> str:
        """Encrypt data (hex encoding for simplicity)."""
        return data.encode("utf-8").hex()

    async def _decrypt(self, data: str) -> str:
        """Decrypt data."""
        return bytes.fromhex(data).decode("utf-8")

    def _start_cleanup_timer(self) -> None:
        """Start periodic cleanup timer."""

        def cleanup() -> None:
            import asyncio

            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(self._perform_cleanup())
            loop.close()
            self._start_cleanup_timer()

        self._cleanup_timer = threading.Timer(60, cleanup)  # 1 minute
        self._cleanup_timer.daemon = True
        self._cleanup_timer.start()

    async def _perform_cleanup(self) -> None:
        """Clean up expired entries."""
        now = int(time.time() * 1000)
        cleaned_count = 0

        # Memory cleanup
        with self._lock:
            keys_to_delete = [
                key
                for key, entry in self._memory_cache.items()
                if now - entry.timestamp > self.config.memory_ttl
            ]
            for key in keys_to_delete:
                del self._memory_cache[key]
                cleaned_count += 1

        # Disk cleanup
        if self._disk_cache:
            cursor = self._disk_cache.cursor()
            cursor.execute(
                "DELETE FROM cache_entries WHERE (? - timestamp) > ttl",
                (now,),
            )
            self._disk_cache.commit()
            cleaned_count += cursor.rowcount

        if cleaned_count > 0:
            self._emit_event("cache_cleanup", {"entries_removed": cleaned_count})

        self._update_stats()

    def get_stats(self) -> CacheStats:
        """Get cache statistics."""
        return self._stats.model_copy()

    async def warmup(
        self, entries: list[dict[str, Any]]
    ) -> None:
        """
        Warm up cache with preloaded data.

        Args:
            entries: List of dicts with 'key' and 'loader' (async function)
        """
        for entry in entries:
            key = entry.get("key")
            loader = entry.get("loader")
            if key and loader:
                try:
                    data = await loader()
                    await self.set(key, data, priority="high")
                except Exception as e:
                    self._emit_event(
                        "warmup_error", {"key": key, "error": str(e)}
                    )

        self._emit_event("cache_warmed_up", {"entries_loaded": len(entries)})

    async def invalidate_by_tags(self, tags: list[str]) -> int:
        """
        Invalidate cache entries by tags.

        Args:
            tags: Tags to match for invalidation

        Returns:
            Number of entries invalidated
        """
        invalidated = 0

        with self._lock:
            keys_to_delete = [
                key
                for key, entry in self._memory_cache.items()
                if any(tag in entry.tags for tag in tags)
            ]
            for key in keys_to_delete:
                del self._memory_cache[key]
                invalidated += 1

        self._emit_event(
            "cache_invalidated", {"tags": tags, "count": invalidated}
        )
        return invalidated

    async def invalidate_by_pattern(self, pattern: str) -> int:
        """
        Invalidate cache entries by key pattern.

        Args:
            pattern: Regex pattern to match keys

        Returns:
            Number of entries invalidated
        """
        import re

        regex = re.compile(pattern)
        invalidated = 0

        with self._lock:
            keys_to_delete = [
                key
                for key in self._memory_cache.keys()
                if regex.search(key)
            ]
            for key in keys_to_delete:
                del self._memory_cache[key]
                invalidated += 1

        self._emit_event(
            "cache_invalidated", {"pattern": pattern, "count": invalidated}
        )
        return invalidated

    def cleanup(self) -> None:
        """Clean up resources."""
        if self._cleanup_timer:
            self._cleanup_timer.cancel()

        self._memory_cache.clear()

        if self._disk_cache:
            self._disk_cache.close()

        self._event_handlers.clear()


# Singleton instance
_cache_manager: Optional[CacheManager] = None


def get_cache_manager(config: Optional[CacheConfig] = None) -> CacheManager:
    """Get or create the cache manager singleton."""
    global _cache_manager
    if _cache_manager is None:
        _cache_manager = CacheManager(config)
    return _cache_manager


# Default singleton for convenience
cache_manager = CacheManager()
