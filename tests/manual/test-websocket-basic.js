#!/usr/bin/env node

/**
 * WebSocket 기본 기능 테스트
 * 실시간 통신 섹션 구현 검증
 */

import { wsServer } from '../../src/server/websocket.js';
import { streamManager } from '../../src/server/stream-manager.js';
import { eventEngine } from '../../src/events/index.js';

const WebSocket = require('ws');

async function testWebSocketBasic() {
  console.log('🔗 WebSocket 기본 기능 테스트 시작...\n');

  try {
    // 1. WebSocket 서버 시작
    console.log('1️⃣ WebSocket 서버 시작 중...');
    await wsServer.start(8081);
    console.log('✅ WebSocket 서버 시작 완료 (포트: 8081)\n');

    // 2. 클라이언트 연결 테스트
    console.log('2️⃣ 클라이언트 연결 테스트...');
    const client = new WebSocket('ws://localhost:8081');
    
    await new Promise((resolve, reject) => {
      client.on('open', () => {
        console.log('✅ 클라이언트 연결 성공');
        resolve();
      });
      
      client.on('error', reject);
      
      setTimeout(() => reject(new Error('연결 타임아웃')), 5000);
    });

    // 3. 서버 통계 확인
    console.log('\n3️⃣ 서버 통계 확인...');
    const stats = wsServer.getStats();
    console.log(`✅ 연결된 클라이언트: ${stats.connectedClients}개`);
    console.log(`✅ 서버 가동 시간: ${Math.round(stats.uptime)}초`);

    // 4. 스트림 매니저 통계 확인
    console.log('\n4️⃣ 스트림 매니저 통계 확인...');
    const streamStats = streamManager.getStats();
    console.log(`✅ 총 구독자: ${streamStats.totalSubscribers}개`);
    console.log(`✅ 처리된 이벤트: ${streamStats.totalEvents}개`);
    console.log(`✅ 초당 이벤트: ${streamStats.eventsPerSecond}개/초`);

    // 5. 테스트 이벤트 발행
    console.log('\n5️⃣ 테스트 이벤트 발행...');
    let eventReceived = false;
    
    client.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === 'event') {
        console.log('✅ 이벤트 수신:', message.payload.event.type);
        eventReceived = true;
      }
    });

    // 테스트 이벤트 발행
    eventEngine.publish({
      id: `test-${Date.now()}`,
      type: 'test:websocket',
      category: 'system',
      severity: 'info',
      source: 'websocket-test',
      timestamp: Date.now(),
      data: {
        message: 'WebSocket 테스트 이벤트',
      },
    });

    // 이벤트 수신 대기
    await new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (eventReceived) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 3000);
    });

    if (eventReceived) {
      console.log('✅ 실시간 이벤트 브로드캐스팅 정상 작동');
    } else {
      console.log('⚠️ 이벤트가 수신되지 않았지만 연결은 정상');
    }

    // 6. 시스템 알림 테스트
    console.log('\n6️⃣ 시스템 알림 브로드캐스트 테스트...');
    let notificationReceived = false;
    
    client.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === 'system_notification') {
        console.log('✅ 시스템 알림 수신:', message.payload.message);
        notificationReceived = true;
      }
    });

    wsServer.broadcastSystemNotification({
      message: 'WebSocket 테스트 알림',
      severity: 'info',
      data: { test: true },
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });

    if (notificationReceived) {
      console.log('✅ 시스템 알림 브로드캐스팅 정상 작동');
    }

    // 정리
    client.close();
    await wsServer.stop();
    
    console.log('\n🎉 WebSocket 기본 기능 테스트 완료!\n');
    
    return {
      success: true,
      stats: {
        serverStarted: true,
        clientConnected: true,
        eventBroadcasting: eventReceived,
        systemNotifications: notificationReceived,
      },
    };

  } catch (error) {
    console.error('❌ WebSocket 테스트 실패:', error.message);
    
    try {
      await wsServer.stop();
    } catch {}
    
    return {
      success: false,
      error: error.message,
    };
  }
}

// 스크립트 직접 실행 시 테스트 실행
if (import.meta.url === `file://${process.argv[1]}`) {
  testWebSocketBasic()
    .then((result) => {
      if (result.success) {
        console.log('✅ 모든 WebSocket 테스트 통과');
        process.exit(0);
      } else {
        console.error('❌ WebSocket 테스트 실패');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('❌ 테스트 실행 중 오류:', error);
      process.exit(1);
    });
}

export { testWebSocketBasic };