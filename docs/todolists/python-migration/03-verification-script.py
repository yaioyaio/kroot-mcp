#!/usr/bin/env python3
"""
Python 마이그레이션 진행 상태 검증 스크립트

사용법:
    python 03-verification-script.py              # 전체 검증
    python 03-verification-script.py --phase 1   # Phase 1만 검증
    python 03-verification-script.py --phase 2 3 4 5  # Phase 2-5 검증
    python 03-verification-script.py --import-test    # Import 테스트 실행
"""

import argparse
import os
import sys
from pathlib import Path
from typing import Dict, List, Tuple

# 기본 프로젝트 경로 (환경 변수 또는 기본값)
DEFAULT_PROJECT_PATH = os.environ.get(
    "PYTHON_MIGRATION_BASE",
    os.path.expanduser("~/dev/devflow-monitor-mcp-python")
)

# Phase별 필수 파일 목록
PHASE_FILES: Dict[str, List[str]] = {
    "0": [
        "pyproject.toml",
        "src/devflow_monitor/__init__.py",
        "src/devflow_monitor/server/__init__.py",
        "src/devflow_monitor/events/__init__.py",
        "src/devflow_monitor/monitors/__init__.py",
        "src/devflow_monitor/storage/__init__.py",
    ],
    "1": [
        # Agent 1-1: MCP 서버 타입/설정
        "src/devflow_monitor/server/types.py",
        "src/devflow_monitor/server/config.py",
        "src/devflow_monitor/server/main.py",
        # Agent 1-2: 이벤트 시스템
        "src/devflow_monitor/events/types/base.py",
        "src/devflow_monitor/events/types/file.py",
        "src/devflow_monitor/events/types/git.py",
        "src/devflow_monitor/events/engine.py",
        "src/devflow_monitor/events/queue.py",
        "src/devflow_monitor/events/queue_manager.py",
        # Agent 1-3: 스토리지 계층
        "src/devflow_monitor/storage/database.py",
        "src/devflow_monitor/storage/repositories/base.py",
        "src/devflow_monitor/storage/repositories/event.py",
        "src/devflow_monitor/storage/storage_manager.py",
    ],
    "2": [
        "src/devflow_monitor/monitors/base.py",
        "src/devflow_monitor/monitors/file.py",
        "src/devflow_monitor/monitors/git.py",
    ],
    "3": [
        "src/devflow_monitor/analyzers/types/stage.py",
        "src/devflow_monitor/analyzers/types/methodology.py",
        "src/devflow_monitor/analyzers/types/metrics.py",
        "src/devflow_monitor/analyzers/stage_analyzer.py",
        "src/devflow_monitor/analyzers/methodology_analyzer.py",
        "src/devflow_monitor/analyzers/ai_monitor.py",
        "src/devflow_monitor/analyzers/metrics_collector.py",
        "src/devflow_monitor/analyzers/metrics_analyzer.py",
        "src/devflow_monitor/analyzers/bottleneck_detector.py",
    ],
    "4": [
        "src/devflow_monitor/integrations/base.py",
        "src/devflow_monitor/integrations/jira.py",
        "src/devflow_monitor/integrations/notion.py",
        "src/devflow_monitor/integrations/figma.py",
        "src/devflow_monitor/integrations/manager.py",
    ],
    "5": [
        "src/devflow_monitor/security/types.py",
        "src/devflow_monitor/security/auth_manager.py",
        "src/devflow_monitor/security/rbac_manager.py",
        "src/devflow_monitor/security/encryption_manager.py",
        "src/devflow_monitor/security/audit_logger.py",
        "src/devflow_monitor/performance/cache_manager.py",
        "src/devflow_monitor/performance/memory_optimizer.py",
    ],
    "6": [
        "src/devflow_monitor/plugins/types.py",
        "src/devflow_monitor/plugins/loader.py",
        "src/devflow_monitor/plugins/sandbox.py",
        "src/devflow_monitor/plugins/api_provider.py",
        "src/devflow_monitor/plugins/manager.py",
        "src/devflow_monitor/plugins/registry.py",
    ],
    "7": [
        "src/devflow_monitor/reports/types.py",
        "src/devflow_monitor/reports/report_engine.py",
        "src/devflow_monitor/reports/pdf_generator.py",
        "src/devflow_monitor/reports/scheduler.py",
        "src/devflow_monitor/reports/template_manager.py",
        "src/devflow_monitor/reports/delivery.py",
        "src/devflow_monitor/notifications/types.py",
        "src/devflow_monitor/notifications/notification_engine.py",
        "src/devflow_monitor/notifications/channels/slack_notifier.py",
    ],
    "8": [
        "tests/conftest.py",
        "tests/unit/test_events.py",
        "tests/unit/test_monitors.py",
        "tests/unit/test_storage.py",
        "tests/integration/test_event_flow.py",
        "tests/integration/test_mcp_server.py",
        "tests/e2e/test_complete_workflow.py",
        "tests/performance/test_throughput.py",
    ],
}

