"""
Scaling Manager
동적 확장성 관리 및 리소스 스케일링

This module provides dynamic scaling functionality with auto-scaling,
connection pooling, event batch processing, and load balancing.
"""

import asyncio
import time
from enum import Enum
from typing import Any, Callable, Optional

from pydantic import BaseModel


class LoadBalancerAlgorithm(str, Enum):
    """Load balancer algorithms."""

    ROUND_ROBIN = "round_robin"
    LEAST_CONNECTIONS = "least_connections"
    WEIGHTED = "weighted"
    HASH = "hash"


class ScalingConfig(BaseModel):
    """Scaling configuration."""

    auto_scaling: bool = True
    min_instances: int = 1
    max_instances: int = 10
    target_cpu_usage: float = 70.0  # 0-100
    target_memory_usage: float = 80.0  # 0-100
    scale_up_threshold: float = 85.0  # 0-100
    scale_down_threshold: float = 30.0  # 0-100
    scale_up_cooldown: int = 300000  # 5 minutes (ms)
    scale_down_cooldown: int = 600000  # 10 minutes (ms)
    event_batch_size: int = 100
    max_concurrent_tasks: int = 50


class ResourceMetrics(BaseModel):
    """Resource metrics data."""

    cpu_usage: float = 0.0
    memory_usage: float = 0.0
    event_queue_length: int = 0
    active_connections: int = 0
    response_time: float = 0.0
    throughput: float = 0.0
    error_rate: float = 0.0


class ScalingAction(BaseModel):
    """Scaling action record."""

    type: str  # scale_up, scale_down, optimize, throttle
    reason: str
    timestamp: int
    metrics: ResourceMetrics
    result: Optional[dict[str, Any]] = None


class LoadBalancerConfig(BaseModel):
    """Load balancer configuration."""

    algorithm: LoadBalancerAlgorithm = LoadBalancerAlgorithm.LEAST_CONNECTIONS
    health_check_interval: int = 30000  # ms
    max_retries: int = 3
    timeout: int = 5000  # ms


class ConnectionInfo(BaseModel):
    """Connection information."""

    id: str
    is_active: bool = False
    created_at: int


class PoolMetrics(BaseModel):
    """Connection pool metrics."""

    active: int = 0
    idle: int = 0
    total: int = 0


class LoadBalancer:
    """
    Load Balancer for distributing work across instances.

    Supports multiple algorithms:
    - Round robin
    - Least connections
    - Weighted
    - Hash-based
    """

    def __init__(self, config: LoadBalancerConfig) -> None:
        """Initialize the load balancer."""
        self.config = config
        self._instances: list[dict[str, Any]] = []
        self._current_index = 0

    def add_instance(self, instance_id: str, weight: int = 1) -> None:
        """Add an instance to the load balancer."""
        self._instances.append(
            {
                "id": instance_id,
                "healthy": True,
                "connections": 0,
                "weight": weight,
            }
        )

    def remove_instance(self, instance_id: str) -> None:
        """Remove an instance from the load balancer."""
        self._instances = [i for i in self._instances if i["id"] != instance_id]

    def get_next_instance(self) -> Optional[str]:
        """Get the next instance based on the algorithm."""
        healthy = [i for i in self._instances if i["healthy"]]
        if not healthy:
            return None

        if self.config.algorithm == LoadBalancerAlgorithm.ROUND_ROBIN:
            return self._round_robin(healthy)
        elif self.config.algorithm == LoadBalancerAlgorithm.LEAST_CONNECTIONS:
            return self._least_connections(healthy)
        elif self.config.algorithm == LoadBalancerAlgorithm.WEIGHTED:
            return self._weighted(healthy)
        else:
            return healthy[0]["id"] if healthy else None

    def _round_robin(self, instances: list[dict[str, Any]]) -> str:
        """Round robin selection."""
        instance = instances[self._current_index % len(instances)]
        self._current_index += 1
        return instance["id"]

    def _least_connections(self, instances: list[dict[str, Any]]) -> str:
        """Least connections selection."""
        return min(instances, key=lambda x: x["connections"])["id"]

    def _weighted(self, instances: list[dict[str, Any]]) -> str:
        """Weighted selection."""
        import random

        total_weight = sum(i["weight"] for i in instances)
        rand = random.uniform(0, total_weight)

        for instance in instances:
            rand -= instance["weight"]
            if rand <= 0:
                return instance["id"]

        return instances[0]["id"]

    def mark_instance_healthy(self, instance_id: str, healthy: bool) -> None:
        """Mark an instance as healthy or unhealthy."""
        for instance in self._instances:
            if instance["id"] == instance_id:
                instance["healthy"] = healthy
                break

    def increment_connections(self, instance_id: str) -> None:
        """Increment connection count for an instance."""
        for instance in self._instances:
            if instance["id"] == instance_id:
                instance["connections"] += 1
                break

    def decrement_connections(self, instance_id: str) -> None:
        """Decrement connection count for an instance."""
        for instance in self._instances:
            if instance["id"] == instance_id:
                instance["connections"] = max(0, instance["connections"] - 1)
                break


