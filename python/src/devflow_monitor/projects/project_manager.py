"""
Project Manager for DevFlow Monitor.

Manages multiple projects including CRUD operations, project discovery,
metrics collection, and database persistence using aiosqlite.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

import aiosqlite

from ..events.engine import EventEngine
from ..storage.storage_manager import StorageManager
from ..utils.logger import Logger

from .types import (
    ProjectMetadata,
    ProjectMetrics,
    ProjectOwner,
    ProjectPaths,
    ProjectPriority,
    ProjectRole,
    ProjectSettings,
    ProjectStatus,
    ProjectType,
    RepositoryInfo,
    RepositoryStatus,
    CodeMetrics,
    ActivityMetrics,
    QualityMetrics,
    PerformanceMetrics,
    TeamMetrics,
)


@dataclass
class ProjectManagerConfig:
    """Project manager configuration."""

    db_path: str | None = None
    auto_discovery: bool = True
    search_paths: list[str] | None = None
    default_settings: dict[str, Any] | None = None
    metrics_interval: int = 60000  # milliseconds
    analysis_interval: int = 300000  # milliseconds
    max_concurrent_analysis: int = 3

    def __post_init__(self) -> None:
        """Initialize default values."""
        if self.search_paths is None:
            self.search_paths = [os.getcwd()]
        if self.default_settings is None:
            self.default_settings = {}


class ProjectManager:
    """
    Project Manager for multi-project support.

    Handles project CRUD operations, discovery, metrics collection,
    and cross-project analysis coordination.

    Example:
        config = ProjectManagerConfig(auto_discovery=True)
        manager = ProjectManager(config, event_engine, storage_manager)
        await manager.initialize()

        project = await manager.create_project(name="MyProject", path="/path/to/project")
        all_projects = await manager.get_all_projects()
    """

    def __init__(
        self,
        config: ProjectManagerConfig,
        event_engine: EventEngine,
        storage_manager: StorageManager,
    ) -> None:
        """
        Initialize project manager.

        Args:
            config: Manager configuration.
            event_engine: Event engine instance.
            storage_manager: Storage manager instance.
        """
        self._config = config
        self._event_engine = event_engine
        self._storage_manager = storage_manager
        self._logger = Logger("ProjectManager")
        self._db: aiosqlite.Connection | None = None
        self._initialized = False
        self._running_analysis: set[str] = set()

    @property
    def is_initialized(self) -> bool:
        """Check if manager is initialized."""
        return self._initialized

    async def initialize(self) -> None:
        """Initialize the project manager and database."""
        if self._initialized:
            return

        # Determine database path
        db_path = self._config.db_path
        if not db_path:
            # Use data directory
            project_root = Path(__file__).parent.parent.parent.parent
            data_dir = project_root / "data"
            data_dir.mkdir(parents=True, exist_ok=True)
            db_path = str(data_dir / "projects.db")

        # Initialize database
        self._db = await aiosqlite.connect(db_path)
        await self._initialize_database()

        self._initialized = True
        self._logger.info(f"Project manager initialized with database: {db_path}")

        # Auto-discover projects if enabled
        if self._config.auto_discovery:
            await self.discover_projects()

    async def close(self) -> None:
        """Close the project manager and release resources."""
        if not self._initialized:
            return

        # Wait for running analysis
        while self._running_analysis:
            import asyncio

            await asyncio.sleep(0.1)

        # Close database
        if self._db:
            await self._db.close()
            self._db = None

        self._initialized = False
        self._logger.info("Project manager closed")

    async def _initialize_database(self) -> None:
        """Initialize database schema."""
        if not self._db:
            return

        # Projects table
        await self._db.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                version TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                status TEXT NOT NULL,
                type TEXT NOT NULL,
                priority TEXT NOT NULL,
                tags TEXT,
                owner_data TEXT,
                settings_data TEXT,
                paths_data TEXT,
                repository_data TEXT
            )
        """)

        # Project metrics table
        await self._db.execute("""
            CREATE TABLE IF NOT EXISTS project_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                code_metrics TEXT,
                activity_metrics TEXT,
                quality_metrics TEXT,
                performance_metrics TEXT,
                team_metrics TEXT,
                FOREIGN KEY (project_id) REFERENCES projects (id)
            )
        """)

        # Project dependencies table
        await self._db.execute("""
            CREATE TABLE IF NOT EXISTS project_dependencies (
                id TEXT PRIMARY KEY,
                source_project_id TEXT NOT NULL,
                target_project_id TEXT NOT NULL,
                type TEXT NOT NULL,
                strength REAL NOT NULL,
                description TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (source_project_id) REFERENCES projects (id),
                FOREIGN KEY (target_project_id) REFERENCES projects (id)
            )
        """)

        # Cross project analysis table
        await self._db.execute("""
            CREATE TABLE IF NOT EXISTS cross_project_analysis (
                id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                projects TEXT NOT NULL,
                type TEXT NOT NULL,
                results_data TEXT,
                insights_data TEXT,
                recommendations_data TEXT
            )
        """)

        # Sync events table
        await self._db.execute("""
            CREATE TABLE IF NOT EXISTS sync_events (
                sync_id TEXT PRIMARY KEY,
                local_id INTEGER NOT NULL,
                project_id TEXT NOT NULL,
                device_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                event_data TEXT,
                sync_status TEXT NOT NULL DEFAULT 'pending',
                sync_attempts INTEGER NOT NULL DEFAULT 0,
                last_sync_error TEXT,
                synced_at TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects (id)
            )
        """)

        # Create indexes
        await self._db.execute(
            "CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (status)"
        )
        await self._db.execute(
            "CREATE INDEX IF NOT EXISTS idx_projects_type ON projects (type)"
        )
        await self._db.execute(
            "CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects (updated_at)"
        )
        await self._db.execute(
            "CREATE INDEX IF NOT EXISTS idx_project_metrics_project_id ON project_metrics (project_id)"
        )
        await self._db.execute(
            "CREATE INDEX IF NOT EXISTS idx_project_metrics_timestamp ON project_metrics (timestamp)"
        )
        await self._db.execute(
            "CREATE INDEX IF NOT EXISTS idx_dependencies_source ON project_dependencies (source_project_id)"
        )
        await self._db.execute(
            "CREATE INDEX IF NOT EXISTS idx_dependencies_target ON project_dependencies (target_project_id)"
        )
        await self._db.execute(
            "CREATE INDEX IF NOT EXISTS idx_sync_events_project_id ON sync_events (project_id)"
        )
        await self._db.execute(
            "CREATE INDEX IF NOT EXISTS idx_sync_events_status ON sync_events (sync_status)"
        )

        await self._db.commit()
        self._logger.info("Database schema initialized")

    async def create_project(
        self,
        name: str,
        path: str,
        description: str | None = None,
        project_type: ProjectType | None = None,
        status: ProjectStatus | None = None,
        priority: ProjectPriority | None = None,
        tags: list[str] | None = None,
        owner: ProjectOwner | None = None,
        settings: ProjectSettings | None = None,
    ) -> ProjectMetadata:
        """
        Create a new project.

        Args:
            name: Project name.
            path: Project root path.
            description: Optional project description.
            project_type: Project type.
            status: Project status.
            priority: Project priority.
            tags: Project tags.
            owner: Project owner information.
            settings: Project settings.

        Returns:
            Created project metadata.
        """
        if not self._initialized or not self._db:
            raise RuntimeError("Project manager not initialized")

        now = datetime.utcnow()
        project_id = str(uuid4())

        # Detect project type if not provided
        if project_type is None:
            project_type = self._detect_project_type(path)

        # Create default owner if not provided
        if owner is None:
            owner = self._get_default_owner()

        # Create paths
        paths = self._create_project_paths(path)

        # Detect repository info
        repository = self._detect_repository_info(path)

        # Create project metadata
        project = ProjectMetadata(
            id=project_id,
            name=name,
            description=description,
            version="1.0.0",
            created_at=now,
            updated_at=now,
            status=status or ProjectStatus.DEVELOPMENT,
            type=project_type,
            priority=priority or ProjectPriority.MEDIUM,
            tags=tags or [],
            owner=owner,
            settings=settings or ProjectSettings(),
            paths=paths,
            repository=repository,
        )

        # Save to database
        await self._db.execute(
            """
            INSERT INTO projects (
                id, name, description, version, created_at, updated_at,
                status, type, priority, tags, owner_data, settings_data,
                paths_data, repository_data
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                project.id,
                project.name,
                project.description,
                project.version,
                project.created_at.isoformat(),
                project.updated_at.isoformat(),
                project.status.value if isinstance(project.status, ProjectStatus) else project.status,
                project.type.value if isinstance(project.type, ProjectType) else project.type,
                project.priority.value if isinstance(project.priority, ProjectPriority) else project.priority,
                json.dumps(project.tags),
                project.owner.model_dump_json() if project.owner else None,
                project.settings.model_dump_json() if project.settings else None,
                project.paths.model_dump_json() if project.paths else None,
                project.repository.model_dump_json() if project.repository else None,
            ),
        )
        await self._db.commit()

        self._logger.info(f"Project created: {project.name} ({project.id})")
        return project

    async def get_project(self, project_id: str) -> ProjectMetadata | None:
        """
        Get project by ID.

        Args:
            project_id: Project ID.

        Returns:
            Project metadata or None if not found.
        """
        if not self._initialized or not self._db:
            raise RuntimeError("Project manager not initialized")

        async with self._db.execute(
            "SELECT * FROM projects WHERE id = ?", (project_id,)
        ) as cursor:
            row = await cursor.fetchone()
            if row:
                return self._map_row_to_project(row, cursor.description)
        return None

    async def get_all_projects(self) -> list[ProjectMetadata]:
        """
        Get all projects.

        Returns:
            List of all projects.
        """
        if not self._initialized or not self._db:
            raise RuntimeError("Project manager not initialized")

        async with self._db.execute(
            "SELECT * FROM projects ORDER BY updated_at DESC"
        ) as cursor:
            rows = await cursor.fetchall()
            return [self._map_row_to_project(row, cursor.description) for row in rows]

    async def get_projects_by_filter(
        self,
        status: ProjectStatus | None = None,
        project_type: ProjectType | None = None,
        priority: ProjectPriority | None = None,
        tags: list[str] | None = None,
        owner_id: str | None = None,
    ) -> list[ProjectMetadata]:
        """
        Get projects matching filter criteria.

        Args:
            status: Filter by status.
            project_type: Filter by type.
            priority: Filter by priority.
            tags: Filter by tags (any match).
            owner_id: Filter by owner ID.

        Returns:
            List of matching projects.
        """
        if not self._initialized or not self._db:
            raise RuntimeError("Project manager not initialized")

        query = "SELECT * FROM projects WHERE 1=1"
        params: list[Any] = []

        if status:
            query += " AND status = ?"
            params.append(status.value if isinstance(status, ProjectStatus) else status)

        if project_type:
            query += " AND type = ?"
            params.append(project_type.value if isinstance(project_type, ProjectType) else project_type)

        if priority:
            query += " AND priority = ?"
            params.append(priority.value if isinstance(priority, ProjectPriority) else priority)

        if owner_id:
            query += " AND json_extract(owner_data, '$.user_id') = ?"
            params.append(owner_id)

        query += " ORDER BY updated_at DESC"

        async with self._db.execute(query, params) as cursor:
            rows = await cursor.fetchall()
            projects = [self._map_row_to_project(row, cursor.description) for row in rows]

        # Client-side tag filtering
        if tags:
            projects = [
                p for p in projects if any(tag in p.tags for tag in tags)
            ]

        return projects

    async def update_project(
        self, project_id: str, updates: dict[str, Any]
    ) -> ProjectMetadata | None:
        """
        Update a project.

        Args:
            project_id: Project ID.
            updates: Dictionary of updates.

        Returns:
            Updated project metadata or None if not found.
        """
        if not self._initialized or not self._db:
            raise RuntimeError("Project manager not initialized")

        existing = await self.get_project(project_id)
        if not existing:
            raise ValueError(f"Project not found: {project_id}")

        # Merge updates
        updated_data = existing.model_dump()
        for key, value in updates.items():
            if key in updated_data and key not in ("id", "created_at"):
                updated_data[key] = value

        updated_data["updated_at"] = datetime.utcnow()

        # Create updated project
        updated = ProjectMetadata(**updated_data)

        # Save to database
        await self._db.execute(
            """
            UPDATE projects SET
                name = ?, description = ?, version = ?, updated_at = ?,
                status = ?, type = ?, priority = ?, tags = ?,
                owner_data = ?, settings_data = ?, paths_data = ?, repository_data = ?
            WHERE id = ?
            """,
            (
                updated.name,
                updated.description,
                updated.version,
                updated.updated_at.isoformat(),
                updated.status.value if isinstance(updated.status, ProjectStatus) else updated.status,
                updated.type.value if isinstance(updated.type, ProjectType) else updated.type,
                updated.priority.value if isinstance(updated.priority, ProjectPriority) else updated.priority,
                json.dumps(updated.tags),
                updated.owner.model_dump_json() if updated.owner else None,
                updated.settings.model_dump_json() if updated.settings else None,
                updated.paths.model_dump_json() if updated.paths else None,
                updated.repository.model_dump_json() if updated.repository else None,
                project_id,
            ),
        )
        await self._db.commit()

        self._logger.info(f"Project updated: {updated.name} ({project_id})")
        return updated

    async def delete_project(self, project_id: str) -> bool:
        """
        Delete a project.

        Args:
            project_id: Project ID.

        Returns:
            True if deleted, False if not found.
        """
        if not self._initialized or not self._db:
            raise RuntimeError("Project manager not initialized")

        existing = await self.get_project(project_id)
        if not existing:
            return False

        # Delete related data in transaction
        await self._db.execute(
            "DELETE FROM sync_events WHERE project_id = ?", (project_id,)
        )
        await self._db.execute(
            "DELETE FROM project_metrics WHERE project_id = ?", (project_id,)
        )
        await self._db.execute(
            "DELETE FROM project_dependencies WHERE source_project_id = ? OR target_project_id = ?",
            (project_id, project_id),
        )
        await self._db.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        await self._db.commit()

        self._logger.info(f"Project deleted: {existing.name} ({project_id})")
        return True

    async def discover_projects(
        self, paths: list[str] | None = None
    ) -> list[ProjectMetadata]:
        """
        Discover projects in specified paths.

        Args:
            paths: Paths to search. Uses config paths if None.

        Returns:
            List of discovered projects.
        """
        search_paths = paths or self._config.search_paths or []
        discovered: list[ProjectMetadata] = []

        for search_path in search_paths:
            try:
                projects = await self._scan_directory(search_path)
                discovered.extend(projects)
            except Exception as e:
                self._logger.error(f"Failed to scan directory {search_path}: {e}")

        self._logger.info(f"Discovered {len(discovered)} projects")
        return discovered

    async def _scan_directory(self, dir_path: str) -> list[ProjectMetadata]:
        """Scan a directory for projects."""
        projects: list[ProjectMetadata] = []
        path = Path(dir_path)

        if not path.exists():
            return projects

        resolved_path = path.resolve()

        # Project indicators
        project_indicators = [
            "package.json",
            "pom.xml",
            "Cargo.toml",
            "go.mod",
            "requirements.txt",
            "pyproject.toml",
            "composer.json",
            ".git",
            "README.md",
        ]

        has_indicator = any(
            (resolved_path / indicator).exists() for indicator in project_indicators
        )

        if has_indicator:
            project = await self._create_project_from_directory(str(resolved_path))
            if project:
                projects.append(project)

        return projects

    async def _create_project_from_directory(
        self, dir_path: str
    ) -> ProjectMetadata | None:
        """Create a project from a directory."""
        try:
            project_name = Path(dir_path).name

            # Check if project already exists
            existing_projects = await self.get_all_projects()
            for p in existing_projects:
                if p.paths.root == dir_path:
                    self._logger.debug(f"Project already exists: {dir_path}")
                    return p

            # Create new project
            return await self.create_project(
                name=project_name,
                path=dir_path,
                description=f"Auto-discovered project at {dir_path}",
            )
        except Exception as e:
            self._logger.error(f"Failed to create project from {dir_path}: {e}")
            return None

    def _detect_project_type(self, dir_path: str) -> ProjectType:
        """Detect project type from directory contents."""
        path = Path(dir_path)

        # Python project
        if (path / "pyproject.toml").exists() or (path / "requirements.txt").exists():
            if (path / "setup.py").exists() or (path / "setup.cfg").exists():
                return ProjectType.LIBRARY
            return ProjectType.DATA_PIPELINE

        # Node.js project
        package_json_path = path / "package.json"
        if package_json_path.exists():
            try:
                with open(package_json_path) as f:
                    pkg = json.load(f)
                    deps = pkg.get("dependencies", {})

                    if "react" in deps or "vue" in deps or "angular" in deps or "@angular/core" in deps:
                        return ProjectType.WEB_APPLICATION
                    if "react-native" in deps or "@ionic/react" in deps:
                        return ProjectType.MOBILE_APPLICATION
                    if "express" in deps or "fastify" in deps or "koa" in deps or "nest" in deps:
                        return ProjectType.API_SERVICE
                    if pkg.get("bin"):
                        return ProjectType.CLI_TOOL
                    return ProjectType.LIBRARY
            except (json.JSONDecodeError, OSError):
                pass

        # Java project
        if (path / "pom.xml").exists():
            return ProjectType.API_SERVICE

        # Rust project
        if (path / "Cargo.toml").exists():
            return ProjectType.CLI_TOOL

        # Go project
        if (path / "go.mod").exists():
            return ProjectType.API_SERVICE

        # Docker/Infrastructure
        if (path / "Dockerfile").exists() or (path / "docker-compose.yml").exists():
            return ProjectType.INFRASTRUCTURE

        return ProjectType.OTHER

    def _detect_repository_info(self, dir_path: str) -> RepositoryInfo | None:
        """Detect repository information."""
        git_dir = Path(dir_path) / ".git"
        if git_dir.exists():
            return RepositoryInfo(
                type="git",
                remote_url="",
                default_branch="main",
                current_branch="main",
                last_commit="",
                last_commit_time=int(datetime.utcnow().timestamp() * 1000),
                status=RepositoryStatus(),
            )
        return None

    def _get_default_owner(self) -> ProjectOwner:
        """Get default owner information."""
        username = os.environ.get("USER") or os.environ.get("USERNAME") or "unknown"
        return ProjectOwner(
            user_id="local-user",
            name=username,
            email="user@localhost",
            role=ProjectRole.OWNER,
        )

    def _create_project_paths(self, root_path: str) -> ProjectPaths:
        """Create project paths configuration."""
        path = Path(root_path)

        def filter_existing(dirs: list[str]) -> list[str]:
            return [d for d in dirs if (path / d).exists()]

        return ProjectPaths(
            root=str(path.resolve()),
            source=filter_existing(["src", "lib", "app"]),
            test=filter_existing(["test", "tests", "__tests__", "spec"]),
            docs=filter_existing(["docs", "documentation", "doc"]),
            build=filter_existing(["build", "dist", "target", "out"]),
            config=filter_existing([".", "config", "conf"]),
        )

    def _map_row_to_project(
        self, row: tuple[Any, ...], description: Any
    ) -> ProjectMetadata:
        """Map database row to project metadata."""
        columns = [col[0] for col in description]
        data = dict(zip(columns, row))

        # Parse JSON fields
        tags = json.loads(data.get("tags") or "[]")
        owner_data = json.loads(data.get("owner_data") or "{}")
        settings_data = json.loads(data.get("settings_data") or "{}")
        paths_data = json.loads(data.get("paths_data") or "{}")
        repository_data = data.get("repository_data")
        if repository_data:
            repository_data = json.loads(repository_data)

        return ProjectMetadata(
            id=data["id"],
            name=data["name"],
            description=data.get("description"),
            version=data["version"],
            created_at=datetime.fromisoformat(data["created_at"]),
            updated_at=datetime.fromisoformat(data["updated_at"]),
            status=data["status"],
            type=data["type"],
            priority=data["priority"],
            tags=tags,
            owner=ProjectOwner(**owner_data) if owner_data else self._get_default_owner(),
            settings=ProjectSettings(**settings_data) if settings_data else ProjectSettings(),
            paths=ProjectPaths(**paths_data) if paths_data else ProjectPaths(root="."),
            repository=RepositoryInfo(**repository_data) if repository_data else None,
        )

    async def collect_project_metrics(
        self, project_id: str
    ) -> ProjectMetrics | None:
        """
        Collect metrics for a project.

        Args:
            project_id: Project ID.

        Returns:
            Collected metrics or None if project not found.
        """
        if not self._initialized or not self._db:
            raise RuntimeError("Project manager not initialized")

        project = await self.get_project(project_id)
        if not project:
            return None

        # Create metrics (simplified version)
        now = datetime.utcnow()
        metrics = ProjectMetrics(
            project_id=project_id,
            timestamp=now,
            code=CodeMetrics(),
            activity=ActivityMetrics(),
            quality=QualityMetrics(),
            performance=PerformanceMetrics(),
            team=TeamMetrics(active_developers=1),
        )

        # Save to database
        await self._db.execute(
            """
            INSERT INTO project_metrics (
                project_id, timestamp, code_metrics, activity_metrics,
                quality_metrics, performance_metrics, team_metrics
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                project_id,
                metrics.timestamp.isoformat(),
                metrics.code.model_dump_json(),
                metrics.activity.model_dump_json(),
                metrics.quality.model_dump_json(),
                metrics.performance.model_dump_json(),
                metrics.team.model_dump_json(),
            ),
        )
        await self._db.commit()

        self._logger.debug(f"Metrics collected for project: {project_id}")
        return metrics

    async def get_project_metrics(
        self, project_id: str, limit: int = 100
    ) -> list[ProjectMetrics]:
        """
        Get metrics history for a project.

        Args:
            project_id: Project ID.
            limit: Maximum number of records.

        Returns:
            List of metrics records.
        """
        if not self._initialized or not self._db:
            raise RuntimeError("Project manager not initialized")

        async with self._db.execute(
            """
            SELECT project_id, timestamp, code_metrics, activity_metrics,
                   quality_metrics, performance_metrics, team_metrics
            FROM project_metrics
            WHERE project_id = ?
            ORDER BY timestamp DESC
            LIMIT ?
            """,
            (project_id, limit),
        ) as cursor:
            rows = await cursor.fetchall()
            metrics_list: list[ProjectMetrics] = []
            for row in rows:
                metrics_list.append(
                    ProjectMetrics(
                        project_id=row[0],
                        timestamp=datetime.fromisoformat(row[1]),
                        code=CodeMetrics(**json.loads(row[2] or "{}")),
                        activity=ActivityMetrics(**json.loads(row[3] or "{}")),
                        quality=QualityMetrics(**json.loads(row[4] or "{}")),
                        performance=PerformanceMetrics(**json.loads(row[5] or "{}")),
                        team=TeamMetrics(**json.loads(row[6] or "{}")),
                    )
                )
            return metrics_list

    async def get_project_stats(self) -> dict[str, Any]:
        """
        Get project statistics.

        Returns:
            Dictionary with project statistics.
        """
        projects = await self.get_all_projects()

        by_status: dict[str, int] = {}
        by_type: dict[str, int] = {}
        by_priority: dict[str, int] = {}

        # Initialize
        for status in ProjectStatus:
            by_status[status.value] = 0
        for ptype in ProjectType:
            by_type[ptype.value] = 0
        for priority in ProjectPriority:
            by_priority[priority.value] = 0

        # Count
        for project in projects:
            status_val = project.status.value if isinstance(project.status, ProjectStatus) else project.status
            type_val = project.type.value if isinstance(project.type, ProjectType) else project.type
            priority_val = project.priority.value if isinstance(project.priority, ProjectPriority) else project.priority

            by_status[status_val] = by_status.get(status_val, 0) + 1
            by_type[type_val] = by_type.get(type_val, 0) + 1
            by_priority[priority_val] = by_priority.get(priority_val, 0) + 1

        return {
            "total": len(projects),
            "by_status": by_status,
            "by_type": by_type,
            "by_priority": by_priority,
        }

    async def __aenter__(self) -> ProjectManager:
        """Async context manager entry."""
        await self.initialize()
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Async context manager exit."""
        await self.close()
