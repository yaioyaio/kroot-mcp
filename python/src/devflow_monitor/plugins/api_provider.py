"""
Plugin API Provider.

This module provides API contexts for plugins with permission-based
access control. Each plugin receives an isolated context with only
the APIs it has permission to use.
"""

import asyncio
import os
from datetime import datetime
from typing import Any, Callable, Optional

import aiofiles
import httpx

from .types import (
    PluginAPIContext,
    PluginCommunication,
    PluginDatabase,
    PluginDescriptor,
    PluginFileSystem,
    PluginHTTPClient,
    PluginLogger,
    PluginMCPTools,
    PluginNotifications,
    PluginPermission,
    PluginStorage,
    EventHandler,
)


class PluginLoggerImpl(PluginLogger):
    """Plugin logger implementation."""

    def __init__(self, plugin_id: str):
        """Initialize logger with plugin ID prefix."""
        self.plugin_id = plugin_id
        self._prefix = f"[Plugin:{plugin_id}]"

    def debug(self, message: str, meta: Optional[Any] = None) -> None:
        """Log debug message."""
        print(f"{self._prefix} [DEBUG] {message}", meta or "")

    def info(self, message: str, meta: Optional[Any] = None) -> None:
        """Log info message."""
        print(f"{self._prefix} [INFO] {message}", meta or "")

    def warn(self, message: str, meta: Optional[Any] = None) -> None:
        """Log warning message."""
        print(f"{self._prefix} [WARN] {message}", meta or "")

    def error(
        self, message: str, error: Optional[Exception] = None, meta: Optional[Any] = None
    ) -> None:
        """Log error message."""
        print(f"{self._prefix} [ERROR] {message}", error or "", meta or "")


class PluginFileSystemImpl(PluginFileSystem):
    """Plugin file system implementation with permission checks."""

    def __init__(
        self,
        plugin_id: str,
        can_read: bool,
        can_write: bool,
        base_path: Optional[str] = None,
    ):
        """Initialize file system with permissions."""
        self.plugin_id = plugin_id
        self.can_read = can_read
        self.can_write = can_write
        self.base_path = base_path

    def _validate_path(self, path: str) -> None:
        """Validate path is safe."""
        # Prevent path traversal
        if ".." in path:
            raise ValueError("Path traversal not allowed")

        # If base path is set, ensure path is within it
        if self.base_path:
            abs_path = os.path.abspath(path)
            abs_base = os.path.abspath(self.base_path)
            if not abs_path.startswith(abs_base):
                raise ValueError("Access outside plugin directory not allowed")

    async def read_file(self, path: str) -> str:
        """Read file contents."""
        if not self.can_read:
            raise PermissionError("Plugin does not have file read permission")
        self._validate_path(path)

        async with aiofiles.open(path, "r", encoding="utf-8") as f:
            return await f.read()

    async def write_file(self, path: str, content: str) -> None:
        """Write file contents."""
        if not self.can_write:
            raise PermissionError("Plugin does not have file write permission")
        self._validate_path(path)

        async with aiofiles.open(path, "w", encoding="utf-8") as f:
            await f.write(content)

    async def exists(self, path: str) -> bool:
        """Check if path exists."""
        if not self.can_read:
            return False
        try:
            self._validate_path(path)
            return os.path.exists(path)
        except ValueError:
            return False

    async def mkdir(self, path: str) -> None:
        """Create directory."""
        if not self.can_write:
            raise PermissionError("Plugin does not have file write permission")
        self._validate_path(path)
        os.makedirs(path, exist_ok=True)

    async def read_dir(self, path: str) -> list[str]:
        """Read directory contents."""
        if not self.can_read:
            raise PermissionError("Plugin does not have file read permission")
        self._validate_path(path)
        return os.listdir(path)

    def watch(self, path: str, callback: Callable[[str, str], None]) -> None:
        """Watch path for changes."""
        if not self.can_read:
            raise PermissionError("Plugin does not have file read permission")
        self._validate_path(path)
        # Would integrate with watchdog here
        raise NotImplementedError("File watching not yet implemented")


