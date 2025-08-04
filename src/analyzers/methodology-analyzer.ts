/**
 * 개발 방법론 분석기
 * DDD, TDD, BDD, EDA 패턴을 감지하고 준수도를 측정
 */

import { EventEmitter } from 'eventemitter3';
import {
  DevelopmentMethodology,
  DDDPattern,
  TDDCycle,
  BDDElement,
  MethodologyDetection,
  MethodologyScore,
  MethodologyAnalysisResult,
  MethodologyTrend,
  MethodologyDetectionRule,
  TDDCycleState,
  DDDContextMap,
  BDDScenario,
  EDAEventFlow,
  MethodologyAnalyzerEvents,
  BDDStep
} from './types/methodology.js';
import {
  BaseEvent,
  EventCategory
} from '../events/types/base.js';
import { FileEvent, FileChangeAction } from '../events/types/file.js';
import { GitEvent, GitEventType } from '../events/types/git.js';

export class MethodologyAnalyzer extends EventEmitter<MethodologyAnalyzerEvents> {
  private detections: MethodologyDetection[] = [];
  private detectionRules: Map<DevelopmentMethodology, MethodologyDetectionRule>;
  private tddState: TDDCycleState;
  private dddContext: DDDContextMap;
  private bddScenarios: Map<string, BDDScenario>;
  private edaEventFlow: EDAEventFlow;
  private methodologyScores: Map<DevelopmentMethodology, MethodologyScore>;
  private readonly DETECTION_WINDOW = 3600000; // 1시간
  private readonly CONFIDENCE_THRESHOLD = 0.6;

  constructor() {
    super();
    this.detectionRules = this.initializeDetectionRules();
    this.tddState = this.initializeTDDState();
    this.dddContext = this.initializeDDDContext();
    this.bddScenarios = new Map();
    this.edaEventFlow = this.initializeEDAEventFlow();
    this.methodologyScores = new Map();

    // 초기 점수 설정
    for (const methodology of Object.values(DevelopmentMethodology)) {
      this.methodologyScores.set(methodology as DevelopmentMethodology, {
        methodology: methodology as DevelopmentMethodology,
        score: 0,
        strengths: [],
        weaknesses: [],
        recommendations: [],
        details: {}
      });
    }
  }

