"""MCP 서버 설정 관리.

DevFlow Monitor MCP 서버의 모든 설정을 중앙에서 관리합니다.
pydantic-settings를 사용하여 환경 변수 및 설정 파일을 지원합니다.
"""

import os
from functools import lru_cache
from typing import Self

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class ServerInfo(BaseSettings):
    """서버 기본 정보 설정."""

    model_config = SettingsConfigDict(
        env_prefix="DEVFLOW_SERVER_",
        extra="ignore",
    )

    name: str = Field(
        default="devflow-monitor-mcp",
        description="서버 이름",
    )
    version: str = Field(
        default="0.1.0",
        description="서버 버전",
    )
    description: str = Field(
        default="AI-powered development process monitoring MCP server",
        description="서버 설명",
    )


class ProtocolCapabilities(BaseSettings):
    """MCP 프로토콜 기능 설정."""

    model_config = SettingsConfigDict(
        env_prefix="DEVFLOW_PROTOCOL_",
        extra="ignore",
    )

    tools: bool = Field(default=True, description="도구 기능 활성화")
    resources: bool = Field(default=True, description="리소스 기능 활성화")
    prompts: bool = Field(default=False, description="프롬프트 기능 활성화")
    logging: bool = Field(default=True, description="로깅 기능 활성화")


class ProtocolConfig(BaseSettings):
    """MCP 프로토콜 설정."""

    model_config = SettingsConfigDict(
        env_prefix="DEVFLOW_PROTOCOL_",
        extra="ignore",
    )

    version: str = Field(
        default="2024-11-05",
        description="프로토콜 버전",
    )
    capabilities: ProtocolCapabilities = Field(
        default_factory=ProtocolCapabilities,
        description="프로토콜 기능",
    )


class DevelopmentConfig(BaseSettings):
    """개발 환경 설정."""

    model_config = SettingsConfigDict(
        env_prefix="DEVFLOW_DEV_",
        extra="ignore",
    )

    debug: bool = Field(
        default_factory=lambda: os.getenv("DEVFLOW_ENV", "development") != "production",
        description="디버그 모드",
    )
    log_level: str = Field(
        default="info",
        description="로그 레벨 (error, warn, info, debug)",
    )
    hot_reload: bool = Field(
        default_factory=lambda: os.getenv("DEVFLOW_ENV", "development") == "development",
        description="핫 리로드 활성화",
    )

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        """로그 레벨 유효성 검사."""
        allowed = {"error", "warn", "info", "debug"}
        if v.lower() not in allowed:
            raise ValueError(f"log_level must be one of {allowed}")
        return v.lower()


class FileWatchConfig(BaseSettings):
    """파일 감시 설정."""

    model_config = SettingsConfigDict(
        env_prefix="DEVFLOW_FILE_WATCH_",
        extra="ignore",
    )

    enabled: bool = Field(default=True, description="파일 감시 활성화")
    extensions: list[str] = Field(
        default=[
            ".py",
            ".pyi",
            ".json",
            ".yaml",
            ".yml",
            ".toml",
            ".md",
            ".txt",
        ],
        description="감시 대상 확장자",
    )
    ignore_patterns: list[str] = Field(
        default=[
            "__pycache__/**",
            ".git/**",
            ".venv/**",
            "venv/**",
            "*.pyc",
            "*.pyo",
            ".pytest_cache/**",
            ".mypy_cache/**",
            "*.egg-info/**",
            "dist/**",
            "build/**",
            ".env*",
            "*.log",
        ],
        description="무시할 패턴",
    )
    debounce_ms: int = Field(
        default=100,
        ge=0,
        description="디바운스 시간(밀리초)",
    )


class GitWatchConfig(BaseSettings):
    """Git 감시 설정."""

    model_config = SettingsConfigDict(
        env_prefix="DEVFLOW_GIT_WATCH_",
        extra="ignore",
    )

    enabled: bool = Field(default=True, description="Git 감시 활성화")
    auto_detect: bool = Field(default=True, description="자동 감지 활성화")
    branches: list[str] = Field(
        default=["main", "develop", "master"],
        description="감시 대상 브랜치",
    )


class MonitoringConfig(BaseSettings):
    """모니터링 설정."""

    model_config = SettingsConfigDict(
        env_prefix="DEVFLOW_MONITORING_",
        extra="ignore",
    )

    file_watch: FileWatchConfig = Field(
        default_factory=FileWatchConfig,
        description="파일 감시 설정",
    )
    git_watch: GitWatchConfig = Field(
        default_factory=GitWatchConfig,
        description="Git 감시 설정",
    )


class BackupConfig(BaseSettings):
    """백업 설정."""

    model_config = SettingsConfigDict(
        env_prefix="DEVFLOW_BACKUP_",
        extra="ignore",
    )

    enabled: bool = Field(default=True, description="백업 활성화")
    interval_ms: int = Field(
        default=60000,
        ge=1000,
        description="백업 주기(밀리초)",
    )


class StorageConfig(BaseSettings):
    """데이터 저장소 설정."""

    model_config = SettingsConfigDict(
        env_prefix="DEVFLOW_STORAGE_",
        extra="ignore",
    )

    type: str = Field(
        default="sqlite",
        description="저장소 유형 (sqlite, memory)",
    )
    path: str = Field(
        default="./data/devflow.db",
        description="데이터베이스 경로",
    )
    backup: BackupConfig = Field(
        default_factory=BackupConfig,
        description="백업 설정",
    )

    @field_validator("type")
    @classmethod
    def validate_storage_type(cls, v: str) -> str:
        """저장소 유형 유효성 검사."""
        allowed = {"sqlite", "memory"}
        if v.lower() not in allowed:
            raise ValueError(f"storage type must be one of {allowed}")
        return v.lower()


