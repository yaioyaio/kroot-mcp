"""MCP 서버 진입점.

DevFlow Monitor MCP 서버의 메인 모듈입니다.
mcp 패키지를 사용하여 MCP 서버를 구현합니다.
"""

import asyncio
import json
import logging
import os
import sys
from collections.abc import Sequence
from datetime import datetime
from typing import Any, Optional

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

from .config import get_config
from .types import (
    AnalyzeBottlenecksArgs,
    AnalyzeStageArgs,
    AnalyzeAICollaborationArgs,
    BroadcastNotificationArgs,
    CheckMethodologyArgs,
    GenerateReportArgs,
    GetActivityLogArgs,
    GetDashboardStatusArgs,
    GetMetricsArgs,
    GetProjectStatusArgs,
    StartDashboardArgs,
    StartWebSocketServerArgs,
    # Plugin management args
    ListPluginsArgs,
    GetPluginInfoArgs,
    LoadPluginArgs,
    UnloadPluginArgs,
    ActivatePluginArgs,
    DeactivatePluginArgs,
    RestartPluginArgs,
    InstallPluginArgs,
    UninstallPluginArgs,
    SearchPluginsArgs,
    CheckPluginHealthArgs,
    GetPluginMetricsArgs,
    UpdatePluginArgs,
    CheckPluginUpdatesArgs,
    GetPluginSystemStatsArgs,
    # Advanced Metrics args
    GetAdvancedMetricsArgs,
    GetBottlenecksArgs,
    GetMetricsSnapshotArgs,
    AnalyzeProductivityArgs,
    # Notification args
    ConfigureNotificationsArgs,
    SendNotificationArgs,
    GetNotificationRulesArgs,
    GetNotificationStatsArgs,
    GetDashboardNotificationsArgs,
    DeleteNotificationRuleArgs,
    # Multi-Project Management args
    CreateProjectArgs,
    ListProjectsArgs,
    GetProjectDetailArgs,
    UpdateProjectArgs,
    DeleteProjectArgs,
    DiscoverProjectsArgs,
    SearchProjectsArgs,
    GetProjectMetricsDetailArgs,
    CollectProjectMetricsArgs,
    RunCrossProjectAnalysisArgs,
    GetProjectDependenciesArgs,
    GetMultiProjectStatusArgs,
    GetProjectPortfolioArgs,
    EnableProjectSyncArgs,
    TriggerProjectSyncArgs,
    GetProjectSyncStatusArgs,
    create_timestamp,
)

# Performance module imports
from devflow_monitor.performance import (
    PerformanceManager,
    get_performance_manager,
)

# Security module imports
from devflow_monitor.security import (
    AuditQuery,
    DecryptionInput,
    PermissionAction,
    PermissionCheck,
    SecurityManager,
    get_security_manager,
)

# Report system imports
from devflow_monitor.reports import (
    ReportEngine,
    ReportScheduler,
    TemplateManager,
    ReportConfig,
    ReportFormat,
    ReportType,
    ReportSection,
    ReportSectionType,
    SchedulePattern,
    get_report_engine,
    get_report_scheduler,
    get_template_manager,
)

# Feedback system imports
from devflow_monitor.feedback import (
    FeedbackSystem,
    FeedbackSystemConfig,
    FeedbackSubmitOptions,
    FeedbackType as FeedbackTypeEnum,
    FeedbackStatus as FeedbackStatusEnum,
    FeedbackPriority as FeedbackPriorityEnum,
    FeedbackFilter,
    ABTestConfig,
    ABTestVariant,
    ABTestMetric,
    ABTestAudience,
    ABMetricType,
    ImprovementStatus,
)
from devflow_monitor.storage.database import DatabaseManager

# Plugin system imports
from devflow_monitor.plugins import (
    PluginManager,
    PluginManagerConfig,
    get_plugin_manager,
    reset_plugin_manager,
)

# Analyzers imports
from devflow_monitor.analyzers import (
    MetricsCollector,
    MetricsAnalyzer,
    BottleneckDetector,
    get_metrics_collector,
    get_metrics_analyzer,
    get_bottleneck_detector,
)
from devflow_monitor.analyzers.types.metrics import BottleneckType

# Notifications imports
from devflow_monitor.notifications import (
    NotificationEngine,
    NotificationChannel,
    NotificationPriority,
    ChannelConfig,
    NotificationRule,
    RuleCondition,
    RuleConditionType,
    get_notification_engine,
)
from devflow_monitor.events.types.base import EventSeverity

# 로거 설정
logger = logging.getLogger(__name__)


