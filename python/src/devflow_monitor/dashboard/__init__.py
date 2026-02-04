"""
Dashboard Module.

Provides CLI and TUI dashboards for DevFlow Monitor.
"""

from __future__ import annotations

import sys
from typing import Literal

import typer

from .cli.dashboard import CLIDashboard, CLIDashboardOptions
from .tui.dashboard import TUIDashboard, TUIDashboardOptions

__all__ = [
    "CLIDashboard",
    "CLIDashboardOptions",
    "TUIDashboard",
    "TUIDashboardOptions",
    "launch_dashboard",
    "create_dashboard_cli",
]


async def launch_dashboard(
    mode: Literal["tui", "cli"] = "tui",
    refresh_interval: int = 1000,
    max_events: int = 100,
    compact: bool = False,
) -> None:
    """
    Launch the DevFlow Monitor Dashboard.

    Args:
        mode: Dashboard mode ('tui' or 'cli').
        refresh_interval: Refresh interval in milliseconds.
        max_events: Maximum number of events to keep.
        compact: Whether to use compact mode (CLI only).

    Raises:
        SystemExit: If dashboard fails to start.
    """
    try:
        if mode == "tui":
            dashboard = TUIDashboard(
                options=TUIDashboardOptions(
                    title="DevFlow Monitor Dashboard",
                    refresh_interval=refresh_interval,
                    max_events=max_events,
                )
            )
            await dashboard.start_async()
        else:
            dashboard = CLIDashboard(
                options=CLIDashboardOptions(
                    refresh_interval=refresh_interval,
                    max_events=max_events,
                    compact=compact,
                )
            )
            await dashboard.start_async()
    except Exception as e:
        print(f"Failed to start dashboard: {e}", file=sys.stderr)
        sys.exit(1)


def launch_dashboard_sync(
    mode: Literal["tui", "cli"] = "tui",
    refresh_interval: int = 1000,
    max_events: int = 100,
    compact: bool = False,
) -> None:
    """
    Launch the DevFlow Monitor Dashboard synchronously.

    Args:
        mode: Dashboard mode ('tui' or 'cli').
        refresh_interval: Refresh interval in milliseconds.
        max_events: Maximum number of events to keep.
        compact: Whether to use compact mode (CLI only).

    Raises:
        SystemExit: If dashboard fails to start.
    """
    try:
        if mode == "tui":
            dashboard = TUIDashboard(
                options=TUIDashboardOptions(
                    title="DevFlow Monitor Dashboard",
                    refresh_interval=refresh_interval,
                    max_events=max_events,
                )
            )
            dashboard.start()
        else:
            dashboard = CLIDashboard(
                options=CLIDashboardOptions(
                    refresh_interval=refresh_interval,
                    max_events=max_events,
                    compact=compact,
                )
            )
            dashboard.start()
    except Exception as e:
        print(f"Failed to start dashboard: {e}", file=sys.stderr)
        sys.exit(1)


def create_dashboard_cli() -> typer.Typer:
    """
    Create the dashboard CLI application using Typer.

    Returns:
        Typer application instance.
    """
    app = typer.Typer(
        name="devflow-dashboard",
        help="DevFlow Monitor Dashboard",
        add_completion=False,
    )

    @app.command()
    def start(
        mode: str = typer.Option(
            "tui",
            "--mode", "-m",
            help="Dashboard mode (tui|cli)",
        ),
        refresh: int = typer.Option(
            1000,
            "--refresh", "-r",
            help="Refresh interval in milliseconds",
        ),
        max_events: int = typer.Option(
            100,
            "--max-events", "-e",
            help="Maximum events to keep",
        ),
        compact: bool = typer.Option(
            False,
            "--compact", "-c",
            help="Compact mode (CLI only)",
        ),
    ) -> None:
        """Start the dashboard."""
        dashboard_mode: Literal["tui", "cli"] = "tui" if mode == "tui" else "cli"
        launch_dashboard_sync(
            mode=dashboard_mode,
            refresh_interval=refresh,
            max_events=max_events,
            compact=compact,
        )

    @app.command()
    def tui(
        refresh: int = typer.Option(
            1000,
            "--refresh", "-r",
            help="Refresh interval in milliseconds",
        ),
        max_events: int = typer.Option(
            100,
            "--max-events", "-e",
            help="Maximum events to keep",
        ),
    ) -> None:
        """Start TUI dashboard."""
        launch_dashboard_sync(
            mode="tui",
            refresh_interval=refresh,
            max_events=max_events,
        )

    @app.command()
    def cli(
        refresh: int = typer.Option(
            5000,
            "--refresh", "-r",
            help="Refresh interval in milliseconds",
        ),
        max_events: int = typer.Option(
            50,
            "--max-events", "-e",
            help="Maximum events to keep",
        ),
        compact: bool = typer.Option(
            False,
            "--compact", "-c",
            help="Compact mode",
        ),
    ) -> None:
        """Start CLI dashboard."""
        launch_dashboard_sync(
            mode="cli",
            refresh_interval=refresh,
            max_events=max_events,
            compact=compact,
        )

    return app


# Create the CLI app instance
dashboard_cli = create_dashboard_cli()


# Direct execution support
if __name__ == "__main__":
    dashboard_cli()
