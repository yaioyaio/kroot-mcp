"""
Multi-Project Support System for DevFlow Monitor.

Provides comprehensive multi-project management including project CRUD,
cross-project analysis, synchronization, and portfolio views.

Example:
    from devflow_monitor.projects import (
        MultiProjectSystem,
        create_multi_project_system,
        create_default_config,
    )

    config = create_default_config()
    system = await create_multi_project_system(config)

    # Create a project
    project = await system.create_project(
        name="MyProject",
        path="/path/to/project"
    )

    # Run cross-project analysis
    analysis = await system.run_cross_analysis(
        analysis_type=AnalysisType.SIMILARITY
    )
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any
from datetime import datetime

import aiosqlite

from ..events.engine import EventEngine, get_event_engine
from ..storage.storage_manager import StorageManager, get_storage_manager
from ..utils.logger import Logger

from .types import (
    # Enums
    AnalysisType,
    ConflictResolutionStrategy,
    DependencyType,
    DevelopmentStage,
    ProjectPriority,
    ProjectRole,
    ProjectStatus,
    ProjectType,
    SyncStatus,
    # Settings models
    AnalysisFilter,
    CrossAnalyzerConfig,
    EventFilter,
    FileFilter,
    FilterSettings,
    MultiProjectSystemConfig,
    NotificationChannel,
    NotificationRule,
    NotificationSettings,
    OfflineQueueSettings,
    ProjectManagerConfig,
    ProjectOwner,
    ProjectPaths,
    ProjectSettings,
    QuietHours,
    ReportingSettings,
    ReportSchedule,
    ReportSection,
    ReportTemplate,
    RepositoryInfo,
    RepositoryStatus,
    SyncConfig,
    SyncSettings,
    # Project models
    ProjectMetadata,
    ProjectMetrics,
    CodeMetrics,
    ActivityMetrics,
    QualityMetrics,
    PerformanceMetrics,
    TeamMetrics,
    # Analysis models
    AnalysisResult,
    CrossProjectAnalysis,
    Insight,
    Recommendation,
    ActionItem,
    # Dependency models
    ProjectDependency,
    # Portfolio models
    PortfolioMetrics,
    ProjectPortfolio,
    TechStackItem,
    # Sync models
    SyncError,
    SyncEvent,
    SyncResult,
)

from .project_manager import ProjectManager
from .cross_analyzer import CrossProjectAnalyzer
from .sync_client import SyncClient, SyncClientStatus


class MultiProjectSystem:
    """
    Multi-Project System.

    Integrates project management, synchronization, and cross-project
    analysis into a unified system.

    Example:
        config = MultiProjectSystemConfig()
        system = MultiProjectSystem(config, event_engine, storage_manager)
        await system.start()

        # Create project
        project = await system.create_project("MyProject", "/path/to/project")

        # Get portfolio view
        portfolio = await system.get_portfolio_view()

        # Run analysis
        analysis = await system.run_cross_analysis()
    """

    def __init__(
        self,
        config: MultiProjectSystemConfig,
        event_engine: EventEngine,
        storage_manager: StorageManager,
    ) -> None:
        """
        Initialize multi-project system.

        Args:
            config: System configuration.
            event_engine: Event engine instance.
            storage_manager: Storage manager instance.
        """
        self._config = config
        self._event_engine = event_engine
        self._storage_manager = storage_manager
        self._logger = Logger("MultiProjectSystem")
        self._db: aiosqlite.Connection | None = None

        # Initialize components (lazy initialization in start())
        self._project_manager: ProjectManager | None = None
        self._sync_client: SyncClient | None = None
        self._cross_analyzer: CrossProjectAnalyzer | None = None

        self._is_running = False

        self._logger.info("Multi-project system created")

    @property
    def is_running(self) -> bool:
        """Check if system is running."""
        return self._is_running

    @property
    def project_manager(self) -> ProjectManager:
        """Get project manager."""
        if not self._project_manager:
            raise RuntimeError("System not started. Call start() first.")
        return self._project_manager

    @property
    def sync_client(self) -> SyncClient | None:
        """Get sync client (may be None if not configured)."""
        return self._sync_client

    @property
    def cross_analyzer(self) -> CrossProjectAnalyzer:
        """Get cross-project analyzer."""
        if not self._cross_analyzer:
            raise RuntimeError("System not started. Call start() first.")
        return self._cross_analyzer

    async def start(self) -> None:
        """Start the multi-project system."""
        if self._is_running:
            raise RuntimeError("System already running")

        try:
            self._logger.info("Starting multi-project system...")

            # Initialize database
            db_path = self._config.db_path
            if not db_path:
                project_root = Path(__file__).parent.parent.parent.parent
                data_dir = project_root / "data"
                data_dir.mkdir(parents=True, exist_ok=True)
                db_path = str(data_dir / "multi-projects.db")

            self._db = await aiosqlite.connect(db_path)

            # Initialize project manager
            pm_config = self._config.project_manager
            manager_config = ProjectManager(
                config=pm_config,
                event_engine=self._event_engine,
                storage_manager=self._storage_manager,
            )
            self._project_manager = manager_config
            await self._project_manager.initialize()

            # Initialize sync client if configured
            if self._config.sync_client and self._config.sync_client.enabled:
                self._sync_client = SyncClient(self._config.sync_client, self._db)
                await self._sync_client.start()

            # Initialize cross analyzer
            self._cross_analyzer = CrossProjectAnalyzer(self._config.cross_analyzer)

            # Setup event listeners
            self._setup_event_listeners()

            self._is_running = True
            self._logger.info("Multi-project system started")

        except Exception as e:
            self._logger.error(f"Failed to start system: {e}")
            await self.stop()
            raise

    async def stop(self) -> None:
        """Stop the multi-project system."""
        if not self._is_running:
            return

        try:
            self._logger.info("Stopping multi-project system...")

            # Stop sync client
            if self._sync_client:
                await self._sync_client.stop()
                self._sync_client = None

            # Stop project manager
            if self._project_manager:
                await self._project_manager.close()
                self._project_manager = None

            # Close database
            if self._db:
                await self._db.close()
                self._db = None

            self._cross_analyzer = None
            self._is_running = False
            self._logger.info("Multi-project system stopped")

        except Exception as e:
            self._logger.error(f"Error stopping system: {e}")
            raise

    def _setup_event_listeners(self) -> None:
        """Setup event listeners for the system."""
        # Log project events
        self._logger.debug("Event listeners configured")

    # ============ Project Operations ============

    async def create_project(
        self,
        name: str,
        path: str,
        description: str | None = None,
        project_type: ProjectType | None = None,
        tags: list[str] | None = None,
    ) -> ProjectMetadata:
        """
        Create a new project.

        Args:
            name: Project name.
            path: Project root path.
            description: Optional description.
            project_type: Optional project type.
            tags: Optional tags.

        Returns:
            Created project.
        """
        return await self.project_manager.create_project(
            name=name,
            path=path,
            description=description,
            project_type=project_type,
            tags=tags,
        )

    async def get_project(self, project_id: str) -> ProjectMetadata | None:
        """Get project by ID."""
        return await self.project_manager.get_project(project_id)

    async def list_projects(
        self,
        status: ProjectStatus | None = None,
        tags: list[str] | None = None,
    ) -> list[ProjectMetadata]:
        """
        List projects with optional filters.

        Args:
            status: Filter by status.
            tags: Filter by tags.

        Returns:
            List of matching projects.
        """
        if status or tags:
            return await self.project_manager.get_projects_by_filter(
                status=status, tags=tags
            )
        return await self.project_manager.get_all_projects()

    async def update_project(
        self, project_id: str, updates: dict[str, Any]
    ) -> ProjectMetadata | None:
        """Update a project."""
        return await self.project_manager.update_project(project_id, updates)

    async def delete_project(self, project_id: str) -> bool:
        """Delete a project."""
        return await self.project_manager.delete_project(project_id)

    async def discover_projects(
        self, paths: list[str] | None = None
    ) -> list[ProjectMetadata]:
        """Discover projects in paths."""
        return await self.project_manager.discover_projects(paths)

    # ============ Analysis Operations ============

    async def run_cross_analysis(
        self,
        project_ids: list[str] | None = None,
        analysis_type: AnalysisType = AnalysisType.SIMILARITY,
    ) -> CrossProjectAnalysis:
        """
        Run cross-project analysis.

        Args:
            project_ids: Optional list of project IDs. Uses all active if None.
            analysis_type: Type of analysis.

        Returns:
            Analysis results.
        """
        # Get target projects
        if project_ids:
            projects = []
            for pid in project_ids:
                project = await self.project_manager.get_project(pid)
                if project:
                    projects.append(project)
        else:
            projects = await self.project_manager.get_projects_by_filter(
                status=ProjectStatus.ACTIVE
            )

        if len(projects) < 2:
            raise ValueError("Analysis requires at least 2 projects")

        # Collect metrics for projects
        metrics_map: dict[str, list[ProjectMetrics]] = {}
        for project in projects:
            project_metrics = await self.project_manager.get_project_metrics(
                project.id, limit=10
            )
            metrics_map[project.id] = project_metrics

        return await self.cross_analyzer.analyze(projects, metrics_map, analysis_type)

    # ============ Sync Operations ============

    async def trigger_sync(self, force: bool = False) -> SyncResult | None:
        """
        Trigger synchronization.

        Args:
            force: Force sync even if in progress.

        Returns:
            Sync result or None if sync not configured.
        """
        if not self._sync_client:
            raise RuntimeError("Sync client not configured")
        return await self._sync_client.trigger_sync(force)

    async def update_sync_config(self, config: dict[str, Any]) -> None:
        """Update sync configuration."""
        if not self._sync_client:
            raise RuntimeError("Sync client not configured")
        await self._sync_client.update_config(config)

    # ============ Portfolio & Status ============

    async def get_portfolio_view(self) -> dict[str, Any]:
        """
        Get portfolio view of all projects.

        Returns:
            Portfolio view with projects and metrics.
        """
        projects = await self.project_manager.get_all_projects()
        stats = await self.project_manager.get_project_stats()

        # Calculate portfolio metrics
        total_code_lines = 0
        total_developers = 0
        total_quality = 0.0
        total_coverage = 0.0
        projects_with_metrics = 0

        for project in projects:
            metrics = await self.project_manager.get_project_metrics(
                project.id, limit=1
            )
            if metrics:
                latest = metrics[0]
                total_code_lines += latest.code.code_lines
                total_developers += latest.team.active_developers
                total_quality += latest.quality.code_quality
                total_coverage += latest.quality.test_coverage
                projects_with_metrics += 1

        return {
            "projects": [p.model_dump() for p in projects],
            "stats": stats,
            "metrics": {
                "total_projects": len(projects),
                "active_projects": stats.get("by_status", {}).get("active", 0),
                "total_code_lines": total_code_lines,
                "total_developers": total_developers,
                "avg_code_quality": (
                    total_quality / projects_with_metrics
                    if projects_with_metrics > 0
                    else 0.0
                ),
                "avg_test_coverage": (
                    total_coverage / projects_with_metrics
                    if projects_with_metrics > 0
                    else 0.0
                ),
            },
        }

    def get_system_health(self) -> dict[str, Any]:
        """
        Get system health status.

        Returns:
            System health information.
        """
        return {
            "running": self._is_running,
            "components": {
                "project_manager": self._project_manager is not None,
                "sync_client": self._sync_client is not None,
                "cross_analyzer": self._cross_analyzer is not None,
            },
            "sync_status": (
                self._sync_client.get_sync_status().__dict__
                if self._sync_client
                else None
            ),
            "running_analysis": (
                self._cross_analyzer.get_running_analysis()
                if self._cross_analyzer
                else []
            ),
        }

    async def get_system_stats(self) -> dict[str, Any]:
        """
        Get comprehensive system statistics.

        Returns:
            System statistics.
        """
        project_stats = await self.project_manager.get_project_stats()

        return {
            "projects": project_stats,
            "sync": (
                self._sync_client.get_sync_status().__dict__
                if self._sync_client
                else None
            ),
            "analysis": {
                "running": (
                    len(self._cross_analyzer.get_running_analysis())
                    if self._cross_analyzer
                    else 0
                ),
            },
        }

    async def search_projects(
        self,
        name: str | None = None,
        project_type: str | None = None,
        status: str | None = None,
        tags: list[str] | None = None,
        owner_id: str | None = None,
    ) -> list[ProjectMetadata]:
        """
        Search projects by various criteria.

        Args:
            name: Name filter (partial match).
            project_type: Type filter.
            status: Status filter.
            tags: Tags filter.
            owner_id: Owner ID filter.

        Returns:
            List of matching projects.
        """
        all_projects = await self.project_manager.get_all_projects()

        def matches(project: ProjectMetadata) -> bool:
            if name and name.lower() not in project.name.lower():
                return False
            if project_type:
                p_type = project.type.value if hasattr(project.type, "value") else project.type
                if p_type != project_type:
                    return False
            if status:
                p_status = project.status.value if hasattr(project.status, "value") else project.status
                if p_status != status:
                    return False
            if owner_id and project.owner.user_id != owner_id:
                return False
            if tags and not any(t in project.tags for t in tags):
                return False
            return True

        return [p for p in all_projects if matches(p)]

    async def collect_metrics(self, project_id: str | None = None) -> None:
        """
        Collect metrics for projects.

        Args:
            project_id: Specific project ID or None for all active.
        """
        if project_id:
            await self.project_manager.collect_project_metrics(project_id)
        else:
            active_projects = await self.project_manager.get_projects_by_filter(
                status=ProjectStatus.ACTIVE
            )
            for project in active_projects:
                await self.project_manager.collect_project_metrics(project.id)

    async def __aenter__(self) -> MultiProjectSystem:
        """Async context manager entry."""
        await self.start()
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Async context manager exit."""
        await self.stop()


