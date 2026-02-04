"""
Report Delivery System.

Delivers generated reports through multiple channels including
Email, Slack, Webhook, FileSystem, S3, and FTP.
"""

from __future__ import annotations

import asyncio
import base64
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

import aiofiles
import httpx

from .types import (
    DeliveryChannel,
    DeliveryConfig,
    DeliveryResult,
    EmailDeliveryConfig,
    FileSystemDeliveryConfig,
    FTPDeliveryConfig,
    ReportEventType,
    ReportResult,
    S3DeliveryConfig,
    SlackDeliveryConfig,
    WebhookDeliveryConfig,
)


class DeliverySystemConfig:
    """Delivery system configuration."""

    def __init__(
        self,
        smtp: dict[str, Any] | None = None,
        default_from: str = "DevFlow Monitor <noreply@devflow.local>",
        retry_attempts: int = 3,
        retry_delay: int = 5000,  # ms
        timeout: int = 30000,  # ms
        max_attachment_size: int = 25 * 1024 * 1024,  # 25MB
    ):
        """
        Initialize delivery system configuration.

        Args:
            smtp: SMTP server configuration.
            default_from: Default sender address.
            retry_attempts: Number of retry attempts.
            retry_delay: Delay between retries (ms).
            timeout: Request timeout (ms).
            max_attachment_size: Maximum attachment size (bytes).
        """
        self.smtp = smtp
        self.default_from = default_from
        self.retry_attempts = retry_attempts
        self.retry_delay = retry_delay
        self.timeout = timeout
        self.max_attachment_size = max_attachment_size


