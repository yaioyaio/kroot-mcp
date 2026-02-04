"""
WebSocket Server Implementation.

Real-time event streaming and client connection management for DevFlow Monitor.
"""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Coroutine
from uuid import uuid4

try:
    import websockets
    from websockets.server import WebSocketServerProtocol, serve
    from websockets.exceptions import ConnectionClosed, ConnectionClosedError
    WEBSOCKETS_AVAILABLE = True
except ImportError:
    WEBSOCKETS_AVAILABLE = False
    WebSocketServerProtocol = Any

from ..events.engine import event_engine, EventEngine
from ..events.types import BaseEvent


class WSMessageType(str, Enum):
    """WebSocket message types."""

    SUBSCRIBE = "subscribe"
    UNSUBSCRIBE = "unsubscribe"
    FILTER = "filter"
    PING = "ping"
    PONG = "pong"
    CONNECTED = "connected"
    EVENT = "event"
    ERROR = "error"
    FILTER_UPDATED = "filter_updated"
    SUBSCRIBED = "subscribed"
    UNSUBSCRIBED = "unsubscribed"
    SYSTEM_NOTIFICATION = "system_notification"


@dataclass
class ClientFilters:
    """Client event filters."""

    categories: list[str] = field(default_factory=list)
    severities: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)


@dataclass
class ClientConnection:
    """Client connection information."""

    id: str
    websocket: WebSocketServerProtocol
    filters: ClientFilters = field(default_factory=ClientFilters)
    last_ping: float = field(default_factory=time.time)
    is_alive: bool = True
    subscribed_event_types: list[str] = field(default_factory=lambda: ["all"])

    def __hash__(self) -> int:
        """Make client hashable by id."""
        return hash(self.id)


@dataclass
class WSMessage:
    """WebSocket message structure."""

    type: WSMessageType | str
    payload: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        result: dict[str, Any] = {
            "type": self.type.value if isinstance(self.type, WSMessageType) else self.type
        }
        if self.payload is not None:
            result["payload"] = self.payload
        return result

    def to_json(self) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict())

    @classmethod
    def from_json(cls, data: str) -> WSMessage:
        """Create from JSON string."""
        parsed = json.loads(data)
        msg_type = parsed.get("type", "")
        try:
            msg_type = WSMessageType(msg_type)
        except ValueError:
            pass
        return cls(type=msg_type, payload=parsed.get("payload"))


@dataclass
class SystemNotification:
    """System notification structure."""

    message: str
    severity: str = "info"  # info, warning, error
    data: dict[str, Any] | None = None