async def create_multi_project_system(
    config: MultiProjectSystemConfig | None = None,
    event_engine: EventEngine | None = None,
    storage_manager: StorageManager | None = None,
) -> MultiProjectSystem:
    """
    Factory function to create and start a multi-project system.

    Args:
        config: System configuration.
        event_engine: Event engine instance.
        storage_manager: Storage manager instance.

    Returns:
        Started multi-project system.
    """
    if config is None:
        config = create_default_config()

    if event_engine is None:
        event_engine = get_event_engine()

    if storage_manager is None:
        storage_manager = await get_storage_manager()

    system = MultiProjectSystem(config, event_engine, storage_manager)
    await system.start()
    return system


def create_default_config(
    overrides: dict[str, Any] | None = None
) -> MultiProjectSystemConfig:
    """
    Create default system configuration.

    Args:
        overrides: Optional configuration overrides.

    Returns:
        Default configuration.
    """
    config = MultiProjectSystemConfig(
        project_manager=ProjectManagerConfig(
            auto_discovery=True,
            search_paths=["."],
            metrics_interval=60000,
            analysis_interval=300000,
            max_concurrent_analysis=2,
        ),
        cross_analyzer=CrossAnalyzerConfig(
            min_confidence=0.7,
            time_window=30,
            max_concurrent_analysis=3,
        ),
        log_level="info",
    )

    if overrides:
        for key, value in overrides.items():
            if hasattr(config, key):
                setattr(config, key, value)

    return config


