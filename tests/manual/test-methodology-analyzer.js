#!/usr/bin/env node

/**
 * MethodologyAnalyzer 매뉴얼 테스트
 * 
 * 실행 방법:
 * node tests/manual/test-methodology-analyzer.js
 */

import { MethodologyAnalyzer } from '../../dist/analyzers/methodology-analyzer.js';
import { EventEngine } from '../../dist/events/engine.js';
import { EventCategory, EventSeverity } from '../../dist/events/types/base.js';
import { FileChangeAction } from '../../dist/events/types/file.js';
import { GitAction } from '../../dist/events/types/git.js';

console.log('=== MethodologyAnalyzer 테스트 시작 ===\n');

// EventEngine 초기화
const eventEngine = new EventEngine();
const analyzer = new MethodologyAnalyzer();

// 이벤트를 분석기에 연결
eventEngine.subscribe('*', async (event) => {
  await analyzer.analyzeEvent(event);
});

// 방법론 감지 이벤트 리스너
analyzer.on('methodologyDetected', (detection) => {
  console.log(`\n🔍 방법론 감지: ${detection.methodology}`);
  console.log(`   신뢰도: ${(detection.confidence * 100).toFixed(1)}%`);
  console.log(`   증거: ${detection.evidence.slice(0, 2).join(', ')}`);
});

analyzer.on('tddCycleChanged', (state) => {
  console.log(`\n🔄 TDD 사이클 변경: ${state.currentPhase}`);
  console.log(`   테스트: ${state.passingTests}/${state.testCount} 통과`);
  console.log(`   사이클 수: ${state.cycleCount}`);
});

analyzer.on('scoreUpdated', (scores) => {
  console.log('\n📊 방법론 점수 업데이트:');
  for (const [methodology, score] of Object.entries(scores)) {
    console.log(`   ${methodology}: ${score.score}점`);
  }
});

// 테스트 이벤트 생성 함수들
function createDDDFileEvent() {
  return {
    id: Math.random().toString(),
    timestamp: Date.now(),
    category: EventCategory.FILE,
    type: 'file:modified',
    severity: EventSeverity.INFO,
    source: 'test',
    data: {
      action: FileChangeAction.MODIFY,
      newFile: {
        path: '/src/domain/user/UserEntity.ts',
        content: `
export class UserEntity extends AggregateRoot {
  private id: UserId;
  private email: Email;
  private profile: UserProfile;
  
  constructor(id: UserId, email: Email) {
    super();
    this.id = id;
    this.email = email;
  }
  
  // Domain logic
  changeEmail(newEmail: Email): void {
    this.email = newEmail;
    this.addDomainEvent(new UserEmailChangedEvent(this.id, newEmail));
  }
}

export class UserRepository implements IUserRepository {
  async findById(id: UserId): Promise<UserEntity | null> {
    // Repository implementation
  }
}
`,
        stats: { size: 500, modified: Date.now() }
      }
    }
  };
}

function createTDDFileEvent(phase) {
  const contents = {
    red: `
describe('Calculator', () => {
  it('should add two numbers', () => {
    const calc = new Calculator();
    expect(calc.add(2, 3)).toBe(5); // This will fail - Calculator not implemented
  });
});
`,
    green: `
class Calculator {
  add(a, b) {
    return a + b; // Minimal implementation to pass test
  }
}
`,
    refactor: `
export class Calculator {
  /**
   * Adds two numbers together
   */
  public add(a: number, b: number): number {
    return a + b;
  }
}
`
  };

  return {
    id: Math.random().toString(),
    timestamp: Date.now(),
    category: EventCategory.FILE,
    type: 'file:modified',
    severity: EventSeverity.INFO,
    source: 'test',
    data: {
      action: FileChangeAction.MODIFY,
      newFile: {
        path: phase === 'red' ? '/tests/calculator.test.ts' : '/src/calculator.ts',
        content: contents[phase],
        stats: { size: 200, modified: Date.now() }
      }
    }
  };
}

function createBDDFileEvent() {
  return {
    id: Math.random().toString(),
    timestamp: Date.now(),
    category: EventCategory.FILE,
    type: 'file:created',
    severity: EventSeverity.INFO,
    source: 'test',
    data: {
      action: FileChangeAction.ADD,
      newFile: {
        path: '/features/user-registration.feature',
        content: `
Feature: User Registration
  As a new user
  I want to register an account
  So that I can access the application

  Scenario: Successful registration with valid data
    Given I am on the registration page
    When I fill in "Email" with "user@example.com"
    And I fill in "Password" with "SecurePass123!"
    And I click the "Register" button
    Then I should see "Registration successful"
    And I should be redirected to the dashboard

  Scenario: Registration fails with invalid email
    Given I am on the registration page
    When I fill in "Email" with "invalid-email"
    And I fill in "Password" with "SecurePass123!"
    And I click the "Register" button
    Then I should see "Please enter a valid email address"
`,
        stats: { size: 600, modified: Date.now() }
      }
    }
  };
}

