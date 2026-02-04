"""
Metrics Type Definitions.

This module defines types for metrics collection, analysis, and
bottleneck detection in the development process.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from ...events.types.base import EventCategory, EventSeverity


class MetricType(str, Enum):
    """Metric types for classification."""

    PRODUCTIVITY = "productivity"
    QUALITY = "quality"
    PERFORMANCE = "performance"
    COLLABORATION = "collaboration"
    METHODOLOGY = "methodology"
    AI_USAGE = "ai_usage"
    BOTTLENECK = "bottleneck"
    TREND = "trend"


class MetricUnit(str, Enum):
    """Metric measurement units."""

    COUNT = "count"
    PERCENTAGE = "percentage"
    RATIO = "ratio"
    DURATION = "duration"  # milliseconds
    RATE = "rate"  # per time unit
    SCORE = "score"  # 0-100
    BYTES = "bytes"
    LINES = "lines"


class TrendDirection(str, Enum):
    """Trend direction indicators."""

    INCREASING = "increasing"
    DECREASING = "decreasing"
    STABLE = "stable"
    VOLATILE = "volatile"


class AggregationType(str, Enum):
    """Aggregation methods for metrics."""

    SUM = "sum"
    AVERAGE = "average"
    COUNT = "count"
    MIN = "min"
    MAX = "max"
    MEDIAN = "median"
    PERCENTILE = "percentile"
    RATE = "rate"
    TREND = "trend"


class TimeRange(BaseModel):
    """Time range for filtering metrics."""

    start: datetime
    end: datetime


class MetricValue(BaseModel):
    """
    Single metric value.

    Attributes:
        value: The metric value.
        unit: Unit of measurement.
        timestamp: When the value was recorded.
        metadata: Additional metadata.
    """

    value: float
    unit: MetricUnit
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)


class MetricDefinition(BaseModel):
    """
    Metric definition.

    Defines a metric type with its properties.

    Attributes:
        id: Unique metric identifier.
        name: Human-readable name.
        description: Metric description.
        type: Metric type.
        unit: Unit of measurement.
        aggregation_type: How to aggregate values.
        category: Event category.
        tags: Metric tags.
    """

    id: str
    name: str
    description: str
    type: MetricType
    unit: MetricUnit
    aggregation_type: AggregationType
    category: EventCategory
    tags: list[str] = Field(default_factory=list)


class MetricSummary(BaseModel):
    """
    Metric summary statistics.

    Attributes:
        current: Current value.
        previous: Previous value.
        change: Absolute change.
        change_percentage: Percentage change.
        trend: Trend direction.
        min: Minimum value.
        max: Maximum value.
        average: Average value.
        median: Median value.
    """

    current: float = 0.0
    previous: float = 0.0
    change: float = 0.0
    change_percentage: float = 0.0
    trend: TrendDirection = TrendDirection.STABLE
    min: float = 0.0
    max: float = 0.0
    average: float = 0.0
    median: float = 0.0


class MetricData(BaseModel):
    """
    Complete metric data.

    Attributes:
        definition: Metric definition.
        values: Historical values.
        last_updated: Last update time.
        summary: Summary statistics.
    """

    definition: MetricDefinition
    values: list[MetricValue] = Field(default_factory=list)
    last_updated: datetime = Field(default_factory=datetime.utcnow)
    summary: MetricSummary = Field(default_factory=MetricSummary)


class ProductivityMetrics(BaseModel):
    """Productivity-related metrics."""

    lines_of_code_per_hour: MetricData | None = None
    commits_per_day: MetricData | None = None
    files_modified_per_commit: MetricData | None = None
    test_coverage: MetricData | None = None
    code_review_time: MetricData | None = None
    bug_fix_time: MetricData | None = None
    feature_delivery_time: MetricData | None = None
    working_hours: MetricData | None = None


class QualityMetrics(BaseModel):
    """Code quality metrics."""

    code_complexity: MetricData | None = None
    duplicate_lines: MetricData | None = None
    technical_debt: MetricData | None = None
    bug_density: MetricData | None = None
    test_pass_rate: MetricData | None = None
    code_review_approval_rate: MetricData | None = None
    refactoring_frequency: MetricData | None = None
    documentation_coverage: MetricData | None = None


class PerformanceMetrics(BaseModel):
    """Performance-related metrics."""

    build_time: MetricData | None = None
    test_execution_time: MetricData | None = None
    deployment_time: MetricData | None = None
    memory_usage: MetricData | None = None
    cpu_usage: MetricData | None = None
    disk_usage: MetricData | None = None
    network_latency: MetricData | None = None
    error_rate: MetricData | None = None


class CollaborationMetrics(BaseModel):
    """Collaboration-related metrics."""

    pull_requests_per_developer: MetricData | None = None
    code_review_participation: MetricData | None = None
    communication_frequency: MetricData | None = None
    knowledge_sharing: MetricData | None = None
    pair_programming_time: MetricData | None = None
    meeting_time: MetricData | None = None
    mentorship_activities: MetricData | None = None


class BottleneckType(str, Enum):
    """Types of bottlenecks."""

    PROCESS = "process"
    RESOURCE = "resource"
    TECHNICAL = "technical"
    COMMUNICATION = "communication"
    QUALITY = "quality"
    WORKFLOW = "workflow"
    DEPENDENCY = "dependency"
    SKILL = "skill"


class Bottleneck(BaseModel):
    """
    Bottleneck information.

    Represents a detected bottleneck in the development process.

    Attributes:
        id: Unique bottleneck identifier.
        type: Bottleneck type.
        category: Event category.
        severity: Severity level.
        title: Short title.
        description: Detailed description.
        location: Where the bottleneck occurs.
        impact: Impact score (0-100).
        confidence: Detection confidence (0-100).
        detected_at: When first detected.
        last_occurred: Most recent occurrence.
        frequency: Occurrence count.
        duration: Total duration in ms.
        affected_metrics: Affected metric IDs.
        suggested_actions: Recommended actions.
        metadata: Additional metadata.
    """

    id: str
    type: BottleneckType
    category: EventCategory
    severity: EventSeverity
    title: str
    description: str
    location: str
    impact: int = Field(ge=0, le=100)
    confidence: int = Field(ge=0, le=100)
    detected_at: datetime = Field(default_factory=datetime.utcnow)
    last_occurred: datetime = Field(default_factory=datetime.utcnow)
    frequency: int = 1
    duration: int = 0  # milliseconds
    affected_metrics: list[str] = Field(default_factory=list)
    suggested_actions: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class MetricFilter(BaseModel):
    """
    Filter for querying metrics.

    Attributes:
        metric_types: Filter by metric types.
        categories: Filter by event categories.
        time_range: Filter by time range.
        tags: Filter by tags.
        developers: Filter by developer IDs.
        projects: Filter by project IDs.
        aggregation: Aggregation method.
        threshold: Value threshold filter.
    """

    metric_types: list[MetricType] | None = None
    categories: list[EventCategory] | None = None
    time_range: TimeRange | None = None
    tags: list[str] | None = None
    developers: list[str] | None = None
    projects: list[str] | None = None
    aggregation: AggregationType | None = None
    threshold: dict[str, float] | None = None  # min, max


class MetricAlertType(str, Enum):
    """Types of metric alerts."""

    THRESHOLD_EXCEEDED = "threshold_exceeded"
    THRESHOLD_BELOW = "threshold_below"
    TREND_ANOMALY = "trend_anomaly"
    BOTTLENECK_DETECTED = "bottleneck_detected"
    PERFORMANCE_DEGRADATION = "performance_degradation"
    QUALITY_DECLINE = "quality_decline"


class MetricAlert(BaseModel):
    """
    Metric alert.

    Represents an alert triggered by metric conditions.

    Attributes:
        id: Alert identifier.
        type: Alert type.
        severity: Severity level.
        metric: Affected metric ID.
        threshold: Threshold value.
        current_value: Current metric value.
        message: Alert message.
        created_at: When created.
        acknowledged: Whether acknowledged.
    """

    id: str
    type: MetricAlertType
    severity: EventSeverity
    metric: str
    threshold: float
    current_value: float
    message: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    acknowledged: bool = False


class MetricAnalysisResult(BaseModel):
    """
    Complete metric analysis result.

    Attributes:
        summary: Overall summary.
        productivity: Productivity metrics.
        quality: Quality metrics.
        performance: Performance metrics.
        collaboration: Collaboration metrics.
        bottlenecks: Detected bottlenecks.
        insights: Generated insights.
        recommendations: Recommendations.
        alerts: Active alerts.
        generated_at: When generated.
    """

    summary: dict[str, Any] = Field(default_factory=dict)
    productivity: ProductivityMetrics | None = None
    quality: QualityMetrics | None = None
    performance: PerformanceMetrics | None = None
    collaboration: CollaborationMetrics | None = None
    bottlenecks: list[Bottleneck] = Field(default_factory=list)
    insights: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    alerts: list[MetricAlert] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=datetime.utcnow)


class MetricConfig(BaseModel):
    """
    Metric configuration.

    Attributes:
        enabled: Whether metrics are enabled.
        sampling_interval: Sampling interval in ms.
        retention_period: Data retention in days.
        aggregation_window: Aggregation window in minutes.
        alert_thresholds: Alert thresholds by metric.
        custom_metrics: Custom metric definitions.
    """

    enabled: bool = True
    sampling_interval: int = 30000  # 30 seconds
    retention_period: int = 7  # days
    aggregation_window: int = 5  # minutes
    alert_thresholds: dict[str, float] = Field(default_factory=dict)
    custom_metrics: list[MetricDefinition] = Field(default_factory=list)
