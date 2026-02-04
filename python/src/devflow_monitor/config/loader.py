"""
Configuration Loader for DevFlow Monitor.

Provides environment-based configuration loading with JSON files,
environment variable overrides, and Pydantic validation.
"""

from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings


class ServerConfig(BaseModel):
    """Server configuration."""

    port: int = 8080
    host: str = "localhost"
    name: str = "devflow-monitor"


class DatabaseConfig(BaseModel):
    """Database configuration."""

    path: str = "data/devflow.db"
    wal_mode: bool = True
    busy_timeout: int = 5000
    cache_size: int = 2000
    synchronous: str = "NORMAL"


class FileSystemMonitorConfig(BaseModel):
    """File system monitoring configuration."""

    enabled: bool = True
    ignore_patterns: list[str] = Field(
        default_factory=lambda: [
            "node_modules",
            ".git",
            "__pycache__",
            "*.pyc",
            ".venv",
            "dist",
        ]
    )
    watch_extensions: list[str] = Field(
        default_factory=lambda: [
            ".py",
            ".ts",
            ".tsx",
            ".js",
            ".jsx",
            ".json",
            ".yaml",
            ".yml",
        ]
    )
    debounce_delay: int = 100


class GitMonitorConfig(BaseModel):
    """Git monitoring configuration."""

    enabled: bool = True
    poll_interval: int = 5000
    branch_patterns: dict[str, str] = Field(
        default_factory=lambda: {
            "feature": "feature/*",
            "bugfix": "bugfix/*",
            "hotfix": "hotfix/*",
            "release": "release/*",
            "develop": "develop",
            "main": "main",
            "master": "master",
        }
    )


class MonitoringConfig(BaseModel):
    """Monitoring configuration."""

    file_system: FileSystemMonitorConfig = Field(default_factory=FileSystemMonitorConfig)
    git: GitMonitorConfig = Field(default_factory=GitMonitorConfig)


class EventsConfig(BaseModel):
    """Events configuration."""

    batch_size: int = 100
    flush_interval: int = 5000
    max_queue_size: int = 10000
    retry_attempts: int = 3
    retry_delay: int = 1000


class CacheConfig(BaseModel):
    """Cache configuration."""

    enabled: bool = True
    ttl: int = 300000
    max_size: int = 1000
    check_period: int = 60000


class ScalingConfig(BaseModel):
    """Scaling configuration."""

    enabled: bool = False
    min_workers: int = 1
    max_workers: int = 4
    scale_up_threshold: float = 0.8
    scale_down_threshold: float = 0.2


class PerformanceConfig(BaseModel):
    """Performance configuration."""

    cache: CacheConfig = Field(default_factory=CacheConfig)
    scaling: ScalingConfig = Field(default_factory=ScalingConfig)


class JWTConfig(BaseModel):
    """JWT configuration."""

    secret: str | None = None
    expires_in: str = "1h"
    refresh_expires_in: str = "7d"
    issuer: str = "devflow-monitor"
    audience: str = "devflow-client"


class ApiKeyConfig(BaseModel):
    """API key configuration."""

    salt: str = "default-salt"


class RateLimitConfig(BaseModel):
    """Rate limiting configuration."""

    window_ms: int = 900000
    max_attempts: int = 100


class AuthConfig(BaseModel):
    """Authentication configuration."""

    enabled: bool = False
    jwt: JWTConfig = Field(default_factory=JWTConfig)
    api_key: ApiKeyConfig | None = None
    rate_limit: RateLimitConfig = Field(default_factory=RateLimitConfig)


class SecurityConfig(BaseModel):
    """Security configuration."""

    auth: AuthConfig = Field(default_factory=AuthConfig)


class ConsoleLoggingConfig(BaseModel):
    """Console logging configuration."""

    enabled: bool = True
    colorize: bool = True


class FileLoggingConfig(BaseModel):
    """File logging configuration."""

    enabled: bool = False
    path: str = "logs/devflow.log"
    max_size: str = "10MB"
    max_files: int = 5


class LoggingConfig(BaseModel):
    """Logging configuration."""

    level: str = "info"
    format: str = "json"
    console: ConsoleLoggingConfig = Field(default_factory=ConsoleLoggingConfig)
    file: FileLoggingConfig = Field(default_factory=FileLoggingConfig)


