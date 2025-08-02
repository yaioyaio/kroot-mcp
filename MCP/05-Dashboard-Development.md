# 대시보드 개발 가이드

## 1. 대시보드 아키텍처

### 시스템 구성
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Claude Desktop │────▶│   MCP Server    │────▶│   Dashboard     │
│   (사용자)      │     │  (데이터 수집)   │     │   (시각화)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         ↑                      │                         ↑
         │                      ▼                         │
         │              ┌─────────────────┐              │
         └──────────────│    Database     │──────────────┘
                        │  (데이터 저장)   │
                        └─────────────────┘
```

## 2. 대시보드 기술 스택

```yaml
프론트엔드:
  - React/Next.js (권장)
  - Vue.js
  - Svelte
  
상태 관리:
  - Redux Toolkit
  - Zustand
  
차트 라이브러리:
  - Chart.js
  - Recharts
  - D3.js
  
실시간 통신:
  - Socket.io
  - WebSocket
  
스타일링:
  - Tailwind CSS
  - Material-UI
  
백엔드 (API):
  - Express.js
  - FastAPI (Python)
  - NestJS
```

## 3. 대시보드 API 구현

### Express.js 예시
```typescript
// 별도 Express 서버
app.post('/api/workflow-events', async (req, res) => {
  const event = req.body;
  
  // 데이터 처리
  await processEvent(event);
  
  // WebSocket으로 실시간 브로드캐스트
  io.emit('workflow-update', event);
  
  res.json({ success: true });
});

app.get('/api/dashboard-data', async (req, res) => {
  const data = await getDashboardMetrics();
  res.json(data);
});
```

## 4. 대시보드 주요 기능

### 4.1 실시간 모니터링
- 현재 개발 단계 표시
- 진행률 시각화
- 활성 개발자 현황

### 4.2 메트릭 대시보드
- 단계별 소요 시간
- 일일/주간/월간 통계
- 병목 구간 분석

### 4.3 히스토리 뷰
- 과거 프로젝트 기록
- 트렌드 분석
- 성과 비교

### 4.4 알림 시스템
- 특정 이벤트 알림
- 임계값 초과 경고
- 팀 멤버 태그

## 5. 프론트엔드 컴포넌트 구조

```tsx
// React 컴포넌트 예시
const DashboardLayout = () => {
  return (
    <div className="dashboard">
      <Header />
      <div className="main-content">
        <WorkflowStatus />
        <MetricsChart />
        <TeamActivity />
        <RecentEvents />
      </div>
    </div>
  );
};

const WorkflowStatus = () => {
  const [currentStage, setCurrentStage] = useState(null);
  
  useEffect(() => {
    // WebSocket 연결
    socket.on('workflow-update', (data) => {
      setCurrentStage(data.stage);
    });
  }, []);
  
  return (
    <div className="workflow-status">
      <StageIndicator stage={currentStage} />
    </div>
  );
};
```

## 6. 실시간 데이터 처리

```typescript
// WebSocket 서버
io.on('connection', (socket) => {
  console.log('Client connected');
  
  // 초기 데이터 전송
  socket.emit('initial-data', await getInitialData());
  
  // 실시간 업데이트 구독
  subscribeToUpdates((data) => {
    socket.emit('workflow-update', data);
  });
});
```

## 7. 차트 구현 예시

```tsx
// Recharts를 사용한 차트
const StageTimeChart = ({ data }) => {
  return (
    <BarChart width={600} height={300} data={data}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="stage" />
      <YAxis />
      <Tooltip />
      <Legend />
      <Bar dataKey="duration" fill="#8884d8" />
    </BarChart>
  );
};
```

## 8. 배포 고려사항

### 8.1 컨테이너화
```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### 8.2 환경 설정
```yaml
# docker-compose.yml
services:
  dashboard:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://...
      - MCP_SERVER_URL=http://mcp:8080
    depends_on:
      - postgres
      - mcp-server
```

## 9. 보안 고려사항

- 인증/인가 구현
- CORS 설정
- Rate limiting
- 데이터 암호화

## 10. 성능 최적화

- 데이터 캐싱
- 페이지네이션
- 레이지 로딩
- 웹소켓 연결 관리

---

작성일: 2025-08-02  
최종 수정일: 2025-01-03  
작성자: yaioyaio