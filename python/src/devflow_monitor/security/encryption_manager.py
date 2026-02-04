"""
Encryption Manager
데이터 암호화 및 복호화 관리 시스템

This module provides encryption functionality using AES-256-GCM,
including encryption, decryption, hashing, HMAC, and key rotation.
"""

import base64
import hashlib
import hmac as hmac_module
import json
import os
import secrets
import threading
from datetime import datetime
from typing import Any, Optional
from uuid import uuid4

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .types import (
    DecryptionInput,
    EncryptionResult,
    SecurityConfig,
    SecurityEvent,
    SecurityEventType,
)


class EncryptionKey:
    """Encryption key data class."""

    def __init__(
        self,
        key_id: str,
        key: bytes,
        algorithm: str,
        created_at: datetime,
        is_active: bool,
        version: int,
    ) -> None:
        """Initialize encryption key."""
        self.id = key_id
        self.key = key
        self.algorithm = algorithm
        self.created_at = created_at
        self.is_active = is_active
        self.version = version


class KeyRotationConfig:
    """Key rotation configuration."""

    def __init__(
        self,
        enabled: bool = False,
        interval_days: int = 30,
        keep_old_keys: int = 5,
    ) -> None:
        """Initialize key rotation config."""
        self.enabled = enabled
        self.interval_days = interval_days
        self.keep_old_keys = keep_old_keys


