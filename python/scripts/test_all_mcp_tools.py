#!/usr/bin/env python3
"""
DevFlow Monitor MCP - 전체 도구 테스트 스크립트

모든 88개 MCP 도구를 테스트하고 결과를 보고합니다.

사용법:
    poetry run python scripts/test_all_mcp_tools.py
    poetry run python scripts/test_all_mcp_tools.py --verbose
    poetry run python scripts/test_all_mcp_tools.py --category security
    poetry run python scripts/test_all_mcp_tools.py --output results.json
"""

import argparse
import asyncio
import json
import sys
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

# 테스트 케이스 정의
TEST_CASES: dict[str, list[tuple[str, dict[str, Any]]]] = {
    "basic": [
        ("getProjectStatus", {"includeDetails": False}),
        ("getMetrics", {"timeRange": "1d", "metricType": "all"}),
        ("getActivityLog", {"limit": 10}),
        ("analyzeBottlenecks", {"analysisDepth": "basic"}),
        ("checkMethodology", {"methodology": "all", "includeRecommendations": False}),
        ("generateReport", {"reportType": "daily", "format": "summary"}),
    ],
    "plugin": [
        ("listPlugins", {}),
        ("getPluginInfo", {"pluginId": "test-plugin"}),
        ("loadPlugin", {"pluginId": "test-plugin"}),
        ("unloadPlugin", {"pluginId": "test-plugin"}),
        ("activatePlugin", {"pluginId": "test-plugin"}),
        ("deactivatePlugin", {"pluginId": "test-plugin"}),
        ("restartPlugin", {"pluginId": "test-plugin"}),
        ("installPlugin", {"pluginName": "test-plugin"}),
        ("uninstallPlugin", {"pluginId": "test-plugin"}),
        ("searchPlugins", {"query": "test", "local": True}),
        ("checkPluginHealth", {}),
        ("getPluginMetrics", {}),
        ("updatePlugin", {"pluginId": "test-plugin"}),
        ("checkPluginUpdates", {}),
        ("getPluginSystemStats", {}),
    ],
    "stage": [
        ("analyzeStage", {"includeSubStages": True, "includeHistory": False}),
    ],
    "ai": [
        ("analyzeAICollaboration", {"tool": "all", "timeRange": "1d"}),
    ],
    "websocket": [
        ("startWebSocketServer", {"port": 8082}),
        ("stopWebSocketServer", {}),
        ("getWebSocketStats", {}),
        ("getStreamStats", {}),
        ("broadcastSystemNotification", {"message": "Test notification", "severity": "info"}),
    ],
    "dashboard": [
        ("startDashboard", {"mode": "cli"}),
        ("getDashboardStatus", {}),
    ],
    "project": [
        ("createProject", {"name": "Test Project", "description": "Test description"}),
        ("listProjects", {}),
        ("getProject", {"projectId": "test-proj-1"}),
        ("updateProject", {"projectId": "test-proj-1", "name": "Updated Name"}),
        ("deleteProject", {"projectId": "test-proj-1"}),
        ("discoverProjects", {"searchPaths": ["/tmp"], "autoRegister": False}),
        ("searchProjects", {"query": "test"}),
        ("getProjectMetrics", {"projectId": "test-proj-1", "timeRange": "1d"}),
        ("collectProjectMetrics", {}),
        ("runCrossProjectAnalysis", {"analysisType": "similarity"}),
        ("getProjectDependencies", {"projectId": "test-proj-1", "direction": "both"}),
        ("getMultiProjectStatus", {}),
        ("getProjectPortfolio", {"groupBy": "type"}),
        ("enableProjectSync", {"endpoint": "https://example.com", "apiKey": "test-key"}),
        ("triggerProjectSync", {"force": False}),
        ("getProjectSyncStatus", {}),
    ],
    "metrics": [
        ("getAdvancedMetrics", {"includeBottlenecks": True, "includeInsights": True}),
        ("getBottlenecks", {"severity": "warning"}),
        ("getMetricsSnapshot", {"includeHistory": False}),
        ("analyzeProductivity", {"timeRange": "24h", "includeTrends": True}),
    ],
    "notification": [
        ("configureNotifications", {"channel": "dashboard"}),
        ("sendNotification", {"title": "Test", "content": "Test content"}),
        ("getNotificationRules", {}),
        ("getNotificationStats", {}),
        ("getDashboardNotifications", {"unreadOnly": False, "limit": 10}),
        ("deleteNotificationRule", {"ruleId": "test-rule-1"}),
    ],
    "report": [
        ("generateQuickReport", {"type": "daily"}),
        (
            "createReportSchedule",
            {
                "name": "Test Schedule",
                "reportType": "daily",
                "scheduleType": "daily",
                "time": "09:00",
            },
        ),
        ("listReportSchedules", {}),
        ("deleteReportSchedule", {"scheduleId": "test-schedule-1"}),
        ("runScheduleNow", {"scheduleId": "test-schedule-1"}),
        ("listReportTemplates", {}),
        ("getReportSystemStatus", {}),
    ],
    "feedback": [
        (
            "submitFeedback",
            {"type": "bug_report", "title": "Test Bug", "description": "Test description"},
        ),
        ("listFeedback", {"limit": 10}),
        ("getFeedbackDetails", {"feedbackId": "test-feedback-1"}),
        ("updateFeedbackStatus", {"feedbackId": "test-feedback-1", "status": "reviewing"}),
        ("listImprovementSuggestions", {}),
        ("getUserPreferences", {"userId": "test-user-1"}),
        (
            "createABTest",
            {
                "name": "Test AB",
                "description": "Test description",
                "variants": [
                    {"name": "control", "trafficPercentage": 50, "changes": {}, "isControl": True},
                    {
                        "name": "variant_a",
                        "trafficPercentage": 50,
                        "changes": {"feature": "v2"},
                        "isControl": False,
                    },
                ],
                "metrics": [
                    {
                        "name": "conversion",
                        "type": "conversion",
                        "goal": 0.1,
                        "calculation": "count/total",
                    }
                ],
            },
        ),
        ("listActiveABTests", {}),
        ("getABTestResults", {"testId": "test-ab-1"}),
        ("getFeedbackStats", {}),
    ],
    "performance": [
        ("getPerformanceReport", {"includeRecommendations": True}),
        ("optimizePerformance", {"level": "basic"}),
        ("getSystemMetrics", {"includeHistory": False}),
        ("profilePerformance", {"action": "status"}),
        ("manageCaches", {"action": "stats", "cacheType": "all"}),
    ],
    "security": [
        ("login", {"username": "admin", "password": "test123", "rememberMe": False}),
        ("verifyToken", {"token": "test-token"}),
        ("checkPermission", {"userId": "user-1", "resource": "projects", "action": "read"}),
        ("generateAPIKey", {"userId": "user-1", "name": "Test Key", "permissions": ["read"]}),
        ("encryptData", {"data": "test data"}),
        ("decryptData", {"encrypted": "dGVzdA==", "iv": "aXY="}),
        ("getSecurityStats", {}),
        ("queryAuditLogs", {"limit": 10}),
        ("getAuditSummary", {}),
        ("assignRole", {"userId": "user-1", "roleId": "admin", "assignedBy": "system"}),
    ],
}

