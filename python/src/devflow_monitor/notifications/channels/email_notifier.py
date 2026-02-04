"""
Email Notifier.

Sends email notifications using aiosmtplib for async SMTP communication.
"""

from __future__ import annotations

import re
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

import aiosmtplib

from ...events.types.base import EventSeverity
from ..types import (
    EmailConfig,
    NotificationMessage,
    NotificationPriority,
)


class EmailNotifier:
    """
    Email notification sender.

    Sends notifications via SMTP using aiosmtplib for
    asynchronous email delivery.
    """

    def __init__(self, timeout: float = 30.0):
        """
        Initialize the email notifier.

        Args:
            timeout: SMTP connection timeout in seconds.
        """
        self._timeout = timeout

    async def send(
        self,
        message: NotificationMessage,
        config: EmailConfig,
    ) -> dict[str, Any]:
        """
        Send an email notification.

        Args:
            message: Notification message to send.
            config: Email configuration with SMTP settings.

        Returns:
            Response data with message ID.

        Raises:
            EmailNotificationError: If the email fails to send.
        """
        # Build the email message
        email_msg = self._build_email(message, config)

        try:
            # Connect and send
            response = await aiosmtplib.send(
                email_msg,
                hostname=config.smtp_host,
                port=config.smtp_port,
                start_tls=config.smtp_secure,
                username=config.smtp_user,
                password=config.smtp_pass,
                timeout=self._timeout,
            )

            return {
                "status": "sent",
                "recipients": config.to_addresses,
                "response": str(response),
            }

        except aiosmtplib.SMTPException as e:
            raise EmailNotificationError(
                f"Failed to send email: {str(e)}"
            ) from e
        except Exception as e:
            raise EmailNotificationError(
                f"Email notification error: {str(e)}"
            ) from e

    def _build_email(
        self,
        message: NotificationMessage,
        config: EmailConfig,
    ) -> MIMEMultipart:
        """
        Build an email message from notification.

        Args:
            message: Notification message.
            config: Email configuration.

        Returns:
            Constructed email message.
        """
        email_msg = MIMEMultipart("alternative")

        # Set headers
        email_msg["Subject"] = self._format_subject(message)
        email_msg["From"] = config.from_address
        email_msg["To"] = ", ".join(config.to_addresses)
        email_msg["X-Priority"] = self._get_priority_header(message.priority)
        email_msg["X-Mailer"] = "DevFlow Monitor MCP"

        # Build body
        plain_body = self._build_plain_body(message)
        html_body = self._build_html_body(message)

        # Attach both plain text and HTML versions
        email_msg.attach(MIMEText(plain_body, "plain", "utf-8"))
        email_msg.attach(MIMEText(html_body, "html", "utf-8"))

        return email_msg

    def _format_subject(self, message: NotificationMessage) -> str:
        """Format the email subject line."""
        prefix = self._get_subject_prefix(message.priority)
        return f"{prefix} {message.title}"

    def _get_subject_prefix(self, priority: NotificationPriority) -> str:
        """Get subject prefix based on priority."""
        prefix_map = {
            NotificationPriority.LOW: "[Info]",
            NotificationPriority.MEDIUM: "[Notice]",
            NotificationPriority.HIGH: "[Important]",
            NotificationPriority.URGENT: "[URGENT]",
        }
        return prefix_map.get(priority, "[Notice]")

    def _get_priority_header(self, priority: NotificationPriority) -> str:
        """Get X-Priority header value."""
        # X-Priority: 1 (Highest) to 5 (Lowest)
        priority_map = {
            NotificationPriority.URGENT: "1",
            NotificationPriority.HIGH: "2",
            NotificationPriority.MEDIUM: "3",
            NotificationPriority.LOW: "5",
        }
        return priority_map.get(priority, "3")

    def _build_plain_body(self, message: NotificationMessage) -> str:
        """Build plain text email body."""
        lines = [
            message.title,
            "=" * len(message.title),
            "",
            message.content,
            "",
        ]

        # Add metadata fields
        if message.data:
            lines.append("Details:")
            lines.append("-" * 40)
            for key, value in message.data.items():
                if value is not None:
                    title = self._format_field_title(key)
                    lines.append(f"  {title}: {self._format_value(value)}")
            lines.append("")

        # Add footer
        lines.extend([
            "-" * 40,
            f"Sent by DevFlow Monitor MCP",
            f"Notification ID: {message.id}",
            f"Time: {message.created_at.isoformat()}",
        ])

        return "\n".join(lines)

    def _build_html_body(self, message: NotificationMessage) -> str:
        """Build HTML email body."""
        severity_color = self._get_color_by_severity(message.severity)
        priority_badge = self._get_priority_badge_html(message.priority)

        # Build data fields HTML
        fields_html = ""
        if message.data:
            field_items = []
            for key, value in message.data.items():
                if value is not None:
                    title = self._format_field_title(key)
                    field_items.append(
                        f'<tr><td style="padding: 8px; border-bottom: 1px solid #eee; '
                        f'font-weight: bold; color: #555;">{title}</td>'
                        f'<td style="padding: 8px; border-bottom: 1px solid #eee;">'
                        f'{self._format_value(value)}</td></tr>'
                    )
            if field_items:
                fields_html = f"""
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    {''.join(field_items)}
                </table>
                """

        # Build action buttons HTML
        actions_html = ""
        if message.actions:
            buttons = []
            for action in message.actions:
                style = self._get_button_style(action.style)
                if action.url:
                    buttons.append(
                        f'<a href="{action.url}" style="{style}">{action.text}</a>'
                    )
            if buttons:
                actions_html = f"""
                <div style="margin: 20px 0;">
                    {'&nbsp;'.join(buttons)}
                </div>
                """

        html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont,
    'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6;
    background-color: #f5f5f5;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table width="600" cellpadding="0" cellspacing="0"
                    style="background-color: #ffffff; border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 30px; background-color: {severity_color};
                            border-radius: 8px 8px 0 0;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 24px;
                                font-weight: 600;">
                                {message.title}
                            </h1>
                            {priority_badge}
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 30px;">
                            <p style="margin: 0 0 20px 0; color: #333; font-size: 16px;">
                                {message.content}
                            </p>

                            {fields_html}

                            {actions_html}
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 30px; background-color: #f9f9f9;
                            border-radius: 0 0 8px 8px; border-top: 1px solid #eee;">
                            <table width="100%">
                                <tr>
                                    <td style="color: #888; font-size: 12px;">
                                        Sent by DevFlow Monitor MCP
                                    </td>
                                    <td align="right" style="color: #888; font-size: 12px;">
                                        {message.created_at.strftime("%Y-%m-%d %H:%M:%S")}
                                    </td>
                                </tr>
                                <tr>
                                    <td colspan="2" style="color: #aaa; font-size: 11px;
                                        padding-top: 10px;">
                                        Notification ID: {message.id}
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""
        return html

    def _get_color_by_severity(self, severity: EventSeverity) -> str:
        """Get color based on severity level."""
        color_map = {
            EventSeverity.DEBUG: "#6c757d",    # Gray
            EventSeverity.INFO: "#28a745",     # Green
            EventSeverity.WARNING: "#ffc107",  # Yellow/Orange
            EventSeverity.ERROR: "#dc3545",    # Red
            EventSeverity.CRITICAL: "#6f42c1", # Purple
        }
        return color_map.get(severity, "#007bff")  # Default: Blue

    def _get_priority_badge_html(self, priority: NotificationPriority) -> str:
        """Get HTML badge for priority level."""
        badge_styles = {
            NotificationPriority.LOW: ("Low Priority", "#e9ecef", "#495057"),
            NotificationPriority.MEDIUM: ("Medium Priority", "#fff3cd", "#856404"),
            NotificationPriority.HIGH: ("High Priority", "#f8d7da", "#721c24"),
            NotificationPriority.URGENT: ("Urgent", "#f5c6cb", "#721c24"),
        }

        text, bg_color, text_color = badge_styles.get(
            priority,
            ("Normal", "#e9ecef", "#495057"),
        )

        return f"""
        <span style="display: inline-block; padding: 4px 12px; margin-top: 10px;
            font-size: 12px; font-weight: 600; border-radius: 4px;
            background-color: {bg_color}; color: {text_color};">
            {text}
        </span>
        """

    def _get_button_style(self, style: str | None) -> str:
        """Get button CSS style based on action style."""
        base_style = (
            "display: inline-block; padding: 10px 20px; margin-right: 10px; "
            "text-decoration: none; border-radius: 4px; font-weight: 600; "
            "font-size: 14px;"
        )

        if style == "primary":
            return base_style + " background-color: #007bff; color: #ffffff;"
        elif style == "danger":
            return base_style + " background-color: #dc3545; color: #ffffff;"
        else:
            return base_style + " background-color: #6c757d; color: #ffffff;"

    def _format_field_title(self, key: str) -> str:
        """Format field key as a readable title."""
        # Convert camelCase to spaces
        title = re.sub(r"([A-Z])", r" \1", key)
        # Convert snake_case to spaces
        title = title.replace("_", " ")
        # Title case
        title = title.strip().title()
        return title

    def _format_value(self, value: Any) -> str:
        """Format a value for display."""
        if isinstance(value, (dict, list)):
            import json
            display_value = json.dumps(value, indent=2, default=str)
            if len(display_value) > 200:
                display_value = display_value[:197] + "..."
            return display_value
        elif isinstance(value, datetime):
            return value.strftime("%Y-%m-%d %H:%M:%S")
        else:
            return str(value)

    async def send_with_attachments(
        self,
        message: NotificationMessage,
        config: EmailConfig,
        attachments: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """
        Send email with file attachments.

        Args:
            message: Notification message to send.
            config: Email configuration.
            attachments: List of attachment dicts with 'filename', 'content',
                and optional 'content_type'.

        Returns:
            Response data with message ID.

        Raises:
            EmailNotificationError: If the email fails to send.
        """
        from email.mime.base import MIMEBase
        from email import encoders

        email_msg = self._build_email(message, config)

        # Add attachments
        for attachment in attachments:
            part = MIMEBase("application", "octet-stream")
            part.set_payload(attachment["content"])
            encoders.encode_base64(part)
            part.add_header(
                "Content-Disposition",
                f'attachment; filename="{attachment["filename"]}"',
            )
            email_msg.attach(part)

        try:
            response = await aiosmtplib.send(
                email_msg,
                hostname=config.smtp_host,
                port=config.smtp_port,
                start_tls=config.smtp_secure,
                username=config.smtp_user,
                password=config.smtp_pass,
                timeout=self._timeout,
            )

            return {
                "status": "sent",
                "recipients": config.to_addresses,
                "attachments": len(attachments),
                "response": str(response),
            }

        except aiosmtplib.SMTPException as e:
            raise EmailNotificationError(
                f"Failed to send email with attachments: {str(e)}"
            ) from e

    async def test_connection(self, config: EmailConfig) -> bool:
        """
        Test SMTP connection.

        Args:
            config: Email configuration to test.

        Returns:
            True if connection successful, False otherwise.
        """
        try:
            smtp = aiosmtplib.SMTP(
                hostname=config.smtp_host,
                port=config.smtp_port,
                start_tls=config.smtp_secure,
                timeout=self._timeout,
            )

            await smtp.connect()

            if config.smtp_user and config.smtp_pass:
                await smtp.login(config.smtp_user, config.smtp_pass)

            await smtp.quit()
            return True

        except Exception:
            return False

    async def verify_address(self, config: EmailConfig, address: str) -> bool:
        """
        Verify if an email address is valid using SMTP VRFY command.

        Note: Many SMTP servers disable this command for security.

        Args:
            config: Email configuration.
            address: Email address to verify.

        Returns:
            True if verified, False otherwise.
        """
        try:
            smtp = aiosmtplib.SMTP(
                hostname=config.smtp_host,
                port=config.smtp_port,
                start_tls=config.smtp_secure,
                timeout=self._timeout,
            )

            await smtp.connect()

            # Try to verify the address
            code, _ = await smtp.vrfy(address)
            await smtp.quit()

            # 250 or 251 means the address is valid
            return code in (250, 251)

        except Exception:
            return False


class EmailNotificationError(Exception):
    """Exception raised when email notification fails."""

    pass


# Singleton instance
_email_notifier: EmailNotifier | None = None


def get_email_notifier() -> EmailNotifier:
    """Get the singleton email notifier instance."""
    global _email_notifier
    if _email_notifier is None:
        _email_notifier = EmailNotifier()
    return _email_notifier