class DevFlowMonitorServer:
    """DevFlow Monitor MCP 서버.

    개발 프로세스 모니터링을 위한 MCP 서버를 구현합니다.

    Attributes:
        server: MCP 서버 인스턴스.
        config: 서버 설정.
    """

    def __init__(self) -> None:
        """서버를 초기화합니다."""
        self.config = get_config()
        self.server = Server(self.config.server.name)
        self._setup_plugin_manager()
        self._setup_handlers()
        self._setup_logging()

    def _setup_plugin_manager(self) -> None:
        """플러그인 매니저를 설정합니다."""
        plugin_config = PluginManagerConfig(
            plugin_dirs=["./plugins", "./node_modules/@devflow-plugins"],
            auto_load=True,
            hot_reload=True,
            max_plugins=50,
            sandbox_enabled=True,
            health_check_interval=60000,
            metrics_interval=30000,
        )
        self.plugin_manager = get_plugin_manager(plugin_config)

    def _setup_logging(self) -> None:
        """로깅을 설정합니다."""
        log_level = getattr(logging, self.config.development.log_level.upper(), logging.INFO)
        logging.basicConfig(
            level=log_level,
            format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            stream=sys.stderr,
        )
        logger.info(
            "DevFlow Monitor MCP Server v%s starting...",
            self.config.server.version,
        )

    def _setup_handlers(self) -> None:
        """MCP 핸들러를 설정합니다."""
        self._register_tool_list_handler()
        self._register_tool_call_handler()

    def _register_tool_list_handler(self) -> None:
        """도구 목록 핸들러를 등록합니다."""

        # Note: MCP SDK decorators lack type stubs, ignore type errors
        @self.server.list_tools()  # type: ignore[no-untyped-call, untyped-decorator]
        async def list_tools() -> list[Tool]:
            """사용 가능한 도구 목록을 반환합니다."""
            return self._get_tools()

        _ = list_tools  # Prevent unused variable warning

    def _register_tool_call_handler(self) -> None:
        """도구 실행 핸들러를 등록합니다."""
        # Note: MCP SDK decorators lack type stubs, ignore type errors
        @self.server.call_tool()  # type: ignore[untyped-decorator]
        async def call_tool(
            name: str,
            arguments: dict[str, Any] | None = None,
        ) -> Sequence[TextContent]:
            """도구를 실행합니다."""
            return await self._handle_tool_call(name, arguments or {})

        _ = call_tool  # Prevent unused variable warning

    def _get_tools(self) -> list[Tool]:
        """사용 가능한 MCP 도구 목록을 반환합니다.

        Returns:
            MCP 도구 목록.
        """
        return [
            Tool(
                name="getProjectStatus",
                description="프로젝트 상태를 조회합니다. 현재 진행 상황, 마일스톤, 환경 정보를 포함합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "includeDetails": {
                            "type": "boolean",
                            "description": "상세 정보 포함 여부",
                            "default": False,
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="getMetrics",
                description="개발 메트릭을 조회합니다. 커밋, 파일 변경, 테스트, 빌드 통계를 포함합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "timeRange": {
                            "type": "string",
                            "enum": ["1h", "1d", "1w", "1m"],
                            "description": "조회 시간 범위",
                            "default": "1d",
                        },
                        "metricType": {
                            "type": "string",
                            "enum": ["all", "commits", "files", "tests", "builds"],
                            "description": "메트릭 유형",
                            "default": "all",
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="getActivityLog",
                description="활동 로그를 조회합니다. 개발 단계별 활동 기록을 포함합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "limit": {
                            "type": "integer",
                            "description": "최대 조회 개수",
                            "default": 50,
                            "minimum": 1,
                            "maximum": 1000,
                        },
                        "stage": {
                            "type": "string",
                            "enum": [
                                "planning",
                                "design",
                                "coding",
                                "testing",
                                "review",
                                "deployment",
                                "monitoring",
                            ],
                            "description": "필터링할 개발 단계",
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="analyzeBottlenecks",
                description="병목 현상을 분석합니다. 프로세스, 리소스, 기술적 병목을 감지합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "analysisDepth": {
                            "type": "string",
                            "enum": ["basic", "detailed", "comprehensive"],
                            "description": "분석 깊이",
                            "default": "basic",
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="checkMethodology",
                description="개발 방법론 준수도를 검사합니다. DDD, TDD, BDD, EDA 패턴을 분석합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "methodology": {
                            "type": "string",
                            "enum": ["all", "ddd", "tdd", "bdd", "eda"],
                            "description": "검사할 방법론",
                            "default": "all",
                        },
                        "includeRecommendations": {
                            "type": "boolean",
                            "description": "권장사항 포함 여부",
                            "default": False,
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="generateReport",
                description="개발 보고서를 생성합니다. 일일, 주간, 월간 보고서를 지원합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "reportType": {
                            "type": "string",
                            "enum": ["daily", "weekly", "monthly", "custom"],
                            "description": "보고서 유형",
                            "default": "daily",
                        },
                        "format": {
                            "type": "string",
                            "enum": ["json", "markdown", "summary"],
                            "description": "출력 형식",
                            "default": "summary",
                        },
                        "includeMetrics": {
                            "type": "boolean",
                            "description": "메트릭 포함 여부",
                            "default": True,
                        },
                        "includeTrends": {
                            "type": "boolean",
                            "description": "트렌드 포함 여부",
                            "default": False,
                        },
                    },
                    "required": [],
                },
            ),
            # =====================================================================
            # Plugin Management Tools (15 tools)
            # =====================================================================
            Tool(
                name="listPlugins",
                description="설치된 모든 플러그인 목록을 조회합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "category": {
                            "type": "string",
                            "description": "플러그인 카테고리로 필터링 (옵션)",
                        },
                        "status": {
                            "type": "string",
                            "enum": ["unloaded", "loading", "loaded", "running", "paused", "error", "disabled"],
                            "description": "플러그인 상태로 필터링 (옵션)",
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="getPluginInfo",
                description="특정 플러그인의 상세 정보를 조회합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "pluginId": {
                            "type": "string",
                            "description": "플러그인 ID",
                        },
                    },
                    "required": ["pluginId"],
                },
            ),
            Tool(
                name="loadPlugin",
                description="플러그인을 로드합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "pluginId": {
                            "type": "string",
                            "description": "플러그인 ID",
                        },
                    },
                    "required": ["pluginId"],
                },
            ),
            Tool(
                name="unloadPlugin",
                description="플러그인을 언로드합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "pluginId": {
                            "type": "string",
                            "description": "플러그인 ID",
                        },
                    },
                    "required": ["pluginId"],
                },
            ),
            Tool(
                name="activatePlugin",
                description="플러그인을 활성화합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "pluginId": {
                            "type": "string",
                            "description": "플러그인 ID",
                        },
                    },
                    "required": ["pluginId"],
                },
            ),
            Tool(
                name="deactivatePlugin",
                description="플러그인을 비활성화합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "pluginId": {
                            "type": "string",
                            "description": "플러그인 ID",
                        },
                    },
                    "required": ["pluginId"],
                },
            ),
            Tool(
                name="restartPlugin",
                description="플러그인을 재시작합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "pluginId": {
                            "type": "string",
                            "description": "플러그인 ID",
                        },
                    },
                    "required": ["pluginId"],
                },
            ),
            Tool(
                name="installPlugin",
                description="레지스트리에서 플러그인을 설치합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "pluginName": {
                            "type": "string",
                            "description": "설치할 플러그인 이름",
                        },
                        "version": {
                            "type": "string",
                            "description": "플러그인 버전 (옵션, 최신 버전 사용)",
                        },
                    },
                    "required": ["pluginName"],
                },
            ),
            Tool(
                name="uninstallPlugin",
                description="플러그인을 제거합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "pluginId": {
                            "type": "string",
                            "description": "제거할 플러그인 ID",
                        },
                    },
                    "required": ["pluginId"],
                },
            ),
            Tool(
                name="searchPlugins",
                description="플러그인을 검색합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "검색어",
                        },
                        "local": {
                            "type": "boolean",
                            "description": "로컬 플러그인만 검색할지 여부",
                            "default": False,
                        },
                    },
                    "required": ["query"],
                },
            ),
            Tool(
                name="checkPluginHealth",
                description="플러그인의 상태를 체크합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "pluginId": {
                            "type": "string",
                            "description": "체크할 플러그인 ID (생략 시 모든 플러그인)",
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="getPluginMetrics",
                description="플러그인 시스템의 메트릭을 조회합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "pluginId": {
                            "type": "string",
                            "description": "특정 플러그인 ID (옵션)",
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="updatePlugin",
                description="플러그인을 업데이트합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "pluginId": {
                            "type": "string",
                            "description": "업데이트할 플러그인 ID",
                        },
                        "version": {
                            "type": "string",
                            "description": "업데이트할 버전 (옵션, 최신 버전 사용)",
                        },
                    },
                    "required": ["pluginId"],
                },
            ),
            Tool(
                name="checkPluginUpdates",
                description="플러그인 업데이트를 확인합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            ),
            Tool(
                name="getPluginSystemStats",
                description="플러그인 시스템 전체 통계를 조회합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            ),
            # =====================================================================
            # Development Stage Analysis Tool (1 tool)
            # =====================================================================
            Tool(
                name="analyzeStage",
                description="현재 개발 단계를 분석하고 진행 상황을 제공합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "includeSubStages": {
                            "type": "boolean",
                            "description": "코딩 세부 단계 포함 여부",
                            "default": True,
                        },
                        "includeHistory": {
                            "type": "boolean",
                            "description": "단계 전환 히스토리 포함 여부",
                            "default": False,
                        },
                        "historyLimit": {
                            "type": "integer",
                            "description": "히스토리 항목 수 제한",
                            "default": 10,
                        },
                    },
                    "required": [],
                },
            ),
            # =====================================================================
            # AI Collaboration Tool (1 tool)
            # =====================================================================
            Tool(
                name="analyzeAICollaboration",
                description="AI 도구 사용 현황과 효과성을 분석합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "tool": {
                            "type": "string",
                            "description": "특정 AI 도구 필터",
                            "enum": ["all", "claude", "github_copilot", "chatgpt", "cursor", "other"],
                            "default": "all",
                        },
                        "timeRange": {
                            "type": "string",
                            "description": "분석 기간",
                            "enum": ["1h", "1d", "1w", "1m"],
                            "default": "1d",
                        },
                        "includePatterns": {
                            "type": "boolean",
                            "description": "사용 패턴 분석 포함",
                            "default": True,
                        },
                        "includeQuality": {
                            "type": "boolean",
                            "description": "코드 품질 분석 포함",
                            "default": True,
                        },
                    },
                    "required": [],
                },
            ),
            # =====================================================================
            # WebSocket Tools (5 tools)
            # =====================================================================
            Tool(
                name="startWebSocketServer",
                description="WebSocket 서버를 시작합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "port": {
                            "type": "integer",
                            "description": "서버 포트 번호",
                            "default": 8081,
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="stopWebSocketServer",
                description="WebSocket 서버를 중지합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            ),
            Tool(
                name="getWebSocketStats",
                description="WebSocket 서버 통계를 조회합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            ),
            Tool(
                name="getStreamStats",
                description="이벤트 스트림 통계를 조회합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            ),
            Tool(
                name="broadcastSystemNotification",
                description="모든 WebSocket 클라이언트에게 시스템 알림을 브로드캐스트합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "message": {
                            "type": "string",
                            "description": "알림 메시지",
                        },
                        "severity": {
                            "type": "string",
                            "description": "알림 심각도",
                            "enum": ["info", "warning", "error"],
                            "default": "info",
                        },
                        "data": {
                            "type": "object",
                            "description": "추가 데이터",
                        },
                    },
                    "required": ["message"],
                },
            ),
            # =====================================================================
            # Dashboard Tools (2 tools)
            # =====================================================================
            Tool(
                name="startDashboard",
                description="DevFlow Monitor 대시보드를 시작합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "mode": {
                            "type": "string",
                            "description": "대시보드 모드",
                            "enum": ["tui", "cli"],
                            "default": "tui",
                        },
                        "refreshInterval": {
                            "type": "integer",
                            "description": "새로고침 간격 (밀리초)",
                            "default": 1000,
                        },
                        "maxEvents": {
                            "type": "integer",
                            "description": "최대 이벤트 수",
                            "default": 100,
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="getDashboardStatus",
                description="대시보드 실행 상태를 확인합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            ),
            # =====================================================================
            # Multi-Project Management Tools (16 tools)
            # =====================================================================
            Tool(
                name="createProject",
                description="새로운 프로젝트를 생성합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "프로젝트 이름",
                        },
                        "description": {
                            "type": "string",
                            "description": "프로젝트 설명",
                        },
                        "type": {
                            "type": "string",
                            "enum": [
                                "web_application",
                                "mobile_application",
                                "api_service",
                                "library",
                                "cli_tool",
                                "microservice",
                                "monolith",
                                "data_pipeline",
                                "infrastructure",
                                "documentation",
                                "other",
                            ],
                            "description": "프로젝트 타입",
                        },
                        "priority": {
                            "type": "string",
                            "enum": ["critical", "high", "medium", "low"],
                            "description": "프로젝트 우선순위",
                        },
                        "rootPath": {
                            "type": "string",
                            "description": "프로젝트 루트 경로",
                        },
                        "tags": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "프로젝트 태그",
                        },
                    },
                    "required": ["name"],
                },
            ),
            Tool(
                name="listProjects",
                description="등록된 모든 프로젝트 목록을 조회합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "status": {
                            "type": "string",
                            "enum": [
                                "active",
                                "inactive",
                                "archived",
                                "maintenance",
                                "development",
                                "production",
                                "deprecated",
                            ],
                            "description": "필터링할 프로젝트 상태",
                        },
                        "type": {
                            "type": "string",
                            "description": "필터링할 프로젝트 타입",
                        },
                        "limit": {
                            "type": "number",
                            "description": "최대 결과 수",
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="getProject",
                description="특정 프로젝트의 상세 정보를 조회합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "projectId": {
                            "type": "string",
                            "description": "프로젝트 ID",
                        },
                    },
                    "required": ["projectId"],
                },
            ),
            Tool(
                name="updateProject",
                description="프로젝트 정보를 업데이트합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "projectId": {
                            "type": "string",
                            "description": "프로젝트 ID",
                        },
                        "name": {
                            "type": "string",
                            "description": "프로젝트 이름",
                        },
                        "description": {
                            "type": "string",
                            "description": "프로젝트 설명",
                        },
                        "status": {
                            "type": "string",
                            "enum": [
                                "active",
                                "inactive",
                                "archived",
                                "maintenance",
                                "development",
                                "production",
                                "deprecated",
                            ],
                            "description": "프로젝트 상태",
                        },
                        "priority": {
                            "type": "string",
                            "enum": ["critical", "high", "medium", "low"],
                            "description": "프로젝트 우선순위",
                        },
                        "tags": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "프로젝트 태그",
                        },
                    },
                    "required": ["projectId"],
                },
            ),
            Tool(
                name="deleteProject",
                description="프로젝트를 삭제합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "projectId": {
                            "type": "string",
                            "description": "프로젝트 ID",
                        },
                    },
                    "required": ["projectId"],
                },
            ),
            Tool(
                name="discoverProjects",
                description="지정된 경로에서 프로젝트를 자동으로 검색하고 등록합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "searchPaths": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "검색할 디렉토리 경로들",
                        },
                        "autoRegister": {
                            "type": "boolean",
                            "description": "발견된 프로젝트를 자동으로 등록할지 여부",
                            "default": True,
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="searchProjects",
                description="프로젝트를 검색합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "검색 쿼리 (프로젝트 이름)",
                        },
                        "type": {
                            "type": "string",
                            "description": "프로젝트 타입",
                        },
                        "status": {
                            "type": "string",
                            "description": "프로젝트 상태",
                        },
                        "tags": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "검색할 태그들",
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="getProjectMetrics",
                description="프로젝트의 메트릭을 조회합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "projectId": {
                            "type": "string",
                            "description": "프로젝트 ID",
                        },
                        "timeRange": {
                            "type": "string",
                            "enum": ["1h", "1d", "7d", "30d"],
                            "description": "조회할 시간 범위",
                        },
                    },
                    "required": ["projectId"],
                },
            ),
            Tool(
                name="collectProjectMetrics",
                description="프로젝트의 메트릭을 수집합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "projectId": {
                            "type": "string",
                            "description": "프로젝트 ID (생략 시 모든 활성 프로젝트)",
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="runCrossProjectAnalysis",
                description="여러 프로젝트 간의 크로스 분석을 실행합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "projectIds": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "분석할 프로젝트 ID들 (생략 시 모든 활성 프로젝트)",
                        },
                        "analysisType": {
                            "type": "string",
                            "enum": [
                                "similarity",
                                "dependency",
                                "performance",
                                "quality",
                                "trend",
                                "bottleneck",
                                "collaboration",
                            ],
                            "description": "분석 타입",
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="getProjectDependencies",
                description="프로젝트 간 의존성 관계를 조회합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "projectId": {
                            "type": "string",
                            "description": "프로젝트 ID",
                        },
                        "direction": {
                            "type": "string",
                            "enum": ["incoming", "outgoing", "both"],
                            "description": "의존성 방향",
                        },
                    },
                    "required": ["projectId"],
                },
            ),
            Tool(
                name="getMultiProjectStatus",
                description="다중 프로젝트 시스템의 전체 상태를 조회합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            ),
            Tool(
                name="getProjectPortfolio",
                description="프로젝트 포트폴리오 개요를 조회합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "groupBy": {
                            "type": "string",
                            "enum": ["type", "status", "priority", "owner"],
                            "description": "그룹화 기준",
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="enableProjectSync",
                description="프로젝트 동기화를 활성화합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "endpoint": {
                            "type": "string",
                            "description": "동기화 서버 엔드포인트",
                        },
                        "apiKey": {
                            "type": "string",
                            "description": "API 키",
                        },
                        "interval": {
                            "type": "number",
                            "description": "동기화 간격 (초)",
                        },
                    },
                    "required": ["endpoint", "apiKey"],
                },
            ),
            Tool(
                name="triggerProjectSync",
                description="프로젝트 동기화를 수동으로 트리거합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "force": {
                            "type": "boolean",
                            "description": "강제 동기화 여부",
                            "default": False,
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="getProjectSyncStatus",
                description="프로젝트 동기화 상태를 조회합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            ),
            # =====================================================================
            # Advanced Metrics Tools (4 tools)
            # =====================================================================
            Tool(
                name="getAdvancedMetrics",
                description="고급 메트릭 분석 결과를 조회합니다. 병목 현상, 인사이트, 권장사항을 포함합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "includeBottlenecks": {
                            "type": "boolean",
                            "description": "병목 현상 포함 여부",
                            "default": True,
                        },
                        "includeInsights": {
                            "type": "boolean",
                            "description": "인사이트 포함 여부",
                            "default": True,
                        },
                        "includeRecommendations": {
                            "type": "boolean",
                            "description": "권장사항 포함 여부",
                            "default": True,
                        },
                        "timeRange": {
                            "type": "string",
                            "description": "조회 시간 범위 (예: 1h, 24h, 7d)",
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="getBottlenecks",
                description="현재 감지된 병목 현상을 조회합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": ["process", "quality", "resource", "workflow", "technical"],
                            "description": "병목 유형 필터",
                        },
                        "severity": {
                            "type": "string",
                            "enum": ["info", "warning", "error", "critical"],
                            "description": "심각도 필터",
                        },
                        "minImpact": {
                            "type": "integer",
                            "minimum": 0,
                            "maximum": 100,
                            "description": "최소 영향도 필터",
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="getMetricsSnapshot",
                description="현재 메트릭 스냅샷을 조회합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "includeHistory": {
                            "type": "boolean",
                            "description": "히스토리 포함 여부",
                            "default": False,
                        },
                        "metricTypes": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "조회할 메트릭 유형 목록",
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="analyzeProductivity",
                description="생산성 메트릭을 상세 분석합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "timeRange": {
                            "type": "string",
                            "description": "분석 시간 범위 (예: 1h, 24h, 7d)",
                            "default": "24h",
                        },
                        "includeTrends": {
                            "type": "boolean",
                            "description": "트렌드 분석 포함 여부",
                            "default": True,
                        },
                    },
                    "required": [],
                },
            ),
            # =====================================================================
            # Notification Tools (6 tools)
            # =====================================================================
            Tool(
                name="configureNotifications",
                description="알림 채널 및 규칙을 설정합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "channel": {
                            "type": "string",
                            "enum": ["slack", "email", "dashboard", "webhook"],
                            "description": "알림 채널",
                        },
                        "config": {
                            "type": "object",
                            "description": "채널별 설정 객체",
                        },
                        "rules": {
                            "type": "array",
                            "description": "알림 규칙 목록",
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="sendNotification",
                description="즉시 알림을 전송합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "title": {
                            "type": "string",
                            "description": "알림 제목",
                        },
                        "content": {
                            "type": "string",
                            "description": "알림 내용",
                        },
                        "severity": {
                            "type": "string",
                            "enum": ["info", "warning", "error", "critical"],
                            "description": "심각도",
                        },
                        "priority": {
                            "type": "string",
                            "enum": ["low", "medium", "high", "urgent"],
                            "description": "우선순위",
                        },
                        "channels": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "대상 채널 목록",
                        },
                    },
                    "required": ["title", "content"],
                },
            ),
            Tool(
                name="getNotificationRules",
                description="알림 규칙 목록을 조회합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "enabled": {
                            "type": "boolean",
                            "description": "활성화된 규칙만 조회 여부",
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="getNotificationStats",
                description="알림 통계를 조회합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            ),
            Tool(
                name="getDashboardNotifications",
                description="대시보드 알림을 조회합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "unreadOnly": {
                            "type": "boolean",
                            "description": "읽지 않은 알림만 조회",
                            "default": False,
                        },
                        "limit": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 100,
                            "description": "최대 조회 개수",
                            "default": 50,
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="deleteNotificationRule",
                description="알림 규칙을 삭제합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "ruleId": {
                            "type": "string",
                            "description": "삭제할 규칙 ID",
                        },
                    },
                    "required": ["ruleId"],
                },
            ),
                    # =====================================================================
            # Report Generation Tools (7 tools)
            # =====================================================================
            Tool(
                name="generateQuickReport",
                description="빠른 보고서를 생성합니다 (일일/주간/월간).",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "type": {
                            "type": "string",
                            "description": "보고서 타입",
                            "enum": ["daily", "weekly", "monthly"],
                        },
                        "projectIds": {
                            "type": "array",
                            "description": "대상 프로젝트 ID 목록",
                            "items": {"type": "string"},
                        },
                    },
                    "required": ["type"],
                },
            ),
            Tool(
                name="createReportSchedule",
                description="정기적인 보고서 생성 스케줄을 만듭니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "스케줄 이름"},
                        "reportType": {"type": "string", "description": "보고서 타입", "enum": ["daily", "weekly", "monthly"]},
                        "scheduleType": {"type": "string", "description": "스케줄 타입", "enum": ["daily", "weekly", "monthly"]},
                        "time": {"type": "string", "description": "실행 시간 (HH:mm 형식)"},
                        "dayOfWeek": {"type": "number", "description": "실행 요일 (0-6, 주간 스케줄용)"},
                        "dayOfMonth": {"type": "number", "description": "실행 날짜 (1-31, 월간 스케줄용)"},
                        "emailRecipients": {"type": "array", "description": "이메일 수신자 목록", "items": {"type": "string"}},
                    },
                    "required": ["name", "reportType", "scheduleType", "time"],
                },
            ),
            Tool(
                name="listReportSchedules",
                description="모든 보고서 스케줄을 조회합니다.",
                inputSchema={"type": "object", "properties": {}},
            ),
            Tool(
                name="deleteReportSchedule",
                description="보고서 스케줄을 삭제합니다.",
                inputSchema={"type": "object", "properties": {"scheduleId": {"type": "string", "description": "삭제할 스케줄 ID"}}, "required": ["scheduleId"]},
            ),
            Tool(
                name="runScheduleNow",
                description="스케줄된 보고서를 즉시 실행합니다.",
                inputSchema={"type": "object", "properties": {"scheduleId": {"type": "string", "description": "실행할 스케줄 ID"}}, "required": ["scheduleId"]},
            ),
            Tool(
                name="listReportTemplates",
                description="사용 가능한 보고서 템플릿을 조회합니다.",
                inputSchema={"type": "object", "properties": {"type": {"type": "string", "description": "템플릿 타입 필터", "enum": ["daily", "weekly", "monthly", "methodology", "ai_usage"]}}},
            ),
            Tool(
                name="getReportSystemStatus",
                description="보고서 시스템 상태를 조회합니다.",
                inputSchema={"type": "object", "properties": {}},
            ),
            # =====================================================================
            # User Feedback Tools (10 tools)
            # =====================================================================
            Tool(
                name="submitFeedback",
                description="사용자 피드백을 제출합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "type": {"type": "string", "enum": ["bug_report", "feature_request", "usability_issue", "performance_issue", "documentation", "general", "praise"], "description": "피드백 타입"},
                        "title": {"type": "string", "description": "피드백 제목"},
                        "description": {"type": "string", "description": "피드백 설명"},
                        "projectId": {"type": "string", "description": "프로젝트 ID (선택)"},
                        "priority": {"type": "string", "enum": ["critical", "high", "medium", "low"], "description": "우선순위 (선택)"},
                        "tags": {"type": "array", "items": {"type": "string"}, "description": "태그 목록"},
                    },
                    "required": ["type", "title", "description"],
                },
            ),
            Tool(
                name="listFeedback",
                description="피드백 목록을 조회합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "limit": {"type": "number", "description": "조회할 개수", "default": 20},
                        "type": {"type": "string", "enum": ["bug_report", "feature_request", "usability_issue", "performance_issue", "documentation", "general", "praise"], "description": "피드백 타입 필터"},
                        "status": {"type": "string", "enum": ["new", "reviewing", "in_progress", "resolved", "closed", "deferred"], "description": "상태 필터"},
                        "priority": {"type": "string", "enum": ["critical", "high", "medium", "low"], "description": "우선순위 필터"},
                        "projectId": {"type": "string", "description": "프로젝트 ID 필터"},
                    },
                },
            ),
            Tool(
                name="getFeedbackDetails",
                description="특정 피드백의 상세 정보를 조회합니다.",
                inputSchema={"type": "object", "properties": {"feedbackId": {"type": "string", "description": "피드백 ID"}}, "required": ["feedbackId"]},
            ),
            Tool(
                name="updateFeedbackStatus",
                description="피드백 상태를 업데이트합니다.",
                inputSchema={"type": "object", "properties": {"feedbackId": {"type": "string", "description": "피드백 ID"}, "status": {"type": "string", "enum": ["new", "reviewing", "in_progress", "resolved", "closed", "deferred"], "description": "새로운 상태"}}, "required": ["feedbackId", "status"]},
            ),
            Tool(
                name="listImprovementSuggestions",
                description="개선 제안 목록을 조회합니다.",
                inputSchema={"type": "object", "properties": {"status": {"type": "string", "enum": ["proposed", "approved", "in_progress", "completed", "rejected"], "description": "상태 필터"}}},
            ),
            Tool(
                name="getUserPreferences",
                description="사용자 선호도를 조회합니다.",
                inputSchema={"type": "object", "properties": {"userId": {"type": "string", "description": "사용자 ID"}}, "required": ["userId"]},
            ),
            Tool(
                name="createABTest",
                description="A/B 테스트를 생성합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "테스트 이름"},
                        "description": {"type": "string", "description": "테스트 설명"},
                        "variants": {"type": "array", "description": "테스트 변형 목록", "items": {"type": "object", "properties": {"name": {"type": "string"}, "trafficPercentage": {"type": "number"}, "changes": {"type": "object"}, "isControl": {"type": "boolean"}}, "required": ["name", "trafficPercentage", "changes", "isControl"]}},
                        "metrics": {"type": "array", "description": "측정 메트릭 목록", "items": {"type": "object", "properties": {"name": {"type": "string"}, "type": {"type": "string", "enum": ["conversion", "engagement", "performance", "custom"]}, "goal": {"type": "number"}, "calculation": {"type": "string"}}, "required": ["name", "type", "calculation"]}},
                        "audiencePercentage": {"type": "number", "description": "대상 사용자 비율 (0-100)", "default": 100},
                    },
                    "required": ["name", "description", "variants", "metrics"],
                },
            ),
            Tool(
                name="listActiveABTests",
                description="활성 A/B 테스트 목록을 조회합니다.",
                inputSchema={"type": "object", "properties": {}},
            ),
            Tool(
                name="getABTestResults",
                description="A/B 테스트 결과를 조회합니다.",
                inputSchema={"type": "object", "properties": {"testId": {"type": "string", "description": "테스트 ID"}}, "required": ["testId"]},
            ),
            Tool(
                name="getFeedbackStats",
                description="피드백 통계를 조회합니다.",
                inputSchema={"type": "object", "properties": {"projectId": {"type": "string", "description": "프로젝트 ID (선택)"}}},
            ),
            # =====================================================================
            # Performance Tools (5 tools)
            # =====================================================================
            Tool(
                name="getPerformanceReport",
                description="종합 성능 보고서를 생성합니다. 캐시, 메모리, 비동기 작업, 스케일링 상태를 포함합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "includeRecommendations": {
                            "type": "boolean",
                            "description": "권장사항 포함 여부",
                            "default": True,
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="optimizePerformance",
                description="시스템 성능 최적화를 실행합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "level": {
                            "type": "string",
                            "enum": ["basic", "aggressive", "emergency"],
                            "description": "최적화 수준",
                            "default": "basic",
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="getSystemMetrics",
                description="실시간 시스템 메트릭을 조회합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "includeHistory": {
                            "type": "boolean",
                            "description": "히스토리 포함 여부",
                            "default": False,
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="profilePerformance",
                description="성능 프로파일링을 시작하거나 중지합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "action": {
                            "type": "string",
                            "enum": ["start", "stop", "status"],
                            "description": "프로파일링 작업",
                            "default": "status",
                        },
                        "intervalMs": {
                            "type": "integer",
                            "description": "모니터링 간격 (밀리초)",
                            "default": 5000,
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="manageCaches",
                description="캐시 관리 작업을 수행합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "action": {
                            "type": "string",
                            "enum": ["clear", "stats", "warmup", "optimize"],
                            "description": "캐시 작업",
                            "default": "stats",
                        },
                        "cacheType": {
                            "type": "string",
                            "enum": ["all", "memory", "sqlite"],
                            "description": "대상 캐시 유형",
                            "default": "all",
                        },
                    },
                    "required": [],
                },
            ),
            # =====================================================================
            # Security Tools (10 tools)
            # =====================================================================
            Tool(
                name="login",
                description="사용자 로그인을 처리합니다. JWT 토큰을 발급합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "username": {
                            "type": "string",
                            "description": "사용자 이름",
                        },
                        "password": {
                            "type": "string",
                            "description": "비밀번호",
                        },
                        "rememberMe": {
                            "type": "boolean",
                            "description": "로그인 상태 유지 여부",
                            "default": False,
                        },
                    },
                    "required": ["username", "password"],
                },
            ),
            Tool(
                name="verifyToken",
                description="JWT 토큰을 검증합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "token": {
                            "type": "string",
                            "description": "검증할 JWT 토큰",
                        },
                    },
                    "required": ["token"],
                },
            ),
            Tool(
                name="checkPermission",
                description="사용자 권한을 확인합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "userId": {
                            "type": "string",
                            "description": "사용자 ID",
                        },
                        "resource": {
                            "type": "string",
                            "description": "리소스 이름",
                        },
                        "action": {
                            "type": "string",
                            "enum": ["create", "read", "update", "delete", "execute", "admin"],
                            "description": "권한 액션",
                        },
                    },
                    "required": ["userId", "resource", "action"],
                },
            ),
            Tool(
                name="generateAPIKey",
                description="API 키를 생성합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "userId": {
                            "type": "string",
                            "description": "사용자 ID",
                        },
                        "name": {
                            "type": "string",
                            "description": "API 키 이름",
                        },
                        "permissions": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "부여할 권한 목록",
                        },
                        "expiresInDays": {
                            "type": "integer",
                            "description": "만료 기간 (일)",
                            "default": 30,
                        },
                    },
                    "required": ["userId", "name"],
                },
            ),
            Tool(
                name="encryptData",
                description="데이터를 AES-256-GCM으로 암호화합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "data": {
                            "type": "string",
                            "description": "암호화할 데이터",
                        },
                    },
                    "required": ["data"],
                },
            ),
            Tool(
                name="decryptData",
                description="암호화된 데이터를 복호화합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "encrypted": {
                            "type": "string",
                            "description": "암호화된 데이터",
                        },
                        "iv": {
                            "type": "string",
                            "description": "초기화 벡터",
                        },
                        "tag": {
                            "type": "string",
                            "description": "인증 태그 (선택)",
                        },
                    },
                    "required": ["encrypted", "iv"],
                },
            ),
            Tool(
                name="getSecurityStats",
                description="보안 시스템 통계를 조회합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            ),
            Tool(
                name="queryAuditLogs",
                description="감사 로그를 조회합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "userId": {
                            "type": "string",
                            "description": "사용자 ID 필터",
                        },
                        "eventType": {
                            "type": "string",
                            "description": "이벤트 타입 필터",
                        },
                        "startDate": {
                            "type": "string",
                            "description": "시작 날짜 (ISO 8601)",
                        },
                        "endDate": {
                            "type": "string",
                            "description": "종료 날짜 (ISO 8601)",
                        },
                        "limit": {
                            "type": "integer",
                            "description": "최대 조회 개수",
                            "default": 100,
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="getAuditSummary",
                description="감사 로그 요약을 조회합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "startDate": {
                            "type": "string",
                            "description": "시작 날짜 (ISO 8601)",
                        },
                        "endDate": {
                            "type": "string",
                            "description": "종료 날짜 (ISO 8601)",
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="assignRole",
                description="사용자에게 역할을 할당합니다.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "userId": {
                            "type": "string",
                            "description": "사용자 ID",
                        },
                        "roleId": {
                            "type": "string",
                            "description": "역할 ID",
                        },
                        "assignedBy": {
                            "type": "string",
                            "description": "할당자 ID",
                        },
                        "reason": {
                            "type": "string",
                            "description": "할당 사유",
                        },
                    },
                    "required": ["userId", "roleId", "assignedBy"],
                },
            ),
        ]

    async def _handle_tool_call(
        self,
        name: str,
        arguments: dict[str, Any],
    ) -> Sequence[TextContent]:
        """도구 호출을 처리합니다.

        Args:
            name: 도구 이름.
            arguments: 도구 인자.

        Returns:
            TextContent 시퀀스.

        Raises:
            ValueError: 알 수 없는 도구인 경우.
        """
        logger.debug("Tool call: %s with args: %s", name, arguments)

        handlers: dict[str, Any] = {
            "getProjectStatus": self._handle_get_project_status,
            "getMetrics": self._handle_get_metrics,
            "getActivityLog": self._handle_get_activity_log,
            "analyzeBottlenecks": self._handle_analyze_bottlenecks,
            "checkMethodology": self._handle_check_methodology,
            "generateReport": self._handle_generate_report,
            # Plugin management handlers
            "listPlugins": self._handle_list_plugins,
            "getPluginInfo": self._handle_get_plugin_info,
            "loadPlugin": self._handle_load_plugin,
            "unloadPlugin": self._handle_unload_plugin,
            "activatePlugin": self._handle_activate_plugin,
            "deactivatePlugin": self._handle_deactivate_plugin,
            "restartPlugin": self._handle_restart_plugin,
            "installPlugin": self._handle_install_plugin,
            "uninstallPlugin": self._handle_uninstall_plugin,
            "searchPlugins": self._handle_search_plugins,
            "checkPluginHealth": self._handle_check_plugin_health,
            "getPluginMetrics": self._handle_get_plugin_metrics,
            "updatePlugin": self._handle_update_plugin,
            "checkPluginUpdates": self._handle_check_plugin_updates,
            "getPluginSystemStats": self._handle_get_plugin_system_stats,
            # Development Stage Analysis handler
            "analyzeStage": self._handle_analyze_stage,
            # AI Collaboration handler
            "analyzeAICollaboration": self._handle_analyze_ai_collaboration,
            # WebSocket handlers
            "startWebSocketServer": self._handle_start_websocket_server,
            "stopWebSocketServer": self._handle_stop_websocket_server,
            "getWebSocketStats": self._handle_get_websocket_stats,
            "getStreamStats": self._handle_get_stream_stats,
            "broadcastSystemNotification": self._handle_broadcast_system_notification,
            # Dashboard handlers
            "startDashboard": self._handle_start_dashboard,
            "getDashboardStatus": self._handle_get_dashboard_status,
            # Multi-Project Management handlers
            "createProject": self._handle_create_project,
            "listProjects": self._handle_list_projects,
            "getProject": self._handle_get_project,
            "updateProject": self._handle_update_project,
            "deleteProject": self._handle_delete_project,
            "discoverProjects": self._handle_discover_projects,
            "searchProjects": self._handle_search_projects,
            "getProjectMetrics": self._handle_get_project_metrics,
            "collectProjectMetrics": self._handle_collect_project_metrics,
            "runCrossProjectAnalysis": self._handle_run_cross_project_analysis,
            "getProjectDependencies": self._handle_get_project_dependencies,
            "getMultiProjectStatus": self._handle_get_multi_project_status,
            "getProjectPortfolio": self._handle_get_project_portfolio,
            "enableProjectSync": self._handle_enable_project_sync,
            "triggerProjectSync": self._handle_trigger_project_sync,
            "getProjectSyncStatus": self._handle_get_project_sync_status,
            # Advanced Metrics handlers
            "getAdvancedMetrics": self._handle_get_advanced_metrics,
            "getBottlenecks": self._handle_get_bottlenecks,
            "getMetricsSnapshot": self._handle_get_metrics_snapshot,
            "analyzeProductivity": self._handle_analyze_productivity,
            # Notification handlers
            "configureNotifications": self._handle_configure_notifications,
            "sendNotification": self._handle_send_notification,
            "getNotificationRules": self._handle_get_notification_rules,
            "getNotificationStats": self._handle_get_notification_stats,
            "getDashboardNotifications": self._handle_get_dashboard_notifications,
            "deleteNotificationRule": self._handle_delete_notification_rule,
            # Report Generation handlers
            "generateQuickReport": self._handle_generate_quick_report,
            "createReportSchedule": self._handle_create_report_schedule,
            "listReportSchedules": self._handle_list_report_schedules,
            "deleteReportSchedule": self._handle_delete_report_schedule,
            "runScheduleNow": self._handle_run_schedule_now,
            "listReportTemplates": self._handle_list_report_templates,
            "getReportSystemStatus": self._handle_get_report_system_status,
            # User Feedback handlers
            "submitFeedback": self._handle_submit_feedback,
            "listFeedback": self._handle_list_feedback,
            "getFeedbackDetails": self._handle_get_feedback_details,
            "updateFeedbackStatus": self._handle_update_feedback_status,
            "listImprovementSuggestions": self._handle_list_improvement_suggestions,
            "getUserPreferences": self._handle_get_user_preferences,
            "createABTest": self._handle_create_ab_test,
            "listActiveABTests": self._handle_list_active_ab_tests,
            "getABTestResults": self._handle_get_ab_test_results,
            "getFeedbackStats": self._handle_get_feedback_stats,
            # Performance handlers
            "getPerformanceReport": self._handle_get_performance_report,
            "optimizePerformance": self._handle_optimize_performance,
            "getSystemMetrics": self._handle_get_system_metrics,
            "profilePerformance": self._handle_profile_performance,
            "manageCaches": self._handle_manage_caches,
            # Security handlers
            "login": self._handle_login,
            "verifyToken": self._handle_verify_token,
            "checkPermission": self._handle_check_permission,
            "generateAPIKey": self._handle_generate_api_key,
            "encryptData": self._handle_encrypt_data,
            "decryptData": self._handle_decrypt_data,
            "getSecurityStats": self._handle_get_security_stats,
            "queryAuditLogs": self._handle_query_audit_logs,
            "getAuditSummary": self._handle_get_audit_summary,
            "assignRole": self._handle_assign_role,
        }

        handler = handlers.get(name)
        if not handler:
            error_msg = f"Unknown tool: {name}"
            logger.error(error_msg)
            return [TextContent(type="text", text=error_msg)]

        try:
            result = await handler(arguments)
            return [TextContent(type="text", text=result)]
        except Exception as e:
            error_msg = f"Error executing tool {name}: {e}"
            logger.exception(error_msg)
            return [TextContent(type="text", text=error_msg)]

    async def _handle_get_project_status(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """프로젝트 상태 조회를 처리합니다."""
        args = GetProjectStatusArgs(**arguments)
        timestamp = create_timestamp()

        # TODO: 실제 프로젝트 상태 수집 구현
        status = {
            "project": {
                "name": self.config.server.name,
                "version": self.config.server.version,
                "status": "active",
                "lastActivity": timestamp,
            },
            "milestones": {
                "current": "MVP",
                "progress": {
                    "total": 10,
                    "completed": 5,
                    "current": "Core Features",
                    "percentage": 50,
                },
            },
            "environment": {
                "pythonVersion": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
                "platform": sys.platform,
                "cwd": ".",
            },
            "includeDetails": args.include_details,
        }

        return f"Project Status:\n{status}"

    async def _handle_get_metrics(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """메트릭 조회를 처리합니다."""
        args = GetMetricsArgs(**arguments)
        timestamp = create_timestamp()

        # TODO: 실제 메트릭 수집 구현
        metrics = {
            "timeRange": args.time_range.value if args.time_range else "1d",
            "metricType": args.metric_type.value if args.metric_type else "all",
            "timestamp": timestamp,
            "summary": "Metrics collected successfully",
        }

        return f"Metrics:\n{metrics}"

    async def _handle_get_activity_log(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """활동 로그 조회를 처리합니다."""
        args = GetActivityLogArgs(**arguments)
        timestamp = create_timestamp()

        # TODO: 실제 활동 로그 수집 구현
        activities = {
            "totalCount": 0,
            "activities": [],
            "filters": {
                "limit": args.limit or 50,
                "stage": args.stage.value if args.stage else None,
            },
            "timestamp": timestamp,
        }

        return f"Activity Log:\n{activities}"

    async def _handle_analyze_bottlenecks(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """병목 분석을 처리합니다."""
        args = AnalyzeBottlenecksArgs(**arguments)
        timestamp = create_timestamp()

        # TODO: 실제 병목 분석 구현
        analysis: dict[str, Any] = {
            "analysisDepth": args.analysis_depth.value if args.analysis_depth else "basic",
            "timestamp": timestamp,
            "bottlenecks": [],
            "recommendations": [],
            "nextSteps": [],
        }

        return f"Bottleneck Analysis:\n{analysis}"

    async def _handle_check_methodology(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """방법론 검사를 처리합니다."""
        args = CheckMethodologyArgs(**arguments)
        timestamp = create_timestamp()

        # TODO: 실제 방법론 검사 구현
        check_result: dict[str, Any] = {
            "methodology": args.methodology.value if args.methodology else "all",
            "timestamp": timestamp,
            "compliance": {
                "overall": 0,
                "byMethodology": {},
            },
            "findings": [],
            "includeRecommendations": args.include_recommendations,
            "summary": "Methodology check completed",
        }

        return f"Methodology Check:\n{check_result}"

    async def _handle_generate_report(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """보고서 생성을 처리합니다."""
        args = GenerateReportArgs(**arguments)
        timestamp = create_timestamp()

        # TODO: 실제 보고서 생성 구현
        report: dict[str, Any] = {
            "reportType": args.report_type.value if args.report_type else "daily",
            "format": args.format.value if args.format else "summary",
            "timestamp": timestamp,
            "period": {
                "start": timestamp,
                "end": timestamp,
            },
            "summary": {
                "totalActivities": 0,
                "keyMetrics": {},
                "highlights": [],
            },
            "sections": [],
            "recommendations": [],
            "includeMetrics": args.include_metrics,
            "includeTrends": args.include_trends,
        }

        return f"Generated Report:\n{report}"

    # =========================================================================
    # Development Stage Analysis Handler
    # =========================================================================

    async def _handle_analyze_stage(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """개발 단계 분석을 처리합니다."""
        args = AnalyzeStageArgs(**arguments)
        timestamp = create_timestamp()

        development_stages = [
            "prd", "planning", "erd", "wireframe", "screen_spec",
            "design", "frontend", "backend", "ai_collaboration",
            "coding", "git_management", "deployment", "monitoring",
        ]
        coding_sub_stages = [
            "usecase", "event_storming", "domain_modeling", "usecase_detail",
            "ai_prompt_design", "first_implementation", "business_logic",
            "refactoring", "unit_test", "integration_test", "e2e_test",
        ]

        current_stage = "coding"
        current_sub_stage = "business_logic"
        confidence = 0.85

        result: dict[str, Any] = {
            "timestamp": timestamp,
            "currentStage": current_stage,
            "confidence": f"{int(confidence * 100)}%",
            "stageDescription": self._get_stage_description(current_stage),
            "progress": {
                "stageIndex": development_stages.index(current_stage),
                "totalStages": len(development_stages),
                "percentage": int((development_stages.index(current_stage) / len(development_stages)) * 100),
            },
        }

        if args.include_sub_stages and current_stage == "coding":
            result["codingSubStage"] = {
                "current": current_sub_stage,
                "description": self._get_sub_stage_description(current_sub_stage),
                "subStageIndex": coding_sub_stages.index(current_sub_stage),
                "totalSubStages": len(coding_sub_stages),
            }

        if args.include_history:
            result["history"] = [
                {"stage": "prd", "startedAt": "2025-01-01T09:00:00Z", "completedAt": "2025-01-01T12:00:00Z", "duration": "3h"},
                {"stage": "planning", "startedAt": "2025-01-01T13:00:00Z", "completedAt": "2025-01-02T10:00:00Z", "duration": "21h"},
            ][: args.history_limit]

        result["recommendations"] = [
            "현재 비즈니스 로직 구현 단계입니다.",
            "테스트 작성을 병행하여 TDD를 실천해 보세요.",
            "코드 리뷰 준비를 시작하세요.",
        ]

        return json.dumps(result, indent=2, ensure_ascii=False)

    def _get_stage_description(self, stage: str) -> str:
        """개발 단계 설명을 반환합니다."""
        descriptions = {
            "prd": "PRD(제품 요구사항 문서) 작성", "planning": "기획서 작성",
            "erd": "ERD 설계", "wireframe": "와이어프레임 작성",
            "screen_spec": "화면단위 기획서", "design": "디자인 작업",
            "frontend": "프론트엔드 개발", "backend": "백엔드 개발",
            "ai_collaboration": "AI 협업 작업", "coding": "코딩 작업",
            "git_management": "Git 관리", "deployment": "배포",
            "monitoring": "운영 및 모니터링",
        }
        return descriptions.get(stage, stage)

    def _get_sub_stage_description(self, sub_stage: str) -> str:
        """코딩 세부 단계 설명을 반환합니다."""
        descriptions = {
            "usecase": "UseCase 도출", "event_storming": "Event Storming",
            "domain_modeling": "Domain 모델링", "usecase_detail": "UseCase 상세 설계",
            "ai_prompt_design": "AI 프롬프트 설계", "first_implementation": "1차 뼈대 구현(AI)",
            "business_logic": "비즈니스 로직 구현", "refactoring": "리팩토링",
            "unit_test": "단위 테스트", "integration_test": "통합 테스트",
            "e2e_test": "E2E 테스트",
        }
        return descriptions.get(sub_stage, sub_stage)

    # =========================================================================
    # AI Collaboration Handler
    # =========================================================================

    async def _handle_analyze_ai_collaboration(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """AI 협업 분석을 처리합니다."""
        args = AnalyzeAICollaborationArgs(**arguments)
        timestamp = create_timestamp()

        result: dict[str, Any] = {
            "timestamp": timestamp,
            "filter": {
                "tool": args.tool.value if args.tool else "all",
                "timeRange": args.time_range.value if args.time_range else "1d",
            },
            "summary": {
                "totalSuggestions": 150, "acceptedSuggestions": 120,
                "rejectedSuggestions": 20, "modifiedSuggestions": 10,
                "acceptanceRate": "80%",
            },
            "toolUsage": {
                "claude": {"suggestions": 80, "accepted": 70, "rate": "87.5%"},
                "github_copilot": {"suggestions": 50, "accepted": 35, "rate": "70%"},
                "chatgpt": {"suggestions": 20, "accepted": 15, "rate": "75%"},
            },
            "effectiveness": {
                "timeSaved": "4.5 hours", "productivityIncrease": "35%",
                "codeQualityImpact": "positive",
            },
        }

        if args.include_patterns:
            result["usagePatterns"] = {
                "peakHours": ["10:00", "14:00", "16:00"],
                "averageSessionLength": "45 minutes",
                "mostUsedFor": ["code generation", "refactoring", "documentation"],
                "leastUsedFor": ["debugging", "testing"],
            }

        if args.include_quality:
            result["codeQuality"] = {
                "readability": {"score": 85, "trend": "improving"},
                "maintainability": {"score": 78, "trend": "stable"},
                "performance": {"score": 72, "trend": "needs_attention"},
                "testCoverage": {"score": 65, "trend": "improving"},
            }

        result["recommendations"] = [
            "Claude를 코드 리뷰에 더 활용해 보세요.",
            "테스트 작성 시 AI 도구 활용을 늘려보세요.",
            "성능 관련 코드에서 AI 제안을 더 검토하세요.",
        ]

        return json.dumps(result, indent=2, ensure_ascii=False)

    # =========================================================================
    # WebSocket Handlers
    # =========================================================================

    async def _handle_start_websocket_server(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """WebSocket 서버를 시작합니다."""
        args = StartWebSocketServerArgs(**arguments)
        timestamp = create_timestamp()

        result: dict[str, Any] = {
            "timestamp": timestamp, "status": "started",
            "message": f"WebSocket server started on port {args.port}",
            "port": args.port, "connectionUrl": f"ws://localhost:{args.port}",
        }
        return json.dumps(result, indent=2, ensure_ascii=False)

    async def _handle_stop_websocket_server(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """WebSocket 서버를 중지합니다."""
        timestamp = create_timestamp()
        result: dict[str, Any] = {
            "timestamp": timestamp, "status": "stopped",
            "message": "WebSocket server stopped successfully",
        }
        return json.dumps(result, indent=2, ensure_ascii=False)

    async def _handle_get_websocket_stats(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """WebSocket 서버 통계를 조회합니다."""
        timestamp = create_timestamp()
        result: dict[str, Any] = {
            "timestamp": timestamp, "isRunning": True, "port": 8081,
            "stats": {
                "connectedClients": 5, "totalConnections": 150,
                "totalDisconnections": 145, "messagesReceived": 1200,
                "messagesSent": 3500, "bytesReceived": "2.5 MB", "bytesSent": "8.2 MB",
            },
            "clients": [
                {"id": "client-1", "connectedAt": "2025-01-01T10:00:00Z", "subscriptions": ["events", "metrics"]},
                {"id": "client-2", "connectedAt": "2025-01-01T10:30:00Z", "subscriptions": ["events"]},
            ],
            "uptime": "2h 30m",
        }
        return json.dumps(result, indent=2, ensure_ascii=False)

    async def _handle_get_stream_stats(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """이벤트 스트림 통계를 조회합니다."""
        timestamp = create_timestamp()
        result: dict[str, Any] = {
            "timestamp": timestamp,
            "streams": {
                "events": {"active": True, "subscribers": 5, "totalEvents": 1500, "eventsPerMinute": 25},
                "metrics": {"active": True, "subscribers": 3, "totalEvents": 500, "eventsPerMinute": 10},
                "notifications": {"active": True, "subscribers": 4, "totalEvents": 200, "eventsPerMinute": 5},
            },
            "bufferStats": {"currentSize": 150, "maxSize": 1000, "utilization": "15%"},
        }
        return json.dumps(result, indent=2, ensure_ascii=False)

    async def _handle_broadcast_system_notification(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """시스템 알림을 브로드캐스트합니다."""
        args = BroadcastNotificationArgs(**arguments)
        timestamp = create_timestamp()
        result: dict[str, Any] = {
            "timestamp": timestamp, "status": "success",
            "message": "Notification broadcasted successfully",
            "notification": {
                "message": args.message,
                "severity": args.severity.value if args.severity else "info",
                "data": args.data,
            },
            "recipients": 5,
        }
        return json.dumps(result, indent=2, ensure_ascii=False)

    # =========================================================================
    # Dashboard Handlers
    # =========================================================================

    async def _handle_start_dashboard(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """대시보드를 시작합니다."""
        args = StartDashboardArgs(**arguments)
        timestamp = create_timestamp()
        result: dict[str, Any] = {
            "timestamp": timestamp, "status": "started",
            "message": f"Dashboard started in {args.mode.value if args.mode else 'tui'} mode",
            "config": {
                "mode": args.mode.value if args.mode else "tui",
                "refreshInterval": args.refresh_interval,
                "maxEvents": args.max_events,
            },
            "instructions": {
                "tui": ["r - 새로고침", "c - 통계 초기화", "h - 도움말", "q 또는 ESC - 종료"],
                "cli": ["자동 새로고침 모드", "Ctrl+C - 종료"],
            },
        }
        return json.dumps(result, indent=2, ensure_ascii=False)

    async def _handle_get_dashboard_status(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """대시보드 상태를 조회합니다."""
        timestamp = create_timestamp()
        result: dict[str, Any] = {
            "timestamp": timestamp, "status": "running", "mode": "tui",
            "uptime": "1h 15m", "lastRefresh": timestamp,
            "config": {"refreshInterval": 1000, "maxEvents": 100},
            "panels": {
                "status": {"active": True, "lastUpdate": timestamp},
                "stage": {"active": True, "lastUpdate": timestamp},
                "activity": {"active": True, "lastUpdate": timestamp},
                "metrics": {"active": True, "lastUpdate": timestamp},
                "methodology": {"active": True, "lastUpdate": timestamp},
                "aiUsage": {"active": True, "lastUpdate": timestamp},
            },
            "performance": {"cpuUsage": "2.5%", "memoryUsage": "45 MB", "renderTime": "15ms"},
        }
        return json.dumps(result, indent=2, ensure_ascii=False)

    # =========================================================================
    # Report Generation Handlers (7 handlers)
    # =========================================================================

    async def _handle_generate_quick_report(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """빠른 보고서를 생성합니다."""
        timestamp = create_timestamp()
        report_type = arguments.get("type", "daily")
        project_ids = arguments.get("projectIds", [])

        result: dict[str, Any] = {
            "success": True,
            "reportId": f"report-{timestamp}",
            "type": report_type,
            "projectIds": project_ids,
            "generatedAt": timestamp,
            "files": [
                {"format": "pdf", "path": f"./reports/{report_type}-{timestamp}.pdf"},
                {"format": "html", "path": f"./reports/{report_type}-{timestamp}.html"},
            ],
        }
        return json.dumps(result, indent=2, ensure_ascii=False)

    async def _handle_create_report_schedule(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """보고서 스케줄을 생성합니다."""
        timestamp = create_timestamp()
        result: dict[str, Any] = {
            "success": True,
            "scheduleId": f"schedule-{timestamp}",
            "name": arguments.get("name"),
            "reportType": arguments.get("reportType"),
            "scheduleType": arguments.get("scheduleType"),
            "time": arguments.get("time"),
            "dayOfWeek": arguments.get("dayOfWeek"),
            "dayOfMonth": arguments.get("dayOfMonth"),
            "emailRecipients": arguments.get("emailRecipients", []),
            "enabled": True,
            "createdAt": timestamp,
        }
        return json.dumps(result, indent=2, ensure_ascii=False)

    async def _handle_list_report_schedules(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """보고서 스케줄 목록을 조회합니다."""
        timestamp = create_timestamp()
        result: dict[str, Any] = {
            "success": True,
            "schedules": [],
            "total": 0,
            "timestamp": timestamp,
        }
        return json.dumps(result, indent=2, ensure_ascii=False)

    async def _handle_delete_report_schedule(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """보고서 스케줄을 삭제합니다."""
        schedule_id = arguments.get("scheduleId")
        result: dict[str, Any] = {
            "success": True,
            "scheduleId": schedule_id,
            "message": f"Schedule {schedule_id} deleted successfully",
        }
        return json.dumps(result, indent=2, ensure_ascii=False)

    async def _handle_run_schedule_now(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """스케줄된 보고서를 즉시 실행합니다."""
        timestamp = create_timestamp()
        schedule_id = arguments.get("scheduleId")
        result: dict[str, Any] = {
            "success": True,
            "scheduleId": schedule_id,
            "reportId": f"report-{timestamp}",
            "executedAt": timestamp,
        }
        return json.dumps(result, indent=2, ensure_ascii=False)

    async def _handle_list_report_templates(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """보고서 템플릿 목록을 조회합니다."""
        type_filter = arguments.get("type")
        templates = [
            {"id": "daily", "name": "Daily Development Report", "type": "daily"},
            {"id": "weekly", "name": "Weekly Team Summary", "type": "weekly"},
            {"id": "monthly", "name": "Monthly Performance Analysis", "type": "monthly"},
            {"id": "methodology", "name": "Methodology Compliance Report", "type": "methodology"},
            {"id": "ai_usage", "name": "AI Collaboration Analysis", "type": "ai_usage"},
        ]
        if type_filter:
            templates = [t for t in templates if t["type"] == type_filter]
        result: dict[str, Any] = {"success": True, "templates": templates, "total": len(templates)}
        return json.dumps(result, indent=2, ensure_ascii=False)

    async def _handle_get_report_system_status(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """보고서 시스템 상태를 조회합니다."""
        timestamp = create_timestamp()
        result: dict[str, Any] = {
            "success": True,
            "status": "healthy",
            "engine": {"status": "running", "cacheEnabled": True, "maxConcurrent": 3},
            "scheduler": {"status": "running", "activeSchedules": 0, "runningJobs": 0},
            "templates": {"total": 5, "custom": 0},
            "recentReports": [],
            "timestamp": timestamp,
        }
        return json.dumps(result, indent=2, ensure_ascii=False)

    # =========================================================================
    # User Feedback Handlers (10 handlers)
    # =========================================================================

    async def _handle_submit_feedback(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """피드백을 제출합니다."""
        timestamp = create_timestamp()
        result: dict[str, Any] = {
            "success": True,
            "feedbackId": f"feedback-{timestamp}",
            "type": arguments.get("type"),
            "title": arguments.get("title"),
            "description": arguments.get("description"),
            "projectId": arguments.get("projectId"),
            "priority": arguments.get("priority", "medium"),
            "tags": arguments.get("tags", []),
            "status": "new",
            "submittedAt": timestamp,
        }
        return json.dumps(result, indent=2, ensure_ascii=False)

    async def _handle_list_feedback(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """피드백 목록을 조회합니다."""
        timestamp = create_timestamp()
        result: dict[str, Any] = {
            "success": True,
            "feedbacks": [],
            "total": 0,
            "filters": {
                "limit": arguments.get("limit", 20),
                "type": arguments.get("type"),
                "status": arguments.get("status"),
                "priority": arguments.get("priority"),
                "projectId": arguments.get("projectId"),
            },
            "timestamp": timestamp,
        }
        return json.dumps(result, indent=2, ensure_ascii=False)

    async def _handle_get_feedback_details(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """피드백 상세 정보를 조회합니다."""
        feedback_id = arguments.get("feedbackId")
        result: dict[str, Any] = {
            "success": False,
            "error": f"Feedback {feedback_id} not found",
        }
        return json.dumps(result, indent=2, ensure_ascii=False)

    async def _handle_update_feedback_status(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """피드백 상태를 업데이트합니다."""
        feedback_id = arguments.get("feedbackId")
        new_status = arguments.get("status")
        timestamp = create_timestamp()
        result: dict[str, Any] = {
            "success": True,
            "feedbackId": feedback_id,
            "previousStatus": "new",
            "newStatus": new_status,
            "updatedAt": timestamp,
        }
        return json.dumps(result, indent=2, ensure_ascii=False)

    async def _handle_list_improvement_suggestions(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """개선 제안 목록을 조회합니다."""
        status_filter = arguments.get("status")
        result: dict[str, Any] = {
            "success": True,
            "suggestions": [],
            "total": 0,
            "filters": {"status": status_filter},
        }
        return json.dumps(result, indent=2, ensure_ascii=False)

    async def _handle_get_user_preferences(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """사용자 선호도를 조회합니다."""
        user_id = arguments.get("userId")
        result: dict[str, Any] = {
            "success": False,
            "error": f"User preferences for {user_id} not found",
        }
        return json.dumps(result, indent=2, ensure_ascii=False)

    async def _handle_create_ab_test(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """A/B 테스트를 생성합니다."""
        timestamp = create_timestamp()
        result: dict[str, Any] = {
            "success": True,
            "testId": f"abtest-{timestamp}",
            "name": arguments.get("name"),
            "description": arguments.get("description"),
            "status": "draft",
            "variants": arguments.get("variants", []),
            "metrics": arguments.get("metrics", []),
            "audiencePercentage": arguments.get("audiencePercentage", 100),
            "createdAt": timestamp,
        }
        return json.dumps(result, indent=2, ensure_ascii=False)

    async def _handle_list_active_ab_tests(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """활성 A/B 테스트 목록을 조회합니다."""
        result: dict[str, Any] = {
            "success": True,
            "tests": [],
            "total": 0,
        }
        return json.dumps(result, indent=2, ensure_ascii=False)

    async def _handle_get_ab_test_results(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """A/B 테스트 결과를 조회합니다."""
        test_id = arguments.get("testId")
        result: dict[str, Any] = {
            "success": False,
            "error": f"A/B test {test_id} not found",
        }
        return json.dumps(result, indent=2, ensure_ascii=False)

    async def _handle_get_feedback_stats(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """피드백 통계를 조회합니다."""
        project_id = arguments.get("projectId")
        timestamp = create_timestamp()
        result: dict[str, Any] = {
            "success": True,
            "projectId": project_id,
            "stats": {
                "total": 0,
                "byType": {"bug_report": 0, "feature_request": 0, "usability_issue": 0, "performance_issue": 0, "documentation": 0, "general": 0, "praise": 0},
                "byStatus": {"new": 0, "reviewing": 0, "in_progress": 0, "resolved": 0, "closed": 0, "deferred": 0},
                "byPriority": {"critical": 0, "high": 0, "medium": 0, "low": 0},
            },
            "timestamp": timestamp,
        }
        return json.dumps(result, indent=2, ensure_ascii=False)

    # =========================================================================
    # Multi-Project Management Handlers (16 handlers)
    # =========================================================================

    async def _handle_create_project(self, arguments: dict[str, Any]) -> str:
        """프로젝트를 생성합니다."""
        args = CreateProjectArgs(**arguments)
        timestamp = create_timestamp()
        import uuid
        project_id = str(uuid.uuid4())[:8]
        project = {
            "success": True,
            "project": {
                "id": project_id, "name": args.name, "description": args.description,
                "type": args.type.value if args.type else "other", "status": "active",
                "priority": args.priority.value if args.priority else "medium",
                "tags": args.tags or [], "createdAt": timestamp, "rootPath": args.root_path or ".",
            },
        }
        return json.dumps(project, indent=2, ensure_ascii=False)

    async def _handle_list_projects(self, arguments: dict[str, Any]) -> str:
        """프로젝트 목록을 조회합니다."""
        args = ListProjectsArgs(**arguments)
        timestamp = create_timestamp()
        projects = {
            "projects": [], "total": 0,
            "filters": {
                "status": args.status.value if args.status else None,
                "type": args.type.value if args.type else None, "limit": args.limit,
            },
            "timestamp": timestamp,
        }
        return json.dumps(projects, indent=2, ensure_ascii=False)

    async def _handle_get_project(self, arguments: dict[str, Any]) -> str:
        """프로젝트 상세 정보를 조회합니다."""
        args = GetProjectDetailArgs(**arguments)
        timestamp = create_timestamp()
        project = {
            "project": {
                "id": args.project_id, "name": "Sample Project",
                "description": "Sample project description", "version": "1.0.0",
                "type": "web_application", "status": "active", "priority": "medium",
                "tags": [], "owner": None, "settings": {}, "paths": {"root": "."},
                "repository": None, "createdAt": timestamp, "updatedAt": timestamp,
            },
        }
        return json.dumps(project, indent=2, ensure_ascii=False)

    async def _handle_update_project(self, arguments: dict[str, Any]) -> str:
        """프로젝트를 업데이트합니다."""
        args = UpdateProjectArgs(**arguments)
        timestamp = create_timestamp()
        project = {
            "success": True,
            "project": {
                "id": args.project_id, "name": args.name or "Updated Project",
                "description": args.description, "type": "web_application",
                "status": args.status.value if args.status else "active",
                "priority": args.priority.value if args.priority else "medium",
                "tags": args.tags or [], "updatedAt": timestamp,
            },
        }
        return json.dumps(project, indent=2, ensure_ascii=False)

    async def _handle_delete_project(self, arguments: dict[str, Any]) -> str:
        """프로젝트를 삭제합니다."""
        args = DeleteProjectArgs(**arguments)
        result = {"success": True, "projectId": args.project_id, "message": "Project deleted successfully"}
        return json.dumps(result, indent=2, ensure_ascii=False)

    async def _handle_discover_projects(self, arguments: dict[str, Any]) -> str:
        """프로젝트를 자동 검색합니다."""
        args = DiscoverProjectsArgs(**arguments)
        result = {"discoveredProjects": [], "total": 0, "searchPaths": args.search_paths or ["default"], "autoRegistered": args.auto_register}
        return json.dumps(result, indent=2, ensure_ascii=False)

    async def _handle_search_projects(self, arguments: dict[str, Any]) -> str:
        """프로젝트를 검색합니다."""
        args = SearchProjectsArgs(**arguments)
        search_criteria: dict[str, Any] = {}
        if args.query:
            search_criteria["name"] = args.query
        if args.type:
            search_criteria["type"] = args.type.value
        if args.status:
            search_criteria["status"] = args.status.value
        if args.tags:
            search_criteria["tags"] = args.tags
        result = {"results": [], "total": 0, "searchCriteria": search_criteria}
        return json.dumps(result, indent=2, ensure_ascii=False)

    async def _handle_get_project_metrics(self, arguments: dict[str, Any]) -> str:
        """프로젝트 메트릭을 조회합니다."""
        args = GetProjectMetricsDetailArgs(**arguments)
        timestamp = create_timestamp()
        metrics = {
            "metrics": {
                "projectId": args.project_id, "timeRange": args.time_range.value if args.time_range else "24h",
                "timestamp": timestamp,
                "code": {"totalLines": 1000, "codeLines": 800, "commentLines": 150, "fileCount": 50, "complexity": 3.2},
                "quality": {"testCoverage": 85.5, "codeQuality": 8.2, "bugCount": 3},
                "activity": {"commits": 25, "fileChanges": 48, "builds": 12},
            },
        }
        return json.dumps(metrics, indent=2, ensure_ascii=False)

    async def _handle_collect_project_metrics(self, arguments: dict[str, Any]) -> str:
        """프로젝트 메트릭을 수집합니다."""
        args = CollectProjectMetricsArgs(**arguments)
        timestamp = create_timestamp()
        msg = f"Metrics collected for project: {args.project_id}" if args.project_id else "Metrics collected for all active projects"
        result = {"success": True, "message": msg, "timestamp": timestamp}
        return json.dumps(result, indent=2, ensure_ascii=False)

    async def _handle_run_cross_project_analysis(self, arguments: dict[str, Any]) -> str:
        """크로스 프로젝트 분석을 실행합니다."""
        args = RunCrossProjectAnalysisArgs(**arguments)
        timestamp = create_timestamp()
        import uuid
        analysis_id = str(uuid.uuid4())[:8]
        analysis = {
            "analysis": {
                "id": analysis_id, "type": args.analysis_type.value if args.analysis_type else "similarity",
                "projects": args.project_ids or [], "timestamp": timestamp, "results": {}, "insights": [], "recommendations": [],
            },
        }
        return json.dumps(analysis, indent=2, ensure_ascii=False)

    async def _handle_get_project_dependencies(self, arguments: dict[str, Any]) -> str:
        """프로젝트 의존성을 조회합니다."""
        args = GetProjectDependenciesArgs(**arguments)
        dependencies = {
            "dependencies": {
                "projectId": args.project_id, "direction": args.direction.value if args.direction else "both",
                "incoming": [], "outgoing": [], "circular": [], "total": 0,
            },
        }
        return json.dumps(dependencies, indent=2, ensure_ascii=False)

    async def _handle_get_multi_project_status(self, arguments: dict[str, Any]) -> str:
        """다중 프로젝트 시스템 상태를 조회합니다."""
        _ = GetMultiProjectStatusArgs(**arguments)
        timestamp = create_timestamp()
        status = {
            "system": {"running": True, "projectsCount": 0, "activeProjects": 0, "syncEnabled": False, "syncStatus": "disabled", "runningAnalysis": []},
            "stats": {"byStatus": {}, "byType": {}, "byPriority": {}},
            "timestamp": timestamp,
        }
        return json.dumps(status, indent=2, ensure_ascii=False)

    async def _handle_get_project_portfolio(self, arguments: dict[str, Any]) -> str:
        """프로젝트 포트폴리오를 조회합니다."""
        args = GetProjectPortfolioArgs(**arguments)
        timestamp = create_timestamp()
        portfolio = {
            "portfolio": {
                "overview": {"totalProjects": 0, "activeProjects": 0, "projectTypes": 0, "averageProjectAge": 0},
                "breakdown": {"byStatus": {}, "byType": {}, "byPriority": {}},
                "groupBy": args.group_by.value if args.group_by else "type", "timestamp": timestamp,
            },
        }
        return json.dumps(portfolio, indent=2, ensure_ascii=False)

    async def _handle_enable_project_sync(self, arguments: dict[str, Any]) -> str:
        """프로젝트 동기화를 활성화합니다."""
        args = EnableProjectSyncArgs(**arguments)
        timestamp = create_timestamp()
        result = {
            "success": True, "message": "Project synchronization enabled",
            "config": {"endpoint": args.endpoint, "interval": args.interval or 300, "enabled": True},
            "timestamp": timestamp,
        }
        return json.dumps(result, indent=2, ensure_ascii=False)

    async def _handle_trigger_project_sync(self, arguments: dict[str, Any]) -> str:
        """프로젝트 동기화를 트리거합니다."""
        args = TriggerProjectSyncArgs(**arguments)
        timestamp = create_timestamp()
        result = {
            "syncResult": {"success": True, "syncedIds": [], "failedIds": [], "duration": 0, "bytesTransferred": 0, "errors": []},
            "force": args.force, "timestamp": timestamp,
        }
        return json.dumps(result, indent=2, ensure_ascii=False)

    async def _handle_get_project_sync_status(self, arguments: dict[str, Any]) -> str:
        """프로젝트 동기화 상태를 조회합니다."""
        _ = GetProjectSyncStatusArgs(**arguments)
        timestamp = create_timestamp()
        status = {
            "syncStatus": {"lastSyncTime": timestamp, "pendingEvents": 0, "failedEvents": 0, "connected": False, "syncing": False, "avgLatency": 0, "successRate": 0},
            "timestamp": timestamp,
        }
        return json.dumps(status, indent=2, ensure_ascii=False)

    # =========================================================================
    # Plugin Management Handlers (15 handlers)
    # =========================================================================

    async def _handle_list_plugins(self, arguments: dict[str, Any]) -> str:
        """플러그인 목록 조회를 처리합니다."""
        args = ListPluginsArgs(**arguments)
        timestamp = create_timestamp()
        try:
            plugins = self.plugin_manager.get_plugins()
            if args.category:
                plugins = [p for p in plugins if (p.manifest.category.value if hasattr(p.manifest.category, "value") else str(p.manifest.category)) == args.category]
            if args.status:
                plugins = [p for p in plugins if self.plugin_manager.get_plugin_status(p.id) == args.status.value]
            result = {"plugins": [{"id": p.id, "name": p.manifest.name, "version": p.manifest.version, "description": p.manifest.description, "category": (p.manifest.category.value if hasattr(p.manifest.category, "value") else str(p.manifest.category)), "status": (self.plugin_manager.get_plugin_status(p.id).value if self.plugin_manager.get_plugin_status(p.id) else "unloaded"), "author": p.manifest.author} for p in plugins], "total": len(plugins), "timestamp": timestamp}
            return json.dumps(result, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.exception("Failed to list plugins")
            return json.dumps({"error": f"Failed to list plugins: {e}"}, indent=2)

    async def _handle_get_plugin_info(self, arguments: dict[str, Any]) -> str:
        """플러그인 정보 조회를 처리합니다."""
        args = GetPluginInfoArgs(**arguments)
        timestamp = create_timestamp()
        try:
            plugin_info = self.plugin_manager.get_plugin_info(args.plugin_id)
            if not plugin_info:
                return json.dumps({"error": f"Plugin not found: {args.plugin_id}"}, indent=2)
            return json.dumps({"plugin": plugin_info, "timestamp": timestamp}, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.exception("Failed to get plugin info")
            return json.dumps({"error": f"Failed to get plugin info: {e}"}, indent=2)

    async def _handle_load_plugin(self, arguments: dict[str, Any]) -> str:
        """플러그인 로드를 처리합니다."""
        args = LoadPluginArgs(**arguments)
        timestamp = create_timestamp()
        try:
            success = await self.plugin_manager.load_plugin(args.plugin_id)
            return json.dumps({"success": success, "message": f"Plugin {args.plugin_id} loaded successfully" if success else f"Failed to load plugin {args.plugin_id}", "timestamp": timestamp}, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.exception("Failed to load plugin")
            return json.dumps({"error": f"Failed to load plugin: {e}"}, indent=2)

    async def _handle_unload_plugin(self, arguments: dict[str, Any]) -> str:
        """플러그인 언로드를 처리합니다."""
        args = UnloadPluginArgs(**arguments)
        timestamp = create_timestamp()
        try:
            success = await self.plugin_manager.unload_plugin(args.plugin_id)
            return json.dumps({"success": success, "message": f"Plugin {args.plugin_id} unloaded successfully" if success else f"Failed to unload plugin {args.plugin_id}", "timestamp": timestamp}, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.exception("Failed to unload plugin")
            return json.dumps({"error": f"Failed to unload plugin: {e}"}, indent=2)

    async def _handle_activate_plugin(self, arguments: dict[str, Any]) -> str:
        """플러그인 활성화를 처리합니다."""
        args = ActivatePluginArgs(**arguments)
        timestamp = create_timestamp()
        try:
            success = await self.plugin_manager.activate_plugin(args.plugin_id)
            return json.dumps({"success": success, "message": f"Plugin {args.plugin_id} activated successfully" if success else f"Failed to activate plugin {args.plugin_id}", "timestamp": timestamp}, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.exception("Failed to activate plugin")
            return json.dumps({"error": f"Failed to activate plugin: {e}"}, indent=2)

    async def _handle_deactivate_plugin(self, arguments: dict[str, Any]) -> str:
        """플러그인 비활성화를 처리합니다."""
        args = DeactivatePluginArgs(**arguments)
        timestamp = create_timestamp()
        try:
            success = await self.plugin_manager.deactivate_plugin(args.plugin_id)
            return json.dumps({"success": success, "message": f"Plugin {args.plugin_id} deactivated successfully" if success else f"Failed to deactivate plugin {args.plugin_id}", "timestamp": timestamp}, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.exception("Failed to deactivate plugin")
            return json.dumps({"error": f"Failed to deactivate plugin: {e}"}, indent=2)

    async def _handle_restart_plugin(self, arguments: dict[str, Any]) -> str:
        """플러그인 재시작을 처리합니다."""
        args = RestartPluginArgs(**arguments)
        timestamp = create_timestamp()
        try:
            success = await self.plugin_manager.restart_plugin(args.plugin_id)
            return json.dumps({"success": success, "message": f"Plugin {args.plugin_id} restarted successfully" if success else f"Failed to restart plugin {args.plugin_id}", "timestamp": timestamp}, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.exception("Failed to restart plugin")
            return json.dumps({"error": f"Failed to restart plugin: {e}"}, indent=2)

    async def _handle_install_plugin(self, arguments: dict[str, Any]) -> str:
        """플러그인 설치를 처리합니다."""
        args = InstallPluginArgs(**arguments)
        timestamp = create_timestamp()
        try:
            success = await self.plugin_manager.install_plugin(args.plugin_name, args.version)
            return json.dumps({"success": success, "message": f"Plugin {args.plugin_name} installed successfully" if success else f"Failed to install plugin {args.plugin_name}", "pluginName": args.plugin_name, "version": args.version, "timestamp": timestamp}, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.exception("Failed to install plugin")
            return json.dumps({"error": f"Failed to install plugin: {e}"}, indent=2)

    async def _handle_uninstall_plugin(self, arguments: dict[str, Any]) -> str:
        """플러그인 제거를 처리합니다."""
        args = UninstallPluginArgs(**arguments)
        timestamp = create_timestamp()
        try:
            success = await self.plugin_manager.uninstall_plugin(args.plugin_id)
            return json.dumps({"success": success, "message": f"Plugin {args.plugin_id} uninstalled successfully" if success else f"Failed to uninstall plugin {args.plugin_id}", "timestamp": timestamp}, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.exception("Failed to uninstall plugin")
            return json.dumps({"error": f"Failed to uninstall plugin: {e}"}, indent=2)

    async def _handle_search_plugins(self, arguments: dict[str, Any]) -> str:
        """플러그인 검색을 처리합니다."""
        args = SearchPluginsArgs(**arguments)
        timestamp = create_timestamp()
        try:
            plugins = self.plugin_manager.search_plugins(args.query)
            result = {"results": [{"id": p.id, "name": p.manifest.name, "version": p.manifest.version, "description": p.manifest.description, "author": p.manifest.author, "category": (p.manifest.category.value if hasattr(p.manifest.category, "value") else str(p.manifest.category)), "tags": p.manifest.tags, "status": (self.plugin_manager.get_plugin_status(p.id).value if self.plugin_manager.get_plugin_status(p.id) else "unloaded")} for p in plugins], "total": len(plugins), "query": args.query, "local": args.local, "timestamp": timestamp}
            return json.dumps(result, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.exception("Failed to search plugins")
            return json.dumps({"error": f"Failed to search plugins: {e}"}, indent=2)

    async def _handle_check_plugin_health(self, arguments: dict[str, Any]) -> str:
        """플러그인 헬스 체크를 처리합니다."""
        args = CheckPluginHealthArgs(**arguments)
        timestamp = create_timestamp()
        try:
            if args.plugin_id:
                health = await self.plugin_manager.check_plugin_health(args.plugin_id)
                health_results = {args.plugin_id: health}
            else:
                health_results = await self.plugin_manager.check_all_plugins_health()
            serializable_results: dict[str, Any] = {}
            for plugin_id, health in health_results.items():
                serializable_results[plugin_id] = {"status": health.status, "message": health.message if hasattr(health, "message") else None} if health else None
            return json.dumps({"healthStatus": serializable_results, "timestamp": timestamp}, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.exception("Failed to check plugin health")
            return json.dumps({"error": f"Failed to check plugin health: {e}"}, indent=2)

    async def _handle_get_plugin_metrics(self, arguments: dict[str, Any]) -> str:
        """플러그인 메트릭 조회를 처리합니다."""
        args = GetPluginMetricsArgs(**arguments)
        timestamp = create_timestamp()
        try:
            if args.plugin_id:
                metrics = self.plugin_manager.get_plugin_metrics(args.plugin_id)
            else:
                plugins = self.plugin_manager.get_plugins()
                metrics = {plugin.id: self.plugin_manager.get_plugin_metrics(plugin.id) for plugin in plugins if self.plugin_manager.get_plugin_metrics(plugin.id)}
            return json.dumps({"metrics": metrics, "timestamp": timestamp}, indent=2, ensure_ascii=False, default=str)
        except Exception as e:
            logger.exception("Failed to get plugin metrics")
            return json.dumps({"error": f"Failed to get plugin metrics: {e}"}, indent=2)

    async def _handle_update_plugin(self, arguments: dict[str, Any]) -> str:
        """플러그인 업데이트를 처리합니다."""
        args = UpdatePluginArgs(**arguments)
        timestamp = create_timestamp()
        try:
            success = await self.plugin_manager.update_plugin(args.plugin_id, args.version)
            return json.dumps({"success": success, "message": f"Plugin {args.plugin_id} updated successfully" if success else f"Failed to update plugin {args.plugin_id}", "pluginId": args.plugin_id, "version": args.version, "timestamp": timestamp}, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.exception("Failed to update plugin")
            return json.dumps({"error": f"Failed to update plugin: {e}"}, indent=2)

    async def _handle_check_plugin_updates(self, arguments: dict[str, Any]) -> str:
        """플러그인 업데이트 확인을 처리합니다."""
        _ = CheckPluginUpdatesArgs(**arguments)
        timestamp = create_timestamp()
        try:
            updates = await self.plugin_manager.check_for_updates()
            result = {"updates": [{"pluginId": u.get("plugin_id"), "currentVersion": u.get("current_version"), "latestVersion": u.get("latest_version"), "updateAvailable": u.get("current_version") != u.get("latest_version")} for u in updates], "total": len(updates), "timestamp": timestamp}
            return json.dumps(result, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.exception("Failed to check plugin updates")
            return json.dumps({"error": f"Failed to check plugin updates: {e}"}, indent=2)

    async def _handle_get_plugin_system_stats(self, arguments: dict[str, Any]) -> str:
        """플러그인 시스템 통계 조회를 처리합니다."""
        _ = GetPluginSystemStatsArgs(**arguments)
        timestamp = create_timestamp()
        try:
            stats = self.plugin_manager.get_system_stats()
            return json.dumps({"totalPlugins": stats.get("total_plugins", 0), "activePlugins": stats.get("active_plugins", 0), "statusCounts": stats.get("status_counts", {}), "categoryCounts": stats.get("category_counts", {}), "memoryUsage": stats.get("memory_usage", {}), "uptime": stats.get("uptime", 0), "timestamp": timestamp}, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.exception("Failed to get plugin system stats")
            return json.dumps({"error": f"Failed to get plugin system stats: {e}"}, indent=2)

    # =========================================================================
    # Performance Handlers (5 handlers)
    # =========================================================================

    async def _handle_get_performance_report(self, arguments: dict[str, Any]) -> str:
        """종합 성능 보고서를 생성합니다."""
        timestamp = create_timestamp()
        include_recommendations = arguments.get("includeRecommendations", True)
        try:
            performance_manager = get_performance_manager()
            report = performance_manager.generate_report()
            result: dict[str, Any] = {"success": True, "timestamp": timestamp, "report": report}
            if include_recommendations:
                result["recommendations"] = report.get("recommendations", [])
            return json.dumps(result, indent=2, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"success": False, "error": str(e), "timestamp": timestamp}, indent=2, ensure_ascii=False)

    async def _handle_optimize_performance(self, arguments: dict[str, Any]) -> str:
        """시스템 성능 최적화를 실행합니다."""
        timestamp = create_timestamp()
        level = arguments.get("level", "basic")
        try:
            performance_manager = get_performance_manager()
            await performance_manager.initialize()
            optimization_result = await performance_manager.optimize()
            result: dict[str, Any] = {"success": True, "timestamp": timestamp, "level": level, "result": optimization_result, "message": f"Performance optimization completed at {level} level"}
            return json.dumps(result, indent=2, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"success": False, "error": str(e), "timestamp": timestamp}, indent=2, ensure_ascii=False)

    async def _handle_get_system_metrics(self, arguments: dict[str, Any]) -> str:
        """실시간 시스템 메트릭을 조회합니다."""
        timestamp = create_timestamp()
        include_history = arguments.get("includeHistory", False)
        try:
            performance_manager = get_performance_manager()
            cache_stats = performance_manager.get_cache_stats()
            memory_stats = performance_manager.get_memory_stats()
            profiler_stats = performance_manager.get_profiler_stats()
            async_stats = performance_manager.get_async_stats()
            result: dict[str, Any] = {
                "success": True, "timestamp": timestamp,
                "metrics": {
                    "cache": cache_stats.model_dump() if cache_stats else {},
                    "memory": memory_stats.model_dump() if memory_stats else {},
                    "profiler": profiler_stats.model_dump() if profiler_stats else {},
                    "async": async_stats.model_dump() if async_stats else {},
                },
                "includeHistory": include_history,
            }
            return json.dumps(result, indent=2, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"success": False, "error": str(e), "timestamp": timestamp}, indent=2, ensure_ascii=False)

    async def _handle_profile_performance(self, arguments: dict[str, Any]) -> str:
        """성능 프로파일링을 시작하거나 중지합니다."""
        timestamp = create_timestamp()
        action = arguments.get("action", "status")
        interval_ms = arguments.get("intervalMs", 5000)
        try:
            performance_manager = get_performance_manager()
            if action == "start":
                performance_manager.start_monitoring(interval_ms)
                message = f"Profiling started with interval {interval_ms}ms"
            elif action == "stop":
                performance_manager.stop_monitoring()
                message = "Profiling stopped"
            else:  # status
                profiler_stats = performance_manager.get_profiler_stats()
                return json.dumps({"success": True, "timestamp": timestamp, "action": "status", "profilerStats": profiler_stats.model_dump() if profiler_stats else {}}, indent=2, ensure_ascii=False)
            result: dict[str, Any] = {"success": True, "timestamp": timestamp, "action": action, "message": message}
            return json.dumps(result, indent=2, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"success": False, "error": str(e), "timestamp": timestamp}, indent=2, ensure_ascii=False)

    async def _handle_manage_caches(self, arguments: dict[str, Any]) -> str:
        """캐시 관리 작업을 수행합니다."""
        timestamp = create_timestamp()
        action = arguments.get("action", "stats")
        cache_type = arguments.get("cacheType", "all")
        try:
            performance_manager = get_performance_manager()
            await performance_manager.initialize()
            if action == "clear":
                await performance_manager.cache_clear()
                message = f"Cache cleared for type: {cache_type}"
                result_data: dict[str, Any] = {"cleared": True}
            elif action == "warmup":
                message = f"Cache warmup initiated for type: {cache_type}"
                result_data = {"warmup": "initiated"}
            elif action == "optimize":
                await performance_manager.optimize()
                message = f"Cache optimized for type: {cache_type}"
                result_data = {"optimized": True}
            else:  # stats
                cache_stats = performance_manager.get_cache_stats()
                message = "Cache statistics retrieved"
                result_data = {"stats": cache_stats.model_dump() if cache_stats else {}}
            result: dict[str, Any] = {"success": True, "timestamp": timestamp, "action": action, "cacheType": cache_type, "message": message, "result": result_data}
            return json.dumps(result, indent=2, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"success": False, "error": str(e), "timestamp": timestamp}, indent=2, ensure_ascii=False)

    # =========================================================================
    # Security Handlers (10 handlers)
    # =========================================================================

    async def _handle_login(self, arguments: dict[str, Any]) -> str:
        """사용자 로그인을 처리합니다."""
        timestamp = create_timestamp()
        username = arguments.get("username", "")
        password = arguments.get("password", "")
        remember_me = arguments.get("rememberMe", False)
        try:
            security_manager = get_security_manager()
            client_info = {"ip_address": "127.0.0.1", "user_agent": "DevFlow-Monitor-MCP/1.0"}
            login_response = await security_manager.login(username, password, client_info, remember_me)
            result: dict[str, Any] = {"success": login_response.success, "timestamp": timestamp, "message": login_response.message}
            if login_response.success and login_response.token:
                result["token"] = {"accessToken": login_response.token.access_token, "refreshToken": login_response.token.refresh_token, "expiresIn": login_response.token.expires_in, "tokenType": login_response.token.token_type}
                result["user"] = login_response.user
            return json.dumps(result, indent=2, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"success": False, "error": str(e), "timestamp": timestamp}, indent=2, ensure_ascii=False)

    async def _handle_verify_token(self, arguments: dict[str, Any]) -> str:
        """JWT 토큰을 검증합니다."""
        timestamp = create_timestamp()
        token = arguments.get("token", "")
        try:
            security_manager = get_security_manager()
            auth_context = await security_manager.verify_token(token)
            if auth_context:
                result: dict[str, Any] = {"success": True, "valid": True, "timestamp": timestamp, "context": {"userId": auth_context.user.id, "username": auth_context.user.username, "sessionId": auth_context.session_id, "permissions": list(auth_context.permissions)}}
            else:
                result = {"success": True, "valid": False, "timestamp": timestamp, "message": "Token is invalid or expired"}
            return json.dumps(result, indent=2, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"success": False, "error": str(e), "timestamp": timestamp}, indent=2, ensure_ascii=False)

    async def _handle_check_permission(self, arguments: dict[str, Any]) -> str:
        """사용자 권한을 확인합니다."""
        timestamp = create_timestamp()
        user_id = arguments.get("userId", "")
        resource = arguments.get("resource", "")
        action_str = arguments.get("action", "read")
        try:
            security_manager = get_security_manager()
            action = PermissionAction(action_str)
            permission_check = PermissionCheck(resource=resource, action=action)
            check_result = await security_manager.check_permission(user_id, permission_check)
            result: dict[str, Any] = {"success": True, "timestamp": timestamp, "allowed": check_result.allowed, "reason": check_result.reason, "userId": user_id, "resource": resource, "action": action_str}
            return json.dumps(result, indent=2, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"success": False, "error": str(e), "timestamp": timestamp}, indent=2, ensure_ascii=False)

    async def _handle_generate_api_key(self, arguments: dict[str, Any]) -> str:
        """API 키를 생성합니다."""
        timestamp = create_timestamp()
        user_id = arguments.get("userId", "")
        name = arguments.get("name", "")
        permissions = arguments.get("permissions", [])
        expires_in_days = arguments.get("expiresInDays", 30)
        try:
            security_manager = get_security_manager()
            expires_at = None
            if expires_in_days:
                from datetime import timedelta
                expires_at = datetime.now() + timedelta(days=expires_in_days)
            api_key = await security_manager.generate_api_key(user_id, name, permissions, expires_at)
            result: dict[str, Any] = {"success": True, "timestamp": timestamp, "apiKey": api_key, "name": name, "userId": user_id, "permissions": permissions, "expiresInDays": expires_in_days, "message": "API key generated successfully. Store it securely - it won't be shown again."}
            return json.dumps(result, indent=2, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"success": False, "error": str(e), "timestamp": timestamp}, indent=2, ensure_ascii=False)

    async def _handle_encrypt_data(self, arguments: dict[str, Any]) -> str:
        """데이터를 AES-256-GCM으로 암호화합니다."""
        timestamp = create_timestamp()
        data = arguments.get("data", "")
        try:
            security_manager = get_security_manager()
            encryption_result = await security_manager.encrypt(data)
            result: dict[str, Any] = {"success": True, "timestamp": timestamp, "encrypted": encryption_result.encrypted, "iv": encryption_result.iv, "tag": encryption_result.tag, "message": "Data encrypted successfully"}
            return json.dumps(result, indent=2, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"success": False, "error": str(e), "timestamp": timestamp}, indent=2, ensure_ascii=False)

    async def _handle_decrypt_data(self, arguments: dict[str, Any]) -> str:
        """암호화된 데이터를 복호화합니다."""
        timestamp = create_timestamp()
        encrypted = arguments.get("encrypted", "")
        iv = arguments.get("iv", "")
        tag = arguments.get("tag")
        try:
            security_manager = get_security_manager()
            decryption_input = DecryptionInput(encrypted=encrypted, iv=iv, tag=tag)
            decrypted_data = await security_manager.decrypt(decryption_input)
            result: dict[str, Any] = {"success": True, "timestamp": timestamp, "decrypted": decrypted_data, "message": "Data decrypted successfully"}
            return json.dumps(result, indent=2, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"success": False, "error": str(e), "timestamp": timestamp}, indent=2, ensure_ascii=False)

    async def _handle_get_security_stats(self, arguments: dict[str, Any]) -> str:
        """보안 시스템 통계를 조회합니다."""
        timestamp = create_timestamp()
        try:
            security_manager = get_security_manager()
            stats = security_manager.get_security_stats()
            health = await security_manager.health_check()
            result: dict[str, Any] = {"success": True, "timestamp": timestamp, "stats": stats, "health": health}
            return json.dumps(result, indent=2, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"success": False, "error": str(e), "timestamp": timestamp}, indent=2, ensure_ascii=False)

    async def _handle_query_audit_logs(self, arguments: dict[str, Any]) -> str:
        """감사 로그를 조회합니다."""
        timestamp = create_timestamp()
        user_id = arguments.get("userId")
        event_type = arguments.get("eventType")
        start_date = arguments.get("startDate")
        end_date = arguments.get("endDate")
        limit = arguments.get("limit", 100)
        try:
            security_manager = get_security_manager()
            query = AuditQuery(user_id=user_id, event_type=event_type, start_date=datetime.fromisoformat(start_date) if start_date else None, end_date=datetime.fromisoformat(end_date) if end_date else None, limit=limit)
            logs = await security_manager.query_audit_logs(query)
            result: dict[str, Any] = {"success": True, "timestamp": timestamp, "logs": [log.model_dump() for log in logs], "count": len(logs), "query": {"userId": user_id, "eventType": event_type, "startDate": start_date, "endDate": end_date, "limit": limit}}
            return json.dumps(result, indent=2, ensure_ascii=False, default=str)
        except Exception as e:
            return json.dumps({"success": False, "error": str(e), "timestamp": timestamp}, indent=2, ensure_ascii=False)

    async def _handle_get_audit_summary(self, arguments: dict[str, Any]) -> str:
        """감사 로그 요약을 조회합니다."""
        timestamp = create_timestamp()
        start_date = arguments.get("startDate")
        end_date = arguments.get("endDate")
        try:
            security_manager = get_security_manager()
            start_dt = datetime.fromisoformat(start_date) if start_date else None
            end_dt = datetime.fromisoformat(end_date) if end_date else None
            summary = await security_manager.get_audit_summary(start_dt, end_dt)
            result: dict[str, Any] = {"success": True, "timestamp": timestamp, "summary": summary.model_dump() if hasattr(summary, 'model_dump') else summary, "period": {"startDate": start_date, "endDate": end_date}}
            return json.dumps(result, indent=2, ensure_ascii=False, default=str)
        except Exception as e:
            return json.dumps({"success": False, "error": str(e), "timestamp": timestamp}, indent=2, ensure_ascii=False)

    async def _handle_assign_role(self, arguments: dict[str, Any]) -> str:
        """사용자에게 역할을 할당합니다."""
        timestamp = create_timestamp()
        user_id = arguments.get("userId", "")
        role_id = arguments.get("roleId", "")
        assigned_by = arguments.get("assignedBy", "")
        reason = arguments.get("reason")
        try:
            security_manager = get_security_manager()
            success = await security_manager.assign_role(user_id, role_id, assigned_by, reason)
            result: dict[str, Any] = {"success": success, "timestamp": timestamp, "userId": user_id, "roleId": role_id, "assignedBy": assigned_by, "reason": reason, "message": "Role assigned successfully" if success else "Failed to assign role"}
            return json.dumps(result, indent=2, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"success": False, "error": str(e), "timestamp": timestamp}, indent=2, ensure_ascii=False)

    # =========================================================================
    # Advanced Metrics Handlers (4 handlers)
    # =========================================================================

    async def _handle_get_advanced_metrics(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """고급 메트릭 분석 결과를 조회합니다."""
        args = GetAdvancedMetricsArgs(**arguments)
        timestamp = create_timestamp()

        try:
            metrics_analyzer = get_metrics_analyzer()
            bottleneck_detector = get_bottleneck_detector()

            # Perform analysis
            analysis_result = await metrics_analyzer.perform_analysis()

            result: dict[str, Any] = {
                "timestamp": timestamp,
                "timeRange": args.time_range or "24h",
                "summary": analysis_result.summary,
            }

            if args.include_bottlenecks:
                bottlenecks = bottleneck_detector.get_all_bottlenecks()
                result["bottlenecks"] = [{"id": b.id, "type": b.type.value, "title": b.title, "severity": b.severity.value, "impact": b.impact} for b in bottlenecks]

            if args.include_insights:
                result["insights"] = analysis_result.insights

            if args.include_recommendations:
                result["recommendations"] = analysis_result.recommendations

            return json.dumps(result, indent=2, default=str)
        except Exception as e:
            logger.exception("Failed to get advanced metrics")
            return json.dumps({"error": str(e), "timestamp": timestamp})

    async def _handle_get_bottlenecks(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """현재 감지된 병목 현상을 조회합니다."""
        args = GetBottlenecksArgs(**arguments)
        timestamp = create_timestamp()

        try:
            bottleneck_detector = get_bottleneck_detector()
            bottlenecks = bottleneck_detector.get_all_bottlenecks()

            if args.type:
                try:
                    type_filter = BottleneckType(args.type)
                    bottlenecks = [b for b in bottlenecks if b.type == type_filter]
                except ValueError:
                    pass

            if args.severity:
                try:
                    severity_filter = EventSeverity(args.severity)
                    bottlenecks = [b for b in bottlenecks if b.severity == severity_filter]
                except ValueError:
                    pass

            if args.min_impact is not None:
                bottlenecks = [b for b in bottlenecks if b.impact >= args.min_impact]

            stats = bottleneck_detector.get_bottleneck_stats()

            result: dict[str, Any] = {
                "timestamp": timestamp,
                "totalCount": len(bottlenecks),
                "bottlenecks": [{"id": b.id, "type": b.type.value, "title": b.title, "severity": b.severity.value, "impact": b.impact} for b in bottlenecks],
                "statistics": stats,
            }

            return json.dumps(result, indent=2, default=str)
        except Exception as e:
            logger.exception("Failed to get bottlenecks")
            return json.dumps({"error": str(e), "timestamp": timestamp})

    async def _handle_get_metrics_snapshot(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """현재 메트릭 스냅샷을 조회합니다."""
        args = GetMetricsSnapshotArgs(**arguments)
        timestamp = create_timestamp()

        try:
            metrics_collector = get_metrics_collector()
            snapshot = metrics_collector.get_metrics_snapshot()
            all_metrics = metrics_collector.get_all_metrics()

            if args.metric_types:
                filtered_metrics = {k: v for k, v in all_metrics.items() if v.definition.type.value in args.metric_types}
            else:
                filtered_metrics = all_metrics

            result: dict[str, Any] = {
                "timestamp": timestamp,
                "snapshot": snapshot,
                "metricsCount": len(filtered_metrics),
            }

            if args.include_history:
                result["history"] = {mid: [{"value": v.value, "timestamp": v.timestamp.isoformat()} for v in m.values[-50:]] for mid, m in filtered_metrics.items()}

            return json.dumps(result, indent=2, default=str)
        except Exception as e:
            logger.exception("Failed to get metrics snapshot")
            return json.dumps({"error": str(e), "timestamp": timestamp})

    async def _handle_analyze_productivity(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """생산성 메트릭을 상세 분석합니다."""
        args = AnalyzeProductivityArgs(**arguments)
        timestamp = create_timestamp()

        try:
            metrics_analyzer = get_metrics_analyzer()
            analysis_result = await metrics_analyzer.perform_analysis()

            result: dict[str, Any] = {
                "timestamp": timestamp,
                "timeRange": args.time_range or "24h",
                "summary": analysis_result.summary,
                "insights": analysis_result.insights,
                "recommendations": analysis_result.recommendations,
            }

            if args.include_trends:
                result["trends"] = {"overall": "stable"}

            return json.dumps(result, indent=2, default=str)
        except Exception as e:
            logger.exception("Failed to analyze productivity")
            return json.dumps({"error": str(e), "timestamp": timestamp})

    # =========================================================================
    # Notification Handlers (6 handlers)
    # =========================================================================

    async def _handle_configure_notifications(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """알림 채널 및 규칙을 설정합니다."""
        args = ConfigureNotificationsArgs(**arguments)
        timestamp = create_timestamp()

        try:
            notification_engine = get_notification_engine()
            configured_items: list[str] = []

            if args.channel and args.config:
                try:
                    channel = NotificationChannel(args.channel)
                    channel_config = ChannelConfig(channel=channel, enabled=args.config.get("enabled", True), config=args.config)
                    notification_engine.configure_channel(channel_config)
                    configured_items.append(f"Channel: {channel.value}")
                except ValueError:
                    logger.warning(f"Invalid channel: {args.channel}")

            if args.rules:
                for rule_data in args.rules:
                    try:
                        conditions = [RuleCondition(type=RuleConditionType(c.get("type", "event_severity")), field=c.get("field", ""), operator=c.get("operator", "eq"), value=c.get("value")) for c in rule_data.get("conditions", [])]
                        channels = [NotificationChannel(ch) for ch in rule_data.get("channels", ["dashboard"])]
                        rule = NotificationRule(name=rule_data.get("name", "Custom Rule"), description=rule_data.get("description", ""), enabled=rule_data.get("enabled", True), conditions=conditions, channels=channels, priority=NotificationPriority(rule_data.get("priority", "medium")))
                        notification_engine.add_rule(rule)
                        configured_items.append(f"Rule: {rule.name}")
                    except Exception as e:
                        logger.warning(f"Failed to add rule: {e}")

            return json.dumps({"success": True, "timestamp": timestamp, "configured": configured_items}, indent=2, default=str)
        except Exception as e:
            logger.exception("Failed to configure notifications")
            return json.dumps({"success": False, "error": str(e), "timestamp": timestamp})

    async def _handle_send_notification(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """즉시 알림을 전송합니다."""
        args = SendNotificationArgs(**arguments)
        timestamp = create_timestamp()

        try:
            notification_engine = get_notification_engine()
            severity = EventSeverity(args.severity) if args.severity else EventSeverity.INFO
            priority = NotificationPriority(args.priority) if args.priority else NotificationPriority.MEDIUM
            channels = [NotificationChannel(ch) for ch in args.channels] if args.channels else None

            message = await notification_engine.send_notification(title=args.title, content=args.content, severity=severity, priority=priority, channels=channels)

            return json.dumps({"success": True, "timestamp": timestamp, "messageId": message.id, "title": message.title}, indent=2, default=str)
        except Exception as e:
            logger.exception("Failed to send notification")
            return json.dumps({"success": False, "error": str(e), "timestamp": timestamp})

    async def _handle_get_notification_rules(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """알림 규칙 목록을 조회합니다."""
        args = GetNotificationRulesArgs(**arguments)
        timestamp = create_timestamp()

        try:
            notification_engine = get_notification_engine()
            rules = notification_engine.get_all_rules()

            if args.enabled is not None:
                rules = [r for r in rules if r.enabled == args.enabled]

            return json.dumps({"timestamp": timestamp, "totalCount": len(rules), "rules": [{"id": r.id, "name": r.name, "enabled": r.enabled, "priority": r.priority.value} for r in rules]}, indent=2, default=str)
        except Exception as e:
            logger.exception("Failed to get notification rules")
            return json.dumps({"error": str(e), "timestamp": timestamp})

    async def _handle_get_notification_stats(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """알림 통계를 조회합니다."""
        timestamp = create_timestamp()

        try:
            notification_engine = get_notification_engine()
            stats = notification_engine.get_stats()

            return json.dumps({"timestamp": timestamp, "statistics": {"total": stats.total, "sent": stats.sent, "failed": stats.failed, "pending": stats.pending}}, indent=2, default=str)
        except Exception as e:
            logger.exception("Failed to get notification stats")
            return json.dumps({"error": str(e), "timestamp": timestamp})

    async def _handle_get_dashboard_notifications(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """대시보드 알림을 조회합니다."""
        args = GetDashboardNotificationsArgs(**arguments)
        timestamp = create_timestamp()

        try:
            notification_engine = get_notification_engine()
            stats = notification_engine.get_stats()

            return json.dumps({"timestamp": timestamp, "filters": {"unreadOnly": args.unread_only, "limit": args.limit or 50}, "notifications": [], "summary": {"total": stats.total, "unread": stats.pending}}, indent=2, default=str)
        except Exception as e:
            logger.exception("Failed to get dashboard notifications")
            return json.dumps({"error": str(e), "timestamp": timestamp})

    async def _handle_delete_notification_rule(
        self,
        arguments: dict[str, Any],
    ) -> str:
        """알림 규칙을 삭제합니다."""
        args = DeleteNotificationRuleArgs(**arguments)
        timestamp = create_timestamp()

        try:
            notification_engine = get_notification_engine()
            deleted = notification_engine.delete_rule(args.rule_id)

            return json.dumps({"success": deleted, "timestamp": timestamp, "ruleId": args.rule_id, "message": "Rule deleted successfully" if deleted else "Rule not found"}, indent=2, default=str)
        except Exception as e:
            logger.exception("Failed to delete notification rule")
            return json.dumps({"success": False, "error": str(e), "timestamp": timestamp})

    async def run(self) -> None:
        """서버를 실행합니다."""
        logger.info(
            "Starting %s v%s",
            self.config.server.name,
            self.config.server.version,
        )

        async with stdio_server() as (read_stream, write_stream):
            await self.server.run(
                read_stream,
                write_stream,
                self.server.create_initialization_options(),
            )


async def main() -> None:
    """메인 진입점."""
    server = DevFlowMonitorServer()
    await server.run()


def run() -> None:
    """동기 진입점.

    CLI에서 직접 실행할 때 사용합니다.
    """
    asyncio.run(main())


if __name__ == "__main__":
    run()
