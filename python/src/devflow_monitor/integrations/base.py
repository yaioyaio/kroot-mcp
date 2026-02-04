"""
Base API Client Module.

Provides abstract base class for all API integrations with common
functionality including authentication, retry logic, and error handling.
"""

from __future__ import annotations

import asyncio
import base64
import time
from abc import ABC, abstractmethod
from enum import Enum
from typing import Any

import httpx
from pydantic import BaseModel, Field
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

from ..events.engine import EventEngine, get_event_engine
from ..events.types import BaseEvent, EventCategory, EventSeverity


class AuthType(str, Enum):
    """Authentication types for API clients."""

    BEARER = "bearer"
    BASIC = "basic"
    API_KEY = "apikey"


class AuthConfig(BaseModel):
    """Authentication configuration."""

    type: AuthType
    token: str | None = None
    username: str | None = None
    password: str | None = None
    key_name: str | None = None
    key_value: str | None = None


class RetryConfig(BaseModel):
    """Retry configuration for API requests."""

    max_retries: int = 3
    base_delay: float = 1.0
    max_delay: float = 30.0
    exponential_base: float = 2.0
    jitter: float = 0.1


class APIClientConfig(BaseModel):
    """Configuration for API client."""

    base_url: str
    timeout: float = 10.0
    max_retries: int = 3
    retry_delay: float = 1.0
    headers: dict[str, str] = Field(default_factory=dict)
    auth: AuthConfig | None = None


class APIResponse(BaseModel):
    """API response wrapper."""

    status_code: int
    data: Any
    headers: dict[str, str] = Field(default_factory=dict)


class APIError(Exception):
    """API request error."""

    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        response_data: Any = None,
    ):
        """
        Initialize API error.

        Args:
            message: Error message.
            status_code: HTTP status code if available.
            response_data: Response data if available.
        """
        super().__init__(message)
        self.status_code = status_code
        self.response_data = response_data


def is_retryable_error(error: Exception) -> bool:
    """
    Check if error should trigger a retry.

    Args:
        error: Exception to check.

    Returns:
        True if error is retryable, False otherwise.
    """
    if isinstance(error, httpx.HTTPStatusError):
        status = error.response.status_code
        return status >= 500 or status == 429 or status == 408
    if isinstance(error, (httpx.TimeoutException, httpx.ConnectError)):
        return True
    return False


