"""
Base Monitor Abstract Class.

All monitors in the system should inherit from BaseMonitor.
This module provides the common interface and functionality
for file, git, and other monitoring components.
"""

from __future__ import annotations

import asyncio
import logging
from abc import ABC, abstractmethod
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from ..events.engine import EventEngine
    from ..events.types.base import BaseEvent


class MonitorState(str, Enum):
    """Monitor state enumeration."""

    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    ERROR = "error"


class MonitorConfig(BaseModel):
    """
    Monitor configuration model.

    Attributes:
        paths: List of paths to monitor.
        ignore_patterns: Glob patterns to ignore.
        extensions: File extensions to track (empty means all).
        poll_interval: Polling interval in seconds.
        enabled: Whether the monitor is enabled.
        debug: Enable debug logging.
    """

    paths: list[str] = Field(default_factory=lambda: ["."])
    ignore_patterns: list[str] = Field(
        default_factory=lambda: [
            "**/node_modules/**",
            "**/__pycache__/**",
            "**/.git/**",
            "**/*.pyc",
            "**/.venv/**",
            "**/venv/**",
            "**/.env/**",
            "**/dist/**",
            "**/build/**",
            "**/.pytest_cache/**",
            "**/.mypy_cache/**",
            "**/.ruff_cache/**",
        ]
    )
    extensions: list[str] = Field(default_factory=list)
    poll_interval: float = 1.0
    enabled: bool = True
    debug: bool = False


class MonitorStatistics(BaseModel):
    """Monitor runtime statistics."""

    started_at: datetime | None = None
    stopped_at: datetime | None = None
    events_emitted: int = 0
    errors_count: int = 0
    last_event_at: datetime | None = None
    last_error: str | None = None


