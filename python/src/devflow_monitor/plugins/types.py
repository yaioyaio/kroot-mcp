"""
Plugin System Types.

This module defines all types, enums, and interfaces for the plugin system.
Provides comprehensive type definitions for plugin metadata, permissions,
lifecycle management, and API contexts.
"""

from abc import ABC, abstractmethod
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Coroutine, Optional

from pydantic import BaseModel, Field


class PluginCategory(str, Enum):
    """Plugin category enumeration."""

    MONITOR = "monitor"
    INTEGRATION = "integration"
    ANALYZER = "analyzer"
    NOTIFICATION = "notification"
    DASHBOARD = "dashboard"
    UTILITY = "utility"
    WORKFLOW = "workflow"
    SECURITY = "security"
    PERFORMANCE = "performance"
    REPORTING = "reporting"


class PluginPermission(str, Enum):
    """Plugin permission enumeration."""

    # File system permissions
    FILE_READ = "files:read"
    FILE_WRITE = "files:write"

    # Event permissions
    EVENTS_READ = "events:read"
    EVENTS_WRITE = "events:write"

    # Configuration permissions
    CONFIG_READ = "config:read"
    CONFIG_WRITE = "config:write"

    # Network permissions
    NETWORK_ACCESS = "network:access"

    # System permissions
    SYSTEM_INFO = "system:info"
    USER_DATA = "user:data"

    # Database permissions
    DATABASE_READ = "database:read"
    DATABASE_WRITE = "database:write"

    # MCP permissions
    MCP_TOOLS = "mcp:tools"

    # Notification permissions
    NOTIFICATIONS = "notifications:send"

    # Performance monitoring
    PERFORMANCE = "performance:monitor"

    # Security access
    SECURITY = "security:access"


class PluginState(str, Enum):
    """Plugin state enumeration."""

    UNLOADED = "unloaded"
    LOADING = "loading"
    LOADED = "loaded"
    ACTIVE = "active"
    INACTIVE = "inactive"
    ERROR = "error"
    UPDATING = "updating"
    DISABLED = "disabled"


class PluginLifecycle(str, Enum):
    """Plugin lifecycle stages."""

    INITIALIZE = "initialize"
    ACTIVATE = "activate"
    DEACTIVATE = "deactivate"
    DISPOSE = "dispose"


class IsolationLevel(str, Enum):
    """Sandbox isolation level enumeration."""

    NONE = "none"
    BASIC = "basic"
    STRICT = "strict"


class PluginMetadata(BaseModel):
    """Plugin metadata model."""

    id: str = Field(..., description="Plugin unique identifier")
    name: str = Field(..., description="Plugin name")
    version: str = Field(..., description="Plugin version (SemVer format)")
    description: str = Field(..., description="Plugin description")
    author: str = Field(..., description="Plugin author")
    category: PluginCategory = Field(..., description="Plugin category")
    tags: list[str] = Field(default_factory=list, description="Plugin tags")
    min_devflow_version: str = Field(
        default="1.0.0", description="Minimum DevFlow Monitor version"
    )
    homepage: Optional[str] = Field(None, description="Plugin homepage URL")
    repository: Optional[str] = Field(None, description="Plugin repository URL")
    license: Optional[str] = Field(None, description="Plugin license")
    dependencies: dict[str, str] = Field(
        default_factory=dict, description="Plugin dependencies"
    )
    permissions: list[PluginPermission] = Field(
        default_factory=list, description="Required permissions"
    )
    config_schema: Optional[dict[str, Any]] = Field(
        None, description="Plugin configuration schema"
    )
    icon: Optional[str] = Field(None, description="Plugin icon")


class PluginHealthStatus(BaseModel):
    """Plugin health status model."""

    status: str = Field(..., description="Health status (healthy/warning/error)")
    message: Optional[str] = Field(None, description="Status message")
    details: Optional[dict[str, Any]] = Field(None, description="Detailed information")
    last_check: datetime = Field(
        default_factory=datetime.utcnow, description="Last check time"
    )


class PluginMetrics(BaseModel):
    """Plugin performance metrics model."""

    cpu_usage: float = Field(default=0.0, description="CPU usage percentage")
    memory_usage: int = Field(default=0, description="Memory usage in bytes")
    events_processed: int = Field(default=0, description="Number of events processed")
    api_calls: int = Field(default=0, description="Number of API calls")
    avg_response_time: float = Field(default=0.0, description="Average response time (ms)")
    error_count: int = Field(default=0, description="Number of errors")
    last_activity: datetime = Field(
        default_factory=datetime.utcnow, description="Last activity time"
    )


