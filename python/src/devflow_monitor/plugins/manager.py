"""
Plugin Manager.

Central manager for the plugin system. Coordinates plugin loading,
lifecycle management, health monitoring, and metrics collection.
"""

import asyncio
from datetime import datetime
from typing import Any, Callable, Optional

from .loader import PluginLoader
from .registry import PluginRegistry
from .sandbox import PluginSandbox, SandboxConfig
from .api_provider import PluginAPIProvider
from .types import (
    PluginDescriptor,
    PluginHealthStatus,
    PluginLoaderConfig,
    PluginMetrics,
    PluginState,
)


class PluginManagerConfig:
    """Plugin manager configuration."""

    def __init__(
        self,
        plugin_dirs: list[str],
        auto_load: bool = True,
        hot_reload: bool = True,
        max_plugins: int = 100,
        sandbox_enabled: bool = True,
        health_check_interval: int = 60000,
        metrics_interval: int = 30000,
        registry_url: Optional[str] = None,
    ):
        """
        Initialize plugin manager configuration.

        Args:
            plugin_dirs: List of plugin directory paths.
            auto_load: Whether to auto-load plugins on startup.
            hot_reload: Whether to enable hot reload.
            max_plugins: Maximum number of plugins.
            sandbox_enabled: Whether to enable sandboxing.
            health_check_interval: Health check interval in ms.
            metrics_interval: Metrics collection interval in ms.
            registry_url: Optional plugin registry URL.
        """
        self.plugin_dirs = plugin_dirs
        self.auto_load = auto_load
        self.hot_reload = hot_reload
        self.max_plugins = max_plugins
        self.sandbox_enabled = sandbox_enabled
        self.health_check_interval = health_check_interval
        self.metrics_interval = metrics_interval
        self.registry_url = registry_url


