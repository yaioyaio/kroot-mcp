#!/usr/bin/env tsx

/**
 * 대시보드 테스트 스크립트
 */

import { TUIDashboard, CLIDashboard } from '../src/dashboard/index.js';
import { eventEngine } from '../src/events/engine.js';
import { EventCategory, EventSeverity } from '../src/events/types/base.js';

console.log('🧪 대시보드 테스트 시작...\n');

// 테스트 이벤트 생성 함수
function generateTestEvents() {
  console.log('📊 테스트 이벤트 생성 중...');
  
  const events = [
    {
      type: 'file:created',
      category: EventCategory.FILE,
      severity: EventSeverity.INFO,
      data: { path: '/test/file1.ts', size: 1024 }
    },
    {
      type: 'git:commit',
      category: EventCategory.GIT,
      severity: EventSeverity.INFO,
      data: { message: 'feat: add dashboard', author: 'developer' }
    },
    {
      type: 'process:started',
      category: EventCategory.PROCESS,
      severity: EventSeverity.INFO,
      data: { pid: 12345, command: 'npm run build' }
    },
    {
      type: 'stage:transition',
      category: EventCategory.STAGE,
      severity: EventSeverity.INFO,
      data: { from: 'planning', to: 'coding' }
    },
    {
      type: 'ai:suggestion',
      category: EventCategory.AI,
      severity: EventSeverity.INFO,
      data: { tool: 'claude', type: 'code_completion' }
    },
    {
      type: 'api:error',
      category: EventCategory.API,
      severity: EventSeverity.ERROR,
      data: { endpoint: '/api/test', statusCode: 500 }
    }
  ];

  // 이벤트 발생 시뮬레이션
  events.forEach((eventData, index) => {
    setTimeout(() => {
      eventEngine.emit(eventData.type, {
        id: `test-${Date.now()}-${index}`,
        type: eventData.type,
        category: eventData.category,
        severity: eventData.severity,
        timestamp: Date.now(),
        source: 'test-script',
        data: eventData.data
      });
    }, index * 500); // 0.5초 간격으로 이벤트 발생
  });

  console.log(`✅ ${events.length}개 테스트 이벤트 예약됨\n`);
}

// CLI 대시보드 테스트
async function testCLIDashboard() {
  console.log('🖥️  CLI 대시보드 테스트...');
  
  const dashboard = new CLIDashboard({
    refreshInterval: 2000,
    maxEvents: 20,
    compact: false
  });

  console.log('CLI 대시보드 시작 (10초 후 자동 종료)');
  dashboard.start();

  // 10초 후 종료
  setTimeout(() => {
    dashboard.stop();
    dashboard.showSummary();
    console.log('✅ CLI 대시보드 테스트 완료\n');
    
    // TUI 테스트 시작
    testTUIDashboard();
  }, 10000);
}

// TUI 대시보드 테스트
function testTUIDashboard() {
  console.log('🎨 TUI 대시보드 테스트...');
  console.log('TUI 대시보드 시작 (q나 ESC로 종료)');
  
  const dashboard = new TUIDashboard({
    title: 'DevFlow Monitor Test Dashboard',
    refreshInterval: 1000,
    maxEvents: 50
  });

  dashboard.start();
  
  console.log('💡 TUI 대시보드 키보드 단축키:');
  console.log('  - r: 새로고침');
  console.log('  - c: 활동 기록 지우기');
  console.log('  - h: 도움말');
  console.log('  - q/ESC: 종료');
}

// 대시보드 기능 테스트
function testDashboardFunctions() {
  console.log('⚙️  대시보드 기능 테스트...');
  
  // EventEngine 통계 테스트
  const stats = eventEngine.getStats();
  console.log('📊 EventEngine 통계:', {
    totalEvents: stats.totalEvents,
    subscriberCount: stats.subscriberCount,
    eventsPerHour: stats.eventsPerHour
  });
  
  // 큐 통계 테스트
  const queueStats = eventEngine.getQueueStats();
  if (queueStats) {
    console.log('🗃️  큐 통계:', Object.fromEntries(queueStats));
  }
  
  console.log('✅ 기능 테스트 완료\n');
}

// 메인 테스트 실행
async function main() {
  try {
    // 기본 기능 테스트
    testDashboardFunctions();
    
    // 테스트 이벤트 생성
    generateTestEvents();
    
    // 잠시 대기 후 CLI 테스트 시작
    setTimeout(() => {
      testCLIDashboard();
    }, 2000);
    
  } catch (error) {
    console.error('❌ 테스트 실행 중 오류:', error);
    process.exit(1);
  }
}

// 프로그램 시작
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}