class PluginResourceLimits(BaseModel):
    """Plugin resource limits model."""

    memory: int = Field(default=536870912, description="Memory limit in bytes (512MB)")
    cpu: int = Field(default=80, description="CPU limit percentage")
    files: int = Field(default=100, description="Maximum file handles")
    timeout: int = Field(default=30000, description="Operation timeout in ms")


class PluginSandboxInfo(BaseModel):
    """Plugin sandbox information model."""

    pid: Optional[int] = Field(None, description="Process ID")
    isolation_level: IsolationLevel = Field(
        default=IsolationLevel.BASIC, description="Isolation level"
    )
    resource_limits: PluginResourceLimits = Field(
        default_factory=PluginResourceLimits, description="Resource limits"
    )
    allowed_apis: list[str] = Field(
        default_factory=list, description="Allowed API list"
    )


class PluginLoaderConfig(BaseModel):
    """Plugin loader configuration model."""

    plugin_dirs: list[str] = Field(
        default_factory=list, description="Plugin directory paths"
    )
    auto_load: bool = Field(default=True, description="Auto-load plugins on startup")
    hot_reload: bool = Field(default=True, description="Enable hot reload")
    max_plugins: int = Field(default=100, description="Maximum number of plugins")
    timeouts: dict[str, int] = Field(
        default_factory=lambda: {
            "initialize": 30000,
            "activate": 10000,
            "deactivate": 10000,
        },
        description="Timeout settings in ms",
    )
    sandbox_enabled: bool = Field(default=True, description="Enable sandboxing")
    sandbox_memory_limit: int = Field(
        default=536870912, description="Sandbox memory limit (512MB)"
    )
    sandbox_cpu_limit: int = Field(default=80, description="Sandbox CPU limit percentage")
    sandbox_network_allowed: bool = Field(
        default=True, description="Allow network access"
    )
    sandbox_filesystem_access: str = Field(
        default="readonly", description="Filesystem access level"
    )


class PluginManifest(PluginMetadata):
    """Plugin manifest model (extends metadata with entry points)."""

    main: str = Field(..., description="Main entry point")
    types: Optional[str] = Field(None, description="Type definitions")
    keywords: list[str] = Field(default_factory=list, description="Plugin keywords")
    engines: Optional[dict[str, str]] = Field(None, description="Engine requirements")
    scripts: Optional[dict[str, str]] = Field(None, description="Plugin scripts")
    dev_dependencies: Optional[dict[str, str]] = Field(
        None, description="Development dependencies"
    )


class PluginDescriptor(BaseModel):
    """Plugin descriptor model (runtime information)."""

    id: str = Field(..., description="Plugin ID")
    path: str = Field(..., description="Plugin path")
    manifest: PluginManifest = Field(..., description="Plugin manifest")
    loaded: bool = Field(default=False, description="Whether plugin is loaded")
    active: bool = Field(default=False, description="Whether plugin is active")
    last_modified: datetime = Field(
        default_factory=datetime.utcnow, description="Last modification time"
    )
    checksum: str = Field(default="", description="Manifest checksum")


class PluginContext(BaseModel):
    """Plugin context model."""

    plugin_id: str = Field(..., description="Plugin ID")
    config: dict[str, Any] = Field(
        default_factory=dict, description="Plugin configuration"
    )
    metadata: Optional[PluginMetadata] = Field(None, description="Plugin metadata")

    class Config:
        """Pydantic configuration."""

        arbitrary_types_allowed = True


# Type aliases for handlers
EventHandler = Callable[[Any], Coroutine[Any, Any, None] | None]


class PluginLogger:
    """Plugin logger interface."""

    def debug(self, message: str, meta: Optional[Any] = None) -> None:
        """Log debug message."""
        pass

    def info(self, message: str, meta: Optional[Any] = None) -> None:
        """Log info message."""
        pass

    def warn(self, message: str, meta: Optional[Any] = None) -> None:
        """Log warning message."""
        pass

    def error(
        self, message: str, error: Optional[Exception] = None, meta: Optional[Any] = None
    ) -> None:
        """Log error message."""
        pass


