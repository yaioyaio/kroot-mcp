"""MCP 서버 타입 정의.

DevFlow Monitor MCP 서버의 모든 도구 인자 및 응답 타입을 정의합니다.
Pydantic v2 BaseModel을 사용하여 타입 안전성과 유효성 검사를 제공합니다.
"""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# =============================================================================
# Enums
# =============================================================================


class TimeRange(str, Enum):
    """메트릭 조회 시간 범위."""

    ONE_HOUR = "1h"
    ONE_DAY = "1d"
    ONE_WEEK = "1w"
    ONE_MONTH = "1m"


class MetricType(str, Enum):
    """메트릭 유형."""

    ALL = "all"
    COMMITS = "commits"
    FILES = "files"
    TESTS = "tests"
    BUILDS = "builds"


class DevelopmentStage(str, Enum):
    """개발 단계."""

    PLANNING = "planning"
    DESIGN = "design"
    CODING = "coding"
    TESTING = "testing"
    REVIEW = "review"
    DEPLOYMENT = "deployment"
    MONITORING = "monitoring"


class AnalysisDepth(str, Enum):
    """분석 깊이."""

    BASIC = "basic"
    DETAILED = "detailed"
    COMPREHENSIVE = "comprehensive"


class Methodology(str, Enum):
    """개발 방법론."""

    ALL = "all"
    DDD = "ddd"
    TDD = "tdd"
    BDD = "bdd"
    EDA = "eda"


class ReportType(str, Enum):
    """보고서 유형."""

    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    CUSTOM = "custom"


class ReportFormat(str, Enum):
    """보고서 형식."""

    JSON = "json"
    MARKDOWN = "markdown"
    SUMMARY = "summary"


class ComplianceStatus(str, Enum):
    """방법론 준수 상태."""

    COMPLIANT = "compliant"
    PARTIAL = "partial"
    NON_COMPLIANT = "non-compliant"


# =============================================================================
# MCP Tool Input Schema
# =============================================================================


class McpToolInputSchema(BaseModel):
    """MCP 도구 입력 스키마."""

    type: str = Field(default="object", description="스키마 타입")
    properties: dict[str, Any] = Field(
        default_factory=dict,
        description="속성 정의",
    )
    required: list[str] | None = Field(
        default=None,
        description="필수 필드 목록",
    )


class McpTool(BaseModel):
    """MCP 도구 정의."""

    name: str = Field(..., description="도구 이름")
    description: str = Field(..., description="도구 설명")
    input_schema: McpToolInputSchema = Field(
        ...,
        alias="inputSchema",
        description="입력 스키마",
    )

    model_config = {"populate_by_name": True}


# =============================================================================
# Tool Arguments (도구 실행 인자)
# =============================================================================


class GetProjectStatusArgs(BaseModel):
    """프로젝트 상태 조회 인자."""

    include_details: bool = Field(
        default=False,
        alias="includeDetails",
        description="상세 정보 포함 여부",
    )

    model_config = {"populate_by_name": True}


class GetMetricsArgs(BaseModel):
    """메트릭 조회 인자."""

    time_range: TimeRange | None = Field(
        default=None,
        alias="timeRange",
        description="조회 시간 범위",
    )
    metric_type: MetricType | None = Field(
        default=None,
        alias="metricType",
        description="메트릭 유형",
    )

    model_config = {"populate_by_name": True}


class GetActivityLogArgs(BaseModel):
    """활동 로그 조회 인자."""

    limit: int | None = Field(
        default=None,
        ge=1,
        le=1000,
        description="최대 조회 개수",
    )
    stage: DevelopmentStage | None = Field(
        default=None,
        description="필터링할 개발 단계",
    )


class AnalyzeBottlenecksArgs(BaseModel):
    """병목 분석 인자."""

    analysis_depth: AnalysisDepth | None = Field(
        default=None,
        alias="analysisDepth",
        description="분석 깊이",
    )

    model_config = {"populate_by_name": True}


class CheckMethodologyArgs(BaseModel):
    """방법론 검사 인자."""

    methodology: Methodology | None = Field(
        default=None,
        description="검사할 방법론",
    )
    include_recommendations: bool = Field(
        default=False,
        alias="includeRecommendations",
        description="권장사항 포함 여부",
    )

    model_config = {"populate_by_name": True}


class GenerateReportArgs(BaseModel):
    """보고서 생성 인자."""

    report_type: ReportType | None = Field(
        default=None,
        alias="reportType",
        description="보고서 유형",
    )
    format: ReportFormat | None = Field(
        default=None,
        description="출력 형식",
    )
    include_metrics: bool = Field(
        default=False,
        alias="includeMetrics",
        description="메트릭 포함 여부",
    )
    include_trends: bool = Field(
        default=False,
        alias="includeTrends",
        description="트렌드 포함 여부",
    )

    model_config = {"populate_by_name": True}


