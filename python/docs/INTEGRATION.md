# DevFlow Monitor MCP - 통합 가이드

## 목차
1. [개요](#개요)
2. [IDE 통합](#ide-통합)
3. [CI/CD 통합](#cicd-통합)
4. [외부 서비스 통합](#외부-서비스-통합)
5. [API 통합](#api-통합)
6. [웹훅 및 이벤트](#웹훅-및-이벤트)
7. [커스텀 통합](#커스텀-통합)
8. [문제 해결](#문제-해결)

## 개요

DevFlow Monitor MCP는 다양한 개발 도구 및 서비스와 통합할 수 있도록 설계되었습니다. 이 가이드는 주요 통합 방법과 설정 방법을 설명합니다.

### 지원하는 통합 유형

- **IDE 통합**: VS Code, WebStorm, IntelliJ IDEA
- **CI/CD 통합**: GitHub Actions, GitLab CI, Jenkins
- **외부 서비스**: Jira, Notion, Figma, Slack
- **API 통합**: REST API, WebSocket, MCP 프로토콜
- **커스텀 통합**: 플러그인, 웹훅, 이벤트 리스너

## IDE 통합

### VS Code 통합

#### 1. 기본 설정

VS Code 작업 공간에 DevFlow Monitor 설정을 추가합니다:

```json
// .vscode/settings.json
{
  "devflow.monitor": {
    "enabled": true,
    "serverPath": "~/.config/mcp/devflow-monitor",
    "autoStart": true,
    "dashboard": {
      "showOnStartup": false,
      "position": "terminal"
    }
  },
  "devflow.notifications": {
    "enabled": true,
    "level": "info",
    "types": ["performance", "quality", "security"]
  }
}
```

#### 2. 작업 및 명령 설정

```json
// .vscode/tasks.json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Start DevFlow Monitor",
      "type": "shell",
      "command": "poetry",
      "args": ["start"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      },
      "problemMatcher": [],
      "runOptions": {
        "runOn": "folderOpen"
      }
    },
    {
      "label": "DevFlow Dashboard",
      "type": "shell",
      "command": "poetry",
      "args": ["run", "dashboard:tui"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": true,
        "panel": "new"
      }
    },
    {
      "label": "Generate DevFlow Report",
      "type": "shell",
      "command": "poetry",
      "args": ["run", "python", "-c", "print('Generating report via Claude...')"],
      "group": "build"
    }
  ]
}
```

#### 3. 디버그 설정

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug DevFlow Monitor",
      "type": "debugpy",
      "request": "launch",
      "module": "devflow_monitor",
      "cwd": "${workspaceFolder}",
      "env": {
        "DEVFLOW_ENV": "development",
        "DEVFLOW_DEBUG": "true"
      },
      "console": "integratedTerminal",
      "justMyCode": true
    }
  ]
}
```

#### 4. 스니펫 설정

```json
// .vscode/devflow.code-snippets
{
  "DevFlow Query": {
    "prefix": "dfq",
    "body": [
      "// DevFlow 쿼리: $1",
      "// 사용법: Claude Desktop에서 '$2'라고 입력"
    ],
    "description": "DevFlow Monitor 쿼리 템플릿"
  },
  "DevFlow Report": {
    "prefix": "dfr",
    "body": [
      "// DevFlow 리포트 생성",
      "// Claude Desktop에서: '${1:daily|weekly|monthly} 리포트를 생성해주세요'"
    ],
    "description": "DevFlow 리포트 생성 템플릿"
  }
}
```

### WebStorm/IntelliJ IDEA 통합

#### 1. External Tools 설정

**Settings → Tools → External Tools**

```xml
<!-- DevFlow Monitor Start -->
<tool name="Start DevFlow Monitor" 
      description="Start DevFlow Monitor MCP server"
      showInMainMenu="true" 
      showInEditor="false" 
      showInProject="true" 
      showInSearchPopup="true" 
      disabled="false" 
      useConsole="true" 
      showConsoleOnStdOut="true" 
      showConsoleOnStdErr="true" 
      synchronizeAfterRun="true">
  <exec>
    <option name="COMMAND" value="poetry" />
    <option name="PARAMETERS" value="start" />
    <option name="WORKING_DIRECTORY" value="$ProjectFileDir$" />
  </exec>
</tool>

<!-- DevFlow Dashboard -->  
<tool name="DevFlow Dashboard"
      description="Open DevFlow Dashboard"
      showInMainMenu="true"
      showInEditor="false"
      showInProject="true"
      showInSearchPopup="true"
      disabled="false"
      useConsole="true"
      showConsoleOnStdOut="true"
      showConsoleOnStdErr="true"
      synchronizeAfterRun="true">
  <exec>
    <option name="COMMAND" value="poetry" />
    <option name="PARAMETERS" value="run dashboard:tui" />
    <option name="WORKING_DIRECTORY" value="$ProjectFileDir$" />
  </exec>
</tool>
```

#### 2. 파일 감시자 설정

**Settings → Tools → File Watchers**

```xml
<watcher name="DevFlow Python Monitor" 
         description="DevFlow에서 Python 변경사항 모니터링"
         enabled="true" 
         level="PROJECT" 
         arguments=""
         executable=""
         file-type="Python" 
         output-paths=""  
         scope="Project Files" 
         working-dir="$ProjectFileDir$">
  <option name="outputFilters">
    <array />
  </option>
</watcher>
```

## CI/CD 통합

### GitHub Actions 통합

#### 1. 기본 워크플로우

```yaml
# .github/workflows/devflow-analysis.yml
name: DevFlow Analysis

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  devflow-analysis:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v3
      with:
        fetch-depth: 0  # DevFlow에서 Git 히스토리 분석을 위해 필요

    - name: Setup Python
      uses: actions/setup-node@v3
      with:
        node-version: '20'
        cache: 'poetry'

    - name: Install dependencies
      run: poetry install

    - name: Install DevFlow Monitor
      run: |
        git clone https://github.com/yaioyaio/kroot-mcp.git devflow-monitor
        cd devflow-monitor
        poetry install
        poetry build

    - name: Run DevFlow Analysis
      run: |
        cd devflow-monitor
        poetry run python -m devflow_monitor &
        DEVFLOW_PID=$!
        sleep 10  # DevFlow 서버가 시작될 때까지 대기
        
        # 분석 실행 (Claude API 또는 직접 호출)
        python scripts/ci-analysis.js
        
        # 서버 종료
        kill $DEVFLOW_PID

    - name: Upload DevFlow Report
      uses: actions/upload-artifact@v3
      with:
        name: devflow-report
        path: devflow-monitor/reports/
        retention-days: 30

    - name: Comment PR with Analysis
      if: github.event_name == 'pull_request'
      uses: actions/github-script@v6
      with:
        script: |
          const fs = require('fs');
          const reportPath = 'devflow-monitor/reports/pr-analysis.md';
          
          if (fs.existsSync(reportPath)) {
            const report = fs.readFileSync(reportPath, 'utf8');
            
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## DevFlow Analysis Report\n\n${report}`
            });
          }
```

#### 2. CI 분석 스크립트

```javascript
// scripts/ci-analysis.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function runCIAnalysis() {
  const serverUrl = 'http://localhost:3000';
  
  try {
    // DevFlow 서버 상태 확인
    const healthCheck = await axios.get(`${serverUrl}/health`);
    console.log('DevFlow server is running');
    
    // PR 분석 실행
    const analysis = await axios.post(`${serverUrl}/api/analyze`, {
      type: 'pr_analysis',
      branch: process.env.GITHUB_HEAD_REF || 'main',
      base: process.env.GITHUB_BASE_REF || 'main',
      commit: process.env.GITHUB_SHA
    });
    
    // 리포트 생성
    const report = generateMarkdownReport(analysis.data);
    
    // 리포트 저장
    const reportsDir = path.join(__dirname, '../reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(reportsDir, 'pr-analysis.md'),
      report
    );
    
    console.log('Analysis completed successfully');
    
  } catch (error) {
    console.error('Analysis failed:', error.message);
    process.exit(1);
  }
}

function generateMarkdownReport(data) {
  return `
### 📊 코드 품질 분석

- **변경된 파일**: ${data.changedFiles || 0}개
- **추가된 라인**: ${data.addedLines || 0}줄
- **삭제된 라인**: ${data.deletedLines || 0}줄
- **복잡도 점수**: ${data.complexity || 'N/A'}

### 🚀 생산성 메트릭

- **개발 시간**: ${data.developmentTime || 'N/A'}분
- **AI 도구 사용**: ${data.aiUsage || 'N/A'}%
- **테스트 커버리지**: ${data.testCoverage || 'N/A'}%

### ⚠️ 잠재적 이슈

${data.issues?.map(issue => `- ${issue}`).join('\n') || '이슈가 발견되지 않았습니다.'}

### 💡 개선 제안

${data.suggestions?.map(suggestion => `- ${suggestion}`).join('\n') || '현재 개선 제안이 없습니다.'}
  `.trim();
}

if (require.main === module) {
  runCIAnalysis();
}

module.exports = { runCIAnalysis };
```

### GitLab CI 통합

```yaml
# .gitlab-ci.yml
stages:
  - analysis
  - report

variables:
  NODE_VERSION: "20"

devflow_analysis:
  stage: analysis
  image: node:${NODE_VERSION}
  script:
    - poetry install
    - git clone https://gitlab.com/your-group/devflow-monitor.git
    - cd devflow-monitor
    - poetry install && poetry build
    - poetry run python -m devflow_monitor &
    - sleep 10
    - python scripts/gitlab-analysis.js
  artifacts:
    reports:
      junit: devflow-monitor/reports/junit.xml
    paths:
      - devflow-monitor/reports/
    expire_in: 1 week
  only:
    - merge_requests
    - main
    - develop

devflow_report:
  stage: report
  image: node:${NODE_VERSION}
  script:
    - python scripts/generate-gitlab-report.js
  dependencies:
    - devflow_analysis
  only:
    - merge_requests
```

### Jenkins 통합

```groovy
// Jenkinsfile
pipeline {
    agent any
    
    environment {
        NODE_VERSION = '20'
        DEVFLOW_HOME = "${WORKSPACE}/devflow-monitor"
    }
    
    stages {
        stage('Setup') {
            steps {
                sh 'pyenv local ${PYTHON_VERSION}'
                sh 'pip install poetry'

                dir('devflow-monitor') {
                    git url: 'https://github.com/yaioyaio/kroot-mcp.git'
                    sh 'cd python && poetry install'
                }
            }
        }
        
        stage('DevFlow Analysis') {
            steps {
                dir('devflow-monitor') {
                    sh '''
                        poetry run python -m devflow_monitor &
                        DEVFLOW_PID=$!
                        sleep 10
                        
                        python scripts/jenkins-analysis.js
                        
                        kill $DEVFLOW_PID
                    '''
                }
            }
            
            post {
                always {
                    archiveArtifacts artifacts: 'devflow-monitor/reports/**', fingerprint: true
                    publishHTML([
                        allowMissing: false,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: 'devflow-monitor/reports',
                        reportFiles: 'index.html',
                        reportName: 'DevFlow Report'
                    ])
                }
            }
        }
    }
}
```

## 외부 서비스 통합

### Jira 통합

#### 1. 설정

```json
// config/integrations.json
{
  "jira": {
    "enabled": true,
    "baseUrl": "https://your-domain.atlassian.net",
    "email": "your-email@example.com",
    "token": "${JIRA_API_TOKEN}",
    "project": "DEV",
    "autoCreateIssues": {
      "enabled": true,
      "severity": ["critical", "high"],
      "categories": ["performance", "security"]
    },
    "statusMapping": {
      "planning": "To Do",
      "implementation": "In Progress",
      "testing": "In Review",
      "deployment": "Done"
    }
  }
}
```

#### 2. 자동 이슈 생성

```javascript
// integrations/jira-integration.js
class JiraIntegration {
  async createPerformanceIssue(bottleneck) {
    const issue = {
      fields: {
        project: { key: this.config.project },
        summary: `Performance bottleneck detected: ${bottleneck.type}`,
        description: this.formatDescription(bottleneck),
        issuetype: { name: 'Bug' },
        priority: { name: this.mapSeverity(bottleneck.severity) },
        labels: ['devflow-monitor', 'performance', 'auto-generated']
      }
    };
    
    return await this.client.createIssue(issue);
  }
  
  async updateIssueFromStage(stageTransition) {
    const issues = await this.findRelatedIssues(stageTransition.context);
    
    for (const issue of issues) {
      await this.transitionIssue(
        issue.key,
        this.config.statusMapping[stageTransition.to]
      );
    }
  }
}
```

### Notion 통합

#### 1. 개발 일지 자동 생성

```javascript
// integrations/notion-integration.js
class NotionIntegration {
  async createDailyLog(date, metrics) {
    const page = {
      parent: { database_id: this.config.databaseId },
      properties: {
        Name: {
          title: [{ text: { content: `Development Log - ${date}` } }]
        },
        Date: {
          date: { start: date }
        },
        'Coding Time': {
          number: metrics.codingTime
        },
        'Commits': {
          number: metrics.commits
        },
        'AI Usage': {
          number: metrics.aiUsage
        },
        'Quality Score': {
          number: metrics.qualityScore
        }
      },
      children: this.formatLogContent(metrics)
    };
    
    return await this.client.pages.create(page);
  }
  
  formatLogContent(metrics) {
    return [
      {
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ text: { content: '📊 Today\'s Summary' } }]
        }
      },
      {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [
            { text: { content: `Focused coding: ${metrics.codingTime} minutes` } }
          ]
        }
      },
      // ... 더 많은 블록들
    ];
  }
}
```

### Slack 통합

#### 1. 알림 설정

```json
// config/notifications.json
{
  "slack": {
    "enabled": true,
    "webhookUrl": "${SLACK_WEBHOOK_URL}",
    "channels": {
      "general": "#dev-notifications",
      "critical": "#dev-alerts",
      "reports": "#dev-reports"
    },
    "filters": {
      "performance": {
        "severity": ["critical", "high"],
        "channel": "#dev-alerts"
      },
      "daily_report": {
        "schedule": "0 18 * * *",
        "channel": "#dev-reports"
      }
    }
  }
}
```

#### 2. 맞춤형 알림

```javascript
// integrations/slack-integration.js
class SlackIntegration {
  async sendPerformanceAlert(bottleneck) {
    const message = {
      channel: this.config.channels.critical,
      attachments: [
        {
          color: 'danger',
          title: '🚨 Performance Alert',
          fields: [
            {
              title: 'Type',
              value: bottleneck.type,
              short: true
            },
            {
              title: 'Severity',
              value: bottleneck.severity,
              short: true
            },
            {
              title: 'Impact',
              value: `${bottleneck.impact}% performance degradation`,
              short: true
            },
            {
              title: 'Recommendation',
              value: bottleneck.recommendation,
              short: false
            }
          ],
          footer: 'DevFlow Monitor',
          ts: Math.floor(Date.now() / 1000)
        }
      ]
    };
    
    return await this.sendMessage(message);
  }
  
