#!/usr/bin/env node

/**
 * 알림 시스템 간단 테스트
 */

import { 
  notificationEngine,
  dashboardNotifier,
  NotificationChannel,
  NotificationPriority,
} from '../../dist/notifications/index.js';
import { EventSeverity } from '../../dist/events/types/base.js';

console.log('🧪 Testing Notification System\n');

// Notifier 등록
notificationEngine.registerNotifier(NotificationChannel.DASHBOARD, dashboardNotifier);
console.log('✅ Dashboard notifier registered');

// 대시보드 채널 설정
notificationEngine.configureChannel({
  channel: NotificationChannel.DASHBOARD,
  enabled: true,
  config: {},
});

// 알림 엔진 시작
notificationEngine.start();
console.log('✅ Notification engine started');

// 테스트 알림 전송
async function testNotifications() {
  console.log('\n📤 Sending test notifications...');
  
  // 정보성 알림
  await notificationEngine.sendNotification(
    'System Started',
    'DevFlow Monitor notification system is now active.',
    {
      severity: EventSeverity.INFO,
      priority: NotificationPriority.LOW,
    }
  );
  console.log('✅ Info notification sent');

  // 경고 알림
  await notificationEngine.sendNotification(
    'Performance Warning',
    'Build time increased by 50% in the last hour.',
    {
      severity: EventSeverity.WARNING,
      priority: NotificationPriority.MEDIUM,
    }
  );
  console.log('✅ Warning notification sent');

  // 오류 알림
  await notificationEngine.sendNotification(
    'Test Failure',
    'Unit tests failed with 5 errors.',
    {
      severity: EventSeverity.ERROR,
      priority: NotificationPriority.HIGH,
    }
  );
  console.log('✅ Error notification sent');

  // 알림 처리를 위해 충분한 시간 대기 (processQueue는 5초마다 실행)
  console.log('\n⏳ Waiting for notifications to be processed...');
  await new Promise(resolve => setTimeout(resolve, 6000));

  // 대시보드 알림 확인
  console.log('\n📊 Dashboard notifications:');
  const notifications = dashboardNotifier.getNotifications();
  console.log(`Total: ${notifications.length}`);
  console.log(`Unread: ${dashboardNotifier.getUnreadCount()}`);

  notifications.forEach((n, i) => {
    console.log(`\n[${i + 1}] ${n.message.title}`);
    console.log(`    ${n.message.content}`);
    console.log(`    Priority: ${n.message.priority}, Read: ${n.read}`);
  });

  // 통계 출력
  console.log('\n📈 Notification stats:');
  const stats = notificationEngine.getStats();
  console.log(JSON.stringify(stats, null, 2));

  // 정리
  notificationEngine.stop();
  console.log('\n✅ Test completed!');
}

testNotifications().catch(console.error);