# Phase별 Import 테스트
IMPORT_TESTS: Dict[str, List[str]] = {
    "1": [
        "from devflow_monitor.server.types import McpTool",
        "from devflow_monitor.server.config import Config",
        "from devflow_monitor.events.engine import EventEngine",
        "from devflow_monitor.events.types.base import BaseEvent, EventCategory",
        "from devflow_monitor.storage.database import DatabaseManager",
        "from devflow_monitor.storage.storage_manager import StorageManager",
    ],
    "2": [
        "from devflow_monitor.monitors.base import BaseMonitor",
        "from devflow_monitor.monitors.file import FileMonitor",
        "from devflow_monitor.monitors.git import GitMonitor",
    ],
    "3": [
        "from devflow_monitor.analyzers.stage_analyzer import StageAnalyzer",
        "from devflow_monitor.analyzers.methodology_analyzer import MethodologyAnalyzer",
        "from devflow_monitor.analyzers.metrics_analyzer import MetricsAnalyzer",
    ],
    "4": [
        "from devflow_monitor.integrations.base import BaseAPIClient",
        "from devflow_monitor.integrations.jira import JiraClient",
        "from devflow_monitor.integrations.manager import APIIntegrationManager",
    ],
    "5": [
        "from devflow_monitor.security.auth_manager import AuthManager",
        "from devflow_monitor.security.rbac_manager import RBACManager",
        "from devflow_monitor.performance.cache_manager import CacheManager",
    ],
    "6": [
        "from devflow_monitor.plugins.loader import PluginLoader",
        "from devflow_monitor.plugins.manager import PluginManager",
    ],
    "7": [
        "from devflow_monitor.reports.report_engine import ReportEngine",
        "from devflow_monitor.notifications.notification_engine import NotificationEngine",
    ],
}


def check_file_exists(base_path: Path, relative_path: str) -> Tuple[bool, str]:
    """파일 존재 여부 확인"""
    full_path = base_path / relative_path
    exists = full_path.exists()
    return exists, str(full_path)


def check_phase(base_path: Path, phase: str) -> Dict[str, bool]:
    """특정 Phase의 파일 존재 여부 확인"""
    files = PHASE_FILES.get(phase, [])
    results = {}
    for file_path in files:
        exists, _ = check_file_exists(base_path, file_path)
        results[file_path] = exists
    return results


def run_import_test(base_path: Path, phase: str) -> Dict[str, Tuple[bool, str]]:
    """Import 테스트 실행"""
    imports = IMPORT_TESTS.get(phase, [])
    results = {}

    # 프로젝트 src를 Python 경로에 추가
    src_path = base_path / "src"
    if str(src_path) not in sys.path:
        sys.path.insert(0, str(src_path))

    for import_stmt in imports:
        try:
            exec(import_stmt)
            results[import_stmt] = (True, "OK")
        except ImportError as e:
            results[import_stmt] = (False, str(e))
        except Exception as e:
            results[import_stmt] = (False, f"Error: {e}")

    return results


def print_phase_status(phase: str, results: Dict[str, bool]) -> Tuple[int, int]:
    """Phase 상태 출력"""
    completed = sum(1 for v in results.values() if v)
    total = len(results)
    pct = (completed / total * 100) if total > 0 else 0

    if completed == total:
        status = "✅"
    elif completed > 0:
        status = "🔄"
    else:
        status = "⏳"

    phase_name = {
        "0": "초기화",
        "1": "코어 인프라",
        "2": "모니터링",
        "3": "분석 엔진",
        "4": "외부 통합",
        "5": "보안 & 성능",
        "6": "플러그인",
        "7": "보고서 & 알림",
        "8": "테스트",
    }.get(phase, f"Phase {phase}")

    print(f"{status} Phase {phase} ({phase_name}): {completed}/{total} ({pct:.0f}%)")

    return completed, total