  async sendDailyReport(report) {
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📈 Daily Development Report'
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Coding Time:*\n${report.codingTime} minutes`
          },
          {
            type: 'mrkdwn',
            text: `*Commits:*\n${report.commits}`
          },
          {
            type: 'mrkdwn',
            text: `*AI Usage:*\n${report.aiUsage}%`
          },
          {
            type: 'mrkdwn',
            text: `*Quality Score:*\n${report.qualityScore}/100`
          }
        ]
      }
    ];
    
    return await this.sendMessage({
      channel: this.config.channels.reports,
      blocks
    });
  }
}
```

## API 통합

### REST API 클라이언트

```javascript
// api/devflow-client.js
class DevFlowClient {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.axios = axios.create({
      baseURL: baseUrl,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }
  
  // 프로젝트 상태 조회
  async getProjectStatus() {
    const response = await this.axios.get('/api/project/status');
    return response.data;
  }
  
  // 메트릭 조회
  async getMetrics(timeRange = '1d', category = null) {
    const params = { timeRange };
    if (category) params.category = category;
    
    const response = await this.axios.get('/api/metrics', { params });
    return response.data;
  }
  
  // 활동 로그 조회
  async getActivityLog(filters = {}) {
    const response = await this.axios.get('/api/activity', { params: filters });
    return response.data;
  }
  
  // 리포트 생성
  async generateReport(type, options = {}) {
    const response = await this.axios.post('/api/reports', {
      type,
      ...options
    });
    return response.data;
  }
}

// 사용 예시
const client = new DevFlowClient('http://localhost:3000', 'your-api-key');

async function example() {
  try {
    const status = await client.getProjectStatus();
    console.log('Project Status:', status);
    
    const metrics = await client.getMetrics('1w', 'productivity');
    console.log('Weekly Productivity:', metrics);
    
    const report = await client.generateReport('weekly', {
      sections: ['summary', 'productivity', 'quality']
    });
    console.log('Report generated:', report.id);
    
  } catch (error) {
    console.error('API Error:', error.response?.data || error.message);
  }
}
```

### WebSocket 클라이언트

```javascript
// api/websocket-client.js
class DevFlowWebSocketClient {
  constructor(url, options = {}) {
    this.url = url;
    this.options = options;
    this.ws = null;
    this.listeners = new Map();
  }
  
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        console.log('Connected to DevFlow WebSocket');
        
        // 인증
        if (this.options.apiKey) {
          this.send('auth', { apiKey: this.options.apiKey });
        }
        
        resolve();
      };
      
      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      };
      
      this.ws.onerror = reject;
      this.ws.onclose = () => {
        console.log('WebSocket connection closed');
        this.reconnect();
      };
    });
  }
  
  send(type, data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    }
  }
  
  subscribe(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType).push(callback);
    
    // 서버에 구독 요청
    this.send('subscribe', { eventType });
  }
  
  handleMessage(message) {
    const { type, data } = message;
    
    if (this.listeners.has(type)) {
      this.listeners.get(type).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Event handler error:', error);
        }
      });
    }
  }
  
  reconnect() {
    setTimeout(() => {
      console.log('Attempting to reconnect...');
      this.connect().catch(console.error);
    }, 5000);
  }
}

// 사용 예시
const wsClient = new DevFlowWebSocketClient('ws://localhost:3000/ws', {
  apiKey: 'your-api-key'
});

async function setupRealtimeMonitoring() {
  await wsClient.connect();
  
  // 실시간 이벤트 구독
  wsClient.subscribe('file_change', (event) => {
    console.log('File changed:', event.path);
  });
  
  wsClient.subscribe('performance_alert', (alert) => {
    console.warn('Performance Alert:', alert);
    // 알림 UI 업데이트 또는 다른 작업 수행
  });
  
  wsClient.subscribe('stage_transition', (transition) => {
    console.log(`Stage changed: ${transition.from} → ${transition.to}`);
  });
}
```

## 웹훅 및 이벤트

### 웹훅 설정

```javascript
// webhooks/webhook-server.js
const express = require('express');
const crypto = require('crypto');

class WebhookServer {
  constructor(devflowClient) {
    this.app = express();
    this.devflowClient = devflowClient;
    this.setupMiddleware();
    this.setupRoutes();
  }
  
  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(this.verifySignature.bind(this));
  }
  
  setupRoutes() {
    // GitHub 웹훅
    this.app.post('/webhooks/github', this.handleGitHubWebhook.bind(this));
    
    // Jira 웹훅
    this.app.post('/webhooks/jira', this.handleJiraWebhook.bind(this));
    
    // 커스텀 웹훅
    this.app.post('/webhooks/custom', this.handleCustomWebhook.bind(this));
  }
  
  verifySignature(req, res, next) {
    const signature = req.headers['x-hub-signature-256'];
    const payload = JSON.stringify(req.body);
    const secret = process.env.WEBHOOK_SECRET;
    
    if (signature) {
      const expectedSignature = 'sha256=' + 
        crypto.createHmac('sha256', secret).update(payload).digest('hex');
      
      if (signature !== expectedSignature) {
        return res.status(401).send('Invalid signature');
      }
    }
    
    next();
  }
  
  async handleGitHubWebhook(req, res) {
    const { action, repository, pull_request } = req.body;
    
    try {
      switch (action) {
        case 'opened':
          await this.devflowClient.trackEvent('pr_opened', {
            repo: repository.name,
            pr: pull_request.number,
            author: pull_request.user.login
          });
          break;
          
        case 'closed':
          if (pull_request.merged) {
            await this.devflowClient.trackEvent('pr_merged', {
              repo: repository.name,
              pr: pull_request.number,
              mergeDuration: this.calculateMergeDuration(pull_request)
            });
          }
          break;
      }
      
      res.status(200).send('OK');
    } catch (error) {
      console.error('GitHub webhook error:', error);
      res.status(500).send('Internal Server Error');
    }
  }
}
```

### 이벤트 리스너

```javascript
// events/custom-listeners.js
class CustomEventListeners {
  constructor(eventEngine) {
    this.eventEngine = eventEngine;
    this.setupListeners();
  }
  
  setupListeners() {
    // 성능 이슈 감지 시
    this.eventEngine.on('performance_bottleneck', async (event) => {
      await this.handlePerformanceBottleneck(event);
    });
    
    // 보안 이벤트 감지 시
    this.eventEngine.on('security_violation', async (event) => {
      await this.handleSecurityViolation(event);
    });
    
    // 코드 품질 이슈 감지 시
    this.eventEngine.on('quality_issue', async (event) => {
      await this.handleQualityIssue(event);
    });
    
    // AI 사용 패턴 변화 감지 시
    this.eventEngine.on('ai_usage_change', async (event) => {
      await this.handleAIUsageChange(event);
    });
  }
  
  async handlePerformanceBottleneck(event) {
    const { type, severity, metrics } = event.data;
    
    // 1. Slack 알림 발송
    await this.sendSlackAlert('performance', {
      type,
      severity,
      metrics,
      timestamp: event.timestamp
    });
    
    // 2. Jira 이슈 생성 (심각도가 높은 경우)
    if (severity === 'critical' || severity === 'high') {
      await this.createJiraIssue('Performance', {
        summary: `Performance bottleneck: ${type}`,
        description: this.formatPerformanceDescription(event),
        priority: severity === 'critical' ? 'Highest' : 'High'
      });
    }
    
    // 3. 자동 최적화 제안
    const suggestions = await this.generateOptimizationSuggestions(event);
    if (suggestions.length > 0) {
      await this.notifyDevelopers('optimization_suggestions', suggestions);
    }
  }
  
  async handleSecurityViolation(event) {
    const { violationType, details } = event.data;
    
    // 즉시 보안 팀에 알림
    await this.sendSecurityAlert({
      type: violationType,
      details,
      timestamp: event.timestamp,
      urgent: event.severity === 'critical'
    });
    
    // 보안 감사 로그에 기록
    await this.logSecurityEvent(event);
  }
}
```

## 커스텀 통합

### 플러그인 개발

```javascript
// plugins/custom-analyzer.js
class CustomAnalyzerPlugin {
  constructor(config) {
    this.name = 'custom-analyzer';
    this.version = '1.0.0';
    this.config = config;
  }
  
  // 플러그인 등록 시 호출
  async register(devflowServer) {
    // 커스텀 MCP 도구 등록
    devflowServer.addTool({
      name: 'analyzeCustomMetric',
      description: 'Analyze custom development metrics',
      inputSchema: {
        type: 'object',
        properties: {
          metric: { type: 'string' },
          timeRange: { type: 'string' }
        }
      },
      handler: this.analyzeCustomMetric.bind(this)
    });
    
    // 이벤트 리스너 등록
    devflowServer.eventEngine.on('file_change', this.handleFileChange.bind(this));
    
    // 주기적 작업 등록
    setInterval(() => {
      this.performPeriodicAnalysis();
    }, this.config.analysisInterval || 300000); // 5분마다
  }
  
  async analyzeCustomMetric(args) {
    const { metric, timeRange } = args;
    
    try {
      // 커스텀 메트릭 분석 로직
      const data = await this.collectCustomData(metric, timeRange);
      const analysis = await this.performAnalysis(data);
      
      return {
        metric,
        timeRange,
        analysis,
        insights: this.generateInsights(analysis),
        recommendations: this.generateRecommendations(analysis)
      };
    } catch (error) {
      throw new Error(`Custom metric analysis failed: ${error.message}`);
    }
  }
  
  async handleFileChange(event) {
    const { path, type } = event.data;
    
    // 커스텀 파일 분석 로직
    if (this.shouldAnalyzeFile(path)) {
      const analysis = await this.analyzeFile(path, type);
      
      if (analysis.hasIssues) {
        // 커스텀 이벤트 발생
        this.eventEngine.emit('custom_issue_detected', {
          file: path,
          issues: analysis.issues,
          severity: analysis.severity
        });
      }
    }
  }
  
  async performPeriodicAnalysis() {
    try {
      // 주기적 커스텀 분석
      const metrics = await this.collectPeriodMetrics();
      const trends = await this.analyzeTrends(metrics);
      
      if (trends.hasSignificantChanges) {
        // 트렌드 변화 알림
        this.eventEngine.emit('custom_trend_change', {
          trends,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Periodic analysis error:', error);
    }
  }
}

// 플러그인 사용
const customPlugin = new CustomAnalyzerPlugin({
  analysisInterval: 300000,
  filePatterns: ['*.custom', '*.special'],
  thresholds: {
    quality: 0.8,
    performance: 0.9
  }
});

module.exports = customPlugin;
```

### 데이터 익스포터

```javascript
// exporters/custom-exporter.js
class CustomDataExporter {
  constructor(devflowClient, config) {
    this.client = devflowClient;
    this.config = config;
  }
  
  async exportToElasticsearch(timeRange) {
    const { Client } = require('@elastic/elasticsearch');
    const esClient = new Client({ node: this.config.elasticsearch.url });
    
    try {
      // DevFlow 데이터 조회
      const metrics = await this.client.getMetrics(timeRange);
      const activities = await this.client.getActivityLog({ timeRange });
      
      // Elasticsearch 인덱스로 데이터 전송
      const indexName = `devflow-${new Date().toISOString().slice(0, 7)}`;
      
      for (const metric of metrics) {
        await esClient.index({
          index: indexName,
          body: {
            '@timestamp': metric.timestamp,
            type: 'metric',
            ...metric
          }
        });
      }
      
      for (const activity of activities) {
        await esClient.index({
          index: indexName,
          body: {
            '@timestamp': activity.timestamp,
            type: 'activity',
            ...activity
          }
        });
      }
      
      console.log(`Exported ${metrics.length + activities.length} records to Elasticsearch`);
    } catch (error) {
      console.error('Elasticsearch export failed:', error);
    }
  }
  
  async exportToPrometheus() {
    const client = require('prom-client');
    
    // Prometheus 메트릭 정의
    const codingTimeGauge = new client.Gauge({
      name: 'devflow_coding_time_minutes',
      help: 'Total coding time in minutes'
    });
    
    const commitCounter = new client.Counter({
      name: 'devflow_commits_total',
      help: 'Total number of commits'
    });
    
    const aiUsageGauge = new client.Gauge({
      name: 'devflow_ai_usage_percentage',
      help: 'AI tool usage percentage'
    });
    
    // DevFlow 데이터로 메트릭 업데이트
    const metrics = await this.client.getMetrics('1d');
    
    codingTimeGauge.set(metrics.productivity.codingTime);
    commitCounter.inc(metrics.git.commits);
    aiUsageGauge.set(metrics.ai.usagePercentage);
    
    // Prometheus Gateway로 푸시 (옵션)
    if (this.config.prometheus.pushGateway) {
      const gateway = new client.Pushgateway(
        this.config.prometheus.pushGateway,
        [], 
        client.register
      );
      
      await gateway.pushAdd({ jobName: 'devflow-monitor' });
    }
  }
}
```

## 문제 해결

### 일반적인 통합 문제

#### 1. 인증 오류

**문제**: API 키 또는 토큰 인증 실패

**해결방법**:
```bash
# 환경 변수 확인
echo $DEVFLOW_API_KEY
echo $JIRA_API_TOKEN
echo $SLACK_WEBHOOK_URL

# 토큰 유효성 검증
curl -H "Authorization: Bearer $DEVFLOW_API_KEY" \
     http://localhost:3000/api/status

# 새 API 키 생성
python scripts/generate-api-key.js
```

#### 2. 네트워크 연결 문제

**문제**: 외부 서비스와의 연결 실패

**해결방법**:
```bash
# 연결 테스트
curl -I https://your-domain.atlassian.net
telnet localhost 3000

# 방화벽 확인
sudo ufw status
netstat -tlnp | grep 3000

# DNS 확인
nslookup your-domain.atlassian.net
```

#### 3. 웹훅 검증 실패

**문제**: 웹훅 시그니처 검증 실패

**해결방법**:
```javascript
// 디버그 로그 추가
console.log('Received signature:', req.headers['x-hub-signature-256']);
console.log('Expected signature:', expectedSignature);
console.log('Payload:', JSON.stringify(req.body));

// 시크릿 확인
console.log('Using secret:', process.env.WEBHOOK_SECRET ? '[SET]' : '[NOT SET]');
```

### 성능 최적화

#### 1. API 호출 최적화

```javascript
// 배치 요청 사용
const batchRequests = [
  client.getMetrics('1d'),
  client.getActivityLog({ limit: 100 }),
  client.getProjectStatus()
];

const [metrics, activities, status] = await Promise.all(batchRequests);

// 캐싱 구현
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 300 }); // 5분 캐시

async function getCachedMetrics(timeRange) {
  const key = `metrics:${timeRange}`;
  let metrics = cache.get(key);
  
  if (!metrics) {
    metrics = await client.getMetrics(timeRange);
    cache.set(key, metrics);
  }
  
  return metrics;
}
```

#### 2. 이벤트 스트리밍 최적화

```javascript
// 이벤트 버퍼링
class EventBuffer {
  constructor(flushInterval = 5000, maxSize = 100) {
    this.buffer = [];
    this.flushInterval = flushInterval;
    this.maxSize = maxSize;
    
    setInterval(() => this.flush(), flushInterval);
  }
  
  add(event) {
    this.buffer.push(event);
    
    if (this.buffer.length >= this.maxSize) {
      this.flush();
    }
  }
  
  async flush() {
    if (this.buffer.length === 0) return;
    
    const events = this.buffer.splice(0);
    await this.processEvents(events);
  }
}
```

---

**참고**: 이 통합 가이드는 DevFlow Monitor MCP (Python) 기준으로 작성되었습니다. 최신 정보는 [GitHub 저장소](https://github.com/yaioyaio/kroot-mcp)를 확인하세요.

**최종 수정일**: 2026-02-04