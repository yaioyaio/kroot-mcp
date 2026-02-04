"""
Authentication Manager
JWT 기반 인증 관리 시스템

This module provides JWT-based authentication, session management,
API key generation, and rate limiting functionality.
"""

import hashlib
import re
import secrets
import time
from datetime import datetime, timedelta
from typing import Any, Optional
from uuid import uuid4

import bcrypt
import jwt
from pydantic import BaseModel

from .types import (
    APIKey,
    AuthContext,
    AuthToken,
    LoginRequest,
    LoginResponse,
    Permission,
    PermissionAction,
    Role,
    SecurityConfig,
    SecurityEvent,
    SecurityEventType,
    SessionInfo,
    TokenPayload,
    User,
)


class AuthConfig(BaseModel):
    """Authentication configuration."""

    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire: str = "1h"
    refresh_token_expire: str = "7d"
    issuer: str = "devflow-monitor"
    audience: str = "devflow-users"
    rate_limit_window_ms: int = 900000  # 15 minutes
    rate_limit_max_attempts: int = 5
    session_max_sessions: int = 5
    session_timeout_ms: int = 86400000  # 24 hours
    session_cleanup_interval: int = 3600000  # 1 hour


class RateLimitEntry(BaseModel):
    """Rate limit tracking entry."""

    count: int
    reset_time: float


class RefreshTokenEntry(BaseModel):
    """Refresh token tracking entry."""

    user_id: str
    expires_at: datetime


