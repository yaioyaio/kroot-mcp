"""
Notion API Client Module.

Provides Notion API integration for pages, databases,
and blocks management.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from ..events.engine import EventEngine
from ..events.types import EventCategory, EventSeverity
from .base import APIClientConfig, BaseAPIClient


class NotionUser(BaseModel):
    """Notion user reference."""

    id: str
    object: str = "user"


class NotionCover(BaseModel):
    """Notion page/database cover."""

    type: str
    url: str | None = None


class NotionIcon(BaseModel):
    """Notion page/database icon."""

    type: str
    emoji: str | None = None
    url: str | None = None


class NotionParent(BaseModel):
    """Notion parent reference."""

    type: str
    database_id: str | None = None
    page_id: str | None = None
    workspace: bool | None = None


class NotionPage(BaseModel):
    """Notion page representation."""

    id: str
    object: str = "page"
    created_time: str
    last_edited_time: str
    created_by: NotionUser
    last_edited_by: NotionUser
    cover: NotionCover | None = None
    icon: NotionIcon | None = None
    parent: NotionParent
    archived: bool = False
    properties: dict[str, Any] = Field(default_factory=dict)
    url: str
    public_url: str | None = None


class NotionTitleText(BaseModel):
    """Notion title text content."""

    content: str


class NotionTitle(BaseModel):
    """Notion title element."""

    type: str
    text: NotionTitleText


class NotionDatabase(BaseModel):
    """Notion database representation."""

    id: str
    object: str = "database"
    created_time: str
    last_edited_time: str
    created_by: NotionUser
    last_edited_by: NotionUser
    title: list[NotionTitle] = Field(default_factory=list)
    description: list[NotionTitle] = Field(default_factory=list)
    icon: NotionIcon | None = None
    cover: NotionCover | None = None
    properties: dict[str, Any] = Field(default_factory=dict)
    parent: NotionParent
    url: str
    archived: bool = False


class NotionBlock(BaseModel):
    """Notion block representation."""

    id: str
    object: str = "block"
    type: str
    created_time: str
    last_edited_time: str
    created_by: NotionUser
    last_edited_by: NotionUser
    has_children: bool = False
    archived: bool = False
    content: dict[str, Any] = Field(default_factory=dict)


class NotionConfig(APIClientConfig):
    """Notion-specific configuration."""

    api_token: str
    version: str = "2022-06-28"
    database_id: str | None = None


class NotionClient(BaseAPIClient):
    """
    Notion API client.

    Provides methods for interacting with Notion API including
    pages, databases, and blocks management.
    """

    def __init__(
        self,
        config: NotionConfig,
        event_engine: EventEngine | None = None,
    ):
        """
        Initialize Notion client.

        Args:
            config: Notion configuration.
            event_engine: Optional event engine for event emission.
        """
        api_config = APIClientConfig(
            base_url="https://api.notion.com/v1",
            timeout=config.timeout if config.timeout else 15.0,
            max_retries=config.max_retries if config.max_retries else 3,
            retry_delay=config.retry_delay if config.retry_delay else 2.0,
            headers={
                "Authorization": f"Bearer {config.api_token}",
                "Notion-Version": config.version,
                "Content-Type": "application/json",
                **config.headers,
            },
        )

        super().__init__(api_config, event_engine)
        self.database_id = config.database_id

    def get_name(self) -> str:
        """Get client name."""
        return "NotionClient"

    async def is_healthy(self) -> bool:
        """Check if Notion API is healthy."""
        try:
            response = await self.get("/users/me")
            return response.status_code == 200
        except Exception as e:
            await self._emit_event(
                event_type="notion:health_check_failed",
                severity=EventSeverity.ERROR,
                data={"error": str(e)},
            )
            return False

    async def validate_connection(self) -> bool:
        """Validate Notion connection and credentials."""
        try:
            response = await self.get("/users/me")

            await self._emit_event(
                event_type="notion:connection_validated",
                severity=EventSeverity.INFO,
                data={
                    "user": response.data.get("name"),
                    "user_id": response.data.get("id"),
                    "type": response.data.get("type"),
                },
            )

            return response.status_code == 200
        except Exception as e:
            await self._emit_event(
                event_type="notion:connection_validation_failed",
                severity=EventSeverity.ERROR,
                data={"error": str(e)},
            )
            return False

    async def search_pages(
        self,
        query: str | None = None,
        filter_obj: dict[str, Any] | None = None,
    ) -> list[NotionPage]:
        """
        Search for pages.

        Args:
            query: Search query string.
            filter_obj: Filter object.

        Returns:
            List of matching pages.
        """
        try:
            payload: dict[str, Any] = {"page_size": 100}

            if query:
                payload["query"] = query
            if filter_obj:
                payload["filter"] = filter_obj

            response = await self.post("/search", json=payload)

            pages = [
                self._map_page(item)
                for item in response.data.get("results", [])
                if item.get("object") == "page"
            ]

            await self._emit_event(
                event_type="notion:pages_searched",
                severity=EventSeverity.INFO,
                data={
                    "query": query,
                    "page_count": len(pages),
                    "total_results": len(response.data.get("results", [])),
                },
            )

            return pages
        except Exception as e:
            await self._emit_event(
                event_type="notion:pages_search_failed",
                severity=EventSeverity.ERROR,
                data={"query": query, "error": str(e)},
            )
            raise

    async def search_databases(
        self,
        query: str | None = None,
    ) -> list[NotionDatabase]:
        """
        Search for databases.

        Args:
            query: Search query string.

        Returns:
            List of matching databases.
        """
        try:
            payload: dict[str, Any] = {
                "filter": {
                    "value": "database",
                    "property": "object",
                },
                "page_size": 100,
            }

            if query:
                payload["query"] = query

            response = await self.post("/search", json=payload)

            databases = [
                self._map_database(item)
                for item in response.data.get("results", [])
                if item.get("object") == "database"
            ]

            await self._emit_event(
                event_type="notion:databases_searched",
                severity=EventSeverity.INFO,
                data={
                    "query": query,
                    "database_count": len(databases),
                },
            )

            return databases
        except Exception as e:
            await self._emit_event(
                event_type="notion:databases_search_failed",
                severity=EventSeverity.ERROR,
                data={"query": query, "error": str(e)},
            )
            raise

    async def get_page(self, page_id: str) -> NotionPage:
        """
        Get a specific page.

        Args:
            page_id: Page ID.

        Returns:
            Notion page.
        """
        try:
            response = await self.get(f"/pages/{page_id}")

            page = self._map_page(response.data)

            await self._emit_event(
                event_type="notion:page_fetched",
                severity=EventSeverity.DEBUG,
                data={
                    "page_id": page_id,
                    "title": self._extract_page_title(response.data),
                    "last_edited": page.last_edited_time,
                },
            )

            return page
        except Exception as e:
            await self._emit_event(
                event_type="notion:page_fetch_failed",
                severity=EventSeverity.ERROR,
                data={"page_id": page_id, "error": str(e)},
            )
            raise

    async def get_database(self, database_id: str) -> NotionDatabase:
        """
        Get a specific database.

        Args:
            database_id: Database ID.

        Returns:
            Notion database.
        """
        try:
            response = await self.get(f"/databases/{database_id}")

            database = self._map_database(response.data)

            await self._emit_event(
                event_type="notion:database_fetched",
                severity=EventSeverity.DEBUG,
                data={
                    "database_id": database_id,
                    "title": self._extract_database_title(response.data),
                    "last_edited": database.last_edited_time,
                },
            )

            return database
        except Exception as e:
            await self._emit_event(
                event_type="notion:database_fetch_failed",
                severity=EventSeverity.ERROR,
                data={"database_id": database_id, "error": str(e)},
            )
            raise

    async def query_database(
        self,
        database_id: str,
        filter_obj: dict[str, Any] | None = None,
        sorts: list[dict[str, Any]] | None = None,
    ) -> list[NotionPage]:
        """
        Query a database.

        Args:
            database_id: Database ID.
            filter_obj: Filter object.
            sorts: Sort configurations.

        Returns:
            List of pages from database.
        """
        try:
            payload: dict[str, Any] = {"page_size": 100}

            if filter_obj:
                payload["filter"] = filter_obj
            if sorts:
                payload["sorts"] = sorts

            response = await self.post(f"/databases/{database_id}/query", json=payload)

            pages = [self._map_page(item) for item in response.data.get("results", [])]

            await self._emit_event(
                event_type="notion:database_queried",
                severity=EventSeverity.INFO,
                data={
                    "database_id": database_id,
                    "result_count": len(pages),
                    "has_filter": filter_obj is not None,
                    "has_sorts": sorts is not None,
                },
            )

            return pages
        except Exception as e:
            await self._emit_event(
                event_type="notion:database_query_failed",
                severity=EventSeverity.ERROR,
                data={"database_id": database_id, "error": str(e)},
            )
            raise

    async def get_page_blocks(self, page_id: str) -> list[NotionBlock]:
        """
        Get blocks from a page.

        Args:
            page_id: Page ID.

        Returns:
            List of blocks.
        """
        try:
            response = await self.get(
                f"/blocks/{page_id}/children",
                params={"page_size": 100},
            )

            blocks = [self._map_block(item) for item in response.data.get("results", [])]

            await self._emit_event(
                event_type="notion:page_blocks_fetched",
                severity=EventSeverity.DEBUG,
                data={
                    "page_id": page_id,
                    "block_count": len(blocks),
                },
            )

            return blocks
        except Exception as e:
            await self._emit_event(
                event_type="notion:page_blocks_fetch_failed",
                severity=EventSeverity.ERROR,
                data={"page_id": page_id, "error": str(e)},
            )
            raise

    async def create_page(
        self,
        parent: dict[str, str],
        properties: dict[str, Any],
        children: list[dict[str, Any]] | None = None,
    ) -> NotionPage:
        """
        Create a new page.

        Args:
            parent: Parent reference (database_id or page_id).
            properties: Page properties.
            children: Optional child blocks.

        Returns:
            Created page.
        """
        try:
            payload: dict[str, Any] = {
                "parent": parent,
                "properties": properties,
            }

            if children:
                payload["children"] = children

            response = await self.post("/pages", json=payload)

            page = self._map_page(response.data)

            await self._emit_event(
                event_type="notion:page_created",
                severity=EventSeverity.INFO,
                data={
                    "page_id": page.id,
                    "parent_type": "database" if "database_id" in parent else "page",
                    "parent_id": parent.get("database_id") or parent.get("page_id"),
                    "title": self._extract_page_title(response.data),
                },
            )

            return page
        except Exception as e:
            await self._emit_event(
                event_type="notion:page_creation_failed",
                severity=EventSeverity.ERROR,
                data={
                    "parent_type": "database" if "database_id" in parent else "page",
                    "parent_id": parent.get("database_id") or parent.get("page_id"),
                    "error": str(e),
                },
            )
            raise

    async def update_page(
        self,
        page_id: str,
        properties: dict[str, Any],
    ) -> NotionPage:
        """
        Update a page.

        Args:
            page_id: Page ID.
            properties: Properties to update.

        Returns:
            Updated page.
        """
        try:
            response = await self.patch(f"/pages/{page_id}", json={"properties": properties})

            page = self._map_page(response.data)

            await self._emit_event(
                event_type="notion:page_updated",
                severity=EventSeverity.INFO,
                data={
                    "page_id": page_id,
                    "title": self._extract_page_title(response.data),
                    "last_edited": page.last_edited_time,
                },
            )

            return page
        except Exception as e:
            await self._emit_event(
                event_type="notion:page_update_failed",
                severity=EventSeverity.ERROR,
                data={"page_id": page_id, "error": str(e)},
            )
            raise

    async def append_block(
        self,
        page_id: str,
        children: list[dict[str, Any]],
    ) -> list[NotionBlock]:
        """
        Append blocks to a page.

        Args:
            page_id: Page ID.
            children: Block children to append.

        Returns:
            Appended blocks.
        """
        try:
            response = await self.patch(
                f"/blocks/{page_id}/children",
                json={"children": children},
            )

            blocks = [self._map_block(item) for item in response.data.get("results", [])]

            await self._emit_event(
                event_type="notion:blocks_appended",
                severity=EventSeverity.INFO,
                data={
                    "page_id": page_id,
                    "block_count": len(blocks),
                },
            )

            return blocks
        except Exception as e:
            await self._emit_event(
                event_type="notion:blocks_append_failed",
                severity=EventSeverity.ERROR,
                data={"page_id": page_id, "error": str(e)},
            )
            raise

    async def get_recently_edited(self, days: int = 7) -> list[NotionPage]:
        """
        Get recently edited pages.

        Args:
            days: Number of days to look back.

        Returns:
            List of recently edited pages.
        """
        from datetime import datetime, timedelta

        since = datetime.utcnow() - timedelta(days=days)

        try:
            filter_obj = {
                "property": "object",
                "value": "page",
            }

            sorts = [
                {
                    "property": "last_edited_time",
                    "direction": "descending",
                }
            ]

            response = await self.post(
                "/search",
                json={
                    "filter": filter_obj,
                    "sort": sorts[0],
                    "page_size": 100,
                },
            )

            # Filter by date
            recent_pages = []
            for item in response.data.get("results", []):
                if item.get("object") == "page":
                    last_edited = datetime.fromisoformat(
                        item["last_edited_time"].replace("Z", "+00:00")
                    )
                    if last_edited.replace(tzinfo=None) >= since:
                        recent_pages.append(self._map_page(item))

            await self._emit_event(
                event_type="notion:recent_pages_fetched",
                severity=EventSeverity.INFO,
                data={
                    "days": days,
                    "recent_page_count": len(recent_pages),
                    "total_pages": len(response.data.get("results", [])),
                },
            )

            return recent_pages
        except Exception as e:
            await self._emit_event(
                event_type="notion:recent_pages_fetch_failed",
                severity=EventSeverity.ERROR,
                data={"days": days, "error": str(e)},
            )
            raise

    def _map_page(self, data: dict[str, Any]) -> NotionPage:
        """Map raw page data to NotionPage model."""
        return NotionPage(
            id=data["id"],
            object=data.get("object", "page"),
            created_time=data["created_time"],
            last_edited_time=data["last_edited_time"],
            created_by=NotionUser(
                id=data["created_by"]["id"],
                object=data["created_by"].get("object", "user"),
            ),
            last_edited_by=NotionUser(
                id=data["last_edited_by"]["id"],
                object=data["last_edited_by"].get("object", "user"),
            ),
            cover=NotionCover(**data["cover"]) if data.get("cover") else None,
            icon=NotionIcon(**data["icon"]) if data.get("icon") else None,
            parent=NotionParent(
                type=data["parent"]["type"],
                database_id=data["parent"].get("database_id"),
                page_id=data["parent"].get("page_id"),
                workspace=data["parent"].get("workspace"),
            ),
            archived=data.get("archived", False),
            properties=data.get("properties", {}),
            url=data["url"],
            public_url=data.get("public_url"),
        )

    def _map_database(self, data: dict[str, Any]) -> NotionDatabase:
        """Map raw database data to NotionDatabase model."""
        return NotionDatabase(
            id=data["id"],
            object=data.get("object", "database"),
            created_time=data["created_time"],
            last_edited_time=data["last_edited_time"],
            created_by=NotionUser(
                id=data["created_by"]["id"],
                object=data["created_by"].get("object", "user"),
            ),
            last_edited_by=NotionUser(
                id=data["last_edited_by"]["id"],
                object=data["last_edited_by"].get("object", "user"),
            ),
            title=[
                NotionTitle(type=t["type"], text=NotionTitleText(content=t["text"]["content"]))
                for t in data.get("title", [])
            ],
            description=[
                NotionTitle(type=d["type"], text=NotionTitleText(content=d["text"]["content"]))
                for d in data.get("description", [])
            ],
            icon=NotionIcon(**data["icon"]) if data.get("icon") else None,
            cover=NotionCover(**data["cover"]) if data.get("cover") else None,
            properties=data.get("properties", {}),
            parent=NotionParent(
                type=data["parent"]["type"],
                page_id=data["parent"].get("page_id"),
                workspace=data["parent"].get("workspace"),
            ),
            url=data["url"],
            archived=data.get("archived", False),
        )

    def _map_block(self, data: dict[str, Any]) -> NotionBlock:
        """Map raw block data to NotionBlock model."""
        block_type = data["type"]
        content = data.get(block_type, {})

        return NotionBlock(
            id=data["id"],
            object=data.get("object", "block"),
            type=block_type,
            created_time=data["created_time"],
            last_edited_time=data["last_edited_time"],
            created_by=NotionUser(
                id=data["created_by"]["id"],
                object=data["created_by"].get("object", "user"),
            ),
            last_edited_by=NotionUser(
                id=data["last_edited_by"]["id"],
                object=data["last_edited_by"].get("object", "user"),
            ),
            has_children=data.get("has_children", False),
            archived=data.get("archived", False),
            content=content,
        )

    def _extract_page_title(self, page: dict[str, Any]) -> str:
        """Extract title from page properties."""
        properties = page.get("properties", {})
        for prop in properties.values():
            if prop.get("type") == "title" and prop.get("title"):
                titles = prop["title"]
                if titles:
                    return titles[0].get("plain_text", "Untitled")
        return "Untitled"

    def _extract_database_title(self, database: dict[str, Any]) -> str:
        """Extract title from database."""
        titles = database.get("title", [])
        if titles:
            return titles[0].get("text", {}).get("content", "Untitled Database")
        return "Untitled Database"
