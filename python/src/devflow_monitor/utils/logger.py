"""
Logger Utility for DevFlow Monitor.

Provides a simple, context-aware logging wrapper around Python's
logging module with formatted output and configurable log levels.
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from enum import Enum
from typing import Any


class LogLevel(str, Enum):
    """Log level enumeration."""

    DEBUG = "debug"
    INFO = "info"
    WARN = "warn"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"

    @classmethod
    def to_python_level(cls, level: LogLevel | str) -> int:
        """
        Convert to Python logging level.

        Args:
            level: LogLevel enum or string.

        Returns:
            Python logging level integer.
        """
        level_str = level.value if isinstance(level, LogLevel) else level.lower()
        level_map = {
            "debug": logging.DEBUG,
            "info": logging.INFO,
            "warn": logging.WARNING,
            "warning": logging.WARNING,
            "error": logging.ERROR,
            "critical": logging.CRITICAL,
        }
        return level_map.get(level_str, logging.INFO)


class DevFlowFormatter(logging.Formatter):
    """Custom formatter for DevFlow logs with context support."""

    def __init__(self, context: str | None = None, colorize: bool = True) -> None:
        """
        Initialize the formatter.

        Args:
            context: Optional context string to include in logs.
            colorize: Whether to colorize output.
        """
        super().__init__()
        self._context = context
        self._colorize = colorize

        # ANSI color codes
        self._colors = {
            "DEBUG": "\033[36m",  # Cyan
            "INFO": "\033[32m",  # Green
            "WARNING": "\033[33m",  # Yellow
            "ERROR": "\033[31m",  # Red
            "CRITICAL": "\033[35m",  # Magenta
            "RESET": "\033[0m",
        }

    def format(self, record: logging.LogRecord) -> str:
        """Format the log record."""
        timestamp = datetime.now(timezone.utc).isoformat()
        level = record.levelname

        # Build context string
        context = self._context or record.name

        # Format message with args
        message = record.getMessage()

        # Add extra data if present
        extra_data = ""
        if hasattr(record, "extra_data") and record.extra_data:
            if isinstance(record.extra_data, dict):
                extra_data = " " + json.dumps(record.extra_data)
            else:
                extra_data = " " + str(record.extra_data)

        # Build log line
        prefix = f"[{timestamp}] [{level}] [{context}]"

        if self._colorize and sys.stdout.isatty():
            color = self._colors.get(level, "")
            reset = self._colors["RESET"]
            return f"{color}{prefix}{reset} {message}{extra_data}"

        return f"{prefix} {message}{extra_data}"


class Logger:
    """
    Simple logger utility for DevFlow Monitor.

    Provides context-aware logging with configurable log levels.
    Wraps Python's standard logging module.

    Example:
        logger = Logger("MyComponent")
        logger.info("Starting component")
        logger.debug("Debug details", {"key": "value"})
        logger.error("Something went wrong", exc_info=True)
    """

    def __init__(
        self,
        context: str,
        level: LogLevel | str = LogLevel.INFO,
        colorize: bool = True,
    ) -> None:
        """
        Initialize the logger.

        Args:
            context: Logger context (usually component name).
            level: Minimum log level.
            colorize: Whether to colorize console output.
        """
        self._context = context
        self._level = level if isinstance(level, LogLevel) else LogLevel(level.lower())
        self._colorize = colorize

        # Get or create logger
        self._logger = logging.getLogger(f"devflow.{context}")
        self._logger.setLevel(LogLevel.to_python_level(self._level))

        # Remove existing handlers to avoid duplicates
        self._logger.handlers.clear()

        # Add console handler with custom formatter
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(LogLevel.to_python_level(self._level))
        handler.setFormatter(DevFlowFormatter(context, colorize))
        self._logger.addHandler(handler)

        # Prevent propagation to root logger
        self._logger.propagate = False

    @property
    def context(self) -> str:
        """Get logger context."""
        return self._context

    @property
    def level(self) -> LogLevel:
        """Get current log level."""
        return self._level

    def _should_log(self, level: LogLevel) -> bool:
        """
        Check if message should be logged at given level.

        Args:
            level: Level to check.

        Returns:
            True if should log.
        """
        levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.CRITICAL]
        current_idx = levels.index(self._level) if self._level in levels else 1
        target_idx = levels.index(level) if level in levels else 1
        return target_idx >= current_idx

    def _format_args(self, *args: Any) -> str:
        """
        Format additional arguments.

        Args:
            *args: Additional arguments to format.

        Returns:
            Formatted string.
        """
        if not args:
            return ""

        formatted_parts = []
        for arg in args:
            if isinstance(arg, dict):
                formatted_parts.append(json.dumps(arg))
            elif isinstance(arg, (list, tuple)):
                formatted_parts.append(json.dumps(arg))
            else:
                formatted_parts.append(str(arg))

        return " " + " ".join(formatted_parts) if formatted_parts else ""

    def debug(self, message: str, *args: Any) -> None:
        """
        Log debug message.

        Args:
            message: Log message.
            *args: Additional arguments to include.
        """
        if self._should_log(LogLevel.DEBUG):
            formatted_args = self._format_args(*args)
            self._logger.debug(f"{message}{formatted_args}")

    def info(self, message: str, *args: Any) -> None:
        """
        Log info message.

        Args:
            message: Log message.
            *args: Additional arguments to include.
        """
        if self._should_log(LogLevel.INFO):
            formatted_args = self._format_args(*args)
            self._logger.info(f"{message}{formatted_args}")

    def warn(self, message: str, *args: Any) -> None:
        """
        Log warning message.

        Args:
            message: Log message.
            *args: Additional arguments to include.
        """
        if self._should_log(LogLevel.WARN):
            formatted_args = self._format_args(*args)
            self._logger.warning(f"{message}{formatted_args}")

    def warning(self, message: str, *args: Any) -> None:
        """
        Log warning message (alias for warn).

        Args:
            message: Log message.
            *args: Additional arguments to include.
        """
        self.warn(message, *args)

    def error(self, message: str, *args: Any, exc_info: bool = False) -> None:
        """
        Log error message.

        Args:
            message: Log message.
            *args: Additional arguments to include.
            exc_info: Whether to include exception info.
        """
        if self._should_log(LogLevel.ERROR):
            formatted_args = self._format_args(*args)
            self._logger.error(f"{message}{formatted_args}", exc_info=exc_info)

    def critical(self, message: str, *args: Any, exc_info: bool = False) -> None:
        """
        Log critical message.

        Args:
            message: Log message.
            *args: Additional arguments to include.
            exc_info: Whether to include exception info.
        """
        formatted_args = self._format_args(*args)
        self._logger.critical(f"{message}{formatted_args}", exc_info=exc_info)

    def set_level(self, level: LogLevel | str) -> None:
        """
        Set the log level.

        Args:
            level: New log level.
        """
        self._level = level if isinstance(level, LogLevel) else LogLevel(level.lower())
        python_level = LogLevel.to_python_level(self._level)
        self._logger.setLevel(python_level)
        for handler in self._logger.handlers:
            handler.setLevel(python_level)

    def with_context(self, context: str) -> Logger:
        """
        Create a child logger with extended context.

        Args:
            context: Additional context to append.

        Returns:
            New Logger instance with extended context.
        """
        return Logger(
            f"{self._context}.{context}",
            level=self._level,
            colorize=self._colorize,
        )


def get_logger(context: str, level: LogLevel | str = LogLevel.INFO) -> Logger:
    """
    Get a logger instance.

    Factory function for creating Logger instances.

    Args:
        context: Logger context.
        level: Log level.

    Returns:
        Logger instance.
    """
    return Logger(context, level)