class BaseMonitor(ABC):
    """
    Base monitor abstract class.

    All monitors should extend this class and implement
    the abstract methods for starting and stopping.

    Attributes:
        name: Monitor name for identification.
        config: Monitor configuration.
        event_engine: Event engine for publishing events.
        state: Current monitor state.
    """

    def __init__(
        self,
        config: MonitorConfig | None = None,
        event_engine: "EventEngine | None" = None,
        name: str | None = None,
    ):
        """
        Initialize base monitor.

        Args:
            config: Monitor configuration.
            event_engine: Event engine for publishing events.
            name: Monitor name (defaults to class name).
        """
        self._name = name or self.__class__.__name__
        self._config = config or MonitorConfig()
        self._event_engine = event_engine
        self._state = MonitorState.STOPPED
        self._statistics = MonitorStatistics()
        self._logger = logging.getLogger(f"devflow.monitors.{self._name}")

        # Set log level based on debug config
        if self._config.debug:
            self._logger.setLevel(logging.DEBUG)

    @property
    def name(self) -> str:
        """Get monitor name."""
        return self._name

    @property
    def config(self) -> MonitorConfig:
        """Get monitor configuration."""
        return self._config

    @property
    def state(self) -> MonitorState:
        """Get current monitor state."""
        return self._state

    @property
    def is_running(self) -> bool:
        """Check if monitor is currently running."""
        return self._state == MonitorState.RUNNING

    @property
    def statistics(self) -> MonitorStatistics:
        """Get monitor statistics."""
        return self._statistics

    def set_event_engine(self, event_engine: "EventEngine") -> None:
        """
        Set the event engine.

        Args:
            event_engine: Event engine for publishing events.
        """
        self._event_engine = event_engine

    async def start(self) -> None:
        """
        Start the monitor.

        Raises:
            RuntimeError: If monitor is already running or disabled.
        """
        if self._state == MonitorState.RUNNING:
            self._log_warning("Monitor already running")
            return

        if not self._config.enabled:
            self._log_info("Monitor is disabled")
            return

        try:
            self._state = MonitorState.STARTING
            self._log_info("Starting monitor...")

            await self._on_start()

            self._state = MonitorState.RUNNING
            self._statistics.started_at = datetime.utcnow()
            self._log_info("Monitor started successfully")

        except Exception as e:
            self._state = MonitorState.ERROR
            self._statistics.errors_count += 1
            self._statistics.last_error = str(e)
            self._log_error(f"Failed to start monitor: {e}")
            raise

    async def stop(self) -> None:
        """
        Stop the monitor.

        Raises:
            RuntimeError: If monitor is not running.
        """
        if self._state not in (MonitorState.RUNNING, MonitorState.ERROR):
            self._log_warning("Monitor not running")
            return

        try:
            self._state = MonitorState.STOPPING
            self._log_info("Stopping monitor...")

            await self._on_stop()

            self._state = MonitorState.STOPPED
            self._statistics.stopped_at = datetime.utcnow()
            self._log_info("Monitor stopped successfully")

        except Exception as e:
            self._state = MonitorState.ERROR
            self._statistics.errors_count += 1
            self._statistics.last_error = str(e)
            self._log_error(f"Failed to stop monitor: {e}")
            raise

    def enable(self) -> None:
        """Enable the monitor."""
        self._config.enabled = True
        self._log_info("Monitor enabled")

    def disable(self) -> None:
        """Disable the monitor."""
        self._config.enabled = False
        self._log_info("Monitor disabled")

    async def _emit_event(self, event: "BaseEvent") -> None:
        """
        Emit an event through the event engine.

        Args:
            event: Event to emit.
        """
        if self._event_engine is None:
            self._log_warning("No event engine configured, event not emitted")
            return

        try:
            await self._event_engine.publish(event)
            self._statistics.events_emitted += 1
            self._statistics.last_event_at = datetime.utcnow()
            self._log_debug(f"Event emitted: {event.type}")

        except Exception as e:
            self._statistics.errors_count += 1
            self._statistics.last_error = str(e)
            self._log_error(f"Failed to emit event: {e}")

    def get_config(self) -> dict[str, Any]:
        """
        Get monitor configuration as dictionary.

        Returns:
            Configuration dictionary.
        """
        return {
            "name": self._name,
            "enabled": self._config.enabled,
            "paths": self._config.paths,
            "ignore_patterns": self._config.ignore_patterns,
            "extensions": self._config.extensions,
            "poll_interval": self._config.poll_interval,
        }

    def get_stats(self) -> dict[str, Any]:
        """
        Get monitor statistics as dictionary.

        Returns:
            Statistics dictionary.
        """
        return {
            "state": self._state.value,
            "is_running": self.is_running,
            "started_at": (
                self._statistics.started_at.isoformat()
                if self._statistics.started_at
                else None
            ),
            "stopped_at": (
                self._statistics.stopped_at.isoformat()
                if self._statistics.stopped_at
                else None
            ),
            "events_emitted": self._statistics.events_emitted,
            "errors_count": self._statistics.errors_count,
            "last_event_at": (
                self._statistics.last_event_at.isoformat()
                if self._statistics.last_event_at
                else None
            ),
            "last_error": self._statistics.last_error,
        }

    # Logging helpers

    def _log_debug(self, message: str, *args: Any) -> None:
        """Log debug message."""
        if self._config.debug:
            self._logger.debug(f"[{self._name}] {message}", *args)

    def _log_info(self, message: str, *args: Any) -> None:
        """Log info message."""
        self._logger.info(f"[{self._name}] {message}", *args)

    def _log_warning(self, message: str, *args: Any) -> None:
        """Log warning message."""
        self._logger.warning(f"[{self._name}] {message}", *args)

    def _log_error(self, message: str, *args: Any) -> None:
        """Log error message."""
        self._logger.error(f"[{self._name}] {message}", *args)

    # Abstract methods to be implemented by subclasses

    @abstractmethod
    async def _on_start(self) -> None:
        """
        Start monitoring implementation.

        Subclasses must implement this method to define
        the actual monitoring logic.
        """
        pass

    @abstractmethod
    async def _on_stop(self) -> None:
        """
        Stop monitoring implementation.

        Subclasses must implement this method to clean up
        resources when monitoring stops.
        """
        pass