class ScalingManager:
    """
    Scaling Manager for dynamic resource management.

    Provides functionality for:
    - Auto-scaling based on resource metrics
    - Connection pooling with acquire/release
    - Event batch processing
    - Load balancing across instances
    - Performance optimization triggers

    Args:
        config: Scaling configuration

    Example:
        >>> manager = ScalingManager()
        >>> manager.start_monitoring()
        >>> await manager.add_event_to_batch("events", event_data)
        >>> status = manager.get_status()
    """

    def __init__(self, config: Optional[ScalingConfig] = None) -> None:
        """Initialize the scaling manager."""
        self.config = config or ScalingConfig()
        self._current_instances = 1
        self._last_scale_action = 0
        self._scaling_history: list[ScalingAction] = []
        self._resource_metrics = ResourceMetrics()
        self._is_monitoring = False
        self._monitoring_task: Optional[asyncio.Task[None]] = None
        self._lock = asyncio.Lock()
        self._event_handlers: list[tuple[str, Any]] = []

        # Event batch processing
        self._event_batches: dict[str, list[dict[str, Any]]] = {}
        self._batch_timers: dict[str, asyncio.Task[None]] = {}

        # Connection pooling
        self._connection_pools: dict[str, list[ConnectionInfo]] = {}
        self._pool_metrics: dict[str, PoolMetrics] = {}

        # Load balancer
        self._load_balancer = LoadBalancer(
            LoadBalancerConfig(
                algorithm=LoadBalancerAlgorithm.LEAST_CONNECTIONS,
                health_check_interval=30000,
                max_retries=3,
                timeout=5000,
            )
        )

        # Import dependencies lazily
        self._async_optimizer: Optional[Any] = None
        self._memory_optimizer: Optional[Any] = None
        self._performance_profiler: Optional[Any] = None

    def _get_async_optimizer(self) -> Any:
        """Lazy import async optimizer."""
        if self._async_optimizer is None:
            from .async_optimizer import async_optimizer

            self._async_optimizer = async_optimizer
        return self._async_optimizer

    def _get_memory_optimizer(self) -> Any:
        """Lazy import memory optimizer."""
        if self._memory_optimizer is None:
            from .memory_optimizer import memory_optimizer

            self._memory_optimizer = memory_optimizer
        return self._memory_optimizer

    def _get_performance_profiler(self) -> Any:
        """Lazy import performance profiler."""
        if self._performance_profiler is None:
            from .performance_profiler import performance_profiler

            self._performance_profiler = performance_profiler
        return self._performance_profiler

    def on_event(self, event_name: str, handler: Any) -> None:
        """Register an event handler."""
        self._event_handlers.append((event_name, handler))

    def _emit_event(self, event_name: str, data: Any) -> None:
        """Emit an event to registered handlers."""
        for name, handler in self._event_handlers:
            if name == event_name:
                try:
                    if asyncio.iscoroutinefunction(handler):
                        asyncio.create_task(handler(data))
                    else:
                        handler(data)
                except Exception:
                    pass

    def start_monitoring(self) -> None:
        """Start resource monitoring."""
        if self._is_monitoring:
            return

        self._is_monitoring = True

        async def monitor_loop() -> None:
            while self._is_monitoring:
                await self._collect_metrics()
                await self._evaluate_scaling()
                await asyncio.sleep(10)  # 10 second interval

        self._monitoring_task = asyncio.create_task(monitor_loop())

        # Set up event listeners
        profiler = self._get_performance_profiler()
        profiler.on_event("bottleneck_detected", self._handle_bottleneck)
        profiler.on_event("memory_leak_detected", self._handle_memory_leak)

        self._emit_event("monitoring_started", {})

    def stop_monitoring(self) -> None:
        """Stop resource monitoring."""
        if not self._is_monitoring:
            return

        self._is_monitoring = False

        if self._monitoring_task:
            self._monitoring_task.cancel()
            self._monitoring_task = None

        self._emit_event("monitoring_stopped", {})

    async def _collect_metrics(self) -> None:
        """Collect resource metrics."""
        profiler = self._get_performance_profiler()
        metric_id = profiler.start_metric("collect_metrics")

        try:
            # Get memory usage
            try:
                import psutil

                process = psutil.Process()
                mem_info = process.memory_info()
                cpu_percent = process.cpu_percent()

                memory_usage = (
                    (mem_info.rss / mem_info.vms) * 100 if mem_info.vms > 0 else 0
                )
                cpu_usage = cpu_percent
            except ImportError:
                memory_usage = 0
                cpu_usage = 0

            # Get async optimizer stats
            optimizer = self._get_async_optimizer()
            async_stats = optimizer.get_stats()

            # Get profiler stats
            profiler_stats = profiler.get_stats()

            # Calculate throughput (tasks per second)
            throughput = async_stats.completed_tasks / 60.0

            self._resource_metrics = ResourceMetrics(
                cpu_usage=cpu_usage,
                memory_usage=memory_usage,
                event_queue_length=async_stats.queue_length,
                active_connections=self._get_active_connections(),
                response_time=profiler_stats.average_response_time,
                throughput=throughput,
                error_rate=(
                    (async_stats.failed_tasks / async_stats.total_tasks) * 100
                    if async_stats.total_tasks > 0
                    else 0
                ),
            )

            self._emit_event("metrics_collected", self._resource_metrics.model_dump())

        finally:
            profiler.end_metric(metric_id)

    def _get_active_connections(self) -> int:
        """Get total active connections across all pools."""
        total = 0
        for metrics in self._pool_metrics.values():
            total += metrics.active
        return total

    async def _evaluate_scaling(self) -> None:
        """Evaluate and perform scaling if needed."""
        if not self.config.auto_scaling:
            return

        now = int(time.time() * 1000)
        time_since_last = now - self._last_scale_action

        # Check scale up conditions
        if (
            self._should_scale_up()
            and time_since_last > self.config.scale_up_cooldown
        ):
            await self._scale_up()
        # Check scale down conditions
        elif (
            self._should_scale_down()
            and time_since_last > self.config.scale_down_cooldown
        ):
            await self._scale_down()
        # Check optimization conditions
        elif self._should_optimize():
            await self._perform_optimization()

    def _should_scale_up(self) -> bool:
        """Check if scale up is needed."""
        metrics = self._resource_metrics

        return self._current_instances < self.config.max_instances and (
            metrics.cpu_usage > self.config.scale_up_threshold
            or metrics.memory_usage > self.config.scale_up_threshold
            or metrics.event_queue_length > self.config.event_batch_size * 2
            or metrics.response_time > 5000
        )

    def _should_scale_down(self) -> bool:
        """Check if scale down is needed."""
        metrics = self._resource_metrics

        return (
            self._current_instances > self.config.min_instances
            and metrics.cpu_usage < self.config.scale_down_threshold
            and metrics.memory_usage < self.config.scale_down_threshold
            and metrics.event_queue_length < self.config.event_batch_size / 2
            and metrics.response_time < 1000
        )

    def _should_optimize(self) -> bool:
        """Check if optimization is needed."""
        metrics = self._resource_metrics

        return (
            metrics.error_rate > 5
            or metrics.response_time > 2000
            or metrics.memory_usage > 90
        )

    async def _scale_up(self) -> None:
        """Perform scale up."""
        profiler = self._get_performance_profiler()
        metric_id = profiler.start_metric("scale_up")

        try:
            action = ScalingAction(
                type="scale_up",
                reason=self._get_scale_up_reason(),
                timestamp=int(time.time() * 1000),
                metrics=self._resource_metrics.model_copy(),
            )

            # Increase instances
            new_count = min(
                self._current_instances + 1, self.config.max_instances
            )

            # Update async optimizer concurrency
            optimizer = self._get_async_optimizer()
            optimizer.update_concurrency(new_count * 10)

            # Increase batch capacity
            self._increase_batch_capacity()

            # Add instance to load balancer
            self._load_balancer.add_instance(f"instance_{new_count}")

            self._current_instances = new_count
            self._last_scale_action = int(time.time() * 1000)

            action.result = {
                "success": True,
                "new_capacity": self._current_instances,
                "message": f"Scaled up to {self._current_instances} instances",
            }

            self._scaling_history.append(action)
            self._emit_event("scaled_up", action.model_dump())

        except Exception as e:
            self._emit_event("scaling_error", {"type": "scale_up", "error": str(e)})

        finally:
            profiler.end_metric(metric_id)

    async def _scale_down(self) -> None:
        """Perform scale down."""
        profiler = self._get_performance_profiler()
        metric_id = profiler.start_metric("scale_down")

        try:
            action = ScalingAction(
                type="scale_down",
                reason="Low resource utilization",
                timestamp=int(time.time() * 1000),
                metrics=self._resource_metrics.model_copy(),
            )

            # Decrease instances
            new_count = max(
                self._current_instances - 1, self.config.min_instances
            )

            # Update async optimizer concurrency
            optimizer = self._get_async_optimizer()
            optimizer.update_concurrency(new_count * 10)

            # Decrease batch capacity
            self._decrease_batch_capacity()

            # Remove instance from load balancer
            self._load_balancer.remove_instance(f"instance_{self._current_instances}")

            self._current_instances = new_count
            self._last_scale_action = int(time.time() * 1000)

            action.result = {
                "success": True,
                "new_capacity": self._current_instances,
                "message": f"Scaled down to {self._current_instances} instances",
            }

            self._scaling_history.append(action)
            self._emit_event("scaled_down", action.model_dump())

        except Exception as e:
            self._emit_event("scaling_error", {"type": "scale_down", "error": str(e)})

        finally:
            profiler.end_metric(metric_id)

    async def _perform_optimization(self) -> None:
        """Perform performance optimization."""
        profiler = self._get_performance_profiler()
        metric_id = profiler.start_metric("performance_optimization")

        try:
            action = ScalingAction(
                type="optimize",
                reason=self._get_optimization_reason(),
                timestamp=int(time.time() * 1000),
                metrics=self._resource_metrics.model_copy(),
            )

            # Memory optimization
            memory_opt = self._get_memory_optimizer()
            await memory_opt.optimize()

            # Cache cleanup
            self._cleanup_caches()

            # Batch processing optimization
            self._optimize_batch_processing()

            # Connection pool optimization
            self._optimize_connection_pools()

            action.result = {
                "success": True,
                "message": "Performance optimization completed",
            }

            self._scaling_history.append(action)
            self._emit_event("optimized", action.model_dump())

        except Exception as e:
            self._emit_event("scaling_error", {"type": "optimize", "error": str(e)})

        finally:
            profiler.end_metric(metric_id)

    def _get_scale_up_reason(self) -> str:
        """Generate scale up reason."""
        metrics = self._resource_metrics
        reasons: list[str] = []

        if metrics.cpu_usage > self.config.scale_up_threshold:
            reasons.append(f"High CPU usage: {metrics.cpu_usage:.1f}%")
        if metrics.memory_usage > self.config.scale_up_threshold:
            reasons.append(f"High memory usage: {metrics.memory_usage:.1f}%")
        if metrics.event_queue_length > self.config.event_batch_size * 2:
            reasons.append(f"Large event queue: {metrics.event_queue_length} events")
        if metrics.response_time > 5000:
            reasons.append(f"Slow response time: {metrics.response_time:.0f}ms")

        return ", ".join(reasons) if reasons else "Scaling conditions met"

    def _get_optimization_reason(self) -> str:
        """Generate optimization reason."""
        metrics = self._resource_metrics
        reasons: list[str] = []

        if metrics.error_rate > 5:
            reasons.append(f"High error rate: {metrics.error_rate:.1f}%")
        if metrics.response_time > 2000:
            reasons.append(f"Slow response time: {metrics.response_time:.0f}ms")
        if metrics.memory_usage > 90:
            reasons.append(f"Critical memory usage: {metrics.memory_usage:.1f}%")

        return ", ".join(reasons) if reasons else "Optimization conditions met"

    async def add_event_to_batch(self, batch_name: str, event: Any) -> None:
        """
        Add an event to a batch for processing.

        Args:
            batch_name: Name of the batch
            event: Event to add
        """
        future: asyncio.Future[None] = asyncio.Future()

        async with self._lock:
            if batch_name not in self._event_batches:
                self._event_batches[batch_name] = []

            self._event_batches[batch_name].append({"event": event, "future": future})

            # Process if batch is full
            if len(self._event_batches[batch_name]) >= self.config.event_batch_size:
                asyncio.create_task(self._process_batch(batch_name))
            elif batch_name not in self._batch_timers:
                # Set timer for 1 second
                self._batch_timers[batch_name] = asyncio.create_task(
                    self._batch_timer(batch_name)
                )

        await future

    async def _batch_timer(self, batch_name: str) -> None:
        """Timer for batch processing."""
        await asyncio.sleep(1)  # 1 second wait
        await self._process_batch(batch_name)

    async def _process_batch(self, batch_name: str) -> None:
        """Process a batch of events."""
        async with self._lock:
            if batch_name not in self._event_batches:
                return

            batch = self._event_batches[batch_name]
            if not batch:
                return

            # Cancel timer
            if batch_name in self._batch_timers:
                timer = self._batch_timers[batch_name]
                if not timer.done():
                    timer.cancel()
                del self._batch_timers[batch_name]

            items = batch.copy()
            self._event_batches[batch_name] = []

        profiler = self._get_performance_profiler()
        metric_id = profiler.start_metric(f"batch_{batch_name}")

        try:
            # Process events
            events = [item["event"] for item in items]
            await self._process_batch_events(batch_name, events)

            # Resolve futures
            for item in items:
                if not item["future"].done():
                    item["future"].set_result(None)

            self._emit_event(
                "batch_processed",
                {
                    "batch_name": batch_name,
                    "event_count": len(events),
                    "processing_time": int(time.time() * 1000),
                },
            )

        except Exception as e:
            self._emit_event(
                "batch_error", {"batch_name": batch_name, "error": str(e)}
            )

        finally:
            profiler.end_metric(metric_id)

    async def _process_batch_events(
        self, batch_name: str, events: list[Any]
    ) -> None:
        """Process a list of events."""
        optimizer = self._get_async_optimizer()

        async def process_event(event: Any) -> None:
            # Simulate event processing
            await asyncio.sleep(0.01)  # 10ms per event

        tasks = [lambda e=event: process_event(e) for event in events]
        concurrency = min(self._current_instances * 5, len(events))
        await optimizer.parallel(tasks, concurrency)

    def create_connection_pool(self, pool_name: str, max_connections: int) -> None:
        """
        Create a connection pool.

        Args:
            pool_name: Name of the pool
            max_connections: Maximum connections
        """
        connections: list[ConnectionInfo] = []

        for i in range(max_connections):
            connections.append(
                ConnectionInfo(
                    id=f"conn_{i}",
                    is_active=False,
                    created_at=int(time.time() * 1000),
                )
            )

        self._connection_pools[pool_name] = connections
        self._pool_metrics[pool_name] = PoolMetrics(
            active=0,
            idle=max_connections,
            total=max_connections,
        )

        self._emit_event(
            "connection_pool_created", {"pool_name": pool_name, "size": max_connections}
        )

    async def acquire_connection(self, pool_name: str) -> ConnectionInfo:
        """
        Acquire a connection from a pool.

        Args:
            pool_name: Name of the pool

        Returns:
            Connection info

        Raises:
            Exception: If pool not found or no connections available
        """
        pool = self._connection_pools.get(pool_name)
        if not pool:
            raise Exception(f"Connection pool {pool_name} not found")

        for conn in pool:
            if not conn.is_active:
                conn.is_active = True
                self._update_pool_metrics(pool_name)
                return conn

        raise Exception(f"No available connections in pool {pool_name}")

    def release_connection(self, pool_name: str, connection: ConnectionInfo) -> None:
        """
        Release a connection back to the pool.

        Args:
            pool_name: Name of the pool
            connection: Connection to release
        """
        connection.is_active = False
        self._update_pool_metrics(pool_name)

        self._emit_event(
            "connection_released",
            {"pool_name": pool_name, "connection_id": connection.id},
        )

    def _update_pool_metrics(self, pool_name: str) -> None:
        """Update pool metrics."""
        pool = self._connection_pools.get(pool_name)
        if not pool:
            return

        active = sum(1 for conn in pool if conn.is_active)
        idle = len(pool) - active

        self._pool_metrics[pool_name] = PoolMetrics(
            active=active,
            idle=idle,
            total=len(pool),
        )

    def _handle_bottleneck(self, bottleneck: dict[str, Any]) -> None:
        """Handle bottleneck detection event."""
        if bottleneck.get("severity") == "critical":
            if self._should_scale_up():
                asyncio.create_task(self._scale_up())
            else:
                asyncio.create_task(self._perform_optimization())

    def _handle_memory_leak(self, leak: dict[str, Any]) -> None:
        """Handle memory leak detection event."""
        if leak.get("severity") in ("high", "critical"):
            memory_opt = self._get_memory_optimizer()
            asyncio.create_task(memory_opt.optimize())
            asyncio.create_task(self._perform_optimization())

    def _increase_batch_capacity(self) -> None:
        """Increase batch processing capacity."""
        self.config.event_batch_size = min(
            int(self.config.event_batch_size * 1.5), 500
        )
        self._emit_event(
            "batch_capacity_changed",
            {"new_size": self.config.event_batch_size, "direction": "increased"},
        )

    def _decrease_batch_capacity(self) -> None:
        """Decrease batch processing capacity."""
        self.config.event_batch_size = max(
            int(self.config.event_batch_size * 0.8), 50
        )
        self._emit_event(
            "batch_capacity_changed",
            {"new_size": self.config.event_batch_size, "direction": "decreased"},
        )

    def _cleanup_caches(self) -> None:
        """Request cache cleanup."""
        self._emit_event("cache_cleanup_requested", {})

    def _optimize_batch_processing(self) -> None:
        """Optimize batch processing based on response time."""
        avg_response = self._resource_metrics.response_time

        if avg_response > 3000:
            self.config.event_batch_size = max(
                int(self.config.event_batch_size * 0.9), 50
            )
        elif avg_response < 1000:
            self.config.event_batch_size = min(
                int(self.config.event_batch_size * 1.1), 500
            )

    def _optimize_connection_pools(self) -> None:
        """Optimize connection pools based on usage."""
        for pool_name, pool in self._connection_pools.items():
            metrics = self._pool_metrics.get(pool_name)
            if not metrics:
                continue

            # Low usage - shrink pool
            if metrics.active < metrics.total * 0.3:
                new_size = max(int(len(pool) * 0.8), 5)
                self._connection_pools[pool_name] = pool[:new_size]
                self._update_pool_metrics(pool_name)

            # High usage - grow pool
            elif metrics.active > metrics.total * 0.8:
                additional = int(len(pool) * 0.2)
                for i in range(additional):
                    pool.append(
                        ConnectionInfo(
                            id=f"conn_{len(pool) + i}",
                            is_active=False,
                            created_at=int(time.time() * 1000),
                        )
                    )
                self._update_pool_metrics(pool_name)

    def get_status(self) -> dict[str, Any]:
        """
        Get current scaling status.

        Returns:
            Status including instances, metrics, config, and recent actions
        """
        return {
            "instances": self._current_instances,
            "metrics": self._resource_metrics.model_dump(),
            "config": self.config.model_dump(),
            "recent_actions": [a.model_dump() for a in self._scaling_history[-10:]],
        }

    def update_config(self, new_config: dict[str, Any]) -> None:
        """
        Update scaling configuration.

        Args:
            new_config: Configuration updates
        """
        for key, value in new_config.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)

        # Handle auto_scaling toggle
        if "auto_scaling" in new_config:
            if new_config["auto_scaling"] and not self._is_monitoring:
                self.start_monitoring()
            elif not new_config["auto_scaling"] and self._is_monitoring:
                self.stop_monitoring()

        self._emit_event("config_updated", self.config.model_dump())

    def cleanup(self) -> None:
        """Clean up resources."""
        self.stop_monitoring()

        # Cancel batch timers
        for timer in self._batch_timers.values():
            if not timer.done():
                timer.cancel()

        self._event_batches.clear()
        self._batch_timers.clear()
        self._connection_pools.clear()
        self._pool_metrics.clear()
        self._scaling_history.clear()
        self._event_handlers.clear()


# Singleton instance
_scaling_manager: Optional[ScalingManager] = None


def get_scaling_manager(config: Optional[ScalingConfig] = None) -> ScalingManager:
    """Get or create the scaling manager singleton."""
    global _scaling_manager
    if _scaling_manager is None:
        _scaling_manager = ScalingManager(config)
    return _scaling_manager


# Default singleton for convenience
scaling_manager = ScalingManager()
