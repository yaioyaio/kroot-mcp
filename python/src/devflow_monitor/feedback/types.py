"""
DevFlow Monitor - Feedback System Type Definitions.

Provides Pydantic models and enums for the user feedback system including
feedback collection, analysis, A/B testing, and preference learning.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class FeedbackType(str, Enum):
    """Feedback type enumeration."""

    BUG_REPORT = "bug_report"
    FEATURE_REQUEST = "feature_request"
    USABILITY_ISSUE = "usability_issue"
    PERFORMANCE_ISSUE = "performance_issue"
    DOCUMENTATION = "documentation"
    GENERAL = "general"
    PRAISE = "praise"


class FeedbackStatus(str, Enum):
    """Feedback status enumeration."""

    NEW = "new"
    REVIEWING = "reviewing"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"
    DEFERRED = "deferred"


class FeedbackPriority(str, Enum):
    """Feedback priority enumeration."""

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class FeedbackSource(str, Enum):
    """Feedback source enumeration."""

    IN_APP = "in_app"
    CLI = "cli"
    API = "api"
    DASHBOARD = "dashboard"
    EMAIL = "email"
    GITHUB = "github"
    SURVEY = "survey"


class FeedbackEventType(str, Enum):
    """Feedback event type enumeration."""

    FEEDBACK_SUBMITTED = "feedback_submitted"
    FEEDBACK_ANALYZED = "feedback_analyzed"
    FEEDBACK_STATUS_CHANGED = "feedback_status_changed"
    IMPROVEMENT_SUGGESTED = "improvement_suggested"
    PREFERENCE_LEARNED = "preference_learned"
    AB_TEST_STARTED = "ab_test_started"
    AB_TEST_COMPLETED = "ab_test_completed"


class ABTestStatus(str, Enum):
    """A/B test status enumeration."""

    DRAFT = "draft"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"


class SentimentLabel(str, Enum):
    """Sentiment analysis label."""

    POSITIVE = "positive"
    NEUTRAL = "neutral"
    NEGATIVE = "negative"


class ImprovementType(str, Enum):
    """Improvement suggestion type."""

    FEATURE = "feature"
    FIX = "fix"
    ENHANCEMENT = "enhancement"
    DOCUMENTATION = "documentation"


class ImprovementStatus(str, Enum):
    """Improvement suggestion status."""

    PROPOSED = "proposed"
    APPROVED = "approved"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    REJECTED = "rejected"


class ImpactSeverity(str, Enum):
    """Impact severity level."""

    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class ABMetricType(str, Enum):
    """A/B test metric type."""

    CONVERSION = "conversion"
    ENGAGEMENT = "engagement"
    PERFORMANCE = "performance"
    CUSTOM = "custom"


class UserBehaviorType(str, Enum):
    """User behavior event type."""

    FEATURE_USE = "feature_use"
    WORKFLOW_COMPLETE = "workflow_complete"
    PREFERENCE_CHANGE = "preference_change"
    TOOL_USE = "tool_use"


# Pydantic Models


class Submitter(BaseModel):
    """Feedback submitter information."""

    id: str | None = None
    email: str | None = None
    name: str | None = None


class FeedbackAttachment(BaseModel):
    """Feedback attachment model."""

    id: str
    filename: str
    mime_type: str
    size: int
    url: str
    uploaded_at: int


class SystemInfo(BaseModel):
    """System information for feedback context."""

    platform: str
    version: str
    node_version: str
    cpu_arch: str
    memory_total: int
    memory_free: int


class ProjectInfo(BaseModel):
    """Project information for feedback context."""

    id: str
    name: str
    stage: str
    active_time: int
    event_count: int


class PerformanceInfo(BaseModel):
    """Performance information for feedback context."""

    cpu_usage: float
    memory_usage: float
    event_queue_size: int
    response_time: float


class ErrorInfo(BaseModel):
    """Error information for bug reports."""

    message: str
    stack: str | None = None
    code: str | None = None


class UIInfo(BaseModel):
    """UI information for usability feedback."""

    view: str
    action: str | None = None
    timestamp: int


class FeedbackContext(BaseModel):
    """Feedback context model."""

    system: SystemInfo
    project: ProjectInfo | None = None
    performance: PerformanceInfo | None = None
    error: ErrorInfo | None = None
    ui: UIInfo | None = None


class UsabilityMetrics(BaseModel):
    """Usability metrics model."""

    task_completion_time: int | None = None
    error_rate: float | None = None
    click_count: int | None = None
    navigation_path: list[str] | None = None
    confusion_points: list[dict[str, Any]] | None = None


class Feedback(BaseModel):
    """Feedback model."""

    id: str
    type: FeedbackType
    title: str
    description: str
    status: FeedbackStatus = FeedbackStatus.NEW
    priority: FeedbackPriority = FeedbackPriority.MEDIUM
    source: FeedbackSource = FeedbackSource.IN_APP
    submitter: Submitter = Field(default_factory=Submitter)
    project_id: str | None = None
    submitted_at: int
    updated_at: int
    tags: list[str] = Field(default_factory=list)
    attachments: list[FeedbackAttachment] | None = None
    context: FeedbackContext | None = None
    usability_metrics: UsabilityMetrics | None = None


class SentimentAnalysis(BaseModel):
    """Sentiment analysis result."""

    score: float  # -1 to 1
    label: SentimentLabel
    confidence: float


class SuggestedCategory(BaseModel):
    """Suggested category with confidence."""

    category: str
    confidence: float


class SuggestedPriority(BaseModel):
    """Suggested priority with confidence."""

    priority: FeedbackPriority
    confidence: float


class SimilarFeedback(BaseModel):
    """Similar feedback reference."""

    id: str
    similarity: float
    title: str


class FeedbackAnalysis(BaseModel):
    """Feedback analysis result."""

    id: str
    feedback_id: str
    sentiment: SentimentAnalysis
    suggested_categories: list[SuggestedCategory] = Field(default_factory=list)
    suggested_priority: SuggestedPriority
    similar_feedback: list[SimilarFeedback] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    analyzed_at: int


class Impact(BaseModel):
    """Improvement impact assessment."""

    users: int
    severity: ImpactSeverity
    effort: ImpactSeverity


class ImprovementSuggestion(BaseModel):
    """Improvement suggestion model."""

    id: str
    feedback_ids: list[str]
    type: ImprovementType
    title: str
    description: str
    impact: Impact
    status: ImprovementStatus = ImprovementStatus.PROPOSED
    created_at: int


class PreferredFeature(BaseModel):
    """User preferred feature."""

    feature: str
    usage: int
    satisfaction: float


class WorkflowPattern(BaseModel):
    """User workflow pattern."""

    pattern: str
    frequency: int
    duration: float


class UIPreferences(BaseModel):
    """User UI preferences."""

    theme: str | None = None  # "light" | "dark" | "auto"
    layout: str | None = None
    shortcuts: dict[str, str] | None = None


class NotificationPreference(BaseModel):
    """User notification preference."""

    channel: str
    enabled: bool
    frequency: str | None = None


class UserPreference(BaseModel):
    """User preference model."""

    user_id: str
    preferred_features: list[PreferredFeature] = Field(default_factory=list)
    workflow_patterns: list[WorkflowPattern] = Field(default_factory=list)
    ui_preferences: UIPreferences = Field(default_factory=UIPreferences)
    notification_preferences: list[NotificationPreference] = Field(default_factory=list)
    learned_at: int
    confidence: float


class ABTestVariant(BaseModel):
    """A/B test variant model."""

    id: str
    name: str
    traffic_percentage: float
    changes: dict[str, Any]
    is_control: bool = False


class ABTestMetric(BaseModel):
    """A/B test metric definition."""

    name: str
    type: ABMetricType
    goal: float | None = None
    calculation: str


class ABTestAudience(BaseModel):
    """A/B test audience configuration."""

    percentage: float
    criteria: dict[str, Any] | None = None


class ABTestConfig(BaseModel):
    """A/B test configuration model."""

    id: str
    name: str
    description: str
    status: ABTestStatus = ABTestStatus.DRAFT
    variants: list[ABTestVariant]
    audience: ABTestAudience
    metrics: list[ABTestMetric]
    start_time: int | None = None
    end_time: int | None = None
    created_at: int


class VariantResult(BaseModel):
    """A/B test variant result."""

    variant_id: str
    participants: int
    metrics: dict[str, float]
    confidence: float


class ABTestWinner(BaseModel):
    """A/B test winner result."""

    variant_id: str
    confidence: float
    improvement: float


class ABTestResult(BaseModel):
    """A/B test result model."""

    test_id: str
    variant_results: list[VariantResult]
    winner: ABTestWinner | None = None
    analyzed_at: int


class FeedbackEvent(BaseModel):
    """Feedback event model."""

    type: FeedbackEventType
    feedback_id: str | None = None
    timestamp: int
    details: dict[str, Any] | None = None


class FeedbackFilter(BaseModel):
    """Feedback filter options."""

    types: list[FeedbackType] | None = None
    statuses: list[FeedbackStatus] | None = None
    priorities: list[FeedbackPriority] | None = None
    sources: list[FeedbackSource] | None = None
    project_id: str | None = None
    date_start: int | None = None
    date_end: int | None = None
    tags: list[str] | None = None
    query: str | None = None


class FeedbackStats(BaseModel):
    """Feedback statistics model."""

    total: int
    by_type: dict[str, int]
    by_status: dict[str, int]
    by_priority: dict[str, int]
    average_resolution_time: float | None = None
    sentiment_distribution: dict[str, int] | None = None


class Trend(BaseModel):
    """Trend data point."""

    period: str
    count: int
    change_rate: float | None = None


class FeedbackAnalysisSummary(BaseModel):
    """Feedback analysis summary for aggregated data."""

    total_count: int
    by_type: dict[str, int]
    by_status: dict[str, int]
    trends: list[Trend] = Field(default_factory=list)
    insights: list[str] = Field(default_factory=list)


class UserBehaviorEvent(BaseModel):
    """User behavior event model."""

    type: UserBehaviorType
    user_id: str
    feature: str | None = None
    workflow: str | None = None
    duration: int | None = None
    satisfaction: int | None = None  # 0-10
    metadata: dict[str, Any] | None = None
    timestamp: int


class MetricEvent(BaseModel):
    """A/B test metric event model."""

    test_id: str
    variant_id: str
    user_id: str
    metric: str
    value: float
    timestamp: int