class EncryptionManager:
    """
    Encryption Manager for data encryption and decryption.

    Provides functionality for:
    - AES-256-GCM encryption/decryption
    - Secure hashing with optional salt
    - HMAC generation
    - Secure token generation and verification
    - Key rotation

    Args:
        config: Security configuration
        key_rotation_config: Optional key rotation configuration

    Example:
        >>> manager = EncryptionManager(config)
        >>> result = await manager.encrypt("sensitive data")
        >>> decrypted = await manager.decrypt(result)
    """

    DEFAULT_ALGORITHM = "aes-256-gcm"
    DEFAULT_KEY_LENGTH = 32
    DEFAULT_IV_LENGTH = 16

    def __init__(
        self,
        config: SecurityConfig,
        key_rotation_config: Optional[KeyRotationConfig] = None,
    ) -> None:
        """Initialize the encryption manager."""
        self.config = config
        self._keys: dict[str, EncryptionKey] = {}
        self._active_key_id: Optional[str] = None
        self._key_rotation_timer: Optional[threading.Timer] = None
        self._event_handlers: list[Any] = []

        # Initialize encryption
        self._initialize_encryption()

        # Start key rotation if enabled
        if key_rotation_config and key_rotation_config.enabled:
            self._start_key_rotation(key_rotation_config)

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
        resource: Optional[str] = None,
        action: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> None:
        """Create and emit a security event."""
        event = SecurityEvent(
            id=str(uuid4()),
            type=event_type,
            ip_address="localhost",
            user_agent="encryption-manager",
            resource=resource,
            action=action,
            success=success,
            message=message,
            metadata=metadata,
            timestamp=datetime.now(),
        )
        self._emit_security_event(event)

    def _initialize_encryption(self) -> None:
        """Initialize the encryption system."""
        master_key = self._generate_encryption_key()
        self._active_key_id = master_key.id

        self._log_security_event(
            event_type=SecurityEventType.ENCRYPTION_INITIALIZED,
            resource="encryption",
            action="create",
            success=True,
            message="Encryption system initialized with master key",
        )

    def _generate_encryption_key(
        self, version: Optional[int] = None
    ) -> EncryptionKey:
        """Generate a new encryption key."""
        key_id = str(uuid4())
        key_length = self.config.encryption_key_length or self.DEFAULT_KEY_LENGTH
        key = os.urandom(key_length)

        encryption_key = EncryptionKey(
            key_id=key_id,
            key=key,
            algorithm=self.DEFAULT_ALGORITHM,
            created_at=datetime.now(),
            is_active=True,
            version=version or 1,
        )

        self._keys[key_id] = encryption_key
        return encryption_key

    def _get_active_key(self) -> Optional[EncryptionKey]:
        """Get the active encryption key."""
        if not self._active_key_id:
            return None
        return self._keys.get(self._active_key_id)

    async def encrypt(
        self,
        data: str | bytes,
        iv_length: int = DEFAULT_IV_LENGTH,
        encoding: str = "base64",
    ) -> EncryptionResult:
        """
        Encrypt data using AES-256-GCM.

        Args:
            data: Data to encrypt (string or bytes)
            iv_length: Length of initialization vector
            encoding: Output encoding (base64)

        Returns:
            EncryptionResult with encrypted data, IV, and auth tag

        Raises:
            ValueError: If no active encryption key is available
            Exception: If encryption fails
        """
        try:
            active_key = self._get_active_key()
            if not active_key:
                raise ValueError("No active encryption key available")

            # Convert string to bytes if necessary
            if isinstance(data, str):
                input_bytes = data.encode("utf-8")
            else:
                input_bytes = data

            # Generate IV
            iv = os.urandom(iv_length)

            # Create AESGCM cipher
            aesgcm = AESGCM(active_key.key)

            # Additional authenticated data (AAD)
            aad = active_key.id.encode("utf-8")

            # Encrypt
            ciphertext_with_tag = aesgcm.encrypt(iv, input_bytes, aad)

            # Separate ciphertext and tag (last 16 bytes is the tag)
            ciphertext = ciphertext_with_tag[:-16]
            tag = ciphertext_with_tag[-16:]

            # Encode results
            if encoding == "base64":
                encrypted = base64.b64encode(ciphertext).decode("utf-8")
                iv_encoded = base64.b64encode(iv).decode("utf-8")
                tag_encoded = base64.b64encode(tag).decode("utf-8")
            else:
                encrypted = ciphertext.hex()
                iv_encoded = iv.hex()
                tag_encoded = tag.hex()

            self._log_security_event(
                event_type=SecurityEventType.DATA_ENCRYPTED,
                resource="encryption",
                action="create",
                success=True,
                message=f"Data encrypted using key {active_key.id}",
                metadata={
                    "key_id": active_key.id,
                    "algorithm": active_key.algorithm,
                    "data_size": len(input_bytes),
                },
            )

            return EncryptionResult(
                encrypted=encrypted,
                iv=iv_encoded,
                tag=tag_encoded,
            )

        except Exception as e:
            self._log_security_event(
                event_type=SecurityEventType.ENCRYPTION_FAILED,
                resource="encryption",
                action="create",
                success=False,
                message=f"Encryption failed: {str(e)}",
            )
            raise ValueError(f"Encryption failed: {str(e)}") from e

    async def decrypt(
        self,
        input_data: DecryptionInput,
        key_id: Optional[str] = None,
        encoding: str = "base64",
    ) -> str:
        """
        Decrypt data using AES-256-GCM.

        Args:
            input_data: DecryptionInput with encrypted data, IV, and tag
            key_id: Optional specific key ID to use
            encoding: Input encoding (base64)

        Returns:
            Decrypted string

        Raises:
            ValueError: If decryption key not found or decryption fails
        """
        try:
            key = self._keys.get(key_id) if key_id else self._get_active_key()
            if not key:
                raise ValueError(
                    f"Encryption key not found: {key_id or 'active key'}"
                )

            # Decode inputs
            if encoding == "base64":
                ciphertext = base64.b64decode(input_data.encrypted)
                iv = base64.b64decode(input_data.iv)
                tag = (
                    base64.b64decode(input_data.tag)
                    if input_data.tag
                    else b""
                )
            else:
                ciphertext = bytes.fromhex(input_data.encrypted)
                iv = bytes.fromhex(input_data.iv)
                tag = (
                    bytes.fromhex(input_data.tag)
                    if input_data.tag
                    else b""
                )

            # Create AESGCM cipher
            aesgcm = AESGCM(key.key)

            # Additional authenticated data (AAD)
            aad = key.id.encode("utf-8")

            # Combine ciphertext and tag
            ciphertext_with_tag = ciphertext + tag

            # Decrypt
            plaintext = aesgcm.decrypt(iv, ciphertext_with_tag, aad)

            result = plaintext.decode("utf-8")

            self._log_security_event(
                event_type=SecurityEventType.DATA_DECRYPTED,
                resource="encryption",
                action="read",
                success=True,
                message=f"Data decrypted using key {key.id}",
                metadata={
                    "key_id": key.id,
                    "algorithm": key.algorithm,
                    "data_size": len(result),
                },
            )

            return result

        except Exception as e:
            self._log_security_event(
                event_type=SecurityEventType.DECRYPTION_FAILED,
                resource="encryption",
                action="read",
                success=False,
                message=f"Decryption failed: {str(e)}",
            )
            raise ValueError(f"Decryption failed: {str(e)}") from e

    async def create_hash(
        self,
        data: str | bytes,
        algorithm: str = "sha256",
        salt: Optional[str] = None,
    ) -> str:
        """
        Create a hash of the data.

        Args:
            data: Data to hash
            algorithm: Hash algorithm (sha256, sha512, etc.)
            salt: Optional salt to add

        Returns:
            Hex-encoded hash string
        """
        try:
            if isinstance(data, bytes):
                input_data = data.decode("utf-8")
            else:
                input_data = data

            salted_data = f"{input_data}{salt}" if salt else input_data

            hash_obj = hashlib.new(algorithm)
            hash_obj.update(salted_data.encode("utf-8"))
            result = hash_obj.hexdigest()

            self._log_security_event(
                event_type=SecurityEventType.HASH_CREATED,
                resource="encryption",
                action="create",
                success=True,
                message=f"Hash created using {algorithm}",
                metadata={
                    "algorithm": algorithm,
                    "has_salt": salt is not None,
                    "input_size": len(input_data),
                },
            )

            return result

        except Exception as e:
            self._log_security_event(
                event_type=SecurityEventType.HASH_FAILED,
                resource="encryption",
                action="create",
                success=False,
                message=f"Hash creation failed: {str(e)}",
            )
            raise ValueError(f"Hash creation failed: {str(e)}") from e

    async def create_hmac(
        self,
        data: str | bytes,
        secret: Optional[str] = None,
        algorithm: str = "sha256",
    ) -> str:
        """
        Create an HMAC of the data.

        Args:
            data: Data to create HMAC for
            secret: Optional secret key (uses active key if not provided)
            algorithm: Hash algorithm

        Returns:
            Hex-encoded HMAC string
        """
        try:
            active_key = self._get_active_key()
            secret_key = secret or (
                active_key.key.hex() if active_key else ""
            )

            if not secret_key:
                raise ValueError("No secret key available for HMAC")

            if isinstance(data, bytes):
                input_data = data.decode("utf-8")
            else:
                input_data = data

            hmac_obj = hmac_module.new(
                secret_key.encode("utf-8"),
                input_data.encode("utf-8"),
                algorithm,
            )
            result = hmac_obj.hexdigest()

            self._log_security_event(
                event_type=SecurityEventType.HMAC_CREATED,
                resource="encryption",
                action="create",
                success=True,
                message=f"HMAC created using {algorithm}",
                metadata={
                    "algorithm": algorithm,
                    "input_size": len(input_data),
                },
            )

            return result

        except Exception as e:
            self._log_security_event(
                event_type=SecurityEventType.HMAC_FAILED,
                resource="encryption",
                action="create",
                success=False,
                message=f"HMAC creation failed: {str(e)}",
            )
            raise ValueError(f"HMAC creation failed: {str(e)}") from e

    def hash_password(self, password: str) -> str:
        """
        Hash a password using bcrypt.

        Args:
            password: Password to hash

        Returns:
            Hashed password string
        """
        import bcrypt

        return bcrypt.hashpw(
            password.encode("utf-8"), bcrypt.gensalt()
        ).decode("utf-8")

    def verify_password(self, password: str, hashed: str) -> bool:
        """
        Verify a password against a hash.

        Args:
            password: Password to verify
            hashed: Hashed password

        Returns:
            True if password matches
        """
        import bcrypt

        return bcrypt.checkpw(
            password.encode("utf-8"), hashed.encode("utf-8")
        )

    def generate_secure_token(self, length: int = 32) -> str:
        """
        Generate a secure random token.

        Args:
            length: Length of the token in bytes

        Returns:
            Hex-encoded secure token
        """
        return secrets.token_hex(length)

    async def generate_secure_payload_token(
        self,
        payload: dict[str, Any],
        expires_in: Optional[int] = None,
    ) -> str:
        """
        Generate an encrypted token containing a payload.

        Args:
            payload: Data to include in the token
            expires_in: Optional expiration time in milliseconds

        Returns:
            Base64-encoded encrypted token
        """
        try:
            token_data = {
                **payload,
                "id": str(uuid4()),
                "created_at": int(datetime.now().timestamp() * 1000),
            }

            if expires_in:
                token_data["expires_at"] = token_data["created_at"] + expires_in

            token_string = json.dumps(token_data)
            encrypted = await self.encrypt(token_string)

            # Token format: keyId.encrypted.iv.tag
            parts = [
                self._active_key_id or "",
                encrypted.encrypted,
                encrypted.iv,
                encrypted.tag or "",
            ]

            token = base64.urlsafe_b64encode(
                ".".join(parts).encode("utf-8")
            ).decode("utf-8")

            self._log_security_event(
                event_type=SecurityEventType.SECURE_TOKEN_CREATED,
                resource="encryption",
                action="create",
                success=True,
                message="Secure token generated",
                metadata={
                    "token_id": token_data["id"],
                    "expires_in": expires_in,
                    "payload_keys": list(payload.keys()),
                },
            )

            return token

        except Exception as e:
            self._log_security_event(
                event_type=SecurityEventType.TOKEN_CREATION_FAILED,
                resource="encryption",
                action="create",
                success=False,
                message=f"Token creation failed: {str(e)}",
            )
            raise ValueError(f"Token creation failed: {str(e)}") from e

    async def verify_secure_payload_token(
        self, token: str
    ) -> Optional[dict[str, Any]]:
        """
        Verify and decrypt a secure payload token.

        Args:
            token: Base64-encoded encrypted token

        Returns:
            Decrypted payload or None if invalid/expired
        """
        try:
            token_string = base64.urlsafe_b64decode(token).decode("utf-8")
            parts = token_string.split(".")

            if len(parts) != 4:
                raise ValueError("Invalid token format")

            key_id, encrypted, iv, tag = parts

            decryption_input = DecryptionInput(
                encrypted=encrypted,
                iv=iv,
                tag=tag if tag else None,
            )

            decrypted_data = await self.decrypt(
                decryption_input, key_id if key_id else None
            )
            token_data = json.loads(decrypted_data)

            # Check expiration
            if (
                "expires_at" in token_data
                and datetime.now().timestamp() * 1000 > token_data["expires_at"]
            ):
                self._log_security_event(
                    event_type=SecurityEventType.TOKEN_EXPIRED,
                    resource="encryption",
                    action="read",
                    success=False,
                    message="Token verification failed: expired",
                    metadata={"token_id": token_data.get("id")},
                )
                return None

            self._log_security_event(
                event_type=SecurityEventType.TOKEN_VERIFIED,
                resource="encryption",
                action="read",
                success=True,
                message="Token verified successfully",
                metadata={"token_id": token_data.get("id")},
            )

            return token_data

        except Exception as e:
            self._log_security_event(
                event_type=SecurityEventType.TOKEN_VERIFICATION_FAILED,
                resource="encryption",
                action="read",
                success=False,
                message=f"Token verification failed: {str(e)}",
            )
            return None

    async def rotate_keys(self) -> None:
        """Rotate encryption keys."""
        try:
            old_key = self._get_active_key()
            new_key = self._generate_encryption_key(
                old_key.version + 1 if old_key else 1
            )

            # Deactivate old key
            if old_key:
                old_key.is_active = False

            self._active_key_id = new_key.id

            self._log_security_event(
                event_type=SecurityEventType.KEY_ROTATED,
                resource="encryption",
                action="update",
                success=True,
                message="Encryption keys rotated",
                metadata={
                    "old_key_id": old_key.id if old_key else None,
                    "new_key_id": new_key.id,
                    "new_version": new_key.version,
                },
            )

        except Exception as e:
            self._log_security_event(
                event_type=SecurityEventType.KEY_ROTATION_FAILED,
                resource="encryption",
                action="update",
                success=False,
                message=f"Key rotation failed: {str(e)}",
            )
            raise ValueError(f"Key rotation failed: {str(e)}") from e

    async def cleanup_old_keys(self, keep_count: int = 5) -> None:
        """
        Clean up old encryption keys.

        Args:
            keep_count: Number of keys to keep
        """
        all_keys = list(self._keys.values())
        sorted_keys = sorted(
            all_keys, key=lambda k: k.created_at, reverse=True
        )

        keys_to_delete = sorted_keys[keep_count:]
        deleted_count = 0

        for key in keys_to_delete:
            if not key.is_active:
                del self._keys[key.id]
                deleted_count += 1

        if deleted_count > 0:
            self._log_security_event(
                event_type=SecurityEventType.OLD_KEYS_CLEANED,
                resource="encryption",
                action="delete",
                success=True,
                message=f"Cleaned up {deleted_count} old encryption keys",
                metadata={
                    "deleted_count": deleted_count,
                    "keep_count": keep_count,
                },
            )

    def _start_key_rotation(self, config: KeyRotationConfig) -> None:
        """Start automatic key rotation."""
        interval_seconds = config.interval_days * 24 * 60 * 60

        def rotate() -> None:
            import asyncio

            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                loop.run_until_complete(self.rotate_keys())
                loop.run_until_complete(
                    self.cleanup_old_keys(config.keep_old_keys)
                )
                loop.close()
            except Exception as e:
                self._log_security_event(
                    event_type=SecurityEventType.AUTOMATIC_KEY_ROTATION_FAILED,
                    resource="encryption",
                    action="update",
                    success=False,
                    message=f"Automatic key rotation failed: {str(e)}",
                )
            finally:
                self._start_key_rotation(config)

        self._key_rotation_timer = threading.Timer(interval_seconds, rotate)
        self._key_rotation_timer.daemon = True
        self._key_rotation_timer.start()

        self._log_security_event(
            event_type=SecurityEventType.KEY_ROTATION_SCHEDULED,
            resource="encryption",
            action="create",
            success=True,
            message=f"Key rotation scheduled every {config.interval_days} days",
        )

    def get_encryption_stats(self) -> dict[str, Any]:
        """Get encryption statistics."""
        keys = list(self._keys.values())
        active_key = self._get_active_key()

        oldest_key_date = None
        if keys:
            oldest_key_date = min(k.created_at for k in keys).isoformat()

        return {
            "total_keys": len(keys),
            "active_key_id": self._active_key_id,
            "active_key_version": active_key.version if active_key else 0,
            "key_age_hours": (
                int(
                    (datetime.now() - active_key.created_at).total_seconds()
                    / 3600
                )
                if active_key
                else 0
            ),
            "algorithms": list(set(k.algorithm for k in keys)),
            "oldest_key_date": oldest_key_date,
        }

    def cleanup(self) -> None:
        """Clean up resources."""
        if self._key_rotation_timer:
            self._key_rotation_timer.cancel()

        self._keys.clear()
        self._active_key_id = None
        self._event_handlers.clear()
