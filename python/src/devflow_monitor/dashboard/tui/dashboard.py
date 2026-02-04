"""
TUI Dashboard.

Textual-based terminal user interface dashboard for DevFlow Monitor.
Provides a rich, interactive dashboard with multiple panels showing
system status, activity feeds, metrics, and more.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any, Callable

from textual import on
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Container, Horizontal, Vertical
from textual.widgets import (
    DataTable,
    Footer,
    Header,
    Label,
    Static,
)

from ...events.engine import EventEngine, get_event_engine
from ...events.types.base import BaseEvent, EventCategory, EventSeverity


class TUIDashboardOptions:
    """Options for TUI dashboard."""

    def __init__(
        self,
        title: str = "DevFlow Monitor Dashboard",
        refresh_interval: int = 1000,
        max_events: int = 100,
    ):
        """
        Initialize TUI dashboard options.

        Args:
            title: Dashboard title.
            refresh_interval: Refresh interval in milliseconds.
            max_events: Maximum number of events to keep.
        """
        self.title = title
        self.refresh_interval = refresh_interval
        self.max_events = max_events


class StatusPanel(Static):
    """System status panel widget."""

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._content = "Loading..."

    def compose(self) -> ComposeResult:
        yield Label(self._content, id="status-content")

    def update_content(self, content: str) -> None:
        """Update the panel content."""
        self._content = content
        try:
            label = self.query_one("#status-content", Label)
            label.update(content)
        except Exception:
            pass


class StagePanel(Static):
    """Current stage panel widget."""

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._content = "Analyzing..."

    def compose(self) -> ComposeResult:
        yield Label(self._content, id="stage-content")

    def update_content(self, content: str) -> None:
        """Update the panel content."""
        self._content = content
        try:
            label = self.query_one("#stage-content", Label)
            label.update(content)
        except Exception:
            pass


class MetricsPanel(Static):
    """Metrics panel widget."""

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._content = "Loading metrics..."

    def compose(self) -> ComposeResult:
        yield Label(self._content, id="metrics-content")

    def update_content(self, content: str) -> None:
        """Update the panel content."""
        self._content = content
        try:
            label = self.query_one("#metrics-content", Label)
            label.update(content)
        except Exception:
            pass


class MethodologyPanel(Static):
    """Methodology status panel widget."""

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._content = "Loading..."

    def compose(self) -> ComposeResult:
        yield Label(self._content, id="methodology-content")

    def update_content(self, content: str) -> None:
        """Update the panel content."""
        self._content = content
        try:
            label = self.query_one("#methodology-content", Label)
            label.update(content)
        except Exception:
            pass


class AIPanel(Static):
    """AI usage panel widget."""

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._content = "Loading..."

    def compose(self) -> ComposeResult:
        yield Label(self._content, id="ai-content")

    def update_content(self, content: str) -> None:
        """Update the panel content."""
        self._content = content
        try:
            label = self.query_one("#ai-content", Label)
            label.update(content)
        except Exception:
            pass


class TUIDashboardApp(App[None]):
    """
    TUI Dashboard Application.

    Main Textual application for the dashboard.
    """

    CSS = """
    Screen {
        layout: grid;
        grid-size: 2 4;
        grid-gutter: 1;
    }

    #status-panel {
        column-span: 1;
        height: 100%;
        border: solid green;
        padding: 1;
    }

    #stage-panel {
        column-span: 1;
        height: 100%;
        border: solid cyan;
        padding: 1;
    }

    #activity-table {
        column-span: 1;
        row-span: 2;
        height: 100%;
        border: solid yellow;
    }

    #metrics-panel {
        column-span: 1;
        height: 100%;
        border: solid magenta;
        padding: 1;
    }

    #methodology-panel {
        column-span: 1;
        height: 100%;
        border: solid red;
        padding: 1;
    }

    #ai-panel {
        column-span: 1;
        height: 100%;
        border: solid blue;
        padding: 1;
    }

    .panel-title {
        text-style: bold;
        color: white;
    }

    DataTable {
        height: 100%;
    }
    """

    BINDINGS = [
        Binding("r", "refresh", "Refresh"),
        Binding("c", "clear", "Clear Activity"),
        Binding("h", "help", "Help"),
        Binding("q", "quit", "Quit"),
        Binding("escape", "quit", "Quit"),
    ]

    def __init__(
        self,
        options: TUIDashboardOptions | None = None,
        event_engine: EventEngine | None = None,
    ):
        """
        Initialize TUI dashboard app.

        Args:
            options: Dashboard configuration options.
            event_engine: Optional event engine instance.
        """
        super().__init__()
        self._options = options or TUIDashboardOptions()
        self._event_engine = event_engine or get_event_engine()
        self._events: list[BaseEvent] = []
        self._subscription_id: str | None = None
        self._refresh_timer: asyncio.Task[None] | None = None
        self._start_time = datetime.utcnow()
        self.title = self._options.title

    def compose(self) -> ComposeResult:
        """Compose the dashboard layout."""
        yield Header()

        yield Container(
            StatusPanel(id="status-panel"),
            StagePanel(id="stage-panel"),
            DataTable(id="activity-table"),
            MetricsPanel(id="metrics-panel"),
            MethodologyPanel(id="methodology-panel"),
            AIPanel(id="ai-panel"),
        )

        yield Footer()

    async def on_mount(self) -> None:
        """Handle mount event."""
        # Initialize activity table
        activity_table = self.query_one("#activity-table", DataTable)
        activity_table.add_columns("Time", "Category", "Severity", "Event")
        activity_table.border_title = "Activity Feed"

        # Subscribe to events
        self._subscription_id = self._event_engine.subscribe(
            "*",
            self._handle_event,
        )

        # Start refresh timer
        self._refresh_timer = asyncio.create_task(self._refresh_loop())

        # Initial refresh
        await self._refresh()

    async def on_unmount(self) -> None:
        """Handle unmount event."""
        # Cancel refresh timer
        if self._refresh_timer:
            self._refresh_timer.cancel()
            try:
                await self._refresh_timer
            except asyncio.CancelledError:
                pass

        # Unsubscribe from events
        if self._subscription_id:
            self._event_engine.unsubscribe(self._subscription_id)

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

        # Schedule UI update
        self.call_from_thread(self._update_activity_feed)

    def _update_activity_feed(self) -> None:
        """Update activity feed table."""
        try:
            activity_table = self.query_one("#activity-table", DataTable)
            activity_table.clear()

            for event in self._events[:20]:
                time_str = event.timestamp.strftime("%H:%M:%S")
                category = self._get_category_display(event.category)
                severity = self._get_severity_display(event.severity)

                activity_table.add_row(
                    time_str,
                    category,
                    severity,
                    event.type,
                )
        except Exception:
            pass

    async def _refresh_loop(self) -> None:
        """Main refresh loop."""
        refresh_seconds = self._options.refresh_interval / 1000.0

        while True:
            await self._refresh()
            await asyncio.sleep(refresh_seconds)

    async def _refresh(self) -> None:
        """Refresh all dashboard panels."""
        try:
            await self._update_status_panel()
            await self._update_stage_panel()
            await self._update_metrics_panel()
            await self._update_methodology_panel()
            await self._update_ai_panel()
        except Exception:
            pass

    async def _update_status_panel(self) -> None:
        """Update project status panel."""
        stats = self._event_engine.get_stats()
        uptime = self._get_uptime()

        content = (
            f"[bold]System Status[/bold]\n\n"
            f"Events: {stats['total_events']}\n"
            f"Subscribers: {stats['subscriber_count']}\n"
            f"History: {stats['history_size']}\n"
            f"Uptime: {uptime}"
        )

        try:
            panel = self.query_one("#status-panel", StatusPanel)
            panel.update_content(content)
        except Exception:
            pass

    async def _update_stage_panel(self) -> None:
        """Update current stage panel."""
        # This would integrate with StageAnalyzer
        content = (
            "[bold]Development Stage[/bold]\n\n"
            "Current: [green]Coding[/green]\n"
            "Progress: 75%\n"
            "Confidence: 85%\n"
            "Duration: 2h 15m"
        )

        try:
            panel = self.query_one("#stage-panel", StagePanel)
            panel.update_content(content)
        except Exception:
            pass

    async def _update_metrics_panel(self) -> None:
        """Update metrics panel."""
        stats = self._event_engine.get_stats()

        lines = ["[bold]Activity Metrics[/bold]\n"]

        # Category breakdown
        categories = stats.get("events_by_category", {})
        if categories:
            lines.append("\n[bold]By Category:[/bold]")
            for cat, count in list(categories.items())[:4]:
                if count > 0:
                    lines.append(f"  {cat}: {count}")

        content = "\n".join(lines)

        try:
            panel = self.query_one("#metrics-panel", MetricsPanel)
            panel.update_content(content)
        except Exception:
            pass

    async def _update_methodology_panel(self) -> None:
        """Update methodology status panel."""
        # This would integrate with MethodologyAnalyzer
        content = (
            "[bold]Methodology[/bold]\n\n"
            "DDD: [green]85%[/green]\n"
            "TDD: [yellow]60%[/yellow]\n"
            "BDD: [red]40%[/red]\n"
            "EDA: [green]90%[/green]"
        )

        try:
            panel = self.query_one("#methodology-panel", MethodologyPanel)
            panel.update_content(content)
        except Exception:
            pass

    async def _update_ai_panel(self) -> None:
        """Update AI usage panel."""
        # This would integrate with AIMonitor
        content = (
            "[bold]AI Tools[/bold]\n\n"
            "Claude: Active\n"
            "Copilot: 85%\n"
            "ChatGPT: Idle\n"
            "Productivity: +45%"
        )

        try:
            panel = self.query_one("#ai-panel", AIPanel)
            panel.update_content(content)
        except Exception:
            pass

    def _get_category_display(self, category: EventCategory | str) -> str:
        """Get display string for category."""
        icons = {
            EventCategory.FILE: "FILE",
            EventCategory.GIT: "GIT",
            EventCategory.PROCESS: "PROC",
            EventCategory.API: "API",
            EventCategory.STAGE: "STAGE",
            EventCategory.METHOD: "METHOD",
            EventCategory.AI: "AI",
            EventCategory.SYSTEM: "SYS",
            EventCategory.BUILD: "BUILD",
            EventCategory.TEST: "TEST",
        }
        if isinstance(category, EventCategory):
            return icons.get(category, str(category.value).upper())
        return str(category).upper()

    def _get_severity_display(self, severity: EventSeverity | str) -> str:
        """Get display string for severity."""
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

    def action_refresh(self) -> None:
        """Handle refresh action."""
        asyncio.create_task(self._refresh())

    def action_clear(self) -> None:
        """Handle clear activity action."""
        self._events.clear()
        self._update_activity_feed()

    def action_help(self) -> None:
        """Handle help action."""
        # Could show a help modal in the future
        self.notify(
            "Shortcuts: [r] Refresh | [c] Clear | [h] Help | [q] Quit",
            title="Help",
        )

    def action_quit(self) -> None:
        """Handle quit action."""
        self.exit()


class TUIDashboard:
    """
    TUI Dashboard wrapper class.

    Provides a simpler interface to the TUIDashboardApp.
    """

    def __init__(
        self,
        options: TUIDashboardOptions | None = None,
        event_engine: EventEngine | None = None,
    ):
        """
        Initialize TUI dashboard.

        Args:
            options: Dashboard configuration options.
            event_engine: Optional event engine instance.
        """
        self._options = options or TUIDashboardOptions()
        self._event_engine = event_engine or get_event_engine()
        self._app: TUIDashboardApp | None = None
        self._is_running = False
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
        """Start the TUI dashboard."""
        if self._is_running:
            return

        self._is_running = True
        self._app = TUIDashboardApp(
            options=self._options,
            event_engine=self._event_engine,
        )

        try:
            self._app.run()
        finally:
            self._is_running = False
            self.emit("stopped")

    async def start_async(self) -> None:
        """Start the TUI dashboard asynchronously."""
        if self._is_running:
            return

        self._is_running = True
        self._app = TUIDashboardApp(
            options=self._options,
            event_engine=self._event_engine,
        )

        try:
            await self._app.run_async()
        finally:
            self._is_running = False
            self.emit("stopped")

    def stop(self) -> None:
        """Stop the TUI dashboard."""
        if not self._is_running:
            return

        if self._app:
            self._app.exit()

        self._is_running = False
        self.emit("stopped")

    def get_status(self) -> dict[str, Any]:
        """
        Get current dashboard status.

        Returns:
            Dictionary with dashboard status information.
        """
        return {
            "is_running": self._is_running,
            "options": {
                "title": self._options.title,
                "refresh_interval": self._options.refresh_interval,
                "max_events": self._options.max_events,
            },
        }