CATEGORY_NAMES = {
    "basic": "5.1 기본 도구",
    "plugin": "5.2 플러그인 관리",
    "stage": "5.3 개발 단계 분석",
    "ai": "5.4 AI 협업 분석",
    "websocket": "5.5 WebSocket",
    "dashboard": "5.6 대시보드",
    "project": "5.7 다중 프로젝트 관리",
    "metrics": "5.8 고급 메트릭",
    "notification": "5.9 알림",
    "report": "5.10 보고서 생성",
    "feedback": "5.11 사용자 피드백",
    "performance": "5.12 성능",
    "security": "5.13 보안",
}


@dataclass
class TestResult:
    """테스트 결과."""

    tool_name: str
    category: str
    success: bool
    message: str
    duration_ms: float = 0.0
    error: str | None = None


@dataclass
class TestSummary:
    """테스트 요약."""

    total: int = 0
    success: int = 0
    failed: int = 0
    timeout: int = 0
    results: list[TestResult] = field(default_factory=list)
    start_time: str = ""
    end_time: str = ""
    duration_seconds: float = 0.0


class MCPToolTester:
    """MCP 도구 테스터."""

    def __init__(self, timeout: float = 10.0, verbose: bool = False):
        self.timeout = timeout
        self.verbose = verbose
        self.server = None

    async def initialize(self) -> bool:
        """서버 초기화."""
        try:
            from devflow_monitor.server.main import DevFlowMonitorServer

            self.server = DevFlowMonitorServer()
            return True
        except Exception as e:
            print(f"서버 초기화 실패: {e}", file=sys.stderr)
            return False

    async def test_tool(self, name: str, args: dict[str, Any], category: str) -> TestResult:
        """단일 도구 테스트."""
        start = asyncio.get_event_loop().time()

        try:
            await asyncio.wait_for(
                self.server._handle_tool_call(name, args),
                timeout=self.timeout,
            )
            duration = (asyncio.get_event_loop().time() - start) * 1000

            return TestResult(
                tool_name=name,
                category=category,
                success=True,
                message="성공",
                duration_ms=duration,
            )

        except asyncio.TimeoutError:
            duration = (asyncio.get_event_loop().time() - start) * 1000
            return TestResult(
                tool_name=name,
                category=category,
                success=False,
                message="타임아웃",
                duration_ms=duration,
                error=f"Timeout after {self.timeout}s",
            )

        except Exception as e:
            duration = (asyncio.get_event_loop().time() - start) * 1000
            return TestResult(
                tool_name=name,
                category=category,
                success=False,
                message="실패",
                duration_ms=duration,
                error=str(e)[:100],
            )

    async def test_category(self, category: str) -> list[TestResult]:
        """카테고리별 테스트."""
        if category not in TEST_CASES:
            print(f"알 수 없는 카테고리: {category}", file=sys.stderr)
            return []

        results = []
        test_cases = TEST_CASES[category]
        category_name = CATEGORY_NAMES.get(category, category)

        print(f"\n{'=' * 60}", flush=True)
        print(f"{category_name} ({len(test_cases)}개)", flush=True)
        print("=" * 60, flush=True)

        for name, args in test_cases:
            result = await self.test_tool(name, args, category)
            results.append(result)

            # 결과 출력
            if result.success:
                status = "✅ 성공"
            else:
                status = f"❌ {result.message}"

            if self.verbose:
                print(f"{name}: {status} ({result.duration_ms:.1f}ms)", flush=True)
                if result.error:
                    print(f"    오류: {result.error}", flush=True)
            else:
                print(f"{name}: {status}", flush=True)

        return results

    async def test_all(self, categories: list[str] | None = None) -> TestSummary:
        """전체 테스트."""
        summary = TestSummary()
        summary.start_time = datetime.now().isoformat()

        start = asyncio.get_event_loop().time()

        # 테스트할 카테고리 결정
        if categories:
            test_categories = [c for c in categories if c in TEST_CASES]
        else:
            test_categories = list(TEST_CASES.keys())

        # 서버 초기화
        if not await self.initialize():
            return summary

        # 카테고리별 테스트
        for category in test_categories:
            results = await self.test_category(category)
            summary.results.extend(results)

        # 요약 계산
        summary.total = len(summary.results)
        summary.success = sum(1 for r in summary.results if r.success)
        summary.failed = sum(1 for r in summary.results if not r.success and r.message != "타임아웃")
        summary.timeout = sum(1 for r in summary.results if r.message == "타임아웃")
        summary.end_time = datetime.now().isoformat()
        summary.duration_seconds = asyncio.get_event_loop().time() - start

        return summary


