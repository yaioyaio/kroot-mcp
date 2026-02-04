"""
Security Module
보안 시스템 통합 진입점

This module provides integrated security functionality including
authentication, authorization, encryption, and audit logging.
"""

import asyncio
from typing import Any, Optional

from .auth_manager import AuthConfig, AuthManager
from .audit_logger import AuditLogger, AuditQuery, AuditSummary
from .encryption_manager import EncryptionManager, KeyRotationConfig
from .rbac_manager import RBACManager
from .types import (
    APIKey,
    AuditLogConfig,
    AuditLogEntry,
    AuthContext,
    AuthToken,
    DecryptionInput,
    EncryptionResult,
    LoginRequest,
    LoginResponse,
    Permission,
    PermissionAction,
    PermissionCheck,
    PermissionCheckResult,
    ReservedPermissions,
    ReservedRoles,
    Role,
    RoleAssignmentRequest,
    SecurityConfig,
    SecurityEvent,
    SecurityEventType,
    SessionInfo,
    TokenPayload,
    User,
)


class SecurityManagerConfig:
    """Security manager configuration."""

    def __init__(
        self,
        security: SecurityConfig,
        audit: AuditLogConfig,
        key_rotation: Optional[KeyRotationConfig] = None,
    ) -> None:
        """Initialize security manager config."""
        self.security = security
        self.audit = audit
        self.key_rotation = key_rotation


