"""
Unit tests for the security module.

Tests cover JWT token creation and verification, password hashing,
encryption/decryption, RBAC permission checking, and audit logging.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

from devflow_monitor.security.auth_manager import AuthConfig, AuthManager
from devflow_monitor.security.encryption_manager import EncryptionManager
from devflow_monitor.security.rbac_manager import RBACManager
from devflow_monitor.security.audit_logger import AuditLogger
from devflow_monitor.security.types import (
    DecryptionInput,
    LoginRequest,
    Permission,
    PermissionAction,
    Role,
    SecurityConfig,
    User,
)


class TestJWTCreateVerify:
    """Tests for JWT token creation and verification."""

    @pytest.fixture
    def auth_config(self, security_config: dict[str, Any]) -> AuthConfig:
        """Create auth configuration."""
        return AuthConfig(**security_config)

    @pytest.fixture
    def auth_manager(self, auth_config: AuthConfig) -> AuthManager:
        """Create auth manager instance."""
        return AuthManager(auth_config)

    @pytest.mark.asyncio
    async def test_login_success(self, auth_manager: AuthManager) -> None:
        """Test successful user login."""
        request = LoginRequest(
            username="admin",
            password="admin123",
        )
        client_info = {
            "ip_address": "127.0.0.1",
            "user_agent": "test-agent",
        }

        response = await auth_manager.login(request, client_info)

        assert response.success is True
        assert response.token is not None
        assert response.token.access_token is not None
        assert response.token.refresh_token is not None

    @pytest.mark.asyncio
    async def test_login_invalid_credentials(
        self, auth_manager: AuthManager
    ) -> None:
        """Test login with invalid credentials."""
        request = LoginRequest(
            username="admin",
            password="wrongpassword",
        )
        client_info = {
            "ip_address": "127.0.0.1",
            "user_agent": "test-agent",
        }

        response = await auth_manager.login(request, client_info)

        assert response.success is False
        assert "Invalid" in response.message

    @pytest.mark.asyncio
    async def test_verify_valid_token(self, auth_manager: AuthManager) -> None:
        """Test verifying a valid JWT token."""
        # First login to get a token
        request = LoginRequest(username="admin", password="admin123")
        client_info = {"ip_address": "127.0.0.1", "user_agent": "test-agent"}
        login_response = await auth_manager.login(request, client_info)

        assert login_response.token is not None

        # Verify the token
        context = await auth_manager.verify_token(login_response.token.access_token)

        assert context is not None
        assert context.user.username == "admin"

    @pytest.mark.asyncio
    async def test_verify_invalid_token(self, auth_manager: AuthManager) -> None:
        """Test verifying an invalid JWT token."""
        invalid_token = "invalid.token.here"

        context = await auth_manager.verify_token(invalid_token)

        assert context is None

    @pytest.mark.asyncio
    async def test_refresh_token(self, auth_manager: AuthManager) -> None:
        """Test refreshing access token."""
        # First login to get tokens
        request = LoginRequest(username="admin", password="admin123")
        client_info = {"ip_address": "127.0.0.1", "user_agent": "test-agent"}
        login_response = await auth_manager.login(request, client_info)

        assert login_response.token is not None

        # Refresh the token
        new_token = await auth_manager.refresh_access_token(
            login_response.token.refresh_token
        )

        assert new_token is not None
        assert new_token.access_token is not None

    @pytest.mark.asyncio
    async def test_logout(self, auth_manager: AuthManager) -> None:
        """Test user logout."""
        # Login first
        request = LoginRequest(username="admin", password="admin123")
        client_info = {"ip_address": "127.0.0.1", "user_agent": "test-agent"}
        login_response = await auth_manager.login(request, client_info)

        assert login_response.token is not None

        # Get session info
        context = await auth_manager.verify_token(login_response.token.access_token)
        assert context is not None

        # Logout
        result = await auth_manager.logout(context.session_id, context.user.id)

        assert result is True


class TestPasswordHash:
    """Tests for password hashing."""

    @pytest.fixture
    def security_config_obj(
        self, security_config: dict[str, Any]
    ) -> SecurityConfig:
        """Create security configuration object."""
        return SecurityConfig(**security_config)

    @pytest.fixture
    def encryption_manager(
        self, security_config_obj: SecurityConfig
    ) -> EncryptionManager:
        """Create encryption manager instance."""
        return EncryptionManager(security_config_obj)

    def test_hash_password(self, encryption_manager: EncryptionManager) -> None:
        """Test password hashing."""
        password = "mysecretpassword"
        hashed = encryption_manager.hash_password(password)

        assert hashed is not None
        assert hashed != password
        assert hashed.startswith("$2")  # bcrypt prefix

    def test_verify_password_correct(
        self, encryption_manager: EncryptionManager
    ) -> None:
        """Test verifying correct password."""
        password = "mysecretpassword"
        hashed = encryption_manager.hash_password(password)

        result = encryption_manager.verify_password(password, hashed)

        assert result is True

    def test_verify_password_incorrect(
        self, encryption_manager: EncryptionManager
    ) -> None:
        """Test verifying incorrect password."""
        password = "mysecretpassword"
        wrong_password = "wrongpassword"
        hashed = encryption_manager.hash_password(password)

        result = encryption_manager.verify_password(wrong_password, hashed)

        assert result is False

    def test_different_passwords_different_hashes(
        self, encryption_manager: EncryptionManager
    ) -> None:
        """Test that different passwords produce different hashes."""
        hash1 = encryption_manager.hash_password("password1")
        hash2 = encryption_manager.hash_password("password2")

        assert hash1 != hash2

    def test_same_password_different_hashes(
        self, encryption_manager: EncryptionManager
    ) -> None:
        """Test that same password produces different hashes (salt)."""
        password = "samepassword"
        hash1 = encryption_manager.hash_password(password)
        hash2 = encryption_manager.hash_password(password)

        assert hash1 != hash2  # Different salts


class TestEncryptionDecrypt:
    """Tests for encryption and decryption."""

    @pytest.fixture
    def security_config_obj(
        self, security_config: dict[str, Any]
    ) -> SecurityConfig:
        """Create security configuration object."""
        return SecurityConfig(**security_config)

    @pytest.fixture
    def encryption_manager(
        self, security_config_obj: SecurityConfig
    ) -> EncryptionManager:
        """Create encryption manager instance."""
        return EncryptionManager(security_config_obj)

    @pytest.mark.asyncio
    async def test_encrypt_data(
        self, encryption_manager: EncryptionManager
    ) -> None:
        """Test data encryption."""
        plaintext = "sensitive data"

        result = await encryption_manager.encrypt(plaintext)

        assert result is not None
        assert result.encrypted is not None
        assert result.iv is not None
        assert result.tag is not None
        assert result.encrypted != plaintext

    @pytest.mark.asyncio
    async def test_decrypt_data(
        self, encryption_manager: EncryptionManager
    ) -> None:
        """Test data decryption."""
        plaintext = "sensitive data to decrypt"

        encrypted = await encryption_manager.encrypt(plaintext)
        decrypted = await encryption_manager.decrypt(
            DecryptionInput(
                encrypted=encrypted.encrypted,
                iv=encrypted.iv,
                tag=encrypted.tag,
            )
        )

        assert decrypted == plaintext

    @pytest.mark.asyncio
    async def test_encrypt_unicode(
        self, encryption_manager: EncryptionManager
    ) -> None:
        """Test encrypting unicode data."""
        unicode_text = "한글 테스트 data"

        encrypted = await encryption_manager.encrypt(unicode_text)
        decrypted = await encryption_manager.decrypt(
            DecryptionInput(
                encrypted=encrypted.encrypted,
                iv=encrypted.iv,
                tag=encrypted.tag,
            )
        )

        assert decrypted == unicode_text

    @pytest.mark.asyncio
    async def test_create_hash(
        self, encryption_manager: EncryptionManager
    ) -> None:
        """Test creating SHA256 hash."""
        data = "data to hash"

        hash_result = await encryption_manager.create_hash(data)

        assert hash_result is not None
        assert len(hash_result) == 64  # SHA256 hex length

    @pytest.mark.asyncio
    async def test_create_hash_with_salt(
        self, encryption_manager: EncryptionManager
    ) -> None:
        """Test creating hash with salt."""
        data = "data to hash"
        salt = "mysalt"

        hash1 = await encryption_manager.create_hash(data)
        hash2 = await encryption_manager.create_hash(data, salt=salt)

        assert hash1 != hash2

    @pytest.mark.asyncio
    async def test_create_hmac(
        self, encryption_manager: EncryptionManager
    ) -> None:
        """Test creating HMAC."""
        data = "data for hmac"

        hmac_result = await encryption_manager.create_hmac(data)

        assert hmac_result is not None
        assert len(hmac_result) == 64  # SHA256 hex length

    def test_generate_secure_token(
        self, encryption_manager: EncryptionManager
    ) -> None:
        """Test generating secure random token."""
        token = encryption_manager.generate_secure_token(32)

        assert token is not None
        assert len(token) == 64  # 32 bytes = 64 hex chars

    @pytest.mark.asyncio
    async def test_secure_payload_token(
        self, encryption_manager: EncryptionManager
    ) -> None:
        """Test generating and verifying secure payload token."""
        payload = {"user_id": "123", "action": "reset"}

        token = await encryption_manager.generate_secure_payload_token(payload)
        verified = await encryption_manager.verify_secure_payload_token(token)

        assert verified is not None
        assert verified["user_id"] == "123"
        assert verified["action"] == "reset"

    @pytest.mark.asyncio
    async def test_secure_payload_token_expired(
        self, encryption_manager: EncryptionManager
    ) -> None:
        """Test expired secure payload token."""
        payload = {"user_id": "123"}

        # Generate token that expires immediately
        token = await encryption_manager.generate_secure_payload_token(
            payload, expires_in=-1000  # Already expired
        )
        verified = await encryption_manager.verify_secure_payload_token(token)

        assert verified is None


class TestRBACPermissionCheck:
    """Tests for RBAC permission checking."""

    @pytest.fixture
    def rbac_manager(self) -> RBACManager:
        """Create RBAC manager instance."""
        return RBACManager()

    def test_create_role(self, rbac_manager: RBACManager) -> None:
        """Test creating a role."""
        role = rbac_manager.create_role(
            name="test_role",
            description="Test role description",
        )

        assert role is not None
        assert role.name == "test_role"

    def test_create_permission(self, rbac_manager: RBACManager) -> None:
        """Test creating a permission."""
        permission = rbac_manager.create_permission(
            resource="events",
            action=PermissionAction.READ,
        )

        assert permission is not None
        assert permission.resource == "events"
        assert permission.action == PermissionAction.READ

    def test_assign_permission_to_role(self, rbac_manager: RBACManager) -> None:
        """Test assigning permission to a role."""
        role = rbac_manager.create_role("perm_role")
        permission = rbac_manager.create_permission("events", PermissionAction.READ)

        rbac_manager.add_permission_to_role(role.id, permission.id)

        role_perms = rbac_manager.get_role_permissions(role.id)
        assert len(role_perms) == 1
        assert role_perms[0].id == permission.id

    def test_check_permission_allowed(self, rbac_manager: RBACManager) -> None:
        """Test checking allowed permission."""
        role = rbac_manager.create_role("allowed_role")
        permission = rbac_manager.create_permission("events", PermissionAction.READ)
        rbac_manager.add_permission_to_role(role.id, permission.id)

        user = User(
            id="user1",
            username="testuser",
            email="test@test.com",
            password_hash="hash",
            roles=[role],
            is_active=True,
        )

        result = rbac_manager.check_permission(user, "events", PermissionAction.READ)

        assert result is True

    def test_check_permission_denied(self, rbac_manager: RBACManager) -> None:
        """Test checking denied permission."""
        role = rbac_manager.create_role("denied_role")
        # No permissions assigned

        user = User(
            id="user2",
            username="testuser2",
            email="test2@test.com",
            password_hash="hash",
            roles=[role],
            is_active=True,
        )

        result = rbac_manager.check_permission(user, "events", PermissionAction.DELETE)

        assert result is False

    def test_admin_permission(self, rbac_manager: RBACManager) -> None:
        """Test admin permission grants all access."""
        role = rbac_manager.create_role("admin_role")
        admin_perm = rbac_manager.create_permission("*", PermissionAction.ADMIN)
        rbac_manager.add_permission_to_role(role.id, admin_perm.id)

        user = User(
            id="admin",
            username="admin",
            email="admin@test.com",
            password_hash="hash",
            roles=[role],
            is_active=True,
        )

        result = rbac_manager.check_permission(user, "anything", PermissionAction.DELETE)

        assert result is True

    def test_remove_permission_from_role(self, rbac_manager: RBACManager) -> None:
        """Test removing permission from a role."""
        role = rbac_manager.create_role("remove_role")
        permission = rbac_manager.create_permission("events", PermissionAction.READ)
        rbac_manager.add_permission_to_role(role.id, permission.id)

        rbac_manager.remove_permission_from_role(role.id, permission.id)

        role_perms = rbac_manager.get_role_permissions(role.id)
        assert len(role_perms) == 0


class TestAuditLog:
    """Tests for audit logging."""

    @pytest.fixture
    def audit_logger(self, tmp_path) -> AuditLogger:
        """Create audit logger instance."""
        return AuditLogger(log_dir=str(tmp_path))

    @pytest.mark.asyncio
    async def test_log_security_event(
        self, audit_logger: AuditLogger
    ) -> None:
        """Test logging a security event."""
        await audit_logger.log_event(
            event_type="login",
            user_id="user123",
            username="testuser",
            ip_address="127.0.0.1",
            user_agent="test-agent",
            success=True,
            message="User logged in",
        )

        logs = await audit_logger.query_logs(user_id="user123")

        assert len(logs) == 1
        assert logs[0]["user_id"] == "user123"

    @pytest.mark.asyncio
    async def test_log_with_metadata(
        self, audit_logger: AuditLogger
    ) -> None:
        """Test logging with metadata."""
        await audit_logger.log_event(
            event_type="access",
            user_id="user456",
            success=True,
            message="Resource accessed",
            metadata={"resource": "events", "action": "read"},
        )

        logs = await audit_logger.query_logs(user_id="user456")

        assert len(logs) == 1
        assert logs[0]["metadata"]["resource"] == "events"

    @pytest.mark.asyncio
    async def test_query_logs_by_event_type(
        self, audit_logger: AuditLogger
    ) -> None:
        """Test querying logs by event type."""
        await audit_logger.log_event(
            event_type="login",
            user_id="user1",
            success=True,
            message="Login",
        )
        await audit_logger.log_event(
            event_type="logout",
            user_id="user1",
            success=True,
            message="Logout",
        )

        login_logs = await audit_logger.query_logs(event_type="login")

        assert len(login_logs) == 1
        assert login_logs[0]["event_type"] == "login"

    @pytest.mark.asyncio
    async def test_query_logs_by_time_range(
        self, audit_logger: AuditLogger
    ) -> None:
        """Test querying logs by time range."""
        await audit_logger.log_event(
            event_type="test",
            user_id="user1",
            success=True,
            message="Test event",
        )

        now = datetime.now()
        start = now - timedelta(hours=1)
        end = now + timedelta(hours=1)

        logs = await audit_logger.query_logs(start_time=start, end_time=end)

        assert len(logs) >= 1

    @pytest.mark.asyncio
    async def test_audit_summary(
        self, audit_logger: AuditLogger
    ) -> None:
        """Test getting audit summary."""
        for i in range(5):
            await audit_logger.log_event(
                event_type="login" if i % 2 == 0 else "logout",
                user_id=f"user{i}",
                success=i != 3,
                message="Test",
            )

        summary = await audit_logger.get_summary()

        assert summary["total_events"] == 5
        assert summary["successful_events"] == 4
        assert summary["failed_events"] == 1

    @pytest.mark.asyncio
    async def test_clear_old_logs(
        self, audit_logger: AuditLogger
    ) -> None:
        """Test clearing old logs."""
        await audit_logger.log_event(
            event_type="old",
            user_id="user1",
            success=True,
            message="Old event",
        )

        # Clear logs older than a future time (should clear all)
        future = datetime.now() + timedelta(days=1)
        count = await audit_logger.clear_logs(older_than=future)

        assert count >= 1

        remaining = await audit_logger.query_logs()
        assert len(remaining) == 0
