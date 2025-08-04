#!/usr/bin/env node

/**
 * MethodologyAnalyzer 매뉴얼 테스트 (CommonJS)
 * 
 * 실행 방법:
 * node tests/manual/test-methodology-analyzer.cjs
 */

const path = require('path');

// Mock 모듈들 생성
console.log('=== MethodologyAnalyzer 테스트 시작 (Mock) ===\n');

// 간단한 EventEmitter 구현
class EventEmitter {
  constructor() {
    this.events = {};
  }
  
  on(event, listener) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
  }
  
  emit(event, ...args) {
    if (this.events[event]) {
      this.events[event].forEach(listener => listener(...args));
    }
  }
}

// Mock MethodologyAnalyzer
class MethodologyAnalyzer extends EventEmitter {
  constructor() {
    super();
    this.detections = [];
    this.scores = {
      DDD: { score: 0, strengths: [], weaknesses: [], recommendations: [] },
      TDD: { score: 0, strengths: [], weaknesses: [], recommendations: [] },
      BDD: { score: 0, strengths: [], weaknesses: [], recommendations: [] },
      EDA: { score: 0, strengths: [], weaknesses: [], recommendations: [] }
    };
  }
  
  async analyzeEvent(event) {
    console.log(`\n📊 이벤트 분석: ${event.type}`);
    
    // 파일 이벤트 분석
    if (event.category === 'FILE') {
      const filePath = event.data.newFile?.path || '';
      
      // DDD 패턴 감지
      if (filePath.includes('domain') || filePath.includes('Entity')) {
        const detection = {
          methodology: 'DDD',
          confidence: 0.8,
          evidence: [`File path: ${filePath}`, 'Entity pattern detected'],
          timestamp: Date.now()
        };
        this.detections.push(detection);
        this.emit('methodologyDetected', detection);
        this.scores.DDD.score = 70;
        this.scores.DDD.strengths = ['Clear domain boundaries', 'Entity modeling'];
      }
      
      // TDD 패턴 감지
      if (filePath.includes('.test.') || filePath.includes('.spec.')) {
        const detection = {
          methodology: 'TDD',
          confidence: 0.75,
          evidence: [`Test file: ${filePath}`],
          timestamp: Date.now()
        };
        this.detections.push(detection);
        this.emit('methodologyDetected', detection);
        this.scores.TDD.score = 60;
        this.scores.TDD.strengths = ['Test files present'];
      }
      
      // BDD 패턴 감지
      if (filePath.includes('.feature')) {
        const detection = {
          methodology: 'BDD',
          confidence: 0.9,
          evidence: [`Feature file: ${filePath}`],
          timestamp: Date.now()
        };
        this.detections.push(detection);
        this.emit('methodologyDetected', detection);
        this.scores.BDD.score = 80;
        this.scores.BDD.strengths = ['Feature files defined', 'Scenarios written'];
      }
      
      // EDA 패턴 감지
      if (filePath.includes('Event') || filePath.includes('Handler')) {
        const detection = {
          methodology: 'EDA',
          confidence: 0.85,
          evidence: [`Event file: ${filePath}`],
          timestamp: Date.now()
        };
        this.detections.push(detection);
        this.emit('methodologyDetected', detection);
        this.scores.EDA.score = 75;
        this.scores.EDA.strengths = ['Event-driven architecture', 'Clear event handling'];
      }
    }
    
    // Git 이벤트 분석
    if (event.category === 'GIT') {
      const message = event.data.message || '';
      if (message.includes('test')) {
        this.emit('tddCycleChanged', {
          currentPhase: 'RED',
          testCount: 5,
          passingTests: 3,
          failingTests: 2,
          cycleCount: 1
        });
      }
    }
    
    // 점수 업데이트
    this.emit('scoreUpdated', this.scores);
  }
  
  analyze() {
    const totalScore = Object.values(this.scores).reduce((sum, s) => sum + s.score, 0);
    const overallScore = Math.round(totalScore / 4);
    
    return {
      timestamp: Date.now(),
      detections: this.detections,
      scores: this.scores,
      overallScore,
      dominantMethodology: overallScore > 50 ? 'DDD' : null,
      trends: Object.keys(this.scores).map(m => ({
        methodology: m,
        usage: [1, 2, 3, 2, 3, 4],
        timeWindow: 'hour',
        growth: 20
      }))
    };
  }
}

// 메인 테스트 실행
async function runTest() {
  const analyzer = new MethodologyAnalyzer();
  
  // 이벤트 리스너 설정
  analyzer.on('methodologyDetected', (detection) => {
    console.log(`\n🔍 방법론 감지: ${detection.methodology}`);
    console.log(`   신뢰도: ${(detection.confidence * 100).toFixed(1)}%`);
    console.log(`   증거: ${detection.evidence.join(', ')}`);
  });
  
  analyzer.on('tddCycleChanged', (state) => {
    console.log(`\n🔄 TDD 사이클 변경: ${state.currentPhase}`);
    console.log(`   테스트: ${state.passingTests}/${state.testCount} 통과`);
  });
  
  analyzer.on('scoreUpdated', (scores) => {
    console.log('\n📊 방법론 점수 업데이트:');
    for (const [methodology, score] of Object.entries(scores)) {
      console.log(`   ${methodology}: ${score.score}점`);
    }
  });
  
  // 테스트 이벤트들
  const testEvents = [
    {
      id: '1',
      timestamp: Date.now(),
      category: 'FILE',
      type: 'file:modified',
      data: {
        action: 'MODIFY',
        newFile: { path: '/src/domain/user/UserEntity.ts' }
      }
    },
    {
      id: '2',
      timestamp: Date.now(),
      category: 'FILE',
      type: 'file:created',
      data: {
        action: 'ADD',
        newFile: { path: '/tests/calculator.test.ts' }
      }
    },
    {
      id: '3',
      timestamp: Date.now(),
      category: 'GIT',
      type: 'git:commit',
      data: {
        message: 'test: add failing test for calculator'
      }
    },
    {
      id: '4',
      timestamp: Date.now(),
      category: 'FILE',
      type: 'file:created',
      data: {
        action: 'ADD',
        newFile: { path: '/features/user-registration.feature' }
      }
    },
    {
      id: '5',
      timestamp: Date.now(),
      category: 'FILE',
      type: 'file:created',
      data: {
        action: 'ADD',
        newFile: { path: '/src/events/UserRegisteredEvent.ts' }
      }
    }
  ];
  
  // 이벤트 처리
  console.log('\n=== 테스트 시나리오 실행 ===');
  for (const event of testEvents) {
    await analyzer.analyzeEvent(event);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // 최종 분석 결과
  console.log('\n=== 최종 분석 결과 ===');
  const result = analyzer.analyze();
  
  console.log(`\n전체 방법론 점수: ${result.overallScore}%`);
  console.log(`주요 방법론: ${result.dominantMethodology || '없음'}`);
  console.log(`총 감지 수: ${result.detections.length}`);
  
  console.log('\n방법론별 점수:');
  for (const [methodology, score] of Object.entries(result.scores)) {
    console.log(`\n${methodology}: ${score.score}점`);
    if (score.strengths.length > 0) {
      console.log(`  강점: ${score.strengths.join(', ')}`);
    }
    if (score.weaknesses.length > 0) {
      console.log(`  약점: ${score.weaknesses.join(', ')}`);
    }
  }
  
  console.log('\n=== 테스트 완료 ===');
}

// 실행
runTest().catch(console.error);