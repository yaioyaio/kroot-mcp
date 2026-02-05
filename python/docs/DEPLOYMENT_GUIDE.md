# DevFlow Monitor MCP 배포 가이드

이 문서는 DevFlow Monitor MCP를 프로덕션 환경에 배포하는 방법을 상세히 설명합니다.

## 목차

1. [배포 전 확인사항](#배포-전-확인사항)
2. [배포 방법](#배포-방법)
3. [환경별 설정](#환경별-설정)
4. [배포 검증](#배포-검증)
5. [롤백 절차](#롤백-절차)
6. [모니터링 및 유지보수](#모니터링-및-유지보수)

## 배포 전 확인사항

### 시스템 요구사항

- **Python**: 20.0.0 이상
- **메모리**: 최소 2GB RAM (권장 4GB)
- **디스크**: 최소 10GB 여유 공간
- **OS**: Linux, macOS, Windows (Docker 권장)

### 필수 확인 항목

- [ ] 모든 테스트 통과 확인
- [ ] 보안 설정 검토
- [ ] 백업 계획 수립
- [ ] 롤백 계획 준비
- [ ] 모니터링 설정 확인

## 배포 방법

### 1. 직접 설치 (Python)

#### 1.1 소스 코드 배포

```bash
# 1. 저장소 클론
git clone https://github.com/devflow/monitor-mcp.git
cd monitor-mcp

# 2. 특정 버전 체크아웃
git checkout v1.0.0

# 3. 의존성 설치
poetry install --production

# 4. 빌드
poetry build

# 5. 환경 설정
cp .env.example .env.production
# .env.production 파일 편집

# 6. 데이터베이스 초기화
poetry run python -m devflow_monitor.storage.migrate

# 7. 서비스 시작
poetry run python -m devflow_monitor
```

#### 1.2 PM2를 사용한 프로세스 관리

```bash
# PM2 설치
poetry install -g pm2

# PM2 설정 파일 생성
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'devflow-monitor',
    script: '.devflow_monitor',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true
  }]
};
EOF

# 서비스 시작
pm2 start ecosystem.config.js

# 시작 시 자동 실행 설정
pm2 startup
pm2 save
```

### 2. Docker 배포

#### 2.1 단일 컨테이너 배포

```bash
# 1. Docker 이미지 빌드
docker build -t devflow-monitor:1.0.0 .

# 2. 컨테이너 실행
docker run -d \
  --name devflow-monitor \
  -p 3000:3000 \
  -v /path/to/data:/app/data \
  -v /path/to/logs:/app/logs \
  -e NODE_ENV=production \
  -e DATABASE_PATH=/app/data/devflow.db \
  --restart unless-stopped \
  devflow-monitor:1.0.0
```

#### 2.2 Docker Compose 배포

```yaml
# docker-compose.yml
version: '3.8'

services:
  devflow-monitor:
    build: .
    image: devflow-monitor:1.0.0
    container_name: devflow-monitor
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
      - ./config:/app/config
    environment:
      - NODE_ENV=production
      - DATABASE_PATH=/app/data/devflow.db
      - LOG_LEVEL=info
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # 선택적: Redis 캐시
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

  # 선택적: 모니터링
  prometheus:
    image: prom/prometheus:latest
    restart: unless-stopped
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    ports:
      - "9090:9090"

volumes:
  redis_data:
  prometheus_data:
```

```bash
# 배포 실행
docker-compose up -d

# 로그 확인
docker-compose logs -f devflow-monitor
```

### 3. Kubernetes 배포

#### 3.1 Deployment 설정

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: devflow-monitor
  labels:
    app: devflow-monitor
spec:
  replicas: 3
  selector:
    matchLabels:
      app: devflow-monitor
  template:
    metadata:
      labels:
        app: devflow-monitor
    spec:
      containers:
      - name: devflow-monitor
        image: devflow/monitor-mcp:1.0.0
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_PATH
          value: "/data/devflow.db"
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        volumeMounts:
        - name: data
          mountPath: /data
        - name: config
          mountPath: /app/config
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: devflow-data-pvc
      - name: config
        configMap:
          name: devflow-config
```

#### 3.2 Service 설정

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: devflow-monitor-service
spec:
  selector:
    app: devflow-monitor
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3000
  type: LoadBalancer
```

#### 3.3 배포 실행

```bash
# 네임스페이스 생성
kubectl create namespace devflow

# ConfigMap 생성
kubectl create configmap devflow-config \
  --from-file=config/production.json \
  -n devflow

# 배포
kubectl apply -f k8s/ -n devflow

# 상태 확인
kubectl get pods -n devflow
kubectl get services -n devflow
```

## 환경별 설정

### 개발 환경 (Development)

```javascript
// config/development.json
{
  "server": {
    "port": 3000,
    "host": "localhost"
  },
  "database": {
    "path": "./data/dev.db"
  },
  "logging": {
    "level": "debug",
    "console": true
  },
  "monitoring": {
    "enableFileMonitoring": true,
    "enableGitMonitoring": true
  }
}
```

### 스테이징 환경 (Staging)

```javascript
// config/staging.json
{
  "server": {
    "port": 3000,
    "host": "0.0.0.0"
  },
  "database": {
    "path": "/data/staging.db"
  },
  "logging": {
    "level": "info",
    "file": "/logs/staging.log"
  },
  "security": {
    "enableAuthentication": true,
    "jwtSecret": "${JWT_SECRET}"
  }
}
```

### 프로덕션 환경 (Production)

```javascript
// config/production.json
{
  "server": {
    "port": 3000,
    "host": "0.0.0.0",
    "cluster": true
  },
  "database": {
    "path": "/data/production.db",
    "backup": {
      "enabled": true,
      "interval": "daily",
      "retention": 30
    }
  },
  "logging": {
    "level": "warn",
    "file": "/logs/production.log",
    "maxSize": "100m",
    "maxFiles": 10
  },
  "security": {
    "enableAuthentication": true,
    "enableRBAC": true,
    "jwtSecret": "${JWT_SECRET}",
    "encryptionKey": "${ENCRYPTION_KEY}"
  },
  "performance": {
    "enableOptimization": true,
    "cacheEnabled": true,
    "maxMemoryUsage": 1073741824
  }
}
```

### 환경 변수 설정

```bash
# .env.production
NODE_ENV=production
PORT=3000
DATABASE_PATH=/data/production.db
JWT_SECRET=your-secret-key-here
ENCRYPTION_KEY=your-encryption-key-here
LOG_LEVEL=warn
ENABLE_METRICS=true
METRICS_PORT=9090
```

## 배포 검증

### 1. 헬스 체크

```bash
# 서비스 상태 확인
curl http://localhost:3000/health

# 예상 응답
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 12345,
  "checks": {
    "database": "ok",
    "eventEngine": "ok",
    "monitors": "ok"
  }
}
```

### 2. 기능 테스트

```bash
# MCP 도구 목록 확인
curl http://localhost:3000/mcp/tools

# 프로젝트 상태 확인
curl http://localhost:3000/api/projects

# 메트릭 확인
curl http://localhost:3000/metrics
```

### 3. 로그 확인

```bash
# Docker 로그
docker logs devflow-monitor --tail 100

# PM2 로그
pm2 logs devflow-monitor

# 시스템 로그
tail -f /var/log/devflow/production.log
```

### 4. 성능 모니터링

```bash
# CPU 및 메모리 사용량
docker stats devflow-monitor

# PM2 모니터링
pm2 monit

# Prometheus 메트릭
curl http://localhost:9090/metrics
```

## 롤백 절차

### 1. 빠른 롤백 (Docker)

```bash
# 1. 현재 버전 중지
docker stop devflow-monitor

# 2. 이전 버전으로 롤백
docker run -d \
  --name devflow-monitor-rollback \
  -p 3000:3000 \
  -v /path/to/data:/app/data \
  -v /path/to/logs:/app/logs \
  -e NODE_ENV=production \
  devflow-monitor:0.9.0

# 3. 검증
curl http://localhost:3000/health
```

### 2. 데이터베이스 롤백

```bash
# 1. 백업에서 복원
cp /backup/devflow-backup-20250804.db /data/production.db

# 2. 마이그레이션 되돌리기
poetry run python -m devflow_monitor.storage.rollback

# 3. 서비스 재시작
pm2 restart devflow-monitor
```

### 3. Kubernetes 롤백

```bash
# 배포 히스토리 확인
kubectl rollout history deployment/devflow-monitor -n devflow

# 이전 버전으로 롤백
kubectl rollout undo deployment/devflow-monitor -n devflow

# 롤백 상태 확인
kubectl rollout status deployment/devflow-monitor -n devflow
```

## 모니터링 및 유지보수

### 1. 로그 관리

```bash
# 로그 로테이션 설정
cat > /etc/logrotate.d/devflow << EOF
/var/log/devflow/*.log {
  daily
  rotate 30
  compress
  delaycompress
  notifempty
  create 0640 devflow devflow
  sharedscripts
  postrotate
    pm2 reloadLogs
  endscript
}
EOF
```

### 2. 백업 전략

```bash
# 일일 백업 스크립트
#!/bin/bash
BACKUP_DIR="/backup/devflow"
DATE=$(date +%Y%m%d)

# 데이터베이스 백업
sqlite3 /data/production.db ".backup ${BACKUP_DIR}/devflow-${DATE}.db"

# 설정 파일 백업
tar -czf ${BACKUP_DIR}/config-${DATE}.tar.gz /app/config

# 30일 이상 된 백업 삭제
find ${BACKUP_DIR} -name "*.db" -mtime +30 -delete
find ${BACKUP_DIR} -name "*.tar.gz" -mtime +30 -delete
```

### 3. 모니터링 대시보드

#### Grafana 설정

```yaml
# grafana/dashboards/devflow.json
{
  "dashboard": {
    "title": "DevFlow Monitor",
    "panels": [
      {
        "title": "Event Processing Rate",
        "targets": [
          {
            "expr": "rate(devflow_events_processed_total[5m])"
          }
        ]
      },
      {
        "title": "Memory Usage",
        "targets": [
          {
            "expr": "devflow_memory_usage_bytes"
          }
        ]
      },
      {
        "title": "Active Projects",
        "targets": [
          {
            "expr": "devflow_active_projects_count"
          }
        ]
      }
    ]
  }
}
```

### 4. 알림 설정

```yaml
# prometheus/alerts.yml
groups:
  - name: devflow_alerts
    rules:
      - alert: HighMemoryUsage
        expr: devflow_memory_usage_bytes > 1073741824
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage detected"
          
      - alert: ServiceDown
        expr: up{job="devflow-monitor"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "DevFlow Monitor service is down"
```

## 문제 해결

### 일반적인 문제

#### 1. 서비스가 시작되지 않음

```bash
# 로그 확인
journalctl -u devflow-monitor -n 100

# 권한 확인
ls -la /data /logs

# 포트 사용 확인
netstat -tlpn | grep 3000
```

#### 2. 데이터베이스 오류

```bash
# 데이터베이스 무결성 검사
sqlite3 /data/production.db "PRAGMA integrity_check;"

# 데이터베이스 복구
sqlite3 /data/production.db ".recover"
```

#### 3. 메모리 부족

```bash
# 메모리 사용량 확인
free -h

# 캐시 정리
sync && echo 3 > /proc/sys/vm/drop_caches

# 서비스 메모리 제한 조정
docker update --memory 4g devflow-monitor
```

## 지원

문제가 발생하거나 도움이 필요한 경우:

- **문서**: [docs.devflow.dev](https://docs.devflow.dev)
- **이슈 트래커**: [github.com/devflow/monitor-mcp/issues](https://github.com/devflow/monitor-mcp/issues)
- **이메일**: support@devflow.dev

---

작성일: 2026-02-05  
버전: 1.0.0