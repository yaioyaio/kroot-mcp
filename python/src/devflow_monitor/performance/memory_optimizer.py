"""
Memory Optimizer
메모리 사용량 최적화 및 관리

This module provides memory management functionality with LRU caching,
automatic garbage collection triggering, and memory pressure monitoring.
"""

import gc
import sys
import threading
import time
from typing import Any, Callable, Optional, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class MemoryConfig(BaseModel):
    """Memory optimizer configuration."""

    max_heap_usage: int = 512 * 1024 * 1024  # 512MB
    max_cache_size: int = 10000  # entries
    gc_threshold: float = 0.8  # 80% heap usage
    cleanup_interval: int = 30000  # 30 seconds (ms)
    enable_auto_cleanup: bool = True
    default_ttl: Optional[int] = None  # default TTL in ms


class MemoryCacheEntry(BaseModel):
    """Memory cache entry."""

    key: str
    value: Any
    timestamp: int
    access_count: int
    last_accessed: int
    size: int  # estimated size in bytes
    ttl: Optional[int] = None  # time to live in ms


class MemoryStats(BaseModel):
    """Memory statistics."""

    heap_used: int
    heap_total: int
    cache_size: int
    cache_entries: int
    gc_events: int
    cleanup_events: int
    memory_pressure: str  # low, medium, high, critical


