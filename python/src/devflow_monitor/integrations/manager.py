"""
API Integration Manager Module.

Provides centralized management for all API integrations
including lifecycle management, health checks, and synchronization.
"""

from __future__ import annotations

import asyncio
from typing import Any

from pydantic import BaseModel, Field

from ..events.engine import EventEngine, get_event_engine
from ..events.types import BaseEvent, EventCategory, EventSeverity
from .base import BaseAPIClient
from .figma import FigmaClient, FigmaConfig
from .jira import JiraClient, JiraConfig
from .notion import NotionClient, NotionConfig


class IntegrationConfig(BaseModel):
    """Configuration for all integrations."""

    jira: JiraConfig | None = None
    notion: NotionConfig | None = None
    figma: FigmaConfig | None = None


class IntegrationStatus(BaseModel):
    """Status of an integration."""

    name: str
    enabled: bool
    healthy: bool
    connected: bool
    last_check: float
    stats: dict[str, Any] | None = None


class APIIntegrationManager:
    """
    API Integration Manager.

    Centralized management for all API integrations including
    lifecycle management, health checks, and synchronization.

    Attributes:
        config: Integration configuration.
        event_engine: Event engine for event emission.
    """

    def __init__(
        self,
        config: IntegrationConfig,
        event_engine: EventEngine | None = None,
    ):
        """
        Initialize API Integration Manager.

        Args:
            config: Integration configuration.
            event_engine: Optional event engine.
        """
        self.config = config
        self.event_engine = event_engine or get_event_engine()
        self._clients: dict[str, BaseAPIClient] = {}
        self._health_check_task: asyncio.Task[None] | None = None
        self._health_check_interval: float = 300.0  # 5 minutes

        self._initialize_clients()

    def _initialize_clients(self) -> None:
        """Initialize all configured clients."""
        if self.config.jira:
            try:
                jira_client = JiraClient(self.config.jira, self.event_engine)
                self._clients["jira"] = jira_client

                asyncio.create_task(self._emit_event(
                    event_type="integration:client_initialized",
                    severity=EventSeverity.INFO,
                    data={
                        "client_name": "jira",
                        "domain": self.config.jira.domain,
                    },
                ))
            except Exception as e:
                asyncio.create_task(self._emit_event(
                    event_type="integration:client_initialization_failed",
                    severity=EventSeverity.ERROR,
                    data={
                        "client_name": "jira",
                        "error": str(e),
                    },
                ))

        if self.config.notion:
            try:
                notion_client = NotionClient(self.config.notion, self.event_engine)
                self._clients["notion"] = notion_client

                asyncio.create_task(self._emit_event(
                    event_type="integration:client_initialized",
                    severity=EventSeverity.INFO,
                    data={"client_name": "notion"},
                ))
            except Exception as e:
                asyncio.create_task(self._emit_event(
                    event_type="integration:client_initialization_failed",
                    severity=EventSeverity.ERROR,
                    data={
                        "client_name": "notion",
                        "error": str(e),
                    },
                ))

        if self.config.figma:
            try:
                figma_client = FigmaClient(self.config.figma, self.event_engine)
                self._clients["figma"] = figma_client

                asyncio.create_task(self._emit_event(
                    event_type="integration:client_initialized",
                    severity=EventSeverity.INFO,
                    data={"client_name": "figma"},
                ))
            except Exception as e:
                asyncio.create_task(self._emit_event(
                    event_type="integration:client_initialization_failed",
                    severity=EventSeverity.ERROR,
                    data={
                        "client_name": "figma",
                        "error": str(e),
                    },
                ))

        asyncio.create_task(self._emit_event(
            event_type="integration:manager_initialized",
            severity=EventSeverity.INFO,
            data={
                "total_clients": len(self._clients),
                "enabled_clients": list(self._clients.keys()),
            },
        ))

    async def start(self) -> None:
        """Start the integration manager."""
        await self.connect_all()
        await self._validate_all_connections()
        self._start_health_checks()

        await self._emit_event(
            event_type="integration:manager_started",
            severity=EventSeverity.INFO,
            data={
                "client_count": len(self._clients),
                "health_check_interval": self._health_check_interval,
            },
        )

    async def stop(self) -> None:
        """Stop the integration manager."""
        self._stop_health_checks()
        await self.disconnect_all()

        await self._emit_event(
            event_type="integration:manager_stopped",
            severity=EventSeverity.INFO,
            data={"client_count": len(self._clients)},
        )

    def _start_health_checks(self) -> None:
        """Start periodic health checks."""
        if self._health_check_task is not None:
            self._health_check_task.cancel()

        self._health_check_task = asyncio.create_task(self._health_check_loop())

    def _stop_health_checks(self) -> None:
        """Stop periodic health checks."""
        if self._health_check_task is not None:
            self._health_check_task.cancel()
            self._health_check_task = None

    async def _health_check_loop(self) -> None:
        """Health check loop."""
        while True:
            try:
                await asyncio.sleep(self._health_check_interval)
                await self._perform_health_checks()
            except asyncio.CancelledError:
                break
            except Exception as e:
                await self._emit_event(
                    event_type="integration:health_check_loop_error",
                    severity=EventSeverity.ERROR,
                    data={"error": str(e)},
                )

    async def _perform_health_checks(self) -> None:
        """Perform health checks on all clients."""
        results: dict[str, bool] = {}

        for name, client in self._clients.items():
            try:
                is_healthy = await client.is_healthy()
                results[name] = is_healthy

                if not is_healthy:
                    await self._emit_event(
                        event_type="integration:health_check_failed",
                        severity=EventSeverity.WARNING,
                        data={"client_name": name},
                    )
            except Exception as e:
                results[name] = False
                await self._emit_event(
                    event_type="integration:health_check_error",
                    severity=EventSeverity.ERROR,
                    data={
                        "client_name": name,
                        "error": str(e),
                    },
                )

        await self._emit_event(
            event_type="integration:health_check_completed",
            severity=EventSeverity.DEBUG,
            data={
                "results": results,
                "healthy_count": sum(1 for v in results.values() if v),
                "total_count": len(results),
            },
        )

    async def _validate_all_connections(self) -> None:
        """Validate all client connections."""
        results: dict[str, bool] = {}

        for name, client in self._clients.items():
            try:
                is_valid = await client.validate_connection()
                results[name] = is_valid

                if is_valid:
                    await self._emit_event(
                        event_type="integration:connection_validated",
                        severity=EventSeverity.INFO,
                        data={"client_name": name},
                    )
                else:
                    await self._emit_event(
                        event_type="integration:connection_validation_failed",
                        severity=EventSeverity.ERROR,
                        data={"client_name": name},
                    )
            except Exception as e:
                results[name] = False
                await self._emit_event(
                    event_type="integration:connection_validation_error",
                    severity=EventSeverity.ERROR,
                    data={
                        "client_name": name,
                        "error": str(e),
                    },
                )

        await self._emit_event(
            event_type="integration:connections_validated",
            severity=EventSeverity.INFO,
            data={
                "results": results,
                "valid_count": sum(1 for v in results.values() if v),
                "total_count": len(results),
            },
        )

    def register_client(self, name: str, client: BaseAPIClient) -> None:
        """
        Register a new client.

        Args:
            name: Client name.
            client: Client instance.
        """
        self._clients[name] = client

    def get_client(self, name: str) -> BaseAPIClient | None:
        """
        Get a client by name.

        Args:
            name: Client name.

        Returns:
            Client instance or None.
        """
        return self._clients.get(name)

    def get_jira_client(self) -> JiraClient | None:
        """Get Jira client."""
        client = self._clients.get("jira")
        return client if isinstance(client, JiraClient) else None

    def get_notion_client(self) -> NotionClient | None:
        """Get Notion client."""
        client = self._clients.get("notion")
        return client if isinstance(client, NotionClient) else None

    def get_figma_client(self) -> FigmaClient | None:
        """Get Figma client."""
        client = self._clients.get("figma")
        return client if isinstance(client, FigmaClient) else None

    async def connect_all(self) -> None:
        """Connect all clients."""
        for name, client in self._clients.items():
            try:
                await client.connect()
            except Exception as e:
                await self._emit_event(
                    event_type="integration:connect_failed",
                    severity=EventSeverity.ERROR,
                    data={
                        "client_name": name,
                        "error": str(e),
                    },
                )

    async def disconnect_all(self) -> None:
        """Disconnect all clients."""
        for name, client in self._clients.items():
            try:
                await client.disconnect()
            except Exception as e:
                await self._emit_event(
                    event_type="integration:disconnect_failed",
                    severity=EventSeverity.ERROR,
                    data={
                        "client_name": name,
                        "error": str(e),
                    },
                )

    async def health_check_all(self) -> dict[str, bool]:
        """
        Check health of all clients.

        Returns:
            Dictionary mapping client names to health status.
        """
        results: dict[str, bool] = {}

        for name, client in self._clients.items():
            try:
                results[name] = await client.is_healthy()
            except Exception:
                results[name] = False

        return results

    async def get_status(self) -> list[IntegrationStatus]:
        """
        Get status of all integrations.

        Returns:
            List of integration statuses.
        """
        import time

        statuses: list[IntegrationStatus] = []

        for name, client in self._clients.items():
            try:
                healthy = await client.is_healthy()
                connected = await client.validate_connection()

                statuses.append(IntegrationStatus(
                    name=name,
                    enabled=True,
                    healthy=healthy,
                    connected=connected,
                    last_check=time.time(),
                    stats=client.get_stats(),
                ))
            except Exception:
                statuses.append(IntegrationStatus(
                    name=name,
                    enabled=True,
                    healthy=False,
                    connected=False,
                    last_check=time.time(),
                    stats=None,
                ))

        await self._emit_event(
            event_type="integration:status_retrieved",
            severity=EventSeverity.DEBUG,
            data={
                "status_count": len(statuses),
                "healthy_count": sum(1 for s in statuses if s.healthy),
                "connected_count": sum(1 for s in statuses if s.connected),
            },
        )

        return statuses

    async def sync_all(self) -> None:
        """Synchronize all integrations."""
        await self._emit_event(
            event_type="integration:sync_started",
            severity=EventSeverity.INFO,
            data={"client_count": len(self._clients)},
        )

        tasks = []

        if "jira" in self._clients:
            tasks.append(self._sync_jira())

        if "notion" in self._clients:
            tasks.append(self._sync_notion())

        if "figma" in self._clients:
            tasks.append(self._sync_figma())

        try:
            await asyncio.gather(*tasks, return_exceptions=True)

            await self._emit_event(
                event_type="integration:sync_completed",
                severity=EventSeverity.INFO,
                data={"client_count": len(self._clients)},
            )
        except Exception as e:
            await self._emit_event(
                event_type="integration:sync_failed",
                severity=EventSeverity.ERROR,
                data={"error": str(e)},
            )

    async def _sync_jira(self) -> None:
        """Sync Jira data."""
        jira_client = self.get_jira_client()
        if not jira_client:
            return

        try:
            await jira_client.get_recent_activity()
        except Exception as e:
            await self._emit_event(
                event_type="integration:jira_sync_failed",
                severity=EventSeverity.ERROR,
                data={"error": str(e)},
            )

    async def _sync_notion(self) -> None:
        """Sync Notion data."""
        notion_client = self.get_notion_client()
        if not notion_client:
            return

        try:
            await notion_client.get_recently_edited()
        except Exception as e:
            await self._emit_event(
                event_type="integration:notion_sync_failed",
                severity=EventSeverity.ERROR,
                data={"error": str(e)},
            )

    async def _sync_figma(self) -> None:
        """Sync Figma data."""
        figma_client = self.get_figma_client()
        if not figma_client:
            return

        try:
            await figma_client.get_recent_activity()
        except Exception as e:
            await self._emit_event(
                event_type="integration:figma_sync_failed",
                severity=EventSeverity.ERROR,
                data={"error": str(e)},
            )

    async def _emit_event(
        self,
        event_type: str,
        severity: EventSeverity,
        data: dict[str, Any],
    ) -> None:
        """
        Emit an event through the event engine.

        Args:
            event_type: Event type string.
            severity: Event severity.
            data: Event data.
        """
        if self.event_engine is not None:
            event = BaseEvent(
                type=event_type,
                category=EventCategory.API,
                severity=severity,
                source="APIIntegrationManager",
                data=data,
            )
            await self.event_engine.publish(event)

    def set_health_check_interval(self, interval_seconds: float) -> None:
        """
        Set health check interval.

        Args:
            interval_seconds: Interval in seconds.
        """
        self._health_check_interval = interval_seconds

        if self._health_check_task is not None:
            self._stop_health_checks()
            self._start_health_checks()

    def get_configuration(self) -> IntegrationConfig:
        """
        Get configuration with sensitive data masked.

        Returns:
            Masked configuration.
        """
        result = IntegrationConfig()

        if self.config.jira:
            result.jira = JiraConfig(
                base_url=self.config.jira.base_url,
                domain=self.config.jira.domain,
                project=self.config.jira.project,
                email=self.config.jira.email,
                api_token="[HIDDEN]" if self.config.jira.api_token else None,
            )

        if self.config.notion:
            result.notion = NotionConfig(
                base_url=self.config.notion.base_url,
                api_token="[HIDDEN]",
                version=self.config.notion.version,
                database_id=self.config.notion.database_id,
            )

        if self.config.figma:
            result.figma = FigmaConfig(
                base_url=self.config.figma.base_url,
                access_token="[HIDDEN]",
                file_key=self.config.figma.file_key,
            )

        return result
