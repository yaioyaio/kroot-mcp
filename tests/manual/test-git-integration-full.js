/**
 * Git 통합 기능 완전 검증 스크립트
 * 
 * 이 스크립트는 GitMonitor의 모든 기능을 자동으로 테스트합니다.
 * 
 * 실행 방법:
 * node tests/manual/test-git-integration-full.js
 */

import { GitMonitor } from '../../dist/monitors/git.js';
import { EventEngine } from '../../dist/events/index.js';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const TEST_DIR = '/tmp/git-monitor-test';
const TIMEOUT = 10000; // 10초 대기

async function setupTestRepo() {
  console.log('🔧 테스트 Git 저장소 설정 중...');
  
  // 기존 테스트 디렉토리 삭제
  if (fs.existsSync(TEST_DIR)) {
    execSync(`rm -rf ${TEST_DIR}`);
  }
  
  // 새 Git 저장소 생성
  fs.mkdirSync(TEST_DIR, { recursive: true });
  process.chdir(TEST_DIR);
  
  execSync('git init');
  execSync('git config user.name "Test User"');
  execSync('git config user.email "test@example.com"');
  
  // 초기 파일 생성 및 커밋
  fs.writeFileSync('README.md', '# Test Repository');
  execSync('git add README.md');
  execSync('git commit -m "feat: initial commit"');
  
  console.log(`✅ 테스트 저장소 생성: ${TEST_DIR}`);
}

async function testGitMonitorIntegration() {
  console.log('\n🚀 Git 통합 기능 전체 검증 시작');
  console.log('=====================================\n');

  const eventEngine = new EventEngine();
  const receivedEvents = [];
  
  // 모든 이벤트 구독
  eventEngine.subscribe('*', (event) => {
    receivedEvents.push(event);
    console.log(`📧 이벤트 수신: ${event.type}`);
    
    if (event.type === 'git:commit') {
      console.log(`   커밋: ${event.data.hash?.substring(0, 7)} - ${event.data.message}`);
      if (event.data.analysis?.conventional) {
        console.log(`   분석: ${event.data.analysis.type} (Conventional)`);
      }
    } else if (event.type.startsWith('git:branch')) {
      console.log(`   브랜치: ${event.data.branchName || 'unknown'}`);
    }
  });

  try {
    // GitMonitor 생성 및 시작
    const gitMonitor = new GitMonitor(eventEngine, {
      repositoryPath: TEST_DIR,
      pollInterval: 1000, // 1초로 빠르게 설정
      trackBranches: true,
      trackCommits: true,
      trackMerges: true,
      analyzeCommitMessages: true
    });

    console.log('🔄 GitMonitor 시작...');
    await gitMonitor.start();
    
    // 잠시 대기 (초기 상태 캐시)
    await sleep(2000);
    
    // 테스트 1: 새 커밋 생성
    console.log('\n📝 테스트 1: 새 커밋 생성');
    fs.writeFileSync('test1.txt', 'Test file 1');
    execSync('git add test1.txt');
    execSync('git commit -m "feat(test): add test file 1"');
    
    await sleep(3000); // 폴링 대기
    
    // 테스트 2: 브랜치 생성
    console.log('\n🌿 테스트 2: 브랜치 생성');
    execSync('git checkout -b feature/test-branch');
    
    await sleep(3000);
    
    // 테스트 3: 브랜치에서 커밋
    console.log('\n📝 테스트 3: 브랜치에서 커밋');
    fs.writeFileSync('test2.txt', 'Test file 2');
    execSync('git add test2.txt');
    execSync('git commit -m "fix: add test file 2"');
    
    await sleep(3000);
    
    // 테스트 4: 메인 브랜치로 머지
    console.log('\n🔀 테스트 4: 메인 브랜치로 머지');
    execSync('git checkout main');
    await sleep(2000);
    execSync('git merge feature/test-branch --no-ff -m "merge: merge feature/test-branch"');
    
    await sleep(3000);
    
    // 테스트 5: 브랜치 삭제
    console.log('\n🗑️ 테스트 5: 브랜치 삭제');
    execSync('git branch -d feature/test-branch');
    
    await sleep(3000);
    
    // GitMonitor 정지
    console.log('\n⏹️ GitMonitor 정지...');
    await gitMonitor.stop();
    
    // 결과 분석
    console.log('\n📊 검증 결과 분석');
    console.log('===================');
    
    const eventTypes = receivedEvents.map(e => e.type);
    const uniqueTypes = [...new Set(eventTypes)];
    
    console.log(`총 이벤트 수: ${receivedEvents.length}`);
    console.log(`이벤트 타입: ${uniqueTypes.join(', ')}`);
    
    // 예상 이벤트 검증
    const expectedEvents = [
      'git:monitor_started',
      'git:commit',
      'git:branch_created',
      'git:merge',
      'git:branch_deleted',
      'git:monitor_stopped'
    ];
    
    const verificationResults = {};
    
    for (const expectedEvent of expectedEvents) {
      const found = eventTypes.includes(expectedEvent);
      verificationResults[expectedEvent] = found;
      console.log(`${found ? '✅' : '❌'} ${expectedEvent}: ${found ? '감지됨' : '감지 안됨'}`);
    }
    
    // Conventional Commits 분석 검증
    const commitEvents = receivedEvents.filter(e => e.type === 'git:commit');
    const conventionalCommits = commitEvents.filter(e => e.data.analysis?.conventional);
    
    console.log(`\n🔍 Conventional Commits 분석:`);
    console.log(`   전체 커밋: ${commitEvents.length}`);
    console.log(`   분석된 커밋: ${conventionalCommits.length}`);
    
    if (conventionalCommits.length > 0) {
      conventionalCommits.forEach(commit => {
        console.log(`   - ${commit.data.analysis.type}: ${commit.data.message}`);
      });
    }
    
    // 전체 성공 여부 판단
    const allExpectedFound = expectedEvents.every(event => eventTypes.includes(event));
    const hasConventionalAnalysis = conventionalCommits.length > 0;
    
    console.log(`\n🎯 전체 검증 결과:`);
    console.log(`   이벤트 감지: ${allExpectedFound ? '✅ 성공' : '❌ 실패'}`);
    console.log(`   커밋 분석: ${hasConventionalAnalysis ? '✅ 성공' : '❌ 실패'}`);
    
    if (allExpectedFound && hasConventionalAnalysis) {
      console.log(`\n🎉 Git 통합 기능 검증 완료! 모든 테스트 통과`);
      return true;
    } else {
      console.log(`\n⚠️ 일부 기능이 예상대로 동작하지 않습니다.`);
      return false;
    }

  } catch (error) {
    console.error('\n❌ 검증 중 오류 발생:', error.message);
    return false;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function cleanup() {
  console.log('\n🧹 정리 작업...');
  process.chdir('/');
  
  try {
    if (fs.existsSync(TEST_DIR)) {
      execSync(`rm -rf ${TEST_DIR}`);
      console.log('✅ 테스트 디렉토리 삭제 완료');
    }
  } catch (error) {
    console.warn('⚠️ 정리 작업 중 오류:', error.message);
  }
}

// 메인 실행
async function main() {
  const originalDir = process.cwd();
  
  try {
    await setupTestRepo();
    const success = await testGitMonitorIntegration();
    
    if (success) {
      process.exit(0);
    } else {
      process.exit(1);
    }
    
  } catch (error) {
    console.error('💥 테스트 실행 중 치명적 오류:', error);
    process.exit(1);
  } finally {
    process.chdir(originalDir);
    await cleanup();
  }
}

// 스크립트가 직접 실행될 때만 main 함수 호출
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as testGitIntegrationFull };