class AnalyzeStageArgs(BaseModel):
    """개발 단계 분석 인자."""

    include_sub_stages: bool = Field(
        default=True,
        alias="includeSubStages",
        description="코딩 세부 단계 포함 여부",
    )
    include_history: bool = Field(
        default=False,
        alias="includeHistory",
        description="단계 전환 히스토리 포함 여부",
    )
    history_limit: int = Field(
        default=10,
        alias="historyLimit",
        description="히스토리 항목 수 제한",
    )

    model_config = {"populate_by_name": True}


class AIToolType(str, Enum):
    """AI 도구 타입."""

    ALL = "all"
    CLAUDE = "claude"
    GITHUB_COPILOT = "github_copilot"
    CHATGPT = "chatgpt"
    CURSOR = "cursor"
    OTHER = "other"


class AnalyzeAICollaborationArgs(BaseModel):
    """AI 협업 분석 인자."""

    tool: AIToolType | None = Field(
        default=None,
        description="특정 AI 도구 필터",
    )
    time_range: TimeRange | None = Field(
        default=None,
        alias="timeRange",
        description="분석 시간 범위",
    )
    include_patterns: bool = Field(
        default=True,
        alias="includePatterns",
        description="사용 패턴 분석 포함",
    )
    include_quality: bool = Field(
        default=True,
        alias="includeQuality",
        description="코드 품질 분석 포함",
    )

    model_config = {"populate_by_name": True}


class DashboardMode(str, Enum):
    """대시보드 모드."""

    TUI = "tui"
    CLI = "cli"


class StartDashboardArgs(BaseModel):
    """대시보드 시작 인자."""

    mode: DashboardMode | None = Field(
        default=None,
        description="대시보드 모드 (cli/tui)",
    )
    refresh_interval: int = Field(
        default=1000,
        alias="refreshInterval",
        description="새로고침 간격 (밀리초)",
    )
    max_events: int = Field(
        default=100,
        alias="maxEvents",
        description="최대 이벤트 수",
    )

    model_config = {"populate_by_name": True}


class GetDashboardStatusArgs(BaseModel):
    """대시보드 상태 조회 인자."""

    pass


class NotificationSeverity(str, Enum):
    """알림 심각도."""

    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class StartWebSocketServerArgs(BaseModel):
    """WebSocket 서버 시작 인자."""

    port: int = Field(
        default=8081,
        description="서버 포트 번호",
    )


class StopWebSocketServerArgs(BaseModel):
    """WebSocket 서버 중지 인자."""

    pass


class GetWebSocketStatsArgs(BaseModel):
    """WebSocket 서버 통계 조회 인자."""

    pass


class GetStreamStatsArgs(BaseModel):
    """이벤트 스트림 통계 조회 인자."""

    pass


class BroadcastNotificationArgs(BaseModel):
    """시스템 알림 브로드캐스트 인자."""

    message: str = Field(
        ...,
        description="알림 메시지",
    )
    severity: NotificationSeverity | None = Field(
        default=None,
        description="알림 심각도",
    )
    data: dict[str, Any] | None = Field(
        default=None,
        description="추가 데이터",
    )


class GetAdvancedMetricsArgs(BaseModel):
    """고급 메트릭 조회 인자."""

    include_bottlenecks: bool = Field(
        default=True,
        alias="includeBottlenecks",
        description="병목 현상 포함 여부",
    )
    include_insights: bool = Field(
        default=True,
        alias="includeInsights",
        description="인사이트 포함 여부",
    )
    include_recommendations: bool = Field(
        default=True,
        alias="includeRecommendations",
        description="권장사항 포함 여부",
    )
    time_range: str | None = Field(
        default=None,
        alias="timeRange",
        description="조회 시간 범위",
    )

    model_config = {"populate_by_name": True}


class GetBottlenecksArgs(BaseModel):
    """병목 현상 조회 인자."""

    type: str | None = Field(
        default=None,
        description="병목 유형 필터 (process, quality, resource, workflow, technical)",
    )
    severity: str | None = Field(
        default=None,
        description="심각도 필터 (info, warning, error, critical)",
    )
    min_impact: int | None = Field(
        default=None,
        alias="minImpact",
        ge=0,
        le=100,
        description="최소 영향도 필터",
    )

    model_config = {"populate_by_name": True}


class GetMetricsSnapshotArgs(BaseModel):
    """메트릭 스냅샷 조회 인자."""

    include_history: bool = Field(
        default=False,
        alias="includeHistory",
        description="히스토리 포함 여부",
    )
    metric_types: list[str] | None = Field(
        default=None,
        alias="metricTypes",
        description="메트릭 유형 필터",
    )

    model_config = {"populate_by_name": True}


