"""
Metrics Collector.

Collects and aggregates metrics from development events including
file changes, git activity, tests, builds, and AI usage.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Callable

from ..events.engine import EventEngine, get_event_engine
from ..events.types.base import BaseEvent, EventCategory
from .types.metrics import (
    AggregationType,
    MetricData,
    MetricDefinition,
    MetricSummary,
    MetricType,
    MetricUnit,
    MetricValue,
    TrendDirection,
)


class MetricsCollectorOptions:
    """Options for metrics collector."""

    def __init__(
        self,
        sampling_interval: int = 30000,  # 30 seconds
        retention_period: int = 7,  # days
        aggregation_window: int = 5,  # minutes
        enabled_metrics: list[MetricType] | None = None,
    ):
        """
        Initialize options.

        Args:
            sampling_interval: Interval between samples in ms.
            retention_period: How long to retain data in days.
            aggregation_window: Window for aggregation in minutes.
            enabled_metrics: List of enabled metric types.
        """
        self.sampling_interval = sampling_interval
        self.retention_period = retention_period
        self.aggregation_window = aggregation_window
        self.enabled_metrics = enabled_metrics


class MetricsCollector:
    """
    Metrics collector.

    Collects metrics from events and provides aggregated data.
    """

    def __init__(
        self,
        event_engine: EventEngine | None = None,
        options: MetricsCollectorOptions | None = None,
    ):
        """
        Initialize the metrics collector.

        Args:
            event_engine: Optional event engine instance.
            options: Optional collector options.
        """
        self._event_engine = event_engine or get_event_engine()
        self._options = options or MetricsCollectorOptions()
        self._is_running = False
        self._metrics: dict[str, MetricData] = {}
        self._raw_events: list[BaseEvent] = []
        self._subscription_id: str | None = None
        self._start_time = datetime.utcnow()
        self._listeners: dict[str, list[Callable]] = {}

        self._initialize_default_metrics()

    def start(self) -> None:
        """Start metrics collection."""
        if self._is_running:
            return

        self._is_running = True
        self._subscription_id = self._event_engine.subscribe(
            "*",
            self._handle_event,
        )

    def stop(self) -> None:
        """Stop metrics collection."""
        if not self._is_running:
            return

        self._is_running = False

        if self._subscription_id:
            self._event_engine.unsubscribe(self._subscription_id)
            self._subscription_id = None

    def on(self, event_type: str, handler: Callable) -> None:
        """Register an event listener."""
        if event_type not in self._listeners:
            self._listeners[event_type] = []
        self._listeners[event_type].append(handler)

    def emit(self, event_type: str, *args: Any) -> None:
        """Emit an event to listeners."""
        if event_type in self._listeners:
            for handler in self._listeners[event_type]:
                try:
                    handler(*args)
                except Exception:
                    pass

    def _initialize_default_metrics(self) -> None:
        """Initialize default metrics."""
        default_metrics = [
            MetricDefinition(
                id="total_events",
                name="Total Events",
                description="Total number of events processed",
                type=MetricType.PRODUCTIVITY,
                unit=MetricUnit.COUNT,
                aggregation_type=AggregationType.COUNT,
                category=EventCategory.SYSTEM,
                tags=["system", "events"],
            ),
            MetricDefinition(
                id="events_per_hour",
                name="Events Per Hour",
                description="Number of events processed per hour",
                type=MetricType.PRODUCTIVITY,
                unit=MetricUnit.RATE,
                aggregation_type=AggregationType.RATE,
                category=EventCategory.SYSTEM,
                tags=["system", "events", "rate"],
            ),
        ]

        for definition in default_metrics:
            self._metrics[definition.id] = MetricData(
                definition=definition,
                values=[],
                last_updated=datetime.utcnow(),
                summary=self._create_empty_summary(),
            )

    def _create_empty_summary(self) -> MetricSummary:
        """Create an empty metric summary."""
        return MetricSummary(
            current=0.0,
            previous=0.0,
            change=0.0,
            change_percentage=0.0,
            trend=TrendDirection.STABLE,
            min=0.0,
            max=0.0,
            average=0.0,
            median=0.0,
        )

    async def _handle_event(self, event: BaseEvent) -> None:
        """Handle incoming events."""
        self._raw_events.append(event)

        # Memory management: remove old events
        retention_ms = self._options.retention_period * 24 * 60 * 60 * 1000
        cutoff = datetime.utcnow().timestamp() * 1000 - retention_ms
        self._raw_events = [
            e for e in self._raw_events
            if e.timestamp.timestamp() * 1000 > cutoff
        ]

        # Update real-time metrics
        self._update_real_time_metrics(event)

    def _update_real_time_metrics(self, event: BaseEvent) -> None:
        """Update real-time metrics from event."""
        now = datetime.utcnow()

        # Category count
        category_metric_id = f"events_by_category_{event.category.value}"
        self._update_metric_value(category_metric_id, 1.0, MetricUnit.COUNT, now)

        # Severity count
        severity_metric_id = f"events_by_severity_{event.severity.value}"
        self._update_metric_value(severity_metric_id, 1.0, MetricUnit.COUNT, now)

        # Category-specific metrics
        if event.category == EventCategory.FILE:
            self._handle_file_event(event, now)
        elif event.category == EventCategory.GIT:
            self._handle_git_event(event, now)
        elif event.category == EventCategory.TEST:
            self._handle_test_event(event, now)
        elif event.category == EventCategory.BUILD:
            self._handle_build_event(event, now)
        elif event.category == EventCategory.AI:
            self._handle_ai_event(event, now)

    def _handle_file_event(self, event: BaseEvent, timestamp: datetime) -> None:
        """Handle file event."""
        if event.type == "file:changed":
            self._update_metric_value(
                "file_changes_per_hour", 1.0, MetricUnit.RATE, timestamp
            )

            path = event.data.get("new_file", {}).get("path", "")
            if path and any(path.endswith(ext) for ext in (".ts", ".js", ".tsx", ".jsx")):
                self._update_metric_value(
                    "code_file_changes", 1.0, MetricUnit.COUNT, timestamp
                )

    def _handle_git_event(self, event: BaseEvent, timestamp: datetime) -> None:
        """Handle git event."""
        if event.type == "git:commit:created":
            self._update_metric_value(
                "commits_per_day", 1.0, MetricUnit.RATE, timestamp
            )

            stats = event.data.get("stats", {})
            if stats:
                self._update_metric_value(
                    "lines_added",
                    float(stats.get("insertions", 0)),
                    MetricUnit.LINES,
                    timestamp,
                )
                self._update_metric_value(
                    "lines_deleted",
                    float(stats.get("deletions", 0)),
                    MetricUnit.LINES,
                    timestamp,
                )
                self._update_metric_value(
                    "files_modified",
                    float(stats.get("files", 0)),
                    MetricUnit.COUNT,
                    timestamp,
                )

        elif event.type == "git:branch:created":
            self._update_metric_value(
                "branches_created", 1.0, MetricUnit.COUNT, timestamp
            )

        elif event.type == "git:merge:completed":
            self._update_metric_value(
                "merges_per_day", 1.0, MetricUnit.RATE, timestamp
            )

    def _handle_test_event(self, event: BaseEvent, timestamp: datetime) -> None:
        """Handle test event."""
        if event.type == "test:run":
            self._update_metric_value(
                "test_runs", 1.0, MetricUnit.COUNT, timestamp
            )

            duration = event.data.get("duration")
            if duration is not None:
                self._update_metric_value(
                    "test_execution_time",
                    float(duration),
                    MetricUnit.DURATION,
                    timestamp,
                )

            coverage = event.data.get("coverage")
            if coverage is not None:
                self._update_metric_value(
                    "test_coverage",
                    float(coverage),
                    MetricUnit.PERCENTAGE,
                    timestamp,
                )

    def _handle_build_event(self, event: BaseEvent, timestamp: datetime) -> None:
        """Handle build event."""
        if event.type == "build:completed":
            self._update_metric_value(
                "builds_per_day", 1.0, MetricUnit.RATE, timestamp
            )

            duration = event.data.get("duration")
            if duration is not None:
                self._update_metric_value(
                    "build_time",
                    float(duration),
                    MetricUnit.DURATION,
                    timestamp,
                )

            success = event.data.get("success")
            if success is True:
                self._update_metric_value(
                    "build_success_rate", 1.0, MetricUnit.PERCENTAGE, timestamp
                )
            elif success is False:
                self._update_metric_value(
                    "build_failure_rate", 1.0, MetricUnit.PERCENTAGE, timestamp
                )

    def _handle_ai_event(self, event: BaseEvent, timestamp: datetime) -> None:
        """Handle AI event."""
        if event.type == "ai:suggestion":
            self._update_metric_value(
                "ai_suggestions", 1.0, MetricUnit.COUNT, timestamp
            )

            if event.data.get("accepted"):
                self._update_metric_value(
                    "ai_acceptance_rate", 1.0, MetricUnit.PERCENTAGE, timestamp
                )

    def _update_metric_value(
        self,
        metric_id: str,
        value: float,
        unit: MetricUnit,
        timestamp: datetime,
    ) -> None:
        """Update a metric value."""
        metric = self._metrics.get(metric_id)

        if not metric:
            # Create dynamic metric
            definition = MetricDefinition(
                id=metric_id,
                name=self._format_metric_name(metric_id),
                description=f"Auto-generated metric for {metric_id}",
                type=self._infer_metric_type(metric_id),
                unit=unit,
                aggregation_type=self._infer_aggregation_type(unit),
                category=self._infer_category(metric_id),
                tags=["auto-generated"],
            )

            metric = MetricData(
                definition=definition,
                values=[],
                last_updated=timestamp,
                summary=self._create_empty_summary(),
            )
            self._metrics[metric_id] = metric

        # Add value
        metric.values.append(
            MetricValue(
                value=value,
                unit=unit,
                timestamp=timestamp,
            )
        )
        metric.last_updated = timestamp

        # Limit value count
        if len(metric.values) > 1000:
            metric.values = metric.values[-500:]

        # Update summary
        self._update_metric_summary(metric)

    def _update_metric_summary(self, metric: MetricData) -> None:
        """Update metric summary statistics."""
        values = metric.values
        if not values:
            return

        value_list = [v.value for v in values]

        # Calculate statistics
        current = value_list[-1] if value_list else 0.0
        previous = value_list[-2] if len(value_list) > 1 else 0.0
        change = current - previous
        change_percentage = (change / previous * 100) if previous != 0 else 0.0

        min_val = min(value_list)
        max_val = max(value_list)
        average = sum(value_list) / len(value_list)

        sorted_values = sorted(value_list)
        n = len(sorted_values)
        median = (
            sorted_values[n // 2]
            if n % 2 == 1
            else (sorted_values[n // 2 - 1] + sorted_values[n // 2]) / 2
        )

        # Determine trend
        if len(value_list) < 3:
            trend = TrendDirection.STABLE
        else:
            recent = value_list[-3:]
            if all(recent[i] < recent[i + 1] for i in range(len(recent) - 1)):
                trend = TrendDirection.INCREASING
            elif all(recent[i] > recent[i + 1] for i in range(len(recent) - 1)):
                trend = TrendDirection.DECREASING
            elif max(recent) - min(recent) > average * 0.3:
                trend = TrendDirection.VOLATILE
            else:
                trend = TrendDirection.STABLE

        metric.summary = MetricSummary(
            current=current,
            previous=previous,
            change=change,
            change_percentage=change_percentage,
            trend=trend,
            min=min_val,
            max=max_val,
            average=average,
            median=median,
        )

    def _format_metric_name(self, metric_id: str) -> str:
        """Format metric ID into display name."""
        return metric_id.replace("_", " ").title()

    def _infer_metric_type(self, metric_id: str) -> MetricType:
        """Infer metric type from ID."""
        if "test" in metric_id or "coverage" in metric_id or "quality" in metric_id:
            return MetricType.QUALITY
        if "build" in metric_id or "time" in metric_id or "performance" in metric_id:
            return MetricType.PERFORMANCE
        if "ai" in metric_id:
            return MetricType.AI_USAGE
        if "commit" in metric_id or "lines" in metric_id:
            return MetricType.PRODUCTIVITY
        return MetricType.PRODUCTIVITY

    def _infer_aggregation_type(self, unit: MetricUnit) -> AggregationType:
        """Infer aggregation type from unit."""
        mapping = {
            MetricUnit.COUNT: AggregationType.SUM,
            MetricUnit.PERCENTAGE: AggregationType.AVERAGE,
            MetricUnit.RATIO: AggregationType.AVERAGE,
            MetricUnit.DURATION: AggregationType.AVERAGE,
            MetricUnit.RATE: AggregationType.RATE,
        }
        return mapping.get(unit, AggregationType.AVERAGE)

    def _infer_category(self, metric_id: str) -> EventCategory:
        """Infer event category from metric ID."""
        if "file" in metric_id:
            return EventCategory.FILE
        if "git" in metric_id or "commit" in metric_id:
            return EventCategory.GIT
        if "test" in metric_id:
            return EventCategory.TEST
        if "build" in metric_id:
            return EventCategory.BUILD
        if "ai" in metric_id:
            return EventCategory.AI
        return EventCategory.SYSTEM

    def get_metric(self, metric_id: str) -> MetricData | None:
        """Get a specific metric by ID."""
        return self._metrics.get(metric_id)

    def get_all_metrics(self) -> dict[str, MetricData]:
        """Get all metrics."""
        return dict(self._metrics)

    def get_filtered_metrics(
        self,
        metric_types: list[MetricType] | None = None,
        categories: list[EventCategory] | None = None,
        tags: list[str] | None = None,
        threshold: dict[str, float] | None = None,
    ) -> list[MetricData]:
        """Get filtered metrics."""
        metrics = list(self._metrics.values())

        if metric_types:
            metrics = [m for m in metrics if m.definition.type in metric_types]

        if categories:
            metrics = [m for m in metrics if m.definition.category in categories]

        if tags:
            metrics = [
                m for m in metrics
                if any(tag in m.definition.tags for tag in tags)
            ]

        if threshold:
            min_val = threshold.get("min")
            max_val = threshold.get("max")
            if min_val is not None:
                metrics = [m for m in metrics if m.summary.current >= min_val]
            if max_val is not None:
                metrics = [m for m in metrics if m.summary.current <= max_val]

        return metrics

    def get_metrics_snapshot(self) -> dict[str, Any]:
        """Get a snapshot of all metrics."""
        now = datetime.utcnow()
        uptime = (now - self._start_time).total_seconds() * 1000

        return {
            "timestamp": now.isoformat(),
            "uptime": uptime,
            "total_events": len(self._raw_events),
            "total_metrics": len(self._metrics),
            "metrics": {
                metric_id: {
                    "name": metric.definition.name,
                    "current": metric.summary.current,
                    "trend": metric.summary.trend.value,
                    "unit": metric.definition.unit.value,
                }
                for metric_id, metric in self._metrics.items()
            },
            "summary": {
                "top_metrics": self._get_top_metrics(5),
                "alerts": self._generate_alerts(),
                "trends": self._analyze_trends(),
            },
        }

    def _get_top_metrics(self, count: int) -> list[dict[str, Any]]:
        """Get top metrics by current value."""
        sorted_metrics = sorted(
            self._metrics.values(),
            key=lambda m: m.summary.current,
            reverse=True,
        )[:count]

        return [
            {
                "id": m.definition.id,
                "name": m.definition.name,
                "value": m.summary.current,
                "trend": m.summary.trend.value,
            }
            for m in sorted_metrics
        ]

    def _generate_alerts(self) -> list[str]:
        """Generate alerts from metric changes."""
        alerts: list[str] = []

        for metric in self._metrics.values():
            if metric.summary.change_percentage > 50:
                alerts.append(
                    f"{metric.definition.name} increased by "
                    f"{metric.summary.change_percentage:.1f}%"
                )
            elif metric.summary.change_percentage < -30:
                alerts.append(
                    f"{metric.definition.name} decreased by "
                    f"{abs(metric.summary.change_percentage):.1f}%"
                )

        return alerts

    def _analyze_trends(self) -> dict[str, str]:
        """Analyze trends for all metrics."""
        return {
            metric_id: metric.summary.trend.value
            for metric_id, metric in self._metrics.items()
        }

    def collect(self) -> list[MetricValue]:
        """
        Collect current metric values.

        Returns:
            List of all current metric values.
        """
        values: list[MetricValue] = []
        for metric in self._metrics.values():
            if metric.values:
                values.append(metric.values[-1])
        return values

    def get_summary(self) -> dict[str, Any]:
        """
        Get a summary of collected metrics.

        Returns:
            Summary dictionary.
        """
        return {
            "is_running": self._is_running,
            "total_metrics": len(self._metrics),
            "total_events": len(self._raw_events),
            "uptime": (datetime.utcnow() - self._start_time).total_seconds() * 1000,
            "metrics_by_type": self._count_metrics_by_type(),
            "top_metrics": self._get_top_metrics(5),
        }

    def _count_metrics_by_type(self) -> dict[str, int]:
        """Count metrics by type."""
        counts: dict[str, int] = {}
        for metric in self._metrics.values():
            type_name = metric.definition.type.value
            counts[type_name] = counts.get(type_name, 0) + 1
        return counts

    def get_stats(self) -> dict[str, Any]:
        """Get collector statistics."""
        import sys
        return {
            "is_running": self._is_running,
            "total_metrics": len(self._metrics),
            "total_events": len(self._raw_events),
            "uptime": (datetime.utcnow() - self._start_time).total_seconds() * 1000,
            "memory_usage": sys.getsizeof(self._raw_events),
        }


# Singleton instance
_metrics_collector: MetricsCollector | None = None


def get_metrics_collector() -> MetricsCollector:
    """Get the singleton metrics collector instance."""
    global _metrics_collector
    if _metrics_collector is None:
        _metrics_collector = MetricsCollector()
    return _metrics_collector


# Alias for compatibility
metrics_collector = get_metrics_collector()
