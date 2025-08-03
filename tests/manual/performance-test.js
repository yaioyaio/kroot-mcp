#!/usr/bin/env node

/**
 * MCP 서버 성능 테스트 스크립트
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function performanceTest() {
  console.log('🚀 MCP 서버 성능 테스트 시작');
  
  const projectRoot = join(__dirname, '..', '..');
  const serverPath = join(projectRoot, 'dist/server/index.js');
  const testCount = 10;
  const results = [];

  for (let i = 0; i < testCount; i++) {
    console.log(`📊 테스트 ${i + 1}/${testCount} 실행 중...`);
    
    const startTime = Date.now();
    
    const serverProcess = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: projectRoot
    });

    let serverReady = false;
    let responseReceived = false;

    // 서버 준비 시간 측정
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('MCP Server connected and ready') && !serverReady) {
        serverReady = true;
        const readyTime = Date.now() - startTime;
        
        // 도구 호출 성능 테스트
        const testMessage = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'getProjectStatus',
            arguments: {}
          }
        };
        
        const callStart = Date.now();
        serverProcess.stdin.write(JSON.stringify(testMessage) + '\n');
        
        // 응답 시간 측정
        const responseHandler = (data) => {
          if (!responseReceived) {
            try {
              const response = JSON.parse(data.toString());
              if (response.id === 1) {
                responseReceived = true;
                const responseTime = Date.now() - callStart;
                
                results.push({
                  test: i + 1,
                  startupTime: readyTime,
                  responseTime: responseTime,
                  totalTime: Date.now() - startTime
                });
                
                serverProcess.kill();
              }
            } catch (error) {
              // JSON 파싱 오류 무시
            }
          }
        };
        
        serverProcess.stdout.on('data', responseHandler);
      }
    });

    // 타임아웃 설정
    setTimeout(() => {
      if (!responseReceived) {
        results.push({
          test: i + 1,
          startupTime: 'timeout',
          responseTime: 'timeout',
          totalTime: 'timeout'
        });
        serverProcess.kill();
      }
    }, 5000);

    // 프로세스 완료 대기
    await new Promise((resolve) => {
      serverProcess.on('close', resolve);
    });
  }

  // 결과 분석
  console.log('\n📋 성능 테스트 결과:');
  console.log('==================');
  
  const validResults = results.filter(r => 
    typeof r.startupTime === 'number' && typeof r.responseTime === 'number'
  );
  
  if (validResults.length > 0) {
    const avgStartup = validResults.reduce((sum, r) => sum + r.startupTime, 0) / validResults.length;
    const avgResponse = validResults.reduce((sum, r) => sum + r.responseTime, 0) / validResults.length;
    const minStartup = Math.min(...validResults.map(r => r.startupTime));
    const maxStartup = Math.max(...validResults.map(r => r.startupTime));
    const minResponse = Math.min(...validResults.map(r => r.responseTime));
    const maxResponse = Math.max(...validResults.map(r => r.responseTime));
    
    console.log(`✅ 성공한 테스트: ${validResults.length}/${testCount}`);
    console.log(`📈 서버 시작 시간:`);
    console.log(`   평균: ${avgStartup.toFixed(2)}ms`);
    console.log(`   최소: ${minStartup}ms`);
    console.log(`   최대: ${maxStartup}ms`);
    console.log(`📈 응답 시간:`);
    console.log(`   평균: ${avgResponse.toFixed(2)}ms`);
    console.log(`   최소: ${minResponse}ms`);
    console.log(`   최대: ${maxResponse}ms`);
    
    // 성능 기준 평가
    console.log('\n🎯 성능 기준 평가:');
    console.log(`서버 시작 시간 < 2000ms: ${avgStartup < 2000 ? '✅' : '❌'} (${avgStartup.toFixed(2)}ms)`);
    console.log(`도구 응답 시간 < 100ms: ${avgResponse < 100 ? '✅' : '❌'} (${avgResponse.toFixed(2)}ms)`);
  } else {
    console.log('❌ 모든 테스트가 실패했습니다.');
  }
  
  // 개별 결과 출력
  console.log('\n📊 개별 테스트 결과:');
  results.forEach((result, index) => {
    console.log(`테스트 ${index + 1}: 시작=${result.startupTime}ms, 응답=${result.responseTime}ms`);
  });
}

performanceTest().catch(console.error);