class AnalyzeProductivityArgs(BaseModel):
    """생산성 분석 인자."""

    time_range: str | None = Field(
        default=None,
        alias="timeRange",
        description="분석 시간 범위",
    )
    include_trends: bool = Field(
        default=True,
        alias="includeTrends",
        description="트렌드 포함 여부",
    )

    model_config = {"populate_by_name": True}


class ConfigureNotificationsArgs(BaseModel):
    """알림 설정 인자."""

    channel: str | None = Field(
        default=None,
        description="알림 채널 (slack, email, dashboard, webhook)",
    )
    config: dict[str, Any] | None = Field(
        default=None,
        description="채널 설정",
    )
    rules: list[dict[str, Any]] | None = Field(
        default=None,
        description="알림 규칙 목록",
    )


class SendNotificationArgs(BaseModel):
    """알림 전송 인자."""

    title: str = Field(..., description="알림 제목")
    content: str = Field(..., description="알림 내용")
    severity: str | None = Field(
        default=None,
        description="심각도 (info, warning, error, critical)",
    )
    priority: str | None = Field(
        default=None,
        description="우선순위 (low, medium, high, urgent)",
    )
    channels: list[str] | None = Field(
        default=None,
        description="대상 채널 목록",
    )


class GetNotificationRulesArgs(BaseModel):
    """알림 규칙 조회 인자."""

    enabled: bool | None = Field(
        default=None,
        description="활성화된 규칙만 조회 여부",
    )


class GetNotificationStatsArgs(BaseModel):
    """알림 통계 조회 인자."""

    pass


class GetDashboardNotificationsArgs(BaseModel):
    """대시보드 알림 조회 인자."""

    unread_only: bool = Field(
        default=False,
        alias="unreadOnly",
        description="읽지 않은 알림만 조회 여부",
    )
    limit: int | None = Field(
        default=None,
        ge=1,
        le=100,
        description="최대 조회 개수",
    )

    model_config = {"populate_by_name": True}


class DeleteNotificationRuleArgs(BaseModel):
    """알림 규칙 삭제 인자."""

    rule_id: str = Field(
        ...,
        alias="ruleId",
        description="삭제할 규칙 ID",
    )

    model_config = {"populate_by_name": True}


# =============================================================================
# Plugin Management Tool Arguments
# =============================================================================


class PluginStatus(str, Enum):
    """플러그인 상태."""

    UNLOADED = "unloaded"
    LOADING = "loading"
    LOADED = "loaded"
    RUNNING = "running"
    PAUSED = "paused"
    ERROR = "error"
    DISABLED = "disabled"


class ListPluginsArgs(BaseModel):
    """플러그인 목록 조회 인자."""

    category: str | None = Field(
        default=None,
        description="플러그인 카테고리로 필터링 (옵션)",
    )
    status: PluginStatus | None = Field(
        default=None,
        description="플러그인 상태로 필터링 (옵션)",
    )


class GetPluginInfoArgs(BaseModel):
    """플러그인 정보 조회 인자."""

    plugin_id: str = Field(
        ...,
        alias="pluginId",
        description="플러그인 ID",
    )

    model_config = {"populate_by_name": True}


class LoadPluginArgs(BaseModel):
    """플러그인 로드 인자."""

    plugin_id: str = Field(
        ...,
        alias="pluginId",
        description="플러그인 ID",
    )

    model_config = {"populate_by_name": True}


class UnloadPluginArgs(BaseModel):
    """플러그인 언로드 인자."""

    plugin_id: str = Field(
        ...,
        alias="pluginId",
        description="플러그인 ID",
    )

    model_config = {"populate_by_name": True}


class ActivatePluginArgs(BaseModel):
    """플러그인 활성화 인자."""

    plugin_id: str = Field(
        ...,
        alias="pluginId",
        description="플러그인 ID",
    )

    model_config = {"populate_by_name": True}


class DeactivatePluginArgs(BaseModel):
    """플러그인 비활성화 인자."""

    plugin_id: str = Field(
        ...,
        alias="pluginId",
        description="플러그인 ID",
    )

    model_config = {"populate_by_name": True}


class RestartPluginArgs(BaseModel):
    """플러그인 재시작 인자."""

    plugin_id: str = Field(
        ...,
        alias="pluginId",
        description="플러그인 ID",
    )

    model_config = {"populate_by_name": True}


class InstallPluginArgs(BaseModel):
    """플러그인 설치 인자."""

    plugin_name: str = Field(
        ...,
        alias="pluginName",
        description="설치할 플러그인 이름",
    )
    version: str | None = Field(
        default=None,
        description="플러그인 버전 (옵션, 최신 버전 사용)",
    )

    model_config = {"populate_by_name": True}


class UninstallPluginArgs(BaseModel):
    """플러그인 제거 인자."""

    plugin_id: str = Field(
        ...,
        alias="pluginId",
        description="제거할 플러그인 ID",
    )

    model_config = {"populate_by_name": True}