class PluginHTTPClientImpl(PluginHTTPClient):
    """Plugin HTTP client implementation with permission checks."""

    def __init__(self, plugin_id: str, allowed: bool, timeout: float = 30.0):
        """Initialize HTTP client with permissions."""
        self.plugin_id = plugin_id
        self.allowed = allowed
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if not self._client:
            self._client = httpx.AsyncClient(
                timeout=self.timeout,
                headers={"User-Agent": f"DevFlowMonitor-Plugin/{self.plugin_id}"},
            )
        return self._client

    def _check_permission(self) -> None:
        """Check if network access is allowed."""
        if not self.allowed:
            raise PermissionError("Plugin does not have network access permission")

    async def get(self, url: str, options: Optional[dict[str, Any]] = None) -> Any:
        """Make GET request."""
        self._check_permission()
        client = await self._get_client()
        response = await client.get(url, **(options or {}))
        response.raise_for_status()
        return response.json()

    async def post(
        self, url: str, data: Any, options: Optional[dict[str, Any]] = None
    ) -> Any:
        """Make POST request."""
        self._check_permission()
        client = await self._get_client()
        response = await client.post(url, json=data, **(options or {}))
        response.raise_for_status()
        return response.json()

    async def put(
        self, url: str, data: Any, options: Optional[dict[str, Any]] = None
    ) -> Any:
        """Make PUT request."""
        self._check_permission()
        client = await self._get_client()
        response = await client.put(url, json=data, **(options or {}))
        response.raise_for_status()
        return response.json()

    async def delete(self, url: str, options: Optional[dict[str, Any]] = None) -> Any:
        """Make DELETE request."""
        self._check_permission()
        client = await self._get_client()
        response = await client.delete(url, **(options or {}))
        response.raise_for_status()
        return response.json()

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None


class PluginDatabaseImpl(PluginDatabase):
    """Plugin database implementation with permission checks."""

    def __init__(self, plugin_id: str, can_read: bool, can_write: bool):
        """Initialize database with permissions."""
        self.plugin_id = plugin_id
        self.can_read = can_read
        self.can_write = can_write

    async def query(self, sql: str, params: Optional[list[Any]] = None) -> list[Any]:
        """Execute SQL query."""
        sql_lower = sql.strip().lower()
        is_select = sql_lower.startswith("select")

        if not is_select and not self.can_write:
            raise PermissionError("Plugin does not have database write permission")
        if is_select and not self.can_read:
            raise PermissionError("Plugin does not have database read permission")

        # Would integrate with actual database here
        raise NotImplementedError("Database interface not implemented yet")

    async def insert(self, table: str, data: dict[str, Any]) -> int:
        """Insert record."""
        if not self.can_write:
            raise PermissionError("Plugin does not have database write permission")
        raise NotImplementedError("Database interface not implemented yet")

    async def update(
        self, table: str, data: dict[str, Any], where: dict[str, Any]
    ) -> int:
        """Update records."""
        if not self.can_write:
            raise PermissionError("Plugin does not have database write permission")
        raise NotImplementedError("Database interface not implemented yet")

    async def delete_record(self, table: str, where: dict[str, Any]) -> int:
        """Delete records."""
        if not self.can_write:
            raise PermissionError("Plugin does not have database write permission")
        raise NotImplementedError("Database interface not implemented yet")


class PluginMCPToolsImpl(PluginMCPTools):
    """Plugin MCP tools implementation with permission checks."""

    def __init__(self, plugin_id: str, allowed: bool):
        """Initialize MCP tools with permissions."""
        self.plugin_id = plugin_id
        self.allowed = allowed
        self._registered_tools: dict[str, Callable[..., Any]] = {}

    def _check_permission(self) -> None:
        """Check if MCP tools are allowed."""
        if not self.allowed:
            raise PermissionError("Plugin does not have MCP tools permission")

    def register_tool(
        self, name: str, description: str, handler: Callable[..., Any]
    ) -> None:
        """Register an MCP tool."""
        self._check_permission()
        tool_name = f"plugin_{self.plugin_id}_{name}"
        self._registered_tools[tool_name] = handler

    def unregister_tool(self, name: str) -> None:
        """Unregister an MCP tool."""
        self._check_permission()
        tool_name = f"plugin_{self.plugin_id}_{name}"
        if tool_name in self._registered_tools:
            del self._registered_tools[tool_name]

    async def call_tool(self, name: str, args: Any) -> Any:
        """Call an MCP tool."""
        self._check_permission()
        handler = self._registered_tools.get(name)
        if not handler:
            raise ValueError(f"Tool not found: {name}")

        result = handler(args)
        if asyncio.iscoroutine(result):
            return await result
        return result


