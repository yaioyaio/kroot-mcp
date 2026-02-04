"""
CLI Dashboard.

Rich-based command-line dashboard for DevFlow Monitor.
Displays system status, activity logs, and metrics in a table-based format.
"""

from __future__ import annotations

import asyncio
import signal
import sys
from datetime import datetime
from typing import Any, Callable

from rich.console import Console
from rich.layout import Layout
from rich.live import Live
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from ...events.engine import EventEngine, get_event_engine
from ...events.types.base import BaseEvent, EventCategory, EventSeverity


class CLIDashboardOptions:
    """Options for CLI dashboard."""

    def __init__(
        self,
        refresh_interval: int = 5000,
        max_events: int = 50,
        compact: bool = False,
    ):
        """
        Initialize CLI dashboard options.

        Args:
            refresh_interval: Refresh interval in milliseconds.
            max_events: Maximum number of events to keep.
            compact: Whether to use compact display mode.
        """
        self.refresh_interval = refresh_interval
        self.max_events = max_events
        self.compact = compact


class CLIDashboard:
    """
    CLI Dashboard class.

    Rich-based command-line dashboard that displays system status,
    activity logs, and metrics in a terminal-friendly format.
    """

    def __init__(
        self,
        options: CLIDashboardOptions | None = None,
        event_engine: EventEngine | None = None,
    ):
        """
        Initialize CLI dashboard.

        Args:
            options: Dashboard configuration options.
            event_engine: Optional event engine instance.
        """
        self._options = options or CLIDashboardOptions()
        self._event_engine = event_engine or get_event_engine()
        self._console = Console()
        self._events: list[BaseEvent] = []
        self._is_running = False
        self._start_time = datetime.utcnow()
        self._subscription_id: str | None = None
        self._refresh_task: asyncio.Task[None] | None = None
        self._listeners: dict[str, list[Callable[..., Any]]] = {}

    def on(self, event_type: str, handler: Callable[..., Any]) -> None:
        """Register an event listener."""
        if event_type not in self._listeners:
            self._listeners[event_type] = []
        self._listeners[event_type].append(handler)

    def emit(self, event_type: str, *args: Any) -> None:
        """Emit an event to listeners."""
        if event_type in self._listeners:
            for handler in self._listeners[event_type]:
                try:
                    handler(*args)
                except Exception:
                    pass

    def start(self) -> None:
        """Start the CLI dashboard."""
        if self._is_running:
            return

        self._is_running = True
        self._start_time = datetime.utcnow()

        # Clear screen and show header
        self._console.clear()
        self._show_header()

        # Subscribe to events
        self._subscription_id = self._event_engine.subscribe(
            "*",
            self._handle_event,
        )

        # Setup exit handlers
        self._setup_exit_handlers()

        self._console.print("[green]CLI Dashboard started[/green]")
        self._console.print("[dim]Press Ctrl+C to exit[/dim]\n")

        # Run the dashboard loop
        try:
            asyncio.run(self._run_loop())
        except KeyboardInterrupt:
            self.stop()

    async def start_async(self) -> None:
        """Start the CLI dashboard asynchronously."""
        if self._is_running:
            return

        self._is_running = True
        self._start_time = datetime.utcnow()

        # Clear screen and show header
        self._console.clear()
        self._show_header()

        # Subscribe to events
        self._subscription_id = self._event_engine.subscribe(
            "*",
            self._handle_event,
        )

        self._console.print("[green]CLI Dashboard started[/green]")
        self._console.print("[dim]Press Ctrl+C to exit[/dim]\n")

        await self._run_loop()

    async def _run_loop(self) -> None:
        """Main dashboard loop."""
        refresh_seconds = self._options.refresh_interval / 1000.0

        while self._is_running:
            self._refresh()
            await asyncio.sleep(refresh_seconds)

    def stop(self) -> None:
        """Stop the CLI dashboard."""
        if not self._is_running:
            return

        self._is_running = False

        # Cancel refresh task
        if self._refresh_task and not self._refresh_task.done():
            self._refresh_task.cancel()

        # Unsubscribe from events
        if self._subscription_id:
            self._event_engine.unsubscribe(self._subscription_id)
            self._subscription_id = None

        self._console.print("\n[yellow]CLI Dashboard stopped[/yellow]")
        self.emit("stopped")

    def _handle_event(self, event: BaseEvent) -> None:
        """
        Handle incoming events.

        Args:
            event: The event to handle.
        """
        # Add to events list
        self._events.insert(0, event)

        # Keep only recent events
        max_events = self._options.max_events
        if len(self._events) > max_events:
            self._events = self._events[:max_events]

        # Show real-time event if not in compact mode
        if not self._options.compact:
            self._show_realtime_event(event)

    def _show_header(self) -> None:
        """Display the dashboard header."""
        title = Text("DevFlow Monitor CLI Dashboard", style="bold cyan")
        started = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        self._console.print(Panel(title, subtitle=f"Started: {started}"))

    def _show_realtime_event(self, event: BaseEvent) -> None:
        """
        Show a real-time event notification.

        Args:
            event: Event to display.
        """
        time_str = event.timestamp.strftime("%H:%M:%S")
        category_icon = self._get_category_icon(event.category)
        severity_style = self._get_severity_style(event.severity)

        self._console.print(
            f" [{severity_style}]{time_str}[/] {category_icon} {event.type}"
        )

    def _refresh(self) -> None:
        """Refresh the dashboard display."""
        if not self._is_running:
            return

        # Clear screen and redraw
        self._console.clear()
        self._show_header()

        # Show system status
        self._show_system_status()

        # Show recent activity
        self._show_recent_activity()

        # Show metrics
        self._show_metrics()

        # Footer
        self._console.print()
        self._console.rule()
        last_updated = datetime.utcnow().strftime("%H:%M:%S")
        self._console.print(f"[dim]Last updated: {last_updated}[/dim]")

    def _show_system_status(self) -> None:
        """Display system status panel."""
        stats = self._event_engine.get_stats()
        uptime = self._get_uptime()

        table = Table(show_header=False, box=None, padding=(0, 2))
        table.add_column("Label", style="bold")
        table.add_column("Value", style="cyan")
        table.add_column("Label", style="bold")
        table.add_column("Value", style="cyan")

        table.add_row(
            "Total Events",
            str(stats["total_events"]),
            "Subscribers",
            str(stats["subscriber_count"]),
        )
        table.add_row(
            "History Size",
            str(stats["history_size"]),
            "Uptime",
            uptime,
        )

        self._console.print()
        self._console.print(Panel(table, title="[bold blue]System Status[/]"))

    def _show_recent_activity(self) -> None:
        """Display recent activity table."""
        self._console.print()
        self._console.print("[bold yellow]Recent Activity[/]")

        if not self._events:
            self._console.print("  [dim]No recent events[/dim]")
            return

        table = Table(show_header=True, header_style="cyan")
        table.add_column("Time", width=10)
        table.add_column("Category", width=12)
        table.add_column("Severity", width=10)
        table.add_column("Event Type", width=30)

        for event in self._events[:10]:
            time_str = event.timestamp.strftime("%H:%M:%S")
            category = self._get_category_name(event.category)
            severity = self._get_severity_name(event.severity)
            severity_style = self._get_severity_style(event.severity)

            table.add_row(
                time_str,
                category,
                f"[{severity_style}]{severity}[/]",
                event.type,
            )

        self._console.print(table)

    def _show_metrics(self) -> None:
        """Display metrics tables."""
        stats = self._event_engine.get_stats()

        self._console.print()
        self._console.print("[bold green]Metrics[/]")

        # Category breakdown
        if stats["events_by_category"]:
            total = stats["total_events"] or 1
            cat_table = Table(show_header=True, header_style="green")
            cat_table.add_column("Category", width=15)
            cat_table.add_column("Count", width=10, justify="right")
            cat_table.add_column("Percentage", width=12, justify="right")

            for category, count in stats["events_by_category"].items():
                if count > 0:
                    percentage = (count / total) * 100
                    cat_table.add_row(
                        self._get_category_name(category),
                        str(count),
                        f"{percentage:.1f}%",
                    )

            self._console.print(cat_table)

        # Severity breakdown
        if stats["events_by_severity"]:
            total = stats["total_events"] or 1
            sev_table = Table(show_header=True, header_style="magenta")
            sev_table.add_column("Severity", width=15)
            sev_table.add_column("Count", width=10, justify="right")
            sev_table.add_column("Percentage", width=12, justify="right")

            for severity, count in stats["events_by_severity"].items():
                if count > 0:
                    percentage = (count / total) * 100
                    style = self._get_severity_style(severity)
                    sev_table.add_row(
                        f"[{style}]{severity}[/]",
                        str(count),
                        f"{percentage:.1f}%",
                    )

            self._console.print(sev_table)

    def _get_category_icon(self, category: EventCategory | str) -> str:
        """Get icon for event category."""
        icons = {
            EventCategory.FILE: "[blue]FILE[/]",
            EventCategory.GIT: "[green]GIT[/]",
            EventCategory.PROCESS: "[yellow]PROC[/]",
            EventCategory.API: "[cyan]API[/]",
            EventCategory.STAGE: "[magenta]STAGE[/]",
            EventCategory.METHOD: "[red]METHOD[/]",
            EventCategory.AI: "[bold cyan]AI[/]",
            EventCategory.SYSTEM: "[white]SYS[/]",
            EventCategory.BUILD: "[yellow]BUILD[/]",
            EventCategory.TEST: "[green]TEST[/]",
            "file": "[blue]FILE[/]",
            "git": "[green]GIT[/]",
            "process": "[yellow]PROC[/]",
            "api": "[cyan]API[/]",
            "stage": "[magenta]STAGE[/]",
            "method": "[red]METHOD[/]",
            "ai": "[bold cyan]AI[/]",
            "system": "[white]SYS[/]",
            "build": "[yellow]BUILD[/]",
            "test": "[green]TEST[/]",
        }
        return icons.get(category, "[white]?[/]")

    def _get_severity_style(self, severity: EventSeverity | str) -> str:
        """Get Rich style for severity."""
        styles = {
            EventSeverity.CRITICAL: "bold red",
            EventSeverity.ERROR: "red",
            EventSeverity.WARNING: "yellow",
            EventSeverity.INFO: "blue",
            EventSeverity.DEBUG: "dim",
            "critical": "bold red",
            "error": "red",
            "warning": "yellow",
            "warn": "yellow",
            "info": "blue",
            "debug": "dim",
        }
        return styles.get(severity, "white")

    def _get_category_name(self, category: EventCategory | str) -> str:
        """Get display name for category."""
        if isinstance(category, EventCategory):
            return category.value.upper()
        return str(category).upper()

    def _get_severity_name(self, severity: EventSeverity | str) -> str:
        """Get display name for severity."""
        if isinstance(severity, EventSeverity):
            return severity.value.upper()
        return str(severity).upper()

    def _get_uptime(self) -> str:
        """Get formatted uptime string."""
        delta = datetime.utcnow() - self._start_time
        total_seconds = int(delta.total_seconds())
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        seconds = total_seconds % 60

        if hours > 0:
            return f"{hours}h {minutes}m {seconds}s"
        elif minutes > 0:
            return f"{minutes}m {seconds}s"
        else:
            return f"{seconds}s"

    def _setup_exit_handlers(self) -> None:
        """Setup signal handlers for graceful exit."""
        def signal_handler(sig: int, frame: Any) -> None:
            self.stop()
            sys.exit(0)

        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

    def show_summary(self) -> None:
        """Display a summary report."""
        stats = self._event_engine.get_stats()

        self._console.print()
        self._console.print(Panel(
            Text("Dashboard Summary", style="bold cyan"),
        ))

        table = Table(show_header=False, box=None)
        table.add_column("Label", style="bold")
        table.add_column("Value", style="cyan")

        table.add_row("Events Processed", str(stats["total_events"]))
        table.add_row("Active Subscribers", str(stats["subscriber_count"]))
        table.add_row("History Size", str(stats["history_size"]))
        table.add_row(
            "Categories",
            str(len([c for c, v in stats["events_by_category"].items() if v > 0])),
        )
        table.add_row("Uptime", self._get_uptime())

        if self._events:
            last_event = self._events[0]
            table.add_row(
                "Last Event",
                last_event.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            )
            table.add_row("Event Type", last_event.type)

        self._console.print(table)

    def get_status(self) -> dict[str, Any]:
        """
        Get current dashboard status.

        Returns:
            Dictionary with dashboard status information.
        """
        return {
            "is_running": self._is_running,
            "event_count": len(self._events),
            "uptime": self._get_uptime(),
            "options": {
                "refresh_interval": self._options.refresh_interval,
                "max_events": self._options.max_events,
                "compact": self._options.compact,
            },
        }
