#!/usr/bin/env node

/**
 * DevFlow Monitor MCP 서버 테스트 스크립트
 * MCP 서버의 기본 기능을 테스트합니다.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testMCPServer() {
  console.log('🚀 DevFlow Monitor MCP 서버 테스트 시작');
  
  const serverPath = join(__dirname, 'dist/server/index.js');
  console.log(`📍 서버 경로: ${serverPath}`);
  
  const serverProcess = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: __dirname,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      MCP_DEBUG: 'true',
      MCP_LOG_LEVEL: 'debug'
    }
  });

  let isServerReady = false;
  let testResults = [];

  // 서버 출력 캐치
  serverProcess.stdout.on('data', (data) => {
    const output = data.toString();
    console.log('📤 서버 출력:', output.trim());
    
    if (output.includes('MCP Server connected and ready')) {
      isServerReady = true;
      runTests();
    }
  });

  serverProcess.stderr.on('data', (data) => {
    console.error('❌ 서버 에러:', data.toString().trim());
  });

  serverProcess.on('close', (code) => {
    console.log(`🔚 서버 프로세스 종료: ${code}`);
  });

  // Initialize 메시지 전송
  const initMessage = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    }
  };

  setTimeout(() => {
    console.log('📨 초기화 메시지 전송');
    serverProcess.stdin.write(JSON.stringify(initMessage) + '\n');
  }, 1000);

  async function runTests() {
    console.log('🧪 테스트 실행 시작');

    // 1. tools/list 테스트
    await testToolsList();
    
    // 2. getProjectStatus 도구 테스트
    await testGetProjectStatus();
    
    // 3. getMetrics 도구 테스트
    await testGetMetrics();

    // 테스트 결과 출력
    console.log('\n📋 테스트 결과:');
    testResults.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      console.log(`${status} ${index + 1}. ${result.name}: ${result.message}`);
    });

    // 서버 종료
    setTimeout(() => {
      console.log('\n🔚 테스트 완료, 서버 종료 중...');
      serverProcess.kill();
    }, 2000);
  }

  async function testToolsList() {
    const message = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    };

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        testResults.push({
          name: 'tools/list',
          success: false,
          message: '타임아웃'
        });
        resolve();
      }, 5000);

      const responseHandler = (data) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === 2) {
            clearTimeout(timeout);
            serverProcess.stdout.off('data', responseHandler);
            
            if (response.result && response.result.tools) {
              testResults.push({
                name: 'tools/list',
                success: true,
                message: `${response.result.tools.length}개 도구 발견`
              });
            } else {
              testResults.push({
                name: 'tools/list',
                success: false,
                message: '도구 목록 형식 오류'
              });
            }
            resolve();
          }
        } catch (error) {
          // JSON 파싱 오류 무시 (부분 데이터일 수 있음)
        }
      };

      serverProcess.stdout.on('data', responseHandler);
      
      console.log('📨 tools/list 요청 전송');
      serverProcess.stdin.write(JSON.stringify(message) + '\n');
    });
  }

  async function testGetProjectStatus() {
    const message = {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'getProjectStatus',
        arguments: {
          includeDetails: true
        }
      }
    };

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        testResults.push({
          name: 'getProjectStatus',
          success: false,
          message: '타임아웃'
        });
        resolve();
      }, 5000);

      const responseHandler = (data) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === 3) {
            clearTimeout(timeout);
            serverProcess.stdout.off('data', responseHandler);
            
            if (response.result && response.result.content) {
              testResults.push({
                name: 'getProjectStatus',
                success: true,
                message: '프로젝트 상태 조회 성공'
              });
            } else {
              testResults.push({
                name: 'getProjectStatus',
                success: false,
                message: response.error ? response.error.message : '응답 형식 오류'
              });
            }
            resolve();
          }
        } catch (error) {
          // JSON 파싱 오류 무시
        }
      };

      serverProcess.stdout.on('data', responseHandler);
      
      console.log('📨 getProjectStatus 요청 전송');
      serverProcess.stdin.write(JSON.stringify(message) + '\n');
    });
  }

  async function testGetMetrics() {
    const message = {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'getMetrics',
        arguments: {
          timeRange: '1d',
          metricType: 'all'
        }
      }
    };

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        testResults.push({
          name: 'getMetrics',
          success: false,
          message: '타임아웃'
        });
        resolve();
      }, 5000);

      const responseHandler = (data) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === 4) {
            clearTimeout(timeout);
            serverProcess.stdout.off('data', responseHandler);
            
            if (response.result && response.result.content) {
              testResults.push({
                name: 'getMetrics',
                success: true,
                message: '메트릭 조회 성공'
              });
            } else {
              testResults.push({
                name: 'getMetrics',
                success: false,
                message: response.error ? response.error.message : '응답 형식 오류'
              });
            }
            resolve();
          }
        } catch (error) {
          // JSON 파싱 오류 무시
        }
      };

      serverProcess.stdout.on('data', responseHandler);
      
      console.log('📨 getMetrics 요청 전송');
      serverProcess.stdin.write(JSON.stringify(message) + '\n');
    });
  }
}

// 테스트 실행
testMCPServer().catch(console.error);