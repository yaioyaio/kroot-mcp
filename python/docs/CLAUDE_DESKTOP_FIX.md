# Claude Desktop 환경에서 경로 문제 해결 방법

## 문제점
Claude Desktop에서 MCP 서버를 실행할 때 현재 작업 디렉토리(CWD)가 `/`로 설정되어 상대 경로를 찾을 수 없는 문제가 발생합니다.

## 해결 방법

### 1. 환경 변수 설정
Claude Desktop 설정에서 프로젝트 루트 경로를 환경 변수로 전달:

```json
{
  "mcpServers": {
    "devflow-monitor": {
      "command": "poetry",
      "args": ["run", "python", "-m", "devflow_monitor"],
      "cwd": "/Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/python",
      "env": {
        "DEVFLOW_ENV": "production",
        "DEVFLOW_PROJECT_ROOT": "/Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/python"
      }
    }
  }
}
```

### 2. 코드에서 환경 변수 사용
모든 파일에서 프로젝트 루트를 다음과 같이 계산:

```python
import os
from pathlib import Path

project_root = os.environ.get("DEVFLOW_PROJECT_ROOT") or Path(__file__).parent.parent.parent
```

### 3. 영향받는 파일들
- `/src/devflow_monitor/storage/database.py` - 데이터베이스 경로
- `/src/devflow_monitor/security/audit_logger.py` - 감사 로그 경로
- `/src/devflow_monitor/projects/__init__.py` - 다중 프로젝트 DB 경로
- `/src/devflow_monitor/reports/report_engine.py` - 보고서 경로
- `/src/devflow_monitor/reports/template_manager.py` - 템플릿 경로
- `/src/devflow_monitor/plugins/loader.py` - 플러그인 경로

## 임시 해결책
현재는 빌드 에러가 많아서 완전한 수정이 어렵습니다. 다음 중 하나를 선택하세요:

### 옵션 1: 필요한 디렉토리 미리 생성
```bash
sudo mkdir -p /data /logs/audit /reports /report-templates /plugins
sudo chmod -R 777 /data /logs /reports /report-templates /plugins
```

### 옵션 2: 심볼릭 링크 사용
```bash
sudo ln -s /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/data /data
sudo ln -s /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/logs /logs
sudo ln -s /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/reports /reports
sudo ln -s /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/report-templates /report-templates
sudo ln -s /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/plugins /plugins
```

### 옵션 3: Docker 컨테이너 사용
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY . .
RUN pip install poetry && poetry install --only main
CMD ["python", "-m", "devflow_monitor"]
```

## 장기적 해결책
1. 모든 경로를 환경 변수나 설정 파일로 관리
2. 절대 경로 사용을 기본으로 설정
3. 초기화 시 필요한 디렉토리 자동 생성
4. Python 빌드 에러 모두 수정

---
작성일: 2026-02-06
작성자: Claude & yaio