function createEDAFileEvent() {
  return {
    id: Math.random().toString(),
    timestamp: Date.now(),
    category: EventCategory.FILE,
    type: 'file:created',
    severity: EventSeverity.INFO,
    source: 'test',
    data: {
      action: FileChangeAction.ADD,
      newFile: {
        path: '/src/events/UserRegisteredEvent.ts',
        content: `
export class UserRegisteredEvent extends DomainEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly registeredAt: Date
  ) {
    super();
  }
}

export class UserRegisteredHandler implements EventHandler<UserRegisteredEvent> {
  async handle(event: UserRegisteredEvent): Promise<void> {
    // Send welcome email
    await this.emailService.sendWelcomeEmail(event.email);
    
    // Update analytics
    await this.analytics.trackUserRegistration(event.userId);
    
    // Emit integration event
    await this.eventBus.publish(new UserCreatedIntegrationEvent(event));
  }
}

export class UserRegistrationSaga extends Saga {
  private steps = [
    'validateUserData',
    'createUserAccount', 
    'sendWelcomeEmail',
    'updateAnalytics'
  ];
  
  async execute(command: RegisterUserCommand): Promise<void> {
    // Saga implementation
  }
  
  async compensate(failedStep: string): Promise<void> {
    // Compensation logic
  }
}
`,
        stats: { size: 800, modified: Date.now() }
      }
    }
  };
}

function createGitCommitEvent(message) {
  return {
    id: Math.random().toString(),
    timestamp: Date.now(),
    category: EventCategory.GIT,
    type: 'git:commit',
    severity: EventSeverity.INFO,
    source: 'test',
    data: {
      action: GitAction.COMMIT,
      repository: 'test-repo',
      branch: 'feature/test',
      commit: 'abc123',
      author: 'Test User',
      message,
      stats: {
        additions: 10,
        deletions: 5,
        files: 2
      }
    }
  };
}

function createTestEvent(passed, failed) {
  return {
    id: Math.random().toString(),
    timestamp: Date.now(),
    category: EventCategory.TEST,
    type: 'test:completed',
    severity: failed > 0 ? EventSeverity.WARNING : EventSeverity.INFO,
    source: 'test',
    data: {
      passed,
      failed,
      total: passed + failed,
      duration: 1500,
      coverage: 75
    }
  };
}

// 테스트 시나리오 실행
async function runTestScenario() {
  console.log('\n=== 시나리오 1: DDD 패턴 감지 ===');
  eventEngine.emit(createDDDFileEvent());
  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('\n=== 시나리오 2: TDD 사이클 ===');
  // Red phase
  eventEngine.emit(createTDDFileEvent('red'));
  eventEngine.emit(createGitCommitEvent('test: add failing test for calculator'));
  eventEngine.emit(createTestEvent(0, 1));
  await new Promise(resolve => setTimeout(resolve, 500));

  // Green phase
  eventEngine.emit(createTDDFileEvent('green'));
  eventEngine.emit(createGitCommitEvent('feat: implement calculator add method'));
  eventEngine.emit(createTestEvent(1, 0));
  await new Promise(resolve => setTimeout(resolve, 500));

  // Refactor phase
  eventEngine.emit(createTDDFileEvent('refactor'));
  eventEngine.emit(createGitCommitEvent('refactor: improve calculator implementation'));
  eventEngine.emit(createTestEvent(1, 0));
  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('\n=== 시나리오 3: BDD Feature 파일 ===');
  eventEngine.emit(createBDDFileEvent());
  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('\n=== 시나리오 4: EDA 이벤트 시스템 ===');
  eventEngine.emit(createEDAFileEvent());
  await new Promise(resolve => setTimeout(resolve, 500));

  // 최종 분석 결과 출력
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
    if (score.recommendations.length > 0) {
      console.log(`  권장사항: ${score.recommendations[0]}`);
    }
  }

  console.log('\n=== 트렌드 분석 ===');
  result.trends.forEach(trend => {
    console.log(`${trend.methodology}: 성장률 ${trend.growth}%, 최근 사용: ${trend.usage.slice(-3).join(', ')}`);
  });
}

// 테스트 실행
runTestScenario().then(() => {
  console.log('\n=== MethodologyAnalyzer 테스트 완료 ===');
  process.exit(0);
}).catch(error => {
  console.error('테스트 실패:', error);
  process.exit(1);
});