class PluginFileSystem:
    """Plugin file system interface."""

    async def read_file(self, path: str) -> str:
        """Read file contents."""
        raise NotImplementedError

    async def write_file(self, path: str, content: str) -> None:
        """Write file contents."""
        raise NotImplementedError

    async def exists(self, path: str) -> bool:
        """Check if path exists."""
        raise NotImplementedError

    async def mkdir(self, path: str) -> None:
        """Create directory."""
        raise NotImplementedError

    async def read_dir(self, path: str) -> list[str]:
        """Read directory contents."""
        raise NotImplementedError

    def watch(
        self, path: str, callback: Callable[[str, str], None]
    ) -> None:
        """Watch path for changes."""
        raise NotImplementedError


class PluginHTTPClient:
    """Plugin HTTP client interface."""

    async def get(self, url: str, options: Optional[dict[str, Any]] = None) -> Any:
        """Make GET request."""
        raise NotImplementedError

    async def post(
        self, url: str, data: Any, options: Optional[dict[str, Any]] = None
    ) -> Any:
        """Make POST request."""
        raise NotImplementedError

    async def put(
        self, url: str, data: Any, options: Optional[dict[str, Any]] = None
    ) -> Any:
        """Make PUT request."""
        raise NotImplementedError

    async def delete(self, url: str, options: Optional[dict[str, Any]] = None) -> Any:
        """Make DELETE request."""
        raise NotImplementedError


class PluginDatabase:
    """Plugin database interface."""

    async def query(self, sql: str, params: Optional[list[Any]] = None) -> list[Any]:
        """Execute SQL query."""
        raise NotImplementedError

    async def insert(self, table: str, data: dict[str, Any]) -> int:
        """Insert record."""
        raise NotImplementedError

    async def update(
        self, table: str, data: dict[str, Any], where: dict[str, Any]
    ) -> int:
        """Update records."""
        raise NotImplementedError

    async def delete_record(self, table: str, where: dict[str, Any]) -> int:
        """Delete records."""
        raise NotImplementedError


class PluginMCPTools:
    """Plugin MCP tools interface."""

    def register_tool(
        self, name: str, description: str, handler: Callable[..., Any]
    ) -> None:
        """Register an MCP tool."""
        raise NotImplementedError

    def unregister_tool(self, name: str) -> None:
        """Unregister an MCP tool."""
        raise NotImplementedError

    async def call_tool(self, name: str, args: Any) -> Any:
        """Call an MCP tool."""
        raise NotImplementedError


class PluginNotifications:
    """Plugin notifications interface."""

    async def send(
        self,
        message: str,
        level: str = "info",
        options: Optional[dict[str, Any]] = None,
    ) -> None:
        """Send notification."""
        raise NotImplementedError

    async def create_rule(self, rule: Any) -> str:
        """Create notification rule."""
        raise NotImplementedError

    async def remove_rule(self, rule_id: str) -> None:
        """Remove notification rule."""
        raise NotImplementedError


class PluginCommunication:
    """Plugin inter-plugin communication interface."""

    async def send_message(self, target_plugin: str, message: Any) -> None:
        """Send message to another plugin."""
        raise NotImplementedError

    def broadcast(self, event: str, data: Any) -> None:
        """Broadcast event to all plugins."""
        raise NotImplementedError

    def subscribe(self, event: str, handler: EventHandler) -> None:
        """Subscribe to event."""
        raise NotImplementedError

    def unsubscribe(self, event: str, handler: EventHandler) -> None:
        """Unsubscribe from event."""
        raise NotImplementedError


class PluginStorage:
    """Plugin storage interface."""

    async def get(self, key: str) -> Any:
        """Get value by key."""
        raise NotImplementedError

    async def set(self, key: str, value: Any) -> None:
        """Set value by key."""
        raise NotImplementedError

    async def delete(self, key: str) -> None:
        """Delete value by key."""
        raise NotImplementedError

    async def clear(self) -> None:
        """Clear all storage."""
        raise NotImplementedError

    async def keys(self) -> list[str]:
        """Get all keys."""
        raise NotImplementedError


class PluginAPIContext(BaseModel):
    """Plugin API context model providing all interfaces to a plugin."""

    metadata: PluginMetadata = Field(..., description="Plugin metadata")
    config: dict[str, Any] = Field(
        default_factory=dict, description="Plugin configuration"
    )

    class Config:
        """Pydantic configuration."""

        arbitrary_types_allowed = True

    # Note: The actual interface instances (logger, fs, http, etc.)
    # are attached at runtime by the API provider