def print_summary(summary: TestSummary) -> None:
    """테스트 요약 출력."""
    print("\n" + "=" * 60)
    print("테스트 결과 요약")
    print("=" * 60)

    print(f"\n총 도구: {summary.total}개")
    print(f"성공: {summary.success}개")
    print(f"실패: {summary.failed}개")
    print(f"타임아웃: {summary.timeout}개")
    print(f"성공률: {summary.success / summary.total * 100:.1f}%" if summary.total > 0 else "N/A")
    print(f"\n소요 시간: {summary.duration_seconds:.2f}초")

    # 카테고리별 요약
    print("\n" + "-" * 60)
    print("카테고리별 결과")
    print("-" * 60)

    category_stats: dict[str, dict[str, int]] = {}
    for result in summary.results:
        if result.category not in category_stats:
            category_stats[result.category] = {"total": 0, "success": 0}
        category_stats[result.category]["total"] += 1
        if result.success:
            category_stats[result.category]["success"] += 1

    for category, stats in category_stats.items():
        category_name = CATEGORY_NAMES.get(category, category)
        rate = stats["success"] / stats["total"] * 100 if stats["total"] > 0 else 0
        status = "✅" if rate == 100 else "❌"
        print(f"{status} {category_name}: {stats['success']}/{stats['total']} ({rate:.0f}%)")

    # 실패한 도구 목록
    failed_tools = [r for r in summary.results if not r.success]
    if failed_tools:
        print("\n" + "-" * 60)
        print("실패한 도구")
        print("-" * 60)
        for result in failed_tools:
            print(f"❌ {result.tool_name}: {result.message}")
            if result.error:
                print(f"   오류: {result.error}")


