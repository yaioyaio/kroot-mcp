"""
Report System Types and Models.

Defines Pydantic models for report generation, scheduling, and delivery.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field
from uuid import uuid4

from ..events.types.base import EventCategory, EventSeverity


class ReportType(str, Enum):
    """Report type enumeration."""

    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    CUSTOM = "custom"
    INCIDENT = "incident"
    PERFORMANCE = "performance"
    METHODOLOGY = "methodology"
    AI_USAGE = "ai_usage"
    CROSS_PROJECT = "cross_project"


class ReportFormat(str, Enum):
    """Report output format enumeration."""

    PDF = "pdf"
    HTML = "html"
    MARKDOWN = "markdown"
    JSON = "json"
    CSV = "csv"
    EXCEL = "excel"


class DeliveryChannel(str, Enum):
    """Report delivery channel enumeration."""

    EMAIL = "email"
    SLACK = "slack"
    WEBHOOK = "webhook"
    FILE_SYSTEM = "file_system"
    S3 = "s3"
    FTP = "ftp"


class ReportStatus(str, Enum):
    """Report generation status enumeration."""

    PENDING = "pending"
    GENERATING = "generating"
    COMPLETED = "completed"
    DELIVERED = "delivered"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ReportSectionType(str, Enum):
    """Report section type enumeration."""

    EXECUTIVE_SUMMARY = "executive_summary"
    METRICS_OVERVIEW = "metrics_overview"
    ACTIVITY_TIMELINE = "activity_timeline"
    DEVELOPMENT_STAGES = "development_stages"
    METHODOLOGY_COMPLIANCE = "methodology_compliance"
    AI_COLLABORATION = "ai_collaboration"
    BOTTLENECK_ANALYSIS = "bottleneck_analysis"
    PERFORMANCE_TRENDS = "performance_trends"
    QUALITY_METRICS = "quality_metrics"
    TEAM_PRODUCTIVITY = "team_productivity"
    INCIDENT_REPORT = "incident_report"
    RECOMMENDATIONS = "recommendations"
    CUSTOM = "custom"


class ReportEventType(str, Enum):
    """Report event type enumeration."""

    GENERATION_STARTED = "generation_started"
    GENERATION_COMPLETED = "generation_completed"
    GENERATION_FAILED = "generation_failed"
    DELIVERY_STARTED = "delivery_started"
    DELIVERY_COMPLETED = "delivery_completed"
    DELIVERY_FAILED = "delivery_failed"
    SCHEDULE_CREATED = "schedule_created"
    SCHEDULE_UPDATED = "schedule_updated"
    SCHEDULE_DELETED = "schedule_deleted"
    SCHEDULE_EXECUTED = "schedule_executed"


class ReportMetadata(BaseModel):
    """Report metadata."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    type: ReportType
    title: str
    description: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    status: ReportStatus = ReportStatus.PENDING
    period_start: datetime
    period_end: datetime
    project_ids: list[str] = Field(default_factory=list)
    created_by: str = "system"
    tags: list[str] = Field(default_factory=list)


class ReportSection(BaseModel):
    """Report section configuration."""

    id: str
    name: str
    type: ReportSectionType
    enabled: bool = True
    config: dict[str, Any] | None = None
    order: int = 0


class ReportFilters(BaseModel):
    """Report data filters."""

    event_categories: list[EventCategory] | None = None
    event_severities: list[EventSeverity] | None = None
    development_stages: list[str] | None = None
    methodologies: list[str] | None = None
    bottleneck_types: list[str] | None = None
    file_patterns: list[str] | None = None
    users: list[str] | None = None
    custom: dict[str, Any] | None = None


class EmailDeliveryConfig(BaseModel):
    """Email delivery configuration."""

    recipients: list[str]
    cc: list[str] | None = None
    bcc: list[str] | None = None
    reply_to: str | None = None
    subject_template: str | None = None
    body_template: str | None = None
    attachment_formats: list[ReportFormat] | None = None


class SlackDeliveryConfig(BaseModel):
    """Slack delivery configuration."""

    webhook_url: str
    channel: str | None = None
    username: str | None = None
    icon_emoji: str | None = None
    message_template: str | None = None
    upload_files: bool = False


class WebhookDeliveryConfig(BaseModel):
    """Webhook delivery configuration."""

    url: str
    method: Literal["POST", "PUT"] = "POST"
    headers: dict[str, str] | None = None
    auth: dict[str, Any] | None = None
    payload_template: str | None = None


