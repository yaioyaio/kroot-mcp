/**
 * DevFlow Monitor MCP - 최종 시스템 테스트
 * 
 * 릴리즈 전 전체 시스템의 통합성과 성능을 검증합니다.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DevFlowMonitorServer } from '../../src/server/index.js';
import { EventEngine } from '../../src/events/engine.js';
import { FileMonitor } from '../../src/monitors/file.js';
import { GitMonitor } from '../../src/monitors/git.js';
import { StageAnalyzer } from '../../src/analyzers/stage-analyzer.js';
import { AIMonitor } from '../../src/analyzers/ai-monitor.js';
import { MethodologyAnalyzer } from '../../src/analyzers/methodology-analyzer.js';
import { MetricsCollector } from '../../src/analyzers/metrics-collector.js';
import { NotificationManager } from '../../src/notifications/notification-manager.js';
import { APIIntegrationManager } from '../../src/integrations/api-integration-manager.js';
import { PluginManager } from '../../src/plugins/manager.js';
import { ProjectManager } from '../../src/projects/project-manager.js';
import { ReportEngine } from '../../src/reports/report-engine.js';
import { FeedbackSystem } from '../../src/feedback/index.js';
import { Database } from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

describe('최종 시스템 테스트', () => {
  let server: DevFlowMonitorServer;
  let eventEngine: EventEngine;
  let testProjectPath: string;
  let db: Database;

  beforeAll(async () => {
    // 테스트 환경 설정
    testProjectPath = path.join('/tmp', `devflow-test-${randomUUID()}`);
    await fs.mkdir(testProjectPath, { recursive: true });

    // 테스트 데이터베이스 생성
    db = new Database(':memory:');

    // 시스템 초기화
    server = new DevFlowMonitorServer({
      projectRoot: testProjectPath,
      database: db,
      config: {
        monitoring: { enableFileMonitoring: true, enableGitMonitoring: true },
        integration: { enableExternalAPIs: false }, // 테스트에서는 외부 API 비활성화
        performance: { enableOptimization: true },
        security: { enableAuthentication: false } // 테스트에서는 인증 비활성화
      }
    });

    eventEngine = server.getEventEngine();
    await server.initialize();
  });

  afterAll(async () => {
    // 정리
    await server.shutdown();
    db.close();
    await fs.rm(testProjectPath, { recursive: true, force: true });
  });

  describe('핵심 컴포넌트 통합', () => {
    it('모든 핵심 서비스가 정상적으로 시작되어야 함', async () => {
      const status = await server.getSystemStatus();
      
      expect(status.server.isRunning).toBe(true);
      expect(status.eventEngine.isRunning).toBe(true);
      expect(status.monitors.file.isActive).toBe(true);
      expect(status.monitors.git.isActive).toBe(true);
      expect(status.analyzers.stage.isActive).toBe(true);
      expect(status.analyzers.ai.isActive).toBe(true);
      expect(status.analyzers.methodology.isActive).toBe(true);
    });

    it('이벤트 엔진이 모든 소스의 이벤트를 처리해야 함', async () => {
      const events: any[] = [];
      const unsubscribe = eventEngine.on('*', (event) => {
        events.push(event);
      });

      // 테스트 파일 생성으로 이벤트 트리거
      await fs.writeFile(path.join(testProjectPath, 'test.ts'), 'console.log("test");');
      
      // 이벤트 처리 대기
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.category === 'file')).toBe(true);

      unsubscribe();
    });
  });

  describe('엔드-투-엔드 워크플로우', () => {
    it('파일 생성부터 보고서 생성까지 전체 플로우가 작동해야 함', async () => {
      // 1. 프로젝트 생성
      const projectManager = server.getProjectManager();
      const project = await projectManager.createProject({
        name: 'Test Project',
        path: testProjectPath,
        description: 'E2E test project'
      });

      expect(project.id).toBeDefined();

      // 2. 개발 활동 시뮬레이션
      await fs.writeFile(
        path.join(testProjectPath, 'domain.ts'),
        `
        export class User {
          constructor(public id: string, public name: string) {}
        }
        `
      );

      await fs.writeFile(
        path.join(testProjectPath, 'user.test.ts'),
        `
        import { User } from './domain';
        
        describe('User', () => {
          it('should create user', () => {
            const user = new User('1', 'Test');
            expect(user.id).toBe('1');
          });
        });
        `
      );

      // 3. 이벤트 처리 대기
      await new Promise(resolve => setTimeout(resolve, 200));

      // 4. 메트릭 확인
      const metrics = await server.getMetrics();
      expect(metrics.totalEvents).toBeGreaterThan(0);
      expect(metrics.fileChanges).toBeGreaterThan(0);

      // 5. 보고서 생성
      const reportEngine = server.getReportEngine();
      const report = await reportEngine.generateReport({
        type: 'daily',
        projectId: project.id,
        format: 'json'
      });

      expect(report).toBeDefined();
      expect(report.metadata.projectId).toBe(project.id);
      expect(report.sections).toBeDefined();
    });
  });

  describe('플러그인 시스템', () => {
    it('플러그인을 로드하고 실행할 수 있어야 함', async () => {
      const pluginManager = server.getPluginManager();
      
      // 테스트 플러그인 생성
      const pluginPath = path.join(testProjectPath, 'test-plugin');
      await fs.mkdir(pluginPath, { recursive: true });
      
      await fs.writeFile(
        path.join(pluginPath, 'package.json'),
        JSON.stringify({
          name: 'test-plugin',
          version: '1.0.0',
          main: 'index.js',
          devflowPlugin: {
            displayName: 'Test Plugin',
            permissions: ['events:read']
          }
        })
      );

      await fs.writeFile(
        path.join(pluginPath, 'index.js'),
        `
        module.exports = {
          async activate(context) {
            context.logger.info('Test plugin activated');
            return { success: true };
          },
          async deactivate() {
            return true;
          }
        };
        `
      );

      // 플러그인 로드
      const plugin = await pluginManager.loadPlugin(pluginPath);
      expect(plugin.metadata.name).toBe('test-plugin');
      expect(plugin.status).toBe('loaded');

      // 플러그인 활성화
      await pluginManager.activatePlugin(plugin.id);
      expect(plugin.status).toBe('active');

      // 플러그인 비활성화
      await pluginManager.deactivatePlugin(plugin.id);
      expect(plugin.status).toBe('loaded');
    });
  });

  describe('피드백 시스템', () => {
    it('피드백을 수집하고 분석할 수 있어야 함', async () => {
      const feedbackSystem = server.getFeedbackSystem();

      // 피드백 제출
      const feedback = await feedbackSystem.submitFeedback({
        type: 'feature_request',
        title: 'Add dark mode',
        description: 'It would be great to have a dark mode option',
        submitter: { email: 'test@example.com' }
      });

      expect(feedback.id).toBeDefined();
      expect(feedback.status).toBe('new');

      // 피드백 분석
      await feedbackSystem.analyzeFeedback(feedback.id);
      
      const analysis = await feedbackSystem.getFeedback(feedback.id);
      expect(analysis).toBeDefined();
      expect(analysis?.priority).toBeDefined();
    });
  });

  describe('성능 및 확장성', () => {
    it('대량의 이벤트를 처리할 수 있어야 함', async () => {
      const startTime = Date.now();
      const eventCount = 1000;

      // 대량 이벤트 생성
      const promises = [];
      for (let i = 0; i < eventCount; i++) {
        promises.push(
          eventEngine.emit({
            id: randomUUID(),
            category: 'development',
            type: 'code_change',
            severity: 'info',
            timestamp: Date.now(),
            source: 'test',
            data: { index: i }
          })
        );
      }

      await Promise.all(promises);
      const duration = Date.now() - startTime;

      // 성능 기준: 1000개 이벤트를 5초 이내에 처리
      expect(duration).toBeLessThan(5000);

      // 모든 이벤트가 처리되었는지 확인
      const stats = await eventEngine.getStats();
      expect(stats.totalEvents).toBeGreaterThanOrEqual(eventCount);
    });

    it('메모리 사용량이 적정 수준을 유지해야 함', () => {
      const memoryUsage = process.memoryUsage();
      const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;

      // 메모리 사용량이 500MB 이하여야 함
      expect(heapUsedMB).toBeLessThan(500);
    });
  });

  describe('오류 복구 및 안정성', () => {
    it('잘못된 입력에 대해 적절히 처리해야 함', async () => {
      const projectManager = server.getProjectManager();

      // 잘못된 경로로 프로젝트 생성 시도
      await expect(
        projectManager.createProject({
          name: 'Invalid Project',
          path: '/invalid/path/that/does/not/exist',
          description: 'Should fail'
        })
      ).rejects.toThrow();

      // 시스템은 여전히 정상 작동해야 함
      const status = await server.getSystemStatus();
      expect(status.server.isRunning).toBe(true);
    });

    it('컴포넌트 실패 시 격리되어야 함', async () => {
      // 잘못된 플러그인 로드 시도
      const pluginManager = server.getPluginManager();
      
      try {
        await pluginManager.loadPlugin('/non/existent/plugin');
      } catch (error) {
        // 예상된 오류
      }

      // 다른 컴포넌트는 영향받지 않아야 함
      const metrics = await server.getMetrics();
      expect(metrics).toBeDefined();
    });
  });

  describe('데이터 무결성', () => {
    it('데이터베이스 트랜잭션이 올바르게 작동해야 함', async () => {
      const projectManager = server.getProjectManager();

      // 트랜잭션 테스트를 위한 프로젝트 생성
      const project1 = await projectManager.createProject({
        name: 'Transaction Test 1',
        path: path.join(testProjectPath, 'project1'),
        description: 'Test transaction'
      });

      // 프로젝트 업데이트
      await projectManager.updateProject(project1.id, {
        description: 'Updated description',
        tags: ['test', 'transaction']
      });

      // 업데이트 확인
      const updated = await projectManager.getProject(project1.id);
      expect(updated?.description).toBe('Updated description');
      expect(updated?.tags).toEqual(['test', 'transaction']);
    });
  });
});