# Export all public symbols
__all__ = [
    # Main classes
    "MultiProjectSystem",
    "ProjectManager",
    "CrossProjectAnalyzer",
    "SyncClient",
    # Factory functions
    "create_multi_project_system",
    "create_default_config",
    # Enums
    "AnalysisType",
    "ConflictResolutionStrategy",
    "DependencyType",
    "DevelopmentStage",
    "ProjectPriority",
    "ProjectRole",
    "ProjectStatus",
    "ProjectType",
    "SyncStatus",
    # Configuration models
    "AnalysisFilter",
    "CrossAnalyzerConfig",
    "EventFilter",
    "FileFilter",
    "FilterSettings",
    "MultiProjectSystemConfig",
    "NotificationChannel",
    "NotificationRule",
    "NotificationSettings",
    "OfflineQueueSettings",
    "ProjectManagerConfig",
    "ProjectOwner",
    "ProjectPaths",
    "ProjectSettings",
    "QuietHours",
    "ReportingSettings",
    "ReportSchedule",
    "ReportSection",
    "ReportTemplate",
    "RepositoryInfo",
    "RepositoryStatus",
    "SyncConfig",
    "SyncSettings",
    # Project models
    "ProjectMetadata",
    "ProjectMetrics",
    "CodeMetrics",
    "ActivityMetrics",
    "QualityMetrics",
    "PerformanceMetrics",
    "TeamMetrics",
    # Analysis models
    "AnalysisResult",
    "CrossProjectAnalysis",
    "Insight",
    "Recommendation",
    "ActionItem",
    # Dependency models
    "ProjectDependency",
    # Portfolio models
    "PortfolioMetrics",
    "ProjectPortfolio",
    "TechStackItem",
    # Sync models
    "SyncClientStatus",
    "SyncError",
    "SyncEvent",
    "SyncResult",
]
