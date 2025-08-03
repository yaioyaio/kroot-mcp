#!/usr/bin/env node

/**
 * StageAnalyzer 테스트 스크립트
 * 
 * 이 스크립트는 StageAnalyzer의 동작을 테스트합니다.
 */

import { StageAnalyzer } from '../../dist/analyzers/stage-analyzer.js';
import { EventEngine } from '../../dist/events/engine.js';
import { EventCategory, EventSeverity } from '../../dist/events/types/base.js';
import { getStorageManager } from '../../dist/storage/index.js';

console.log('🚀 StageAnalyzer 테스트 시작\n');

// EventEngine 초기화
const eventEngine = new EventEngine();
const storageManager = getStorageManager();

// StageAnalyzer 초기화
const stageAnalyzer = new StageAnalyzer({
  confidenceThreshold: 0.6,
  transitionCooldown: 1000, // 1초
  historySize: 20,
  eventEngine,
  storageManager,
});

// 이벤트 리스너 설정
stageAnalyzer.on('stage:transition', (transition) => {
  console.log(`📍 단계 전환 감지:`);
  console.log(`  - From: ${transition.fromStage || 'start'}`);
  console.log(`  - To: ${transition.toStage}`);
  console.log(`  - Confidence: ${(transition.confidence * 100).toFixed(1)}%`);
  console.log(`  - Reason: ${transition.reason}\n`);
});

stageAnalyzer.on('stage:detected', (stage, confidence) => {
  console.log(`🎯 현재 단계: ${stage} (신뢰도: ${(confidence * 100).toFixed(1)}%)\n`);
});

stageAnalyzer.on('substage:detected', (subStage) => {
  console.log(`📌 세부 단계 감지: ${subStage}\n`);
});