class PluginNotificationsImpl(PluginNotifications):
    """Plugin notifications implementation with permission checks."""

    def __init__(self, plugin_id: str, allowed: bool, event_bus: Any):
        """Initialize notifications with permissions."""
        self.plugin_id = plugin_id
        self.allowed = allowed
        self.event_bus = event_bus

    def _check_permission(self) -> None:
        """Check if notifications are allowed."""
        if not self.allowed:
            raise PermissionError("Plugin does not have notification permission")

    async def send(
        self,
        message: str,
        level: str = "info",
        options: Optional[dict[str, Any]] = None,
    ) -> None:
        """Send notification."""
        self._check_permission()
        self.event_bus.emit("plugin.notification", {
            "plugin_id": self.plugin_id,
            "message": message,
            "level": level,
            "options": options,
            "timestamp": datetime.utcnow(),
        })

    async def create_rule(self, rule: Any) -> str:
        """Create notification rule."""
        self._check_permission()
        rule_id = f"plugin_{self.plugin_id}_{datetime.utcnow().timestamp()}"
        return rule_id

    async def remove_rule(self, rule_id: str) -> None:
        """Remove notification rule."""
        self._check_permission()


class PluginCommunicationImpl(PluginCommunication):
    """Plugin inter-plugin communication implementation."""

    def __init__(self, plugin_id: str, event_bus: Any):
        """Initialize communication with event bus."""
        self.plugin_id = plugin_id
        self.event_bus = event_bus

    async def send_message(self, target_plugin: str, message: Any) -> None:
        """Send message to another plugin."""
        self.event_bus.emit(f"plugin.message.{target_plugin}", {
            "from": self.plugin_id,
            "to": target_plugin,
            "message": message,
            "timestamp": datetime.utcnow(),
        })

    def broadcast(self, event: str, data: Any) -> None:
        """Broadcast event to all plugins."""
        self.event_bus.emit(f"plugin.broadcast.{event}", {
            "from": self.plugin_id,
            "event": event,
            "data": data,
            "timestamp": datetime.utcnow(),
        })

    def subscribe(self, event: str, handler: EventHandler) -> None:
        """Subscribe to event."""
        self.event_bus.on(f"plugin.broadcast.{event}", handler)
        self.event_bus.on(f"plugin.message.{self.plugin_id}", handler)

    def unsubscribe(self, event: str, handler: EventHandler) -> None:
        """Unsubscribe from event."""
        # Would need event bus with off() method
        pass


class PluginStorageImpl(PluginStorage):
    """Plugin storage implementation with isolated namespace."""

    def __init__(self, plugin_id: str):
        """Initialize storage with plugin namespace."""
        self.plugin_id = plugin_id
        self._data: dict[str, Any] = {}

    async def get(self, key: str) -> Any:
        """Get value by key."""
        return self._data.get(key)

    async def set(self, key: str, value: Any) -> None:
        """Set value by key."""
        self._data[key] = value

    async def delete(self, key: str) -> None:
        """Delete value by key."""
        if key in self._data:
            del self._data[key]

    async def clear(self) -> None:
        """Clear all storage."""
        self._data.clear()

    async def keys(self) -> list[str]:
        """Get all keys."""
        return list(self._data.keys())


class EventBus:
    """Simple event bus for plugin communication."""

    def __init__(self):
        """Initialize event bus."""
        self._handlers: dict[str, list[Callable[..., Any]]] = {}
        self._max_listeners = 1000

    def on(self, event: str, handler: Callable[..., Any]) -> None:
        """Register event handler."""
        if event not in self._handlers:
            self._handlers[event] = []
        if len(self._handlers[event]) < self._max_listeners:
            self._handlers[event].append(handler)

    def off(self, event: str, handler: Callable[..., Any]) -> None:
        """Remove event handler."""
        if event in self._handlers:
            try:
                self._handlers[event].remove(handler)
            except ValueError:
                pass

    def emit(self, event: str, data: Any) -> None:
        """Emit event to all handlers."""
        handlers = self._handlers.get(event, [])
        for handler in handlers:
            try:
                result = handler(data)
                if asyncio.iscoroutine(result):
                    asyncio.create_task(result)
            except Exception:
                pass

    def remove_all(self, prefix: str) -> None:
        """Remove all handlers with given prefix."""
        to_remove = [k for k in self._handlers.keys() if k.startswith(prefix)]
        for key in to_remove:
            del self._handlers[key]


