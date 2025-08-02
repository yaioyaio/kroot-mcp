# DevFlow Monitor MCP - 모니터링 가이드

## 목차
1. [서버 상태 모니터링](#1-서버-상태-모니터링)
2. [로그 관리](#2-로그-관리)
3. [성능 모니터링](#3-성능-모니터링)
4. [알림 설정](#4-알림-설정)
5. [대시보드 설정](#5-대시보드-설정)
6. [문제 대응 절차](#6-문제-대응-절차)
7. [백업 및 복구](#7-백업-및-복구)
8. [유지보수](#8-유지보수)

## 1. 서버 상태 모니터링

### 1.1 헬스 체크
```bash
# 기본 헬스 체크
curl http://localhost:3000/health

# 상세 상태 확인
curl http://localhost:3000/status

# 예상 응답
{
  "status": "healthy",
  "uptime": 3600,
  "version": "1.0.0",
  "monitors": {
    "file": "active",
    "git": "active",
    "test": "idle"
  },
  "database": "connected",
  "memory": {
    "used": 128,
    "total": 512
  }
}
```

### 1.2 프로세스 모니터링
```bash
# 프로세스 상태 확인
ps aux | grep devflow

# CPU/메모리 사용량 실시간 모니터링
top -pid $(pgrep -f devflow)

# 시스템 리소스 사용량
htop -p $(pgrep -f devflow)
```

### 1.3 포트 및 연결 상태
```bash
# 포트 리스닝 확인
lsof -i :3000

# 네트워크 연결 상태
netstat -an | grep 3000

# 활성 연결 수
ss -t -a | grep :3000 | wc -l
```

## 2. 로그 관리

### 2.1 로그 위치
```bash
# 애플리케이션 로그
/var/log/devflow/server.log
/var/log/devflow/error.log
/var/log/devflow/access.log

# 시스템 로그 (macOS)
/tmp/devflow-monitor.out
/tmp/devflow-monitor.err

# 시스템 로그 (Linux)
journalctl -u devflow-monitor
```

### 2.2 로그 분석
```bash
# 에러 로그 확인
grep ERROR /var/log/devflow/server.log | tail -50

# 특정 시간대 로그
grep "2025-08-02 14:" /var/log/devflow/server.log

# 로그 레벨별 통계
awk '{print $3}' /var/log/devflow/server.log | sort | uniq -c

# 실시간 로그 모니터링
tail -f /var/log/devflow/server.log | grep -E "(ERROR|WARN)"
```

### 2.3 로그 로테이션 설정
```bash
# /etc/logrotate.d/devflow
/var/log/devflow/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0640 devflow devflow
    sharedscripts
    postrotate
        pkill -USR1 -f devflow-monitor
    endscript
}
```

## 3. 성능 모니터링

### 3.1 메트릭 수집
```typescript
// src/monitoring/metrics.ts
export class MetricsCollector {
  private metrics = {
    requests: new Counter('devflow_requests_total'),
    errors: new Counter('devflow_errors_total'),
    responseTime: new Histogram('devflow_response_time_seconds'),
    activeMonitors: new Gauge('devflow_active_monitors'),
    eventQueue: new Gauge('devflow_event_queue_size'),
    dbConnections: new Gauge('devflow_db_connections')
  };
  
  collectSystemMetrics(): SystemMetrics {
    return {
      cpu: process.cpuUsage(),
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      eventLoop: this.measureEventLoopLag()
    };
  }
}
```

### 3.2 성능 분석 스크립트
```bash
#!/bin/bash
# scripts/analyze-performance.sh

echo "DevFlow Monitor Performance Analysis"
echo "===================================="

# CPU 사용률
CPU=$(ps aux | grep devflow | grep -v grep | awk '{print $3}')
echo "CPU Usage: ${CPU}%"

# 메모리 사용량
MEM=$(ps aux | grep devflow | grep -v grep | awk '{print $6}')
echo "Memory Usage: $((MEM/1024))MB"

# 데이터베이스 크기
DB_SIZE=$(du -h ~/.config/mcp/devflow-monitor/devflow.db | cut -f1)
echo "Database Size: ${DB_SIZE}"

# 이벤트 처리율
EVENTS=$(sqlite3 ~/.config/mcp/devflow-monitor/devflow.db \
  "SELECT COUNT(*) FROM events WHERE timestamp > datetime('now', '-1 hour')")
echo "Events/hour: ${EVENTS}"

# 응답 시간 테스트
RESPONSE_TIME=$(curl -o /dev/null -s -w '%{time_total}' http://localhost:3000/health)
echo "Health check response time: ${RESPONSE_TIME}s"
```

### 3.3 부하 테스트
```bash
# Apache Bench를 사용한 부하 테스트
ab -n 1000 -c 10 http://localhost:3000/tools/getProjectStatus

# 지속적인 부하 테스트
while true; do
  curl -s http://localhost:3000/tools/getMetrics > /dev/null
  sleep 0.1
done &
```

## 4. 알림 설정

### 4.1 알림 규칙
```typescript
// src/monitoring/alerts.ts
export const alertRules = [
  {
    name: 'high_cpu_usage',
    condition: (metrics) => metrics.cpu > 80,
    threshold: 5, // 5분간 지속
    severity: 'warning',
    message: 'CPU usage above 80% for 5 minutes'
  },
  {
    name: 'memory_leak',
    condition: (metrics) => metrics.memory.trend > 10, // MB/hour
    threshold: 1,
    severity: 'critical',
    message: 'Potential memory leak detected'
  },
  {
    name: 'error_rate',
    condition: (metrics) => metrics.errorRate > 0.05, // 5%
    threshold: 3,
    severity: 'warning',
    message: 'Error rate exceeds 5%'
  }
];
```

### 4.2 알림 전송
```bash
# Slack 알림
curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "⚠️ DevFlow Monitor Alert",
    "attachments": [{
      "color": "warning",
      "fields": [{
        "title": "Alert",
        "value": "High CPU usage detected",
        "short": false
      }]
    }]
  }'

# 이메일 알림
echo "DevFlow Monitor Alert: High CPU usage" | \
  mail -s "DevFlow Alert" admin@example.com
```

### 4.3 자동 알림 스크립트
```bash
#!/bin/bash
# scripts/monitor-alerts.sh

check_alerts() {
  # CPU 체크
  CPU=$(ps aux | grep devflow | grep -v grep | awk '{print $3}' | cut -d. -f1)
  if [ "$CPU" -gt 80 ]; then
    send_alert "High CPU usage: ${CPU}%"
  fi
  
  # 메모리 체크
  MEM=$(ps aux | grep devflow | grep -v grep | awk '{print $4}' | cut -d. -f1)
  if [ "$MEM" -gt 50 ]; then
    send_alert "High memory usage: ${MEM}%"
  fi
  
  # 에러 로그 체크
  ERRORS=$(grep -c ERROR /var/log/devflow/server.log | tail -100)
  if [ "$ERRORS" -gt 10 ]; then
    send_alert "High error rate: ${ERRORS} errors in last 100 lines"
  fi
}

send_alert() {
  MESSAGE=$1
  echo "[$(date)] ALERT: $MESSAGE" >> /var/log/devflow/alerts.log
  # 추가 알림 방법 (Slack, 이메일 등)
}

# 5분마다 실행
while true; do
  check_alerts
  sleep 300
done
```

## 5. 대시보드 설정

### 5.1 CLI 대시보드
```bash
# 실시간 모니터링 대시보드 실행
npm run dashboard

# 커스텀 대시보드 뷰
npm run dashboard -- --view=performance
npm run dashboard -- --view=errors
npm run dashboard -- --view=activity
```

### 5.2 웹 대시보드 (선택사항)
```typescript
// src/dashboard/web/server.ts
import express from 'express';
import { MetricsCollector } from '../monitoring/metrics';

const app = express();
const metrics = new MetricsCollector();

app.get('/dashboard/api/metrics', (req, res) => {
  res.json({
    system: metrics.collectSystemMetrics(),
    application: metrics.collectAppMetrics(),
    timestamp: new Date()
  });
});

app.use(express.static('public'));
app.listen(3001);
```

### 5.3 Grafana 통합 (고급)
```yaml
# docker-compose.yml
version: '3'
services:
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
  
  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

## 6. 문제 대응 절차

### 6.1 서비스 장애 대응
```bash
#!/bin/bash
# scripts/troubleshoot.sh

echo "🔍 DevFlow Monitor Troubleshooting"
echo "=================================="

# 1. 서비스 상태 확인
if ! pgrep -f devflow > /dev/null; then
  echo "❌ Service is not running"
  echo "→ Starting service..."
  launchctl load ~/Library/LaunchAgents/com.devflow.monitor.plist
else
  echo "✅ Service is running (PID: $(pgrep -f devflow))"
fi

# 2. 포트 확인
if ! lsof -i :3000 > /dev/null; then
  echo "❌ Port 3000 is not listening"
else
  echo "✅ Port 3000 is active"
fi

# 3. 데이터베이스 확인
if [ -f ~/.config/mcp/devflow-monitor/devflow.db ]; then
  echo "✅ Database exists"
  sqlite3 ~/.config/mcp/devflow-monitor/devflow.db "PRAGMA integrity_check;"
else
  echo "❌ Database not found"
fi

# 4. 로그 분석
echo -e "\nRecent errors:"
grep ERROR /tmp/devflow-monitor.err | tail -5

# 5. 권장 조치
echo -e "\nRecommended actions:"
echo "1. Check logs: tail -f /tmp/devflow-monitor.err"
echo "2. Restart service: launchctl restart com.devflow.monitor"
echo "3. Check disk space: df -h"
echo "4. Verify permissions: ls -la ~/.config/mcp/devflow-monitor/"
```

### 6.2 성능 저하 대응
```bash
# 1. 이벤트 큐 정리
sqlite3 ~/.config/mcp/devflow-monitor/devflow.db \
  "DELETE FROM events WHERE timestamp < datetime('now', '-7 days');"

# 2. 데이터베이스 최적화
sqlite3 ~/.config/mcp/devflow-monitor/devflow.db "VACUUM;"
sqlite3 ~/.config/mcp/devflow-monitor/devflow.db "ANALYZE;"

# 3. 캐시 정리
rm -rf ~/.config/mcp/devflow-monitor/cache/*

# 4. 서비스 재시작
launchctl restart com.devflow.monitor
```

## 7. 백업 및 복구

### 7.1 자동 백업
```bash
#!/bin/bash
# scripts/backup.sh

BACKUP_DIR="$HOME/backups/devflow"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/backup_$DATE"

mkdir -p "$BACKUP_PATH"

# 데이터베이스 백업
cp ~/.config/mcp/devflow-monitor/devflow.db "$BACKUP_PATH/"

# 설정 파일 백업
cp ~/.config/mcp/devflow-monitor/.env "$BACKUP_PATH/"
cp ~/.config/mcp/servers.json "$BACKUP_PATH/"

# 로그 백업
tar -czf "$BACKUP_PATH/logs.tar.gz" /var/log/devflow/

# 오래된 백업 삭제 (30일 이상)
find "$BACKUP_DIR" -type d -mtime +30 -exec rm -rf {} \;

echo "Backup completed: $BACKUP_PATH"
```

### 7.2 복구 절차
```bash
#!/bin/bash
# scripts/restore.sh

BACKUP_PATH=$1

if [ -z "$BACKUP_PATH" ]; then
  echo "Usage: ./restore.sh <backup-path>"
  exit 1
fi

# 서비스 중지
launchctl unload ~/Library/LaunchAgents/com.devflow.monitor.plist

# 데이터 복구
cp "$BACKUP_PATH/devflow.db" ~/.config/mcp/devflow-monitor/
cp "$BACKUP_PATH/.env" ~/.config/mcp/devflow-monitor/

# 서비스 시작
launchctl load ~/Library/LaunchAgents/com.devflow.monitor.plist

echo "Restore completed from: $BACKUP_PATH"
```

## 8. 유지보수

### 8.1 정기 점검 체크리스트
```markdown
### 일일 점검
- [ ] 서비스 상태 확인
- [ ] 에러 로그 검토
- [ ] 디스크 공간 확인
- [ ] 성능 메트릭 확인

### 주간 점검
- [ ] 데이터베이스 최적화
- [ ] 로그 로테이션 확인
- [ ] 백업 검증
- [ ] 보안 업데이트 확인

### 월간 점검
- [ ] 전체 시스템 백업
- [ ] 성능 트렌드 분석
- [ ] 용량 계획 검토
- [ ] 의존성 업데이트
```

### 8.2 유지보수 스크립트
```bash
#!/bin/bash
# scripts/maintenance.sh

echo "🔧 DevFlow Monitor Maintenance"
echo "=============================="

# 1. 데이터베이스 정리
echo "Cleaning old events..."
sqlite3 ~/.config/mcp/devflow-monitor/devflow.db \
  "DELETE FROM events WHERE timestamp < datetime('now', '-30 days');"

# 2. 로그 정리
echo "Rotating logs..."
find /var/log/devflow -name "*.log" -mtime +7 -delete

# 3. 캐시 정리
echo "Clearing cache..."
rm -rf ~/.config/mcp/devflow-monitor/cache/*

# 4. 데이터베이스 최적화
echo "Optimizing database..."
sqlite3 ~/.config/mcp/devflow-monitor/devflow.db "VACUUM;"

# 5. 백업
echo "Creating backup..."
./scripts/backup.sh

echo "✅ Maintenance completed!"
```

## 모니터링 체크리스트

### 실시간 모니터링
- [ ] CPU 사용률 < 70%
- [ ] 메모리 사용량 < 80%
- [ ] 응답 시간 < 100ms
- [ ] 에러율 < 1%

### 일일 검토
- [ ] 로그 에러 확인
- [ ] 성능 트렌드 검토
- [ ] 알림 이력 확인
- [ ] 백업 상태 확인

### 문제 발생 시
- [ ] 로그 수집
- [ ] 메트릭 스냅샷
- [ ] 서비스 재시작
- [ ] 근본 원인 분석

---

작성일: 2025-08-02  
최종 수정일: 2025-08-02  
작성자: yaioyaio