class SearchPluginsArgs(BaseModel):
    """플러그인 검색 인자."""

    query: str = Field(
        ...,
        description="검색어",
    )
    local: bool = Field(
        default=False,
        description="로컬 플러그인만 검색할지 여부",
    )


class CheckPluginHealthArgs(BaseModel):
    """플러그인 헬스 체크 인자."""

    plugin_id: str | None = Field(
        default=None,
        alias="pluginId",
        description="체크할 플러그인 ID (생략 시 모든 플러그인)",
    )

    model_config = {"populate_by_name": True}


class GetPluginMetricsArgs(BaseModel):
    """플러그인 메트릭 조회 인자."""

    plugin_id: str | None = Field(
        default=None,
        alias="pluginId",
        description="특정 플러그인 ID (옵션)",
    )

    model_config = {"populate_by_name": True}


class UpdatePluginArgs(BaseModel):
    """플러그인 업데이트 인자."""

    plugin_id: str = Field(
        ...,
        alias="pluginId",
        description="업데이트할 플러그인 ID",
    )
    version: str | None = Field(
        default=None,
        description="업데이트할 버전 (옵션, 최신 버전 사용)",
    )

    model_config = {"populate_by_name": True}


class CheckPluginUpdatesArgs(BaseModel):
    """플러그인 업데이트 확인 인자."""

    pass


class GetPluginSystemStatsArgs(BaseModel):
    """플러그인 시스템 통계 조회 인자."""

    pass


# =============================================================================
# Multi-Project Management Enums
# =============================================================================


class ProjectType(str, Enum):
    """프로젝트 타입."""

    WEB_APPLICATION = "web_application"
    MOBILE_APPLICATION = "mobile_application"
    API_SERVICE = "api_service"
    LIBRARY = "library"
    CLI_TOOL = "cli_tool"
    MICROSERVICE = "microservice"
    MONOLITH = "monolith"
    DATA_PIPELINE = "data_pipeline"
    INFRASTRUCTURE = "infrastructure"
    DOCUMENTATION = "documentation"
    OTHER = "other"


class ProjectMgmtStatus(str, Enum):
    """프로젝트 상태."""

    ACTIVE = "active"
    INACTIVE = "inactive"
    ARCHIVED = "archived"
    MAINTENANCE = "maintenance"
    DEVELOPMENT = "development"
    PRODUCTION = "production"
    DEPRECATED = "deprecated"


class ProjectPriority(str, Enum):
    """프로젝트 우선순위."""

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class DependencyDirection(str, Enum):
    """의존성 방향."""

    INCOMING = "incoming"
    OUTGOING = "outgoing"
    BOTH = "both"


class CrossProjectAnalysisType(str, Enum):
    """크로스 프로젝트 분석 타입."""

    SIMILARITY = "similarity"
    DEPENDENCY = "dependency"
    PERFORMANCE = "performance"
    QUALITY = "quality"
    TREND = "trend"
    BOTTLENECK = "bottleneck"
    COLLABORATION = "collaboration"


class PortfolioGroupBy(str, Enum):
    """포트폴리오 그룹화 기준."""

    TYPE = "type"
    STATUS = "status"
    PRIORITY = "priority"
    OWNER = "owner"


class ProjectMetricsTimeRange(str, Enum):
    """프로젝트 메트릭 시간 범위."""

    ONE_HOUR = "1h"
    ONE_DAY = "1d"
    SEVEN_DAYS = "7d"
    THIRTY_DAYS = "30d"


# =============================================================================
# Multi-Project Management Tool Arguments
# =============================================================================


class CreateProjectArgs(BaseModel):
    """프로젝트 생성 인자."""

    name: str = Field(..., description="프로젝트 이름")
    description: str | None = Field(
        default=None,
        description="프로젝트 설명",
    )
    type: ProjectType | None = Field(
        default=None,
        description="프로젝트 타입",
    )
    priority: ProjectPriority | None = Field(
        default=None,
        description="프로젝트 우선순위",
    )
    root_path: str | None = Field(
        default=None,
        alias="rootPath",
        description="프로젝트 루트 경로",
    )
    tags: list[str] | None = Field(
        default=None,
        description="프로젝트 태그",
    )

    model_config = {"populate_by_name": True}


class ListProjectsArgs(BaseModel):
    """프로젝트 목록 조회 인자."""

    status: ProjectMgmtStatus | None = Field(
        default=None,
        description="필터링할 프로젝트 상태",
    )
    type: ProjectType | None = Field(
        default=None,
        description="필터링할 프로젝트 타입",
    )
    limit: int | None = Field(
        default=None,
        ge=1,
        description="최대 결과 수",
    )


