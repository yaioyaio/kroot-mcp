"""
Security Types
보안 시스템 타입 정의

This module defines all the type definitions for the security system including
users, roles, permissions, tokens, and security events.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class PermissionAction(str, Enum):
    """Permission action types."""

    CREATE = "create"
    READ = "read"
    UPDATE = "update"
    DELETE = "delete"
    EXECUTE = "execute"
    ADMIN = "admin"


class SecurityEventType(str, Enum):
    """Security event types for audit logging."""

    LOGIN_ATTEMPT = "login_attempt"
    LOGIN_SUCCESS = "login_success"
    LOGIN_FAILURE = "login_failure"
    LOGOUT = "logout"
    TOKEN_REFRESH = "token_refresh"
    TOKEN_EXPIRED = "token_expired"
    TOKEN_VERIFIED = "token_verified"
    TOKEN_VERIFICATION_FAILED = "token_verification_failed"
    TOKEN_CREATION_FAILED = "token_creation_failed"
    PERMISSION_DENIED = "permission_denied"
    PERMISSION_GRANTED = "permission_granted"
    UNAUTHORIZED_ACCESS = "unauthorized_access"
    SUSPICIOUS_ACTIVITY = "suspicious_activity"
    ACCOUNT_LOCKED = "account_locked"
    PASSWORD_CHANGED = "password_changed"
    ROLE_CHANGED = "role_changed"
    ROLE_CREATED = "role_created"
    ROLE_UPDATED = "role_updated"
    ROLE_DELETED = "role_deleted"
    ROLE_DELETE_FAILED = "role_delete_failed"
    ROLE_ASSIGNED = "role_assigned"
    ROLE_REVOKED = "role_revoked"
    KEY_ROTATED = "key_rotated"
    KEY_ROTATION_FAILED = "key_rotation_failed"
    KEY_ROTATION_SCHEDULED = "key_rotation_scheduled"
    OLD_KEYS_CLEANED = "old_keys_cleaned"
    AUTOMATIC_KEY_ROTATION_FAILED = "automatic_key_rotation_failed"
    ENCRYPTION_INITIALIZED = "encryption_initialized"
    DATA_ENCRYPTED = "data_encrypted"
    ENCRYPTION_FAILED = "encryption_failed"
    DATA_DECRYPTED = "data_decrypted"
    DECRYPTION_FAILED = "decryption_failed"
    HASH_CREATED = "hash_created"
    HASH_FAILED = "hash_failed"
    HMAC_CREATED = "hmac_created"
    HMAC_FAILED = "hmac_failed"
    SECURE_TOKEN_CREATED = "secure_token_created"


class Permission(BaseModel):
    """Permission definition for access control."""

    id: str
    resource: str
    action: PermissionAction
    conditions: Optional[dict[str, Any]] = None
    created_at: datetime = Field(default_factory=datetime.now)


class Role(BaseModel):
    """Role definition with associated permissions."""

    id: str
    name: str
    description: str
    permissions: list[Permission] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


class User(BaseModel):
    """User model with authentication and authorization information."""

    id: str
    username: str
    email: str
    password_hash: str
    roles: list[Role] = Field(default_factory=list)
    is_active: bool = True
    last_login_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


class TokenPayload(BaseModel):
    """JWT token payload structure."""

    user_id: str
    username: str
    roles: list[str] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)
    iat: int  # Issued at (Unix timestamp)
    exp: int  # Expiration (Unix timestamp)
    jti: str  # JWT ID


class AuthToken(BaseModel):
    """Authentication token response."""

    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str = "Bearer"


class AuthContext(BaseModel):
    """Authentication context for authorized requests."""

    user: User
    permissions: set[str]
    session_id: str
    ip_address: str
    user_agent: str


class SessionInfo(BaseModel):
    """Session information for tracking active sessions."""

    session_id: str
    user_id: str
    ip_address: str
    user_agent: str
    created_at: datetime = Field(default_factory=datetime.now)
    last_access_at: datetime = Field(default_factory=datetime.now)
    expires_at: datetime
    is_active: bool = True


class APIKey(BaseModel):
    """API key for service authentication."""

    id: str
    name: str
    key_hash: str
    user_id: str
    permissions: list[Permission] = Field(default_factory=list)
    expires_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


class SecurityEvent(BaseModel):
    """Security event for audit logging."""

    id: str
    type: SecurityEventType
    user_id: Optional[str] = None
    username: Optional[str] = None
    ip_address: str
    user_agent: str
    resource: Optional[str] = None
    action: Optional[str] = None
    success: bool
    message: str
    metadata: Optional[dict[str, Any]] = None
    timestamp: datetime = Field(default_factory=datetime.now)


class AuditLogEntry(BaseModel):
    """Audit log entry for security tracking."""

    id: str
    timestamp: datetime
    event_type: SecurityEventType
    user_id: Optional[str] = None
    username: Optional[str] = None
    ip_address: str
    user_agent: str
    resource: Optional[str] = None
    action: Optional[str] = None
    success: bool
    message: str
    metadata: Optional[dict[str, Any]] = None
    severity: str = "low"  # low, medium, high, critical
    category: str = "system"
    session_id: Optional[str] = None
    correlation_id: Optional[str] = None


class LoginRequest(BaseModel):
    """Login request structure."""

    username: str
    password: str
    remember_me: bool = False


class LoginResponse(BaseModel):
    """Login response structure."""

    success: bool
    token: Optional[AuthToken] = None
    user: Optional[dict[str, Any]] = None
    message: str


class PermissionCheck(BaseModel):
    """Permission check request."""

    resource: str
    action: PermissionAction
    conditions: Optional[dict[str, Any]] = None


class PermissionCheckResult(BaseModel):
    """Permission check result."""

    allowed: bool
    reason: Optional[str] = None
    matched_permissions: list[Permission] = Field(default_factory=list)


class RoleAssignmentRequest(BaseModel):
    """Role assignment request."""

    user_id: str
    role_id: str
    assigned_by: str
    reason: Optional[str] = None


# Reserved roles and permissions
class ReservedRoles:
    """Reserved system roles."""

    ADMIN = "admin"
    USER = "user"
    READONLY = "readonly"
    SERVICE = "service"


class ReservedPermissions:
    """Reserved system permissions."""

    # MCP tool permissions
    MCP_GET_PROJECT_STATUS = "mcp:getProjectStatus"
    MCP_GET_METRICS = "mcp:getMetrics"
    MCP_GET_ACTIVITY_LOG = "mcp:getActivityLog"
    MCP_ANALYZE_BOTTLENECKS = "mcp:analyzeBottlenecks"
    MCP_CHECK_METHODOLOGY = "mcp:checkMethodology"
    MCP_GENERATE_REPORT = "mcp:generateReport"
    MCP_ANALYZE_STAGE = "mcp:analyzeStage"
    MCP_ANALYZE_AI_COLLABORATION = "mcp:analyzeAICollaboration"

    # WebSocket permissions
    WEBSOCKET_START_SERVER = "websocket:startServer"
    WEBSOCKET_STOP_SERVER = "websocket:stopServer"
    WEBSOCKET_GET_STATS = "websocket:getStats"
    WEBSOCKET_BROADCAST = "websocket:broadcast"

    # Dashboard permissions
    DASHBOARD_START = "dashboard:start"
    DASHBOARD_VIEW = "dashboard:view"
    DASHBOARD_CONTROL = "dashboard:control"

    # Metrics permissions
    METRICS_VIEW_ADVANCED = "metrics:viewAdvanced"
    METRICS_VIEW_BOTTLENECKS = "metrics:viewBottlenecks"
    METRICS_ANALYZE_PRODUCTIVITY = "metrics:analyzeProductivity"

    # Notifications permissions
    NOTIFICATIONS_CONFIGURE = "notifications:configure"
    NOTIFICATIONS_SEND = "notifications:send"
    NOTIFICATIONS_VIEW_STATS = "notifications:viewStats"
    NOTIFICATIONS_MANAGE_RULES = "notifications:manageRules"

    # Performance optimization permissions
    PERFORMANCE_VIEW_REPORT = "performance:viewReport"
    PERFORMANCE_OPTIMIZE = "performance:optimize"
    PERFORMANCE_VIEW_METRICS = "performance:viewMetrics"
    PERFORMANCE_PROFILE = "performance:profile"
    PERFORMANCE_MANAGE_CACHES = "performance:manageCaches"

    # System management permissions
    SYSTEM_ADMIN = "system:admin"
    SYSTEM_CONFIG = "system:config"
    SYSTEM_LOGS = "system:logs"
    SYSTEM_USERS = "system:users"
    SYSTEM_SECURITY = "system:security"


class SecurityConfig(BaseModel):
    """Security configuration."""

    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire: str = "1h"
    refresh_token_expire: str = "7d"
    issuer: str = "devflow-monitor"
    audience: str = "devflow-users"
    encryption_algorithm: str = "aes-256-gcm"
    encryption_key_length: int = 32
    encryption_iterations: int = 100000
    rate_limit_window_ms: int = 900000  # 15 minutes
    rate_limit_max_attempts: int = 5
    session_max_sessions: int = 5
    session_timeout_ms: int = 86400000  # 24 hours
    session_cleanup_interval: int = 3600000  # 1 hour


class AuditLogConfig(BaseModel):
    """Audit log configuration."""

    log_directory: str = "./logs/audit"
    max_file_size: int = 10 * 1024 * 1024  # 10MB
    max_files: int = 30
    rotation_interval: int = 86400000  # 24 hours
    compression_enabled: bool = True
    encryption_enabled: bool = False


class EncryptionResult(BaseModel):
    """Encryption result."""

    encrypted: str
    iv: str
    tag: Optional[str] = None


class DecryptionInput(BaseModel):
    """Decryption input."""

    encrypted: str
    iv: str
    tag: Optional[str] = None
