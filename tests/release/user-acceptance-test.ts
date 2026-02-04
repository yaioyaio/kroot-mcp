/**
 * DevFlow Monitor MCP - 사용자 승인 테스트
 * 
 * 실제 사용자 시나리오를 기반으로 시스템의 사용성을 검증합니다.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DevFlowMonitorServer } from '../../src/server/index.js';
import { Database } from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('사용자 승인 테스트', () => {
  let server: DevFlowMonitorServer;
  let testWorkspace: string;
  let db: Database;

  beforeAll(async () => {
    // 실제 개발 환경과 유사한 워크스페이스 설정
    testWorkspace = path.join('/tmp', `devflow-uat-${randomUUID()}`);
    await fs.mkdir(testWorkspace, { recursive: true });

    // Git 저장소 초기화
    await execAsync('git init', { cwd: testWorkspace });
    await execAsync('git config user.email "test@devflow.com"', { cwd: testWorkspace });
    await execAsync('git config user.name "DevFlow Test"', { cwd: testWorkspace });

    // 서버 초기화
    db = new Database(':memory:');
    server = new DevFlowMonitorServer({
      projectRoot: testWorkspace,
      database: db,
      config: {
        monitoring: { enableFileMonitoring: true, enableGitMonitoring: true },
        integration: { enableExternalAPIs: false },
        dashboard: { enableTUI: false }, // 테스트에서는 TUI 비활성화
        notification: { enableSlack: false }
      }
    });

    await server.initialize();
  });

  afterAll(async () => {
    await server.shutdown();
    db.close();
    await fs.rm(testWorkspace, { recursive: true, force: true });
  });

  describe('시나리오 1: 신규 프로젝트 시작', () => {
    it('개발자가 새 프로젝트를 시작하고 초기 설정을 완료할 수 있어야 함', async () => {
      // 1. 프로젝트 생성
      const projectManager = server.getProjectManager();
      const project = await projectManager.createProject({
        name: 'My New App',
        path: testWorkspace,
        description: 'A new Node.js application',
        type: 'node',
        tags: ['backend', 'api']
      });

      expect(project).toBeDefined();
      expect(project.name).toBe('My New App');

      // 2. package.json 생성
      await fs.writeFile(
        path.join(testWorkspace, 'package.json'),
        JSON.stringify({
          name: 'my-new-app',
          version: '1.0.0',
          description: 'A new Node.js application',
          main: 'index.js',
          scripts: {
            test: 'jest',
            dev: 'nodemon index.js'
          }
        }, null, 2)
      );

      // 3. 초기 파일 생성
      await fs.writeFile(
        path.join(testWorkspace, 'index.js'),
        `
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.json({ message: 'Hello, DevFlow!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
        `.trim()
      );

      // 4. Git 커밋
      await execAsync('git add .', { cwd: testWorkspace });
      await execAsync('git commit -m "Initial commit"', { cwd: testWorkspace });

      // 5. 시스템이 모든 활동을 감지했는지 확인
      await new Promise(resolve => setTimeout(resolve, 500));

      const metrics = await server.getMetrics();
      expect(metrics.fileChanges).toBeGreaterThan(0);
      expect(metrics.gitCommits).toBeGreaterThan(0);

      // 6. 프로젝트 상태 확인
      const status = await server.getProjectStatus(project.id);
      expect(status.currentStage).toContain('초기화');
      expect(status.health.status).toBe('healthy');
    });
  });

  describe('시나리오 2: TDD 개발 워크플로우', () => {
    it('TDD 방식으로 기능을 개발할 때 시스템이 적절히 추적해야 함', async () => {
      // 1. 테스트 먼저 작성 (Red)
      await fs.mkdir(path.join(testWorkspace, 'test'), { recursive: true });
      await fs.writeFile(
        path.join(testWorkspace, 'test', 'calculator.test.js'),
        `
const Calculator = require('../src/calculator');

describe('Calculator', () => {
  let calc;
  
  beforeEach(() => {
    calc = new Calculator();
  });

  test('should add two numbers', () => {
    expect(calc.add(2, 3)).toBe(5);
  });

  test('should subtract two numbers', () => {
    expect(calc.subtract(5, 3)).toBe(2);
  });
});
        `.trim()
      );

      await execAsync('git add .', { cwd: testWorkspace });
      await execAsync('git commit -m "test: Add calculator tests"', { cwd: testWorkspace });

      // 2. 구현 코드 작성 (Green)
      await fs.mkdir(path.join(testWorkspace, 'src'), { recursive: true });
      await fs.writeFile(
        path.join(testWorkspace, 'src', 'calculator.js'),
        `
class Calculator {
  add(a, b) {
    return a + b;
  }

  subtract(a, b) {
    return a - b;
  }
}

module.exports = Calculator;
        `.trim()
      );

      await execAsync('git add .', { cwd: testWorkspace });
      await execAsync('git commit -m "feat: Implement calculator"', { cwd: testWorkspace });

      // 3. 리팩토링 (Refactor)
      await fs.writeFile(
        path.join(testWorkspace, 'src', 'calculator.js'),
        `
class Calculator {
  add(a, b) {
    this.validateNumbers(a, b);
    return a + b;
  }

  subtract(a, b) {
    this.validateNumbers(a, b);
    return a - b;
  }

  validateNumbers(a, b) {
    if (typeof a !== 'number' || typeof b !== 'number') {
      throw new TypeError('Arguments must be numbers');
    }
  }
}

module.exports = Calculator;
        `.trim()
      );

      await execAsync('git add .', { cwd: testWorkspace });
      await execAsync('git commit -m "refactor: Add input validation"', { cwd: testWorkspace });

      // 4. 시스템이 TDD 사이클을 감지했는지 확인
      await new Promise(resolve => setTimeout(resolve, 500));

      const analyzer = server.getMethodologyAnalyzer();
      const methodologyScore = await analyzer.analyzeMethodology('tdd');
      
      expect(methodologyScore.score).toBeGreaterThan(0.5);
      expect(methodologyScore.detectedPatterns).toContain('test-first');
    });
  });

  describe('시나리오 3: AI 도구 협업', () => {
    it('AI 도구 사용을 감지하고 효과성을 분석해야 함', async () => {
      // 1. AI가 생성한 것으로 보이는 코드 추가
      await fs.writeFile(
        path.join(testWorkspace, 'src', 'user-service.js'),
        `
/**
 * User service for managing user operations
 * Generated with AI assistance
 */
