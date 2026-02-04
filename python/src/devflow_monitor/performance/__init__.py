"""
Performance Module
성능 최적화 모듈 통합 인덱스

This module provides integrated performance optimization functionality
including caching, memory management, performance profiling, async optimization,
and scaling management.
"""

from typing import Any, Optional

from .async_optimizer import (
    AsyncOptimizer,
    AsyncStats,
    BatchConfig,
    Task,
    TaskConfig,
    TaskPriority,
    TaskStatus,
    async_optimizer,
    get_async_optimizer,
)
from .cache_manager import (
    CacheConfig,
    CacheEntry,
    CacheManager,
    CacheStats,
    cache_manager,
    get_cache_manager,
)
from .memory_optimizer import (
    MemoryConfig,
    MemoryCacheEntry,
    MemoryOptimizer,
    MemoryStats,
    get_memory_optimizer,
    memory_optimizer,
)
from .performance_profiler import (
    BottleneckInfo,
    CPUSnapshot,
    MemorySnapshot,
    PerformanceMetric,
    PerformanceProfiler,
    ProfilerStats,
    get_performance_profiler,
    performance_profiler,
)
from .scaling_manager import (
    ConnectionInfo,
    LoadBalancer,
    LoadBalancerAlgorithm,
    LoadBalancerConfig,
    PoolMetrics,
    ResourceMetrics,
    ScalingAction,
    ScalingConfig,
    ScalingManager,
    get_scaling_manager,
    scaling_manager,
)