class ReportDelivery:
    """
    Report delivery system.

    Handles delivery of generated reports through multiple channels
    with retry logic and error handling.
    """

    def __init__(self, config: DeliverySystemConfig | None = None):
        """
        Initialize the report delivery system.

        Args:
            config: Delivery system configuration.
        """
        self._config = config or DeliverySystemConfig()
        self._listeners: dict[str, list[Callable]] = {}
        self._http_client: httpx.AsyncClient | None = None

        self._initialize()

    def _initialize(self) -> None:
        """Initialize the delivery system."""
        self._http_client = httpx.AsyncClient(timeout=self._config.timeout / 1000)

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

    async def deliver(
        self,
        report: ReportResult,
        configs: list[DeliveryConfig],
    ) -> list[DeliveryResult]:
        """
        Deliver a report to multiple channels.

        Args:
            report: Report to deliver.
            configs: List of delivery configurations.

        Returns:
            List of delivery results.
        """
        results: list[DeliveryResult] = []

        for config in configs:
            if not config.enabled:
                continue

            result = await self._deliver_to_channel(report, config)
            results.append(result)

        return results

    async def _deliver_to_channel(
        self,
        report: ReportResult,
        config: DeliveryConfig,
    ) -> DeliveryResult:
        """Deliver to a specific channel."""
        start_time = datetime.utcnow()

        try:
            response: Any = None

            if config.channel == DeliveryChannel.EMAIL:
                email_config = EmailDeliveryConfig(**config.config)
                response = await self._deliver_via_email(report, email_config)

            elif config.channel == DeliveryChannel.SLACK:
                slack_config = SlackDeliveryConfig(**config.config)
                response = await self._deliver_via_slack(report, slack_config)

            elif config.channel == DeliveryChannel.WEBHOOK:
                webhook_config = WebhookDeliveryConfig(**config.config)
                response = await self._deliver_via_webhook(report, webhook_config)

            elif config.channel == DeliveryChannel.FILE_SYSTEM:
                fs_config = FileSystemDeliveryConfig(**config.config)
                response = await self._deliver_via_filesystem(report, fs_config)

            elif config.channel == DeliveryChannel.S3:
                s3_config = S3DeliveryConfig(**config.config)
                response = await self._deliver_via_s3(report, s3_config)

            elif config.channel == DeliveryChannel.FTP:
                ftp_config = FTPDeliveryConfig(**config.config)
                response = await self._deliver_via_ftp(report, ftp_config)

            else:
                raise ValueError(f"Unsupported delivery channel: {config.channel}")

            result = DeliveryResult(
                channel=config.channel,
                success=True,
                delivered_at=datetime.utcnow(),
                response=response,
            )

            self.emit(
                ReportEventType.DELIVERY_COMPLETED.value,
                {
                    "report_id": report.metadata.id,
                    "channel": config.channel.value,
                    "duration": (datetime.utcnow() - start_time).total_seconds() * 1000,
                },
            )

            return result

        except Exception as e:
            result = DeliveryResult(
                channel=config.channel,
                success=False,
                delivered_at=datetime.utcnow(),
                error=str(e),
            )

            self.emit(
                ReportEventType.DELIVERY_FAILED.value,
                {
                    "report_id": report.metadata.id,
                    "channel": config.channel.value,
                    "error": str(e),
                },
            )

            return result

    async def _deliver_via_email(
        self,
        report: ReportResult,
        config: EmailDeliveryConfig,
    ) -> dict[str, Any]:
        """Deliver report via email."""
        try:
            import aiosmtplib
            from email.mime.application import MIMEApplication
            from email.mime.multipart import MIMEMultipart
            from email.mime.text import MIMEText
        except ImportError:
            raise RuntimeError("aiosmtplib is required for email delivery")

        if not self._config.smtp:
            raise RuntimeError("SMTP not configured")

        # Generate subject
        subject = config.subject_template or (
            f"{report.metadata.title} - {report.metadata.created_at.strftime('%Y-%m-%d')}"
        )

        # Generate body
        html_body = config.body_template or self._generate_email_body(report)

        # Create message
        msg = MIMEMultipart()
        msg["From"] = self._config.default_from
        msg["To"] = ", ".join(config.recipients)
        if config.cc:
            msg["Cc"] = ", ".join(config.cc)
        if config.reply_to:
            msg["Reply-To"] = config.reply_to
        msg["Subject"] = subject

        msg.attach(MIMEText(html_body, "html"))

        # Add attachments
        if config.attachment_formats:
            for file in report.files:
                if file.format in config.attachment_formats:
                    if file.size > self._config.max_attachment_size:
                        continue

                    async with aiofiles.open(file.path, "rb") as f:
                        content = await f.read()

                    attachment = MIMEApplication(content)
                    attachment.add_header(
                        "Content-Disposition",
                        "attachment",
                        filename=Path(file.path).name,
                    )
                    msg.attach(attachment)

        # Send email
        smtp = self._config.smtp
        await aiosmtplib.send(
            msg,
            hostname=smtp["host"],
            port=smtp["port"],
            use_tls=smtp.get("secure", False),
            username=smtp.get("auth", {}).get("user"),
            password=smtp.get("auth", {}).get("pass"),
        )

        return {
            "recipients": len(config.recipients),
            "subject": subject,
        }

    async def _deliver_via_slack(
        self,
        report: ReportResult,
        config: SlackDeliveryConfig,
    ) -> dict[str, Any]:
        """Deliver report via Slack webhook."""
        if not self._http_client:
            raise RuntimeError("HTTP client not initialized")

        # Generate message
        message = config.message_template or self._generate_slack_message(report)

        # Build payload
        payload: dict[str, Any] = {
            "text": message,
            "channel": config.channel,
            "username": config.username or "DevFlow Monitor",
            "icon_emoji": config.icon_emoji or ":chart_with_upwards_trend:",
        }

        # Add file info if upload requested
        if config.upload_files and report.files:
            payload["attachments"] = [
                {
                    "color": "good",
                    "title": "Report Files",
                    "text": "\n".join(
                        f"- {Path(f.path).name} ({f.format.value})"
                        for f in report.files
                    ),
                }
            ]

        # Send to webhook
        response = await self._http_client.post(
            config.webhook_url,
            json=payload,
        )
        response.raise_for_status()

        return {"channel": config.channel, "status": response.status_code}

    async def _deliver_via_webhook(
        self,
        report: ReportResult,
        config: WebhookDeliveryConfig,
    ) -> dict[str, Any]:
        """Deliver report via webhook."""
        if not self._http_client:
            raise RuntimeError("HTTP client not initialized")

        # Build payload
        if config.payload_template:
            payload = self._render_template(config.payload_template, report)
        else:
            payload = {
                "report": {
                    "id": report.metadata.id,
                    "title": report.metadata.title,
                    "type": report.metadata.type.value,
                    "created_at": report.metadata.created_at.isoformat(),
                    "files": [
                        {
                            "format": f.format.value,
                            "size": f.size,
                            "path": f.path,
                        }
                        for f in report.files
                    ],
                }
            }

        # Build headers
        headers: dict[str, str] = {
            "Content-Type": "application/json",
            **(config.headers or {}),
        }

        # Add authentication
        if config.auth:
            auth_type = config.auth.get("type")
            credentials = config.auth.get("credentials", {})

            if auth_type == "basic":
                creds = f"{credentials.get('username')}:{credentials.get('password')}"
                headers["Authorization"] = f"Basic {base64.b64encode(creds.encode()).decode()}"
            elif auth_type == "bearer":
                headers["Authorization"] = f"Bearer {credentials.get('token')}"
            elif auth_type == "api_key":
                header_name = credentials.get("header", "X-API-Key")
                headers[header_name] = credentials.get("key", "")

        # Send request
        response = await self._http_client.request(
            method=config.method,
            url=config.url,
            json=payload,
            headers=headers,
        )
        response.raise_for_status()

        return {"url": config.url, "status": response.status_code}

    async def _deliver_via_filesystem(
        self,
        report: ReportResult,
        config: FileSystemDeliveryConfig,
    ) -> list[dict[str, Any]]:
        """Deliver report to filesystem."""
        results: list[dict[str, Any]] = []
        target_path = Path(config.path)
        target_path.mkdir(parents=True, exist_ok=True)

        for file in report.files:
            # Generate filename
            if config.filename_template:
                filename = self._render_filename_template(
                    config.filename_template, report, file
                )
            else:
                filename = Path(file.path).name

            target_file = target_path / filename

            # Check if file exists
            if target_file.exists() and not config.overwrite:
                results.append({
                    "source": file.path,
                    "target": str(target_file),
                    "copied": False,
                    "reason": "File already exists",
                })
                continue

            # Copy file
            shutil.copy2(file.path, target_file)

            # Compress if requested (TODO: implement compression)
            if config.compress:
                pass

            results.append({
                "source": file.path,
                "target": str(target_file),
                "copied": True,
            })

        return results

    async def _deliver_via_s3(
        self,
        report: ReportResult,
        config: S3DeliveryConfig,
    ) -> list[dict[str, Any]]:
        """Deliver report to S3."""
        try:
            import aioboto3
        except ImportError:
            raise RuntimeError("aioboto3 is required for S3 delivery")

        results: list[dict[str, Any]] = []
        session = aioboto3.Session()

        async with session.client("s3", region_name=config.region) as s3:
            for file in report.files:
                key = f"{config.key_prefix or ''}{report.metadata.id}/{Path(file.path).name}"

                async with aiofiles.open(file.path, "rb") as f:
                    content = await f.read()

                await s3.put_object(
                    Bucket=config.bucket,
                    Key=key,
                    Body=content,
                    ACL=config.acl or "private",
                    Metadata=config.metadata or {},
                )

                results.append({
                    "bucket": config.bucket,
                    "key": key,
                    "size": file.size,
                    "uploaded": True,
                })

        return results

    async def _deliver_via_ftp(
        self,
        report: ReportResult,
        config: FTPDeliveryConfig,
    ) -> list[dict[str, Any]]:
        """Deliver report via FTP."""
        try:
            import aioftp
        except ImportError:
            raise RuntimeError("aioftp is required for FTP delivery")

        results: list[dict[str, Any]] = []

        async with aioftp.Client.context(
            config.host,
            config.port,
            config.username,
            config.password,
            ssl=config.secure,
        ) as client:
            for file in report.files:
                remote_path = f"{config.remote_path}/{Path(file.path).name}"

                await client.upload(file.path, remote_path)

                results.append({
                    "local_path": file.path,
                    "remote_path": remote_path,
                    "uploaded": True,
                })

        return results

    def _generate_email_body(self, report: ReportResult) -> str:
        """Generate HTML email body."""
        period_start = report.metadata.period_start.strftime("%Y-%m-%d")
        period_end = report.metadata.period_end.strftime("%Y-%m-%d")

        files_html = "\n".join(
            f"<li>{Path(f.path).name} ({f.format.value.upper()}, {self._format_file_size(f.size)})</li>"
            for f in report.files
        )

        warnings_html = ""
        if report.warnings:
            warnings_html = f"""
            <h3>Warnings:</h3>
            <ul>
                {"".join(f"<li>{w}</li>" for w in report.warnings)}
            </ul>
            """

        return f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }}
        .title {{ font-size: 24px; font-weight: bold; color: #2c3e50; margin: 0; }}
        .subtitle {{ font-size: 14px; color: #7f8c8d; margin-top: 5px; }}
        .content {{ margin: 20px 0; }}
        .metrics {{ display: flex; justify-content: space-around; margin: 20px 0; }}
        .metric {{ text-align: center; padding: 15px; background: #ecf0f1; border-radius: 8px; }}
        .metric-value {{ font-size: 24px; font-weight: bold; color: #3498db; }}
        .metric-label {{ font-size: 12px; color: #7f8c8d; margin-top: 5px; }}
        .footer {{ margin-top: 40px; padding-top: 20px; border-top: 1px solid #ecf0f1;
                  font-size: 12px; color: #7f8c8d; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">{report.metadata.title}</h1>
            <div class="subtitle">Report Period: {period_start} - {period_end}</div>
        </div>

        <div class="content">
            <p>Your scheduled report has been generated successfully.</p>

            {f"<p>{report.metadata.description}</p>" if report.metadata.description else ""}

            <div class="metrics">
                <div class="metric">
                    <div class="metric-value">{len(report.files)}</div>
                    <div class="metric-label">Files Generated</div>
                </div>
                <div class="metric">
                    <div class="metric-value">{report.generation_time / 1000:.1f}s</div>
                    <div class="metric-label">Generation Time</div>
                </div>
            </div>

            <h3>Generated Files:</h3>
            <ul>
                {files_html}
            </ul>

            {warnings_html}
        </div>

        <div class="footer">
            <p>This report was generated by DevFlow Monitor MCP.</p>
            <p>Report ID: {report.metadata.id}</p>
        </div>
    </div>
</body>
</html>
        """

    def _generate_slack_message(self, report: ReportResult) -> str:
        """Generate Slack message text."""
        period_start = report.metadata.period_start.strftime("%Y-%m-%d")
        period_end = report.metadata.period_end.strftime("%Y-%m-%d")

        message = f":bar_chart: *{report.metadata.title}*\n"
        message += f"Period: {period_start} - {period_end}\n\n"

        if report.metadata.description:
            message += f"{report.metadata.description}\n\n"

        message += f":white_check_mark: Report generated successfully\n"
        message += f"- Files: {len(report.files)}\n"
        message += f"- Generation time: {report.generation_time / 1000:.1f}s\n"

        if report.warnings:
            message += "\n:warning: Warnings:\n"
            for w in report.warnings:
                message += f"- {w}\n"

        return message

    def _render_template(self, template: str, report: ReportResult) -> dict[str, Any]:
        """Render a template with report context."""
        import json

        context = {
            "report": {
                "id": report.metadata.id,
                "title": report.metadata.title,
                "description": report.metadata.description,
                "type": report.metadata.type.value,
                "created_at": report.metadata.created_at.isoformat(),
                "period_start": report.metadata.period_start.isoformat(),
                "period_end": report.metadata.period_end.isoformat(),
                "created_by": report.metadata.created_by,
                "tags": report.metadata.tags,
            },
            "date": {
                "now": datetime.utcnow().isoformat(),
                "today": datetime.utcnow().strftime("%Y-%m-%d"),
                "timestamp": int(datetime.utcnow().timestamp() * 1000),
            },
        }

        # Simple template replacement
        result = template
        for key, value in self._flatten_dict(context).items():
            result = result.replace(f"{{{{{key}}}}}", str(value))

        return json.loads(result)

    def _render_filename_template(
        self,
        template: str,
        report: ReportResult,
        file: Any,
    ) -> str:
        """Render a filename template."""
        context = {
            "report.id": report.metadata.id,
            "report.type": report.metadata.type.value,
            "report.title": report.metadata.title,
            "file.format": file.format.value,
            "date.today": datetime.utcnow().strftime("%Y-%m-%d"),
            "date.timestamp": str(int(datetime.utcnow().timestamp())),
        }

        result = template
        for key, value in context.items():
            result = result.replace(f"{{{{{key}}}}}", str(value))

        return result

    def _flatten_dict(
        self,
        d: dict[str, Any],
        parent_key: str = "",
        sep: str = ".",
    ) -> dict[str, Any]:
        """Flatten a nested dictionary."""
        items: list[tuple[str, Any]] = []
        for k, v in d.items():
            new_key = f"{parent_key}{sep}{k}" if parent_key else k
            if isinstance(v, dict):
                items.extend(self._flatten_dict(v, new_key, sep).items())
            else:
                items.append((new_key, v))
        return dict(items)

    def _format_file_size(self, bytes_size: int) -> str:
        """Format file size in human readable format."""
        sizes = ["Bytes", "KB", "MB", "GB"]
        if bytes_size == 0:
            return "0 Bytes"

        import math
        i = int(math.floor(math.log(bytes_size) / math.log(1024)))
        return f"{round(bytes_size / pow(1024, i), 2)} {sizes[i]}"

    async def retry_delivery(
        self,
        report: ReportResult,
        config: DeliveryConfig,
        attempt: int = 1,
    ) -> DeliveryResult:
        """
        Retry a failed delivery.

        Args:
            report: Report to deliver.
            config: Delivery configuration.
            attempt: Current attempt number.

        Returns:
            Delivery result.
        """
        if attempt > self._config.retry_attempts:
            return DeliveryResult(
                channel=config.channel,
                success=False,
                delivered_at=datetime.utcnow(),
                error="Maximum retry attempts exceeded",
            )

        # Wait before retry
        await asyncio.sleep(self._config.retry_delay * attempt / 1000)

        try:
            return await self._deliver_to_channel(report, config)
        except Exception:
            return await self.retry_delivery(report, config, attempt + 1)

    async def close(self) -> None:
        """Close the delivery system."""
        if self._http_client:
            await self._http_client.aclose()


# Singleton instance
_report_delivery: ReportDelivery | None = None


def get_report_delivery() -> ReportDelivery:
    """Get the singleton report delivery instance."""
    global _report_delivery
    if _report_delivery is None:
        _report_delivery = ReportDelivery()
    return _report_delivery