class PluginAPIProvider:
    """
    Plugin API Provider.

    Creates isolated API contexts for plugins with permission-based
    access control. Each plugin receives only the APIs it has permission to use.

    Example:
        >>> provider = PluginAPIProvider()
        >>> context = await provider.create_context(descriptor)
        >>> # context now has logger, fs, http, etc. based on permissions
    """

    def __init__(self):
        """Initialize the API provider."""
        self._contexts: dict[str, PluginAPIContext] = {}
        self._storages: dict[str, PluginStorageImpl] = {}
        self._http_clients: dict[str, PluginHTTPClientImpl] = {}
        self._event_bus = EventBus()

    async def create_context(self, descriptor: PluginDescriptor) -> PluginAPIContext:
        """
        Create an API context for a plugin.

        Args:
            descriptor: Plugin descriptor.

        Returns:
            PluginAPIContext with all available APIs.
        """
        plugin_id = descriptor.id
        permissions = descriptor.manifest.permissions or []
        perm_set = set(permissions)

        # Create base context
        context = PluginAPIContext(
            metadata=descriptor.manifest,
            config=descriptor.manifest.config_schema or {},
        )

        # Create logger (always available)
        logger = PluginLoggerImpl(plugin_id)

        # Create file system API
        can_read_files = PluginPermission.FILE_READ in perm_set
        can_write_files = PluginPermission.FILE_WRITE in perm_set
        fs = PluginFileSystemImpl(
            plugin_id, can_read_files, can_write_files, descriptor.path
        )

        # Create HTTP client
        can_network = PluginPermission.NETWORK_ACCESS in perm_set
        http = PluginHTTPClientImpl(plugin_id, can_network)
        self._http_clients[plugin_id] = http

        # Create database API
        can_read_db = PluginPermission.DATABASE_READ in perm_set
        can_write_db = PluginPermission.DATABASE_WRITE in perm_set
        database = PluginDatabaseImpl(plugin_id, can_read_db, can_write_db)

        # Create MCP tools API
        can_mcp = PluginPermission.MCP_TOOLS in perm_set
        mcp = PluginMCPToolsImpl(plugin_id, can_mcp)

        # Create notifications API
        can_notify = PluginPermission.NOTIFICATIONS in perm_set
        notifications = PluginNotificationsImpl(plugin_id, can_notify, self._event_bus)

        # Create communication API
        communication = PluginCommunicationImpl(plugin_id, self._event_bus)

        # Create storage API
        storage = PluginStorageImpl(plugin_id)
        self._storages[plugin_id] = storage

        # Attach API implementations to context
        # Using object.__setattr__ to bypass Pydantic validation
        object.__setattr__(context, "logger", logger)
        object.__setattr__(context, "fs", fs)
        object.__setattr__(context, "http", http)
        object.__setattr__(context, "database", database)
        object.__setattr__(context, "mcp", mcp)
        object.__setattr__(context, "notifications", notifications)
        object.__setattr__(context, "communication", communication)
        object.__setattr__(context, "storage", storage)
        object.__setattr__(context, "events", self._event_bus)

        self._contexts[plugin_id] = context
        return context

    async def destroy_context(self, plugin_id: str) -> None:
        """
        Destroy an API context.

        Args:
            plugin_id: Plugin identifier.
        """
        context = self._contexts.get(plugin_id)
        if not context:
            return

        # Clean up event listeners
        self._event_bus.remove_all(f"plugin.{plugin_id}.")

        # Close HTTP client
        http_client = self._http_clients.get(plugin_id)
        if http_client:
            await http_client.close()
            del self._http_clients[plugin_id]

        # Clear storage
        if plugin_id in self._storages:
            del self._storages[plugin_id]

        # Remove context
        del self._contexts[plugin_id]

    def emit_global_event(self, event: str, data: Any) -> None:
        """
        Emit a global event.

        Args:
            event: Event name.
            data: Event data.
        """
        self._event_bus.emit(event, data)

    def on_global_event(self, event: str, handler: Callable[..., Any]) -> None:
        """
        Subscribe to a global event.

        Args:
            event: Event name.
            handler: Event handler.
        """
        self._event_bus.on(event, handler)

    async def dispose(self) -> None:
        """Dispose of the API provider and all contexts."""
        # Close all HTTP clients
        for http_client in list(self._http_clients.values()):
            await http_client.close()
        self._http_clients.clear()

        # Clear all contexts
        self._contexts.clear()

        # Clear all storages
        self._storages.clear()

        # Clear event handlers
        self._event_bus._handlers.clear()
