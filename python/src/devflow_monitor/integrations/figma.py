"""
Figma API Client Module.

Provides Figma API integration for files, projects,
comments, and design collaboration.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from ..events.engine import EventEngine
from ..events.types import EventCategory, EventSeverity
from .base import APIClientConfig, BaseAPIClient


class FigmaUser(BaseModel):
    """Figma user information."""

    id: str
    handle: str
    img_url: str | None = None


class FigmaFile(BaseModel):
    """Figma file representation."""

    key: str
    name: str
    thumbnail_url: str | None = None
    last_modified: str
    version: str | None = None
    role: str | None = None
    editor_type: str | None = None
    link_access: str | None = None


class FigmaProject(BaseModel):
    """Figma project representation."""

    id: str
    name: str
    files: list[FigmaFile] = Field(default_factory=list)


class FigmaTeam(BaseModel):
    """Figma team representation."""

    id: str
    name: str
    projects: list[FigmaProject] = Field(default_factory=list)


class FigmaClientMeta(BaseModel):
    """Figma comment client metadata."""

    x: float
    y: float
    node_id: str | None = None
    node_offset: dict[str, float] | None = None


class FigmaComment(BaseModel):
    """Figma comment representation."""

    id: str
    file_key: str
    parent_id: str | None = None
    user: FigmaUser
    created_at: str
    resolved_at: str | None = None
    message: str
    client_meta: FigmaClientMeta | None = None
    order_id: str | None = None


class FigmaFileVersion(BaseModel):
    """Figma file version representation."""

    id: str
    created_at: str
    label: str | None = None
    description: str | None = None
    user: FigmaUser
    thumbnail_url: str | None = None


class FigmaConfig(APIClientConfig):
    """Figma-specific configuration."""

    access_token: str
    file_key: str | None = None


class FigmaClient(BaseAPIClient):
    """
    Figma API client.

    Provides methods for interacting with Figma API including
    files, projects, comments, and version management.
    """

    def __init__(
        self,
        config: FigmaConfig,
        event_engine: EventEngine | None = None,
    ):
        """
        Initialize Figma client.

        Args:
            config: Figma configuration.
            event_engine: Optional event engine for event emission.
        """
        api_config = APIClientConfig(
            base_url="https://api.figma.com/v1",
            timeout=config.timeout if config.timeout else 15.0,
            max_retries=config.max_retries if config.max_retries else 3,
            retry_delay=config.retry_delay if config.retry_delay else 2.0,
            headers={
                "X-Figma-Token": config.access_token,
                "Content-Type": "application/json",
                **config.headers,
            },
        )

        super().__init__(api_config, event_engine)
        self.file_key = config.file_key

    def get_name(self) -> str:
        """Get client name."""
        return "FigmaClient"

    async def is_healthy(self) -> bool:
        """Check if Figma API is healthy."""
        try:
            response = await self.get("/me")
            return response.status_code == 200
        except Exception as e:
            await self._emit_event(
                event_type="figma:health_check_failed",
                severity=EventSeverity.ERROR,
                data={"error": str(e)},
            )
            return False

    async def validate_connection(self) -> bool:
        """Validate Figma connection and credentials."""
        try:
            response = await self.get("/me")

            await self._emit_event(
                event_type="figma:connection_validated",
                severity=EventSeverity.INFO,
                data={
                    "user": response.data.get("handle"),
                    "user_id": response.data.get("id"),
                    "email": response.data.get("email"),
                },
            )

            return response.status_code == 200
        except Exception as e:
            await self._emit_event(
                event_type="figma:connection_validation_failed",
                severity=EventSeverity.ERROR,
                data={"error": str(e)},
            )
            return False

    async def get_teams(self) -> list[FigmaTeam]:
        """
        Get user's teams.

        Returns:
            List of teams.
        """
        try:
            response = await self.get("/me")
            # Note: The /me endpoint returns user info, teams need separate call
            # This is a simplified version

            teams = [
                FigmaTeam(
                    id=team.get("id", ""),
                    name=team.get("name", ""),
                    projects=[],
                )
                for team in response.data.get("teams", [])
            ]

            await self._emit_event(
                event_type="figma:teams_fetched",
                severity=EventSeverity.INFO,
                data={"team_count": len(teams)},
            )

            return teams
        except Exception as e:
            await self._emit_event(
                event_type="figma:teams_fetch_failed",
                severity=EventSeverity.ERROR,
                data={"error": str(e)},
            )
            raise

    async def get_team_projects(self, team_id: str) -> list[FigmaProject]:
        """
        Get projects in a team.

        Args:
            team_id: Team ID.

        Returns:
            List of projects.
        """
        try:
            response = await self.get(f"/teams/{team_id}/projects")

            projects = [
                FigmaProject(
                    id=project["id"],
                    name=project["name"],
                    files=[],
                )
                for project in response.data.get("projects", [])
            ]

            await self._emit_event(
                event_type="figma:team_projects_fetched",
                severity=EventSeverity.INFO,
                data={
                    "team_id": team_id,
                    "project_count": len(projects),
                },
            )

            return projects
        except Exception as e:
            await self._emit_event(
                event_type="figma:team_projects_fetch_failed",
                severity=EventSeverity.ERROR,
                data={"team_id": team_id, "error": str(e)},
            )
            raise

    async def get_project_files(self, project_id: str) -> list[FigmaFile]:
        """
        Get files in a project.

        Args:
            project_id: Project ID.

        Returns:
            List of files.
        """
        try:
            response = await self.get(f"/projects/{project_id}/files")

            files = [
                FigmaFile(
                    key=file["key"],
                    name=file["name"],
                    thumbnail_url=file.get("thumbnail_url"),
                    last_modified=file["last_modified"],
                    version=file.get("version"),
                    role=file.get("role"),
                    editor_type=file.get("editor_type"),
                    link_access=file.get("link_access"),
                )
                for file in response.data.get("files", [])
            ]

            await self._emit_event(
                event_type="figma:project_files_fetched",
                severity=EventSeverity.INFO,
                data={
                    "project_id": project_id,
                    "file_count": len(files),
                },
            )

            return files
        except Exception as e:
            await self._emit_event(
                event_type="figma:project_files_fetch_failed",
                severity=EventSeverity.ERROR,
                data={"project_id": project_id, "error": str(e)},
            )
            raise

    async def get_file(self, file_key: str) -> dict[str, Any]:
        """
        Get a specific file.

        Args:
            file_key: File key.

        Returns:
            File data.
        """
        try:
            response = await self.get(f"/files/{file_key}")

            await self._emit_event(
                event_type="figma:file_fetched",
                severity=EventSeverity.DEBUG,
                data={
                    "file_key": file_key,
                    "name": response.data.get("name"),
                    "last_modified": response.data.get("lastModified"),
                    "version": response.data.get("version"),
                },
            )

            return response.data
        except Exception as e:
            await self._emit_event(
                event_type="figma:file_fetch_failed",
                severity=EventSeverity.ERROR,
                data={"file_key": file_key, "error": str(e)},
            )
            raise

    async def get_file_nodes(
        self,
        file_key: str,
        node_ids: list[str],
    ) -> dict[str, Any]:
        """
        Get specific nodes from a file.

        Args:
            file_key: File key.
            node_ids: List of node IDs.

        Returns:
            Node data.
        """
        try:
            response = await self.get(
                f"/files/{file_key}/nodes",
                params={"ids": ",".join(node_ids)},
            )

            await self._emit_event(
                event_type="figma:file_nodes_fetched",
                severity=EventSeverity.DEBUG,
                data={
                    "file_key": file_key,
                    "node_count": len(node_ids),
                },
            )

            return response.data
        except Exception as e:
            await self._emit_event(
                event_type="figma:file_nodes_fetch_failed",
                severity=EventSeverity.ERROR,
                data={"file_key": file_key, "error": str(e)},
            )
            raise

    async def get_file_versions(self, file_key: str) -> list[FigmaFileVersion]:
        """
        Get file versions.

        Args:
            file_key: File key.

        Returns:
            List of file versions.
        """
        try:
            response = await self.get(f"/files/{file_key}/versions")

            versions = [
                FigmaFileVersion(
                    id=version["id"],
                    created_at=version["created_at"],
                    label=version.get("label"),
                    description=version.get("description"),
                    user=FigmaUser(
                        id=version["user"]["id"],
                        handle=version["user"]["handle"],
                        img_url=version["user"].get("img_url"),
                    ),
                    thumbnail_url=version.get("thumbnail_url"),
                )
                for version in response.data.get("versions", [])
            ]

            await self._emit_event(
                event_type="figma:file_versions_fetched",
                severity=EventSeverity.INFO,
                data={
                    "file_key": file_key,
                    "version_count": len(versions),
                },
            )

            return versions
        except Exception as e:
            await self._emit_event(
                event_type="figma:file_versions_fetch_failed",
                severity=EventSeverity.ERROR,
                data={"file_key": file_key, "error": str(e)},
            )
            raise

    async def get_comments(self, file_key: str) -> list[FigmaComment]:
        """
        Get comments on a file.

        Args:
            file_key: File key.

        Returns:
            List of comments.
        """
        try:
            response = await self.get(f"/files/{file_key}/comments")

            comments = [
                FigmaComment(
                    id=comment["id"],
                    file_key=comment.get("file_key", file_key),
                    parent_id=comment.get("parent_id"),
                    user=FigmaUser(
                        id=comment["user"]["id"],
                        handle=comment["user"]["handle"],
                        img_url=comment["user"].get("img_url"),
                    ),
                    created_at=comment["created_at"],
                    resolved_at=comment.get("resolved_at"),
                    message=comment["message"],
                    client_meta=FigmaClientMeta(**comment["client_meta"])
                    if comment.get("client_meta")
                    else None,
                    order_id=comment.get("order_id"),
                )
                for comment in response.data.get("comments", [])
            ]

            unresolved_count = sum(1 for c in comments if c.resolved_at is None)

            await self._emit_event(
                event_type="figma:file_comments_fetched",
                severity=EventSeverity.INFO,
                data={
                    "file_key": file_key,
                    "comment_count": len(comments),
                    "unresolved_count": unresolved_count,
                },
            )

            return comments
        except Exception as e:
            await self._emit_event(
                event_type="figma:file_comments_fetch_failed",
                severity=EventSeverity.ERROR,
                data={"file_key": file_key, "error": str(e)},
            )
            raise

    async def post_comment(
        self,
        file_key: str,
        message: str,
        position: dict[str, Any],
    ) -> FigmaComment:
        """
        Post a comment on a file.

        Args:
            file_key: File key.
            message: Comment message.
            position: Comment position (x, y, node_id).

        Returns:
            Created comment.
        """
        try:
            response = await self.post(
                f"/files/{file_key}/comments",
                json={
                    "message": message,
                    "client_meta": position,
                },
            )

            comment_data = response.data
            comment = FigmaComment(
                id=comment_data["id"],
                file_key=file_key,
                parent_id=comment_data.get("parent_id"),
                user=FigmaUser(
                    id=comment_data["user"]["id"],
                    handle=comment_data["user"]["handle"],
                    img_url=comment_data["user"].get("img_url"),
                ),
                created_at=comment_data["created_at"],
                resolved_at=comment_data.get("resolved_at"),
                message=comment_data["message"],
                client_meta=FigmaClientMeta(**comment_data["client_meta"])
                if comment_data.get("client_meta")
                else None,
                order_id=comment_data.get("order_id"),
            )

            await self._emit_event(
                event_type="figma:comment_posted",
                severity=EventSeverity.INFO,
                data={
                    "file_key": file_key,
                    "comment_id": comment.id,
                    "message": message[:100],
                },
            )

            return comment
        except Exception as e:
            await self._emit_event(
                event_type="figma:comment_post_failed",
                severity=EventSeverity.ERROR,
                data={
                    "file_key": file_key,
                    "message": message[:100],
                    "error": str(e),
                },
            )
            raise

    async def get_recent_activity(self, days: int = 7) -> list[dict[str, Any]]:
        """
        Get recent file activity.

        Args:
            days: Number of days to look back.

        Returns:
            List of recent activities.
        """
        from datetime import datetime, timedelta

        cutoff = datetime.utcnow() - timedelta(days=days)
        activities: list[dict[str, Any]] = []

        try:
            teams = await self.get_teams()

            for team in teams:
                projects = await self.get_team_projects(team.id)

                for project in projects:
                    files = await self.get_project_files(project.id)

                    for file in files:
                        last_modified = datetime.fromisoformat(
                            file.last_modified.replace("Z", "+00:00")
                        )
                        if last_modified.replace(tzinfo=None) >= cutoff:
                            activities.append({
                                "type": "file_modified",
                                "team": team.name,
                                "project": project.name,
                                "file": file.name,
                                "file_key": file.key,
                                "last_modified": file.last_modified,
                                "version": file.version,
                            })

            # Sort by last_modified descending
            activities.sort(
                key=lambda x: x["last_modified"],
                reverse=True,
            )

            await self._emit_event(
                event_type="figma:recent_activity_fetched",
                severity=EventSeverity.INFO,
                data={
                    "days": days,
                    "activity_count": len(activities),
                    "team_count": len(teams),
                },
            )

            return activities
        except Exception as e:
            await self._emit_event(
                event_type="figma:recent_activity_fetch_failed",
                severity=EventSeverity.ERROR,
                data={"days": days, "error": str(e)},
            )
            raise