class FileSystemDeliveryConfig(BaseModel):
    """File system delivery configuration."""

    path: str
    filename_template: str | None = None
    overwrite: bool = False
    compress: bool = False


class S3DeliveryConfig(BaseModel):
    """S3 delivery configuration."""

    bucket: str
    key_prefix: str | None = None
    region: str | None = None
    acl: str | None = None
    metadata: dict[str, str] | None = None


class FTPDeliveryConfig(BaseModel):
    """FTP delivery configuration."""

    host: str
    port: int = 21
    username: str
    password: str
    remote_path: str
    secure: bool = False


DeliveryConfigType = (
    EmailDeliveryConfig
    | SlackDeliveryConfig
    | WebhookDeliveryConfig
    | FileSystemDeliveryConfig
    | S3DeliveryConfig
    | FTPDeliveryConfig
)


class DeliveryConfig(BaseModel):
    """Delivery channel configuration."""

    channel: DeliveryChannel
    config: dict[str, Any]
    enabled: bool = True


class ReportStyling(BaseModel):
    """Report styling configuration."""

    theme: Literal["light", "dark", "custom"] | None = None
    logo_url: str | None = None
    colors: dict[str, str] | None = None
    fonts: dict[str, str] | None = None
    custom_css: str | None = None


class ReportConfig(BaseModel):
    """Report generation configuration."""

    type: ReportType
    sections: list[ReportSection]
    formats: list[ReportFormat]
    delivery_channels: list[DeliveryConfig] = Field(default_factory=list)
    filters: ReportFilters | None = None
    parameters: dict[str, Any] | None = None
    template_id: str | None = None
    styling: ReportStyling | None = None


class SchedulePattern(BaseModel):
    """Report schedule pattern."""

    type: Literal["cron", "interval", "daily", "weekly", "monthly"]
    cron: str | None = None
    interval: int | None = None  # milliseconds
    time: str | None = None  # HH:mm format
    day_of_week: int | None = None  # 0-6
    day_of_month: int | None = None  # 1-31


class ReportSchedule(BaseModel):
    """Report schedule configuration."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    enabled: bool = True
    report_config: ReportConfig
    schedule: SchedulePattern
    next_run_at: datetime | None = None
    last_run_at: datetime | None = None
    timezone: str = "UTC"
    created_by: str = "system"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ReportTemplate(BaseModel):
    """Report template."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    description: str | None = None
    type: ReportType
    default_config: ReportConfig
    category: str | None = None
    tags: list[str] = Field(default_factory=list)
    public: bool = False
    created_by: str = "system"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class TableColumn(BaseModel):
    """Table column definition."""

    key: str
    title: str
    type: Literal["string", "number", "date", "boolean"] | None = None
    sortable: bool = False
    width: int | None = None
    align: Literal["left", "center", "right"] = "left"


class TableData(BaseModel):
    """Table data for reports."""

    id: str
    title: str
    columns: list[TableColumn]
    rows: list[dict[str, Any]]


class ChartData(BaseModel):
    """Chart data for reports."""

    id: str
    type: Literal["line", "bar", "pie", "donut", "area", "scatter", "heatmap"]
    title: str
    series: list[dict[str, Any]]
    options: dict[str, Any] | None = None


class ReportData(BaseModel):
    """Report data container."""

    metrics: dict[str, Any] = Field(default_factory=dict)
    events: list[dict[str, Any]] = Field(default_factory=list)
    analysis: dict[str, Any] = Field(default_factory=dict)
    charts: list[ChartData] = Field(default_factory=list)
    tables: list[TableData] = Field(default_factory=list)
    custom: dict[str, Any] = Field(default_factory=dict)


class GeneratedFile(BaseModel):
    """Generated report file information."""

    format: ReportFormat
    path: str
    size: int
    mime_type: str
    checksum: str | None = None


class DeliveryResult(BaseModel):
    """Delivery result."""

    channel: DeliveryChannel
    success: bool
    delivered_at: datetime = Field(default_factory=datetime.utcnow)
    response: Any = None
    error: str | None = None


class ReportResult(BaseModel):
    """Report generation result."""

    metadata: ReportMetadata
    files: list[GeneratedFile] = Field(default_factory=list)
    delivery_results: list[DeliveryResult] | None = None
    generation_time: int  # milliseconds
    error: str | None = None
    warnings: list[str] | None = None


class ReportEvent(BaseModel):
    """Report event."""

    type: ReportEventType
    report_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    details: dict[str, Any] | None = None