  /**
   * 감지 규칙 초기화
   */
  private initializeDetectionRules(): Map<DevelopmentMethodology, MethodologyDetectionRule> {
    const rules = new Map<DevelopmentMethodology, MethodologyDetectionRule>();

    // DDD 감지 규칙
    rules.set(DevelopmentMethodology.DDD, {
      methodology: DevelopmentMethodology.DDD,
      patterns: [
        /class\s+\w+Entity/,
        /class\s+\w+Aggregate/,
        /class\s+\w+ValueObject/,
        /class\s+\w+Repository/,
        /class\s+\w+DomainService/,
        /interface\s+\w+Repository/,
        /BoundedContext/,
        /DomainEvent/,
        /AggregateRoot/
      ],
      filePatterns: ['**/domain/**', '**/entities/**', '**/aggregates/**', '**/value-objects/**'],
      requiredKeywords: ['domain', 'entity', 'aggregate', 'valueObject', 'repository'],
      minConfidence: 0.7
    });

    // TDD 감지 규칙
    rules.set(DevelopmentMethodology.TDD, {
      methodology: DevelopmentMethodology.TDD,
      patterns: [
        /describe\s*\(/,
        /test\s*\(/,
        /it\s*\(/,
        /expect\s*\(/,
        /assert\./,
        /should\./,
        /\.to\./
      ],
      filePatterns: ['**/*.test.*', '**/*.spec.*', '**/test/**', '**/tests/**', '**/__tests__/**'],
      requiredKeywords: ['test', 'expect', 'assert', 'describe'],
      minConfidence: 0.6
    });

    // BDD 감지 규칙
    rules.set(DevelopmentMethodology.BDD, {
      methodology: DevelopmentMethodology.BDD,
      patterns: [
        /Feature:/,
        /Scenario:/,
        /Given\s+/,
        /When\s+/,
        /Then\s+/,
        /And\s+/,
        /But\s+/,
        /@given/,
        /@when/,
        /@then/
      ],
      filePatterns: ['**/*.feature', '**/*.story', '**/features/**', '**/stories/**'],
      requiredKeywords: ['feature', 'scenario', 'given', 'when', 'then'],
      minConfidence: 0.8
    });

    // EDA 감지 규칙
    rules.set(DevelopmentMethodology.EDA, {
      methodology: DevelopmentMethodology.EDA,
      patterns: [
        /class\s+\w+Event/,
        /class\s+\w+Handler/,
        /class\s+\w+Saga/,
        /EventStore/,
        /EventBus/,
        /CommandHandler/,
        /QueryHandler/,
        /emit\s*\(/,
        /publish\s*\(/,
        /subscribe\s*\(/
      ],
      filePatterns: ['**/events/**', '**/handlers/**', '**/sagas/**', '**/cqrs/**'],
      requiredKeywords: ['event', 'handler', 'saga', 'command', 'query'],
      minConfidence: 0.7
    });

    return rules;
  }

  /**
   * TDD 상태 초기화
   */
  private initializeTDDState(): TDDCycleState {
    return {
      currentPhase: TDDCycle.RED,
      phaseStartTime: Date.now(),
      testCount: 0,
      failingTests: 0,
      passingTests: 0,
      coverage: 0,
      cycleCount: 0,
      averageCycleTime: 0
    };
  }

  /**
   * DDD 컨텍스트 초기화
   */
  private initializeDDDContext(): DDDContextMap {
    return {
      boundedContexts: new Map(),
      relationships: [],
      ubiquitousTerms: new Set(),
      aggregates: new Map()
    };
  }

  /**
   * EDA 이벤트 플로우 초기화
   */
  private initializeEDAEventFlow(): EDAEventFlow {
    return {
      events: new Map(),
      handlers: new Map(),
      sagas: new Map(),
      eventFlows: []
    };
  }

  /**
   * 이벤트 분석
   */
  async analyzeEvent(event: BaseEvent): Promise<void> {
    switch (event.category) {
      case EventCategory.FILE:
        await this.analyzeFileEvent(event as FileEvent);
        break;
      case EventCategory.GIT:
        await this.analyzeGitEvent(event as GitEvent);
        break;
      case EventCategory.TEST:
        await this.analyzeTestEvent(event);
        break;
    }

    // 점수 업데이트
    this.updateScores();
  }

  /**
   * 파일 이벤트 분석
   */
  private async analyzeFileEvent(event: FileEvent): Promise<void> {
    if (event.data.action !== FileChangeAction.ADD && 
        event.data.action !== FileChangeAction.CHANGE) {
      return;
    }

    const filePath = event.data.newFile?.path || event.data.oldFile?.path;
    if (!filePath) return;

    const content = ''; // Content would need to be read from file system
    
    // 각 방법론별 패턴 검사
    for (const [methodology, rule] of this.detectionRules) {
      const detection = this.detectMethodology(filePath, content, rule);
      if (detection && detection.confidence >= this.CONFIDENCE_THRESHOLD) {
        this.addDetection(detection);
        this.emit('methodologyDetected', detection);

        // 방법론별 상세 분석
        switch (methodology) {
          case DevelopmentMethodology.DDD:
            this.analyzeDDDPatterns(filePath, content);
            break;
          case DevelopmentMethodology.TDD:
            this.analyzeTDDPatterns(filePath, content);
            break;
          case DevelopmentMethodology.BDD:
            this.analyzeBDDPatterns(filePath, content);
            break;
          case DevelopmentMethodology.EDA:
            this.analyzeEDAPatterns(filePath, content);
            break;
        }
      }
    }
  }

  /**
   * Git 이벤트 분석
   */
  private async analyzeGitEvent(event: GitEvent): Promise<void> {
    if (event.type === GitEventType.COMMIT_CREATED) {
      const commitData = event.data as any;
      const message = commitData.message || '';
      
      // TDD 커밋 패턴 검사
      if (message.match(/test|spec|failing|passing|refactor/i)) {
        this.updateTDDCycle(message);
      }

      // BDD 커밋 패턴 검사
      if (message.match(/feature|scenario|given|when|then/i)) {
        const detection: MethodologyDetection = {
          methodology: DevelopmentMethodology.BDD,
          confidence: 0.6,
          evidence: [`Commit message: ${message}`],
          timestamp: Date.now()
        };
        this.addDetection(detection);
      }
    }
  }

  /**
   * 테스트 이벤트 분석
   */
  private async analyzeTestEvent(event: BaseEvent): Promise<void> {
    // 테스트 실행 결과에 따른 TDD 사이클 업데이트
    const testData = event.data as any;
    if (testData.passed !== undefined && testData.failed !== undefined) {
      this.tddState.passingTests = testData.passed;
      this.tddState.failingTests = testData.failed;
      this.tddState.testCount = testData.passed + testData.failed;

      // TDD 사이클 전환 감지
      if (this.tddState.currentPhase === TDDCycle.RED && testData.failed === 0) {
        this.transitionTDDPhase(TDDCycle.GREEN);
      } else if (this.tddState.currentPhase === TDDCycle.GREEN && testData.failed > 0) {
        this.transitionTDDPhase(TDDCycle.RED);
      }
    }
  }

  /**
   * 방법론 감지
   */
  private detectMethodology(
    filePath: string, 
    content: string, 
    rule: MethodologyDetectionRule
  ): MethodologyDetection | null {
    let confidence = 0;
    const evidence: string[] = [];

    // 파일 경로 패턴 검사
    if (rule.filePatterns) {
      for (const pattern of rule.filePatterns) {
        if (this.matchGlobPattern(filePath, pattern)) {
          confidence += 0.2;
          evidence.push(`File path matches: ${pattern}`);
          break;
        }
      }
    }

    // 콘텐츠 패턴 검사
    let patternMatches = 0;
    for (const pattern of rule.patterns) {
      const matches = content.match(pattern);
      if (matches) {
        patternMatches++;
        evidence.push(`Pattern found: ${pattern.source}`);
      }
    }

    if (patternMatches > 0) {
      confidence += Math.min(0.6, patternMatches * 0.15);
    }

    // 키워드 검사
    if (rule.requiredKeywords) {
      let keywordMatches = 0;
      for (const keyword of rule.requiredKeywords) {
        if (content.toLowerCase().includes(keyword.toLowerCase())) {
          keywordMatches++;
        }
      }
      confidence += Math.min(0.2, keywordMatches * 0.05);
    }

    // 제외 키워드 검사
    if (rule.excludeKeywords) {
      for (const keyword of rule.excludeKeywords) {
        if (content.toLowerCase().includes(keyword.toLowerCase())) {
          confidence -= 0.1;
        }
      }
    }

    if (confidence < rule.minConfidence) {
      return null;
    }

    return {
      methodology: rule.methodology,
      confidence,
      evidence,
      timestamp: Date.now(),
      filePath
    };
  }

  /**
   * DDD 패턴 분석
   */
  private analyzeDDDPatterns(filePath: string, content: string): void {
    // Entity 감지
    const entityMatches = content.match(/class\s+(\w+)Entity/g);
    if (entityMatches) {
      entityMatches.forEach(match => {
        const entityName = match.replace(/class\s+/, '').replace(/Entity/, '');
        this.updateDDDContext('entity', entityName, filePath);
      });
    }

    // Aggregate 감지
    const aggregateMatches = content.match(/class\s+(\w+)Aggregate/g);
    if (aggregateMatches) {
      aggregateMatches.forEach(match => {
        const aggregateName = match.replace(/class\s+/, '').replace(/Aggregate/, '');
        this.updateDDDContext('aggregate', aggregateName, filePath);
      });
    }

    // Repository 감지
    const repoMatches = content.match(/(?:class|interface)\s+(\w+)Repository/g);
    if (repoMatches) {
      repoMatches.forEach(match => {
        const repoName = match.replace(/(?:class|interface)\s+/, '').replace(/Repository/, '');
        this.updateDDDContext('repository', repoName, filePath);
      });
    }

    this.emit('dddPatternFound', DDDPattern.DOMAIN_MODEL, this.dddContext);
  }

  /**
   * TDD 패턴 분석
   */
  private analyzeTDDPatterns(_filePath: string, content: string): void {
    // 테스트 수 계산
    const testMatches = content.match(/(?:test|it|describe)\s*\(/g);
    if (testMatches) {
      this.tddState.testCount += testMatches.length;
    }

    // 코드 커버리지 주석 찾기
    const coverageMatch = content.match(/coverage:\s*(\d+)%/);
    if (coverageMatch) {
      this.tddState.coverage = parseInt(coverageMatch[1]);
    }
  }

  /**
   * BDD 패턴 분석
   */
  private analyzeBDDPatterns(filePath: string, content: string): void {
    // Feature 파일 파싱
    const featureMatch = content.match(/Feature:\s*(.+)/);
    if (featureMatch) {
      const featureName = featureMatch[1]?.trim() || '';
      
      // Scenario 파싱
      const scenarios = content.split(/Scenario:/);
      scenarios.slice(1).forEach(scenarioText => {
        const scenarioName = scenarioText.split('\n')[0]?.trim() || '';
        const steps = this.parseBDDSteps(scenarioText);
        
        const scenario: BDDScenario = {
          feature: featureName,
          scenario: scenarioName,
          steps,
          tags: [],
          status: 'pending',
          filePath
        };

        this.bddScenarios.set(`${featureName}:${scenarioName}`, scenario);
        this.emit('bddScenarioUpdated', scenario);
      });
    }
  }

  /**
   * EDA 패턴 분석
   */
  private analyzeEDAPatterns(filePath: string, content: string): void {
    // Event 클래스 감지
    const eventMatches = content.match(/class\s+(\w+)Event/g);
    if (eventMatches) {
      eventMatches.forEach(match => {
        const eventName = match!.replace(/class\s+/, '');
        this.edaEventFlow.events.set(eventName, {
          name: eventName,
          type: 'domain_event',
          producers: [],
          consumers: []
        });
      });
    }

    // Handler 클래스 감지
    const handlerMatches = content.match(/class\s+(\w+)Handler/g);
    if (handlerMatches) {
      handlerMatches.forEach(match => {
        const handlerName = match!.replace(/class\s+/, '');
        this.edaEventFlow.handlers.set(handlerName, {
          name: handlerName,
          eventTypes: [],
          handlerType: 'sync',
          filePath
        });
      });
    }

    // Saga 클래스 감지
    const sagaMatches = content.match(/class\s+(\w+)Saga/g);
    if (sagaMatches) {
      sagaMatches.forEach(match => {
        const sagaName = match!.replace(/class\s+/, '');
        this.edaEventFlow.sagas.set(sagaName, {
          name: sagaName,
          steps: [],
          compensations: [],
          status: 'active'
        });
      });
    }

    this.emit('edaEventFlowChanged', this.edaEventFlow);
  }

  /**
   * BDD 스텝 파싱
   */
  private parseBDDSteps(scenarioText: string): BDDStep[] {
    const steps: BDDStep[] = [];
    const stepPatterns = [
      { type: BDDElement.GIVEN, pattern: /Given\s+(.+)/ },
      { type: BDDElement.WHEN, pattern: /When\s+(.+)/ },
      { type: BDDElement.THEN, pattern: /Then\s+(.+)/ },
      { type: BDDElement.AND, pattern: /And\s+(.+)/ },
      { type: BDDElement.BUT, pattern: /But\s+(.+)/ }
    ];

    const lines = scenarioText.split('\n');
    for (const line of lines) {
      for (const { type, pattern } of stepPatterns) {
        const match = line.match(pattern);
        if (match) {
          steps.push({
            type,
            text: match[1]?.trim() || ''
          });
          break;
        }
      }
    }

    return steps;
  }

  /**
   * DDD 컨텍스트 업데이트
   */
  private updateDDDContext(type: string, name: string, filePath: string): void {
    const contextPath = filePath.split('/').slice(0, -1).join('/');
    const contextName = this.inferBoundedContext(filePath);

    if (!this.dddContext.boundedContexts.has(contextName)) {
      this.dddContext.boundedContexts.set(contextName, {
        name: contextName,
        path: contextPath,
        entities: [],
        valueObjects: [],
        services: [],
        repositories: []
      });
    }

    const context = this.dddContext.boundedContexts.get(contextName)!;
    switch (type) {
      case 'entity':
        if (!context.entities.includes(name)) {
          context.entities.push(name);
        }
        break;
      case 'repository':
        if (!context.repositories.includes(name)) {
          context.repositories.push(name);
        }
        break;
      case 'service':
        if (!context.services.includes(name)) {
          context.services.push(name);
        }
        break;
    }

    // Ubiquitous Language 추출
    const words = name.match(/[A-Z][a-z]+/g);
    if (words) {
      words.forEach(word => this.dddContext.ubiquitousTerms.add(word));
    }
  }

  /**
   * Bounded Context 추론
   */
  private inferBoundedContext(filePath: string): string {
    const parts = filePath.split('/');
    const domainIndex = parts.findIndex(p => p === 'domain' || p === 'domains');
    if (domainIndex !== -1 && domainIndex < parts.length - 1) {
      return parts[domainIndex + 1];
    }
    return 'default';
  }

  /**
   * TDD 사이클 전환
   */
  private transitionTDDPhase(newPhase: TDDCycle): void {
    const oldPhase = this.tddState.currentPhase;
    const phaseDuration = Date.now() - this.tddState.phaseStartTime;

    this.tddState.currentPhase = newPhase;
    this.tddState.phaseStartTime = Date.now();

    // 사이클 완료 감지
    if (oldPhase === TDDCycle.REFACTOR && newPhase === TDDCycle.RED) {
      this.tddState.cycleCount++;
      const totalTime = this.tddState.averageCycleTime * (this.tddState.cycleCount - 1) + phaseDuration;
      this.tddState.averageCycleTime = totalTime / this.tddState.cycleCount;
    }

    this.emit('tddCycleChanged', this.tddState);
  }

  /**
   * TDD 사이클 업데이트 (커밋 메시지 기반)
   */
  private updateTDDCycle(message: string): void {
    if (message.match(/failing test|red/i)) {
      this.transitionTDDPhase(TDDCycle.RED);
    } else if (message.match(/passing test|green/i)) {
      this.transitionTDDPhase(TDDCycle.GREEN);
    } else if (message.match(/refactor/i)) {
      this.transitionTDDPhase(TDDCycle.REFACTOR);
    }
  }

  /**
   * 감지 추가
   */
  private addDetection(detection: MethodologyDetection): void {
    this.detections.push(detection);
    
    // 오래된 감지 제거
    const cutoff = Date.now() - this.DETECTION_WINDOW;
    this.detections = this.detections.filter(d => d.timestamp > cutoff);
  }

  /**
   * 점수 업데이트
   */
  private updateScores(): void {
    const scores = new Map<DevelopmentMethodology, MethodologyScore>();

    for (const methodology of Object.values(DevelopmentMethodology)) {
      const score = this.calculateMethodologyScore(methodology as DevelopmentMethodology);
      scores.set(methodology as DevelopmentMethodology, score);
    }

    this.methodologyScores = scores;
    const scoresObj: Record<DevelopmentMethodology, MethodologyScore> = {
      [DevelopmentMethodology.DDD]: scores.get(DevelopmentMethodology.DDD)!,
      [DevelopmentMethodology.TDD]: scores.get(DevelopmentMethodology.TDD)!,
      [DevelopmentMethodology.BDD]: scores.get(DevelopmentMethodology.BDD)!,
      [DevelopmentMethodology.EDA]: scores.get(DevelopmentMethodology.EDA)!
    };
    this.emit('scoreUpdated', scoresObj);
  }

  /**
   * 방법론 점수 계산
   */
  private calculateMethodologyScore(methodology: DevelopmentMethodology): MethodologyScore {
    const recentDetections = this.detections.filter(
      d => d.methodology === methodology && 
      d.timestamp > Date.now() - this.DETECTION_WINDOW
    );

    let score = 0;
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const recommendations: string[] = [];
    const details: Record<string, any> = {};

    switch (methodology) {
      case DevelopmentMethodology.DDD:
        const dddScore = this.calculateDDDScore();
        score = dddScore.score;
        strengths.push(...dddScore.strengths);
        weaknesses.push(...dddScore.weaknesses);
        recommendations.push(...dddScore.recommendations);
        details.ddd = dddScore.details;
        break;

      case DevelopmentMethodology.TDD:
        const tddScore = this.calculateTDDScore();
        score = tddScore.score;
        strengths.push(...tddScore.strengths);
        weaknesses.push(...tddScore.weaknesses);
        recommendations.push(...tddScore.recommendations);
        details.tdd = tddScore.details;
        break;

      case DevelopmentMethodology.BDD:
        const bddScore = this.calculateBDDScore();
        score = bddScore.score;
        strengths.push(...bddScore.strengths);
        weaknesses.push(...bddScore.weaknesses);
        recommendations.push(...bddScore.recommendations);
        details.bdd = bddScore.details;
        break;

      case DevelopmentMethodology.EDA:
        const edaScore = this.calculateEDAScore();
        score = edaScore.score;
        strengths.push(...edaScore.strengths);
        weaknesses.push(...edaScore.weaknesses);
        recommendations.push(...edaScore.recommendations);
        details.eda = edaScore.details;
        break;
    }

    // 감지 빈도 고려
    const detectionFrequency = recentDetections.length / 10; // 10개 감지를 100%로
    score = Math.min(100, score * (0.7 + 0.3 * Math.min(1, detectionFrequency)));

    return {
      methodology,
      score: Math.round(score),
      strengths,
      weaknesses,
      recommendations,
      details
    };
  }

  /**
   * DDD 점수 계산
   */
  private calculateDDDScore(): {
    score: number;
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
    details: any;
  } {
    let score = 0;
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const recommendations: string[] = [];

    // Bounded Context 평가
    const contextCount = this.dddContext.boundedContexts.size;
    if (contextCount > 0) {
      score += Math.min(20, contextCount * 5);
      strengths.push(`${contextCount} bounded contexts defined`);
    } else {
      weaknesses.push('No bounded contexts identified');
      recommendations.push('Define clear bounded contexts for your domains');
    }

    // Ubiquitous Language 평가
    const termCount = this.dddContext.ubiquitousTerms.size;
    if (termCount > 10) {
      score += 15;
      strengths.push(`Rich ubiquitous language with ${termCount} terms`);
    } else if (termCount > 5) {
      score += 10;
    } else {
      weaknesses.push('Limited ubiquitous language');
      recommendations.push('Develop a comprehensive ubiquitous language');
    }

    // Entity/Aggregate 평가
    let totalEntities = 0;
    let totalAggregates = 0;
    this.dddContext.boundedContexts.forEach(context => {
      totalEntities += context.entities.length;
    });
    totalAggregates = this.dddContext.aggregates.size;

    if (totalEntities > 0) {
      score += Math.min(20, totalEntities * 2);
      strengths.push(`${totalEntities} entities modeled`);
    }

    if (totalAggregates > 0) {
      score += Math.min(15, totalAggregates * 5);
      strengths.push(`${totalAggregates} aggregates defined`);
    } else {
      weaknesses.push('No aggregate roots identified');
      recommendations.push('Define aggregate roots to maintain consistency boundaries');
    }

    // Repository 패턴 평가
    let totalRepos = 0;
    this.dddContext.boundedContexts.forEach(context => {
      totalRepos += context.repositories.length;
    });

    if (totalRepos > 0) {
      score += Math.min(15, totalRepos * 3);
      strengths.push(`${totalRepos} repositories implemented`);
    }

    // Context relationships 평가
    if (this.dddContext.relationships.length > 0) {
      score += 15;
      strengths.push('Context relationships defined');
    } else if (contextCount > 1) {
      weaknesses.push('No relationships between bounded contexts');
      recommendations.push('Define relationships between bounded contexts');
    }

    return {
      score,
      strengths,
      weaknesses,
      recommendations,
      details: {
        boundedContexts: contextCount,
        entities: totalEntities,
        aggregates: totalAggregates,
        repositories: totalRepos,
        ubiquitousTerms: termCount,
        relationships: this.dddContext.relationships.length
      }
    };
  }

  /**
   * TDD 점수 계산
   */
  private calculateTDDScore(): {
    score: number;
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
    details: any;
  } {
    let score = 0;
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const recommendations: string[] = [];

    // 테스트 수 평가
    if (this.tddState.testCount > 0) {
      score += Math.min(20, this.tddState.testCount / 5);
      strengths.push(`${this.tddState.testCount} tests written`);
    } else {
      weaknesses.push('No tests found');
      recommendations.push('Start writing tests for your code');
    }

    // 테스트 성공률 평가
    if (this.tddState.testCount > 0) {
      const passRate = this.tddState.passingTests / this.tddState.testCount;
      score += passRate * 25;
      if (passRate > 0.9) {
        strengths.push(`High test pass rate: ${Math.round(passRate * 100)}%`);
      } else if (passRate < 0.7) {
        weaknesses.push(`Low test pass rate: ${Math.round(passRate * 100)}%`);
        recommendations.push('Fix failing tests to maintain code quality');
      }
    }

    // 커버리지 평가
    if (this.tddState.coverage > 0) {
      score += Math.min(25, this.tddState.coverage / 4);
      if (this.tddState.coverage > 80) {
        strengths.push(`Excellent code coverage: ${this.tddState.coverage}%`);
      } else if (this.tddState.coverage < 60) {
        weaknesses.push(`Low code coverage: ${this.tddState.coverage}%`);
        recommendations.push('Increase test coverage to at least 80%');
      }
    }

    // TDD 사이클 평가
    if (this.tddState.cycleCount > 0) {
      score += Math.min(20, this.tddState.cycleCount * 2);
      strengths.push(`${this.tddState.cycleCount} TDD cycles completed`);
      
      if (this.tddState.averageCycleTime < 1800000) { // 30분
        score += 10;
        strengths.push('Fast TDD cycles');
      } else {
        weaknesses.push('Slow TDD cycles');
        recommendations.push('Aim for shorter red-green-refactor cycles');
      }
    } else {
      weaknesses.push('No complete TDD cycles detected');
      recommendations.push('Follow the red-green-refactor cycle');
    }

    return {
      score,
      strengths,
      weaknesses,
      recommendations,
      details: {
        testCount: this.tddState.testCount,
        passingTests: this.tddState.passingTests,
        failingTests: this.tddState.failingTests,
        coverage: this.tddState.coverage,
        cycleCount: this.tddState.cycleCount,
        averageCycleTime: this.tddState.averageCycleTime,
        currentPhase: this.tddState.currentPhase
      }
    };
  }

  /**
   * BDD 점수 계산
   */
  private calculateBDDScore(): {
    score: number;
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
    details: any;
  } {
    let score = 0;
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const recommendations: string[] = [];

    // Feature 수 평가
    const features = new Set(Array.from(this.bddScenarios.values()).map(s => s.feature));
    if (features.size > 0) {
      score += Math.min(20, features.size * 5);
      strengths.push(`${features.size} features defined`);
    } else {
      weaknesses.push('No BDD features found');
      recommendations.push('Create feature files to describe behavior');
    }

    // Scenario 수 평가
    if (this.bddScenarios.size > 0) {
      score += Math.min(25, this.bddScenarios.size * 2);
      strengths.push(`${this.bddScenarios.size} scenarios written`);
    }

    // Scenario 상태 평가
    let passingScenarios = 0;
    let failingScenarios = 0;
    this.bddScenarios.forEach(scenario => {
      if (scenario.status === 'passing') passingScenarios++;
      if (scenario.status === 'failing') failingScenarios++;
    });

    if (passingScenarios > 0) {
      const passRate = passingScenarios / this.bddScenarios.size;
      score += passRate * 25;
      if (passRate > 0.9) {
        strengths.push('High scenario pass rate');
      }
    }

    if (failingScenarios > 0) {
      weaknesses.push(`${failingScenarios} failing scenarios`);
      recommendations.push('Fix failing scenarios to ensure behavior compliance');
    }

    // Step 완성도 평가
    let totalSteps = 0;
    let implementedSteps = 0;
    this.bddScenarios.forEach(scenario => {
      totalSteps += scenario.steps.length;
      implementedSteps += scenario.steps.filter(s => s.status === 'passing').length;
    });

    if (totalSteps > 0) {
      const stepCompleteness = implementedSteps / totalSteps;
      score += stepCompleteness * 30;
      if (stepCompleteness < 0.7) {
        weaknesses.push('Many unimplemented steps');
        recommendations.push('Implement all Given-When-Then steps');
      }
    }

    return {
      score,
      strengths,
      weaknesses,
      recommendations,
      details: {
        features: features.size,
        scenarios: this.bddScenarios.size,
        passingScenarios,
        failingScenarios,
        totalSteps,
        implementedSteps
      }
    };
  }

  /**
   * EDA 점수 계산
   */
  private calculateEDAScore(): {
    score: number;
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
    details: any;
  } {
    let score = 0;
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const recommendations: string[] = [];

    // Event 수 평가
    if (this.edaEventFlow.events.size > 0) {
      score += Math.min(20, this.edaEventFlow.events.size * 2);
      strengths.push(`${this.edaEventFlow.events.size} events defined`);
    } else {
      weaknesses.push('No events defined');
      recommendations.push('Define domain events for your system');
    }

    // Handler 수 평가
    if (this.edaEventFlow.handlers.size > 0) {
      score += Math.min(20, this.edaEventFlow.handlers.size * 2);
      strengths.push(`${this.edaEventFlow.handlers.size} event handlers`);
    } else {
      weaknesses.push('No event handlers found');
      recommendations.push('Implement handlers for your events');
    }

    // Event-Handler 매칭 평가
    let matchedEvents = 0;
    this.edaEventFlow.events.forEach(event => {
      if (event.consumers.length > 0) {
        matchedEvents++;
      }
    });

    if (matchedEvents > 0) {
      const matchRate = matchedEvents / this.edaEventFlow.events.size;
      score += matchRate * 20;
      if (matchRate < 0.8) {
        weaknesses.push('Some events have no handlers');
        recommendations.push('Ensure all events have appropriate handlers');
      }
    }

    // Saga 평가
    if (this.edaEventFlow.sagas.size > 0) {
      score += Math.min(20, this.edaEventFlow.sagas.size * 5);
      strengths.push(`${this.edaEventFlow.sagas.size} sagas implemented`);
      
      // Saga 완성도 평가
      let completeSagas = 0;
      this.edaEventFlow.sagas.forEach(saga => {
        if (saga.compensations.length === saga.steps.length) {
          completeSagas++;
        }
      });
      
      if (completeSagas < this.edaEventFlow.sagas.size) {
        weaknesses.push('Some sagas lack compensations');
        recommendations.push('Implement compensations for all saga steps');
      }
    }

    // Event Flow 복잡도 평가
    if (this.edaEventFlow.eventFlows.length > 0) {
      score += Math.min(20, this.edaEventFlow.eventFlows.length);
      strengths.push('Event flows mapped');
      
      // 비동기 처리 평가
      const asyncFlows = this.edaEventFlow.eventFlows.filter(f => f.isAsync).length;
      if (asyncFlows > 0) {
        strengths.push('Asynchronous event processing');
      }
    }

    return {
      score,
      strengths,
      weaknesses,
      recommendations,
      details: {
        events: this.edaEventFlow.events.size,
        handlers: this.edaEventFlow.handlers.size,
        sagas: this.edaEventFlow.sagas.size,
        eventFlows: this.edaEventFlow.eventFlows.length,
        matchedEvents
      }
    };
  }

  /**
   * Glob 패턴 매칭
   */
  private matchGlobPattern(path: string, pattern: string): boolean {
    // 간단한 glob 패턴 매칭 구현
    const regexPattern = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.');
    
    return new RegExp(regexPattern).test(path);
  }

  /**
   * 분석 결과 가져오기
   */
  analyze(): MethodologyAnalysisResult {
    const scores: Record<DevelopmentMethodology, MethodologyScore> = {
      [DevelopmentMethodology.DDD]: this.methodologyScores.get(DevelopmentMethodology.DDD)!,
      [DevelopmentMethodology.TDD]: this.methodologyScores.get(DevelopmentMethodology.TDD)!,
      [DevelopmentMethodology.BDD]: this.methodologyScores.get(DevelopmentMethodology.BDD)!,
      [DevelopmentMethodology.EDA]: this.methodologyScores.get(DevelopmentMethodology.EDA)!
    };
    
    // 전체 점수 계산
    const methodologyValues = Object.values(scores);
    const overallScore = methodologyValues.length > 0
      ? Math.round(methodologyValues.reduce((sum, s) => sum + s.score, 0) / methodologyValues.length)
      : 0;

    // 주요 방법론 결정
    let dominantMethodology: DevelopmentMethodology | null = null;
    let highestScore = 0;
    for (const [methodology, score] of Object.entries(scores)) {
      if (score.score > highestScore && score.score > 50) {
        highestScore = score.score;
        dominantMethodology = methodology as DevelopmentMethodology;
      }
    }

    // 트렌드 계산
    const trends = this.calculateTrends();

    return {
      timestamp: Date.now(),
      detections: this.detections,
      scores,
      overallScore,
      dominantMethodology,
      trends
    };
  }

  /**
   * 방법론 사용 트렌드 계산
   */
  private calculateTrends(): MethodologyTrend[] {
    const trends: MethodologyTrend[] = [];
    const hourlyWindow = 3600000; // 1시간
    const now = Date.now();

    for (const methodology of Object.values(DevelopmentMethodology)) {
      const hourlyUsage: number[] = [];
      
      // 최근 24시간의 시간별 사용량 계산
      for (let i = 23; i >= 0; i--) {
        const startTime = now - (i + 1) * hourlyWindow;
        const endTime = now - i * hourlyWindow;
        
        const count = this.detections.filter(
          d => d.methodology === methodology &&
          d.timestamp >= startTime &&
          d.timestamp < endTime
        ).length;
        
        hourlyUsage.push(count);
      }

      // 성장률 계산 (최근 12시간 vs 이전 12시간)
      const recent = hourlyUsage.slice(12).reduce((a, b) => a + b, 0);
      const previous = hourlyUsage.slice(0, 12).reduce((a, b) => a + b, 0);
      const growth = previous > 0 ? ((recent - previous) / previous) * 100 : 0;

      trends.push({
        methodology: methodology as DevelopmentMethodology,
        usage: hourlyUsage,
        timeWindow: 'hour',
        growth: Math.round(growth)
      });
    }

    return trends;
  }

  /**
   * 상태 초기화
   */
  reset(): void {
    this.detections = [];
    this.tddState = this.initializeTDDState();
    this.dddContext = this.initializeDDDContext();
    this.bddScenarios.clear();
    this.edaEventFlow = this.initializeEDAEventFlow();
    this.methodologyScores.clear();

    // 초기 점수 재설정
    for (const methodology of Object.values(DevelopmentMethodology)) {
      this.methodologyScores.set(methodology as DevelopmentMethodology, {
        methodology: methodology as DevelopmentMethodology,
        score: 0,
        strengths: [],
        weaknesses: [],
        recommendations: [],
        details: {}
      });
    }
  }
}