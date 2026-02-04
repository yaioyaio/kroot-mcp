"""
Notification Channels.

Provides implementations for different notification delivery channels.
"""

from .email_notifier import (
    EmailNotificationError,
    EmailNotifier,
    get_email_notifier,
)
from .slack_notifier import (
    SlackNotificationError,
    SlackNotifier,
    get_slack_notifier,
)

__all__ = [
    # Slack
    "SlackNotifier",
    "SlackNotificationError",
    "get_slack_notifier",
    # Email
    "EmailNotifier",
    "EmailNotificationError",
    "get_email_notifier",
]
