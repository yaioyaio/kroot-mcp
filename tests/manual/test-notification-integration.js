#!/usr/bin/env node

/**
 * 알림 시스템 전체 통합 테스트
 * 이벤트 엔진, 메트릭, 병목 감지와의 통합을 테스트합니다.
 */

import { 
  notificationEngine,
  dashboardNotifier,
  NotificationChannel,
} from '../../dist/notifications/index.js';
import { eventEngine } from '../../dist/events/engine.js';
import { EventCategory, EventSeverity } from '../../dist/events/types/base.js';
import { metricsCollector } from '../../dist/analyzers/metrics-collector.js';
import { bottleneckDetector } from '../../dist/analyzers/bottleneck-detector.js';

console.log('🧪 Testing Notification System Integration\n');

// 알림 이벤트 카운터
let notificationCount = 0;
dashboardNotifier.on('notification', () => {
  notificationCount++;
});

// 시스템 초기화
function initializeSystems() {
  console.log('🔧 Initializing systems...');
  
  // Notifier 등록
  notificationEngine.registerNotifier(NotificationChannel.DASHBOARD, dashboardNotifier);
  
  // 채널 설정
  notificationEngine.configureChannel({
    channel: NotificationChannel.DASHBOARD,
    enabled: true,
    config: {},
  });

  // 시스템 시작
  metricsCollector.start();
  bottleneckDetector.start();
  notificationEngine.start();
  
  console.log('✅ All systems initialized\n');
}

// 테스트 실행
async function runIntegrationTest() {
  initializeSystems();

  console.log('1️⃣ Testing Event-based Notifications');
  // 심각한 오류 이벤트 발생
  eventEngine.emit('error:critical', {
    id: 'err-001',
    timestamp: Date.now(),
    type: 'error:critical',
    category: EventCategory.SYSTEM,
    severity: EventSeverity.ERROR,
    source: 'test',
    data: {
      error: 'Database connection failed',
      retries: 3,
    }
  });
  console.log('   - Critical error event emitted');

  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n2️⃣ Testing Bottleneck Detection');
  // 병목 현상 시뮬레이션
  bottleneckDetector.emit('bottleneck-detected', {
    id: 'btl-001',
    type: 'process',
    severity: EventSeverity.WARNING,
    title: 'Slow Build Process',
    description: 'Build time increased by 150% in the last hour',
    location: 'build system',
    impact: 80,
    confidence: 0.9,
    frequency: 10,
    detectedAt: new Date(),
    lastOccurred: new Date(),
    suggestedActions: [
      'Review webpack configuration',
      'Check for unnecessary dependencies',
      'Enable build caching',
    ],
  });
  console.log('   - High impact bottleneck detected');

  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n3️⃣ Testing Metric Threshold Alerts');
  // 낮은 생산성 메트릭
  metricsCollector.emit('metrics-updated', {
    productivity: {
      score: 20,
      linesOfCodePerHour: { summary: { current: 10 } },
      commitsPerDay: { summary: { current: 0.5 } },
    },
    timestamp: new Date(),
  });
  console.log('   - Low productivity metrics emitted');

  // 큐 처리를 위해 대기
  console.log('\n⏳ Waiting for notification processing...');
  await new Promise(resolve => setTimeout(resolve, 6000));

  console.log('\n📊 Integration Test Results:');
  const notifications = dashboardNotifier.getNotifications();
  console.log(`Total notifications: ${notifications.length}`);
  console.log(`Notifications received: ${notificationCount}`);
  console.log(`Active rules: ${notificationEngine.getAllRules().length}`);
  
  const stats = notificationEngine.getStats();
  console.log(`\nNotification Stats:`);
  console.log(`- Total: ${stats.total}`);
  console.log(`- Sent: ${stats.sent}`);
  console.log(`- Failed: ${stats.failed}`);
  console.log(`- By Channel:`, stats.byChannel);

  console.log('\n📋 Notifications:');
  notifications.forEach((n, i) => {
    console.log(`\n[${i + 1}] ${n.message.title}`);
    console.log(`    Priority: ${n.message.priority}`);
    console.log(`    Severity: ${n.message.severity}`);
    console.log(`    Content: ${n.message.content.substring(0, 100)}...`);
  });

  // 테스트 성공 여부 확인
  const testPassed = notifications.length >= 2; // 최소 2개 알림 (심각한 오류, 병목 현상)
  
  console.log('\n' + (testPassed ? '✅ Integration test PASSED!' : '❌ Integration test FAILED!'));

  // 정리
  metricsCollector.stop();
  bottleneckDetector.stop();
  notificationEngine.stop();
  
  process.exit(testPassed ? 0 : 1);
}

// 에러 핸들링
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

runIntegrationTest().catch(console.error);