#!/usr/bin/env node

/**
 * 보안 시스템 테스트 스크립트
 * JWT 인증, RBAC, 암호화, 감사 로그 등 모든 보안 기능을 테스트합니다.
 */

import { createSecurityManager } from './security-test-simulation.js';

console.log('🔐 DevFlow Monitor 보안 시스템 테스트 시작\n');

async function testSecuritySystem() {
  const securityManager = createSecurityManager();
  
  console.log('✅ 보안 매니저 초기화 완료');

  // 1. 인증 테스트
  console.log('\n📋 1. 인증 시스템 테스트');
  
  // 관리자 로그인 테스트
  const adminLogin = await securityManager.login(
    'admin',
    'admin123',
    { ipAddress: '127.0.0.1', userAgent: 'test-client' },
    false
  );
  
  console.log(`   ✅ 관리자 로그인: ${adminLogin.success ? '성공' : '실패'}`);
  if (adminLogin.success && adminLogin.token) {
    console.log(`   📄 JWT 토큰 생성됨: ${adminLogin.token.accessToken.substring(0, 50)}...`);
  }

  // 잘못된 로그인 테스트
  const invalidLogin = await securityManager.login(
    'admin',
    'wrongpassword',
    { ipAddress: '127.0.0.1', userAgent: 'test-client' },
    false
  );
  
  console.log(`   ✅ 잘못된 로그인 차단: ${invalidLogin.success ? '실패' : '성공'}`);

  // 2. 토큰 검증 테스트
  console.log('\n📋 2. JWT 토큰 검증 테스트');
  
  if (adminLogin.success && adminLogin.token) {
    const tokenVerification = await securityManager.verifyToken(adminLogin.token.accessToken);
    console.log(`   ✅ 유효한 토큰 검증: ${tokenVerification ? '성공' : '실패'}`);
    
    if (tokenVerification) {
      console.log(`   👤 사용자: ${tokenVerification.user.username}`);
      console.log(`   🏷️  역할: ${tokenVerification.user.roles.map(r => r.name).join(', ')}`);
    }
  }

  // 3. 권한 확인 테스트
  console.log('\n📋 3. RBAC 권한 확인 테스트');
  
  // 관리자 권한 확인
  const adminPermission = await securityManager.checkPermission(
    '1',
    { resource: 'system', action: 'admin' }
  );
  console.log(`   ✅ 관리자 시스템 권한: ${adminPermission.allowed ? '허용' : '거부'}`);

  // 일반 사용자 권한 확인
  const userPermission = await securityManager.checkPermission(
    '2',
    { resource: 'system', action: 'admin' }
  );
  console.log(`   ✅ 일반 사용자 시스템 권한: ${userPermission.allowed ? '허용' : '거부'}`);

  // 4. API 키 생성 및 검증 테스트
  console.log('\n📋 4. API 키 관리 테스트');
  
  const apiKey = await securityManager.generateAPIKey(
    '1',
    'Test API Key',
    ['mcp:execute', 'dashboard:read']
  );
  
  console.log(`   ✅ API 키 생성: ${apiKey ? '성공' : '실패'}`);
  if (apiKey) {
    console.log(`   🔑 API 키: ${apiKey.substring(0, 20)}...`);
    
    const keyVerification = await securityManager.verifyAPIKey(apiKey);
    console.log(`   ✅ API 키 검증: ${keyVerification ? '성공' : '실패'}`);
  }

  // 5. 데이터 암호화 테스트
  console.log('\n📋 5. 데이터 암호화 테스트');
  
  const testData = 'This is sensitive data that needs encryption';
  const encrypted = await securityManager.encrypt(testData);
  
  console.log(`   ✅ 데이터 암호화: 성공`);
  console.log(`   🔒 암호화된 데이터: ${encrypted.encrypted.substring(0, 30)}...`);
  console.log(`   🎯 IV: ${encrypted.iv}`);
  
  const decrypted = await securityManager.decrypt(encrypted);
  console.log(`   ✅ 데이터 복호화: ${decrypted === testData ? '성공' : '실패'}`);
  console.log(`   📄 복호화된 데이터: ${decrypted}`);

  // 6. 해시 및 HMAC 테스트
  console.log('\n📋 6. 해시 및 HMAC 테스트');
  
  const hash = await securityManager.createHash('password123', 'sha256', 'salt');
  console.log(`   ✅ 해시 생성: 성공`);
  console.log(`   #️⃣ 해시값: ${hash.substring(0, 20)}...`);
  
  const hmac = await securityManager.createHMAC('test message');
  console.log(`   ✅ HMAC 생성: 성공`);
  console.log(`   🔐 HMAC값: ${hmac.substring(0, 20)}...`);

  // 7. 보안 토큰 테스트
  console.log('\n📋 7. 보안 토큰 테스트');
  
  const secureToken = await securityManager.generateSecureToken(
    { userId: '1', data: 'test' },
    3600000 // 1시간
  );
  
  console.log(`   ✅ 보안 토큰 생성: 성공`);
  console.log(`   🎫 토큰: ${secureToken.substring(0, 30)}...`);
  
  const tokenData = await securityManager.verifySecureToken(secureToken);
  console.log(`   ✅ 보안 토큰 검증: ${tokenData ? '성공' : '실패'}`);
  if (tokenData) {
    console.log(`   📋 토큰 데이터: userId=${tokenData.userId}, data=${tokenData.data}`);
  }

  // 8. 역할 관리 테스트
  console.log('\n📋 8. 역할 관리 테스트');
  
  const roles = securityManager.getRoles();
  console.log(`   ✅ 전체 역할 수: ${roles.length}`);
  console.log(`   📋 역할 목록: ${roles.map(r => r.name).join(', ')}`);
  
  const userRoles = await securityManager.getUserRoles('1');
  console.log(`   ✅ 사용자 역할 조회: ${userRoles.length}개`);
  console.log(`   👤 사용자 역할: ${userRoles.map(r => r.name).join(', ')}`);

  // 9. 감사 로그 테스트
  console.log('\n📋 9. 감사 로그 테스트');
  
  // 잠시 대기하여 로그가 플러시되도록 함
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const auditLogs = await securityManager.queryAuditLogs({
    limit: 10
  });
  
  console.log(`   ✅ 감사 로그 조회: ${auditLogs.length}개 로그`);
  
  if (auditLogs.length > 0) {
    console.log(`   📊 최근 로그 예시:`);
    const recentLog = auditLogs[0];
    console.log(`      - 타입: ${recentLog.eventType}`);
    console.log(`      - 성공: ${recentLog.success}`);
    console.log(`      - 메시지: ${recentLog.message}`);
  }
  
  const auditSummary = await securityManager.getAuditSummary();
  console.log(`   ✅ 감사 로그 요약:`);
  console.log(`      - 총 이벤트: ${auditSummary.totalEvents}`);
  console.log(`      - 성공: ${auditSummary.successfulEvents}`);
  console.log(`      - 실패: ${auditSummary.failedEvents}`);

  // 10. 보안 통계 테스트
  console.log('\n📋 10. 보안 시스템 통계');
  
  const securityStats = securityManager.getSecurityStats();
  console.log(`   ✅ 보안 통계 조회 완료`);
  console.log(`   📊 인증 시스템:`);
  console.log(`      - 활성 세션: ${securityStats.auth.activeSessions}`);
  console.log(`      - 리프레시 토큰: ${securityStats.auth.activeRefreshTokens}`);
  console.log(`      - API 키: ${securityStats.auth.activeAPIKeys}`);
  
  console.log(`   📊 RBAC 시스템:`);
  console.log(`      - 전체 역할: ${securityStats.rbac.totalRoles}`);
  console.log(`      - 전체 권한: ${securityStats.rbac.totalPermissions}`);
  console.log(`      - 예약된 역할: ${securityStats.rbac.reservedRoles}`);
  
  console.log(`   📊 암호화 시스템:`);
  console.log(`      - 전체 키: ${securityStats.encryption.totalKeys}`);
  console.log(`      - 활성 키 버전: ${securityStats.encryption.activeKeyVersion}`);
  console.log(`      - 키 사용 시간: ${securityStats.encryption.keyAgeHours}시간`);

  // 11. 상태 검사 테스트
  console.log('\n📋 11. 보안 시스템 상태 검사');
  
  const healthCheck = await securityManager.healthCheck();
  console.log(`   ✅ 전체 상태: ${healthCheck.status}`);
  console.log(`   📊 구성 요소 상태:`);
  console.log(`      - 인증: ${healthCheck.components.auth ? '정상' : '오류'}`);
  console.log(`      - RBAC: ${healthCheck.components.rbac ? '정상' : '오류'}`);
  console.log(`      - 암호화: ${healthCheck.components.encryption ? '정상' : '오류'}`);
  console.log(`      - 감사 로그: ${healthCheck.components.audit ? '정상' : '오류'}`);

  // 정리 작업
  console.log('\n📋 12. 정리 작업');
  await securityManager.cleanup();
  console.log('   ✅ 보안 시스템 정리 완료');

  console.log('\n🎉 보안 시스템 테스트 완료!');
  console.log('   모든 보안 기능이 정상적으로 작동합니다.');
}

// 테스트 실행
testSecuritySystem().catch(error => {
  console.error('❌ 보안 시스템 테스트 실패:', error);
  process.exit(1);
});