class SecurityManager:
    """
    Integrated Security Manager.

    Provides unified access to:
    - Authentication (login, logout, token management)
    - Authorization (RBAC, permission checking)
    - Encryption (data encryption/decryption, hashing)
    - Audit logging (security event tracking)

    Args:
        config: Security manager configuration

    Example:
        >>> manager = SecurityManager(config)
        >>> response = await manager.login("user", "password", client_info)
        >>> result = await manager.check_permission(user_id, check)
    """

    def __init__(self, config: SecurityManagerConfig) -> None:
        """Initialize the security manager."""
        self._auth_manager = AuthManager(config.security)
        self._rbac_manager = RBACManager()
        self._encryption_manager = EncryptionManager(
            config.security, config.key_rotation
        )
        self._audit_logger = AuditLogger(config.audit)
        self._initialized = True
        self._event_handlers: list[Any] = []

        self._setup_event_handlers()

    def _setup_event_handlers(self) -> None:
        """Set up event handlers between components."""

        def handle_security_event(event: SecurityEvent) -> None:
            asyncio.create_task(self._audit_logger.log(event))
            self._emit_event("security_event", event)

        self._auth_manager.on_security_event(handle_security_event)
        self._rbac_manager.on_security_event(handle_security_event)
        self._encryption_manager.on_security_event(handle_security_event)

    def on_event(self, event_name: str, handler: Any) -> None:
        """Register an event handler."""
        self._event_handlers.append((event_name, handler))

    def _emit_event(self, event_name: str, data: Any) -> None:
        """Emit an event to registered handlers."""
        for name, handler in self._event_handlers:
            if name == event_name:
                try:
                    handler(data)
                except Exception:
                    pass

    def _ensure_initialized(self) -> None:
        """Ensure the security manager is initialized."""
        if not self._initialized:
            raise RuntimeError("SecurityManager is not initialized")

    # Authentication methods
    async def login(
        self,
        username: str,
        password: str,
        client_info: dict[str, str],
        remember_me: bool = False,
    ) -> LoginResponse:
        """
        Process user login.

        Args:
            username: Username
            password: Password
            client_info: Client information (ip_address, user_agent)
            remember_me: Whether to extend session duration

        Returns:
            LoginResponse with success status and token
        """
        self._ensure_initialized()
        request = LoginRequest(
            username=username, password=password, remember_me=remember_me
        )
        return await self._auth_manager.login(request, client_info)

    async def verify_token(self, token: str) -> Optional[AuthContext]:
        """
        Verify JWT token.

        Args:
            token: JWT access token

        Returns:
            AuthContext if valid, None otherwise
        """
        self._ensure_initialized()
        return await self._auth_manager.verify_token(token)

    async def logout(self, session_id: str, user_id: str) -> bool:
        """
        Process user logout.

        Args:
            session_id: Session ID
            user_id: User ID

        Returns:
            True if logout successful
        """
        self._ensure_initialized()
        return await self._auth_manager.logout(session_id, user_id)

    async def generate_api_key(
        self,
        user_id: str,
        name: str,
        permissions: list[str],
        expires_at: Optional[Any] = None,
    ) -> str:
        """
        Generate an API key.

        Args:
            user_id: User ID
            name: API key name
            permissions: List of permission strings
            expires_at: Optional expiration time

        Returns:
            Generated API key
        """
        self._ensure_initialized()
        return await self._auth_manager.generate_api_key(
            user_id, name, permissions, expires_at
        )

    async def verify_api_key(self, api_key: str) -> Optional[APIKey]:
        """
        Verify an API key.

        Args:
            api_key: API key to verify

        Returns:
            APIKey if valid, None otherwise
        """
        self._ensure_initialized()
        return await self._auth_manager.verify_api_key(api_key)

    # Authorization methods
    async def check_permission(
        self,
        user_id: str,
        check: PermissionCheck,
        context: Optional[dict[str, Any]] = None,
    ) -> PermissionCheckResult:
        """
        Check user permission.

        Args:
            user_id: User ID
            check: Permission check criteria
            context: Optional context for conditional permissions

        Returns:
            PermissionCheckResult with allowed status
        """
        self._ensure_initialized()
        return await self._rbac_manager.check_permission(user_id, check, context)

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
            permissions: List of permissions
            created_by: ID of creating user

        Returns:
            Created Role
        """
        self._ensure_initialized()
        return await self._rbac_manager.create_role(
            name, description, permissions, created_by
        )

    async def assign_role(
        self,
        user_id: str,
        role_id: str,
        assigned_by: str,
        reason: Optional[str] = None,
    ) -> bool:
        """
        Assign a role to a user.

        Args:
            user_id: User ID
            role_id: Role ID
            assigned_by: ID of assigning user
            reason: Optional reason

        Returns:
            True if assignment successful
        """
        self._ensure_initialized()
        request = RoleAssignmentRequest(
            user_id=user_id,
            role_id=role_id,
            assigned_by=assigned_by,
            reason=reason,
        )
        return await self._rbac_manager.assign_role(request)

    async def revoke_role(
        self, user_id: str, role_id: str, revoked_by: str
    ) -> bool:
        """
        Revoke a role from a user.

        Args:
            user_id: User ID
            role_id: Role ID
            revoked_by: ID of revoking user

        Returns:
            True if revocation successful
        """
        self._ensure_initialized()
        return await self._rbac_manager.revoke_role(user_id, role_id, revoked_by)

    async def get_user_roles(self, user_id: str) -> list[Role]:
        """
        Get roles assigned to a user.

        Args:
            user_id: User ID

        Returns:
            List of roles
        """
        self._ensure_initialized()
        return await self._rbac_manager.get_user_roles(user_id)

    def get_roles(self) -> list[Role]:
        """Get all roles."""
        self._ensure_initialized()
        return self._rbac_manager.get_roles()

    # Encryption methods
    async def encrypt(self, data: str | bytes) -> EncryptionResult:
        """
        Encrypt data.

        Args:
            data: Data to encrypt

        Returns:
            EncryptionResult with encrypted data
        """
        self._ensure_initialized()
        return await self._encryption_manager.encrypt(data)

    async def decrypt(
        self,
        input_data: DecryptionInput,
        key_id: Optional[str] = None,
    ) -> str:
        """
        Decrypt data.

        Args:
            input_data: Encrypted data with IV and tag
            key_id: Optional specific key ID

        Returns:
            Decrypted string
        """
        self._ensure_initialized()
        return await self._encryption_manager.decrypt(input_data, key_id)

    async def create_hash(
        self,
        data: str | bytes,
        algorithm: str = "sha256",
        salt: Optional[str] = None,
    ) -> str:
        """
        Create a hash.

        Args:
            data: Data to hash
            algorithm: Hash algorithm
            salt: Optional salt

        Returns:
            Hex-encoded hash
        """
        self._ensure_initialized()
        return await self._encryption_manager.create_hash(data, algorithm, salt)

    async def create_hmac(
        self,
        data: str | bytes,
        secret: Optional[str] = None,
        algorithm: str = "sha256",
    ) -> str:
        """
        Create an HMAC.

        Args:
            data: Data to create HMAC for
            secret: Optional secret key
            algorithm: Hash algorithm

        Returns:
            Hex-encoded HMAC
        """
        self._ensure_initialized()
        return await self._encryption_manager.create_hmac(data, secret, algorithm)

    async def generate_secure_token(
        self, payload: dict[str, Any], expires_in: Optional[int] = None
    ) -> str:
        """
        Generate a secure encrypted token.

        Args:
            payload: Token payload
            expires_in: Optional expiration in milliseconds

        Returns:
            Encrypted token
        """
        self._ensure_initialized()
        return await self._encryption_manager.generate_secure_payload_token(
            payload, expires_in
        )

    async def verify_secure_token(
        self, token: str
    ) -> Optional[dict[str, Any]]:
        """
        Verify a secure token.

        Args:
            token: Token to verify

        Returns:
            Token payload or None if invalid
        """
        self._ensure_initialized()
        return await self._encryption_manager.verify_secure_payload_token(token)

    async def rotate_keys(self) -> None:
        """Rotate encryption keys."""
        self._ensure_initialized()
        return await self._encryption_manager.rotate_keys()

    # Audit methods
    async def query_audit_logs(self, query: AuditQuery) -> list[AuditLogEntry]:
        """
        Query audit logs.

        Args:
            query: Query parameters

        Returns:
            List of matching entries
        """
        self._ensure_initialized()
        return await self._audit_logger.query(query)

    async def get_audit_summary(
        self,
        start_date: Optional[Any] = None,
        end_date: Optional[Any] = None,
    ) -> AuditSummary:
        """
        Get audit log summary.

        Args:
            start_date: Optional start date
            end_date: Optional end date

        Returns:
            AuditSummary with statistics
        """
        self._ensure_initialized()
        return await self._audit_logger.get_summary(start_date, end_date)

    # Status methods
    def get_active_sessions(self) -> list[SessionInfo]:
        """Get all active sessions."""
        self._ensure_initialized()
        return self._auth_manager.get_active_sessions()

    def get_security_stats(self) -> dict[str, Any]:
        """Get security statistics."""
        self._ensure_initialized()
        return {
            "auth": self._auth_manager.get_security_stats(),
            "rbac": self._rbac_manager.get_rbac_stats(),
            "encryption": self._encryption_manager.get_encryption_stats(),
            "audit": self._audit_logger.get_audit_stats(),
        }

    async def health_check(self) -> dict[str, Any]:
        """
        Check security system health.

        Returns:
            Health status with component details
        """
        try:
            components = {
                "auth": True,
                "rbac": True,
                "encryption": True,
                "audit": True,
            }

            try:
                self._auth_manager.get_security_stats()
            except Exception:
                components["auth"] = False

            try:
                self._rbac_manager.get_rbac_stats()
            except Exception:
                components["rbac"] = False

            try:
                self._encryption_manager.get_encryption_stats()
            except Exception:
                components["encryption"] = False

            try:
                self._audit_logger.get_audit_stats()
            except Exception:
                components["audit"] = False

            healthy_count = sum(components.values())
            total_count = len(components)

            if healthy_count == 0:
                status = "error"
            elif healthy_count < total_count:
                status = "warning"
            else:
                status = "healthy"

            return {
                "status": status,
                "components": components,
                "details": {
                    "healthy_components": healthy_count,
                    "total_components": total_count,
                    "initialized": self._initialized,
                },
            }

        except Exception as e:
            return {
                "status": "error",
                "components": {
                    "auth": False,
                    "rbac": False,
                    "encryption": False,
                    "audit": False,
                },
                "details": {
                    "error": str(e),
                    "initialized": self._initialized,
                },
            }

    async def cleanup(self) -> None:
        """Clean up resources."""
        if self._auth_manager:
            self._auth_manager.cleanup()

        if self._rbac_manager:
            self._rbac_manager.cleanup()

        if self._encryption_manager:
            self._encryption_manager.cleanup()

        if self._audit_logger:
            await self._audit_logger.cleanup()

        self._event_handlers.clear()
        self._initialized = False


# Default security configuration
DEFAULT_SECURITY_CONFIG = SecurityManagerConfig(
    security=SecurityConfig(
        jwt_secret="devflow-secret-key-change-in-production",
        jwt_algorithm="HS256",
        access_token_expire="1h",
        refresh_token_expire="7d",
        issuer="devflow-monitor",
        audience="devflow-users",
        encryption_algorithm="aes-256-gcm",
        encryption_key_length=32,
        encryption_iterations=100000,
        rate_limit_window_ms=900000,  # 15 minutes
        rate_limit_max_attempts=5,
        session_max_sessions=5,
        session_timeout_ms=86400000,  # 24 hours
        session_cleanup_interval=3600000,  # 1 hour
    ),
    audit=AuditLogConfig(
        log_directory="./logs/audit",
        max_file_size=10 * 1024 * 1024,  # 10MB
        max_files=30,
        rotation_interval=86400000,  # 24 hours
        compression_enabled=True,
        encryption_enabled=False,
    ),
    key_rotation=KeyRotationConfig(
        enabled=False,
        interval_days=30,
        keep_old_keys=5,
    ),
)

# Singleton instance
_security_manager_instance: Optional[SecurityManager] = None


def get_security_manager(
    config: Optional[SecurityManagerConfig] = None,
) -> SecurityManager:
    """
    Get or create the security manager singleton.

    Args:
        config: Optional configuration (uses default if not provided)

    Returns:
        SecurityManager instance
    """
    global _security_manager_instance
    if _security_manager_instance is None:
        _security_manager_instance = SecurityManager(
            config or DEFAULT_SECURITY_CONFIG
        )
    return _security_manager_instance


async def cleanup_security_manager() -> None:
    """Clean up the security manager singleton."""
    global _security_manager_instance
    if _security_manager_instance:
        await _security_manager_instance.cleanup()
        _security_manager_instance = None


# Export all public components
__all__ = [
    # Manager classes
    "SecurityManager",
    "SecurityManagerConfig",
    "AuthManager",
    "AuthConfig",
    "RBACManager",
    "EncryptionManager",
    "KeyRotationConfig",
    "AuditLogger",
    "AuditQuery",
    "AuditSummary",
    # Type classes
    "User",
    "Role",
    "Permission",
    "PermissionAction",
    "PermissionCheck",
    "PermissionCheckResult",
    "TokenPayload",
    "AuthToken",
    "AuthContext",
    "SessionInfo",
    "APIKey",
    "SecurityEvent",
    "SecurityEventType",
    "AuditLogEntry",
    "LoginRequest",
    "LoginResponse",
    "RoleAssignmentRequest",
    "EncryptionResult",
    "DecryptionInput",
    "SecurityConfig",
    "AuditLogConfig",
    # Constants
    "ReservedRoles",
    "ReservedPermissions",
    # Functions
    "get_security_manager",
    "cleanup_security_manager",
    "DEFAULT_SECURITY_CONFIG",
]