class GetProjectDetailArgs(BaseModel):
    """프로젝트 상세 조회 인자."""

    project_id: str = Field(
        ...,
        alias="projectId",
        description="프로젝트 ID",
    )

    model_config = {"populate_by_name": True}


class UpdateProjectArgs(BaseModel):
    """프로젝트 업데이트 인자."""

    project_id: str = Field(
        ...,
        alias="projectId",
        description="프로젝트 ID",
    )
    name: str | None = Field(
        default=None,
        description="프로젝트 이름",
    )
    description: str | None = Field(
        default=None,
        description="프로젝트 설명",
    )
    status: ProjectMgmtStatus | None = Field(
        default=None,
        description="프로젝트 상태",
    )
    priority: ProjectPriority | None = Field(
        default=None,
        description="프로젝트 우선순위",
    )
    tags: list[str] | None = Field(
        default=None,
        description="프로젝트 태그",
    )

    model_config = {"populate_by_name": True}


class DeleteProjectArgs(BaseModel):
    """프로젝트 삭제 인자."""

    project_id: str = Field(
        ...,
        alias="projectId",
        description="프로젝트 ID",
    )

    model_config = {"populate_by_name": True}


class DiscoverProjectsArgs(BaseModel):
    """프로젝트 자동 검색 인자."""

    search_paths: list[str] | None = Field(
        default=None,
        alias="searchPaths",
        description="검색할 디렉토리 경로들",
    )
    auto_register: bool = Field(
        default=True,
        alias="autoRegister",
        description="발견된 프로젝트를 자동으로 등록할지 여부",
    )

    model_config = {"populate_by_name": True}


class SearchProjectsArgs(BaseModel):
    """프로젝트 검색 인자."""

    query: str | None = Field(
        default=None,
        description="검색 쿼리 (프로젝트 이름)",
    )
    type: ProjectType | None = Field(
        default=None,
        description="프로젝트 타입",
    )
    status: ProjectMgmtStatus | None = Field(
        default=None,
        description="프로젝트 상태",
    )
    tags: list[str] | None = Field(
        default=None,
        description="검색할 태그들",
    )


class GetProjectMetricsDetailArgs(BaseModel):
    """프로젝트 메트릭 조회 인자."""

    project_id: str = Field(
        ...,
        alias="projectId",
        description="프로젝트 ID",
    )
    time_range: ProjectMetricsTimeRange | None = Field(
        default=None,
        alias="timeRange",
        description="조회할 시간 범위",
    )

    model_config = {"populate_by_name": True}


class CollectProjectMetricsArgs(BaseModel):
    """프로젝트 메트릭 수집 인자."""

    project_id: str | None = Field(
        default=None,
        alias="projectId",
        description="프로젝트 ID (생략 시 모든 활성 프로젝트)",
    )

    model_config = {"populate_by_name": True}


class RunCrossProjectAnalysisArgs(BaseModel):
    """크로스 프로젝트 분석 인자."""

    project_ids: list[str] | None = Field(
        default=None,
        alias="projectIds",
        description="분석할 프로젝트 ID들 (생략 시 모든 활성 프로젝트)",
    )
    analysis_type: CrossProjectAnalysisType | None = Field(
        default=None,
        alias="analysisType",
        description="분석 타입",
    )

    model_config = {"populate_by_name": True}


class GetProjectDependenciesArgs(BaseModel):
    """프로젝트 의존성 조회 인자."""

    project_id: str = Field(
        ...,
        alias="projectId",
        description="프로젝트 ID",
    )
    direction: DependencyDirection | None = Field(
        default=None,
        description="의존성 방향",
    )

    model_config = {"populate_by_name": True}


class GetMultiProjectStatusArgs(BaseModel):
    """다중 프로젝트 시스템 상태 조회 인자."""

    pass


class GetProjectPortfolioArgs(BaseModel):
    """프로젝트 포트폴리오 조회 인자."""

    group_by: PortfolioGroupBy | None = Field(
        default=None,
        alias="groupBy",
        description="그룹화 기준",
    )

    model_config = {"populate_by_name": True}


class EnableProjectSyncArgs(BaseModel):
    """프로젝트 동기화 활성화 인자."""

    endpoint: str = Field(..., description="동기화 서버 엔드포인트")
    api_key: str = Field(
        ...,
        alias="apiKey",
        description="API 키",
    )
    interval: int | None = Field(
        default=None,
        ge=1,
        description="동기화 간격 (초)",
    )

    model_config = {"populate_by_name": True}


class TriggerProjectSyncArgs(BaseModel):
    """프로젝트 동기화 트리거 인자."""

    force: bool = Field(
        default=False,
        description="강제 동기화 여부",
    )


class GetProjectSyncStatusArgs(BaseModel):
    """프로젝트 동기화 상태 조회 인자."""

    pass


# =============================================================================
# MCP Response Content
# =============================================================================