class PerformanceManager:
    """
    Integrated Performance Manager.

    Provides unified access to:
    - Cache management (multi-layer caching)
    - Memory optimization (LRU cache, GC management)
    - Performance profiling (CPU/memory tracking, bottleneck detection)
    - Async optimization (priority queues, batch processing, resource pools)
    - Scaling management (auto-scaling, connection pooling, load balancing)

    Example:
        >>> manager = PerformanceManager()
        >>> await manager.initialize()
        >>> report = manager.generate_report()
    """

    def __init__(self) -> None:
        """Initialize the performance manager."""
        self._initialized = False
        self._cache_manager: Optional[CacheManager] = None
        self._memory_optimizer: Optional[MemoryOptimizer] = None
        self._performance_profiler: Optional[PerformanceProfiler] = None
        self._async_optimizer: Optional[AsyncOptimizer] = None
        self._scaling_manager: Optional[ScalingManager] = None
        self._event_handlers: list[tuple[str, Any]] = []

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

    async def initialize(
        self,
        cache_config: Optional[CacheConfig] = None,
        memory_config: Optional[MemoryConfig] = None,
        scaling_config: Optional[ScalingConfig] = None,
        max_concurrency: int = 10,
    ) -> None:
        """
        Initialize the performance manager.

        Args:
            cache_config: Optional cache configuration
            memory_config: Optional memory configuration
            scaling_config: Optional scaling configuration
            max_concurrency: Maximum concurrency for async optimizer
        """
        if self._initialized:
            return

        self._cache_manager = CacheManager(cache_config)
        self._memory_optimizer = MemoryOptimizer(memory_config)
        self._performance_profiler = PerformanceProfiler()
        self._async_optimizer = AsyncOptimizer(max_concurrency)
        self._scaling_manager = ScalingManager(scaling_config)

        self._setup_event_connections()
        self._initialized = True

    def _setup_event_connections(self) -> None:
        """Set up event connections between components."""
        if self._memory_optimizer:

            def handle_memory_pressure(event: dict[str, Any]) -> None:
                if event.get("level") == "critical":
                    import asyncio

                    asyncio.create_task(self._perform_emergency_optimization())

            self._memory_optimizer.on_event(
                "memory_pressure", handle_memory_pressure
            )

        # Connect performance profiler to scaling manager
        if self._performance_profiler and self._scaling_manager:
            self._performance_profiler.on_event(
                "bottleneck_detected",
                lambda data: self._scaling_manager._handle_bottleneck(data)
                if self._scaling_manager
                else None,
            )
            self._performance_profiler.on_event(
                "memory_leak_detected",
                lambda data: self._scaling_manager._handle_memory_leak(data)
                if self._scaling_manager
                else None,
            )

    async def _perform_emergency_optimization(self) -> None:
        """Perform emergency optimization."""
        # Clear cache
        if self._cache_manager:
            await self._cache_manager.clear()

        # Optimize memory
        if self._memory_optimizer:
            await self._memory_optimizer.optimize()

        # Force garbage collection
        import gc

        gc.collect()

    def generate_report(self) -> dict[str, Any]:
        """
        Generate performance report.

        Returns:
            Performance report with all component statistics
        """
        cache_stats = (
            self._cache_manager.get_stats()
            if self._cache_manager
            else CacheStats()
        )
        memory_stats = (
            self._memory_optimizer.get_stats()
            if self._memory_optimizer
            else MemoryStats(
                heap_used=0,
                heap_total=0,
                cache_size=0,
                cache_entries=0,
                gc_events=0,
                cleanup_events=0,
                memory_pressure="unknown",
            )
        )
        profiler_stats = (
            self._performance_profiler.get_stats()
            if self._performance_profiler
            else None
        )
        async_stats = (
            self._async_optimizer.get_stats()
            if self._async_optimizer
            else None
        )
        scaling_status = (
            self._scaling_manager.get_status()
            if self._scaling_manager
            else None
        )

        recommendations = self._generate_recommendations(
            cache_stats, memory_stats
        )

        report: dict[str, Any] = {
            "cache": cache_stats.model_dump(),
            "memory": memory_stats.model_dump(),
            "recommendations": recommendations,
        }

        if profiler_stats:
            report["profiler"] = profiler_stats.model_dump()
        if async_stats:
            report["async"] = async_stats.model_dump()
        if scaling_status:
            report["scaling"] = scaling_status

        return report

    def _generate_recommendations(
        self,
        cache_stats: CacheStats,
        memory_stats: MemoryStats,
    ) -> list[str]:
        """Generate performance recommendations."""
        recommendations = []

        # Memory recommendations
        if memory_stats.memory_pressure in ("high", "critical"):
            recommendations.append(
                "Memory usage is high. Consider clearing cache or scaling up."
            )

        # Cache recommendations
        if cache_stats.hit_ratio < 50:
            recommendations.append(
                "Cache hit ratio is low. Review caching strategy."
            )

        if cache_stats.entries > 5000:
            recommendations.append(
                "Cache has many entries. Consider increasing eviction frequency."
            )

        return recommendations

    async def optimize(self) -> dict[str, Any]:
        """
        Perform optimization.

        Returns:
            Optimization results
        """
        results: dict[str, Any] = {}

        if self._memory_optimizer:
            results["memory"] = await self._memory_optimizer.optimize()

        if self._scaling_manager:
            await self._scaling_manager._perform_optimization()
            results["scaling"] = {"optimized": True}

        return results

    def get_cache_stats(self) -> CacheStats:
        """Get cache statistics."""
        if self._cache_manager:
            return self._cache_manager.get_stats()
        return CacheStats()

    def get_memory_stats(self) -> MemoryStats:
        """Get memory statistics."""
        if self._memory_optimizer:
            return self._memory_optimizer.get_stats()
        return MemoryStats(
            heap_used=0,
            heap_total=0,
            cache_size=0,
            cache_entries=0,
            gc_events=0,
            cleanup_events=0,
            memory_pressure="unknown",
        )

    def get_profiler_stats(self) -> Optional[ProfilerStats]:
        """Get profiler statistics."""
        if self._performance_profiler:
            return self._performance_profiler.get_stats()
        return None

    def get_async_stats(self) -> Optional[AsyncStats]:
        """Get async optimizer statistics."""
        if self._async_optimizer:
            return self._async_optimizer.get_stats()
        return None

    def get_scaling_status(self) -> Optional[dict[str, Any]]:
        """Get scaling manager status."""
        if self._scaling_manager:
            return self._scaling_manager.get_status()
        return None

    def start_monitoring(self, profiler_interval_ms: int = 5000) -> None:
        """
        Start all monitoring systems.

        Args:
            profiler_interval_ms: Profiler monitoring interval in milliseconds
        """
        if self._performance_profiler:
            self._performance_profiler.start_monitoring(profiler_interval_ms)
        if self._scaling_manager:
            self._scaling_manager.start_monitoring()

    def stop_monitoring(self) -> None:
        """Stop all monitoring systems."""
        if self._performance_profiler:
            self._performance_profiler.stop_monitoring()
        if self._scaling_manager:
            self._scaling_manager.stop_monitoring()

    def start_metric(
        self, name: str, metadata: Optional[dict[str, Any]] = None
    ) -> Optional[str]:
        """
        Start tracking a performance metric.

        Args:
            name: Metric name
            metadata: Optional metadata

        Returns:
            Metric ID for ending the metric
        """
        if self._performance_profiler:
            return self._performance_profiler.start_metric(name, metadata)
        return None

    def end_metric(self, metric_id: str) -> Optional[PerformanceMetric]:
        """
        End tracking a performance metric.

        Args:
            metric_id: Metric ID from start_metric

        Returns:
            Completed metric
        """
        if self._performance_profiler:
            return self._performance_profiler.end_metric(metric_id)
        return None

    async def add_task(
        self,
        name: str,
        fn: Any,
        config: Optional[TaskConfig] = None,
    ) -> Any:
        """
        Add a task to the async optimizer queue.

        Args:
            name: Task name
            fn: Async function to execute
            config: Optional task configuration

        Returns:
            Task result
        """
        if self._async_optimizer:
            return await self._async_optimizer.add_task(name, fn, config)
        # Fallback: execute directly
        return await fn() if callable(fn) else None

    async def parallel(
        self, tasks: list[Any], concurrency: Optional[int] = None
    ) -> list[Any]:
        """
        Execute tasks in parallel with limited concurrency.

        Args:
            tasks: List of async functions
            concurrency: Maximum concurrent tasks

        Returns:
            List of results
        """
        if self._async_optimizer:
            return await self._async_optimizer.parallel(tasks, concurrency)
        # Fallback: execute sequentially
        import asyncio

        return [await t() if asyncio.iscoroutinefunction(t) else t() for t in tasks]

    async def cache_set(
        self,
        key: str,
        data: Any,
        ttl: Optional[int] = None,
        tags: Optional[list[str]] = None,
    ) -> None:
        """
        Store data in cache.

        Args:
            key: Cache key
            data: Data to cache
            ttl: Optional TTL in milliseconds
            tags: Optional tags for invalidation
        """
        if self._cache_manager:
            await self._cache_manager.set(key, data, ttl=ttl, tags=tags)

    async def cache_get(self, key: str) -> Optional[Any]:
        """
        Retrieve data from cache.

        Args:
            key: Cache key

        Returns:
            Cached data or None
        """
        if self._cache_manager:
            return await self._cache_manager.get(key)
        return None

    async def cache_delete(self, key: str) -> bool:
        """
        Delete data from cache.

        Args:
            key: Cache key

        Returns:
            True if deleted
        """
        if self._cache_manager:
            return await self._cache_manager.delete(key)
        return False

    async def cache_clear(self) -> None:
        """Clear all cache entries."""
        if self._cache_manager:
            await self._cache_manager.clear()

    async def invalidate_by_tags(self, tags: list[str]) -> int:
        """
        Invalidate cache entries by tags.

        Args:
            tags: Tags to match

        Returns:
            Number of entries invalidated
        """
        if self._cache_manager:
            return await self._cache_manager.invalidate_by_tags(tags)
        return 0

    def cleanup(self) -> None:
        """Clean up resources."""
        if not self._initialized:
            return

        if self._cache_manager:
            self._cache_manager.cleanup()

        if self._memory_optimizer:
            self._memory_optimizer.cleanup()

        if self._performance_profiler:
            self._performance_profiler.cleanup()

        if self._async_optimizer:
            self._async_optimizer.cleanup()

        if self._scaling_manager:
            self._scaling_manager.cleanup()

        self._event_handlers.clear()
        self._initialized = False


