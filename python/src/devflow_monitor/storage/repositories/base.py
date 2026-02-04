"""
Base Repository Implementation.

Provides an abstract base class for all repositories with generic CRUD operations.
Uses the Repository pattern for data access abstraction.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Generic, TypeVar

from ..database import DatabaseManager

# Type variable for generic repository
T = TypeVar("T")


class OrderDirection(str, Enum):
    """Order direction for queries."""

    ASC = "ASC"
    DESC = "DESC"


@dataclass
class QueryOptions:
    """
    Query options for filtering and pagination.

    Attributes:
        limit: Maximum number of records to return.
        offset: Number of records to skip.
        order_by: Column name to order by.
        order_dir: Order direction (ASC or DESC).
        filters: Additional filter conditions.
    """

    limit: int | None = None
    offset: int | None = None
    order_by: str | None = None
    order_dir: OrderDirection = OrderDirection.ASC
    filters: dict[str, Any] = field(default_factory=dict)


class BaseRepository(ABC, Generic[T]):
    """
    Abstract base repository class with generic CRUD operations.

    All concrete repositories should inherit from this class and implement
    the abstract methods for entity-specific transformations.

    Type Parameters:
        T: The entity type this repository manages.

    Attributes:
        db: Database manager instance.
        table_name: Name of the database table.
    """

    def __init__(self, db: DatabaseManager, table_name: str) -> None:
        """
        Initialize the base repository.

        Args:
            db: Database manager instance.
            table_name: Name of the database table.
        """
        self._db = db
        self._table_name = table_name

    @property
    def db(self) -> DatabaseManager:
        """Get the database manager."""
        return self._db

    @property
    def table_name(self) -> str:
        """Get the table name."""
        return self._table_name

    @abstractmethod
    def _to_entity(self, row: dict[str, Any]) -> T:
        """
        Convert a database row to an entity.

        Args:
            row: Database row as dictionary.

        Returns:
            Entity instance.
        """
        pass

    @abstractmethod
    def _to_row(self, entity: T) -> dict[str, Any]:
        """
        Convert an entity to a database row.

        Args:
            entity: Entity instance.

        Returns:
            Row data as dictionary.
        """
        pass

    async def create(self, data: dict[str, Any] | T) -> T:
        """
        Create a new record.

        Args:
            data: Entity or dictionary with record data.

        Returns:
            Created entity with ID.
        """
        if not isinstance(data, dict):
            row_data = self._to_row(data)
        else:
            row_data = data.copy()

        # Remove id if present (auto-generated)
        row_data.pop("id", None)

        # Build INSERT statement
        keys = list(row_data.keys())
        placeholders = ", ".join(["?" for _ in keys])
        columns = ", ".join(keys)
        values = tuple(row_data[k] for k in keys)

        sql = f"INSERT INTO {self._table_name} ({columns}) VALUES ({placeholders})"

        cursor = await self._db.execute(sql, values)
        await self._db.commit()

        # Get the inserted row
        last_id = cursor.lastrowid
        return await self.find_by_id(last_id)  # type: ignore

    async def find_by_id(self, id: int) -> T | None:
        """
        Find a record by ID.

        Args:
            id: Record ID.

        Returns:
            Entity if found, None otherwise.
        """
        sql = f"SELECT * FROM {self._table_name} WHERE id = ?"
        row = await self._db.fetch_one(sql, (id,))

        if row:
            return self._to_entity(row)
        return None

    async def find_all(self, options: QueryOptions | None = None) -> list[T]:
        """
        Find all records with optional query options.

        Args:
            options: Query options for filtering and pagination.

        Returns:
            List of entities.
        """
        sql = f"SELECT * FROM {self._table_name}"
        params: list[Any] = []

        # Add WHERE clause for filters
        if options and options.filters:
            conditions = []
            for key, value in options.filters.items():
                conditions.append(f"{key} = ?")
                params.append(value)
            sql += " WHERE " + " AND ".join(conditions)

        # Add ORDER BY clause
        if options and options.order_by:
            sql += f" ORDER BY {options.order_by} {options.order_dir.value}"

        # Add LIMIT and OFFSET
        if options and options.limit:
            sql += " LIMIT ?"
            params.append(options.limit)

            if options.offset:
                sql += " OFFSET ?"
                params.append(options.offset)

        rows = await self._db.fetch_all(sql, tuple(params))
        return [self._to_entity(row) for row in rows]

    async def update(self, id: int, data: dict[str, Any]) -> T | None:
        """
        Update a record.

        Args:
            id: Record ID.
            data: Dictionary with fields to update.

        Returns:
            Updated entity if found, None otherwise.
        """
        # Remove id from data
        update_data = {k: v for k, v in data.items() if k != "id"}

        if not update_data:
            return await self.find_by_id(id)

        # Build UPDATE statement
        set_clause = ", ".join([f"{k} = ?" for k in update_data.keys()])
        values = list(update_data.values())
        values.append(id)

        sql = f"UPDATE {self._table_name} SET {set_clause} WHERE id = ?"

        cursor = await self._db.execute(sql, tuple(values))
        await self._db.commit()

        if cursor.rowcount > 0:
            return await self.find_by_id(id)
        return None

    async def delete(self, id: int) -> bool:
        """
        Delete a record.

        Args:
            id: Record ID.

        Returns:
            True if deleted, False if not found.
        """
        sql = f"DELETE FROM {self._table_name} WHERE id = ?"
        cursor = await self._db.execute(sql, (id,))
        await self._db.commit()

        return cursor.rowcount > 0

    async def count(self) -> int:
        """
        Count total records.

        Returns:
            Total record count.
        """
        sql = f"SELECT COUNT(*) as count FROM {self._table_name}"
        result = await self._db.fetch_one(sql)

        return result["count"] if result else 0

    async def find_by_criteria(
        self, criteria: dict[str, Any], options: QueryOptions | None = None
    ) -> list[T]:
        """
        Find records by criteria.

        Args:
            criteria: Filter criteria as key-value pairs.
            options: Additional query options.

        Returns:
            List of matching entities.
        """
        if not criteria:
            return await self.find_all(options)

        # Merge criteria with options filters
        merged_options = options or QueryOptions()
        merged_options.filters = {**merged_options.filters, **criteria}

        return await self.find_all(merged_options)

    async def execute_query(
        self, sql: str, params: tuple[Any, ...] | None = None
    ) -> list[dict[str, Any]]:
        """
        Execute a raw SQL query.

        Args:
            sql: SQL query string.
            params: Query parameters.

        Returns:
            List of rows as dictionaries.
        """
        return await self._db.fetch_all(sql, params or ())

    async def execute_command(
        self, sql: str, params: tuple[Any, ...] | None = None
    ) -> int:
        """
        Execute a raw SQL command (INSERT, UPDATE, DELETE).

        Args:
            sql: SQL command string.
            params: Command parameters.

        Returns:
            Number of affected rows.
        """
        cursor = await self._db.execute(sql, params or ())
        await self._db.commit()
        return cursor.rowcount

    async def exists(self, id: int) -> bool:
        """
        Check if a record exists.

        Args:
            id: Record ID.

        Returns:
            True if exists, False otherwise.
        """
        sql = f"SELECT 1 FROM {self._table_name} WHERE id = ? LIMIT 1"
        result = await self._db.fetch_one(sql, (id,))
        return result is not None

    async def delete_where(self, criteria: dict[str, Any]) -> int:
        """
        Delete records matching criteria.

        Args:
            criteria: Filter criteria as key-value pairs.

        Returns:
            Number of deleted records.
        """
        if not criteria:
            return 0

        conditions = []
        values = []
        for key, value in criteria.items():
            conditions.append(f"{key} = ?")
            values.append(value)

        sql = f"DELETE FROM {self._table_name} WHERE " + " AND ".join(conditions)
        return await self.execute_command(sql, tuple(values))