class Plugin(ABC):
    """
    Abstract base class for plugins.

    All plugins must inherit from this class and implement the required
    abstract methods for lifecycle management.

    Attributes:
        metadata: Plugin metadata containing id, name, version, etc.

    Example:
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
        ...     async def initialize(self, context: PluginAPIContext) -> None:
        ...         self.context = context
        ...
        ...     async def activate(self) -> None:
        ...         print("Plugin activated")
        ...
        ...     async def deactivate(self) -> None:
        ...         print("Plugin deactivated")
        ...
        ...     async def dispose(self) -> None:
        ...         print("Plugin disposed")
    """

    @property
    @abstractmethod
    def metadata(self) -> PluginMetadata:
        """
        Get plugin metadata.

        Returns:
            PluginMetadata containing plugin information.
        """
        pass

    @abstractmethod
    async def initialize(self, context: PluginAPIContext) -> None:
        """
        Initialize the plugin with context.

        Called when the plugin is first loaded. Use this to set up
        any required resources or state.

        Args:
            context: Plugin API context providing access to system APIs.
        """
        pass

    @abstractmethod
    async def activate(self) -> None:
        """
        Activate the plugin.

        Called when the plugin transitions from loaded to active state.
        Start any background tasks or event listeners here.
        """
        pass

    @abstractmethod
    async def deactivate(self) -> None:
        """
        Deactivate the plugin.

        Called when the plugin transitions from active to loaded state.
        Stop any background tasks or event listeners here.
        """
        pass

    @abstractmethod
    async def dispose(self) -> None:
        """
        Dispose of the plugin.

        Called when the plugin is being unloaded. Clean up all resources,
        close connections, and release any held references.
        """
        pass

    async def update_config(self, config: dict[str, Any]) -> None:
        """
        Update plugin configuration.

        Optional method to handle configuration updates at runtime.

        Args:
            config: New configuration dictionary.
        """
        pass

    async def health_check(self) -> PluginHealthStatus:
        """
        Perform health check.

        Optional method to report plugin health status.

        Returns:
            PluginHealthStatus indicating current health.
        """
        return PluginHealthStatus(
            status="healthy",
            message="Plugin is running normally",
        )

    async def on_event(self, event: Any) -> None:
        """
        Handle incoming event.

        Optional method to process events from the event engine.

        Args:
            event: Event to process.
        """
        pass


class PluginRuntime(BaseModel):
    """Plugin runtime information model."""

    instance: Any = Field(..., description="Plugin instance")
    status: PluginState = Field(
        default=PluginState.UNLOADED, description="Current status"
    )
    context: Optional[PluginAPIContext] = Field(None, description="API context")
    loaded_at: datetime = Field(
        default_factory=datetime.utcnow, description="Load time"
    )
    activated_at: Optional[datetime] = Field(None, description="Activation time")
    last_error: Optional[str] = Field(None, description="Last error message")
    metrics: PluginMetrics = Field(
        default_factory=PluginMetrics, description="Performance metrics"
    )
    sandbox: Optional[PluginSandboxInfo] = Field(None, description="Sandbox info")

    class Config:
        """Pydantic configuration."""

        arbitrary_types_allowed = True


class RegistryPluginInfo(BaseModel):
    """Registry plugin information model."""

    name: str = Field(..., description="Plugin name")
    version: str = Field(..., description="Plugin version")
    description: str = Field(..., description="Plugin description")
    author: str = Field(..., description="Plugin author")
    category: str = Field(..., description="Plugin category")
    tags: list[str] = Field(default_factory=list, description="Plugin tags")
    download_url: str = Field(..., description="Download URL")
    homepage: Optional[str] = Field(None, description="Homepage URL")
    repository: Optional[str] = Field(None, description="Repository URL")
    license: Optional[str] = Field(None, description="License")
    dependencies: Optional[dict[str, str]] = Field(None, description="Dependencies")
    verified: bool = Field(default=False, description="Whether verified")
    downloads: int = Field(default=0, description="Download count")
    rating: float = Field(default=0.0, description="Rating")
    created_at: datetime = Field(
        default_factory=datetime.utcnow, description="Creation time"
    )
    updated_at: datetime = Field(
        default_factory=datetime.utcnow, description="Update time"
    )
