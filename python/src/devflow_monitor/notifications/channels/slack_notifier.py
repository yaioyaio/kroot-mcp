"""
Slack Notifier.

Sends notifications to Slack via webhooks with Block Kit support.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

import httpx

from ...events.types.base import EventSeverity
from ..types import (
    NotificationAction,
    NotificationAttachment,
    NotificationMessage,
    NotificationPriority,
    SlackConfig,
)


class SlackNotifier:
    """
    Slack notification sender.

    Sends notifications to Slack channels using webhooks
    with support for attachments, actions, and Block Kit.
    """

    def __init__(self, timeout: float = 10.0):
        """
        Initialize the Slack notifier.

        Args:
            timeout: HTTP request timeout in seconds.
        """
        self._timeout = timeout

    async def send(
        self,
        message: NotificationMessage,
        config: SlackConfig,
    ) -> dict[str, Any]:
        """
        Send a notification to Slack.

        Args:
            message: Notification message to send.
            config: Slack configuration with webhook URL.

        Returns:
            Response data from Slack API.

        Raises:
            SlackNotificationError: If the notification fails.
        """
        slack_message = self.format_message(message, config)

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            try:
                response = await client.post(
                    config.webhook_url,
                    json=slack_message,
                    headers={"Content-Type": "application/json"},
                )
                response.raise_for_status()

                # Slack webhook returns "ok" as text on success
                return {"status": "ok", "response": response.text}

            except httpx.HTTPStatusError as e:
                raise SlackNotificationError(
                    f"Slack notification failed with status {e.response.status_code}: "
                    f"{e.response.text}"
                ) from e
            except httpx.RequestError as e:
                raise SlackNotificationError(
                    f"Slack notification request failed: {str(e)}"
                ) from e

    def format_message(
        self,
        message: NotificationMessage,
        config: SlackConfig,
    ) -> dict[str, Any]:
        """
        Format notification message for Slack.

        Args:
            message: Notification message to format.
            config: Slack configuration.

        Returns:
            Formatted Slack message payload.
        """
        color = self._get_color_by_severity(message.severity)
        emoji = self._get_emoji_by_priority(message.priority)

        slack_message: dict[str, Any] = {
            "username": config.username or "DevFlow Monitor",
            "icon_emoji": config.icon_emoji or ":robot_face:",
            "text": f"{emoji} {message.title}",
            "attachments": [],
        }

        # Add channel if specified
        if config.channel:
            slack_message["channel"] = config.channel

        # Add icon URL if specified (overrides icon_emoji)
        if config.icon_url:
            slack_message["icon_url"] = config.icon_url
            del slack_message["icon_emoji"]

        # Main attachment with content
        main_attachment: dict[str, Any] = {
            "color": color,
            "text": message.content,
            "ts": int(message.created_at.timestamp()),
            "footer": "DevFlow Monitor MCP",
            "footer_icon": (
                "https://platform.slack-edge.com/img/default_application_icon.png"
            ),
        }

        # Add metadata fields
        if message.data:
            main_attachment["fields"] = self._format_fields(message.data)

        slack_message["attachments"].append(main_attachment)

        # Add additional attachments
        if message.attachments:
            slack_message["attachments"].extend(
                self._format_attachments(message.attachments)
            )

        # Add action buttons
        if message.actions and len(message.actions) > 0:
            action_attachment: dict[str, Any] = {
                "fallback": "Actions are not supported",
                "callback_id": message.id,
                "color": color,
                "attachment_type": "default",
                "actions": self._format_actions(message.actions),
            }
            slack_message["attachments"].append(action_attachment)

        return slack_message

    def format_message_blocks(
        self,
        message: NotificationMessage,
        config: SlackConfig,
    ) -> dict[str, Any]:
        """
        Format notification message using Slack Block Kit.

        Args:
            message: Notification message to format.
            config: Slack configuration.

        Returns:
            Formatted Slack message with blocks.
        """
        emoji = self._get_emoji_by_priority(message.priority)
        color = self._get_color_by_severity(message.severity)

        blocks: list[dict[str, Any]] = []

        # Header block
        blocks.append({
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": f"{emoji} {message.title}",
                "emoji": True,
            },
        })

        # Content section
        blocks.append({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": message.content,
            },
        })

        # Divider
        blocks.append({"type": "divider"})

        # Metadata fields
        if message.data:
            fields_block: dict[str, Any] = {
                "type": "section",
                "fields": [],
            }
            for key, value in list(message.data.items())[:10]:
                if value is None:
                    continue
                display_value = self._format_value(value)
                fields_block["fields"].append({
                    "type": "mrkdwn",
                    "text": f"*{self._format_field_title(key)}*\n{display_value}",
                })
            if fields_block["fields"]:
                blocks.append(fields_block)

        # Action buttons
        if message.actions:
            action_elements: list[dict[str, Any]] = []
            for i, action in enumerate(message.actions[:5]):  # Max 5 buttons
                button: dict[str, Any] = {
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "text": action.text,
                        "emoji": True,
                    },
                    "action_id": f"action_{i}",
                }
                if action.url:
                    button["url"] = action.url
                if action.action:
                    button["value"] = action.action
                if action.style == "primary":
                    button["style"] = "primary"
                elif action.style == "danger":
                    button["style"] = "danger"
                action_elements.append(button)

            if action_elements:
                blocks.append({
                    "type": "actions",
                    "elements": action_elements,
                })

        # Context (footer)
        blocks.append({
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": (
                        f"DevFlow Monitor MCP | "
                        f"<!date^{int(message.created_at.timestamp())}^{{date_short_pretty}} "
                        f"at {{time}}|{message.created_at.isoformat()}>"
                    ),
                },
            ],
        })

        slack_message: dict[str, Any] = {
            "username": config.username or "DevFlow Monitor",
            "icon_emoji": config.icon_emoji or ":robot_face:",
            "text": f"{emoji} {message.title}",  # Fallback text
            "blocks": blocks,
            "attachments": [{
                "color": color,
                "blocks": [],  # Empty blocks to show color bar
            }],
        }

        if config.channel:
            slack_message["channel"] = config.channel

        if config.icon_url:
            slack_message["icon_url"] = config.icon_url
            del slack_message["icon_emoji"]

        return slack_message

    async def send_blocks(
        self,
        message: NotificationMessage,
        config: SlackConfig,
    ) -> dict[str, Any]:
        """
        Send a notification to Slack using Block Kit format.

        Args:
            message: Notification message to send.
            config: Slack configuration with webhook URL.

        Returns:
            Response data from Slack API.

        Raises:
            SlackNotificationError: If the notification fails.
        """
        slack_message = self.format_message_blocks(message, config)

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            try:
                response = await client.post(
                    config.webhook_url,
                    json=slack_message,
                    headers={"Content-Type": "application/json"},
                )
                response.raise_for_status()
                return {"status": "ok", "response": response.text}

            except httpx.HTTPStatusError as e:
                raise SlackNotificationError(
                    f"Slack notification failed with status {e.response.status_code}: "
                    f"{e.response.text}"
                ) from e
            except httpx.RequestError as e:
                raise SlackNotificationError(
                    f"Slack notification request failed: {str(e)}"
                ) from e

    async def test_connection(self, config: SlackConfig) -> bool:
        """
        Test Slack webhook connection.

        Args:
            config: Slack configuration to test.

        Returns:
            True if connection successful, False otherwise.
        """
        try:
            test_message = NotificationMessage(
                title="DevFlow Monitor Connection Test",
                content="This is a test message to verify Slack integration.",
                severity=EventSeverity.INFO,
                priority=NotificationPriority.LOW,
                channels=[],
            )

            await self.send(test_message, config)
            return True

        except SlackNotificationError:
            return False

    def _get_color_by_severity(self, severity: EventSeverity) -> str:
        """Get Slack attachment color based on severity."""
        color_map = {
            EventSeverity.DEBUG: "#808080",    # Gray
            EventSeverity.INFO: "#36a64f",     # Green
            EventSeverity.WARNING: "#ff9800",  # Orange
            EventSeverity.ERROR: "#f44336",    # Red
            EventSeverity.CRITICAL: "#9c27b0", # Purple
        }
        return color_map.get(severity, "#2196f3")  # Default: Blue

    def _get_emoji_by_priority(self, priority: NotificationPriority) -> str:
        """Get emoji based on notification priority."""
        emoji_map = {
            NotificationPriority.LOW: "\U0001F535",     # Blue circle
            NotificationPriority.MEDIUM: "\U0001F7E1", # Yellow circle
            NotificationPriority.HIGH: "\U0001F7E0",   # Orange circle
            NotificationPriority.URGENT: "\U0001F534", # Red circle
        }
        return emoji_map.get(priority, "\u26AA")  # Default: White circle

    def _format_fields(self, data: dict[str, Any]) -> list[dict[str, Any]]:
        """Format data dictionary as Slack attachment fields."""
        fields: list[dict[str, Any]] = []

        # Show up to 10 fields
        for key, value in list(data.items())[:10]:
            if value is None:
                continue

            display_value = self._format_value(value)
            fields.append({
                "title": self._format_field_title(key),
                "value": display_value,
                "short": len(display_value) < 40,
            })

        return fields

    def _format_value(self, value: Any) -> str:
        """Format a value for display."""
        if isinstance(value, dict) or isinstance(value, list):
            import json
            display_value = json.dumps(value, indent=2, default=str)
            if len(display_value) > 100:
                display_value = display_value[:97] + "..."
        else:
            display_value = str(value)
        return display_value

    def _format_field_title(self, key: str) -> str:
        """Format field key as a readable title."""
        # Convert camelCase to spaces
        title = re.sub(r"([A-Z])", r" \1", key)
        # Convert snake_case to spaces
        title = title.replace("_", " ")
        # Title case
        title = title.strip().title()
        return title

    def _format_attachments(
        self,
        attachments: list[NotificationAttachment],
    ) -> list[dict[str, Any]]:
        """Format notification attachments for Slack."""
        return [
            {
                "title": att.title,
                "text": att.text,
                "color": att.color,
                "fields": (
                    [
                        {
                            "title": f.title,
                            "value": f.value,
                            "short": f.short,
                        }
                        for f in att.fields
                    ]
                    if att.fields
                    else None
                ),
                "image_url": att.image_url,
                "thumb_url": att.thumb_url,
                "fallback": att.text or att.title or "Attachment",
            }
            for att in attachments
        ]

    def _format_actions(
        self,
        actions: list[NotificationAction],
    ) -> list[dict[str, Any]]:
        """Format notification actions as Slack buttons."""
        formatted_actions: list[dict[str, Any]] = []

        for i, action in enumerate(actions):
            slack_action: dict[str, Any] = {
                "name": f"action_{i}",
                "text": action.text,
                "type": "button",
            }

            if action.url:
                slack_action["url"] = action.url

            if action.action:
                slack_action["value"] = action.action

            if action.style:
                slack_action["style"] = action.style

            formatted_actions.append(slack_action)

        return formatted_actions


class SlackNotificationError(Exception):
    """Exception raised when Slack notification fails."""

    pass


# Singleton instance
_slack_notifier: SlackNotifier | None = None


def get_slack_notifier() -> SlackNotifier:
    """Get the singleton Slack notifier instance."""
    global _slack_notifier
    if _slack_notifier is None:
        _slack_notifier = SlackNotifier()
    return _slack_notifier
