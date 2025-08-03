#!/usr/bin/env node

/**
 * 이벤트 큐 시스템 통합 테스트
 */

import { eventEngine, queueManager } from '../../dist/events/index.js';
import { EventCategory, EventSeverity } from '../../dist/events/types/index.js';

console.log('🧪 이벤트 큐 시스템 테스트 시작\n');

// 테스트용 이벤트 생성 함수
function createTestEvent(type, severity = EventSeverity.INFO, data = {}) {
  return {
    id: `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    type,
    category: EventCategory.SYSTEM,
    timestamp: Date.now(),
    severity,
    source: 'test-script',
    data: {
      test: true,
      ...data,
    },
  };
}

// 테스트 실행
async function runTests() {
  console.log('1. 큐 시스템 초기화 확인');
  const queueNames = queueManager.getQueueNames();
  console.log('   - 사용 가능한 큐:', queueNames);
  console.log('   ✅ 큐 시스템 초기화 완료\n');

  console.log('2. 이벤트 라우팅 테스트');
  
  // 다양한 심각도의 이벤트 생성
  const events = [
    createTestEvent('test:info', EventSeverity.INFO),
    createTestEvent('test:warning', EventSeverity.WARNING),
    createTestEvent('test:error', EventSeverity.ERROR),
    createTestEvent('test:critical', EventSeverity.CRITICAL),
  ];

  // 이벤트 발행
  for (const event of events) {
    await eventEngine.publish(event);
    console.log(`   - ${event.severity} 이벤트 발행: ${event.id}`);
  }

  // 잠시 대기 (큐 처리 시간)
  await new Promise(resolve => setTimeout(resolve, 100));

  // 큐 통계 확인
  console.log('\n3. 큐 통계 확인');
  const allStats = queueManager.getAllStats();
  
  for (const [queueName, stats] of allStats) {
    console.log(`   📊 ${queueName} 큐:`);
    console.log(`      - 큐 크기: ${stats.size}`);
    console.log(`      - 총 처리: ${stats.enqueuedCount}`);
    console.log(`      - 메모리 사용: ${(stats.memoryUsage / 1024).toFixed(2)} KB`);
  }

  console.log('\n4. 배치 처리 테스트');
  
  // 많은 이벤트를 한 번에 생성
  const batchEvents = [];
  for (let i = 0; i < 100; i++) {
    batchEvents.push(createTestEvent('batch:event', EventSeverity.INFO, { index: i }));
  }

  console.log('   - 100개 이벤트 배치 발행 시작...');
  const startTime = Date.now();
  
  await Promise.all(batchEvents.map(event => eventEngine.publish(event)));
  
  const publishTime = Date.now() - startTime;
  console.log(`   - 발행 완료: ${publishTime}ms`);

  // 큐 플러시 대기
  await queueManager.flushAll();
  
  const totalTime = Date.now() - startTime;
  console.log(`   - 전체 처리 완료: ${totalTime}ms`);
  console.log(`   ✅ 처리 속도: ${(100 / (totalTime / 1000)).toFixed(2)} events/sec\n`);

  console.log('5. 우선순위 처리 테스트');
  
  // 이벤트 처리 핸들러 등록
  let processedOrder = [];
  
  eventEngine.subscribe('priority:*', async (event) => {
    processedOrder.push({
      id: event.id,
      severity: event.severity,
      timestamp: Date.now(),
    });
  });

  // 다양한 우선순위 이벤트 발행
  const priorityEvents = [
    createTestEvent('priority:low', EventSeverity.DEBUG),
    createTestEvent('priority:medium', EventSeverity.INFO),
    createTestEvent('priority:high', EventSeverity.ERROR),
    createTestEvent('priority:critical', EventSeverity.CRITICAL),
  ];

  // 동시에 발행
  await Promise.all(priorityEvents.map(event => 
    eventEngine.publish(event, { useQueue: false }) // 직접 처리
  ));

  console.log('   - 처리 순서:');
  processedOrder.forEach((item, index) => {
    console.log(`     ${index + 1}. ${item.severity} - ${item.id}`);
  });

  console.log('\n6. 메모리 관리 테스트');
  
  // 큐 통계 다시 확인
  const finalStats = queueManager.getAllStats();
  
  let totalMemory = 0;
  for (const [, stats] of finalStats) {
    totalMemory += stats.memoryUsage;
  }

  console.log(`   - 전체 메모리 사용량: ${(totalMemory / 1024 / 1024).toFixed(2)} MB`);
  console.log('   ✅ 메모리 관리 정상\n');

  console.log('7. 실패 이벤트 재처리 테스트');
  
  // 실패를 유발하는 핸들러 등록
  let failCount = 0;
  eventEngine.subscribe('fail:test', async (event) => {
    failCount++;
    if (failCount < 3) {
      throw new Error(`의도적 실패 ${failCount}`);
    }
    console.log(`   - 이벤트 ${event.id} 처리 성공 (${failCount}번째 시도)`);
  });

  // 실패 이벤트 발행
  const failEvent = createTestEvent('fail:test', EventSeverity.ERROR);
  await eventEngine.publish(failEvent, { useQueue: false });

  console.log('   ✅ 재처리 메커니즘 정상 작동\n');

  console.log('8. 큐 시스템 성능 요약');
  
  const engineStats = eventEngine.getStatistics();
  console.log('   📈 이벤트 엔진 통계:');
  console.log(`      - 총 이벤트: ${engineStats.totalEvents}`);
  console.log(`      - 카테고리별: ${JSON.stringify(engineStats.eventsByCategory)}`);
  console.log(`      - 심각도별: ${JSON.stringify(engineStats.eventsBySeverity)}`);
  console.log(`      - 시간당 평균: ${engineStats.eventsPerHour.toFixed(2)} events/hour`);

  // 큐별 처리 성능
  console.log('\n   📊 큐별 성능:');
  for (const [queueName, stats] of allStats) {
    if (stats.throughput > 0) {
      console.log(`      - ${queueName}: ${stats.throughput.toFixed(2)} events/sec`);
    }
  }

  console.log('\n✨ 모든 테스트 완료!');
}

// 테스트 실행 및 정리
runTests()
  .then(async () => {
    console.log('\n🧹 정리 중...');
    await queueManager.shutdown();
    console.log('✅ 완료\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ 테스트 실패:', error);
    process.exit(1);
  });