class McpTextContent(BaseModel):
    """MCP 텍스트 컨텐츠."""

    type: str = Field(default="text", description="컨텐츠 타입")
    text: str = Field(..., description="텍스트 내용")


class McpResponse(BaseModel):
    """MCP 응답 기본 클래스."""

    content: list[McpTextContent] = Field(
        default_factory=list,
        description="응답 컨텐츠 목록",
    )
    is_error: bool = Field(
        default=False,
        alias="isError",
        description="오류 여부",
    )

    model_config = {"populate_by_name": True}


# =============================================================================
# Response Models (응답 모델)
# =============================================================================


class ProjectInfo(BaseModel):
    """프로젝트 정보."""

    name: str = Field(..., description="프로젝트 이름")
    version: str = Field(..., description="버전")
    status: str = Field(..., description="상태")
    last_activity: str = Field(
        ...,
        alias="lastActivity",
        description="마지막 활동 시간",
    )
    total_events: int | None = Field(
        default=None,
        alias="totalEvents",
        description="총 이벤트 수",
    )
    uptime: float | None = Field(
        default=None,
        description="가동 시간(초)",
    )

    model_config = {"populate_by_name": True}


class MilestoneProgress(BaseModel):
    """마일스톤 진행률."""

    total: int = Field(..., description="전체 수")
    completed: int = Field(..., description="완료 수")
    current: str = Field(..., description="현재 마일스톤")
    percentage: float | None = Field(
        default=None,
        description="진행률(%)",
    )


class Milestones(BaseModel):
    """마일스톤 정보."""

    current: str = Field(..., description="현재 마일스톤")
    progress: MilestoneProgress = Field(..., description="진행률")
    completed: list[str] | None = Field(
        default=None,
        description="완료된 마일스톤 목록",
    )


class EnvironmentInfo(BaseModel):
    """환경 정보."""

    python_version: str = Field(
        ...,
        alias="pythonVersion",
        description="Python 버전",
    )
    platform: str = Field(..., description="플랫폼")
    cwd: str = Field(..., description="작업 디렉토리")
    memory_usage: dict[str, Any] | None = Field(
        default=None,
        alias="memoryUsage",
        description="메모리 사용량",
    )
    pid: int | None = Field(default=None, description="프로세스 ID")

    model_config = {"populate_by_name": True}


class ProjectMetrics(BaseModel):
    """프로젝트 메트릭."""

    events: dict[str, Any] | None = Field(
        default=None,
        description="이벤트 통계",
    )
    activity: dict[str, Any] | None = Field(
        default=None,
        description="활동 통계",
    )
    queue: dict[str, Any] | None = Field(
        default=None,
        description="큐 통계",
    )


class ProjectStatusResponse(McpResponse):
    """프로젝트 상태 응답."""

    project: ProjectInfo = Field(..., description="프로젝트 정보")
    milestones: Milestones = Field(..., description="마일스톤 정보")
    environment: EnvironmentInfo = Field(..., description="환경 정보")
    metrics: ProjectMetrics | None = Field(
        default=None,
        description="메트릭 정보",
    )
    details: dict[str, Any] | None = Field(
        default=None,
        description="추가 상세 정보",
    )


class EventMetrics(BaseModel):
    """이벤트 메트릭."""

    total: int = Field(..., description="총 이벤트 수")
    by_category: dict[str, int] = Field(
        default_factory=dict,
        alias="byCategory",
        description="카테고리별 이벤트 수",
    )
    by_severity: dict[str, int] = Field(
        default_factory=dict,
        alias="bySeverity",
        description="심각도별 이벤트 수",
    )
    rate: float = Field(..., description="이벤트 발생률")

    model_config = {"populate_by_name": True}


class GitMetrics(BaseModel):
    """Git 메트릭."""

    commits: int = Field(..., description="커밋 수")
    branches: int = Field(..., description="브랜치 수")
    merges: int = Field(..., description="머지 수")


class FileMetrics(BaseModel):
    """파일 메트릭."""

    changed: int = Field(..., description="변경된 파일 수")
    created: int = Field(..., description="생성된 파일 수")
    modified: int = Field(..., description="수정된 파일 수")
    deleted: int = Field(..., description="삭제된 파일 수")


class SystemMetrics(BaseModel):
    """시스템 메트릭."""

    uptime: float = Field(..., description="가동 시간(초)")
    memory_usage: float = Field(
        ...,
        alias="memoryUsage",
        description="메모리 사용량",
    )
    cpu_usage: dict[str, Any] | None = Field(
        default=None,
        alias="cpuUsage",
        description="CPU 사용량",
    )

    model_config = {"populate_by_name": True}


class QueueMetrics(BaseModel):
    """큐 메트릭."""

    total_queues: int = Field(
        ...,
        alias="totalQueues",
        description="총 큐 수",
    )
    total_events: int = Field(
        ...,
        alias="totalEvents",
        description="총 이벤트 수",
    )
    processing: int = Field(..., description="처리 중인 이벤트 수")
    throughput: float = Field(..., description="처리량")

    model_config = {"populate_by_name": True}