# Singleton instance
_performance_manager: Optional[PerformanceManager] = None


def get_performance_manager() -> PerformanceManager:
    """Get or create the performance manager singleton."""
    global _performance_manager
    if _performance_manager is None:
        _performance_manager = PerformanceManager()
    return _performance_manager


# Default singleton for convenience
performance_manager = PerformanceManager()


# Export all public components
__all__ = [
    # Manager classes
    "PerformanceManager",
    "CacheManager",
    "MemoryOptimizer",
    "PerformanceProfiler",
    "AsyncOptimizer",
    "ScalingManager",
    "LoadBalancer",
    # Config classes
    "CacheConfig",
    "MemoryConfig",
    "TaskConfig",
    "BatchConfig",
    "ScalingConfig",
    "LoadBalancerConfig",
    # Enum classes
    "TaskPriority",
    "TaskStatus",
    "LoadBalancerAlgorithm",
    # Data classes - Cache
    "CacheEntry",
    "CacheStats",
    # Data classes - Memory
    "MemoryCacheEntry",
    "MemoryStats",
    # Data classes - Profiler
    "PerformanceMetric",
    "MemorySnapshot",
    "CPUSnapshot",
    "BottleneckInfo",
    "ProfilerStats",
    # Data classes - Async
    "Task",
    "AsyncStats",
    # Data classes - Scaling
    "ResourceMetrics",
    "ScalingAction",
    "ConnectionInfo",
    "PoolMetrics",
    # Singleton instances
    "cache_manager",
    "memory_optimizer",
    "performance_profiler",
    "async_optimizer",
    "scaling_manager",
    "performance_manager",
    # Factory functions
    "get_cache_manager",
    "get_memory_optimizer",
    "get_performance_profiler",
    "get_async_optimizer",
    "get_scaling_manager",
    "get_performance_manager",
]
