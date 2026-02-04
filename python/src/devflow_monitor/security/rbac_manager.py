"""
RBAC Manager
Role-Based Access Control 권한 관리 시스템

This module provides role-based access control functionality including
role management, permission checking, and role assignment.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import uuid4

from .types import (
    Permission,
    PermissionAction,
    PermissionCheck,
    PermissionCheckResult,
    ReservedRoles,
    Role,
    RoleAssignmentRequest,
    SecurityEvent,
    SecurityEventType,
)


class RBACManager:
    """
    Role-Based Access Control Manager.

    Provides functionality for:
    - Role management (create, update, delete)
    - Permission checking
    - Role assignment and revocation
    - User role caching

    Example:
        >>> rbac = RBACManager()
        >>> result = await rbac.check_permission(
        ...     user_id="1",
        ...     check=PermissionCheck(resource="mcp", action=PermissionAction.READ)
        ... )
        >>> print(result.allowed)
    """

    def __init__(self) -> None:
        """Initialize the RBAC manager."""
        self._roles: dict[str, Role] = {}
        self._permissions: dict[str, Permission] = {}
        self._user_role_cache: dict[str, set[str]] = {}
        self._event_handlers: list[Any] = []

        # Initialize reserved roles
        self._initialize_reserved_roles()

    def on_security_event(self, handler: Any) -> None:
        """Register a security event handler."""
        self._event_handlers.append(handler)

    def _emit_security_event(self, event: SecurityEvent) -> None:
        """Emit a security event to all registered handlers."""
        for handler in self._event_handlers:
            try:
                handler(event)
            except Exception:
                pass

    def _log_security_event(
        self,
        event_type: SecurityEventType,
        success: bool,
        message: str,
        user_id: Optional[str] = None,
        resource: Optional[str] = None,
        action: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> None:
        """Create and emit a security event."""
        event = SecurityEvent(
            id=str(uuid4()),
            type=event_type,
            user_id=user_id,
            ip_address="unknown",
            user_agent="rbac-manager",
            resource=resource,
            action=action,
            success=success,
            message=message,
            metadata=metadata,
            timestamp=datetime.now(),
        )
        self._emit_security_event(event)

    def _initialize_reserved_roles(self) -> None:
        """Initialize reserved system roles."""
        # Admin role
        admin_role = Role(
            id=str(uuid4()),
            name=ReservedRoles.ADMIN,
            description="System Administrator with full access",
            permissions=self._create_system_permissions(),
        )

        # User role
        user_role = Role(
            id=str(uuid4()),
            name=ReservedRoles.USER,
            description="Regular user with limited access",
            permissions=self._create_user_permissions(),
        )

        # ReadOnly role
        readonly_role = Role(
            id=str(uuid4()),
            name=ReservedRoles.READONLY,
            description="Read-only access to most resources",
            permissions=self._create_readonly_permissions(),
        )

        # Service role
        service_role = Role(
            id=str(uuid4()),
            name=ReservedRoles.SERVICE,
            description="Service account with API access",
            permissions=self._create_service_permissions(),
        )

        # Store roles
        for role in [admin_role, user_role, readonly_role, service_role]:
            self._roles[role.id] = role
            for perm in role.permissions:
                self._permissions[perm.id] = perm

    def _create_system_permissions(self) -> list[Permission]:
        """Create system administrator permissions."""
        permission_defs = [
            # MCP tool permissions
            ("mcp", PermissionAction.EXECUTE),
            ("mcp", PermissionAction.ADMIN),
            # WebSocket permissions
            ("websocket", PermissionAction.ADMIN),
            ("websocket", PermissionAction.EXECUTE),
            # Dashboard permissions
            ("dashboard", PermissionAction.ADMIN),
            ("dashboard", PermissionAction.EXECUTE),
            # Metrics permissions
            ("metrics", PermissionAction.ADMIN),
            ("metrics", PermissionAction.READ),
            # Notifications permissions
            ("notifications", PermissionAction.ADMIN),
            ("notifications", PermissionAction.EXECUTE),
            # Performance permissions
            ("performance", PermissionAction.ADMIN),
            ("performance", PermissionAction.EXECUTE),
            # System management permissions
            ("system", PermissionAction.ADMIN),
            ("system", PermissionAction.READ),
            ("system", PermissionAction.UPDATE),
            ("users", PermissionAction.ADMIN),
            ("security", PermissionAction.ADMIN),
        ]

        return [
            Permission(id=str(uuid4()), resource=res, action=act)
            for res, act in permission_defs
        ]

    def _create_user_permissions(self) -> list[Permission]:
        """Create regular user permissions."""
        permission_defs = [
            # MCP tool basic permissions
            ("mcp", PermissionAction.READ),
            ("mcp", PermissionAction.EXECUTE),
            # Dashboard view permissions
            ("dashboard", PermissionAction.READ),
            ("dashboard", PermissionAction.EXECUTE),
            # Metrics view permissions
            ("metrics", PermissionAction.READ),
            # Notifications basic permissions
            ("notifications", PermissionAction.READ),
            ("notifications", PermissionAction.EXECUTE),
            # Performance monitoring permissions
            ("performance", PermissionAction.READ),
        ]

        return [
            Permission(id=str(uuid4()), resource=res, action=act)
            for res, act in permission_defs
        ]

    def _create_readonly_permissions(self) -> list[Permission]:
        """Create read-only permissions."""
        permission_defs = [
            ("mcp", PermissionAction.READ),
            ("dashboard", PermissionAction.READ),
            ("metrics", PermissionAction.READ),
            ("notifications", PermissionAction.READ),
            ("performance", PermissionAction.READ),
            ("system", PermissionAction.READ),
        ]

        return [
            Permission(id=str(uuid4()), resource=res, action=act)
            for res, act in permission_defs
        ]

    def _create_service_permissions(self) -> list[Permission]:
        """Create service account permissions."""
        permission_defs = [
            # MCP API access permissions
            ("mcp", PermissionAction.EXECUTE),
            ("mcp", PermissionAction.READ),
            # Metrics collection permissions
            ("metrics", PermissionAction.READ),
            ("metrics", PermissionAction.CREATE),
            # Notifications send permissions
            ("notifications", PermissionAction.EXECUTE),
            # Performance data collection permissions
            ("performance", PermissionAction.READ),
            ("performance", PermissionAction.CREATE),
        ]

        return [
            Permission(id=str(uuid4()), resource=res, action=act)
            for res, act in permission_defs
        ]

    def _matches_permission(
        self,
        permission: Permission,
        check: PermissionCheck,
        context: Optional[dict[str, Any]] = None,
    ) -> bool:
        """Check if a permission matches the check criteria."""
        # Resource matching (wildcard support)
        if permission.resource != check.resource and permission.resource != "*":
            return False

        # Action matching (admin allows all actions)
        if (
            permission.action != check.action
            and permission.action != PermissionAction.ADMIN
        ):
            return False

        # Conditional permissions
        if permission.conditions and check.conditions:
            return self._evaluate_conditions(
                permission.conditions, check.conditions, context
            )

        return True

    def _evaluate_conditions(
        self,
        permission_conditions: dict[str, Any],
        check_conditions: dict[str, Any],
        context: Optional[dict[str, Any]] = None,
    ) -> bool:
        """Evaluate conditional permissions."""
        for key, value in permission_conditions.items():
            if key == "owner" and context and context.get("user_id"):
                # Owner permission check
                if check_conditions.get("owner_id") != context.get("user_id"):
                    return False
            elif key == "department" and context and context.get("department"):
                # Department permission check
                if value != context.get("department"):
                    return False
            elif key == "time_range":
                # Time-based permission check
                now = datetime.now()
                start_time = datetime.fromisoformat(value.get("start", ""))
                end_time = datetime.fromisoformat(value.get("end", ""))
                if now < start_time or now > end_time:
                    return False
            elif check_conditions.get(key) != value:
                return False

        return True

    async def get_user_roles(self, user_id: str) -> list[Role]:
        """
        Get roles assigned to a user.

        Args:
            user_id: User ID

        Returns:
            List of roles assigned to the user
        """
        # Check cache first
        cached_role_ids = self._user_role_cache.get(user_id)
        if cached_role_ids:
            return [
                self._roles[role_id]
                for role_id in cached_role_ids
                if role_id in self._roles
            ]

        # Dummy user roles for testing
        dummy_user_roles = {
            "1": ["admin"],  # admin user
            "2": ["user"],  # regular user
        }

        role_names = dummy_user_roles.get(user_id, ["readonly"])
        roles = [
            role for role in self._roles.values() if role.name in role_names
        ]

        # Update cache
        role_ids = {role.id for role in roles}
        self._user_role_cache[user_id] = role_ids

        return roles

    async def check_permission(
        self,
        user_id: str,
        check: PermissionCheck,
        context: Optional[dict[str, Any]] = None,
    ) -> PermissionCheckResult:
        """
        Check if a user has a specific permission.

        Args:
            user_id: User ID
            check: Permission check criteria
            context: Optional context for conditional permissions

        Returns:
            PermissionCheckResult with allowed status and matched permissions
        """
        try:
            user_roles = await self.get_user_roles(user_id)
            matched_permissions: list[Permission] = []

            for role in user_roles:
                for permission in role.permissions:
                    if self._matches_permission(permission, check, context):
                        matched_permissions.append(permission)

            allowed = len(matched_permissions) > 0

            self._log_security_event(
                event_type=(
                    SecurityEventType.PERMISSION_GRANTED
                    if allowed
                    else SecurityEventType.PERMISSION_DENIED
                ),
                user_id=user_id,
                resource=check.resource,
                action=check.action.value,
                success=allowed,
                message=(
                    f"Permission granted for {check.resource}:{check.action.value}"
                    if allowed
                    else f"Permission denied for {check.resource}:{check.action.value}"
                ),
                metadata={
                    "check": check.model_dump(),
                    "matched_permissions": len(matched_permissions),
                },
            )

            return PermissionCheckResult(
                allowed=allowed,
                reason=(
                    f"Granted by {len(matched_permissions)} permission(s)"
                    if allowed
                    else "No matching permissions found"
                ),
                matched_permissions=matched_permissions,
            )

        except Exception as e:
            self._log_security_event(
                event_type=SecurityEventType.PERMISSION_DENIED,
                user_id=user_id,
                resource=check.resource,
                action=check.action.value,
                success=False,
                message=f"Permission check failed: {str(e)}",
            )

            return PermissionCheckResult(
                allowed=False,
                reason="Permission check failed",
                matched_permissions=[],
            )

    async def create_role(
        self,
        name: str,
        description: str,
        permissions: list[Permission],
        created_by: str,
    ) -> Role:
        """
        Create a new role.

        Args:
            name: Role name
            description: Role description
            permissions: List of permissions for the role
            created_by: ID of user creating the role

        Returns:
            Created Role
        """
        role = Role(
            id=str(uuid4()),
            name=name,
            description=description,
            permissions=permissions,
        )

        self._roles[role.id] = role

        # Store permissions
        for perm in permissions:
            self._permissions[perm.id] = perm

        self._log_security_event(
            event_type=SecurityEventType.ROLE_CREATED,
            user_id=created_by,
            resource="roles",
            action="create",
            success=True,
            message=f"Role '{name}' created with {len(permissions)} permissions",
            metadata={"role_id": role.id, "permission_count": len(permissions)},
        )

        return role

    async def update_role(
        self,
        role_id: str,
        updates: dict[str, Any],
        updated_by: str,
    ) -> Optional[Role]:
        """
        Update an existing role.

        Args:
            role_id: Role ID to update
            updates: Dictionary with update fields (name, description, permissions)
            updated_by: ID of user updating the role

        Returns:
            Updated Role or None if not found
        """
        role = self._roles.get(role_id)
        if not role:
            return None

        old_name = role.name

        if "name" in updates:
            role.name = updates["name"]
        if "description" in updates:
            role.description = updates["description"]
        if "permissions" in updates:
            role.permissions = updates["permissions"]
            for perm in updates["permissions"]:
                self._permissions[perm.id] = perm

        role.updated_at = datetime.now()
        self._roles[role_id] = role

        # Invalidate user role cache
        self._invalidate_user_role_cache()

        self._log_security_event(
            event_type=SecurityEventType.ROLE_UPDATED,
            user_id=updated_by,
            resource="roles",
            action="update",
            success=True,
            message=f"Role '{role.name}' updated",
            metadata={
                "role_id": role_id,
                "changes": list(updates.keys()),
                "old_name": old_name,
                "new_name": role.name,
            },
        )

        return role

    async def delete_role(self, role_id: str, deleted_by: str) -> bool:
        """
        Delete a role.

        Args:
            role_id: Role ID to delete
            deleted_by: ID of user deleting the role

        Returns:
            True if deletion successful, False otherwise
        """
        role = self._roles.get(role_id)
        if not role:
            return False

        # Cannot delete reserved roles
        reserved = [
            ReservedRoles.ADMIN,
            ReservedRoles.USER,
            ReservedRoles.READONLY,
            ReservedRoles.SERVICE,
        ]
        if role.name in reserved:
            self._log_security_event(
                event_type=SecurityEventType.ROLE_DELETE_FAILED,
                user_id=deleted_by,
                resource="roles",
                action="delete",
                success=False,
                message=f"Cannot delete reserved role '{role.name}'",
            )
            return False

        del self._roles[role_id]

        # Delete associated permissions
        for perm in role.permissions:
            if perm.id in self._permissions:
                del self._permissions[perm.id]

        # Invalidate user role cache
        self._invalidate_user_role_cache()

        self._log_security_event(
            event_type=SecurityEventType.ROLE_DELETED,
            user_id=deleted_by,
            resource="roles",
            action="delete",
            success=True,
            message=f"Role '{role.name}' deleted",
            metadata={"role_id": role_id, "role_name": role.name},
        )

        return True

    async def assign_role(self, request: RoleAssignmentRequest) -> bool:
        """
        Assign a role to a user.

        Args:
            request: Role assignment request

        Returns:
            True if assignment successful
        """
        role = self._roles.get(request.role_id)
        if not role:
            return False

        # Update cache
        user_roles = self._user_role_cache.get(request.user_id, set())
        user_roles.add(request.role_id)
        self._user_role_cache[request.user_id] = user_roles

        self._log_security_event(
            event_type=SecurityEventType.ROLE_ASSIGNED,
            user_id=request.assigned_by,
            resource="users",
            action="update",
            success=True,
            message=f"Role '{role.name}' assigned to user {request.user_id}",
            metadata={
                "target_user_id": request.user_id,
                "role_id": request.role_id,
                "role_name": role.name,
                "reason": request.reason or "No reason provided",
            },
        )

        return True

    async def revoke_role(
        self, user_id: str, role_id: str, revoked_by: str
    ) -> bool:
        """
        Revoke a role from a user.

        Args:
            user_id: User ID
            role_id: Role ID to revoke
            revoked_by: ID of user revoking the role

        Returns:
            True if revocation successful
        """
        role = self._roles.get(role_id)
        if not role:
            return False

        user_roles = self._user_role_cache.get(user_id)
        if not user_roles or role_id not in user_roles:
            return False

        user_roles.discard(role_id)
        self._user_role_cache[user_id] = user_roles

        self._log_security_event(
            event_type=SecurityEventType.ROLE_REVOKED,
            user_id=revoked_by,
            resource="users",
            action="update",
            success=True,
            message=f"Role '{role.name}' revoked from user {user_id}",
            metadata={
                "target_user_id": user_id,
                "role_id": role_id,
                "role_name": role.name,
            },
        )

        return True

    def get_roles(self) -> list[Role]:
        """Get all roles."""
        return list(self._roles.values())

    def get_role(self, role_id: str) -> Optional[Role]:
        """Get a role by ID."""
        return self._roles.get(role_id)

    def get_role_by_name(self, name: str) -> Optional[Role]:
        """Get a role by name."""
        for role in self._roles.values():
            if role.name == name:
                return role
        return None

    def get_permissions(self) -> list[Permission]:
        """Get all permissions."""
        return list(self._permissions.values())

    def get_user_permissions(self, user_id: str) -> set[Permission]:
        """
        Get all permissions for a user.

        Args:
            user_id: User ID

        Returns:
            Set of permissions for the user
        """
        permissions: set[Permission] = set()
        role_ids = self._user_role_cache.get(user_id, set())

        for role_id in role_ids:
            role = self._roles.get(role_id)
            if role:
                permissions.update(role.permissions)

        return permissions

    def _invalidate_user_role_cache(self) -> None:
        """Invalidate the user role cache."""
        self._user_role_cache.clear()

    def get_rbac_stats(self) -> dict[str, Any]:
        """Get RBAC statistics."""
        roles = list(self._roles.values())
        reserved = [
            ReservedRoles.ADMIN,
            ReservedRoles.USER,
            ReservedRoles.READONLY,
            ReservedRoles.SERVICE,
        ]

        return {
            "total_roles": len(roles),
            "total_permissions": len(self._permissions),
            "reserved_roles": len(reserved),
            "custom_roles": len(
                [r for r in roles if r.name not in reserved]
            ),
            "cached_users": len(self._user_role_cache),
            "role_distribution": [
                {"name": role.name, "permission_count": len(role.permissions)}
                for role in roles
            ],
        }

    def cleanup(self) -> None:
        """Clean up resources."""
        self._roles.clear()
        self._permissions.clear()
        self._user_role_cache.clear()
        self._event_handlers.clear()
