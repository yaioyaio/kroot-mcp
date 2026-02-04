"""
Plugin Loader.

This module provides dynamic plugin loading, unloading, and lifecycle management.
Supports hot reload, validation, and dependency resolution.
"""

import hashlib
import importlib
import importlib.util
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Optional
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileModifiedEvent

from .types import (
    Plugin,
    PluginAPIContext,
    PluginDescriptor,
    PluginHealthStatus,
    PluginLoaderConfig,
    PluginManifest,
    PluginMetrics,
    PluginRuntime,
    PluginSandboxInfo,
    PluginState,
)


class PluginChangeHandler(FileSystemEventHandler):
    """File system event handler for plugin changes."""

    def __init__(self, loader: "PluginLoader"):
        """Initialize the change handler."""
        self.loader = loader

    def on_modified(self, event: FileModifiedEvent) -> None:
        """Handle file modification events."""
        if event.is_directory:
            return
        if event.src_path.endswith("package.json"):
            # Schedule plugin reload
            plugin_dir = os.path.dirname(event.src_path)
            self.loader._schedule_reload(plugin_dir)


class PluginLoader:
    """
    Plugin Loader for dynamic plugin management.

    Provides functionality for:
    - Dynamic module loading using importlib
    - Plugin lifecycle management (load, unload, reload)
    - Hot reload support with file watching
    - Dependency resolution
    - Plugin validation

    Args:
        config: Plugin loader configuration.
        api_provider: Optional API provider for creating plugin contexts.
        sandbox: Optional sandbox for isolated execution.

    Example:
        >>> config = PluginLoaderConfig(plugin_dirs=["/path/to/plugins"])
        >>> loader = PluginLoader(config)
        >>> await loader.initialize()
        >>> await loader.load_plugin("my-plugin")
    """

    def __init__(
        self,
        config: PluginLoaderConfig,
        api_provider: Optional[Any] = None,
        sandbox: Optional[Any] = None,
    ):
        """Initialize the plugin loader."""
        self.config = config
        self.api_provider = api_provider
        self.sandbox = sandbox

        self._plugins: dict[str, PluginDescriptor] = {}
        self._runtimes: dict[str, PluginRuntime] = {}
        self._observer: Optional[Observer] = None
        self._reload_queue: list[str] = []
        self._event_handlers: dict[str, list[Callable[..., Any]]] = {}

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

    async def initialize(self) -> None:
        """
        Initialize the plugin loader.

        Creates plugin directories, discovers existing plugins,
        optionally auto-loads them, and starts file watching for hot reload.
        """
        try:
            # Create plugin directories
            for plugin_dir in self.config.plugin_dirs:
                await self._ensure_directory(plugin_dir)

            # Discover existing plugins
            await self.discover_plugins()

            # Auto-load plugins if enabled
            if self.config.auto_load:
                await self.load_all_plugins()

            # Start file watching for hot reload
            if self.config.hot_reload:
                self._start_watching()

        except Exception as e:
            raise RuntimeError(f"Failed to initialize plugin loader: {e}")

    async def discover_plugins(self) -> None:
        """
        Discover plugins in configured directories.

        Scans all plugin directories for valid plugin manifests
        and updates the internal plugin registry.
        """
        discovered: dict[str, PluginDescriptor] = {}

        for plugin_dir in self.config.plugin_dirs:
            try:
                plugin_path = Path(plugin_dir)
                if not plugin_path.exists():
                    continue

                for entry in plugin_path.iterdir():
                    if entry.is_dir():
                        descriptor = await self._load_plugin_descriptor(str(entry))
                        if descriptor:
                            discovered[descriptor.id] = descriptor

            except Exception as e:
                print(f"[PluginLoader] Failed to scan directory {plugin_dir}: {e}")

        self._plugins = discovered
        self.emit("plugins.discovered", list(discovered.values()))

    async def _load_plugin_descriptor(
        self, plugin_path: str
    ) -> Optional[PluginDescriptor]:
        """
        Load plugin descriptor from a plugin directory.

        Args:
            plugin_path: Path to the plugin directory.

        Returns:
            PluginDescriptor if valid, None otherwise.
        """
        try:
            manifest_path = os.path.join(plugin_path, "package.json")
            if not os.path.exists(manifest_path):
                return None

            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest_data = json.load(f)

            # Validate required fields
            if not manifest_data.get("name") or not manifest_data.get("version"):
                print(f"[PluginLoader] Invalid manifest in {plugin_path}")
                return None

            # Validate plugin metadata
            if not self._validate_plugin_metadata(manifest_data):
                print(f"[PluginLoader] Invalid plugin metadata in {plugin_path}")
                return None

            # Create manifest
            manifest = PluginManifest(
                id=manifest_data.get("id", manifest_data.get("name")),
                name=manifest_data.get("name"),
                version=manifest_data.get("version"),
                description=manifest_data.get("description", ""),
                author=manifest_data.get("author", "Unknown"),
                category=manifest_data.get("category", "utility"),
                tags=manifest_data.get("tags", []),
                min_devflow_version=manifest_data.get("minDevFlowVersion", "1.0.0"),
                homepage=manifest_data.get("homepage"),
                repository=manifest_data.get("repository"),
                license=manifest_data.get("license"),
                dependencies=manifest_data.get("dependencies", {}),
                permissions=manifest_data.get("permissions", []),
                config_schema=manifest_data.get("configSchema"),
                icon=manifest_data.get("icon"),
                main=manifest_data.get("main", "index.py"),
                types=manifest_data.get("types"),
                keywords=manifest_data.get("keywords", []),
                engines=manifest_data.get("engines"),
                scripts=manifest_data.get("scripts"),
                dev_dependencies=manifest_data.get("devDependencies"),
            )

            # Get file stats
            stat = os.stat(plugin_path)
            checksum = await self._calculate_checksum(plugin_path)

            return PluginDescriptor(
                id=manifest.id,
                path=plugin_path,
                manifest=manifest,
                loaded=False,
                active=False,
                last_modified=datetime.fromtimestamp(stat.st_mtime),
                checksum=checksum,
            )

        except Exception as e:
            print(f"[PluginLoader] Failed to load descriptor for {plugin_path}: {e}")
            return None

    def _validate_plugin_metadata(self, manifest: dict[str, Any]) -> bool:
        """
        Validate plugin manifest data.

        Args:
            manifest: Manifest dictionary.

        Returns:
            True if valid, False otherwise.
        """
        required_fields = [
            "id", "name", "version", "description", "author", "category"
        ]

        for field in required_fields:
            if not manifest.get(field):
                # Allow name to be used as id
                if field == "id" and manifest.get("name"):
                    continue
                print(f"[PluginLoader] Missing required field: {field}")
                return False

        # Validate version format (simple semver check)
        version = manifest.get("version", "")
        if not re.match(r"^\d+\.\d+\.\d+", version):
            print(f"[PluginLoader] Invalid version format: {version}")
            return False

        return True

    async def load_plugin(self, plugin_id: str) -> bool:
        """
        Load a plugin by ID.

        Args:
            plugin_id: Plugin identifier.

        Returns:
            True if loaded successfully, False otherwise.
        """
        try:
            descriptor = self._plugins.get(plugin_id)
            if not descriptor:
                raise ValueError(f"Plugin not found: {plugin_id}")

            if descriptor.loaded:
                print(f"[PluginLoader] Plugin already loaded: {plugin_id}")
                return True

            # Check max plugins limit
            if len(self._runtimes) >= self.config.max_plugins:
                raise ValueError(
                    f"Maximum number of plugins ({self.config.max_plugins}) reached"
                )

            # Load the plugin module
            plugin_instance = await self._load_plugin_module(descriptor)

            # Create API context
            context = await self._create_api_context(descriptor)

            # Create sandbox environment if enabled
            sandbox_info: Optional[PluginSandboxInfo] = None
            if self.sandbox and self.config.sandbox_enabled:
                sandbox_info = await self.sandbox.create_environment(descriptor)

            # Create runtime
            runtime = PluginRuntime(
                instance=plugin_instance,
                status=PluginState.LOADED,
                context=context,
                loaded_at=datetime.utcnow(),
                metrics=PluginMetrics(),
                sandbox=sandbox_info,
            )

            # Initialize the plugin
            await self._initialize_plugin(runtime)

            self._runtimes[plugin_id] = runtime
            descriptor.loaded = True

            self.emit("plugin.loaded", {"plugin_id": plugin_id, "metadata": descriptor.manifest})
            return True

        except Exception as e:
            print(f"[PluginLoader] Failed to load plugin {plugin_id}: {e}")
            self.emit("plugin.error", {"plugin_id": plugin_id, "error": str(e)})
            return False

    async def _load_plugin_module(self, descriptor: PluginDescriptor) -> Plugin:
        """
        Load the plugin module dynamically.

        Args:
            descriptor: Plugin descriptor.

        Returns:
            Plugin instance.
        """
        plugin_path = os.path.join(descriptor.path, descriptor.manifest.main)

        try:
            # Load the module dynamically
            spec = importlib.util.spec_from_file_location(
                descriptor.id, plugin_path
            )
            if not spec or not spec.loader:
                raise ImportError(f"Could not load module from {plugin_path}")

            module = importlib.util.module_from_spec(spec)
            sys.modules[descriptor.id] = module
            spec.loader.exec_module(module)

            # Find the plugin class
            plugin_class = None

            # Look for default export or Plugin class
            if hasattr(module, "default"):
                plugin_class = module.default
            elif hasattr(module, "Plugin"):
                plugin_class = module.Plugin
            else:
                # Find any class that inherits from Plugin
                for attr_name in dir(module):
                    attr = getattr(module, attr_name)
                    if (
                        isinstance(attr, type)
                        and issubclass(attr, Plugin)
                        and attr is not Plugin
                    ):
                        plugin_class = attr
                        break

            if not plugin_class:
                raise ImportError("Plugin must export a class inheriting from Plugin")

            instance = plugin_class()

            # Validate plugin interface
            if not self._validate_plugin_interface(instance):
                raise ValueError("Plugin does not implement required interface")

            return instance

        except Exception as e:
            raise ImportError(f"Failed to load plugin module: {e}")

    def _validate_plugin_interface(self, instance: Any) -> bool:
        """
        Validate that an instance implements the Plugin interface.

        Args:
            instance: Plugin instance to validate.

        Returns:
            True if valid, False otherwise.
        """
        required_methods = ["initialize", "activate", "deactivate", "dispose"]

        for method in required_methods:
            if not hasattr(instance, method) or not callable(getattr(instance, method)):
                print(f"[PluginLoader] Missing required method: {method}")
                return False

        if not hasattr(instance, "metadata"):
            print("[PluginLoader] Missing plugin metadata")
            return False

        return True

    async def _create_api_context(
        self, descriptor: PluginDescriptor
    ) -> PluginAPIContext:
        """
        Create API context for a plugin.

        Args:
            descriptor: Plugin descriptor.

        Returns:
            PluginAPIContext instance.
        """
        if self.api_provider:
            return await self.api_provider.create_context(descriptor)

        # Return basic context if no provider
        return PluginAPIContext(
            metadata=descriptor.manifest,
            config=descriptor.manifest.config_schema or {},
        )

    async def _initialize_plugin(self, runtime: PluginRuntime) -> None:
        """
        Initialize a plugin.

        Args:
            runtime: Plugin runtime.
        """
        try:
            runtime.status = PluginState.LOADING

            timeout = self.config.timeouts.get("initialize", 30000) / 1000

            import asyncio

            await asyncio.wait_for(
                runtime.instance.initialize(runtime.context),
                timeout=timeout,
            )

            runtime.status = PluginState.LOADED

        except asyncio.TimeoutError:
            runtime.status = PluginState.ERROR
            runtime.last_error = f"Plugin initialization timeout ({timeout}s)"
            raise
        except Exception as e:
            runtime.status = PluginState.ERROR
            runtime.last_error = str(e)
            raise

    async def activate_plugin(self, plugin_id: str) -> bool:
        """
        Activate a loaded plugin.

        Args:
            plugin_id: Plugin identifier.

        Returns:
            True if activated successfully, False otherwise.
        """
        try:
            runtime = self._runtimes.get(plugin_id)
            if not runtime:
                raise ValueError(f"Plugin not loaded: {plugin_id}")

            if runtime.status == PluginState.ACTIVE:
                print(f"[PluginLoader] Plugin already active: {plugin_id}")
                return True

            runtime.status = PluginState.LOADING

            timeout = self.config.timeouts.get("activate", 10000) / 1000

            import asyncio

            await asyncio.wait_for(
                runtime.instance.activate(),
                timeout=timeout,
            )

            runtime.status = PluginState.ACTIVE
            runtime.activated_at = datetime.utcnow()

            descriptor = self._plugins.get(plugin_id)
            if descriptor:
                descriptor.active = True

            self.emit("plugin.activated", {"plugin_id": plugin_id})
            return True

        except Exception as e:
            runtime = self._runtimes.get(plugin_id)
            if runtime:
                runtime.status = PluginState.ERROR
                runtime.last_error = str(e)

            print(f"[PluginLoader] Failed to activate plugin {plugin_id}: {e}")
            self.emit("plugin.error", {"plugin_id": plugin_id, "error": str(e)})
            return False

    async def deactivate_plugin(self, plugin_id: str) -> bool:
        """
        Deactivate an active plugin.

        Args:
            plugin_id: Plugin identifier.

        Returns:
            True if deactivated successfully, False otherwise.
        """
        try:
            runtime = self._runtimes.get(plugin_id)
            if not runtime:
                raise ValueError(f"Plugin not loaded: {plugin_id}")

            if runtime.status != PluginState.ACTIVE:
                print(f"[PluginLoader] Plugin not active: {plugin_id}")
                return True

            timeout = self.config.timeouts.get("deactivate", 10000) / 1000

            import asyncio

            await asyncio.wait_for(
                runtime.instance.deactivate(),
                timeout=timeout,
            )

            runtime.status = PluginState.LOADED
            runtime.activated_at = None

            descriptor = self._plugins.get(plugin_id)
            if descriptor:
                descriptor.active = False

            self.emit("plugin.deactivated", {"plugin_id": plugin_id})
            return True

        except Exception as e:
            runtime = self._runtimes.get(plugin_id)
            if runtime:
                runtime.status = PluginState.ERROR
                runtime.last_error = str(e)

            print(f"[PluginLoader] Failed to deactivate plugin {plugin_id}: {e}")
            self.emit("plugin.error", {"plugin_id": plugin_id, "error": str(e)})
            return False

    async def unload_plugin(self, plugin_id: str) -> bool:
        """
        Unload a plugin.

        Args:
            plugin_id: Plugin identifier.

        Returns:
            True if unloaded successfully, False otherwise.
        """
        try:
            runtime = self._runtimes.get(plugin_id)
            descriptor = self._plugins.get(plugin_id)

            if not runtime or not descriptor:
                print(f"[PluginLoader] Plugin not found: {plugin_id}")
                return True

            # Deactivate first if active
            if runtime.status == PluginState.ACTIVE:
                await self.deactivate_plugin(plugin_id)

            # Dispose the plugin
            try:
                await runtime.instance.dispose()
            except Exception as e:
                print(f"[PluginLoader] Error during plugin disposal: {e}")

            # Destroy sandbox environment
            if runtime.sandbox and self.sandbox:
                await self.sandbox.destroy_environment(plugin_id)

            # Destroy API context
            if self.api_provider:
                await self.api_provider.destroy_context(plugin_id)

            # Remove from module cache
            if plugin_id in sys.modules:
                del sys.modules[plugin_id]

            # Remove runtime
            del self._runtimes[plugin_id]
            descriptor.loaded = False
            descriptor.active = False

            self.emit("plugin.unloaded", {"plugin_id": plugin_id})
            return True

        except Exception as e:
            print(f"[PluginLoader] Failed to unload plugin {plugin_id}: {e}")
            self.emit("plugin.error", {"plugin_id": plugin_id, "error": str(e)})
            return False

    async def reload_plugin(self, plugin_id: str) -> bool:
        """
        Reload a plugin (unload and load again).

        Args:
            plugin_id: Plugin identifier.

        Returns:
            True if reloaded successfully, False otherwise.
        """
        was_active = False
        runtime = self._runtimes.get(plugin_id)
        if runtime:
            was_active = runtime.status == PluginState.ACTIVE

        await self.unload_plugin(plugin_id)

        # Re-discover the plugin
        descriptor = self._plugins.get(plugin_id)
        if descriptor:
            new_descriptor = await self._load_plugin_descriptor(descriptor.path)
            if new_descriptor:
                self._plugins[plugin_id] = new_descriptor

        success = await self.load_plugin(plugin_id)

        if success and was_active:
            await self.activate_plugin(plugin_id)

        return success

    async def load_all_plugins(self) -> None:
        """Load all discovered plugins."""
        for plugin_id in list(self._plugins.keys()):
            await self.load_plugin(plugin_id)

    async def unload_all_plugins(self) -> None:
        """Unload all loaded plugins."""
        for plugin_id in list(self._runtimes.keys()):
            await self.unload_plugin(plugin_id)

    def get_plugin_status(self, plugin_id: str) -> Optional[PluginState]:
        """
        Get the status of a plugin.

        Args:
            plugin_id: Plugin identifier.

        Returns:
            PluginState if found, None otherwise.
        """
        runtime = self._runtimes.get(plugin_id)
        return runtime.status if runtime else None

    def get_plugins(self) -> list[PluginDescriptor]:
        """
        Get all discovered plugins.

        Returns:
            List of plugin descriptors.
        """
        return list(self._plugins.values())

    def get_active_plugins(self) -> list[PluginDescriptor]:
        """
        Get all active plugins.

        Returns:
            List of active plugin descriptors.
        """
        return [p for p in self._plugins.values() if p.active]

    async def check_plugin_health(
        self, plugin_id: str
    ) -> Optional[PluginHealthStatus]:
        """
        Check the health of a plugin.

        Args:
            plugin_id: Plugin identifier.

        Returns:
            PluginHealthStatus if available, None otherwise.
        """
        runtime = self._runtimes.get(plugin_id)
        if not runtime or runtime.status != PluginState.ACTIVE:
            return None

        try:
            if hasattr(runtime.instance, "health_check"):
                status = await runtime.instance.health_check()
                self.emit("plugin.health.checked", {"plugin_id": plugin_id, "status": status})
                return status

            return PluginHealthStatus(
                status="healthy",
                message="Plugin is running normally",
            )
        except Exception as e:
            status = PluginHealthStatus(
                status="error",
                message=str(e),
            )
            self.emit("plugin.health.checked", {"plugin_id": plugin_id, "status": status})
            return status

    def _start_watching(self) -> None:
        """Start file watching for hot reload."""
        self._observer = Observer()
        handler = PluginChangeHandler(self)

        for plugin_dir in self.config.plugin_dirs:
            try:
                self._observer.schedule(handler, plugin_dir, recursive=True)
            except Exception as e:
                print(f"[PluginLoader] Failed to watch {plugin_dir}: {e}")

        self._observer.start()

    def _stop_watching(self) -> None:
        """Stop file watching."""
        if self._observer:
            self._observer.stop()
            self._observer.join()
            self._observer = None

    def _schedule_reload(self, plugin_path: str) -> None:
        """
        Schedule a plugin reload.

        Args:
            plugin_path: Path to the plugin directory.
        """
        if plugin_path not in self._reload_queue:
            self._reload_queue.append(plugin_path)
            # Process reload asynchronously
            import asyncio

            asyncio.create_task(self._process_reload_queue())

    async def _process_reload_queue(self) -> None:
        """Process the reload queue."""
        while self._reload_queue:
            plugin_path = self._reload_queue.pop(0)
            try:
                descriptor = await self._load_plugin_descriptor(plugin_path)
                if not descriptor:
                    continue

                existing = self._plugins.get(descriptor.id)
                if existing and existing.checksum != descriptor.checksum:
                    # Plugin changed, reload
                    await self.reload_plugin(descriptor.id)
                elif not existing:
                    # New plugin discovered
                    self._plugins[descriptor.id] = descriptor
                    if self.config.auto_load:
                        await self.load_plugin(descriptor.id)

            except Exception as e:
                print(f"[PluginLoader] Error handling plugin change: {e}")

    async def dispose(self) -> None:
        """Dispose of the plugin loader and all plugins."""
        self._stop_watching()
        await self.unload_all_plugins()

        if self.api_provider and hasattr(self.api_provider, "dispose"):
            await self.api_provider.dispose()

        if self.sandbox and hasattr(self.sandbox, "dispose"):
            await self.sandbox.dispose()

    async def _ensure_directory(self, path: str) -> None:
        """
        Ensure a directory exists.

        Args:
            path: Directory path.
        """
        os.makedirs(path, exist_ok=True)

    async def _calculate_checksum(self, plugin_path: str) -> str:
        """
        Calculate checksum for a plugin.

        Args:
            plugin_path: Plugin directory path.

        Returns:
            SHA256 checksum of the manifest.
        """
        try:
            manifest_path = os.path.join(plugin_path, "package.json")
            with open(manifest_path, "r", encoding="utf-8") as f:
                content = f.read()
            return hashlib.sha256(content.encode()).hexdigest()
        except Exception:
            return ""
