"""
Notification System.

Provides notification engine, types, and channel implementations
for delivering notifications to various channels (Slack, Email, etc.).
"""

from .channels import (
    EmailNotificationError,
    EmailNotifier,
    SlackNotificationError,
    SlackNotifier,
    get_email_notifier,
    get_slack_notifier,
)
from .notification_engine import (
    NotificationEngine,
    NotificationEngineOptions,
    get_notification_engine,
)
from .types import (
    ChannelConfig,
    DashboardConfig,
    EmailConfig,
    Notification,
    NotificationAction,
    NotificationAttachment,
    NotificationAttachmentField,
    NotificationChannel,
    NotificationEvent,
    NotificationMessage,
    NotificationPriority,
    NotificationResult,
    NotificationRule,
    NotificationStats,
    NotificationStatus,
    NotificationType,
    RuleCondition,
    RuleConditionType,
    SlackConfig,
    ThrottleConfig,
    WebhookConfig,
)

__all__ = [
    # Engine
    "NotificationEngine",
    "NotificationEngineOptions",
    "get_notification_engine",
    # Types
    "NotificationChannel",
    "NotificationPriority",
    "NotificationStatus",
    "NotificationType",
    "RuleConditionType",
    "RuleCondition",
    "ThrottleConfig",
    "NotificationRule",
    "NotificationAttachmentField",
    "NotificationAttachment",
    "NotificationAction",
    "NotificationMessage",
    "NotificationResult",
    "ChannelConfig",
    "SlackConfig",
    "EmailConfig",
    "WebhookConfig",
    "DashboardConfig",
    "NotificationStats",
    "Notification",
    "NotificationEvent",
    # Channels
    "SlackNotifier",
    "SlackNotificationError",
    "get_slack_notifier",
    "EmailNotifier",
    "EmailNotificationError",
    "get_email_notifier",
]
