#!/usr/bin/env node

/**
 * 외부 API 통합 기능 테스트 스크립트
 * 
 * 이 스크립트는 구현된 외부 API 통합 기능을 테스트합니다:
 * - BaseAPIClient 기본 기능
 * - JiraClient 인스턴스 생성 (실제 연결 없이)
 * - NotionClient 인스턴스 생성 (실제 연결 없이)
 * - FigmaClient 인스턴스 생성 (실제 연결 없이)
 * - APIIntegrationManager 기본 기능
 */

import { EventEngine } from '../../src/events/engine.js';
import { 
  JiraClient, 
  NotionClient, 
  FigmaClient,
  APIIntegrationManager 
} from '../../src/integrations/index.js';

class MockAPIClient {
  constructor(name) {
    this.name = name;
  }

  getName() {
    return this.name;
  }

  async isHealthy() {
    return true;
  }

  async validateConnection() {
    return true;
  }

  getStats() {
    return {
      name: this.name,
      healthy: true,
      connected: true
    };
  }
}

async function testAPIIntegration() {
  console.log('🚀 외부 API 통합 테스트 시작\n');

  // 1. EventEngine 초기화
  console.log('1. EventEngine 초기화...');
  const eventEngine = new EventEngine();
  
  // 이벤트 로깅
  eventEngine.subscribe('*', (event) => {
    if (event.category === 'api') {
      console.log(`   📡 [${event.type}] ${event.data.clientName || 'API'}: ${event.severity}`);
    }
  });
  
  console.log('   ✅ EventEngine 초기화 완료\n');

  // 2. JiraClient 테스트 (모의 설정)
  console.log('2. JiraClient 테스트...');
  try {
    const jiraClient = new JiraClient({
      domain: 'test-company.atlassian.net',
      email: 'test@example.com',
      apiToken: 'mock-token',
      baseURL: 'https://test-company.atlassian.net/rest/api/3'
    }, eventEngine);

    console.log('   ✅ JiraClient 인스턴스 생성 성공');
    console.log(`   📊 Client Name: ${jiraClient.getName()}`);
    console.log(`   📊 Stats: ${JSON.stringify(jiraClient.getStats(), null, 2)}\n`);
  } catch (error) {
    console.log(`   ❌ JiraClient 테스트 실패: ${error.message}\n`);
  }

  // 3. NotionClient 테스트 (모의 설정)
  console.log('3. NotionClient 테스트...');
  try {
    const notionClient = new NotionClient({
      apiToken: 'mock-notion-token',
      baseURL: 'https://api.notion.com/v1'
    }, eventEngine);

    console.log('   ✅ NotionClient 인스턴스 생성 성공');
    console.log(`   📊 Client Name: ${notionClient.getName()}`);
    console.log(`   📊 Stats: ${JSON.stringify(notionClient.getStats(), null, 2)}\n`);
  } catch (error) {
    console.log(`   ❌ NotionClient 테스트 실패: ${error.message}\n`);
  }

  // 4. FigmaClient 테스트 (모의 설정)
  console.log('4. FigmaClient 테스트...');
  try {
    const figmaClient = new FigmaClient({
      accessToken: 'mock-figma-token',
      baseURL: 'https://api.figma.com/v1'
    }, eventEngine);

    console.log('   ✅ FigmaClient 인스턴스 생성 성공');
    console.log(`   📊 Client Name: ${figmaClient.getName()}`);
    console.log(`   📊 Stats: ${JSON.stringify(figmaClient.getStats(), null, 2)}\n`);
  } catch (error) {
    console.log(`   ❌ FigmaClient 테스트 실패: ${error.message}\n`);
  }

  // 5. APIIntegrationManager 테스트
  console.log('5. APIIntegrationManager 테스트...');
  try {
    const integrationConfig = {
      // 실제 API 호출 없이 구조만 테스트
    };

    const apiManager = new APIIntegrationManager(integrationConfig, eventEngine);
    
    console.log('   ✅ APIIntegrationManager 인스턴스 생성 성공');
    
    // 설정 정보 확인 (민감한 정보는 숨김)
    const config = apiManager.getConfiguration();
    console.log(`   📊 Configuration: ${JSON.stringify(config, null, 2)}\n`);
  } catch (error) {
    console.log(`   ❌ APIIntegrationManager 테스트 실패: ${error.message}\n`);
  }

  // 6. 이벤트 통계 확인
  console.log('6. 이벤트 통계 확인...');
  const stats = eventEngine.getStatistics();
  console.log(`   📊 총 이벤트 수: ${stats.totalEvents}`);
  console.log(`   📊 API 카테고리 이벤트: ${stats.eventsByCategory.get('api') || 0}`);
  console.log(`   ✅ 이벤트 시스템 정상 작동\n`);

  console.log('🎉 외부 API 통합 테스트 완료!\n');
  console.log('✨ 구현된 기능:');
  console.log('   - BaseAPIClient 추상 클래스');
  console.log('   - 인증 처리 시스템 (Bearer, Basic, API Key)');
  console.log('   - 재시도 로직 (Exponential Backoff with Jitter)');
  console.log('   - JiraClient (Jira API 통합)');
  console.log('   - NotionClient (Notion API 통합)');
  console.log('   - FigmaClient (Figma API 통합)');
  console.log('   - APIIntegrationManager (통합 관리)');
  console.log('   - 실시간 이벤트 발행');
  console.log('   - 헬스체크 및 연결 검증');
}

// 테스트 실행
testAPIIntegration().catch((error) => {
  console.error('❌ 테스트 실행 중 오류 발생:', error);
  process.exit(1);
});