class EventsConfig(BaseSettings):
    """이벤트 시스템 설정."""

    model_config = SettingsConfigDict(
        env_prefix="DEVFLOW_EVENTS_",
        extra="ignore",
    )

    max_listeners: int = Field(
        default=100,
        gt=0,
        description="최대 리스너 수",
    )
    buffer_size: int = Field(
        default=1000,
        gt=0,
        description="버퍼 크기",
    )
    retry_attempts: int = Field(
        default=3,
        ge=0,
        description="재시도 횟수",
    )


class DatabaseConfig(BaseSettings):
    """데이터베이스 설정.

    StorageConfig의 별칭으로, 더 명확한 이름을 제공합니다.
    """

    model_config = SettingsConfigDict(
        env_prefix="DEVFLOW_DB_",
        extra="ignore",
    )

    type: str = Field(
        default="sqlite",
        description="데이터베이스 유형",
    )
    path: str = Field(
        default="./data/devflow.db",
        description="데이터베이스 경로",
    )
    pool_size: int = Field(
        default=5,
        gt=0,
        description="연결 풀 크기",
    )
    timeout: int = Field(
        default=30,
        gt=0,
        description="연결 타임아웃(초)",
    )

    @field_validator("type")
    @classmethod
    def validate_db_type(cls, v: str) -> str:
        """데이터베이스 유형 유효성 검사."""
        allowed = {"sqlite", "memory", "postgresql"}
        if v.lower() not in allowed:
            raise ValueError(f"database type must be one of {allowed}")
        return v.lower()


class ServerConfig(BaseSettings):
    """MCP 서버 전체 설정.

    환경 변수로 설정을 오버라이드할 수 있습니다.
    접두사: DEVFLOW_

    Examples:
        DEVFLOW_SERVER_NAME=my-server
        DEVFLOW_DEV_DEBUG=true
        DEVFLOW_STORAGE_PATH=/path/to/db
    """

    model_config = SettingsConfigDict(
        env_prefix="DEVFLOW_",
        env_nested_delimiter="__",
        extra="ignore",
    )

    server: ServerInfo = Field(
        default_factory=ServerInfo,
        description="서버 기본 정보",
    )
    protocol: ProtocolConfig = Field(
        default_factory=ProtocolConfig,
        description="프로토콜 설정",
    )
    development: DevelopmentConfig = Field(
        default_factory=DevelopmentConfig,
        description="개발 환경 설정",
    )
    monitoring: MonitoringConfig = Field(
        default_factory=MonitoringConfig,
        description="모니터링 설정",
    )
    storage: StorageConfig = Field(
        default_factory=StorageConfig,
        description="저장소 설정",
    )
    events: EventsConfig = Field(
        default_factory=EventsConfig,
        description="이벤트 설정",
    )

    @model_validator(mode="after")
    def validate_config(self) -> Self:
        """전체 설정 유효성 검사."""
        # 서버 이름 검증
        if not self.server.name or not self.server.name.strip():
            raise ValueError("Server name is required")

        # 서버 버전 검증
        if not self.server.version or not self.server.version.strip():
            raise ValueError("Server version is required")

        # 파일 감시 디바운스 검증
        if self.monitoring.file_watch.debounce_ms < 0:
            raise ValueError("File watch debounce must be non-negative")

        # 이벤트 설정 검증
        if self.events.max_listeners <= 0:
            raise ValueError("Max listeners must be positive")

        if self.events.buffer_size <= 0:
            raise ValueError("Buffer size must be positive")

        if self.events.retry_attempts < 0:
            raise ValueError("Retry attempts must be non-negative")

        return self


@lru_cache
def get_config() -> ServerConfig:
    """캐시된 서버 설정을 반환합니다.

    Returns:
        검증된 ServerConfig 인스턴스.

    Note:
        이 함수는 lru_cache를 사용하여 설정을 한 번만 로드합니다.
        설정을 다시 로드하려면 get_config.cache_clear()를 호출하세요.
    """
    return ServerConfig()


def load_config() -> ServerConfig:
    """새 서버 설정을 로드합니다.

    Returns:
        새로 생성된 ServerConfig 인스턴스.

    Note:
        캐시를 사용하지 않고 매번 새 인스턴스를 생성합니다.
        대부분의 경우 get_config()를 사용하는 것이 좋습니다.
    """
    return ServerConfig()


def validate_config(config: ServerConfig) -> None:
    """설정 유효성을 검사합니다.

    Args:
        config: 검사할 설정.

    Raises:
        ValueError: 설정이 유효하지 않은 경우.

    Note:
        ServerConfig는 생성 시 자동으로 유효성 검사를 수행합니다.
        이 함수는 명시적 검증이 필요한 경우에 사용합니다.
    """
    if not config.server.name or config.server.name.strip() == "":
        raise ValueError("Server name is required")

    if not config.server.version or config.server.version.strip() == "":
        raise ValueError("Server version is required")

    if config.monitoring.file_watch.debounce_ms < 0:
        raise ValueError("File watch debounce must be non-negative")

    if config.events.max_listeners <= 0:
        raise ValueError("Max listeners must be positive")

    if config.events.buffer_size <= 0:
        raise ValueError("Buffer size must be positive")

    if config.events.retry_attempts < 0:
        raise ValueError("Retry attempts must be non-negative")


# 기본 설정 인스턴스 (호환성을 위해 유지)
config = get_config()


# 기본 설정 값 (TypeScript defaultConfig와 동일)
DEFAULT_CONFIG = ServerConfig()