class DashboardNotificationConfig(BaseModel):
    """Dashboard notification configuration."""

    enabled: bool = True


class SlackNotificationConfig(BaseModel):
    """Slack notification configuration."""

    enabled: bool = False
    webhook_url: str | None = None


class NotificationChannelsConfig(BaseModel):
    """Notification channels configuration."""

    dashboard: DashboardNotificationConfig = Field(
        default_factory=DashboardNotificationConfig
    )
    slack: SlackNotificationConfig = Field(default_factory=SlackNotificationConfig)


class NotificationsConfig(BaseModel):
    """Notifications configuration."""

    enabled: bool = True
    channels: NotificationChannelsConfig = Field(
        default_factory=NotificationChannelsConfig
    )


class DebugConfig(BaseModel):
    """Debug configuration."""

    enabled: bool = False
    verbose_errors: bool = False
    stack_traces: bool = True


class AppConfig(BaseSettings):
    """
    Application configuration.

    Loads configuration from JSON files and environment variables.
    Environment variables should be prefixed with DEVFLOW_.

    Attributes:
        server: Server configuration.
        database: Database configuration.
        monitoring: Monitoring configuration.
        events: Events configuration.
        performance: Performance configuration.
        security: Security configuration.
        logging: Logging configuration.
        notifications: Notifications configuration.
        debug: Debug configuration.
    """

    server: ServerConfig = Field(default_factory=ServerConfig)
    database: DatabaseConfig = Field(default_factory=DatabaseConfig)
    monitoring: MonitoringConfig = Field(default_factory=MonitoringConfig)
    events: EventsConfig = Field(default_factory=EventsConfig)
    performance: PerformanceConfig = Field(default_factory=PerformanceConfig)
    security: SecurityConfig = Field(default_factory=SecurityConfig)
    logging: LoggingConfig = Field(default_factory=LoggingConfig)
    notifications: NotificationsConfig = Field(default_factory=NotificationsConfig)
    debug: DebugConfig = Field(default_factory=DebugConfig)

    class Config:
        """Pydantic settings configuration."""

        env_prefix = "DEVFLOW_"
        env_nested_delimiter = "__"


