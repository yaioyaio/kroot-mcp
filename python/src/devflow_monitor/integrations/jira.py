"""
Jira API Client Module.

Provides Jira Cloud API integration for issue tracking,
project management, and sprint tracking.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from ..events.engine import EventEngine
from ..events.types import EventCategory, EventSeverity
from .base import APIClientConfig, AuthConfig, AuthType, BaseAPIClient


class JiraUser(BaseModel):
    """Jira user information."""

    account_id: str
    display_name: str
    email_address: str | None = None


class JiraStatus(BaseModel):
    """Jira issue status."""

    name: str
    category: str


class JiraIssueType(BaseModel):
    """Jira issue type."""

    name: str
    icon_url: str | None = None


class JiraPriority(BaseModel):
    """Jira priority."""

    name: str
    icon_url: str | None = None


class JiraComponent(BaseModel):
    """Jira component."""

    name: str


class JiraIssue(BaseModel):
    """Jira issue representation."""

    id: str
    key: str
    summary: str
    description: str | None = None
    status: JiraStatus
    assignee: JiraUser | None = None
    reporter: JiraUser
    issue_type: JiraIssueType
    priority: JiraPriority
    created: str
    updated: str
    labels: list[str] = Field(default_factory=list)
    components: list[JiraComponent] = Field(default_factory=list)
    custom_fields: dict[str, Any] = Field(default_factory=dict)


class JiraLead(BaseModel):
    """Jira project lead."""

    account_id: str
    display_name: str


class JiraProject(BaseModel):
    """Jira project representation."""

    id: str
    key: str
    name: str
    description: str | None = None
    lead: JiraLead
    project_type_key: str
    style: str


class JiraConfig(APIClientConfig):
    """Jira-specific configuration."""

    domain: str
    project: str | None = None
    email: str | None = None
    api_token: str | None = None


class JiraClient(BaseAPIClient):
    """
    Jira API client.

    Provides methods for interacting with Jira Cloud REST API
    including issue management, project queries, and sprint tracking.
    """

    def __init__(
        self,
        config: JiraConfig,
        event_engine: EventEngine | None = None,
    ):
        """
        Initialize Jira client.

        Args:
            config: Jira configuration.
            event_engine: Optional event engine for event emission.
        """
        # Build base config
        api_config = APIClientConfig(
            base_url=f"https://{config.domain}/rest/api/3",
            timeout=config.timeout if config.timeout else 15.0,
            max_retries=config.max_retries if config.max_retries else 3,
            retry_delay=config.retry_delay if config.retry_delay else 2.0,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                **config.headers,
            },
            auth=config.auth
            if config.auth
            else (
                AuthConfig(
                    type=AuthType.BASIC,
                    username=config.email,
                    password=config.api_token,
                )
                if config.email and config.api_token
                else None
            ),
        )

        super().__init__(api_config, event_engine)
        self.domain = config.domain
        self.project = config.project

    def get_name(self) -> str:
        """Get client name."""
        return "JiraClient"

    async def is_healthy(self) -> bool:
        """Check if Jira API is healthy."""
        try:
            response = await self.get("/serverInfo")
            return response.status_code == 200
        except Exception as e:
            await self._emit_event(
                event_type="jira:health_check_failed",
                severity=EventSeverity.ERROR,
                data={
                    "domain": self.domain,
                    "error": str(e),
                },
            )
            return False

    async def validate_connection(self) -> bool:
        """Validate Jira connection and credentials."""
        try:
            response = await self.get("/myself")

            await self._emit_event(
                event_type="jira:connection_validated",
                severity=EventSeverity.INFO,
                data={
                    "domain": self.domain,
                    "user": response.data.get("displayName"),
                    "account_id": response.data.get("accountId"),
                },
            )

            return response.status_code == 200
        except Exception as e:
            await self._emit_event(
                event_type="jira:connection_validation_failed",
                severity=EventSeverity.ERROR,
                data={
                    "domain": self.domain,
                    "error": str(e),
                },
            )
            return False

    async def get_projects(self) -> list[JiraProject]:
        """
        Get all accessible Jira projects.

        Returns:
            List of Jira projects.
        """
        try:
            response = await self.get(
                "/project/search",
                params={"expand": "description,lead,projectKeys"},
            )

            projects = [
                JiraProject(
                    id=project["id"],
                    key=project["key"],
                    name=project["name"],
                    description=project.get("description"),
                    lead=JiraLead(
                        account_id=project["lead"]["accountId"],
                        display_name=project["lead"]["displayName"],
                    ),
                    project_type_key=project["projectTypeKey"],
                    style=project.get("style", "classic"),
                )
                for project in response.data.get("values", [])
            ]

            await self._emit_event(
                event_type="jira:projects_fetched",
                severity=EventSeverity.INFO,
                data={
                    "domain": self.domain,
                    "project_count": len(projects),
                },
            )

            return projects
        except Exception as e:
            await self._emit_event(
                event_type="jira:projects_fetch_failed",
                severity=EventSeverity.ERROR,
                data={
                    "domain": self.domain,
                    "error": str(e),
                },
            )
            raise

    async def get_issues(
        self,
        project_key: str | None = None,
        jql: str | None = None,
    ) -> list[JiraIssue]:
        """
        Get Jira issues.

        Args:
            project_key: Project key to filter by.
            jql: JQL query string.

        Returns:
            List of Jira issues.
        """
        target_project = project_key or self.project

        if not jql and target_project:
            jql = f"project = {target_project} ORDER BY updated DESC"
        elif not jql:
            jql = "updated >= -7d ORDER BY updated DESC"

        try:
            response = await self.get(
                "/search",
                params={
                    "jql": jql,
                    "fields": ",".join([
                        "summary",
                        "description",
                        "status",
                        "assignee",
                        "reporter",
                        "issuetype",
                        "priority",
                        "created",
                        "updated",
                        "labels",
                        "components",
                    ]),
                    "maxResults": 100,
                },
            )

            issues = [self._map_issue(issue) for issue in response.data.get("issues", [])]

            await self._emit_event(
                event_type="jira:issues_fetched",
                severity=EventSeverity.INFO,
                data={
                    "domain": self.domain,
                    "project": target_project,
                    "issue_count": len(issues),
                    "jql": jql,
                },
            )

            return issues
        except Exception as e:
            await self._emit_event(
                event_type="jira:issues_fetch_failed",
                severity=EventSeverity.ERROR,
                data={
                    "domain": self.domain,
                    "project": target_project,
                    "jql": jql,
                    "error": str(e),
                },
            )
            raise

    async def get_issue(self, issue_key: str) -> JiraIssue:
        """
        Get a specific Jira issue.

        Args:
            issue_key: Issue key (e.g., 'PROJ-123').

        Returns:
            Jira issue.
        """
        try:
            response = await self.get(
                f"/issue/{issue_key}",
                params={
                    "fields": ",".join([
                        "summary",
                        "description",
                        "status",
                        "assignee",
                        "reporter",
                        "issuetype",
                        "priority",
                        "created",
                        "updated",
                        "labels",
                        "components",
                    ]),
                },
            )

            issue = self._map_issue(response.data)

            await self._emit_event(
                event_type="jira:issue_fetched",
                severity=EventSeverity.DEBUG,
                data={
                    "domain": self.domain,
                    "issue_key": issue_key,
                    "status": issue.status.name,
                    "issue_type": issue.issue_type.name,
                },
            )

            return issue
        except Exception as e:
            await self._emit_event(
                event_type="jira:issue_fetch_failed",
                severity=EventSeverity.ERROR,
                data={
                    "domain": self.domain,
                    "issue_key": issue_key,
                    "error": str(e),
                },
            )
            raise

    async def create_issue(
        self,
        summary: str,
        description: str | None = None,
        issue_type: str = "Task",
        priority: str | None = None,
        assignee: str | None = None,
        labels: list[str] | None = None,
        components: list[str] | None = None,
    ) -> JiraIssue:
        """
        Create a new Jira issue.

        Args:
            summary: Issue summary.
            description: Issue description.
            issue_type: Issue type name.
            priority: Priority name.
            assignee: Assignee account ID.
            labels: List of labels.
            components: List of component names.

        Returns:
            Created Jira issue.

        Raises:
            ValueError: If project is not configured.
        """
        if not self.project:
            raise ValueError("Project key is required for creating issues")

        try:
            payload: dict[str, Any] = {
                "fields": {
                    "project": {"key": self.project},
                    "summary": summary,
                    "issuetype": {"name": issue_type},
                },
            }

            if description:
                payload["fields"]["description"] = description
            if priority:
                payload["fields"]["priority"] = {"name": priority}
            if assignee:
                payload["fields"]["assignee"] = {"accountId": assignee}
            if labels:
                payload["fields"]["labels"] = labels
            if components:
                payload["fields"]["components"] = [{"name": name} for name in components]

            response = await self.post("/issue", json=payload)

            await self._emit_event(
                event_type="jira:issue_created",
                severity=EventSeverity.INFO,
                data={
                    "domain": self.domain,
                    "project": self.project,
                    "issue_key": response.data.get("key"),
                    "issue_id": response.data.get("id"),
                    "summary": summary,
                },
            )

            return await self.get_issue(response.data["key"])
        except Exception as e:
            await self._emit_event(
                event_type="jira:issue_creation_failed",
                severity=EventSeverity.ERROR,
                data={
                    "domain": self.domain,
                    "project": self.project,
                    "summary": summary,
                    "error": str(e),
                },
            )
            raise

    async def update_issue(
        self,
        issue_key: str,
        fields: dict[str, Any],
    ) -> JiraIssue:
        """
        Update a Jira issue.

        Args:
            issue_key: Issue key.
            fields: Fields to update.

        Returns:
            Updated Jira issue.
        """
        try:
            await self.put(f"/issue/{issue_key}", json={"fields": fields})

            await self._emit_event(
                event_type="jira:issue_updated",
                severity=EventSeverity.INFO,
                data={
                    "domain": self.domain,
                    "issue_key": issue_key,
                    "updated_fields": list(fields.keys()),
                },
            )

            return await self.get_issue(issue_key)
        except Exception as e:
            await self._emit_event(
                event_type="jira:issue_update_failed",
                severity=EventSeverity.ERROR,
                data={
                    "domain": self.domain,
                    "issue_key": issue_key,
                    "error": str(e),
                },
            )
            raise

    async def transition_issue(
        self,
        issue_key: str,
        transition_id: str,
    ) -> None:
        """
        Transition issue to a new status.

        Args:
            issue_key: Issue key.
            transition_id: Transition ID.
        """
        try:
            await self.post(
                f"/issue/{issue_key}/transitions",
                json={"transition": {"id": transition_id}},
            )

            await self._emit_event(
                event_type="jira:issue_status_updated",
                severity=EventSeverity.INFO,
                data={
                    "domain": self.domain,
                    "issue_key": issue_key,
                    "transition_id": transition_id,
                },
            )
        except Exception as e:
            await self._emit_event(
                event_type="jira:issue_status_update_failed",
                severity=EventSeverity.ERROR,
                data={
                    "domain": self.domain,
                    "issue_key": issue_key,
                    "transition_id": transition_id,
                    "error": str(e),
                },
            )
            raise

    async def add_comment(
        self,
        issue_key: str,
        comment: str,
    ) -> dict[str, Any]:
        """
        Add a comment to an issue.

        Args:
            issue_key: Issue key.
            comment: Comment text.

        Returns:
            Comment data.
        """
        try:
            response = await self.post(
                f"/issue/{issue_key}/comment",
                json={"body": comment},
            )

            await self._emit_event(
                event_type="jira:comment_added",
                severity=EventSeverity.INFO,
                data={
                    "domain": self.domain,
                    "issue_key": issue_key,
                    "comment_id": response.data.get("id"),
                },
            )

            return response.data
        except Exception as e:
            await self._emit_event(
                event_type="jira:comment_add_failed",
                severity=EventSeverity.ERROR,
                data={
                    "domain": self.domain,
                    "issue_key": issue_key,
                    "error": str(e),
                },
            )
            raise

    async def get_sprint_issues(
        self,
        sprint_id: int,
    ) -> list[JiraIssue]:
        """
        Get issues in a sprint.

        Args:
            sprint_id: Sprint ID.

        Returns:
            List of issues in the sprint.
        """
        jql = f"sprint = {sprint_id} ORDER BY rank ASC"
        return await self.get_issues(jql=jql)

    async def get_recent_activity(
        self,
        project_key: str | None = None,
        days: int = 7,
    ) -> list[JiraIssue]:
        """
        Get recent activity in project.

        Args:
            project_key: Project key.
            days: Number of days to look back.

        Returns:
            List of recently updated issues.
        """
        target_project = project_key or self.project

        if target_project:
            jql = f"project = {target_project} AND updated >= -{days}d ORDER BY updated DESC"
        else:
            jql = f"updated >= -{days}d ORDER BY updated DESC"

        try:
            issues = await self.get_issues(jql=jql)

            await self._emit_event(
                event_type="jira:activity_fetched",
                severity=EventSeverity.INFO,
                data={
                    "domain": self.domain,
                    "project": target_project,
                    "days": days,
                    "activity_count": len(issues),
                },
            )

            return issues
        except Exception as e:
            await self._emit_event(
                event_type="jira:activity_fetch_failed",
                severity=EventSeverity.ERROR,
                data={
                    "domain": self.domain,
                    "project": target_project,
                    "days": days,
                    "error": str(e),
                },
            )
            raise

    def _map_issue(self, issue_data: dict[str, Any]) -> JiraIssue:
        """
        Map raw Jira issue data to JiraIssue model.

        Args:
            issue_data: Raw issue data from API.

        Returns:
            JiraIssue instance.
        """
        fields = issue_data.get("fields", {})

        assignee = None
        if fields.get("assignee"):
            assignee = JiraUser(
                account_id=fields["assignee"]["accountId"],
                display_name=fields["assignee"]["displayName"],
                email_address=fields["assignee"].get("emailAddress"),
            )

        reporter = JiraUser(
            account_id=fields["reporter"]["accountId"],
            display_name=fields["reporter"]["displayName"],
            email_address=fields["reporter"].get("emailAddress"),
        )

        return JiraIssue(
            id=issue_data["id"],
            key=issue_data["key"],
            summary=fields["summary"],
            description=fields.get("description"),
            status=JiraStatus(
                name=fields["status"]["name"],
                category=fields["status"]["statusCategory"]["name"],
            ),
            assignee=assignee,
            reporter=reporter,
            issue_type=JiraIssueType(
                name=fields["issuetype"]["name"],
                icon_url=fields["issuetype"].get("iconUrl"),
            ),
            priority=JiraPriority(
                name=fields["priority"]["name"],
                icon_url=fields["priority"].get("iconUrl"),
            ),
            created=fields["created"],
            updated=fields["updated"],
            labels=fields.get("labels", []),
            components=[
                JiraComponent(name=comp["name"])
                for comp in fields.get("components", [])
            ],
        )
