"""
Plugin System.

This module provides a complete plugin system for DevFlow Monitor including:
- Dynamic plugin loading and lifecycle management
- Permission-based API access control
- Sandboxed execution environments
- Remote plugin registry support

Example:
    >>> from devflow_monitor.plugins import (
    ...     PluginManager,
    ...     PluginManagerConfig,
    ...     Plugin,
    ...     PluginMetadata,
    ...     PluginCategory,
    ...     PluginPermission,
    ... )
    >>>
    >>> # Create and initialize the plugin manager
    >>> config = PluginManagerConfig(plugin_dirs=["/path/to/plugins"])
    >>> manager = PluginManager(config)
    >>> await manager.initialize()
    >>>
    >>> # Load and activate a plugin
    >>> await manager.load_plugin("my-plugin")
    >>> await manager.activate_plugin("my-plugin")
    >>>
    >>> # Create a custom plugin
    >>> class MyPlugin(Plugin):
    ...     @property
    ...     def metadata(self) -> PluginMetadata:
    ...         return PluginMetadata(
    ...             id="my-plugin",
    ...             name="My Plugin",
    ...             version="1.0.0",
    ...             description="A sample plugin",
    ...             author="Developer",
    ...             category=PluginCategory.UTILITY,
    ...             permissions=[PluginPermission.FILE_READ],
    ...         )
    ...
    ...     async def initialize(self, context) -> None:
    ...         self.context = context
    ...
    ...     async def activate(self) -> None:
    ...         self.context.logger.info("Plugin activated!")
    ...
    ...     async def deactivate(self) -> None:
    ...         self.context.logger.info("Plugin deactivated!")
    ...
    ...     async def dispose(self) -> None:
    ...         pass
"""

from .types import (
    # Enums
    IsolationLevel,
    PluginCategory,
    PluginLifecycle,
    PluginPermission,
    PluginState,
    # Models
    Plugin,
    PluginAPIContext,
    PluginContext,
    PluginDescriptor,
    PluginHealthStatus,
    PluginLoaderConfig,
    PluginManifest,
    PluginMetadata,
    PluginMetrics,
    PluginResourceLimits,
    PluginRuntime,
    PluginSandboxInfo,
    RegistryPluginInfo,
    # Interfaces
    PluginCommunication,
    PluginDatabase,
    PluginFileSystem,
    PluginHTTPClient,
    PluginLogger,
    PluginMCPTools,
    PluginNotifications,
    PluginStorage,
)

from .loader import PluginLoader
from .sandbox import PluginSandbox, SandboxConfig, SandboxEnvironment
from .api_provider import PluginAPIProvider
from .manager import (
    PluginManager,
    PluginManagerConfig,
    get_plugin_manager,
    reset_plugin_manager,
)
from .registry import PluginRegistry

__all__ = [
    # Enums
    "IsolationLevel",
    "PluginCategory",
    "PluginLifecycle",
    "PluginPermission",
    "PluginState",
    # Abstract base class
    "Plugin",
    # Models
    "PluginAPIContext",
    "PluginContext",
    "PluginDescriptor",
    "PluginHealthStatus",
    "PluginLoaderConfig",
    "PluginManifest",
    "PluginMetadata",
    "PluginMetrics",
    "PluginResourceLimits",
    "PluginRuntime",
    "PluginSandboxInfo",
    "RegistryPluginInfo",
    # Interfaces
    "PluginCommunication",
    "PluginDatabase",
    "PluginFileSystem",
    "PluginHTTPClient",
    "PluginLogger",
    "PluginMCPTools",
    "PluginNotifications",
    "PluginStorage",
    # Core classes
    "PluginLoader",
    "PluginSandbox",
    "SandboxConfig",
    "SandboxEnvironment",
    "PluginAPIProvider",
    "PluginManager",
    "PluginManagerConfig",
    "PluginRegistry",
    # Factory functions
    "get_plugin_manager",
    "reset_plugin_manager",
]
