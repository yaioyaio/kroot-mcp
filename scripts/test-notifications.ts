#!/usr/bin/env node

/**
 * 알림 시스템 테스트 스크립트
 * 알림 엔진, 규칙, 채널 설정을 테스트합니다.
 */

import { 
  notificationEngine,
  slackNotifier,
  dashboardNotifier,
  NotificationChannel,
  NotificationPriority,
  RuleConditionType,
} from '../dist/notifications/index.js';
import { eventEngine } from '../dist/events/engine.js';
import { BaseEvent, EventCategory, EventSeverity } from '../dist/events/types/base.js';

// 알림 엔진 이벤트 리스너
notificationEngine.on('notification-queued', (message) => {
  console.log('📬 Notification queued:', message.title);
});

notificationEngine.on('notification-sent', (message) => {
  console.log('✅ Notification sent:', message.title);
});

notificationEngine.on('notification-failed', (message, error) => {
  console.error('❌ Notification failed:', message.title, error);
});

// 대시보드 알림 리스너
dashboardNotifier.on('notification', (notification) => {
  console.log('🔔 Dashboard notification:', notification.message.title);
});

async function testNotificationSystem() {
  console.log('🧪 Testing DevFlow Monitor Notification System\n');

  // 1. 기본 채널 설정
  console.log('1️⃣ Configuring notification channels...');
  
  // Dashboard 채널 설정 (항상 사용 가능)
  notificationEngine.configureChannel({
    channel: NotificationChannel.DASHBOARD,
    enabled: true,
    config: {},
  });
  console.log('✅ Dashboard channel configured');

  // Slack 채널 설정 (테스트용 - 실제로 전송하지 않음)
  notificationEngine.configureChannel({
    channel: NotificationChannel.SLACK,
    enabled: false, // 테스트에서는 비활성화
    config: {
      webhookUrl: 'https://hooks.slack.com/services/TEST/WEBHOOK/URL',
      channel: '#devflow-monitor',
      username: 'DevFlow Monitor Test',
    },
  });
  console.log('⚠️  Slack channel configured (disabled for testing)');

  // 2. 커스텀 알림 규칙 추가
  console.log('\n2️⃣ Adding custom notification rules...');
  
  const testRule = notificationEngine.addRule({
    name: 'Test High Priority Events',
    description: 'Alert on high priority test events',
    enabled: true,
    conditions: [
      {
        type: RuleConditionType.EVENT_TYPE,
        field: 'event.type',
        operator: 'contains',
        value: 'test',
      },
      {
        type: RuleConditionType.EVENT_SEVERITY,
        field: 'event.severity',
        operator: 'gte',
        value: EventSeverity.WARNING,
        combineWith: 'AND',
      },
    ],
    channels: [NotificationChannel.DASHBOARD],
    priority: NotificationPriority.HIGH,
    throttle: {
      limit: 5,
      window: 60000, // 1분
    },
  });
  console.log('✅ Test rule added:', testRule.id);

  // 3. 알림 엔진 시작
  console.log('\n3️⃣ Starting notification engine...');
  notificationEngine.start();
  console.log('✅ Notification engine started');

  // 4. 즉시 알림 전송 테스트
  console.log('\n4️⃣ Testing direct notifications...');
  
  await notificationEngine.sendNotification(
    'Test Notification',
    'This is a test notification from the DevFlow Monitor.',
    {
      severity: EventSeverity.INFO,
      priority: NotificationPriority.MEDIUM,
      channels: [NotificationChannel.DASHBOARD],
    }
  );

  await notificationEngine.sendNotification(
    'Critical Alert Test',
    'This is a critical alert test message.',
    {
      severity: EventSeverity.ERROR,
      priority: NotificationPriority.HIGH,
      channels: [NotificationChannel.DASHBOARD],
    }
  );

  // 5. 이벤트 기반 알림 테스트
  console.log('\n5️⃣ Testing event-based notifications...');
  
  // 테스트 이벤트 발생
  const testEvent: BaseEvent = {
    id: 'test-001',
    timestamp: Date.now(),
    type: 'test:warning',
    category: EventCategory.TEST,
    severity: EventSeverity.WARNING,
    source: 'test-script',
    data: {
      testCase: 'notification-trigger',
      result: 'warning',
      description: 'Test event that should trigger notification',
    },
  };

  eventEngine.emit('test:warning', testEvent);
  console.log('⚡ Test event emitted');

  // 6. 대시보드 알림 확인
  console.log('\n6️⃣ Checking dashboard notifications...');
  await new Promise(resolve => setTimeout(resolve, 1000)); // 알림 처리 대기

  const notifications = dashboardNotifier.getNotifications();
  console.log(`📊 Total dashboard notifications: ${notifications.length}`);
  console.log(`📌 Unread notifications: ${dashboardNotifier.getUnreadCount()}`);

  // 알림 내용 출력
  notifications.forEach((n, index) => {
    console.log(`\n  [${index + 1}] ${n.message.priority.toUpperCase()} - ${n.message.title}`);
    console.log(`      ${n.message.content}`);
    console.log(`      Severity: ${n.message.severity}, Read: ${n.read}`);
  });

  // 7. 알림 통계
  console.log('\n7️⃣ Notification statistics...');
  const stats = notificationEngine.getStats();
  console.log('📈 Stats:', JSON.stringify(stats, null, 2));

  // 8. 알림 규칙 조회
  console.log('\n8️⃣ Active notification rules...');
  const rules = notificationEngine.getAllRules();
  rules.forEach(rule => {
    console.log(`  - ${rule.name} (${rule.enabled ? 'enabled' : 'disabled'})`);
    console.log(`    Channels: ${rule.channels.join(', ')}`);
    console.log(`    Priority: ${rule.priority}`);
  });

  // 9. 병목 현상 시뮬레이션
  console.log('\n9️⃣ Simulating bottleneck detection...');
  
  // bottleneckDetector에서 이벤트 발생을 시뮬레이션
  notificationEngine.emit('bottleneck-detected', {
    id: 'btl-001',
    type: 'process',
    severity: EventSeverity.WARNING,
    title: 'Slow Build Process',
    description: 'Build time increased by 150% in the last hour',
    impact: 75,
    confidence: 0.85,
    frequency: 5,
    detectedAt: new Date(),
    lastOccurred: new Date(),
    suggestedActions: [
      'Review recent dependency additions',
      'Check for circular dependencies',
      'Consider build cache optimization',
    ],
  });

  // 10. 메트릭 임계값 시뮬레이션
  console.log('\n🔟 Simulating metric threshold alert...');
  
  notificationEngine.emit('metrics-updated', {
    productivity: {
      score: 25, // Low productivity score
    },
  });

  // 최종 대기
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 11. 정리
  console.log('\n🧹 Cleaning up...');
  
  // 알림 읽음 처리
  const unreadNotifications = dashboardNotifier.getNotifications({ unreadOnly: true });
  console.log(`Marking ${unreadNotifications.length} notifications as read...`);
  dashboardNotifier.markAllAsRead();

  // 엔진 중지
  notificationEngine.stop();
  console.log('✅ Notification engine stopped');

  console.log('\n✨ Notification system test completed!');
}

// 에러 핸들링
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

// 테스트 실행
testNotificationSystem().catch(console.error);