class DevFlowWebSocketServer:
    """
    Real-time event streaming WebSocket server.

    Provides WebSocket connectivity for real-time event streaming
    with client management, event filtering, and heartbeat monitoring.

    Attributes:
        port: Server port number (0 when not running).
        clients: Connected client map.
    """

    def __init__(self):
        """Initialize WebSocket server."""
        self._server: Any | None = None
        self._clients: dict[str, ClientConnection] = {}
        self._heartbeat_task: asyncio.Task | None = None
        self._event_subscription_id: str | None = None
        self._port: int = 0
        self._running: bool = False
        self._start_time: float = 0
        self._event_engine: EventEngine = event_engine
        self._setup_event_listeners()

    def _setup_event_listeners(self) -> None:
        """Set up event engine listeners."""
        # Subscribe to all events for broadcasting
        self._event_subscription_id = self._event_engine.subscribe(
            "*",
            self._handle_event_for_broadcast,
        )

    async def _handle_event_for_broadcast(self, event: BaseEvent) -> None:
        """Handle event from event engine for broadcasting."""
        await self._broadcast_event(event)

    async def start(self, port: int = 8081, host: str = "0.0.0.0") -> None:
        """
        Start the WebSocket server.

        Args:
            port: Port number to listen on.
            host: Host address to bind to.

        Raises:
            RuntimeError: If websockets library is not available.
            OSError: If port is already in use.
        """
        if not WEBSOCKETS_AVAILABLE:
            raise RuntimeError(
                "websockets library is not installed. "
                "Install it with: pip install websockets"
            )

        if self._running:
            return

        self._server = await serve(
            self._handle_connection,
            host,
            port,
            ping_interval=30,
            ping_timeout=10,
        )
        self._port = port
        self._running = True
        self._start_time = time.time()

        # Start heartbeat monitoring
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

    async def stop(self) -> None:
        """Stop the WebSocket server."""
        if not self._running:
            return

        # Cancel heartbeat task
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass
            self._heartbeat_task = None

        # Unsubscribe from event engine
        if self._event_subscription_id:
            self._event_engine.unsubscribe(self._event_subscription_id)
            self._event_subscription_id = None

        # Close all client connections
        close_tasks = []
        for client in list(self._clients.values()):
            if hasattr(client.websocket, 'close'):
                close_tasks.append(client.websocket.close())
        if close_tasks:
            await asyncio.gather(*close_tasks, return_exceptions=True)
        self._clients.clear()

        # Close server
        if self._server:
            self._server.close()
            await self._server.wait_closed()
            self._server = None

        self._port = 0
        self._running = False

    async def _handle_connection(self, websocket: WebSocketServerProtocol) -> None:
        """
        Handle new client connection.

        Args:
            websocket: WebSocket connection protocol.
        """
        client_id = self._generate_client_id()
        client = ClientConnection(
            id=client_id,
            websocket=websocket,
            filters=ClientFilters(),
            last_ping=time.time(),
            is_alive=True,
        )

        self._clients[client_id] = client

        # Send connection confirmation
        await self._send_message(
            client,
            WSMessage(
                type=WSMessageType.CONNECTED,
                payload={
                    "clientId": client_id,
                    "timestamp": self._get_timestamp(),
                    "message": "Connected to DevFlow Monitor WebSocket Server",
                },
            ),
        )

        try:
            async for message in websocket:
                await self._handle_message(client, message)
        except ConnectionClosed:
            pass
        except ConnectionClosedError:
            pass
        except Exception as e:
            await self._handle_error(client, e)
        finally:
            await self._handle_disconnection(client)

    async def _handle_disconnection(self, client: ClientConnection) -> None:
        """Handle client disconnection."""
        if client.id in self._clients:
            del self._clients[client.id]

    async def _handle_error(self, client: ClientConnection, error: Exception) -> None:
        """Handle client error."""
        print(f"[WebSocket] Client error ({client.id}): {error}")

    async def _handle_message(
        self, client: ClientConnection, raw_data: str | bytes
    ) -> None:
        """
        Handle incoming client message.

        Args:
            client: Client connection.
            raw_data: Raw message data.
        """
        try:
            if isinstance(raw_data, bytes):
                raw_data = raw_data.decode("utf-8")

            message = WSMessage.from_json(raw_data)

            if message.type == WSMessageType.FILTER:
                await self._handle_filter_update(client, message.payload or {})
            elif message.type == WSMessageType.PING:
                await self._handle_ping(client)
            elif message.type == WSMessageType.SUBSCRIBE:
                await self._handle_subscribe(client, message.payload or {})
            elif message.type == WSMessageType.UNSUBSCRIBE:
                await self._handle_unsubscribe(client, message.payload or {})
            else:
                print(f"[WebSocket] Unknown message type: {message.type}")

        except json.JSONDecodeError:
            await self._send_message(
                client,
                WSMessage(
                    type=WSMessageType.ERROR,
                    payload={"message": "Invalid message format"},
                ),
            )
        except Exception as e:
            print(f"[WebSocket] Failed to parse message from {client.id}: {e}")
            await self._send_message(
                client,
                WSMessage(
                    type=WSMessageType.ERROR,
                    payload={"message": "Invalid message format"},
                ),
            )

    async def _handle_filter_update(
        self, client: ClientConnection, filters: dict[str, Any]
    ) -> None:
        """Handle filter update from client."""
        client.filters = ClientFilters(
            categories=filters.get("categories", []),
            severities=filters.get("severities", []),
            sources=filters.get("sources", []),
        )

        await self._send_message(
            client,
            WSMessage(
                type=WSMessageType.FILTER_UPDATED,
                payload={
                    "filters": {
                        "categories": client.filters.categories,
                        "severities": client.filters.severities,
                        "sources": client.filters.sources,
                    },
                    "timestamp": self._get_timestamp(),
                },
            ),
        )

    async def _handle_subscribe(
        self, client: ClientConnection, payload: dict[str, Any]
    ) -> None:
        """Handle subscription request."""
        event_types = payload.get("eventTypes", ["all"])
        client.subscribed_event_types = event_types

        await self._send_message(
            client,
            WSMessage(
                type=WSMessageType.SUBSCRIBED,
                payload={
                    "eventTypes": event_types,
                    "timestamp": self._get_timestamp(),
                },
            ),
        )

    async def _handle_unsubscribe(
        self, client: ClientConnection, payload: dict[str, Any]
    ) -> None:
        """Handle unsubscription request."""
        client.subscribed_event_types = []

        await self._send_message(
            client,
            WSMessage(
                type=WSMessageType.UNSUBSCRIBED,
                payload={"timestamp": self._get_timestamp()},
            ),
        )

    async def _handle_ping(self, client: ClientConnection) -> None:
        """Handle ping from client."""
        client.last_ping = time.time()
        client.is_alive = True
        await self._send_message(client, WSMessage(type=WSMessageType.PONG))

    async def _broadcast_event(self, event: BaseEvent) -> None:
        """
        Broadcast event to all connected clients.

        Args:
            event: Event to broadcast.
        """
        if not self._clients:
            return

        event_message = WSMessage(
            type=WSMessageType.EVENT,
            payload={
                "event": event.model_dump(mode="json"),
                "timestamp": self._get_timestamp(),
            },
        )

        tasks = []
        for client in list(self._clients.values()):
            if self._should_send_event_to_client(client, event):
                tasks.append(self._send_message(client, event_message))

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    def _should_send_event_to_client(
        self, client: ClientConnection, event: BaseEvent
    ) -> bool:
        """
        Check if event should be sent to client based on filters.

        Args:
            client: Client connection.
            event: Event to check.

        Returns:
            True if event should be sent, False otherwise.
        """
        filters = client.filters

        # Category filter
        if filters.categories:
            event_category = (
                event.category.value
                if hasattr(event.category, "value")
                else str(event.category)
            )
            if event_category not in filters.categories:
                return False

        # Severity filter
        if filters.severities:
            event_severity = (
                event.severity.value
                if hasattr(event.severity, "value")
                else str(event.severity)
            )
            if event_severity not in filters.severities:
                return False

        # Source filter
        if filters.sources:
            if event.source not in filters.sources:
                return False

        return True

    async def _send_message(
        self, client: ClientConnection, message: WSMessage
    ) -> None:
        """
        Send message to client.

        Args:
            client: Client connection.
            message: Message to send.
        """
        try:
            if hasattr(client.websocket, 'send'):
                await client.websocket.send(message.to_json())
        except Exception as e:
            print(f"[WebSocket] Failed to send message to {client.id}: {e}")

    async def _broadcast(self, message: WSMessage) -> None:
        """
        Broadcast message to all clients.

        Args:
            message: Message to broadcast.
        """
        tasks = []
        for client in list(self._clients.values()):
            tasks.append(self._send_message(client, message))

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _heartbeat_loop(self) -> None:
        """Heartbeat loop to check client connections."""
        while self._running:
            await asyncio.sleep(30)  # Check every 30 seconds

            for client_id, client in list(self._clients.items()):
                if not client.is_alive:
                    # Client didn't respond to previous ping
                    try:
                        await client.websocket.close()
                    except Exception:
                        pass
                    if client_id in self._clients:
                        del self._clients[client_id]
                else:
                    # Mark as not alive until pong received
                    client.is_alive = False
                    try:
                        if hasattr(client.websocket, 'ping'):
                            await client.websocket.ping()
                    except Exception:
                        pass

    def _generate_client_id(self) -> str:
        """Generate unique client ID."""
        return f"client_{int(time.time() * 1000)}_{uuid4().hex[:9]}"

    def _get_timestamp(self) -> str:
        """Get ISO timestamp string."""
        from datetime import datetime, timezone

        return datetime.now(timezone.utc).isoformat()

    def is_running(self) -> bool:
        """Check if server is running."""
        return self._running

    def get_port(self) -> int:
        """Get server port."""
        return self._port

    def get_stats(self) -> dict[str, Any]:
        """
        Get server statistics.

        Returns:
            Dictionary with server statistics.
        """
        uptime = time.time() - self._start_time if self._running else 0
        return {
            "connectedClients": len(self._clients),
            "clients": [
                {
                    "id": client.id,
                    "filters": {
                        "categories": client.filters.categories,
                        "severities": client.filters.severities,
                        "sources": client.filters.sources,
                    },
                    "lastPing": client.last_ping,
                    "isAlive": client.is_alive,
                }
                for client in self._clients.values()
            ],
            "uptime": uptime,
        }

    def send_custom_message(self, client_id: str, message: dict[str, Any]) -> bool:
        """
        Send custom message to specific client.

        Args:
            client_id: Target client ID.
            message: Message payload.

        Returns:
            True if client found and message queued, False otherwise.
        """
        client = self._clients.get(client_id)
        if client:
            asyncio.create_task(
                self._send_message(
                    client,
                    WSMessage(type="custom", payload=message),
                )
            )
            return True
        return False

    async def broadcast_system_notification(
        self, notification: SystemNotification
    ) -> None:
        """
        Broadcast system notification to all clients.

        Args:
            notification: System notification to broadcast.
        """
        await self._broadcast(
            WSMessage(
                type=WSMessageType.SYSTEM_NOTIFICATION,
                payload={
                    "message": notification.message,
                    "severity": notification.severity,
                    "data": notification.data,
                    "timestamp": self._get_timestamp(),
                },
            )
        )


# Global WebSocket server instance
ws_server = DevFlowWebSocketServer()


def get_ws_server() -> DevFlowWebSocketServer:
    """
    Get the global WebSocket server instance.

    Returns:
        DevFlowWebSocketServer singleton instance.
    """
    return ws_server
