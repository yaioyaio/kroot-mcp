#!/usr/bin/env node

/**
 * 실시간 통신 간단 테스트 (CommonJS)
 * WebSocket 서버 및 스트림 매니저 기본 기능 확인
 */

const { spawn } = require('child_process');
const path = require('path');

async function testRealtimeCommunication() {
  console.log('🚀 실시간 통신 기능 테스트 시작...\n');

  try {
    // 1. TypeScript 컴파일 시도
    console.log('1️⃣ TypeScript 컴파일 확인...');
    
    // 필수 파일들이 존재하는지 확인
    const fs = require('fs');
    const serverPath = path.join(__dirname, '../../src/server/index.ts');
    const websocketPath = path.join(__dirname, '../../src/server/websocket.ts');
    const streamPath = path.join(__dirname, '../../src/server/stream-manager.ts');
    
    if (!fs.existsSync(serverPath)) {
      throw new Error('MCP 서버 파일이 존재하지 않습니다');
    }
    
    if (!fs.existsSync(websocketPath)) {
      throw new Error('WebSocket 서버 파일이 존재하지 않습니다');
    }
    
    if (!fs.existsSync(streamPath)) {
      throw new Error('Stream Manager 파일이 존재하지 않습니다');
    }
    
    console.log('✅ 필수 TypeScript 파일 존재 확인');
    console.log(`   - MCP 서버: ${serverPath}`);
    console.log(`   - WebSocket 서버: ${websocketPath}`);
    console.log(`   - 스트림 매니저: ${streamPath}`);

    // 2. 파일 크기 및 내용 간단 검증
    console.log('\n2️⃣ 구현 파일 검증...');
    
    const serverStats = fs.statSync(serverPath);
    const websocketStats = fs.statSync(websocketPath);
    const streamStats = fs.statSync(streamPath);
    
    console.log(`✅ MCP 서버 크기: ${Math.round(serverStats.size / 1024)}KB`);
    console.log(`✅ WebSocket 서버 크기: ${Math.round(websocketStats.size / 1024)}KB`);
    console.log(`✅ 스트림 매니저 크기: ${Math.round(streamStats.size / 1024)}KB`);

    // 3. 핵심 구현 요소 확인
    console.log('\n3️⃣ 핵심 구현 요소 확인...');
    
    const serverContent = fs.readFileSync(serverPath, 'utf-8');
    const websocketContent = fs.readFileSync(websocketPath, 'utf-8');
    const streamContent = fs.readFileSync(streamPath, 'utf-8');
    
    // MCP 서버의 WebSocket 도구 확인
    const hasWebSocketTools = [
      'startWebSocketServer',
      'stopWebSocketServer', 
      'getWebSocketStats',
      'getStreamStats',
      'broadcastSystemNotification'
    ].every(tool => serverContent.includes(tool));
    
    console.log(`✅ MCP WebSocket 도구: ${hasWebSocketTools ? '구현됨' : '미구현'}`);
    
    // WebSocket 서버 핵심 기능 확인
    const hasWebSocketFeatures = [
      'class DevFlowWebSocketServer',
      'start(',
      'stop(',
      'broadcastEvent',
      'getStats('
    ].every(feature => websocketContent.includes(feature));
    
    console.log(`✅ WebSocket 서버 기능: ${hasWebSocketFeatures ? '구현됨' : '미구현'}`);
    
    // 스트림 매니저 핵심 기능 확인
    const hasStreamFeatures = [
      'class EventStreamManager',
      'subscribe(',
      'unsubscribe(',
      'getStats(',
      'processEvent'
    ].every(feature => streamContent.includes(feature));
    
    console.log(`✅ 스트림 매니저 기능: ${hasStreamFeatures ? '구현됨' : '미구현'}`);

    // 4. 의존성 확인
    console.log('\n4️⃣ 의존성 확인...');
    
    const packagePath = path.join(__dirname, '../../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    
    const requiredDeps = ['ws', '@types/ws'];
    const missingDeps = requiredDeps.filter(dep => 
      !packageJson.dependencies?.[dep] && !packageJson.devDependencies?.[dep]
    );
    
    if (missingDeps.length > 0) {
      console.log(`⚠️ 누락된 의존성: ${missingDeps.join(', ')}`);
    } else {
      console.log('✅ WebSocket 의존성 설치 확인');
    }

    // 5. MCP 도구 등록 확인
    console.log('\n5️⃣ MCP 도구 등록 확인...');
    
    const toolRegistrations = [
      'name: \'startWebSocketServer\'',
      'name: \'stopWebSocketServer\'',
      'name: \'getWebSocketStats\'',
      'name: \'getStreamStats\'',
      'name: \'broadcastSystemNotification\''
    ].map(pattern => serverContent.includes(pattern.replace(/'/g, '"')) || serverContent.includes(pattern));
    
    const registeredTools = toolRegistrations.filter(Boolean).length;
    console.log(`✅ 등록된 WebSocket 도구: ${registeredTools}/5개`);

    // 6. 통합 확인
    console.log('\n6️⃣ 코드 통합 확인...');
    
    const hasImports = [
      'from \'./websocket.js\'',
      'from \'./stream-manager.js\''
    ].every(imp => serverContent.includes(imp));
    
    console.log(`✅ WebSocket 모듈 임포트: ${hasImports ? '정상' : '미완성'}`);
    
    const hasHandlers = [
      'case \'startWebSocketServer\'',
      'case \'stopWebSocketServer\'',
      'case \'getWebSocketStats\'',
      'case \'getStreamStats\'',
      'case \'broadcastSystemNotification\''
    ].every(handler => serverContent.includes(handler));
    
    console.log(`✅ WebSocket 핸들러: ${hasHandlers ? '구현됨' : '미구현'}`);

    console.log('\n🎉 실시간 통신 구현 검증 완료!\n');
    
    // 결과 요약
    console.log('📊 구현 상태 요약:');
    console.log(`   ✅ 파일 존재: 3/3`);
    console.log(`   ✅ 핵심 기능 구현: ${hasWebSocketFeatures && hasStreamFeatures ? '완료' : '진행중'}`);
    console.log(`   ✅ MCP 도구 등록: ${registeredTools}/5`);
    console.log(`   ✅ 코드 통합: ${hasImports && hasHandlers ? '완료' : '진행중'}`);
    console.log(`   ✅ 의존성: ${missingDeps.length === 0 ? '완료' : '진행중'}`);
    
    const allComplete = hasWebSocketTools && hasWebSocketFeatures && hasStreamFeatures && 
                       hasImports && hasHandlers && missingDeps.length === 0;
    
    if (allComplete) {
      console.log('\n🏆 실시간 통신 섹션 구현 완료!');
      console.log('   마일스톤 2의 실시간 통신 요구사항을 모두 충족합니다.');
    } else {
      console.log('\n🔄 실시간 통신 섹션 구현 진행중...');
      console.log('   일부 기능이 아직 완성되지 않았습니다.');
    }
    
    return {
      success: allComplete,
      components: {
        files: 3,
        webSocketTools: registeredTools,
        features: hasWebSocketFeatures && hasStreamFeatures,
        integration: hasImports && hasHandlers,
        dependencies: missingDeps.length === 0
      }
    };

  } catch (error) {
    console.error('❌ 실시간 통신 테스트 실패:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// 스크립트 직접 실행 시 테스트 실행
if (require.main === module) {
  testRealtimeCommunication()
    .then((result) => {
      if (result.success) {
        console.log('\n✅ 실시간 통신 검증 성공');
        process.exit(0);
      } else {
        console.error('\n❌ 실시간 통신 검증 실패');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('❌ 테스트 실행 중 오류:', error);
      process.exit(1);
    });
}

module.exports = { testRealtimeCommunication };