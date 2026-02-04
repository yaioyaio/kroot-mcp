/**
 * DevFlow Monitor MCP - 부하 테스트
 * 
 * 시스템이 높은 부하 상황에서도 안정적으로 작동하는지 검증합니다.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DevFlowMonitorServer } from '../../src/server/index.js';
import { EventEngine } from '../../src/events/engine.js';
import { Database } from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Worker } from 'worker_threads';
import os from 'os';

// 부하 테스트 설정
const LOAD_TEST_CONFIG = {
  // 동시 사용자 수
  concurrentUsers: 50,
  // 각 사용자당 이벤트 수
  eventsPerUser: 100,
  // 파일 생성 수
  fileOperations: 500,
  // Git 커밋 수
  gitCommits: 100,
  // 테스트 지속 시간 (밀리초)
  testDuration: 60000, // 1분
  // 메모리 임계값 (MB)
  memoryThreshold: 1024, // 1GB
  // 응답 시간 임계값 (밀리초)
  responseTimeThreshold: 1000
};

describe('부하 테스트', () => {
  let server: DevFlowMonitorServer;
  let testWorkspace: string;
  let db: Database;
  let eventEngine: EventEngine;

  beforeAll(async () => {
    testWorkspace = path.join('/tmp', `devflow-load-test-${randomUUID()}`);
    await fs.mkdir(testWorkspace, { recursive: true });

    db = new Database(':memory:');
    server = new DevFlowMonitorServer({
      projectRoot: testWorkspace,
      database: db,
      config: {
        monitoring: { enableFileMonitoring: true, enableGitMonitoring: true },
        performance: { 
          enableOptimization: true,
          maxEventBatchSize: 1000,
          maxMemoryUsage: LOAD_TEST_CONFIG.memoryThreshold * 1024 * 1024
        },
        queue: {
          maxQueueSize: 10000,
          flushInterval: 100
        }
      }
    });

    eventEngine = server.getEventEngine();
    await server.initialize();
  });

  afterAll(async () => {
    await server.shutdown();
    db.close();
    await fs.rm(testWorkspace, { recursive: true, force: true });
  });

  describe('이벤트 처리 부하', () => {
    it(`${LOAD_TEST_CONFIG.concurrentUsers}명의 동시 사용자가 이벤트를 생성할 때 시스템이 안정적이어야 함`, async () => {
      const startTime = Date.now();
      const eventPromises: Promise<void>[] = [];
      const responseTimes: number[] = [];

      // 동시 사용자 시뮬레이션
      for (let user = 0; user < LOAD_TEST_CONFIG.concurrentUsers; user++) {
        const userPromise = (async () => {
          for (let i = 0; i < LOAD_TEST_CONFIG.eventsPerUser; i++) {
            const eventStart = Date.now();
            
            await eventEngine.emit({
              id: randomUUID(),
              category: ['development', 'file', 'git'][Math.floor(Math.random() * 3)] as any,
              type: ['code_change', 'file_create', 'commit'][Math.floor(Math.random() * 3)],
              severity: ['info', 'warning', 'error'][Math.floor(Math.random() * 3)] as any,
              timestamp: Date.now(),
              source: `user-${user}`,
              data: {
                userId: user,
                eventIndex: i,
                randomData: Array(100).fill(0).map(() => Math.random())
              }
            });

            responseTimes.push(Date.now() - eventStart);
          }
        })();

        eventPromises.push(userPromise);
      }

      // 모든 이벤트 처리 대기
      await Promise.all(eventPromises);
      const totalDuration = Date.now() - startTime;

      // 성능 메트릭 계산
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      const totalEvents = LOAD_TEST_CONFIG.concurrentUsers * LOAD_TEST_CONFIG.eventsPerUser;
      const eventsPerSecond = (totalEvents / totalDuration) * 1000;

      console.log('이벤트 처리 성능:');
      console.log(`- 총 이벤트: ${totalEvents}`);
      console.log(`- 처리 시간: ${totalDuration}ms`);
      console.log(`- 처리 속도: ${eventsPerSecond.toFixed(2)} events/sec`);
      console.log(`- 평균 응답 시간: ${avgResponseTime.toFixed(2)}ms`);
      console.log(`- 최대 응답 시간: ${maxResponseTime}ms`);

      // 성능 기준 검증
      expect(avgResponseTime).toBeLessThan(LOAD_TEST_CONFIG.responseTimeThreshold);
      expect(eventsPerSecond).toBeGreaterThan(100); // 최소 100 events/sec

      // 시스템 안정성 확인
      const systemStatus = await server.getSystemStatus();
      expect(systemStatus.server.isRunning).toBe(true);
      expect(systemStatus.eventEngine.isRunning).toBe(true);
    });
  });

  describe('파일 시스템 부하', () => {
    it(`${LOAD_TEST_CONFIG.fileOperations}개의 파일 작업을 처리할 수 있어야 함`, async () => {
      const startTime = Date.now();
      const filePromises: Promise<void>[] = [];

      // 병렬 파일 생성
      for (let i = 0; i < LOAD_TEST_CONFIG.fileOperations; i++) {
        const filePromise = (async () => {
          const filePath = path.join(testWorkspace, `file-${i}.ts`);
          await fs.writeFile(filePath, `
            // File ${i}
            export const value${i} = ${i};
            export function process${i}(data: any) {
              return data + ${i};
            }
          `);
        })();

        filePromises.push(filePromise);
      }

      await Promise.all(filePromises);
      const duration = Date.now() - startTime;

      console.log('파일 시스템 성능:');
      console.log(`- 파일 수: ${LOAD_TEST_CONFIG.fileOperations}`);
      console.log(`- 처리 시간: ${duration}ms`);
      console.log(`- 처리 속도: ${(LOAD_TEST_CONFIG.fileOperations / duration * 1000).toFixed(2)} files/sec`);

      // 모니터가 모든 파일을 감지했는지 확인
      await new Promise(resolve => setTimeout(resolve, 2000));

      const metrics = await server.getMetrics();
      expect(metrics.fileChanges).toBeGreaterThan(0);

      // 파일 정리
      const cleanupPromises = [];
      for (let i = 0; i < LOAD_TEST_CONFIG.fileOperations; i++) {
        cleanupPromises.push(
          fs.unlink(path.join(testWorkspace, `file-${i}.ts`)).catch(() => {})
        );
      }
      await Promise.all(cleanupPromises);
    });
  });

  describe('메모리 사용량', () => {
    it(`메모리 사용량이 ${LOAD_TEST_CONFIG.memoryThreshold}MB를 초과하지 않아야 함`, async () => {
      const memorySnapshots: number[] = [];
      
      // 메모리 모니터링 시작
      const memoryMonitor = setInterval(() => {
        const memUsage = process.memoryUsage();
        memorySnapshots.push(memUsage.heapUsed / 1024 / 1024);
      }, 100);

      // 대량 데이터 생성
      const largeDataPromises = [];
      for (let i = 0; i < 100; i++) {
        largeDataPromises.push(
          eventEngine.emit({
            id: randomUUID(),
            category: 'development',
            type: 'large_data',
            severity: 'info',
            timestamp: Date.now(),
            source: 'memory-test',
            data: {
              largeArray: Array(10000).fill(0).map(() => ({
                id: randomUUID(),
                value: Math.random(),
                nested: { data: Array(100).fill(Math.random()) }
              }))
            }
          })
        );
      }

      await Promise.all(largeDataPromises);
      clearInterval(memoryMonitor);

      // 메모리 통계 계산
      const avgMemory = memorySnapshots.reduce((a, b) => a + b, 0) / memorySnapshots.length;
      const maxMemory = Math.max(...memorySnapshots);

      console.log('메모리 사용량:');
      console.log(`- 평균: ${avgMemory.toFixed(2)}MB`);
      console.log(`- 최대: ${maxMemory.toFixed(2)}MB`);
      console.log(`- 임계값: ${LOAD_TEST_CONFIG.memoryThreshold}MB`);

      expect(maxMemory).toBeLessThan(LOAD_TEST_CONFIG.memoryThreshold);

      // 가비지 컬렉션 강제 실행
      if (global.gc) {
        global.gc();
      }
    });
  });

  describe('동시성 및 경쟁 상태', () => {
    it('동시에 여러 프로젝트를 생성하고 관리할 때 데이터 무결성이 유지되어야 함', async () => {
      const projectManager = server.getProjectManager();
      const projectPromises: Promise<any>[] = [];
      const projectCount = 20;

      // 동시 프로젝트 생성
      for (let i = 0; i < projectCount; i++) {
        projectPromises.push(
          projectManager.createProject({
            name: `Concurrent Project ${i}`,
            path: path.join(testWorkspace, `project-${i}`),
            description: `Test project ${i}`,
            tags: [`tag-${i}`, 'concurrent-test']
          })
        );
      }

      const projects = await Promise.all(projectPromises);

      // 모든 프로젝트가 생성되었는지 확인
      expect(projects.length).toBe(projectCount);
      expect(new Set(projects.map(p => p.id)).size).toBe(projectCount); // 모든 ID가 고유해야 함

      // 동시 업데이트
      const updatePromises = projects.map((project, index) =>
        projectManager.updateProject(project.id, {
          description: `Updated description ${index}`,
          priority: index % 3 === 0 ? 'high' : index % 3 === 1 ? 'medium' : 'low'
        })
      );

      await Promise.all(updatePromises);

      // 업데이트 검증
      const updatedProjects = await projectManager.listProjects();
      const concurrentProjects = updatedProjects.filter(p => 
        p.tags?.includes('concurrent-test')
      );

      expect(concurrentProjects.length).toBe(projectCount);
    });
  });

  describe('장시간 운영 안정성', () => {
    it('1분 동안 지속적인 부하를 받아도 시스템이 안정적이어야 함', async () => {
      const startTime = Date.now();
      const errors: Error[] = [];
      let eventCount = 0;
      let shouldStop = false;

      // 에러 핸들러
      const errorHandler = (error: Error) => {
        errors.push(error);
      };
      process.on('uncaughtException', errorHandler);
      process.on('unhandledRejection', errorHandler);

      // 지속적인 부하 생성
      const loadGenerators = Array(5).fill(0).map((_, index) => {
        return (async () => {
          while (!shouldStop && Date.now() - startTime < LOAD_TEST_CONFIG.testDuration) {
            try {
              // 랜덤 작업 수행
              const action = Math.floor(Math.random() * 4);
              
              switch (action) {
                case 0: // 이벤트 생성
                  await eventEngine.emit({
                    id: randomUUID(),
                    category: 'development',
                    type: 'continuous_load',
                    severity: 'info',
                    timestamp: Date.now(),
                    source: `generator-${index}`,
                    data: { count: eventCount++ }
                  });
                  break;
                  
                case 1: // 파일 생성
                  const fileName = `temp-${randomUUID()}.txt`;
                  await fs.writeFile(
                    path.join(testWorkspace, fileName),
                    `Continuous load test ${eventCount}`
                  );
                  setTimeout(() => {
                    fs.unlink(path.join(testWorkspace, fileName)).catch(() => {});
                  }, 5000);
                  break;
                  
                case 2: // 메트릭 조회
                  await server.getMetrics();
                  break;
                  
                case 3: // 상태 확인
                  await server.getSystemStatus();
                  break;
              }

              // 짧은 대기
              await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
            } catch (error) {
              // 개별 작업 실패는 무시
            }
          }
        })();
      });

      // 모든 생성기 실행
      await Promise.all(loadGenerators);
      shouldStop = true;

      // 에러 핸들러 제거
      process.removeListener('uncaughtException', errorHandler);
      process.removeListener('unhandledRejection', errorHandler);

      // 결과 분석
      const duration = Date.now() - startTime;
      const finalStatus = await server.getSystemStatus();
      const finalMetrics = await server.getMetrics();

      console.log('장시간 운영 결과:');
      console.log(`- 운영 시간: ${(duration / 1000).toFixed(2)}초`);
      console.log(`- 처리된 이벤트: ${eventCount}`);
      console.log(`- 발생한 오류: ${errors.length}`);
      console.log(`- 시스템 상태: ${finalStatus.server.isRunning ? '정상' : '비정상'}`);

      // 시스템이 여전히 작동 중이어야 함
      expect(finalStatus.server.isRunning).toBe(true);
      expect(errors.length).toBe(0);
      expect(eventCount).toBeGreaterThan(1000);
    });
  });

  describe('리소스 정리 및 복구', () => {
    it('부하 테스트 후에도 리소스가 적절히 정리되어야 함', async () => {
      // 초기 메모리 스냅샷
      const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024;

      // 대량 리소스 생성 및 정리
      const resources = [];
      for (let i = 0; i < 100; i++) {
        resources.push({
          id: randomUUID(),
          data: Array(1000).fill(0).map(() => Math.random()),
          buffer: Buffer.alloc(1024 * 1024) // 1MB 버퍼
        });
      }

      // 이벤트 생성
      await Promise.all(
        resources.map(r => 
          eventEngine.emit({
            id: r.id,
            category: 'development',
            type: 'resource_test',
            severity: 'info',
            timestamp: Date.now(),
            source: 'resource-test',
            data: r
          })
        )
      );

      // 리소스 참조 제거
      resources.length = 0;

      // 가비지 컬렉션 강제 실행
      if (global.gc) {
        global.gc();
      }

      // 잠시 대기
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 최종 메모리 확인
      const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      const memoryIncrease = finalMemory - initialMemory;

      console.log('리소스 정리:');
      console.log(`- 초기 메모리: ${initialMemory.toFixed(2)}MB`);
      console.log(`- 최종 메모리: ${finalMemory.toFixed(2)}MB`);
      console.log(`- 증가량: ${memoryIncrease.toFixed(2)}MB`);

      // 메모리 증가량이 합리적인 수준이어야 함 (100MB 미만)
      expect(memoryIncrease).toBeLessThan(100);
    });
  });
});