class MemoryOptimizer:
    """
    Memory Optimizer for cache and memory management.

    Provides functionality for:
    - LRU cache with TTL support
    - Memory usage monitoring
    - Automatic garbage collection triggering
    - Memory pressure detection and response

    Args:
        config: Memory optimizer configuration

    Example:
        >>> optimizer = MemoryOptimizer()
        >>> optimizer.set("key", {"data": "value"}, ttl=60000)
        >>> value = optimizer.get("key")
    """

    def __init__(self, config: Optional[MemoryConfig] = None) -> None:
        """Initialize the memory optimizer."""
        self.config = config or MemoryConfig()
        self._cache: dict[str, MemoryCacheEntry] = {}
        self._cleanup_timer: Optional[threading.Timer] = None
        self._gc_events = 0
        self._cleanup_events = 0
        self._is_optimizing = False
        self._lock = threading.Lock()
        self._event_handlers: list[tuple[str, Any]] = []

        # LRU tracking (doubly linked list simulation)
        self._lru_order: list[str] = []

        self._setup_memory_monitoring()

        if self.config.enable_auto_cleanup:
            self._start_auto_cleanup()

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

    def set(self, key: str, value: T, ttl: Optional[int] = None) -> None:
        """
        Store a value in the cache.

        Args:
            key: Cache key
            value: Value to store
            ttl: Optional TTL in milliseconds
        """
        now = int(time.time() * 1000)
        estimated_size = self._estimate_size(value)

        # Remove existing entry
        if key in self._cache:
            self.delete(key)

        # Check memory pressure
        if self._is_memory_pressure_high():
            self._perform_emergency_cleanup()

        # Check cache size limit
        if len(self._cache) >= self.config.max_cache_size:
            self._evict_lru()

        entry = MemoryCacheEntry(
            key=key,
            value=value,
            timestamp=now,
            access_count=1,
            last_accessed=now,
            size=estimated_size,
            ttl=ttl or self.config.default_ttl,
        )

        with self._lock:
            self._cache[key] = entry
            self._add_to_lru(key)

        self._emit_event("cache_set", {"key": key, "size": estimated_size})

    def get(self, key: str) -> Optional[T]:
        """
        Retrieve a value from the cache.

        Args:
            key: Cache key

        Returns:
            Cached value or None if not found/expired
        """
        with self._lock:
            entry = self._cache.get(key)

            if not entry:
                self._emit_event("cache_miss", {"key": key})
                return None

            # Check TTL
            now = int(time.time() * 1000)
            if entry.ttl and now - entry.timestamp > entry.ttl:
                self.delete(key)
                self._emit_event("cache_expired", {"key": key})
                return None

            # Update access info
            entry.access_count += 1
            entry.last_accessed = now

            # Update LRU order
            self._move_to_head(key)

            self._emit_event(
                "cache_hit", {"key": key, "access_count": entry.access_count}
            )
            return entry.value

    def delete(self, key: str) -> bool:
        """
        Delete an entry from the cache.

        Args:
            key: Cache key

        Returns:
            True if deleted
        """
        with self._lock:
            entry = self._cache.get(key)
            if not entry:
                return False

            del self._cache[key]
            self._remove_from_lru(key)

        self._emit_event("cache_delete", {"key": key, "size": entry.size})
        return True

    def clear(self) -> None:
        """Clear all cache entries."""
        with self._lock:
            size = len(self._cache)
            self._cache.clear()
            self._lru_order.clear()

        self._emit_event("cache_clear", {"entries_cleared": size})

    def _is_memory_pressure_high(self) -> bool:
        """Check if memory pressure is high."""
        try:
            import psutil

            process = psutil.Process()
            memory_info = process.memory_info()
            usage_ratio = memory_info.rss / self.config.max_heap_usage
            return usage_ratio > self.config.gc_threshold
        except ImportError:
            # Fallback to sys.getsizeof estimation
            cache_size = sum(
                sys.getsizeof(e.value) for e in self._cache.values()
            )
            return cache_size > self.config.max_heap_usage * 0.8

    def _evict_lru(self) -> None:
        """Evict least recently used entry."""
        with self._lock:
            if not self._lru_order:
                return

            # Get oldest entry (end of list)
            key = self._lru_order[-1]
            entry = self._cache.get(key)

            if entry:
                self.delete(key)
                self._emit_event(
                    "lru_eviction",
                    {
                        "key": key,
                        "access_count": entry.access_count,
                        "age": int(time.time() * 1000) - entry.timestamp,
                    },
                )

    def _perform_emergency_cleanup(self) -> None:
        """Perform emergency memory cleanup."""
        self._cleanup_events += 1

        # Clean expired entries
        self._cleanup_expired_entries()

        # If still under pressure, evict LRU entries
        if self._is_memory_pressure_high():
            entries_to_remove = max(1, len(self._cache) // 5)  # 20%

            for _ in range(entries_to_remove):
                if self._lru_order:
                    self._evict_lru()

        # Force garbage collection
        collected = gc.collect()
        if collected > 0:
            self._gc_events += 1
            self._emit_event("forced_gc", {"trigger": "emergency_cleanup"})

        self._emit_event(
            "emergency_cleanup",
            {
                "entries_removed": entries_to_remove if "entries_to_remove" in dir() else 0,
                "memory_freed": self._calculate_cache_size(),
            },
        )

    def _cleanup_expired_entries(self) -> None:
        """Clean up expired cache entries."""
        now = int(time.time() * 1000)
        expired_keys = []

        with self._lock:
            for key, entry in self._cache.items():
                if entry.ttl and now - entry.timestamp > entry.ttl:
                    expired_keys.append(key)

        for key in expired_keys:
            self.delete(key)

        if expired_keys:
            self._emit_event(
                "expired_entries_cleanup", {"count": len(expired_keys)}
            )

    def _start_auto_cleanup(self) -> None:
        """Start automatic cleanup timer."""

        def cleanup() -> None:
            self._perform_routine_cleanup()
            self._start_auto_cleanup()

        interval = self.config.cleanup_interval / 1000  # Convert to seconds
        self._cleanup_timer = threading.Timer(interval, cleanup)
        self._cleanup_timer.daemon = True
        self._cleanup_timer.start()

    def _perform_routine_cleanup(self) -> None:
        """Perform routine cleanup."""
        # Clean expired entries
        self._cleanup_expired_entries()

        # Check memory pressure
        if self._is_memory_pressure_high():
            self._perform_emergency_cleanup()

        # Clean unused entries (not accessed for 1 hour)
        self._cleanup_unused_entries()

        self._emit_event(
            "routine_cleanup",
            {
                "timestamp": int(time.time() * 1000),
                "cache_size": len(self._cache),
                "memory_pressure": self._get_memory_pressure_level(),
            },
        )

    def _cleanup_unused_entries(self) -> None:
        """Clean up entries not accessed for a long time."""
        now = int(time.time() * 1000)
        one_hour = 60 * 60 * 1000
        unused_keys = []

        with self._lock:
            for key, entry in self._cache.items():
                if (
                    now - entry.last_accessed > one_hour
                    and entry.access_count == 1
                ):
                    unused_keys.append(key)

        # Remove at most 10% of cache
        max_to_remove = max(1, len(self._cache) // 10)
        keys_to_remove = unused_keys[:max_to_remove]

        for key in keys_to_remove:
            self.delete(key)

        if keys_to_remove:
            self._emit_event(
                "unused_entries_cleanup", {"count": len(keys_to_remove)}
            )

    def _add_to_lru(self, key: str) -> None:
        """Add key to front of LRU list."""
        if key not in self._lru_order:
            self._lru_order.insert(0, key)

    def _remove_from_lru(self, key: str) -> None:
        """Remove key from LRU list."""
        if key in self._lru_order:
            self._lru_order.remove(key)

    def _move_to_head(self, key: str) -> None:
        """Move key to front of LRU list."""
        self._remove_from_lru(key)
        self._add_to_lru(key)

    def _estimate_size(self, value: Any) -> int:
        """Estimate the size of a value in bytes."""
        if value is None:
            return 8

        if isinstance(value, str):
            return len(value) * 2  # UTF-16

        if isinstance(value, (int, float)):
            return 8

        if isinstance(value, bool):
            return 4

        if isinstance(value, bytes):
            return len(value)

        if isinstance(value, list):
            return sum(self._estimate_size(item) for item in value) + 16

        if isinstance(value, dict):
            size = 16
            for k, v in value.items():
                size += len(str(k)) * 2 + self._estimate_size(v)
            return size

        return sys.getsizeof(value)

    def _calculate_cache_size(self) -> int:
        """Calculate total cache size in bytes."""
        return sum(entry.size for entry in self._cache.values())

    def _get_memory_pressure_level(self) -> str:
        """Get current memory pressure level."""
        try:
            import psutil

            process = psutil.Process()
            memory_info = process.memory_info()
            usage_ratio = memory_info.rss / self.config.max_heap_usage

            if usage_ratio > 0.95:
                return "critical"
            if usage_ratio > 0.8:
                return "high"
            if usage_ratio > 0.6:
                return "medium"
            return "low"
        except ImportError:
            cache_size = self._calculate_cache_size()
            if cache_size > self.config.max_heap_usage * 0.95:
                return "critical"
            if cache_size > self.config.max_heap_usage * 0.8:
                return "high"
            if cache_size > self.config.max_heap_usage * 0.6:
                return "medium"
            return "low"

    def _setup_memory_monitoring(self) -> None:
        """Set up periodic memory monitoring."""

        def monitor() -> None:
            while True:
                time.sleep(10)  # Check every 10 seconds
                pressure_level = self._get_memory_pressure_level()

                if pressure_level in ("critical", "high"):
                    try:
                        import psutil

                        heap_used = psutil.Process().memory_info().rss
                    except ImportError:
                        heap_used = self._calculate_cache_size()

                    self._emit_event(
                        "memory_pressure",
                        {
                            "level": pressure_level,
                            "heap_used": heap_used,
                            "threshold": self.config.max_heap_usage,
                        },
                    )

        monitor_thread = threading.Thread(target=monitor, daemon=True)
        monitor_thread.start()

    def get_stats(self) -> MemoryStats:
        """Get memory statistics."""
        try:
            import psutil

            process = psutil.Process()
            memory_info = process.memory_info()
            heap_used = memory_info.rss
            heap_total = memory_info.vms
        except ImportError:
            heap_used = self._calculate_cache_size()
            heap_total = self.config.max_heap_usage

        return MemoryStats(
            heap_used=heap_used,
            heap_total=heap_total,
            cache_size=self._calculate_cache_size(),
            cache_entries=len(self._cache),
            gc_events=self._gc_events,
            cleanup_events=self._cleanup_events,
            memory_pressure=self._get_memory_pressure_level(),
        )

    def get_memory_usage(self) -> dict[str, Any]:
        """Get current memory usage details."""
        stats = self.get_stats()
        return {
            "heap_used": stats.heap_used,
            "heap_total": stats.heap_total,
            "cache_size": stats.cache_size,
            "cache_entries": stats.cache_entries,
            "memory_pressure": stats.memory_pressure,
            "gc_events": stats.gc_events,
            "cleanup_events": stats.cleanup_events,
        }

    def update_config(self, new_config: dict[str, Any]) -> None:
        """
        Update configuration.

        Args:
            new_config: Configuration updates
        """
        for key, value in new_config.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)

        # Restart auto cleanup with new interval
        if self._cleanup_timer:
            self._cleanup_timer.cancel()

        if self.config.enable_auto_cleanup:
            self._start_auto_cleanup()

        self._emit_event("config_updated", self.config.model_dump())

    async def optimize(self) -> dict[str, Any]:
        """
        Perform memory optimization.

        Returns:
            Optimization results with freed bytes
        """
        if self._is_optimizing:
            return {"freed_bytes": 0, "status": "already_optimizing"}

        self._is_optimizing = True
        initial_size = self._calculate_cache_size()

        try:
            # Step-by-step optimization
            self._cleanup_expired_entries()
            self._cleanup_unused_entries()

            # Emergency cleanup if critical
            if self._get_memory_pressure_level() == "critical":
                self._perform_emergency_cleanup()

            # Force garbage collection
            collected = gc.collect()
            if collected > 0:
                self._gc_events += 1

            final_size = self._calculate_cache_size()
            freed_bytes = initial_size - final_size

            self._emit_event(
                "optimization_complete",
                {
                    "final_cache_size": len(self._cache),
                    "memory_pressure": self._get_memory_pressure_level(),
                    "freed_bytes": freed_bytes,
                },
            )

            return {
                "freed_bytes": freed_bytes,
                "initial_size": initial_size,
                "final_size": final_size,
                "memory_pressure": self._get_memory_pressure_level(),
                "status": "success",
            }

        finally:
            self._is_optimizing = False

    def cleanup(self) -> None:
        """Clean up resources."""
        if self._cleanup_timer:
            self._cleanup_timer.cancel()
            self._cleanup_timer = None

        self.clear()
        self._event_handlers.clear()


# Singleton instance
_memory_optimizer: Optional[MemoryOptimizer] = None


def get_memory_optimizer(
    config: Optional[MemoryConfig] = None,
) -> MemoryOptimizer:
    """Get or create the memory optimizer singleton."""
    global _memory_optimizer
    if _memory_optimizer is None:
        _memory_optimizer = MemoryOptimizer(config)
    return _memory_optimizer


# Default singleton for convenience
memory_optimizer = MemoryOptimizer()