class MetricsData(BaseModel):
    """메트릭 데이터."""

    events: EventMetrics | None = Field(
        default=None,
        description="이벤트 메트릭",
    )
    git: GitMetrics | None = Field(
        default=None,
        description="Git 메트릭",
    )
    files: FileMetrics | None = Field(
        default=None,
        description="파일 메트릭",
    )
    system: SystemMetrics | None = Field(
        default=None,
        description="시스템 메트릭",
    )
    queue: QueueMetrics | None = Field(
        default=None,
        description="큐 메트릭",
    )


class MetricsAnalysis(BaseModel):
    """메트릭 분석 결과."""

    trend: dict[str, Any] | None = Field(
        default=None,
        description="트렌드 분석",
    )
    health: dict[str, Any] | None = Field(
        default=None,
        description="건강 상태",
    )
    recommendations: list[str] = Field(
        default_factory=list,
        description="권장사항",
    )


class MetricsResponse(McpResponse):
    """메트릭 응답."""

    time_range: str = Field(
        ...,
        alias="timeRange",
        description="시간 범위",
    )
    metric_type: str = Field(
        ...,
        alias="metricType",
        description="메트릭 유형",
    )
    timestamp: str = Field(..., description="타임스탬프")
    data: MetricsData = Field(
        ...,
        alias="_data",
        description="메트릭 데이터",
    )
    analysis: MetricsAnalysis | None = Field(
        default=None,
        description="분석 결과",
    )
    summary: str = Field(..., description="요약")

    model_config = {"populate_by_name": True}


class Activity(BaseModel):
    """활동 로그 항목."""

    id: str = Field(..., description="활동 ID")
    timestamp: str = Field(..., description="타임스탬프")
    stage: str = Field(..., description="개발 단계")
    action: str = Field(..., description="액션")
    details: str = Field(..., description="상세 내용")
    actor: str = Field(..., description="수행자")
    category: str | None = Field(default=None, description="카테고리")
    severity: str | None = Field(default=None, description="심각도")
    metadata: dict[str, Any] | None = Field(
        default=None,
        description="메타데이터",
    )


class ActivityFilters(BaseModel):
    """활동 로그 필터."""

    limit: int = Field(..., description="최대 개수")
    stage: str | None = Field(default=None, description="개발 단계")


class ActivitySummary(BaseModel):
    """활동 로그 요약."""

    total_events: int = Field(
        ...,
        alias="totalEvents",
        description="총 이벤트 수",
    )
    by_category: dict[str, int] = Field(
        default_factory=dict,
        alias="byCategory",
        description="카테고리별 수",
    )
    by_severity: dict[str, int] = Field(
        default_factory=dict,
        alias="bySeverity",
        description="심각도별 수",
    )
    time_range: dict[str, str] | None = Field(
        default=None,
        alias="timeRange",
        description="시간 범위",
    )

    model_config = {"populate_by_name": True}


class ActivityLogResponse(McpResponse):
    """활동 로그 응답."""

    total_count: int = Field(
        ...,
        alias="totalCount",
        description="전체 개수",
    )
    activities: list[Activity] = Field(
        default_factory=list,
        description="활동 목록",
    )
    filters: ActivityFilters = Field(..., description="적용된 필터")
    summary: ActivitySummary | None = Field(
        default=None,
        description="요약",
    )

    model_config = {"populate_by_name": True}


class BottleneckMetrics(BaseModel):
    """병목 현상 메트릭."""

    current: float = Field(..., description="현재 값")
    threshold: float = Field(..., description="임계값")
    recommendation: str = Field(..., description="권장사항")


class Bottleneck(BaseModel):
    """병목 현상."""

    category: str = Field(..., description="카테고리")
    severity: str = Field(..., description="심각도")
    description: str = Field(..., description="설명")
    suggestion: str = Field(..., description="해결 방안")
    metrics: BottleneckMetrics | None = Field(
        default=None,
        description="메트릭",
    )


class ActiveMonitors(BaseModel):
    """활성 모니터 상태."""

    file_monitor: str = Field(
        ...,
        alias="fileMonitor",
        description="파일 모니터 상태",
    )
    git_monitor: str = Field(
        ...,
        alias="gitMonitor",
        description="Git 모니터 상태",
    )

    model_config = {"populate_by_name": True}


class BottleneckSystemMetrics(BaseModel):
    """병목 분석 시스템 메트릭."""

    event_processing_rate: float = Field(
        ...,
        alias="eventProcessingRate",
        description="이벤트 처리율",
    )
    memory_usage: float = Field(
        ...,
        alias="memoryUsage",
        description="메모리 사용량",
    )
    queue_backlog: int = Field(
        ...,
        alias="queueBacklog",
        description="큐 백로그",
    )
    active_monitors: ActiveMonitors = Field(
        ...,
        alias="activeMonitors",
        description="활성 모니터",
    )

    model_config = {"populate_by_name": True}