def print_detailed_status(phase: str, results: Dict[str, bool]):
    """상세 상태 출력"""
    print(f"\n  Phase {phase} 상세:")
    for file_path, exists in results.items():
        status = "✅" if exists else "❌"
        print(f"    {status} {file_path}")


def print_import_test_results(phase: str, results: Dict[str, Tuple[bool, str]]):
    """Import 테스트 결과 출력"""
    print(f"\n  Phase {phase} Import 테스트:")
    for import_stmt, (success, message) in results.items():
        status = "✅" if success else "❌"
        short_import = import_stmt.split("import ")[-1].split(" ")[0]
        if success:
            print(f"    {status} {short_import}")
        else:
            print(f"    {status} {short_import}: {message}")


def main():
    parser = argparse.ArgumentParser(description="Python 마이그레이션 진행 상태 검증")
    parser.add_argument(
        "--path",
        type=str,
        default=DEFAULT_PROJECT_PATH,
        help="프로젝트 경로"
    )
    parser.add_argument(
        "--phase",
        type=str,
        nargs="*",
        help="검증할 Phase 번호 (예: 1 2 3)"
    )
    parser.add_argument(
        "--detailed",
        action="store_true",
        help="상세 파일 목록 출력"
    )
    parser.add_argument(
        "--import-test",
        action="store_true",
        help="Import 테스트 실행"
    )

    args = parser.parse_args()
    base_path = Path(args.path).expanduser()

    print("=" * 60)
    print("Python 마이그레이션 진행 상태")
    print("=" * 60)
    print(f"프로젝트 경로: {base_path}")
    print()

    # 프로젝트 디렉토리 존재 확인
    if not base_path.exists():
        print(f"❌ 프로젝트 디렉토리가 존재하지 않습니다: {base_path}")
        print("\nStep 0 (프로젝트 초기화)를 먼저 실행하세요.")
        print("00-MIGRATION-EXECUTION-PLAN.md의 Step 0 섹션 참조")
        return 1

    # 검증할 Phase 결정
    phases = args.phase if args.phase else list(PHASE_FILES.keys())

    total_completed = 0
    total_files = 0

    for phase in sorted(phases, key=lambda x: int(x)):
        results = check_phase(base_path, phase)
        completed, total = print_phase_status(phase, results)
        total_completed += completed
        total_files += total

        if args.detailed:
            print_detailed_status(phase, results)

        if args.import_test and phase in IMPORT_TESTS:
            import_results = run_import_test(base_path, phase)
            print_import_test_results(phase, import_results)

    print()
    print("=" * 60)
    overall_pct = (total_completed / total_files * 100) if total_files > 0 else 0
    print(f"전체 진행률: {total_completed}/{total_files} ({overall_pct:.0f}%)")
    print("=" * 60)

    # Step 완료 상태 요약
    print("\nStep 완료 상태:")

    step_status = {
        "Step 0": all(check_phase(base_path, "0").values()),
        "Step 1": all(check_phase(base_path, "1").values()),
        "Step 2": all(
            all(check_phase(base_path, p).values())
            for p in ["2", "3", "4", "5"]
        ),
        "Step 3": all(
            all(check_phase(base_path, p).values())
            for p in ["6", "7"]
        ),
        "Step 4": all(check_phase(base_path, "8").values()),
    }

    for step, completed in step_status.items():
        status = "✅" if completed else "⏳"
        print(f"  {status} {step}")

    # 다음 실행할 Step 안내
    print("\n다음 실행할 Step:")
    if not step_status["Step 0"]:
        print("  → Step 0: 프로젝트 초기화 (터미널에서 수동 실행)")
        print("    00-MIGRATION-EXECUTION-PLAN.md의 Step 0 섹션 참조")
    elif not step_status["Step 1"]:
        print("  → Step 1: Phase 1 순차 실행")
        print('    Claude Code: "Phase 1을 순차 실행해줘"')
    elif not step_status["Step 2"]:
        print("  → Step 2: Phase 2-5 병렬 실행")
        print('    Claude Code: "Phase 2, 3, 4, 5를 병렬로 실행해줘"')
    elif not step_status["Step 3"]:
        print("  → Step 3: Phase 6-7 병렬 실행")
        print('    Claude Code: "Phase 6, 7을 병렬로 실행해줘"')
    elif not step_status["Step 4"]:
        print("  → Step 4: Phase 8 테스트")
        print('    Claude Code: "Phase 8 테스트를 실행해줘"')
    else:
        print("  🎉 모든 Step 완료!")

    return 0 if overall_pct == 100 else 1


if __name__ == "__main__":
    sys.exit(main())