class AuthManager:
    """
    Authentication Manager for JWT-based authentication.

    Provides functionality for:
    - User login/logout
    - JWT token generation and verification
    - Session management
    - API key generation and verification
    - Rate limiting

    Args:
        config: Authentication configuration
    """

    def __init__(self, config: AuthConfig | SecurityConfig) -> None:
        """Initialize the authentication manager."""
        if isinstance(config, SecurityConfig):
            self.config = AuthConfig(
                jwt_secret=config.jwt_secret,
                jwt_algorithm=config.jwt_algorithm,
                access_token_expire=config.access_token_expire,
                refresh_token_expire=config.refresh_token_expire,
                issuer=config.issuer,
                audience=config.audience,
                rate_limit_window_ms=config.rate_limit_window_ms,
                rate_limit_max_attempts=config.rate_limit_max_attempts,
                session_max_sessions=config.session_max_sessions,
                session_timeout_ms=config.session_timeout_ms,
                session_cleanup_interval=config.session_cleanup_interval,
            )
        else:
            self.config = config

        self._active_sessions: dict[str, SessionInfo] = {}
        self._refresh_tokens: dict[str, RefreshTokenEntry] = {}
        self._api_keys: dict[str, APIKey] = {}
        self._rate_limit_map: dict[str, RateLimitEntry] = {}
        self._event_handlers: list[Any] = []

        # Dummy users for testing
        self._dummy_users: dict[str, User] = self._create_dummy_users()

    def _create_dummy_users(self) -> dict[str, User]:
        """Create dummy users for testing."""
        admin_password_hash = bcrypt.hashpw(
            b"admin123", bcrypt.gensalt()
        ).decode("utf-8")
        user_password_hash = bcrypt.hashpw(
            b"user123", bcrypt.gensalt()
        ).decode("utf-8")

        return {
            "admin": User(
                id="1",
                username="admin",
                email="admin@devflow.com",
                password_hash=admin_password_hash,
                roles=[
                    Role(
                        id="1",
                        name="admin",
                        description="System Administrator",
                        permissions=[
                            Permission(
                                id="1",
                                resource="system",
                                action=PermissionAction.ADMIN,
                            ),
                            Permission(
                                id="2",
                                resource="mcp",
                                action=PermissionAction.EXECUTE,
                            ),
                        ],
                    )
                ],
                is_active=True,
            ),
            "user": User(
                id="2",
                username="user",
                email="user@devflow.com",
                password_hash=user_password_hash,
                roles=[
                    Role(
                        id="2",
                        name="user",
                        description="Regular User",
                        permissions=[
                            Permission(
                                id="3",
                                resource="mcp",
                                action=PermissionAction.READ,
                            ),
                            Permission(
                                id="4",
                                resource="dashboard",
                                action=PermissionAction.READ,
                            ),
                        ],
                    )
                ],
                is_active=True,
            ),
        }

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
        username: Optional[str] = None,
        ip_address: str = "unknown",
        user_agent: str = "unknown",
        resource: Optional[str] = None,
        action: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> None:
        """Create and emit a security event."""
        event = SecurityEvent(
            id=str(uuid4()),
            type=event_type,
            user_id=user_id,
            username=username,
            ip_address=ip_address,
            user_agent=user_agent,
            resource=resource,
            action=action,
            success=success,
            message=message,
            metadata=metadata,
            timestamp=datetime.now(),
        )
        self._emit_security_event(event)

    def _parse_time_to_seconds(self, time_str: str) -> int:
        """Convert time string to seconds."""
        match = re.match(r"(\d+)([smhd])?", time_str)
        if not match:
            return int(time_str)

        value = int(match.group(1))
        unit = match.group(2) or "s"

        multipliers = {"s": 1, "m": 60, "h": 3600, "d": 86400}
        return value * multipliers.get(unit, 1)

    def _check_rate_limit(self, identifier: str) -> bool:
        """Check if the identifier is within rate limits."""
        now = time.time() * 1000  # Convert to milliseconds
        limit = self._rate_limit_map.get(identifier)

        if not limit or now > limit.reset_time:
            self._rate_limit_map[identifier] = RateLimitEntry(
                count=1,
                reset_time=now + self.config.rate_limit_window_ms,
            )
            return True

        if limit.count >= self.config.rate_limit_max_attempts:
            return False

        limit.count += 1
        return True

    async def _authenticate_user(
        self, username: str, password: str
    ) -> Optional[User]:
        """Authenticate user with username and password."""
        user = self._dummy_users.get(username)
        if not user:
            return None

        if bcrypt.checkpw(
            password.encode("utf-8"), user.password_hash.encode("utf-8")
        ):
            return user

        return None

    async def _get_user_by_id(self, user_id: str) -> Optional[User]:
        """Get user by ID."""
        for user in self._dummy_users.values():
            if user.id == user_id:
                return user
        return None

    def _generate_refresh_token(
        self, user_id: str, remember_me: bool = False
    ) -> str:
        """Generate a refresh token."""
        refresh_token = secrets.token_hex(32)
        expire_str = "30d" if remember_me else self.config.refresh_token_expire
        expire_seconds = self._parse_time_to_seconds(expire_str)
        expires_at = datetime.now() + timedelta(seconds=expire_seconds)

        self._refresh_tokens[refresh_token] = RefreshTokenEntry(
            user_id=user_id, expires_at=expires_at
        )
        return refresh_token

    async def _generate_auth_token(
        self, user: User, remember_me: bool = False
    ) -> AuthToken:
        """Generate JWT auth tokens."""
        jti = str(uuid4())
        expire_str = (
            self.config.refresh_token_expire
            if remember_me
            else self.config.access_token_expire
        )
        expires_in = self._parse_time_to_seconds(expire_str)

        now = int(time.time())

        payload = TokenPayload(
            user_id=user.id,
            username=user.username,
            roles=[role.name for role in user.roles],
            permissions=[
                f"{perm.resource}:{perm.action.value}"
                for role in user.roles
                for perm in role.permissions
            ],
            iat=now,
            exp=now + expires_in,
            jti=jti,
        )

        access_token = jwt.encode(
            {
                "user_id": payload.user_id,
                "username": payload.username,
                "roles": payload.roles,
                "permissions": payload.permissions,
                "iat": payload.iat,
                "exp": payload.exp,
                "jti": payload.jti,
                "iss": self.config.issuer,
                "aud": self.config.audience,
            },
            self.config.jwt_secret,
            algorithm=self.config.jwt_algorithm,
        )

        refresh_token = self._generate_refresh_token(user.id, remember_me)

        return AuthToken(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=expires_in,
            token_type="Bearer",
        )

    def _create_session(
        self,
        session_id: str,
        user_id: str,
        ip_address: str,
        user_agent: str,
    ) -> None:
        """Create a new session."""
        now = datetime.now()
        expires_at = now + timedelta(
            milliseconds=self.config.session_timeout_ms
        )

        session = SessionInfo(
            session_id=session_id,
            user_id=user_id,
            ip_address=ip_address,
            user_agent=user_agent,
            created_at=now,
            last_access_at=now,
            expires_at=expires_at,
            is_active=True,
        )

        self._active_sessions[session_id] = session
        self._enforce_max_sessions(user_id)

    def _enforce_max_sessions(self, user_id: str) -> None:
        """Enforce maximum sessions per user."""
        user_sessions = sorted(
            [
                s
                for s in self._active_sessions.values()
                if s.user_id == user_id and s.is_active
            ],
            key=lambda s: s.last_access_at,
            reverse=True,
        )

        if len(user_sessions) > self.config.session_max_sessions:
            sessions_to_remove = user_sessions[
                self.config.session_max_sessions :
            ]
            for session in sessions_to_remove:
                session.is_active = False
                del self._active_sessions[session.session_id]

    async def login(
        self,
        request: LoginRequest,
        client_info: dict[str, str],
    ) -> LoginResponse:
        """
        Process user login request.

        Args:
            request: Login request with username and password
            client_info: Client information (ip_address, user_agent)

        Returns:
            LoginResponse with success status and token if successful
        """
        username = request.username
        password = request.password
        remember_me = request.remember_me
        ip_address = client_info.get("ip_address", "unknown")
        user_agent = client_info.get("user_agent", "unknown")

        # Check rate limit
        if not self._check_rate_limit(ip_address):
            self._log_security_event(
                event_type=SecurityEventType.LOGIN_ATTEMPT,
                username=username,
                ip_address=ip_address,
                user_agent=user_agent,
                success=False,
                message="Rate limit exceeded",
            )
            return LoginResponse(
                success=False,
                message="Too many login attempts. Please try again later.",
            )

        # Authenticate user
        user = await self._authenticate_user(username, password)

        if not user:
            self._log_security_event(
                event_type=SecurityEventType.LOGIN_FAILURE,
                username=username,
                ip_address=ip_address,
                user_agent=user_agent,
                success=False,
                message="Invalid credentials",
            )
            return LoginResponse(
                success=False,
                message="Invalid username or password.",
            )

        if not user.is_active:
            self._log_security_event(
                event_type=SecurityEventType.LOGIN_FAILURE,
                user_id=user.id,
                username=username,
                ip_address=ip_address,
                user_agent=user_agent,
                success=False,
                message="Account disabled",
            )
            return LoginResponse(
                success=False,
                message="Account is disabled.",
            )

        # Generate tokens
        token = await self._generate_auth_token(user, remember_me)

        # Create session
        session_id = str(uuid4())
        self._create_session(session_id, user.id, ip_address, user_agent)

        # Log success
        self._log_security_event(
            event_type=SecurityEventType.LOGIN_SUCCESS,
            user_id=user.id,
            username=username,
            ip_address=ip_address,
            user_agent=user_agent,
            success=True,
            message="Login successful",
        )

        # Return user info without password hash
        user_info = user.model_dump(exclude={"password_hash"})

        return LoginResponse(
            success=True,
            token=token,
            user=user_info,
            message="Login successful.",
        )

    async def verify_token(self, token: str) -> Optional[AuthContext]:
        """
        Verify JWT token and return auth context.

        Args:
            token: JWT access token

        Returns:
            AuthContext if token is valid, None otherwise
        """
        try:
            decoded = jwt.decode(
                token,
                self.config.jwt_secret,
                algorithms=[self.config.jwt_algorithm],
                issuer=self.config.issuer,
                audience=self.config.audience,
            )

            user_id = decoded.get("user_id")

            # Find active session
            session = next(
                (
                    s
                    for s in self._active_sessions.values()
                    if s.user_id == user_id and s.is_active
                ),
                None,
            )

            if not session:
                return None

            # Get user
            user = await self._get_user_by_id(user_id)
            if not user or not user.is_active:
                return None

            # Create permissions set
            permissions = set(decoded.get("permissions", []))

            return AuthContext(
                user=user,
                permissions=permissions,
                session_id=session.session_id,
                ip_address=session.ip_address,
                user_agent=session.user_agent,
            )

        except jwt.ExpiredSignatureError:
            self._log_security_event(
                event_type=SecurityEventType.TOKEN_EXPIRED,
                success=False,
                message="Token has expired",
            )
            return None
        except jwt.InvalidTokenError as e:
            self._log_security_event(
                event_type=SecurityEventType.UNAUTHORIZED_ACCESS,
                success=False,
                message=f"Invalid JWT: {str(e)}",
            )
            return None

    async def refresh_access_token(
        self, refresh_token: str
    ) -> Optional[AuthToken]:
        """
        Refresh access token using refresh token.

        Args:
            refresh_token: Refresh token

        Returns:
            New AuthToken if refresh token is valid, None otherwise
        """
        token_info = self._refresh_tokens.get(refresh_token)

        if not token_info or token_info.expires_at < datetime.now():
            if token_info:
                del self._refresh_tokens[refresh_token]
            return None

        user = await self._get_user_by_id(token_info.user_id)
        if not user or not user.is_active:
            del self._refresh_tokens[refresh_token]
            return None

        # Invalidate old refresh token and generate new tokens
        del self._refresh_tokens[refresh_token]
        new_token = await self._generate_auth_token(user, False)

        self._log_security_event(
            event_type=SecurityEventType.TOKEN_REFRESH,
            user_id=user.id,
            username=user.username,
            success=True,
            message="Token refreshed successfully",
        )

        return new_token

    async def logout(self, session_id: str, user_id: str) -> bool:
        """
        Process user logout.

        Args:
            session_id: Session ID to invalidate
            user_id: User ID

        Returns:
            True if logout successful
        """
        try:
            # Invalidate session
            session = self._active_sessions.get(session_id)
            if session:
                session.is_active = False
                del self._active_sessions[session_id]

            # Invalidate all refresh tokens for user
            tokens_to_remove = [
                token
                for token, info in self._refresh_tokens.items()
                if info.user_id == user_id
            ]
            for token in tokens_to_remove:
                del self._refresh_tokens[token]

            user = await self._get_user_by_id(user_id)
            self._log_security_event(
                event_type=SecurityEventType.LOGOUT,
                user_id=user_id,
                username=user.username if user else "unknown",
                ip_address=session.ip_address if session else "unknown",
                user_agent=session.user_agent if session else "unknown",
                success=True,
                message="Logout successful",
            )

            return True
        except Exception:
            return False

    async def generate_api_key(
        self,
        user_id: str,
        name: str,
        permissions: list[str],
        expires_at: Optional[datetime] = None,
    ) -> str:
        """
        Generate an API key for a user.

        Args:
            user_id: User ID
            name: API key name
            permissions: List of permission strings (resource:action)
            expires_at: Optional expiration time

        Returns:
            Generated API key
        """
        api_key = f"devflow_{secrets.token_hex(32)}"
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()

        permission_objects = []
        for perm in permissions:
            parts = perm.split(":")
            resource = parts[0] if len(parts) > 0 else ""
            action_str = parts[1] if len(parts) > 1 else "read"
            try:
                action = PermissionAction(action_str)
            except ValueError:
                action = PermissionAction.READ

            permission_objects.append(
                Permission(
                    id=str(uuid4()),
                    resource=resource,
                    action=action,
                )
            )

        api_key_info = APIKey(
            id=str(uuid4()),
            name=name,
            key_hash=key_hash,
            user_id=user_id,
            permissions=permission_objects,
            expires_at=expires_at,
            is_active=True,
        )

        self._api_keys[api_key] = api_key_info
        return api_key

    async def verify_api_key(self, api_key: str) -> Optional[APIKey]:
        """
        Verify an API key.

        Args:
            api_key: API key to verify

        Returns:
            APIKey if valid, None otherwise
        """
        key_info = self._api_keys.get(api_key)

        if not key_info or not key_info.is_active:
            return None

        if key_info.expires_at and key_info.expires_at < datetime.now():
            key_info.is_active = False
            return None

        # Update last used time
        key_info.last_used_at = datetime.now()
        return key_info

    def get_active_sessions(self) -> list[SessionInfo]:
        """Get all active sessions."""
        return [s for s in self._active_sessions.values() if s.is_active]

    def get_security_stats(self) -> dict[str, Any]:
        """Get security statistics."""
        return {
            "active_sessions": len(self._active_sessions),
            "active_refresh_tokens": len(self._refresh_tokens),
            "active_api_keys": len(
                [k for k in self._api_keys.values() if k.is_active]
            ),
            "rate_limit_entries": len(self._rate_limit_map),
        }

    def cleanup(self) -> None:
        """Clean up resources."""
        self._active_sessions.clear()
        self._refresh_tokens.clear()
        self._api_keys.clear()
        self._rate_limit_map.clear()
        self._event_handlers.clear()