class BottleneckAnalysisResult(BaseModel):
    """병목 분석 결과."""

    pattern: dict[str, Any] | None = Field(
        default=None,
        description="패턴 분석",
    )
    trends: dict[str, Any] | None = Field(
        default=None,
        description="트렌드 분석",
    )
    efficiency: dict[str, Any] | None = Field(
        default=None,
        description="효율성 분석",
    )


class BottleneckAnalysisResponse(McpResponse):
    """병목 분석 응답."""

    analysis_depth: str = Field(
        ...,
        alias="analysisDepth",
        description="분석 깊이",
    )
    timestamp: str = Field(..., description="타임스탬프")
    bottlenecks: list[Bottleneck] = Field(
        default_factory=list,
        description="병목 현상 목록",
    )
    recommendations: list[str] = Field(
        default_factory=list,
        description="권장사항",
    )
    next_steps: list[str] = Field(
        default_factory=list,
        alias="nextSteps",
        description="다음 단계",
    )
    system_metrics: BottleneckSystemMetrics | None = Field(
        default=None,
        alias="systemMetrics",
        description="시스템 메트릭",
    )
    analysis: BottleneckAnalysisResult | None = Field(
        default=None,
        description="분석 결과",
    )

    model_config = {"populate_by_name": True}


class MethodologyFinding(BaseModel):
    """방법론 검사 결과."""

    methodology: str = Field(..., description="방법론")
    status: ComplianceStatus = Field(..., description="준수 상태")
    score: float = Field(..., ge=0, le=100, description="점수")
    description: str = Field(..., description="설명")
    recommendations: list[str] = Field(
        default_factory=list,
        description="권장사항",
    )


class MethodologyCompliance(BaseModel):
    """방법론 준수도."""

    overall: float = Field(..., ge=0, le=100, description="전체 점수")
    by_methodology: dict[str, float] = Field(
        default_factory=dict,
        alias="byMethodology",
        description="방법론별 점수",
    )

    model_config = {"populate_by_name": True}


class CheckMethodologyResponse(McpResponse):
    """방법론 검사 응답."""

    methodology: str = Field(..., description="검사 대상 방법론")
    timestamp: str = Field(..., description="타임스탬프")
    compliance: MethodologyCompliance = Field(..., description="준수도")
    findings: list[MethodologyFinding] = Field(
        default_factory=list,
        description="검사 결과",
    )
    summary: str = Field(..., description="요약")


class ReportPeriod(BaseModel):
    """보고서 기간."""

    start: str = Field(..., description="시작 시간")
    end: str = Field(..., description="종료 시간")


class ReportSummary(BaseModel):
    """보고서 요약."""

    total_activities: int = Field(
        ...,
        alias="totalActivities",
        description="총 활동 수",
    )
    key_metrics: dict[str, float] = Field(
        default_factory=dict,
        alias="keyMetrics",
        description="주요 메트릭",
    )
    highlights: list[str] = Field(
        default_factory=list,
        description="하이라이트",
    )

    model_config = {"populate_by_name": True}


class ReportSection(BaseModel):
    """보고서 섹션."""

    title: str = Field(..., description="제목")
    content: str = Field(..., description="내용")
    metrics: dict[str, float] | None = Field(
        default=None,
        description="섹션 메트릭",
    )


class GenerateReportResponse(McpResponse):
    """보고서 생성 응답."""

    report_type: str = Field(
        ...,
        alias="reportType",
        description="보고서 유형",
    )
    format: str = Field(..., description="형식")
    timestamp: str = Field(..., description="타임스탬프")
    period: ReportPeriod = Field(..., description="기간")
    summary: ReportSummary = Field(..., description="요약")
    sections: list[ReportSection] = Field(
        default_factory=list,
        description="섹션 목록",
    )
    recommendations: list[str] = Field(
        default_factory=list,
        description="권장사항",
    )

    model_config = {"populate_by_name": True}


# =============================================================================
# Utility Functions
# =============================================================================


def create_text_response(text: str, is_error: bool = False) -> McpResponse:
    """텍스트 응답을 생성합니다.

    Args:
        text: 응답 텍스트.
        is_error: 오류 여부.

    Returns:
        MCP 응답 객체.
    """
    return McpResponse(
        content=[McpTextContent(text=text)],
        isError=is_error,
    )


def create_timestamp() -> str:
    """현재 타임스탬프를 ISO 형식으로 반환합니다.

    Returns:
        ISO 형식의 타임스탬프 문자열.
    """
    return datetime.now().isoformat()
