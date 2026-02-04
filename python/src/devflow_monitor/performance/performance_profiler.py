"""
Performance Profiler
시스템 성능 분석 및 병목점 식별

This module provides performance profiling functionality including
metric tracking, CPU/memory monitoring, bottleneck detection, and
latency percentile analysis.
"""

import asyncio
import gc
import statistics
import sys
import threading
import time
import uuid
from typing import Any, Callable, Optional, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class PerformanceMetric(BaseModel):
    """Performance metric data."""

    name: str
    start_time: float
    end_time: Optional[float] = None
    duration: Optional[float] = None
    metadata: Optional[dict[str, Any]] = None


class MemorySnapshot(BaseModel):
    """Memory usage snapshot."""

    timestamp: int
    heap_used: int
    heap_total: int
    external: int
    rss: int
    array_buffers: int


class CPUSnapshot(BaseModel):
    """CPU usage snapshot."""

    timestamp: int
    user_time: float
    system_time: float
    cpu_usage: float


class BottleneckInfo(BaseModel):
    """Bottleneck information."""

    operation: str
    average_duration: float
    call_count: int
    severity: str  # low, medium, high, critical
    impact: str


class ProfilerStats(BaseModel):
    """Profiler statistics."""

    average_response_time: float
    max_response_time: float
    min_response_time: float
    p50_response_time: float
    p95_response_time: float
    p99_response_time: float
    memory_trend: str  # increasing, stable, decreasing
    memory_leak_potential: int  # 0-100 score
    memory_usage: MemorySnapshot
    bottlenecks: list[BottleneckInfo]
    recommendations: list[str]