class ConfigLoader:
    """
    Configuration loader with environment-based file loading.

    Loads configuration from default.json and environment-specific files,
    then applies environment variable overrides.

    Example:
        loader = ConfigLoader()
        config = loader.load()
        print(config.server.port)
    """

    _instance: ConfigLoader | None = None
    _config: AppConfig | None = None

    def __new__(cls) -> ConfigLoader:
        """Create singleton instance."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._config = None
        return cls._instance

    def __init__(self) -> None:
        """Initialize the configuration loader."""
        # Load environment variables from .env file
        load_dotenv()

        self._environment = os.getenv("DEVFLOW_ENV", "development")
        self._config_dir = Path(os.getcwd()) / "config"

    @property
    def environment(self) -> str:
        """Get current environment name."""
        return self._environment

    def load(self) -> AppConfig:
        """
        Load configuration based on environment.

        Loads default configuration, merges environment-specific overrides,
        and applies environment variable substitutions.

        Returns:
            Complete application configuration.

        Raises:
            ValueError: If configuration validation fails.
        """
        if self._config is not None:
            return self._config

        # Load default configuration
        default_config = self._load_json(self._config_dir / "default.json")

        # Load environment-specific configuration
        env_config_path = self._config_dir / "environments" / f"{self._environment}.json"
        env_config = self._load_json(env_config_path) if env_config_path.exists() else {}

        # Merge configurations
        merged_config = self._deep_merge(default_config, env_config)

        # Apply environment variable substitutions
        merged_config = self._apply_env_substitutions(merged_config)

        # Validate and create config
        self._config = AppConfig(**merged_config)

        # Validate configuration
        self._validate_config(self._config)

        return self._config

    def get(self) -> AppConfig:
        """
        Get current configuration.

        Loads configuration if not already loaded.

        Returns:
            Application configuration.
        """
        if self._config is None:
            return self.load()
        return self._config

    def get_value(self, path: str) -> Any:
        """
        Get a specific configuration value by dot-separated path.

        Args:
            path: Dot-separated path (e.g., 'server.port').

        Returns:
            Configuration value or None if not found.
        """
        config = self.get()
        return self._get_nested_value(config.model_dump(), path)

    def reload(self) -> AppConfig:
        """
        Reload configuration.

        Clears cached configuration and reloads from files.

        Returns:
            Reloaded application configuration.
        """
        self._config = None
        return self.load()

    def is_production(self) -> bool:
        """Check if running in production environment."""
        return self._environment == "production"

    def is_development(self) -> bool:
        """Check if running in development environment."""
        return self._environment == "development"

    def is_test(self) -> bool:
        """Check if running in test environment."""
        return self._environment == "test"

    def _load_json(self, file_path: Path) -> dict[str, Any]:
        """
        Load JSON file.

        Args:
            file_path: Path to JSON file.

        Returns:
            Parsed JSON as dictionary.
        """
        try:
            with open(file_path, encoding="utf-8") as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError) as e:
            # Log error but return empty dict to allow defaults
            print(f"Warning: Failed to load config file {file_path}: {e}")
            return {}

    def _deep_merge(
        self, target: dict[str, Any], source: dict[str, Any]
    ) -> dict[str, Any]:
        """
        Deep merge two dictionaries.

        Args:
            target: Base dictionary.
            source: Dictionary to merge into target.

        Returns:
            Merged dictionary.
        """
        result = target.copy()

        for key, value in source.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = self._deep_merge(result[key], value)
            else:
                result[key] = value

        return result

    def _apply_env_substitutions(self, config: dict[str, Any]) -> dict[str, Any]:
        """
        Apply environment variable substitutions.

        Replaces ${VAR_NAME} or ${VAR_NAME:-default} patterns with
        environment variable values.

        Args:
            config: Configuration dictionary.

        Returns:
            Configuration with substitutions applied.
        """
        result = json.loads(json.dumps(config))  # Deep copy
        return self._replace_vars(result)

    def _replace_vars(self, obj: Any) -> Any:
        """
        Recursively replace environment variable patterns.

        Args:
            obj: Object to process.

        Returns:
            Object with substitutions applied.
        """
        if isinstance(obj, str):
            # Pattern: ${VAR_NAME} or ${VAR_NAME:-default}
            pattern = r"\${([^}]+)}"

            def replacer(match: re.Match) -> str:
                var_expr = match.group(1)
                if ":-" in var_expr:
                    var_name, default_value = var_expr.split(":-", 1)
                else:
                    var_name = var_expr
                    default_value = match.group(0)  # Keep original if no default
                return os.getenv(var_name, default_value)

            return re.sub(pattern, replacer, obj)
        elif isinstance(obj, dict):
            return {k: self._replace_vars(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._replace_vars(item) for item in obj]
        return obj

    def _get_nested_value(self, obj: dict[str, Any], path: str) -> Any:
        """
        Get nested value from dictionary.

        Args:
            obj: Dictionary to search.
            path: Dot-separated path.

        Returns:
            Value at path or None if not found.
        """
        keys = path.split(".")
        current = obj

        for key in keys:
            if isinstance(current, dict) and key in current:
                current = current[key]
            else:
                return None

        return current

    def _validate_config(self, config: AppConfig) -> None:
        """
        Validate configuration.

        Args:
            config: Application configuration to validate.

        Raises:
            ValueError: If validation fails.
        """
        # Required fields validation
        if not config.server.port:
            raise ValueError("Server port is required")

        if not config.database.path:
            raise ValueError("Database path is required")

        # Port range validation
        if config.server.port < 1 or config.server.port > 65535:
            raise ValueError("Server port must be between 1 and 65535")

        # Security validation for production
        if self._environment == "production":
            if config.security.auth.enabled:
                if not config.security.auth.jwt.secret:
                    raise ValueError(
                        "JWT secret is required in production when auth is enabled"
                    )
                if not config.security.auth.api_key or not config.security.auth.api_key.salt:
                    raise ValueError(
                        "API key salt is required in production when auth is enabled"
                    )


@lru_cache(maxsize=1)
def get_config_loader() -> ConfigLoader:
    """
    Get the singleton ConfigLoader instance.

    Returns:
        ConfigLoader singleton instance.
    """
    return ConfigLoader()


# Export singleton instance for convenience
config = ConfigLoader()
