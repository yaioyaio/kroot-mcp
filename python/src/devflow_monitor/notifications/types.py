"""
Notification System Types and Models.

Defines Pydantic models for notifications, rules, and channels.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field
from uuid import uuid4

from ..events.types.base import EventSeverity


class NotificationChannel(str, Enum):
    """Notification channel enumeration."""

    SLACK = "slack"
    EMAIL = "email"
    DASHBOARD = "dashboard"
    SYSTEM = "system"  # System tray
    WEBHOOK = "webhook"


class NotificationPriority(str, Enum):
    """Notification priority levels."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class NotificationStatus(str, Enum):
    """Notification delivery status."""

    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    RETRY = "retry"


class NotificationType(str, Enum):
    """Notification type enumeration."""

    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    SUCCESS = "success"


class RuleConditionType(str, Enum):
    """Rule condition types."""

    EVENT_TYPE = "event_type"
    EVENT_SEVERITY = "event_severity"
    METRIC_THRESHOLD = "metric_threshold"
    BOTTLENECK_DETECTED = "bottleneck_detected"
    STAGE_TRANSITION = "stage_transition"
    AI_USAGE = "ai_usage"
    TIME_BASED = "time_based"


class RuleCondition(BaseModel):
    """Rule condition for notification triggering."""

    type: RuleConditionType
    field: str
    operator: Literal["eq", "ne", "gt", "gte", "lt", "lte", "contains", "matches"]
    value: Any
    combine_with: Literal["AND", "OR"] | None = None


class ThrottleConfig(BaseModel):
    """Throttle configuration for rate limiting."""

    limit: int
    window: int  # Time window in milliseconds


class NotificationRule(BaseModel):
    """Notification rule configuration."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    description: str | None = None
    enabled: bool = True
    conditions: list[RuleCondition]
    channels: list[NotificationChannel]
    priority: NotificationPriority
    template: str | None = None
    throttle: ThrottleConfig | None = None
    metadata: dict[str, Any] | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class NotificationAttachmentField(BaseModel):
    """Field in a notification attachment."""

    title: str
    value: str
    short: bool = False


class NotificationAttachment(BaseModel):
    """Notification attachment (e.g., for Slack)."""

    title: str | None = None
    text: str | None = None
    color: str | None = None
    fields: list[NotificationAttachmentField] | None = None
    image_url: str | None = None
    thumb_url: str | None = None


class NotificationAction(BaseModel):
    """Notification action button/link."""

    type: Literal["button", "link"]
    text: str
    url: str | None = None
    action: str | None = None
    style: Literal["primary", "danger", "default"] | None = None


class NotificationMessage(BaseModel):
    """Notification message."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    rule_id: str | None = None
    title: str
    content: str
    severity: EventSeverity = EventSeverity.INFO
    priority: NotificationPriority = NotificationPriority.MEDIUM
    channels: list[NotificationChannel]
    data: dict[str, Any] | None = None
    attachments: list[NotificationAttachment] | None = None
    actions: list[NotificationAction] | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class NotificationResult(BaseModel):
    """Notification delivery result."""

    message_id: str
    channel: NotificationChannel
    status: NotificationStatus
    sent_at: datetime | None = None
    error: str | None = None
    response: Any = None


class ChannelConfig(BaseModel):
    """Notification channel configuration."""

    channel: NotificationChannel
    enabled: bool = True
    config: dict[str, Any] = Field(default_factory=dict)


class SlackConfig(BaseModel):
    """Slack notification configuration."""

    webhook_url: str
    channel: str | None = None
    username: str | None = None
    icon_emoji: str | None = None
    icon_url: str | None = None


class EmailConfig(BaseModel):
    """Email notification configuration."""

    smtp_host: str
    smtp_port: int
    smtp_secure: bool = False
    smtp_user: str | None = None
    smtp_pass: str | None = None
    from_address: str
    to_addresses: list[str]


class WebhookConfig(BaseModel):
    """Webhook notification configuration."""

    url: str
    method: Literal["POST", "PUT"] = "POST"
    headers: dict[str, str] | None = None
    auth: dict[str, Any] | None = None


class DashboardConfig(BaseModel):
    """Dashboard notification configuration."""

    show_badge: bool = True
    play_sound: bool = False
    auto_dismiss: int | None = None  # Auto dismiss after milliseconds


class NotificationStats(BaseModel):
    """Notification statistics."""

    total: int = 0
    sent: int = 0
    failed: int = 0
    pending: int = 0
    by_channel: dict[str, int] = Field(default_factory=dict)
    by_priority: dict[str, int] = Field(default_factory=dict)
    by_severity: dict[str, int] = Field(default_factory=dict)
    last_hour: int = 0
    last_24_hours: int = 0


class Notification(BaseModel):
    """Complete notification with message and delivery results."""

    message: NotificationMessage
    results: list[NotificationResult] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    delivered_at: datetime | None = None


class NotificationEvent(BaseModel):
    """Notification system event."""

    type: str  # queued, sent, failed, retry
    notification_id: str
    channel: NotificationChannel | None = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    details: dict[str, Any] | None = None