// 테스트 시나리오 실행
async function runTestScenario() {
  console.log('📝 시나리오 1: PRD 단계 감지\n');
  
  // PRD 파일 생성 이벤트
  eventEngine.publish({
    id: 'test-1',
    timestamp: Date.now(),
    category: EventCategory.FILE,
    type: 'file:create',
    severity: EventSeverity.INFO,
    source: 'test',
    data: {
      action: 'add',
      newFile: {
        path: '/docs/PRD.md',
        relativePath: 'docs/PRD.md',
        name: 'PRD.md',
        extension: '.md',
        size: 5000,
        isDirectory: false,
      },
    },
  });

  await delay(2000);

  console.log('📝 시나리오 2: 기획서 단계 전환\n');
  
  // 기획서 파일 생성
  eventEngine.publish({
    id: 'test-2',
    timestamp: Date.now(),
    category: EventCategory.FILE,
    type: 'file:create',
    severity: EventSeverity.INFO,
    source: 'test',
    data: {
      action: 'add',
      newFile: {
        path: '/docs/planning.md',
        relativePath: 'docs/planning.md',
        name: 'planning.md',
        extension: '.md',
        size: 3000,
        isDirectory: false,
      },
    },
  });

  await delay(2000);

  console.log('📝 시나리오 3: 프론트엔드 개발 단계\n');
  
  // React 컴포넌트 파일 생성
  eventEngine.publish({
    id: 'test-3',
    timestamp: Date.now(),
    category: EventCategory.FILE,
    type: 'file:create',
    severity: EventSeverity.INFO,
    source: 'test',
    data: {
      action: 'add',
      newFile: {
        path: '/src/components/Dashboard.tsx',
        relativePath: 'src/components/Dashboard.tsx',
        name: 'Dashboard.tsx',
        extension: '.tsx',
        size: 2000,
        isDirectory: false,
      },
    },
  });

  await delay(2000);

  console.log('📝 시나리오 4: AI 협업 단계\n');
  
  // AI 프롬프트 파일 생성
  eventEngine.publish({
    id: 'test-4',
    timestamp: Date.now(),
    category: EventCategory.FILE,
    type: 'file:create',
    severity: EventSeverity.INFO,
    source: 'test',
    data: {
      action: 'add',
      newFile: {
        path: '/prompts/claude-prompt.md',
        relativePath: 'prompts/claude-prompt.md',
        name: 'claude-prompt.md',
        extension: '.md',
        size: 1500,
        isDirectory: false,
      },
    },
  });

  await delay(2000);

  console.log('📝 시나리오 5: 코딩 세부 단계 (UseCase)\n');
  
  // UseCase 파일 생성
  eventEngine.publish({
    id: 'test-5',
    timestamp: Date.now(),
    category: EventCategory.FILE,
    type: 'file:create',
    severity: EventSeverity.INFO,
    source: 'test',
    data: {
      action: 'add',
      newFile: {
        path: '/docs/use-cases/user-login.md',
        relativePath: 'docs/use-cases/user-login.md',
        name: 'user-login.md',
        extension: '.md',
        size: 1000,
        isDirectory: false,
      },
    },
  });

  await delay(2000);

  console.log('📝 시나리오 6: 코딩 세부 단계 (단위 테스트)\n');
  
  // 테스트 파일 생성
  eventEngine.publish({
    id: 'test-6',
    timestamp: Date.now(),
    category: EventCategory.FILE,
    type: 'file:create',
    severity: EventSeverity.INFO,
    source: 'test',
    data: {
      action: 'add',
      newFile: {
        path: '/tests/components/Dashboard.test.tsx',
        relativePath: 'tests/components/Dashboard.test.tsx',
        name: 'Dashboard.test.tsx',
        extension: '.tsx',
        size: 1200,
        isDirectory: false,
      },
    },
  });

  await delay(2000);

  console.log('📝 시나리오 7: Git 관리 단계\n');
  
  // Git 커밋 이벤트
  eventEngine.publish({
    id: 'test-7',
    timestamp: Date.now(),
    category: EventCategory.GIT,
    type: 'git:commit:created',
    severity: EventSeverity.INFO,
    source: 'test',
    data: {
      commit: {
        hash: 'abc123def',
        shortHash: 'abc123d',
        message: 'feat: implement user dashboard',
        author: {
          name: 'Test User',
          email: 'test@example.com',
          date: new Date(),
        },
        parents: [],
      },
      branch: {
        name: 'feature/dashboard',
        isRemote: false,
        isDefault: false,
      },
    },
  });

  await delay(2000);

  // 최종 분석 결과 출력
  console.log('\n📊 최종 분석 결과:\n');
  const analysis = stageAnalyzer.analyze();
  
  console.log('현재 단계:', analysis.currentStage);
  console.log('신뢰도:', (analysis.confidence * 100).toFixed(1) + '%');
  console.log('\n활성 세부 단계:', analysis.activeSubStages);
  
  console.log('\n단계별 진행률:');
  analysis.stageProgress.forEach((progress, stage) => {
    if (progress > 0) {
      console.log(`  - ${stage}: ${progress}%`);
    }
  });

  console.log('\n최근 전환 히스토리:');
  const history = stageAnalyzer.getTransitionHistory(5);
  history.forEach((transition, index) => {
    console.log(`  ${index + 1}. ${transition.fromStage || 'start'} → ${transition.toStage} (${new Date(transition.timestamp).toLocaleTimeString()})`);
  });

  console.log('\n제안사항:');
  analysis.suggestions.forEach((suggestion, index) => {
    console.log(`  ${index + 1}. ${suggestion}`);
  });

  console.log('\n단계별 소요 시간:');
  analysis.stageProgress.forEach((_, stage) => {
    const timeMs = stageAnalyzer.getStageTimeSpent(stage);
    if (timeMs > 0) {
      console.log(`  - ${stage}: ${(timeMs / 1000).toFixed(1)}초`);
    }
  });

  // 코딩 세부 단계 진행률
  console.log('\n코딩 세부 단계 진행률:');
  const subStageProgress = stageAnalyzer.getCodingSubStageProgress();
  subStageProgress.forEach((progress, subStage) => {
    if (progress > 0) {
      console.log(`  - ${subStage}: ${progress}%`);
    }
  });
}

// 유틸리티 함수
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 메인 실행
(async () => {
  try {
    await runTestScenario();
    
    console.log('\n✅ 테스트 완료\n');
    
    // 정리
    stageAnalyzer.dispose();
    storageManager.close();
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ 에러 발생:', error);
    process.exit(1);
  }
})();