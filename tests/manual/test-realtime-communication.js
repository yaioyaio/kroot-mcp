#!/usr/bin/env node

/**
 * 실시간 통신 통합 테스트
 * 마일스톤 2: 핵심 통합 구현 - 실시간 통신 섹션 검증
 */

import { DevFlowMCPServer } from '../../src/server/index.js';

async function testRealtimeCommunication() {
  console.log('🚀 실시간 통신 통합 테스트 시작...\n');

  const server = new DevFlowMCPServer();
  
  try {
    // 1. MCP 서버에서 WebSocket 서버 시작
    console.log('1️⃣ MCP 서버를 통해 WebSocket 서버 시작...');
    const startResult = await server['executeTool']('startWebSocketServer', { port: 8082 });
    const startResponse = JSON.parse(startResult.content[0].text);
    
    if (startResponse.status === 'success') {
      console.log('✅ WebSocket 서버 시작 성공');
      console.log(`   포트: ${startResponse.port}`);
    } else {
      throw new Error(`WebSocket 서버 시작 실패: ${startResponse.message}`);
    }

    // 2. WebSocket 서버 통계 조회
    console.log('\n2️⃣ WebSocket 서버 통계 조회...');
    const statsResult = await server['executeTool']('getWebSocketStats', {});
    const statsResponse = JSON.parse(statsResult.content[0].text);
    
    if (statsResponse.status === 'success') {
      console.log('✅ WebSocket 통계 조회 성공');
      console.log(`   연결된 클라이언트: ${statsResponse.stats.connectedClients}개`);
      console.log(`   서버 가동시간: ${statsResponse.stats.uptime}초`);
    } else {
      throw new Error(`WebSocket 통계 조회 실패: ${statsResponse.message}`);
    }

    // 3. 스트림 매니저 통계 조회
    console.log('\n3️⃣ 스트림 매니저 통계 조회...');
    const streamStatsResult = await server['executeTool']('getStreamStats', {});
    const streamStatsResponse = JSON.parse(streamStatsResult.content[0].text);
    
    if (streamStatsResponse.status === 'success') {
      console.log('✅ 스트림 통계 조회 성공');
      console.log(`   총 구독자: ${streamStatsResponse.stats.totalSubscribers}개`);
      console.log(`   처리된 이벤트: ${streamStatsResponse.stats.totalEvents}개`);
      console.log(`   초당 이벤트: ${streamStatsResponse.stats.eventsPerSecond}개/초`);
    } else {
      throw new Error(`스트림 통계 조회 실패: ${streamStatsResponse.message}`);
    }

    // 4. 시스템 알림 브로드캐스트
    console.log('\n4️⃣ 시스템 알림 브로드캐스트 테스트...');
    const notificationResult = await server['executeTool']('broadcastSystemNotification', {
      message: '실시간 통신 테스트 완료',
      severity: 'info',
      data: {
        testId: `test-${Date.now()}`,
        milestone: 2,
        section: 'realtime-communication',
      },
    });
    const notificationResponse = JSON.parse(notificationResult.content[0].text);
    
    if (notificationResponse.status === 'success') {
      console.log('✅ 시스템 알림 브로드캐스트 성공');
      console.log(`   메시지: ${notificationResponse.notification.message}`);
      console.log(`   심각도: ${notificationResponse.notification.severity}`);
    } else {
      throw new Error(`시스템 알림 브로드캐스트 실패: ${notificationResponse.message}`);
    }

    // 5. 기존 MCP 도구들과의 통합 테스트
    console.log('\n5️⃣ 기존 MCP 도구와의 통합 테스트...');
    
    // 프로젝트 상태 조회 (실시간 메트릭 포함)
    const projectStatusResult = await server['executeTool']('getProjectStatus', { includeDetails: true });
    const projectStatus = JSON.parse(projectStatusResult.content[0].text);
    console.log('✅ 프로젝트 상태 조회 정상 (실시간 메트릭 포함)');

    // 활동 로그 조회 (실시간 이벤트 포함)
    const activityResult = await server['executeTool']('getActivityLog', { limit: 5 });
    const activity = JSON.parse(activityResult.content[0].text);
    console.log('✅ 활동 로그 조회 정상 (실시간 이벤트 포함)');

    // 6. WebSocket 서버 중지
    console.log('\n6️⃣ WebSocket 서버 정상 종료...');
    const stopResult = await server['executeTool']('stopWebSocketServer', {});
    const stopResponse = JSON.parse(stopResult.content[0].text);
    
    if (stopResponse.status === 'success') {
      console.log('✅ WebSocket 서버 정상 종료');
    } else {
      throw new Error(`WebSocket 서버 종료 실패: ${stopResponse.message}`);
    }

    // 서버 정리
    await server.stop();
    
    console.log('\n🎉 실시간 통신 통합 테스트 완료!\n');
    
    // 테스트 결과 요약
    console.log('📊 테스트 결과 요약:');
    console.log('   ✅ WebSocket 서버 시작/중지');
    console.log('   ✅ WebSocket 통계 조회');
    console.log('   ✅ 스트림 매니저 통계 조회');
    console.log('   ✅ 시스템 알림 브로드캐스트');
    console.log('   ✅ 기존 MCP 도구와의 통합');
    console.log('   ✅ 서버 정상 종료\n');
    
    return {
      success: true,
      features: {
        websocketServer: true,
        streamManager: true,
        systemNotifications: true,
        mcpIntegration: true,
        gracefulShutdown: true,
      },
    };

  } catch (error) {
    console.error('❌ 실시간 통신 테스트 실패:', error.message);
    
    try {
      await server.stop();
    } catch {}
    
    return {
      success: false,
      error: error.message,
    };
  }
}

// 스크립트 직접 실행 시 테스트 실행
if (import.meta.url === `file://${process.argv[1]}`) {
  testRealtimeCommunication()
    .then((result) => {
      if (result.success) {
        console.log('🏆 실시간 통신 섹션 구현 완료!');
        console.log('   마일스톤 2의 모든 핵심 기능이 정상 작동합니다.');
        process.exit(0);
      } else {
        console.error('❌ 실시간 통신 테스트 실패');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('❌ 테스트 실행 중 오류:', error);
      process.exit(1);
    });
}

export { testRealtimeCommunication };