class PluginManager:
    """
    Plugin Manager for central plugin system management.

    Provides functionality for:
    - Plugin installation, loading, and unloading
    - Lifecycle management (activate, deactivate, restart)
    - Health monitoring and metrics collection
    - Plugin discovery and search
    - Integration with remote registry

    Args:
        config: Plugin manager configuration.

    Example:
        >>> config = PluginManagerConfig(plugin_dirs=["/path/to/plugins"])
        >>> manager = PluginManager(config)
        >>> await manager.initialize()
        >>> await manager.activate_plugin("my-plugin")
    """

    def __init__(self, config: PluginManagerConfig):
        """Initialize the plugin manager."""
        self.config = config
        self._initialized = False
        self._event_handlers: dict[str, list[Callable[..., Any]]] = {}

        # Create loader configuration
        loader_config = PluginLoaderConfig(
            plugin_dirs=config.plugin_dirs,
            auto_load=config.auto_load,
            hot_reload=config.hot_reload,
            max_plugins=config.max_plugins,
            sandbox_enabled=config.sandbox_enabled,
        )

        # Create sandbox configuration
        sandbox_config = SandboxConfig(
            enabled=config.sandbox_enabled,
            memory_limit=512 * 1024 * 1024,  # 512MB
            cpu_limit=80,
            network_allowed=True,
            filesystem_access="readwrite",
        )

        # Create components
        self._api_provider = PluginAPIProvider()
        self._sandbox = PluginSandbox(sandbox_config) if config.sandbox_enabled else None
        self._loader = PluginLoader(
            loader_config,
            api_provider=self._api_provider,
            sandbox=self._sandbox,
        )

        # Create registry if URL provided
        self._registry: Optional[PluginRegistry] = None
        if config.registry_url:
            self._registry = PluginRegistry(config.registry_url)

        # Background tasks
        self._health_check_task: Optional[asyncio.Task] = None
        self._metrics_task: Optional[asyncio.Task] = None

        # Set up event forwarding
        self._setup_event_handlers()

    def on(self, event: str, handler: Callable[..., Any]) -> None:
        """
        Register an event handler.

        Args:
            event: Event name.
            handler: Event handler function.
        """
        if event not in self._event_handlers:
            self._event_handlers[event] = []
        self._event_handlers[event].append(handler)

    def emit(self, event: str, data: Any) -> None:
        """
        Emit an event to all registered handlers.

        Args:
            event: Event name.
            data: Event data.
        """
        handlers = self._event_handlers.get(event, [])
        for handler in handlers:
            try:
                handler(data)
            except Exception:
                pass

    def _setup_event_handlers(self) -> None:
        """Set up event forwarding from loader."""
        # Forward loader events
        self._loader.on("plugin.loaded", lambda data: self.emit("plugin.loaded", data))
        self._loader.on("plugin.activated", lambda data: self.emit("plugin.activated", data))
        self._loader.on("plugin.deactivated", lambda data: self.emit("plugin.deactivated", data))
        self._loader.on("plugin.unloaded", lambda data: self.emit("plugin.unloaded", data))
        self._loader.on("plugin.error", lambda data: self.emit("plugin.error", data))
        self._loader.on("plugins.discovered", lambda data: self.emit("plugins.discovered", data))

    async def initialize(self) -> None:
        """
        Initialize the plugin manager.

        Initializes loader, registry, and starts background tasks.
        """
        if self._initialized:
            print("[PluginManager] Already initialized")
            return

        try:
            # Initialize loader
            await self._loader.initialize()

            # Initialize registry
            if self._registry:
                await self._registry.initialize()

            # Start health check task
            self._start_health_check()

            # Start metrics collection task
            self._start_metrics_collection()

            self._initialized = True
            self.emit("manager.initialized", None)

        except Exception as e:
            print(f"[PluginManager] Failed to initialize: {e}")
            raise

    async def install_plugin(
        self, plugin_name: str, version: Optional[str] = None
    ) -> bool:
        """
        Install a plugin from the registry.

        Args:
            plugin_name: Plugin name.
            version: Optional specific version.

        Returns:
            True if installation successful.
        """
        if not self._registry:
            raise ValueError("Plugin registry not configured")

        try:
            success = await self._registry.install_plugin(plugin_name, version)

            if success:
                # Discover newly installed plugin
                await self._loader.discover_plugins()
                self.emit("plugin.installed", {"plugin_name": plugin_name, "version": version})

            return success

        except Exception as e:
            print(f"[PluginManager] Failed to install plugin {plugin_name}: {e}")
            self.emit("plugin.install.failed", {"plugin_name": plugin_name, "error": str(e)})
            return False

    async def uninstall_plugin(self, plugin_id: str) -> bool:
        """
        Uninstall a plugin.

        Args:
            plugin_id: Plugin identifier.

        Returns:
            True if uninstallation successful.
        """
        try:
            # Unload first
            await self.unload_plugin(plugin_id)

            # Remove from registry
            if self._registry:
                await self._registry.uninstall_plugin(plugin_id)

            self.emit("plugin.uninstalled", {"plugin_id": plugin_id})
            return True

        except Exception as e:
            print(f"[PluginManager] Failed to uninstall plugin {plugin_id}: {e}")
            self.emit("plugin.uninstall.failed", {"plugin_id": plugin_id, "error": str(e)})
            return False

    async def load_plugin(self, plugin_id: str) -> bool:
        """
        Load a plugin.

        Args:
            plugin_id: Plugin identifier.

        Returns:
            True if loaded successfully.
        """
        return await self._loader.load_plugin(plugin_id)

    async def unload_plugin(self, plugin_id: str) -> bool:
        """
        Unload a plugin.

        Args:
            plugin_id: Plugin identifier.

        Returns:
            True if unloaded successfully.
        """
        return await self._loader.unload_plugin(plugin_id)

    async def activate_plugin(self, plugin_id: str) -> bool:
        """
        Activate a plugin.

        Args:
            plugin_id: Plugin identifier.

        Returns:
            True if activated successfully.
        """
        return await self._loader.activate_plugin(plugin_id)

    async def deactivate_plugin(self, plugin_id: str) -> bool:
        """
        Deactivate a plugin.

        Args:
            plugin_id: Plugin identifier.

        Returns:
            True if deactivated successfully.
        """
        return await self._loader.deactivate_plugin(plugin_id)

    async def restart_plugin(self, plugin_id: str) -> bool:
        """
        Restart a plugin (deactivate and activate).

        Args:
            plugin_id: Plugin identifier.

        Returns:
            True if restarted successfully.
        """
        try:
            await self.deactivate_plugin(plugin_id)
            await asyncio.sleep(1)  # Brief pause
            success = await self.activate_plugin(plugin_id)

            if success:
                self.emit("plugin.restarted", {"plugin_id": plugin_id})

            return success

        except Exception as e:
            print(f"[PluginManager] Failed to restart plugin {plugin_id}: {e}")
            self.emit("plugin.restart.failed", {"plugin_id": plugin_id, "error": str(e)})
            return False

    def get_plugins(self) -> list[PluginDescriptor]:
        """
        Get all discovered plugins.

        Returns:
            List of plugin descriptors.
        """
        return self._loader.get_plugins()

    def get_active_plugins(self) -> list[PluginDescriptor]:
        """
        Get all active plugins.

        Returns:
            List of active plugin descriptors.
        """
        return self._loader.get_active_plugins()

    def get_plugin_status(self, plugin_id: str) -> Optional[PluginState]:
        """
        Get plugin status.

        Args:
            plugin_id: Plugin identifier.

        Returns:
            PluginState if found, None otherwise.
        """
        return self._loader.get_plugin_status(plugin_id)

    def get_plugin_info(self, plugin_id: str) -> Optional[dict[str, Any]]:
        """
        Get detailed plugin information.

        Args:
            plugin_id: Plugin identifier.

        Returns:
            Plugin info dictionary if found, None otherwise.
        """
        plugins = self.get_plugins()
        plugin = next((p for p in plugins if p.id == plugin_id), None)

        if not plugin:
            return None

        return {
            "id": plugin.id,
            "name": plugin.manifest.name,
            "version": plugin.manifest.version,
            "description": plugin.manifest.description,
            "author": plugin.manifest.author,
            "category": plugin.manifest.category,
            "loaded": plugin.loaded,
            "active": plugin.active,
            "status": self.get_plugin_status(plugin_id),
            "metrics": self.get_plugin_metrics(plugin_id),
        }

    def search_plugins(self, query: str) -> list[PluginDescriptor]:
        """
        Search plugins by query.

        Args:
            query: Search query.

        Returns:
            List of matching plugin descriptors.
        """
        plugins = self.get_plugins()
        search_terms = query.lower().split()

        results = []
        for plugin in plugins:
            searchable = " ".join([
                plugin.manifest.name,
                plugin.manifest.description,
                plugin.manifest.author,
                plugin.manifest.category.value if hasattr(plugin.manifest.category, 'value') else str(plugin.manifest.category),
                " ".join(plugin.manifest.tags),
                " ".join(plugin.manifest.keywords),
            ]).lower()

            if all(term in searchable for term in search_terms):
                results.append(plugin)

        return results

    def get_plugins_by_category(self, category: str) -> list[PluginDescriptor]:
        """
        Get plugins by category.

        Args:
            category: Plugin category.

        Returns:
            List of plugin descriptors in the category.
        """
        plugins = self.get_plugins()
        return [
            p for p in plugins
            if (p.manifest.category.value if hasattr(p.manifest.category, 'value') else str(p.manifest.category)) == category
        ]

    async def check_plugin_health(
        self, plugin_id: str
    ) -> Optional[PluginHealthStatus]:
        """
        Check plugin health.

        Args:
            plugin_id: Plugin identifier.

        Returns:
            PluginHealthStatus if available, None otherwise.
        """
        return await self._loader.check_plugin_health(plugin_id)

    async def check_all_plugins_health(
        self,
    ) -> dict[str, Optional[PluginHealthStatus]]:
        """
        Check health of all active plugins.

        Returns:
            Dictionary mapping plugin IDs to health status.
        """
        active_plugins = self.get_active_plugins()
        health_results: dict[str, Optional[PluginHealthStatus]] = {}

        for plugin in active_plugins:
            try:
                health_results[plugin.id] = await self.check_plugin_health(plugin.id)
            except Exception as e:
                health_results[plugin.id] = PluginHealthStatus(
                    status="error",
                    message=str(e),
                )

        return health_results

    def get_plugin_metrics(self, plugin_id: str) -> Optional[PluginMetrics]:
        """
        Get plugin metrics.

        Args:
            plugin_id: Plugin identifier.

        Returns:
            PluginMetrics if available, None otherwise.
        """
        # Would integrate with actual metrics collection
        return None

    def get_system_stats(self) -> dict[str, Any]:
        """
        Get system statistics.

        Returns:
            Dictionary with system statistics.
        """
        import psutil

        plugins = self.get_plugins()
        active_plugins = self.get_active_plugins()

        status_counts: dict[str, int] = {}
        for plugin in plugins:
            status = self.get_plugin_status(plugin.id)
            status_str = status.value if status else "unloaded"
            status_counts[status_str] = status_counts.get(status_str, 0) + 1

        category_counts: dict[str, int] = {}
        for plugin in plugins:
            category = (
                plugin.manifest.category.value
                if hasattr(plugin.manifest.category, 'value')
                else str(plugin.manifest.category)
            )
            category_counts[category] = category_counts.get(category, 0) + 1

        process = psutil.Process()
        memory_info = process.memory_info()

        return {
            "total_plugins": len(plugins),
            "active_plugins": len(active_plugins),
            "status_counts": status_counts,
            "category_counts": category_counts,
            "memory_usage": {
                "rss": memory_info.rss,
                "vms": memory_info.vms,
            },
            "uptime": (datetime.utcnow() - datetime.utcnow()).total_seconds(),
        }

    async def check_for_updates(
        self,
    ) -> list[dict[str, str]]:
        """
        Check for plugin updates.

        Returns:
            List of plugins with available updates.
        """
        if not self._registry:
            return []

        plugins = self.get_plugins()
        updates = []

        for plugin in plugins:
            try:
                latest_version = await self._registry.get_latest_version(
                    plugin.manifest.name
                )
                if latest_version and latest_version != plugin.manifest.version:
                    updates.append({
                        "plugin_id": plugin.id,
                        "current_version": plugin.manifest.version,
                        "latest_version": latest_version,
                    })
            except Exception as e:
                print(f"[PluginManager] Failed to check updates for {plugin.id}: {e}")

        return updates

    async def update_plugin(
        self, plugin_id: str, version: Optional[str] = None
    ) -> bool:
        """
        Update a plugin.

        Args:
            plugin_id: Plugin identifier.
            version: Optional specific version.

        Returns:
            True if update successful.
        """
        if not self._registry:
            raise ValueError("Plugin registry not configured")

        try:
            plugin = next(
                (p for p in self.get_plugins() if p.id == plugin_id), None
            )
            if not plugin:
                raise ValueError(f"Plugin not found: {plugin_id}")

            # Unload existing plugin
            await self.unload_plugin(plugin_id)

            # Install new version
            success = await self._registry.install_plugin(
                plugin.manifest.name, version, force_update=True
            )

            if success:
                # Reload plugin
                await self._loader.discover_plugins()
                await self.load_plugin(plugin_id)
                self.emit("plugin.updated", {"plugin_id": plugin_id, "version": version})

            return success

        except Exception as e:
            print(f"[PluginManager] Failed to update plugin {plugin_id}: {e}")
            self.emit("plugin.update.failed", {"plugin_id": plugin_id, "error": str(e)})
            return False

    def _start_health_check(self) -> None:
        """Start health check background task."""
        if self.config.health_check_interval <= 0:
            return

        async def health_check_loop():
            while True:
                await asyncio.sleep(self.config.health_check_interval / 1000)
                try:
                    health_results = await self.check_all_plugins_health()

                    for plugin_id, health in health_results.items():
                        if health and health.status == "error":
                            self.emit(
                                "plugin.health.critical",
                                {"plugin_id": plugin_id, "health": health},
                            )

                    self.emit("system.health.checked", health_results)

                except Exception as e:
                    print(f"[PluginManager] Health check error: {e}")

        try:
            loop = asyncio.get_event_loop()
            self._health_check_task = loop.create_task(health_check_loop())
        except RuntimeError:
            pass

    def _start_metrics_collection(self) -> None:
        """Start metrics collection background task."""
        if self.config.metrics_interval <= 0:
            return

        async def metrics_loop():
            while True:
                await asyncio.sleep(self.config.metrics_interval / 1000)
                try:
                    stats = self.get_system_stats()
                    self.emit("system.metrics.collected", stats)
                except Exception as e:
                    print(f"[PluginManager] Metrics collection error: {e}")

        try:
            loop = asyncio.get_event_loop()
            self._metrics_task = loop.create_task(metrics_loop())
        except RuntimeError:
            pass

    async def dispose(self) -> None:
        """Dispose of the plugin manager and all resources."""
        if not self._initialized:
            return

        # Cancel background tasks
        if self._health_check_task:
            self._health_check_task.cancel()
            try:
                await self._health_check_task
            except asyncio.CancelledError:
                pass

        if self._metrics_task:
            self._metrics_task.cancel()
            try:
                await self._metrics_task
            except asyncio.CancelledError:
                pass

        # Unload all plugins
        await self._loader.unload_all_plugins()

        # Dispose loader
        await self._loader.dispose()

        # Dispose registry
        if self._registry:
            await self._registry.dispose()

        self._initialized = False
        self.emit("manager.disposed", None)


# Singleton instance
_plugin_manager: Optional[PluginManager] = None


def get_plugin_manager(
    config: Optional[PluginManagerConfig] = None,
) -> PluginManager:
    """
    Get the singleton PluginManager instance.

    Args:
        config: Optional configuration (required on first call).

    Returns:
        PluginManager singleton instance.
    """
    global _plugin_manager

    if _plugin_manager is None:
        if config is None:
            raise ValueError("Configuration required for first initialization")
        _plugin_manager = PluginManager(config)

    return _plugin_manager


def reset_plugin_manager() -> None:
    """Reset the singleton PluginManager instance (for testing)."""
    global _plugin_manager
    _plugin_manager = None