def save_results(summary: TestSummary, output_file: str) -> None:
    """결과를 JSON 파일로 저장."""
    data = {
        "summary": {
            "total": summary.total,
            "success": summary.success,
            "failed": summary.failed,
            "timeout": summary.timeout,
            "success_rate": summary.success / summary.total * 100 if summary.total > 0 else 0,
            "start_time": summary.start_time,
            "end_time": summary.end_time,
            "duration_seconds": summary.duration_seconds,
        },
        "results": [
            {
                "tool_name": r.tool_name,
                "category": r.category,
                "success": r.success,
                "message": r.message,
                "duration_ms": r.duration_ms,
                "error": r.error,
            }
            for r in summary.results
        ],
    }

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n결과가 {output_file}에 저장되었습니다.")


async def main() -> int:
    """메인 함수."""
    parser = argparse.ArgumentParser(
        description="DevFlow Monitor MCP 전체 도구 테스트",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
예시:
  poetry run python scripts/test_all_mcp_tools.py
  poetry run python scripts/test_all_mcp_tools.py --verbose
  poetry run python scripts/test_all_mcp_tools.py --category security
  poetry run python scripts/test_all_mcp_tools.py --category basic --category plugin
  poetry run python scripts/test_all_mcp_tools.py --output results.json
  poetry run python scripts/test_all_mcp_tools.py --timeout 15

카테고리:
  basic        기본 도구 (6개)
  plugin       플러그인 관리 (15개)
  stage        개발 단계 분석 (1개)
  ai           AI 협업 분석 (1개)
  websocket    WebSocket (5개)
  dashboard    대시보드 (2개)
  project      다중 프로젝트 관리 (16개)
  metrics      고급 메트릭 (4개)
  notification 알림 (6개)
  report       보고서 생성 (7개)
  feedback     사용자 피드백 (10개)
  performance  성능 (5개)
  security     보안 (10개)
        """,
    )

    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="상세 출력 (실행 시간 포함)",
    )

    parser.add_argument(
        "-c",
        "--category",
        action="append",
        choices=list(TEST_CASES.keys()),
        help="테스트할 카테고리 (여러 개 지정 가능)",
    )

    parser.add_argument(
        "-o",
        "--output",
        type=str,
        help="결과를 저장할 JSON 파일 경로",
    )

    parser.add_argument(
        "-t",
        "--timeout",
        type=float,
        default=10.0,
        help="도구별 타임아웃 (초, 기본값: 10)",
    )

    parser.add_argument(
        "--list-categories",
        action="store_true",
        help="사용 가능한 카테고리 목록 출력",
    )

    args = parser.parse_args()

    # 카테고리 목록 출력
    if args.list_categories:
        print("사용 가능한 카테고리:")
        for key, name in CATEGORY_NAMES.items():
            count = len(TEST_CASES[key])
            print(f"  {key:12s} - {name} ({count}개)")
        return 0

    # 헤더 출력
    print("=" * 60, flush=True)
    print("DevFlow Monitor MCP - 전체 도구 테스트", flush=True)
    print("=" * 60, flush=True)
    print(f"테스트 시작: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", flush=True)
    print(f"타임아웃: {args.timeout}초", flush=True)

    if args.category:
        print(f"카테고리: {', '.join(args.category)}", flush=True)
    else:
        total_tools = sum(len(tests) for tests in TEST_CASES.values())
        print(f"전체 도구: {total_tools}개", flush=True)

    # 테스터 생성 및 실행
    tester = MCPToolTester(timeout=args.timeout, verbose=args.verbose)
    summary = await tester.test_all(args.category)

    # 요약 출력
    print_summary(summary)

    # 결과 저장
    if args.output:
        save_results(summary, args.output)

    # 종료 코드
    return 0 if summary.failed == 0 and summary.timeout == 0 else 1


if __name__ == "__main__":
    # 경고 메시지 숨기기
    import warnings

    warnings.filterwarnings("ignore")

    # 로깅 레벨 설정
    import logging

    logging.basicConfig(level=logging.ERROR)

    # 실행
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