class BaseAPIClient(ABC):
    """
    Abstract base class for API clients.

    Provides common functionality for HTTP requests with authentication,
    retry logic, and event emission for monitoring.

    Attributes:
        config: API client configuration.
        event_engine: Optional event engine for emitting events.
    """

    def __init__(
        self,
        config: APIClientConfig,
        event_engine: EventEngine | None = None,
    ):
        """
        Initialize base API client.

        Args:
            config: API client configuration.
            event_engine: Optional event engine for emitting events.
        """
        self.config = config
        self.event_engine = event_engine or get_event_engine()
        self._client: httpx.AsyncClient | None = None

        self.retry_config = RetryConfig(
            max_retries=config.max_retries,
            base_delay=config.retry_delay,
        )

    async def connect(self) -> None:
        """Establish connection to API."""
        if self._client is None:
            headers = self._build_headers()
            self._client = httpx.AsyncClient(
                base_url=self.config.base_url,
                timeout=self.config.timeout,
                headers=headers,
            )

        await self._emit_event(
            event_type="api:connected",
            severity=EventSeverity.INFO,
            data={
                "client_name": self.get_name(),
                "base_url": self.config.base_url,
            },
        )

    async def disconnect(self) -> None:
        """Close connection to API."""
        if self._client is not None:
            await self._client.aclose()
            self._client = None

        await self._emit_event(
            event_type="api:disconnected",
            severity=EventSeverity.INFO,
            data={"client_name": self.get_name()},
        )

    def _build_headers(self) -> dict[str, str]:
        """
        Build request headers including authentication.

        Returns:
            Dictionary of headers.
        """
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "DevFlow-Monitor-MCP/0.1.0",
            **self.config.headers,
        }

        if self.config.auth:
            self._add_auth_headers(headers, self.config.auth)

        return headers

    def _add_auth_headers(
        self,
        headers: dict[str, str],
        auth: AuthConfig,
    ) -> None:
        """
        Add authentication headers.

        Args:
            headers: Headers dictionary to modify.
            auth: Authentication configuration.
        """
        if auth.type == AuthType.BEARER and auth.token:
            headers["Authorization"] = f"Bearer {auth.token}"

        elif auth.type == AuthType.BASIC and auth.username and auth.password:
            credentials = f"{auth.username}:{auth.password}"
            encoded = base64.b64encode(credentials.encode()).decode()
            headers["Authorization"] = f"Basic {encoded}"

        elif auth.type == AuthType.API_KEY and auth.key_name and auth.key_value:
            headers[auth.key_name] = auth.key_value

    async def _ensure_connected(self) -> None:
        """Ensure client is connected."""
        if self._client is None:
            await self.connect()

    async def _request(
        self,
        method: str,
        endpoint: str,
        **kwargs: Any,
    ) -> APIResponse:
        """
        Make HTTP request with retry logic.

        Args:
            method: HTTP method.
            endpoint: API endpoint.
            **kwargs: Additional request arguments.

        Returns:
            API response.

        Raises:
            APIError: If request fails after retries.
        """
        await self._ensure_connected()
        assert self._client is not None

        start_time = time.time()

        await self._emit_event(
            event_type="api:request_start",
            severity=EventSeverity.DEBUG,
            data={
                "url": endpoint,
                "method": method.upper(),
                "base_url": self.config.base_url,
            },
        )

        last_error: Exception | None = None

        for attempt in range(self.retry_config.max_retries + 1):
            try:
                response = await self._client.request(method, endpoint, **kwargs)
                response.raise_for_status()

                response_time = time.time() - start_time

                await self._emit_event(
                    event_type="api:response_success",
                    severity=EventSeverity.DEBUG,
                    data={
                        "url": endpoint,
                        "status": response.status_code,
                        "response_time_ms": response_time * 1000,
                        "attempt": attempt + 1,
                    },
                )

                # Parse JSON response if possible
                try:
                    data = response.json()
                except Exception:
                    data = response.text

                return APIResponse(
                    status_code=response.status_code,
                    data=data,
                    headers=dict(response.headers),
                )

            except Exception as e:
                last_error = e
                should_retry = is_retryable_error(e) and attempt < self.retry_config.max_retries

                if should_retry:
                    delay = self._calculate_delay(attempt)

                    await self._emit_event(
                        event_type="api:retry_attempt",
                        severity=EventSeverity.WARNING,
                        data={
                            "url": endpoint,
                            "attempt": attempt + 1,
                            "max_retries": self.retry_config.max_retries,
                            "delay_ms": delay * 1000,
                            "error": str(e),
                        },
                    )

                    await asyncio.sleep(delay)
                else:
                    break

        # All retries exhausted
        await self._emit_event(
            event_type="api:max_retries_exceeded",
            severity=EventSeverity.ERROR,
            data={
                "url": endpoint,
                "max_retries": self.retry_config.max_retries,
                "final_error": str(last_error),
            },
        )

        status_code = None
        response_data = None

        if isinstance(last_error, httpx.HTTPStatusError):
            status_code = last_error.response.status_code
            try:
                response_data = last_error.response.json()
            except Exception:
                response_data = last_error.response.text

        raise APIError(
            message=str(last_error),
            status_code=status_code,
            response_data=response_data,
        )

    def _calculate_delay(self, attempt: int) -> float:
        """
        Calculate retry delay with exponential backoff and jitter.

        Args:
            attempt: Current attempt number (0-indexed).

        Returns:
            Delay in seconds.
        """
        import random

        delay = min(
            self.retry_config.base_delay * (self.retry_config.exponential_base ** attempt),
            self.retry_config.max_delay,
        )

        jitter = delay * self.retry_config.jitter * random.random()
        return delay + jitter

    async def get(
        self,
        endpoint: str,
        params: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> APIResponse:
        """
        Make GET request.

        Args:
            endpoint: API endpoint.
            params: Query parameters.
            **kwargs: Additional request arguments.

        Returns:
            API response.
        """
        return await self._request("GET", endpoint, params=params, **kwargs)

    async def post(
        self,
        endpoint: str,
        data: Any = None,
        json: Any = None,
        **kwargs: Any,
    ) -> APIResponse:
        """
        Make POST request.

        Args:
            endpoint: API endpoint.
            data: Request data.
            json: JSON data.
            **kwargs: Additional request arguments.

        Returns:
            API response.
        """
        return await self._request("POST", endpoint, data=data, json=json, **kwargs)

    async def put(
        self,
        endpoint: str,
        data: Any = None,
        json: Any = None,
        **kwargs: Any,
    ) -> APIResponse:
        """
        Make PUT request.

        Args:
            endpoint: API endpoint.
            data: Request data.
            json: JSON data.
            **kwargs: Additional request arguments.

        Returns:
            API response.
        """
        return await self._request("PUT", endpoint, data=data, json=json, **kwargs)

    async def patch(
        self,
        endpoint: str,
        data: Any = None,
        json: Any = None,
        **kwargs: Any,
    ) -> APIResponse:
        """
        Make PATCH request.

        Args:
            endpoint: API endpoint.
            data: Request data.
            json: JSON data.
            **kwargs: Additional request arguments.

        Returns:
            API response.
        """
        return await self._request("PATCH", endpoint, data=data, json=json, **kwargs)

    async def delete(
        self,
        endpoint: str,
        **kwargs: Any,
    ) -> APIResponse:
        """
        Make DELETE request.

        Args:
            endpoint: API endpoint.
            **kwargs: Additional request arguments.

        Returns:
            API response.
        """
        return await self._request("DELETE", endpoint, **kwargs)

    def update_auth(self, auth: AuthConfig | None) -> None:
        """
        Update authentication configuration.

        Args:
            auth: New authentication configuration.
        """
        self.config.auth = auth

        # Update client headers if connected
        if self._client is not None:
            headers = self._build_headers()
            self._client.headers.update(headers)

    def get_stats(self) -> dict[str, Any]:
        """
        Get client statistics.

        Returns:
            Dictionary with client stats.
        """
        return {
            "base_url": self.config.base_url,
            "timeout": self.config.timeout,
            "max_retries": self.retry_config.max_retries,
            "auth_type": self.config.auth.type if self.config.auth else None,
            "has_auth": self.config.auth is not None,
            "is_connected": self._client is not None,
        }

    async def _emit_event(
        self,
        event_type: str,
        severity: EventSeverity,
        data: dict[str, Any],
    ) -> None:
        """
        Emit an event through the event engine.

        Args:
            event_type: Event type string.
            severity: Event severity.
            data: Event data.
        """
        if self.event_engine is not None:
            event = BaseEvent(
                type=event_type,
                category=EventCategory.API,
                severity=severity,
                source=self.get_name(),
                data=data,
            )
            await self.event_engine.publish(event)

    @abstractmethod
    def get_name(self) -> str:
        """
        Get client name.

        Returns:
            Client name string.
        """
        pass

    @abstractmethod
    async def is_healthy(self) -> bool:
        """
        Check if API connection is healthy.

        Returns:
            True if healthy, False otherwise.
        """
        pass

    @abstractmethod
    async def validate_connection(self) -> bool:
        """
        Validate API connection and credentials.

        Returns:
            True if valid, False otherwise.
        """
        pass

    async def health_check(self) -> bool:
        """
        Perform health check (alias for is_healthy).

        Returns:
            True if healthy, False otherwise.
        """
        return await self.is_healthy()