class PerformanceProfiler:
    """
    Performance Profiler for system performance analysis.

    Provides functionality for:
    - Metric tracking with start/end timing
    - CPU and memory monitoring
    - Bottleneck detection and severity classification
    - Memory leak detection
    - Latency percentile calculation (P50, P95, P99)
    - Performance recommendations generation

    Example:
        >>> profiler = PerformanceProfiler()
        >>> profiler.start_monitoring()
        >>> metric_id = profiler.start_metric("my_operation")
        >>> # ... do work ...
        >>> profiler.end_metric(metric_id)
        >>> stats = profiler.get_stats()
    """

    def __init__(self) -> None:
        """Initialize the performance profiler."""
        self._metrics: dict[str, PerformanceMetric] = {}
        self._completed_metrics: list[PerformanceMetric] = []
        self._memory_snapshots: list[MemorySnapshot] = []
        self._cpu_snapshots: list[CPUSnapshot] = []
        self._is_monitoring = False
        self._monitoring_task: Optional[asyncio.Task[None]] = None
        self._monitoring_thread: Optional[threading.Thread] = None
        self._max_history_size = 1000
        self._performance_history: list[ProfilerStats] = []
        self._lock = threading.Lock()
        self._event_handlers: list[tuple[str, Any]] = []
        self._stop_monitoring_flag = False

        # Capture initial memory snapshot
        self._capture_memory_snapshot()

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

    def start_metric(
        self, name: str, metadata: Optional[dict[str, Any]] = None
    ) -> str:
        """
        Start tracking a performance metric.

        Args:
            name: Name of the operation being measured
            metadata: Optional metadata for the metric

        Returns:
            Unique metric ID for ending the metric
        """
        metric_id = f"{name}_{int(time.time() * 1000)}_{uuid.uuid4().hex[:9]}"

        metric = PerformanceMetric(
            name=name,
            start_time=time.perf_counter() * 1000,  # Convert to ms
            metadata=metadata,
        )

        with self._lock:
            self._metrics[metric_id] = metric

        return metric_id

    def end_metric(self, metric_id: str) -> Optional[PerformanceMetric]:
        """
        End tracking a performance metric.

        Args:
            metric_id: The metric ID returned from start_metric

        Returns:
            The completed metric or None if not found
        """
        with self._lock:
            metric = self._metrics.get(metric_id)
            if not metric:
                return None

            end_time = time.perf_counter() * 1000  # Convert to ms
            metric.end_time = end_time
            metric.duration = end_time - metric.start_time

            del self._metrics[metric_id]
            self._completed_metrics.append(metric)

            # Limit history size
            if len(self._completed_metrics) > self._max_history_size:
                self._completed_metrics = self._completed_metrics[
                    -self._max_history_size :
                ]

        # Emit metric completed event
        self._emit_event("metric_completed", metric.model_dump())

        # Detect bottleneck (> 1000ms)
        if metric.duration and metric.duration > 1000:
            self._emit_event(
                "bottleneck_detected",
                {
                    "operation": metric.name,
                    "duration": metric.duration,
                    "severity": self._get_bottleneck_severity(metric.duration),
                },
            )

        return metric

    async def measure_async(
        self, name: str, fn: Callable[[], Any]
    ) -> Any:
        """
        Measure execution time of an async function.

        Args:
            name: Name for the metric
            fn: Async function to measure

        Returns:
            Result of the function
        """
        metric_id = self.start_metric(name)
        try:
            result = await fn()
            self.end_metric(metric_id)
            return result
        except Exception as e:
            self.end_metric(metric_id)
            raise e

    def measure_sync(self, name: str, fn: Callable[[], T]) -> T:
        """
        Measure execution time of a sync function.

        Args:
            name: Name for the metric
            fn: Function to measure

        Returns:
            Result of the function
        """
        metric_id = self.start_metric(name)
        try:
            result = fn()
            self.end_metric(metric_id)
            return result
        except Exception as e:
            self.end_metric(metric_id)
            raise e

    def start_monitoring(self, interval_ms: int = 5000) -> None:
        """
        Start system monitoring.

        Args:
            interval_ms: Monitoring interval in milliseconds
        """
        if self._is_monitoring:
            return

        self._is_monitoring = True
        self._stop_monitoring_flag = False

        def monitor_loop() -> None:
            while not self._stop_monitoring_flag:
                self._capture_memory_snapshot()
                self._capture_cpu_snapshot()
                time.sleep(interval_ms / 1000)

        self._monitoring_thread = threading.Thread(
            target=monitor_loop, daemon=True
        )
        self._monitoring_thread.start()

        self._emit_event("monitoring_started", {"interval_ms": interval_ms})

    def stop_monitoring(self) -> None:
        """Stop system monitoring."""
        if not self._is_monitoring:
            return

        self._is_monitoring = False
        self._stop_monitoring_flag = True

        if self._monitoring_thread:
            self._monitoring_thread.join(timeout=1)
            self._monitoring_thread = None

        self._emit_event("monitoring_stopped", {})

    def _capture_memory_snapshot(self) -> None:
        """Capture a memory usage snapshot."""
        try:
            import psutil

            process = psutil.Process()
            mem_info = process.memory_info()

            snapshot = MemorySnapshot(
                timestamp=int(time.time() * 1000),
                heap_used=mem_info.rss,
                heap_total=mem_info.vms,
                external=0,  # Not directly available in Python
                rss=mem_info.rss,
                array_buffers=0,  # Not applicable in Python
            )
        except ImportError:
            # Fallback without psutil
            snapshot = MemorySnapshot(
                timestamp=int(time.time() * 1000),
                heap_used=sys.getsizeof({}),  # Minimal estimate
                heap_total=0,
                external=0,
                rss=0,
                array_buffers=0,
            )

        with self._lock:
            self._memory_snapshots.append(snapshot)

            # Limit history size
            if len(self._memory_snapshots) > self._max_history_size:
                self._memory_snapshots = self._memory_snapshots[
                    -self._max_history_size :
                ]

        # Detect memory leak
        if self._detect_memory_leak():
            self._emit_event(
                "memory_leak_detected",
                {
                    "current_heap_used": snapshot.heap_used,
                    "trend": self._get_memory_trend(),
                    "severity": self._get_memory_leak_severity(),
                },
            )

    def _capture_cpu_snapshot(self) -> None:
        """Capture a CPU usage snapshot."""
        try:
            import psutil

            cpu_times = psutil.Process().cpu_times()
            cpu_percent = psutil.Process().cpu_percent()

            snapshot = CPUSnapshot(
                timestamp=int(time.time() * 1000),
                user_time=cpu_times.user,
                system_time=cpu_times.system,
                cpu_usage=cpu_percent,
            )
        except ImportError:
            snapshot = CPUSnapshot(
                timestamp=int(time.time() * 1000),
                user_time=0,
                system_time=0,
                cpu_usage=0,
            )

        with self._lock:
            self._cpu_snapshots.append(snapshot)

            # Limit history size
            if len(self._cpu_snapshots) > self._max_history_size:
                self._cpu_snapshots = self._cpu_snapshots[
                    -self._max_history_size :
                ]

    def get_stats(self) -> ProfilerStats:
        """
        Get profiler statistics.

        Returns:
            Complete profiler statistics including bottlenecks and recommendations
        """
        with self._lock:
            durations = [
                m.duration
                for m in self._completed_metrics
                if m.duration is not None
            ]

        bottlenecks = self._analyze_bottlenecks()

        # Get latest memory snapshot or create default
        if self._memory_snapshots:
            latest_snapshot = self._memory_snapshots[-1]
        else:
            latest_snapshot = MemorySnapshot(
                timestamp=int(time.time() * 1000),
                heap_used=0,
                heap_total=0,
                external=0,
                rss=0,
                array_buffers=0,
            )

        # Calculate percentiles
        if durations:
            sorted_durations = sorted(durations)
            p50 = self._percentile(sorted_durations, 50)
            p95 = self._percentile(sorted_durations, 95)
            p99 = self._percentile(sorted_durations, 99)
            avg = statistics.mean(durations)
            max_time = max(durations)
            min_time = min(durations)
        else:
            p50 = p95 = p99 = avg = max_time = min_time = 0

        return ProfilerStats(
            average_response_time=avg,
            max_response_time=max_time,
            min_response_time=min_time,
            p50_response_time=p50,
            p95_response_time=p95,
            p99_response_time=p99,
            memory_trend=self._get_memory_trend(),
            memory_leak_potential=self._get_memory_leak_potential(),
            memory_usage=latest_snapshot,
            bottlenecks=bottlenecks,
            recommendations=self._generate_recommendations(bottlenecks),
        )

    def _percentile(self, sorted_data: list[float], percentile: int) -> float:
        """Calculate percentile from sorted data."""
        if not sorted_data:
            return 0
        index = (len(sorted_data) - 1) * percentile / 100
        lower = int(index)
        upper = lower + 1
        if upper >= len(sorted_data):
            return sorted_data[-1]
        weight = index - lower
        return sorted_data[lower] * (1 - weight) + sorted_data[upper] * weight

    def _analyze_bottlenecks(self) -> list[BottleneckInfo]:
        """Analyze operations for bottlenecks."""
        operation_stats: dict[str, dict[str, Any]] = {}

        with self._lock:
            for metric in self._completed_metrics:
                if metric.duration is None:
                    continue

                if metric.name not in operation_stats:
                    operation_stats[metric.name] = {"durations": [], "count": 0}

                stats = operation_stats[metric.name]
                stats["durations"].append(metric.duration)
                stats["count"] += 1

        bottlenecks: list[BottleneckInfo] = []

        for operation, stats in operation_stats.items():
            if not stats["durations"]:
                continue

            avg_duration = statistics.mean(stats["durations"])

            # Flag as bottleneck if average > 100ms
            if avg_duration > 100:
                bottlenecks.append(
                    BottleneckInfo(
                        operation=operation,
                        average_duration=avg_duration,
                        call_count=stats["count"],
                        severity=self._get_bottleneck_severity(avg_duration),
                        impact=self._get_bottleneck_impact(
                            avg_duration, stats["count"]
                        ),
                    )
                )

        # Sort by average duration descending
        bottlenecks.sort(key=lambda b: b.average_duration, reverse=True)
        return bottlenecks

    def _get_bottleneck_severity(
        self, duration: float
    ) -> str:
        """Determine bottleneck severity based on duration."""
        if duration > 5000:
            return "critical"
        if duration > 2000:
            return "high"
        if duration > 500:
            return "medium"
        return "low"

    def _get_bottleneck_impact(self, duration: float, call_count: int) -> str:
        """Calculate bottleneck impact description."""
        total_impact = duration * call_count

        if total_impact > 60000:
            return f"High impact: {total_impact / 1000:.1f}s total delay across {call_count} calls"
        elif total_impact > 10000:
            return f"Medium impact: {total_impact / 1000:.1f}s total delay across {call_count} calls"
        else:
            return f"Low impact: {total_impact / 1000:.1f}s total delay across {call_count} calls"

    def _get_memory_trend(self) -> str:
        """Analyze memory usage trend."""
        with self._lock:
            if len(self._memory_snapshots) < 10:
                return "stable"

            recent = self._memory_snapshots[-10:]

        first = recent[0].heap_used if recent else 0
        last = recent[-1].heap_used if recent else 0

        if first == 0:
            return "stable"

        change_percent = ((last - first) / first) * 100

        if change_percent > 10:
            return "increasing"
        if change_percent < -10:
            return "decreasing"
        return "stable"

    def _detect_memory_leak(self) -> bool:
        """Detect potential memory leak."""
        with self._lock:
            if len(self._memory_snapshots) < 20:
                return False

            recent = self._memory_snapshots[-20:]

        increases = sum(
            1
            for i in range(1, len(recent))
            if recent[i].heap_used > recent[i - 1].heap_used
        )

        # If 15+ out of 20 are increases, suspect memory leak
        return increases >= 15

    def _get_memory_leak_potential(self) -> int:
        """Calculate memory leak potential score (0-100)."""
        with self._lock:
            if len(self._memory_snapshots) < 10:
                return 0

            recent = self._memory_snapshots[-10:]

        trend = self._get_memory_trend()
        growth_rate = self._calculate_memory_growth_rate(recent)

        score = 0

        if trend == "increasing":
            score += 40
        if growth_rate > 0.1:
            score += 30
        if self._detect_memory_leak():
            score += 30

        return min(score, 100)

    def _calculate_memory_growth_rate(
        self, snapshots: list[MemorySnapshot]
    ) -> float:
        """Calculate memory growth rate."""
        if len(snapshots) < 2:
            return 0

        first = snapshots[0].heap_used
        last = snapshots[-1].heap_used

        if first == 0:
            return 0

        return (last - first) / first

    def _get_memory_leak_severity(
        self,
    ) -> str:
        """Calculate memory leak severity."""
        score = self._calculate_memory_leak_score()

        if score >= 80:
            return "critical"
        if score >= 60:
            return "high"
        if score >= 40:
            return "medium"
        if score >= 20:
            return "low"
        return "none"

    def _calculate_memory_leak_score(self) -> int:
        """Calculate memory leak score."""
        with self._lock:
            recent_metrics = self._performance_history[-10:]

        if len(recent_metrics) < 3:
            return 0

        memory_increase_count = 0
        total_memory_increase = 0

        for i in range(1, len(recent_metrics)):
            current = recent_metrics[i]
            previous = recent_metrics[i - 1]

            memory_diff = (
                current.memory_usage.heap_used - previous.memory_usage.heap_used
            )
            if memory_diff > 0:
                memory_increase_count += 1
                total_memory_increase += memory_diff

        if memory_increase_count == 0:
            return 0

        increase_ratio = memory_increase_count / (len(recent_metrics) - 1)
        avg_increase = total_memory_increase / memory_increase_count

        score = 0

        # Increase frequency (max 50 points)
        score += int(increase_ratio * 50)

        # Average increase amount (max 50 points)
        max_increase_threshold = 10 * 1024 * 1024  # 10MB
        score += min(int((avg_increase / max_increase_threshold) * 50), 50)

        return min(score, 100)

    def _generate_recommendations(
        self, bottlenecks: list[BottleneckInfo]
    ) -> list[str]:
        """Generate performance recommendations."""
        recommendations: list[str] = []

        # Bottleneck-based recommendations
        for bottleneck in bottlenecks:
            if bottleneck.severity == "critical":
                recommendations.append(
                    f"CRITICAL: {bottleneck.operation} operation needs optimization "
                    f"(avg {bottleneck.average_duration:.0f}ms)"
                )
            elif bottleneck.severity == "high":
                recommendations.append(
                    f"HIGH: Consider caching or async processing for {bottleneck.operation}"
                )
            elif bottleneck.severity == "medium":
                recommendations.append(
                    f"MEDIUM: Continue monitoring {bottleneck.operation} performance"
                )

        # Memory-based recommendations
        memory_trend = self._get_memory_trend()
        memory_leak_potential = self._get_memory_leak_potential()

        if memory_trend == "increasing" and memory_leak_potential > 70:
            recommendations.append(
                "CRITICAL: High memory leak potential - immediate investigation needed"
            )
        elif memory_trend == "increasing":
            recommendations.append(
                "WARNING: Memory usage trending up - regular monitoring advised"
            )

        # Default recommendation if all is well
        if not recommendations:
            recommendations.append(
                "Performance metrics are healthy. Maintain current state."
            )

        return recommendations

    def generate_report(self) -> dict[str, Any]:
        """
        Generate a complete performance report.

        Returns:
            Report with summary and detailed metrics
        """
        with self._lock:
            recent_metrics = self._completed_metrics[-50:]
            memory_history = self._memory_snapshots[-50:]
            cpu_history = self._cpu_snapshots[-50:]

        return {
            "summary": self.get_stats().model_dump(),
            "details": {
                "recent_metrics": [m.model_dump() for m in recent_metrics],
                "memory_history": [s.model_dump() for s in memory_history],
                "cpu_history": [s.model_dump() for s in cpu_history],
            },
        }

    def cleanup(self) -> None:
        """Clean up resources."""
        self.stop_monitoring()

        with self._lock:
            self._metrics.clear()
            self._completed_metrics.clear()
            self._memory_snapshots.clear()
            self._cpu_snapshots.clear()

        self._event_handlers.clear()


# Singleton instance
_performance_profiler: Optional[PerformanceProfiler] = None


def get_performance_profiler() -> PerformanceProfiler:
    """Get or create the performance profiler singleton."""
    global _performance_profiler
    if _performance_profiler is None:
        _performance_profiler = PerformanceProfiler()
    return _performance_profiler


# Default singleton for convenience
performance_profiler = PerformanceProfiler()
