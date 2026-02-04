"""
Metrics Analyzer.

Analyzes collected metrics to provide insights and recommendations.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Callable

from ..events.types.base import EventCategory, EventSeverity
from .metrics_collector import MetricsCollector, get_metrics_collector
from .types.metrics import (
    AggregationType,
    Bottleneck,
    CollaborationMetrics,
    MetricAlert,
    MetricAlertType,
    MetricAnalysisResult,
    MetricData,
    MetricDefinition,
    MetricSummary,
    MetricType,
    MetricUnit,
    PerformanceMetrics,
    ProductivityMetrics,
    QualityMetrics,
    TrendDirection,
)


class MetricsAnalyzerOptions:
    """Options for metrics analyzer."""

    def __init__(
        self,
        analysis_interval: int = 120000,  # 2 minutes
        alert_thresholds: dict[str, float] | None = None,
        enable_insights: bool = True,
        enable_recommendations: bool = True,
    ):
        """
        Initialize options.

        Args:
            analysis_interval: Interval between analyses in ms.
            alert_thresholds: Metric ID to threshold mapping.
            enable_insights: Whether to generate insights.
            enable_recommendations: Whether to generate recommendations.
        """
        self.analysis_interval = analysis_interval
        self.alert_thresholds = alert_thresholds or {}
        self.enable_insights = enable_insights
        self.enable_recommendations = enable_recommendations


class MetricsAnalyzer:
    """
    Metrics analyzer.

    Analyzes collected metrics to provide insights, recommendations,
    and alerts.
    """

    def __init__(
        self,
        metrics_collector: MetricsCollector | None = None,
        options: MetricsAnalyzerOptions | None = None,
    ):
        """
        Initialize the metrics analyzer.

        Args:
            metrics_collector: Optional metrics collector instance.
            options: Optional analyzer options.
        """
        self._metrics_collector = metrics_collector or get_metrics_collector()
        self._options = options or MetricsAnalyzerOptions()
        self._is_running = False
        self._last_analysis: MetricAnalysisResult | None = None
        self._alerts: dict[str, MetricAlert] = {}
        self._listeners: dict[str, list[Callable]] = {}
        self._bottleneck_detector: Any = None  # Lazy import to avoid circular

    def start(self) -> None:
        """Start the metrics analyzer."""
        if self._is_running:
            return
        self._is_running = True

    def stop(self) -> None:
        """Stop the metrics analyzer."""
        if not self._is_running:
            return
        self._is_running = False

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

    async def perform_analysis(self) -> MetricAnalysisResult:
        """
        Perform metric analysis.

        Returns:
            Analysis result with metrics, insights, and recommendations.
        """
        now = datetime.utcnow()
        all_metrics = self._metrics_collector.get_all_metrics()

        # Get bottlenecks (lazy import to avoid circular dependency)
        bottlenecks = self._get_bottlenecks()

        # Extract category-specific metrics
        productivity_metrics = self._extract_productivity_metrics(all_metrics)
        quality_metrics = self._extract_quality_metrics(all_metrics)
        performance_metrics = self._extract_performance_metrics(all_metrics)
        collaboration_metrics = self._extract_collaboration_metrics(all_metrics)

        # Calculate overall score
        overall_score = self._calculate_overall_score(
            productivity_metrics,
            quality_metrics,
            performance_metrics,
            collaboration_metrics,
        )

        # Analyze overall trend
        overall_trend = self._analyze_overall_trend(all_metrics)

        # Generate insights
        insights = (
            self._generate_insights(all_metrics, bottlenecks)
            if self._options.enable_insights
            else []
        )

        # Generate recommendations
        recommendations = (
            self._generate_recommendations(all_metrics, bottlenecks)
            if self._options.enable_recommendations
            else []
        )

        # Generate alerts
        alerts = self._generate_alerts(all_metrics)

        result = MetricAnalysisResult(
            summary={
                "total_metrics": len(all_metrics),
                "active_bottlenecks": len(bottlenecks),
                "overall_score": overall_score,
                "trend": overall_trend.value,
            },
            productivity=productivity_metrics,
            quality=quality_metrics,
            performance=performance_metrics,
            collaboration=collaboration_metrics,
            bottlenecks=bottlenecks,
            insights=insights,
            recommendations=recommendations,
            alerts=alerts,
            generated_at=now,
        )

        self._last_analysis = result
        self.emit("analysis-completed", result)

        return result

    def _get_bottlenecks(self) -> list[Bottleneck]:
        """Get bottlenecks from detector."""
        if self._bottleneck_detector is None:
            try:
                from .bottleneck_detector import get_bottleneck_detector
                self._bottleneck_detector = get_bottleneck_detector()
            except ImportError:
                return []
        return self._bottleneck_detector.get_all_bottlenecks()

    def _extract_productivity_metrics(
        self,
        all_metrics: dict[str, MetricData],
    ) -> ProductivityMetrics:
        """Extract productivity metrics."""
        return ProductivityMetrics(
            lines_of_code_per_hour=self._find_or_create_metric(
                all_metrics, "lines_per_hour", "Lines of Code per Hour", MetricUnit.RATE
            ),
            commits_per_day=self._find_or_create_metric(
                all_metrics, "commits_per_day", "Commits per Day", MetricUnit.RATE
            ),
            files_modified_per_commit=self._find_or_create_metric(
                all_metrics, "files_per_commit", "Files Modified per Commit",
                MetricUnit.RATIO
            ),
            test_coverage=self._find_or_create_metric(
                all_metrics, "test_coverage", "Test Coverage", MetricUnit.PERCENTAGE
            ),
            code_review_time=self._find_or_create_metric(
                all_metrics, "code_review_time", "Code Review Time", MetricUnit.DURATION
            ),
            bug_fix_time=self._find_or_create_metric(
                all_metrics, "bug_fix_time", "Bug Fix Time", MetricUnit.DURATION
            ),
            feature_delivery_time=self._find_or_create_metric(
                all_metrics, "feature_delivery_time", "Feature Delivery Time",
                MetricUnit.DURATION
            ),
            working_hours=self._find_or_create_metric(
                all_metrics, "working_hours", "Working Hours", MetricUnit.DURATION
            ),
        )

    def _extract_quality_metrics(
        self,
        all_metrics: dict[str, MetricData],
    ) -> QualityMetrics:
        """Extract quality metrics."""
        return QualityMetrics(
            code_complexity=self._find_or_create_metric(
                all_metrics, "code_complexity", "Code Complexity", MetricUnit.SCORE
            ),
            duplicate_lines=self._find_or_create_metric(
                all_metrics, "duplicate_lines", "Duplicate Lines", MetricUnit.COUNT
            ),
            technical_debt=self._find_or_create_metric(
                all_metrics, "technical_debt", "Technical Debt", MetricUnit.SCORE
            ),
            bug_density=self._find_or_create_metric(
                all_metrics, "bug_density", "Bug Density", MetricUnit.RATIO
            ),
            test_pass_rate=self._find_or_create_metric(
                all_metrics, "test_pass_rate", "Test Pass Rate", MetricUnit.PERCENTAGE
            ),
            code_review_approval_rate=self._find_or_create_metric(
                all_metrics, "code_review_approval_rate", "Code Review Approval Rate",
                MetricUnit.PERCENTAGE
            ),
            refactoring_frequency=self._find_or_create_metric(
                all_metrics, "refactoring_frequency", "Refactoring Frequency",
                MetricUnit.RATE
            ),
            documentation_coverage=self._find_or_create_metric(
                all_metrics, "documentation_coverage", "Documentation Coverage",
                MetricUnit.PERCENTAGE
            ),
        )

    def _extract_performance_metrics(
        self,
        all_metrics: dict[str, MetricData],
    ) -> PerformanceMetrics:
        """Extract performance metrics."""
        return PerformanceMetrics(
            build_time=self._find_or_create_metric(
                all_metrics, "build_time", "Build Time", MetricUnit.DURATION
            ),
            test_execution_time=self._find_or_create_metric(
                all_metrics, "test_execution_time", "Test Execution Time",
                MetricUnit.DURATION
            ),
            deployment_time=self._find_or_create_metric(
                all_metrics, "deployment_time", "Deployment Time", MetricUnit.DURATION
            ),
            memory_usage=self._find_or_create_metric(
                all_metrics, "memory_usage", "Memory Usage", MetricUnit.BYTES
            ),
            cpu_usage=self._find_or_create_metric(
                all_metrics, "cpu_usage", "CPU Usage", MetricUnit.PERCENTAGE
            ),
            disk_usage=self._find_or_create_metric(
                all_metrics, "disk_usage", "Disk Usage", MetricUnit.BYTES
            ),
            network_latency=self._find_or_create_metric(
                all_metrics, "network_latency", "Network Latency", MetricUnit.DURATION
            ),
            error_rate=self._find_or_create_metric(
                all_metrics, "error_rate", "Error Rate", MetricUnit.PERCENTAGE
            ),
        )

    def _extract_collaboration_metrics(
        self,
        all_metrics: dict[str, MetricData],
    ) -> CollaborationMetrics:
        """Extract collaboration metrics."""
        return CollaborationMetrics(
            pull_requests_per_developer=self._find_or_create_metric(
                all_metrics, "pr_per_developer", "Pull Requests per Developer",
                MetricUnit.RATIO
            ),
            code_review_participation=self._find_or_create_metric(
                all_metrics, "code_review_participation", "Code Review Participation",
                MetricUnit.PERCENTAGE
            ),
            communication_frequency=self._find_or_create_metric(
                all_metrics, "communication_frequency", "Communication Frequency",
                MetricUnit.RATE
            ),
            knowledge_sharing=self._find_or_create_metric(
                all_metrics, "knowledge_sharing", "Knowledge Sharing", MetricUnit.SCORE
            ),
            pair_programming_time=self._find_or_create_metric(
                all_metrics, "pair_programming_time", "Pair Programming Time",
                MetricUnit.DURATION
            ),
            meeting_time=self._find_or_create_metric(
                all_metrics, "meeting_time", "Meeting Time", MetricUnit.DURATION
            ),
            mentorship_activities=self._find_or_create_metric(
                all_metrics, "mentorship_activities", "Mentorship Activities",
                MetricUnit.COUNT
            ),
        )

    def _find_or_create_metric(
        self,
        all_metrics: dict[str, MetricData],
        metric_id: str,
        name: str,
        unit: MetricUnit,
    ) -> MetricData:
        """Find an existing metric or create a default one."""
        existing = all_metrics.get(metric_id)
        if existing:
            return existing

        # Create default metric
        definition = MetricDefinition(
            id=metric_id,
            name=name,
            description=f"Auto-generated metric: {name}",
            type=self._infer_metric_type(metric_id),
            unit=unit,
            aggregation_type=self._infer_aggregation_type(unit),
            category=self._infer_category(metric_id),
            tags=["auto-generated"],
        )

        return MetricData(
            definition=definition,
            values=[],
            last_updated=datetime.utcnow(),
            summary=MetricSummary(
                current=0.0,
                previous=0.0,
                change=0.0,
                change_percentage=0.0,
                trend=TrendDirection.STABLE,
                min=0.0,
                max=0.0,
                average=0.0,
                median=0.0,
            ),
        )

    def _calculate_overall_score(
        self,
        productivity: ProductivityMetrics,
        quality: QualityMetrics,
        performance: PerformanceMetrics,
        collaboration: CollaborationMetrics,
    ) -> int:
        """Calculate overall score from all metric categories."""
        scores = [
            self._calculate_category_score([
                productivity.lines_of_code_per_hour,
                productivity.commits_per_day,
                productivity.test_coverage,
            ]),
            self._calculate_category_score([
                quality.test_pass_rate,
                quality.code_review_approval_rate,
            ]),
            self._calculate_category_score([
                performance.build_time,
                performance.test_execution_time,
            ]),
            self._calculate_category_score([
                collaboration.code_review_participation,
                collaboration.communication_frequency,
            ]),
        ]

        valid_scores = [s for s in scores if s > 0]
        if not valid_scores:
            return 50

        return round(sum(valid_scores) / len(valid_scores))

    def _calculate_category_score(self, metrics: list[MetricData]) -> int:
        """Calculate score for a category of metrics."""
        valid_metrics = [m for m in metrics if m.values]
        if not valid_metrics:
            return 0

        total_score = 0
        for metric in valid_metrics:
            score = 50  # Base score

            # Adjust by trend
            if metric.summary.trend == TrendDirection.INCREASING:
                score += 20
            elif metric.summary.trend == TrendDirection.DECREASING:
                score -= 20
            elif metric.summary.trend == TrendDirection.VOLATILE:
                score -= 10

            # Adjust by change percentage
            change_percent = abs(metric.summary.change_percentage)
            if change_percent > 50:
                score -= 15
            elif change_percent > 20:
                score -= 5

            total_score += max(0, min(100, score))

        return round(total_score / len(valid_metrics))

    def _analyze_overall_trend(
        self,
        all_metrics: dict[str, MetricData],
    ) -> TrendDirection:
        """Analyze overall trend from all metrics."""
        trends = [
            m.summary.trend
            for m in all_metrics.values()
            if m.values
        ]

        if not trends:
            return TrendDirection.STABLE

        trend_counts: dict[TrendDirection, int] = {}
        for trend in trends:
            trend_counts[trend] = trend_counts.get(trend, 0) + 1

        max_count = max(trend_counts.values())
        for trend, count in trend_counts.items():
            if count == max_count:
                return trend

        return TrendDirection.STABLE

    def _generate_insights(
        self,
        all_metrics: dict[str, MetricData],
        bottlenecks: list[Bottleneck],
    ) -> list[str]:
        """Generate insights from metrics and bottlenecks."""
        insights: list[str] = []

        # Metric-based insights
        metrics_with_values = [m for m in all_metrics.values() if m.values]

        if metrics_with_values:
            increasing = [
                m for m in metrics_with_values
                if m.summary.trend == TrendDirection.INCREASING
            ]
            decreasing = [
                m for m in metrics_with_values
                if m.summary.trend == TrendDirection.DECREASING
            ]

            if len(increasing) > len(decreasing):
                insights.append(
                    "Overall development activity is trending upward"
                )
            elif len(decreasing) > len(increasing):
                insights.append("Some development metrics are declining")

            # Specific metric insights
            build_time = all_metrics.get("build_time")
            if build_time and build_time.summary.change_percentage > 30:
                insights.append(
                    "Build time has increased significantly - consider optimization"
                )

            test_coverage = all_metrics.get("test_coverage")
            if test_coverage and test_coverage.summary.current > 80:
                insights.append("Excellent test coverage maintained")

            commits_per_day = all_metrics.get("commits_per_day")
            if commits_per_day and commits_per_day.summary.current > 10:
                insights.append("High development velocity detected")

        # Bottleneck-based insights
        if bottlenecks:
            high_impact = [b for b in bottlenecks if b.impact > 70]
            if high_impact:
                insights.append(
                    f"{len(high_impact)} high-impact bottleneck(s) detected"
                )

            frequent = [b for b in bottlenecks if b.frequency > 3]
            if frequent:
                insights.append(
                    f"{len(frequent)} recurring bottleneck(s) need attention"
                )

        return insights

    def _generate_recommendations(
        self,
        all_metrics: dict[str, MetricData],
        bottlenecks: list[Bottleneck],
    ) -> list[str]:
        """Generate recommendations from metrics and bottlenecks."""
        recommendations: list[str] = []

        # Metric-based recommendations
        build_time = all_metrics.get("build_time")
        if build_time and build_time.summary.trend == TrendDirection.INCREASING:
            recommendations.append(
                "Consider implementing build caching or parallel builds"
            )

        test_coverage = all_metrics.get("test_coverage")
        if test_coverage and test_coverage.summary.current < 70:
            recommendations.append(
                "Increase test coverage to improve code quality"
            )

        error_rate = all_metrics.get("error_rate")
        if error_rate and error_rate.summary.current > 5:
            recommendations.append("Investigate and address high error rate")

        # Bottleneck-based recommendations
        for bottleneck in bottlenecks:
            if bottleneck.impact > 60:
                recommendations.extend(bottleneck.suggested_actions)

        # Remove duplicates
        return list(set(recommendations))

    def _generate_alerts(
        self,
        all_metrics: dict[str, MetricData],
    ) -> list[MetricAlert]:
        """Generate alerts from metrics."""
        alerts: list[MetricAlert] = []
        now = datetime.utcnow()

        for metric_id, metric in all_metrics.items():
            threshold = self._options.alert_thresholds.get(metric_id)
            if threshold is None:
                continue

            current = metric.summary.current
            alert_type: MetricAlertType | None = None
            severity = EventSeverity.INFO

            if current > threshold:
                alert_type = MetricAlertType.THRESHOLD_EXCEEDED
                severity = (
                    EventSeverity.ERROR
                    if current > threshold * 1.5
                    else EventSeverity.WARNING
                )
            elif current < threshold * 0.5:
                alert_type = MetricAlertType.THRESHOLD_BELOW
                severity = EventSeverity.WARNING

            if alert_type:
                alert_id = f"{metric_id}_{alert_type.value}_{int(now.timestamp() * 1000)}"
                alert = MetricAlert(
                    id=alert_id,
                    type=alert_type,
                    severity=severity,
                    metric=metric_id,
                    threshold=threshold,
                    current_value=current,
                    message=(
                        f"{metric.definition.name} is {current} "
                        f"(threshold: {threshold})"
                    ),
                    created_at=now,
                    acknowledged=False,
                )

                alerts.append(alert)
                self._alerts[alert_id] = alert

        return alerts

    def _infer_metric_type(self, metric_id: str) -> MetricType:
        """Infer metric type from ID."""
        if "test" in metric_id or "coverage" in metric_id or "quality" in metric_id:
            return MetricType.QUALITY
        if "build" in metric_id or "time" in metric_id or "performance" in metric_id:
            return MetricType.PERFORMANCE
        if "ai" in metric_id:
            return MetricType.AI_USAGE
        if "review" in metric_id or "collaboration" in metric_id:
            return MetricType.COLLABORATION
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

    def get_last_analysis(self) -> MetricAnalysisResult | None:
        """Get the most recent analysis result."""
        return self._last_analysis

    def get_alerts(self) -> list[MetricAlert]:
        """Get all alerts."""
        return list(self._alerts.values())

    def acknowledge_alert(self, alert_id: str) -> bool:
        """Acknowledge an alert."""
        alert = self._alerts.get(alert_id)
        if alert:
            alert.acknowledged = True
            return True
        return False

    def get_stats(self) -> dict[str, Any]:
        """Get analyzer statistics."""
        return {
            "is_running": self._is_running,
            "last_analysis_time": (
                self._last_analysis.generated_at.isoformat()
                if self._last_analysis
                else None
            ),
            "total_alerts": len(self._alerts),
            "unacknowledged_alerts": len(
                [a for a in self._alerts.values() if not a.acknowledged]
            ),
        }


# Singleton instance
_metrics_analyzer: MetricsAnalyzer | None = None


def get_metrics_analyzer() -> MetricsAnalyzer:
    """Get the singleton metrics analyzer instance."""
    global _metrics_analyzer
    if _metrics_analyzer is None:
        _metrics_analyzer = MetricsAnalyzer()
    return _metrics_analyzer


# Alias for compatibility
metrics_analyzer = get_metrics_analyzer()