class UserService {
  constructor(database) {
    this.db = database;
  }

  /**
   * Creates a new user in the database
   * @param {Object} userData - The user data
   * @returns {Promise<Object>} The created user
   */
  async createUser(userData) {
    // Validate required fields
    if (!userData.email || !userData.name) {
      throw new Error('Email and name are required');
    }

    // Check if user already exists
    const existingUser = await this.db.findOne({ email: userData.email });
    if (existingUser) {
      throw new Error('User already exists');
    }

    // Create user with timestamp
    const user = {
      ...userData,
      id: this.generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return await this.db.insert(user);
  }

  generateId() {
    return 'usr_' + Math.random().toString(36).substr(2, 9);
  }
}

module.exports = UserService;
        `.trim()
      );

      // 2. AI 협업을 나타내는 커밋
      await execAsync('git add .', { cwd: testWorkspace });
      await execAsync('git commit -m "feat: Add user service (AI-assisted)"', { cwd: testWorkspace });

      // 3. AI 모니터 확인
      await new Promise(resolve => setTimeout(resolve, 300));

      const aiMonitor = server.getAIMonitor();
      const aiStats = await aiMonitor.getAICollaborationStats();

      expect(aiStats.totalSessions).toBeGreaterThan(0);
      expect(aiStats.aiAssistedCommits).toBeGreaterThan(0);
    });
  });

  describe('시나리오 4: 일일 보고서 생성', () => {
    it('개발자가 일일 진행 상황 보고서를 생성할 수 있어야 함', async () => {
      const reportEngine = server.getReportEngine();
      const projectManager = server.getProjectManager();
      
      // 프로젝트 ID 가져오기
      const projects = await projectManager.listProjects();
      const projectId = projects[0].id;

      // 보고서 생성
      const report = await reportEngine.generateReport({
        type: 'daily',
        projectId,
        format: 'json'
      });

      expect(report).toBeDefined();
      expect(report.metadata.type).toBe('daily');
      expect(report.sections).toBeDefined();

      // 보고서에 필수 섹션이 포함되어야 함
      const sectionTitles = report.sections.map((s: any) => s.title);
      expect(sectionTitles).toContain('개발 활동 요약');
      expect(sectionTitles).toContain('주요 변경사항');
      expect(sectionTitles).toContain('커밋 통계');

      // 실제 데이터가 포함되어야 함
      const activitySection = report.sections.find((s: any) => s.title === '개발 활동 요약');
      expect(activitySection.content.totalEvents).toBeGreaterThan(0);
    });
  });

  describe('시나리오 5: 피드백 제출 및 처리', () => {
    it('사용자가 피드백을 제출하고 시스템이 적절히 처리해야 함', async () => {
      const feedbackSystem = server.getFeedbackSystem();

      // 1. 버그 리포트 제출
      const bugReport = await feedbackSystem.submitBugReport(
        'Dashboard not updating in real-time',
        'The dashboard shows stale data and requires manual refresh to see new events.',
        undefined,
        { email: 'developer@example.com', name: 'John Developer' }
      );

      expect(bugReport.id).toBeDefined();
      expect(bugReport.type).toBe('bug_report');
      expect(bugReport.priority).toBe('medium');

      // 2. 기능 요청 제출
      const featureRequest = await feedbackSystem.submitFeatureRequest(
        'Add support for GitHub Actions',
        'It would be great to monitor GitHub Actions workflows directly from DevFlow.',
        undefined,
        { email: 'developer@example.com' }
      );

      expect(featureRequest.id).toBeDefined();
      expect(featureRequest.type).toBe('feature_request');

      // 3. 피드백 분석
      await feedbackSystem.analyzeFeedback(bugReport.id);
      await feedbackSystem.analyzeFeedback(featureRequest.id);

      // 4. 개선 제안 확인
      const suggestions = await feedbackSystem.listImprovementSuggestions();
      expect(suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('시나리오 6: 다중 프로젝트 관리', () => {
    it('여러 프로젝트를 동시에 관리하고 크로스 분석을 수행할 수 있어야 함', async () => {
      const projectManager = server.getProjectManager();

      // 1. 두 번째 프로젝트 생성
      const project2Path = path.join('/tmp', `devflow-project2-${randomUUID()}`);
      await fs.mkdir(project2Path, { recursive: true });

      const project2 = await projectManager.createProject({
        name: 'Frontend App',
        path: project2Path,
        description: 'React frontend application',
        type: 'react',
        tags: ['frontend', 'ui']
      });

      // 2. 프로젝트 목록 확인
      const projects = await projectManager.listProjects();
      expect(projects.length).toBeGreaterThanOrEqual(2);

      // 3. 크로스 프로젝트 분석
      const crossAnalyzer = server.getCrossProjectAnalyzer();
      const analysis = await crossAnalyzer.analyzeSimilarity(
        projects.map(p => p.id)
      );

      expect(analysis).toBeDefined();
      expect(analysis.type).toBe('similarity');

      // 정리
      await fs.rm(project2Path, { recursive: true, force: true });
    });
  });

  describe('시나리오 7: 성능 모니터링', () => {
    it('시스템 성능을 모니터링하고 최적화 제안을 제공해야 함', async () => {
      const performanceManager = server.getPerformanceManager();

      // 1. 성능 프로파일링 시작
      await performanceManager.startProfiling('user-test');

      // 2. 일부 활동 수행
      for (let i = 0; i < 10; i++) {
        await fs.writeFile(
          path.join(testWorkspace, `temp-${i}.txt`),
          `Temporary file ${i}`
        );
      }

      // 3. 프로파일링 종료
      const profile = await performanceManager.stopProfiling('user-test');

      expect(profile).toBeDefined();
      expect(profile.duration).toBeGreaterThan(0);
      expect(profile.metrics).toBeDefined();

      // 4. 성능 보고서 생성
      const report = await performanceManager.generateReport();
      expect(report.summary).toBeDefined();
      expect(report.recommendations).toBeDefined();

      // 임시 파일 정리
      for (let i = 0; i < 10; i++) {
        await fs.unlink(path.join(testWorkspace, `temp-${i}.txt`));
      }
    });
  });
});