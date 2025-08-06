/**
 * DevFlow Monitor MCP - Stage Analyzer
 * 
 * 개발 프로세스의 13단계를 자동으로 감지하고 추적하는 분석기
 */

import { EventEmitter } from 'eventemitter3';
import { 
  DevelopmentStage, 
  CodingSubStage,
  StageTransition,
  StageActivity,
  ActivityIndicator,
  StageDetectionRule,
  StageAnalysisResult
} from './types/stage.js';
import { BaseEvent, EventCategory } from '../events/types/base.js';
import { FileEvent } from '../events/types/file.js';
import { GitEvent, GitCommitEventData, GitBranchEventData } from '../events/types/git.js';
import { EventEngine } from '../events/engine.js';
import { StorageManager } from '../storage/storage-manager.js';

/**
 * 단계 분석기 설정
 */
interface StageAnalyzerConfig {
  confidenceThreshold: number;
  transitionCooldown: number; // 단계 전환 쿨다운 (ms)
  historySize: number;
  eventEngine: EventEngine;
  storageManager?: StorageManager;
}

/**
 * 단계 분석기 이벤트
 */
interface StageAnalyzerEvents {
  'stage:transition': (transition: StageTransition) => void;
  'stage:detected': (stage: DevelopmentStage, confidence: number) => void;
  'substage:detected': (subStage: CodingSubStage) => void;
  'analysis:complete': (result: StageAnalysisResult) => void;
}

/**
 * 개발 단계 분석기
 */
export class StageAnalyzer extends EventEmitter<StageAnalyzerEvents> {
  private currentStage: DevelopmentStage | null = null;
  private currentSubStages: Set<CodingSubStage> = new Set();
  private stageActivities: Map<DevelopmentStage, StageActivity[]> = new Map();
  private recentTransitions: StageTransition[] = [];
  private detectionRules: Map<DevelopmentStage, StageDetectionRule>;
  private lastTransitionTime: number = 0;
  private readonly config: StageAnalyzerConfig;

  constructor(config: StageAnalyzerConfig) {
    super();
    this.config = config;
    this.detectionRules = this.initializeDetectionRules();
    this.setupEventListeners();
  }

  /**
   * 이벤트 리스너 설정
   */
  private setupEventListeners(): void {
    const { eventEngine } = this.config;

    // 파일 이벤트 처리
    eventEngine.on('event:published', (event: BaseEvent) => {
      if (event.category === EventCategory.FILE) {
        this.handleFileEvent(event as FileEvent);
      } else if (event.category === EventCategory.GIT) {
        this.handleGitEvent(event as GitEvent);
      }
    });
  }

  /**
   * 감지 규칙 초기화
   */
  private initializeDetectionRules(): Map<DevelopmentStage, StageDetectionRule> {
    const rules = new Map<DevelopmentStage, StageDetectionRule>();

    // PRD 단계
    rules.set(DevelopmentStage.PRD, {
      stage: DevelopmentStage.PRD,
      patterns: [
        { type: 'file', pattern: /\/(PRD|prd)\.(md|txt|docx?)$/i, weight: 0.8 },
        { type: 'content', pattern: /product\s+requirements?\s+document/i, weight: 0.6 },
        { type: 'file', pattern: /requirements?\.(md|txt)$/i, weight: 0.5 },
      ],
      requiredConfidence: 0.7
    });

    // 기획서 단계
    rules.set(DevelopmentStage.PLANNING, {
      stage: DevelopmentStage.PLANNING,
      patterns: [
        { type: 'file', pattern: /planning\.(md|txt|docx?)$/i, weight: 0.8 },
        { type: 'file', pattern: /기획서\.(md|txt|docx?)$/i, weight: 0.8 },
        { type: 'content', pattern: /기획서|planning\s+document/i, weight: 0.6 },
      ],
      requiredConfidence: 0.7
    });

    // ERD 단계
    rules.set(DevelopmentStage.ERD, {
      stage: DevelopmentStage.ERD,
      patterns: [
        { type: 'file', pattern: /\.(erd|erdx|sql|ddl)$/i, weight: 0.8 },
        { type: 'file', pattern: /schema\.(sql|json|yml)$/i, weight: 0.7 },
        { type: 'content', pattern: /CREATE\s+TABLE|FOREIGN\s+KEY/i, weight: 0.6 },
        { type: 'file', pattern: /database|schema/i, weight: 0.4 },
      ],
      requiredConfidence: 0.6
    });

    // Wireframe 단계
    rules.set(DevelopmentStage.WIREFRAME, {
      stage: DevelopmentStage.WIREFRAME,
      patterns: [
        { type: 'file', pattern: /\.(fig|sketch|xd|wireframe)$/i, weight: 0.9 },
        { type: 'file', pattern: /wireframe/i, weight: 0.7 },
        { type: 'api', pattern: /figma|sketch|adobe/i, weight: 0.8 },
      ],
      requiredConfidence: 0.7
    });

    // 화면단위 기획서 단계
    rules.set(DevelopmentStage.SCREEN_DESIGN, {
      stage: DevelopmentStage.SCREEN_DESIGN,
      patterns: [
        { type: 'file', pattern: /screen[\-_]?design|화면[\-_]?기획/i, weight: 0.8 },
        { type: 'file', pattern: /UI[\-_]?spec|screen[\-_]?spec/i, weight: 0.7 },
        { type: 'content', pattern: /화면\s*기획|screen\s*design/i, weight: 0.6 },
      ],
      requiredConfidence: 0.6
    });

    // 디자인 단계
    rules.set(DevelopmentStage.DESIGN, {
      stage: DevelopmentStage.DESIGN,
      patterns: [
        { type: 'file', pattern: /\.(psd|ai|fig|sketch|xd)$/i, weight: 0.9 },
        { type: 'file', pattern: /design|mockup/i, weight: 0.6 },
        { type: 'api', pattern: /figma|adobe|sketch/i, weight: 0.7 },
        { type: 'file', pattern: /\.(png|jpg|svg)$/i, weight: 0.3 },
      ],
      requiredConfidence: 0.6
    });

    // Frontend 단계
    rules.set(DevelopmentStage.FRONTEND, {
      stage: DevelopmentStage.FRONTEND,
      patterns: [
        { type: 'file', pattern: /\.(jsx?|tsx?|vue|svelte)$/i, weight: 0.8 },
        { type: 'file', pattern: /\/(components?|pages?|views?)\//i, weight: 0.7 },
        { type: 'content', pattern: /import\s+React|Vue\.component|Angular/i, weight: 0.6 },
        { type: 'file', pattern: /\.(css|scss|less|styled)$/i, weight: 0.4 },
      ],
      requiredConfidence: 0.6
    });

    // Backend 단계
    rules.set(DevelopmentStage.BACKEND, {
      stage: DevelopmentStage.BACKEND,
      patterns: [
        { type: 'file', pattern: /\/(api|server|backend|controllers?|models?|services?)\//i, weight: 0.8 },
        { type: 'file', pattern: /\.(py|java|go|rs|rb|php)$/i, weight: 0.6 },
        { type: 'content', pattern: /app\.(get|post|put|delete)|@RestController|router\./i, weight: 0.7 },
        { type: 'file', pattern: /\/(routes?|endpoints?|handlers?)\//i, weight: 0.6 },
      ],
      requiredConfidence: 0.6
    });

    // AI 협업 단계
    rules.set(DevelopmentStage.AI_COLLABORATION, {
      stage: DevelopmentStage.AI_COLLABORATION,
      patterns: [
        { type: 'content', pattern: /claude|copilot|chatgpt|ai[\-_]?prompt/i, weight: 0.8 },
        { type: 'file', pattern: /prompt|claude|copilot/i, weight: 0.7 },
        { type: 'event', pattern: /ai_tool_used/i, weight: 0.9 },
      ],
      requiredConfidence: 0.6
    });

    // 코딩 단계
    rules.set(DevelopmentStage.CODING, {
      stage: DevelopmentStage.CODING,
      patterns: [
        { type: 'file', pattern: /\.(js|ts|py|java|go|rs|rb|php|cs|cpp|c)$/i, weight: 0.5 },
        { type: 'git', pattern: /feat:|fix:|refactor:/i, weight: 0.7 },
        { type: 'content', pattern: /function|class|interface|impl/i, weight: 0.4 },
      ],
      requiredConfidence: 0.5
    });

    // Git 관리 단계
    rules.set(DevelopmentStage.GIT_MANAGEMENT, {
      stage: DevelopmentStage.GIT_MANAGEMENT,
      patterns: [
        { type: 'git', pattern: /merge|branch|commit|push|pull/i, weight: 0.8 },
        { type: 'file', pattern: /\.git\//i, weight: 0.5 },
        { type: 'content', pattern: /git\s+(add|commit|push|merge)/i, weight: 0.7 },
      ],
      requiredConfidence: 0.6
    });

    // 배포 단계
    rules.set(DevelopmentStage.DEPLOYMENT, {
      stage: DevelopmentStage.DEPLOYMENT,
      patterns: [
        { type: 'file', pattern: /\.(yml|yaml)$/i, weight: 0.5 },
        { type: 'file', pattern: /Dockerfile|docker-compose/i, weight: 0.8 },
        { type: 'file', pattern: /\.github\/workflows/i, weight: 0.8 },
        { type: 'content', pattern: /deploy|build|release/i, weight: 0.6 },
        { type: 'git', pattern: /release:|deploy:/i, weight: 0.8 },
      ],
      requiredConfidence: 0.7
    });

    // 운영 단계
    rules.set(DevelopmentStage.OPERATION, {
      stage: DevelopmentStage.OPERATION,
      patterns: [
        { type: 'file', pattern: /monitoring|metrics|logs/i, weight: 0.7 },
        { type: 'content', pattern: /monitoring|production|operation/i, weight: 0.6 },
        { type: 'git', pattern: /hotfix:|patch:/i, weight: 0.8 },
      ],
      requiredConfidence: 0.7
    });

    return rules;
  }

  /**
   * 파일 이벤트 처리
   */
  private handleFileEvent(event: FileEvent): void {
    const indicators: ActivityIndicator[] = [];
    
    // 파일 경로 및 내용 기반 단계 감지
    for (const [stage, rule] of this.detectionRules) {
      let confidence = 0;
      
      for (const pattern of rule.patterns) {
        if (pattern.type === 'file') {
          const regex = pattern.pattern instanceof RegExp ? pattern.pattern : new RegExp(pattern.pattern);
          const filePath = event.data.newFile.path;
          if (regex.test(filePath)) {
            confidence += pattern.weight;
            indicators.push({
              type: 'file_pattern',
              value: filePath,
              timestamp: event.timestamp,
              source: 'file_event'
            });
          }
        }
      }

      if (confidence >= rule.requiredConfidence) {
        this.detectStage(stage, confidence, indicators);
      }
    }

    // 코딩 세부 단계 감지
    this.detectCodingSubStage(event);
  }

  /**
   * Git 이벤트 처리
   */
  private handleGitEvent(event: GitEvent): void {
    const indicators: ActivityIndicator[] = [];
    
    for (const [stage, rule] of this.detectionRules) {
      let confidence = 0;
      
      for (const pattern of rule.patterns) {
        if (pattern.type === 'git') {
          const regex = pattern.pattern instanceof RegExp ? pattern.pattern : new RegExp(pattern.pattern);
          
          // 커밋 메시지 확인
          if (event.type.includes('commit') && 'commit' in event.data) {
            const commitData = event.data as GitCommitEventData;
            if (regex.test(commitData.commit.message)) {
              confidence += pattern.weight;
              indicators.push({
                type: 'git_commit',
                value: commitData.commit.message,
                timestamp: event.timestamp,
                source: 'git_event'
              });
            }
          }
          
          // Git 작업 유형 확인
          if (regex.test(event.type)) {
            confidence += pattern.weight * 0.5;
          }
        }
      }

      if (confidence >= rule.requiredConfidence) {
        this.detectStage(stage, confidence, indicators);
      }
    }

    // 코딩 세부 단계 감지
    this.detectCodingSubStage(event);
  }

  /**
   * 단계 감지
   */
  private detectStage(stage: DevelopmentStage, confidence: number, indicators: ActivityIndicator[]): void {
    // 쿨다운 확인
    const now = Date.now();
    if (now - this.lastTransitionTime < this.config.transitionCooldown) {
      return;
    }

    // 신뢰도 임계값 확인
    if (confidence < this.config.confidenceThreshold) {
      return;
    }

    // 단계 전환 처리
    if (this.currentStage !== stage) {
      const transition: StageTransition = {
        fromStage: this.currentStage,
        toStage: stage,
        timestamp: now,
        confidence,
        reason: `Detected ${indicators.length} indicators with confidence ${confidence.toFixed(2)}`
      };

      this.currentStage = stage;
      this.lastTransitionTime = now;
      this.recentTransitions.push(transition);

      // 히스토리 크기 제한
      if (this.recentTransitions.length > this.config.historySize) {
        this.recentTransitions.shift();
      }

      // 이벤트 발행
      this.emit('stage:transition', transition);
      this.emit('stage:detected', stage, confidence);

      // 저장소에 기록
      if (this.config.storageManager) {
        this.saveTransition(transition);
      }
    }

    // 활동 기록
    this.recordActivity(stage, indicators, confidence);
  }

  /**
   * 활동 기록
   */
  private recordActivity(stage: DevelopmentStage, indicators: ActivityIndicator[], confidence: number): void {
    const activities = this.stageActivities.get(stage) || [];
    
    const currentActivity = activities[activities.length - 1];
    const now = Date.now();

    if (currentActivity && !currentActivity.endTime && (now - currentActivity.startTime) < 3600000) {
      // 기존 활동에 추가 (1시간 이내)
      currentActivity.activities.push(...indicators);
      currentActivity.confidence = Math.max(currentActivity.confidence, confidence);
    } else {
      // 새 활동 생성
      activities.push({
        stage,
        startTime: now,
        activities: indicators,
        confidence
      });
    }

    this.stageActivities.set(stage, activities);
  }

  /**
   * 전환 저장
   */
  private async saveTransition(transition: StageTransition): Promise<void> {
    if (!this.config.storageManager) return;

    // TODO: StorageManager에 StageTransitionRepository 추가 필요
    // 현재는 로깅만 수행
    console.log('Stage transition:', {
      from: transition.fromStage || 'start',
      to: transition.toStage,
      confidence: transition.confidence,
      reason: transition.reason,
    });
  }

  /**
   * 현재 분석 결과 가져오기
   */
  public analyze(): StageAnalysisResult {
    const stageProgress = this.calculateStageProgress();
    const suggestions = this.generateSuggestions();

    const result: StageAnalysisResult = {
      currentStage: this.currentStage || DevelopmentStage.PRD,
      confidence: this.getCurrentConfidence(),
      activeSubStages: Array.from(this.currentSubStages),
      recentTransitions: this.recentTransitions,
      stageProgress,
      suggestions
    };

    this.emit('analysis:complete', result);
    return result;
  }

  /**
   * 단계별 진행률 계산
   */
  private calculateStageProgress(): Map<DevelopmentStage, number> {
    const progress = new Map<DevelopmentStage, number>();
    const stageOrder = Object.values(DevelopmentStage);

    for (const stage of stageOrder) {
      const activities = this.stageActivities.get(stage) || [];
      if (activities.length === 0) {
        progress.set(stage, 0);
        continue;
      }

      // 활동 수와 신뢰도 기반 진행률 계산
      const avgConfidence = activities.reduce((sum, a) => sum + a.confidence, 0) / activities.length;
      const activityScore = Math.min(activities.length / 10, 1); // 10개 활동을 100%로 가정
      
      progress.set(stage, Math.round((avgConfidence * 0.7 + activityScore * 0.3) * 100));
    }

    return progress;
  }

  /**
   * 현재 신뢰도 계산
   */
  private getCurrentConfidence(): number {
    if (!this.currentStage) return 0;

    const activities = this.stageActivities.get(this.currentStage) || [];
    if (activities.length === 0) return 0;

    return activities.reduce((sum, a) => sum + a.confidence, 0) / activities.length;
  }

  /**
   * 제안사항 생성
   */
  private generateSuggestions(): string[] {
    const suggestions: string[] = [];

    if (!this.currentStage) {
      suggestions.push('프로젝트를 시작하려면 PRD 문서를 작성하세요.');
      return suggestions;
    }

    const stageOrder = Object.values(DevelopmentStage);
    const currentIndex = stageOrder.indexOf(this.currentStage);

    // 다음 단계 제안
    if (currentIndex < stageOrder.length - 1) {
      const nextStage = stageOrder[currentIndex + 1];
      if (nextStage) {
        suggestions.push(`다음 단계: ${this.getStageDescription(nextStage)}`);
      }
    }

    // 현재 단계 완성도 제안
    const currentProgress = this.calculateStageProgress().get(this.currentStage) || 0;
    if (currentProgress < 80) {
      suggestions.push(`현재 ${this.getStageDescription(this.currentStage)} 단계를 완료하세요. (진행률: ${currentProgress}%)`);
    }

    return suggestions;
  }

  /**
   * 단계 설명 가져오기
   */
  private getStageDescription(stage: DevelopmentStage): string {
    const descriptions: Record<DevelopmentStage, string> = {
      [DevelopmentStage.PRD]: 'PRD (Product Requirements Document) 작성',
      [DevelopmentStage.PLANNING]: '기획서 작성',
      [DevelopmentStage.ERD]: 'ERD (Entity Relationship Diagram) 설계',
      [DevelopmentStage.WIREFRAME]: 'Wireframe 설계',
      [DevelopmentStage.SCREEN_DESIGN]: '화면단위 기획서 작성',
      [DevelopmentStage.DESIGN]: '디자인 작업',
      [DevelopmentStage.FRONTEND]: '프론트엔드 개발',
      [DevelopmentStage.BACKEND]: '백엔드 개발',
      [DevelopmentStage.AI_COLLABORATION]: 'AI 협업',
      [DevelopmentStage.CODING]: '코딩 작업',
      [DevelopmentStage.GIT_MANAGEMENT]: 'Git 관리',
      [DevelopmentStage.DEPLOYMENT]: '배포',
      [DevelopmentStage.OPERATION]: '운영'
    };

    return descriptions[stage] || stage;
  }

  /**
   * 코딩 세부 단계 감지
   */
  private detectCodingSubStage(event: BaseEvent): void {
    if (this.currentStage !== DevelopmentStage.AI_COLLABORATION && 
        this.currentStage !== DevelopmentStage.CODING) {
      return;
    }

    const subStage = this.identifyCodingSubStage(event);
    if (subStage && !this.currentSubStages.has(subStage)) {
      this.currentSubStages.add(subStage);
      this.emit('substage:detected', subStage);
    }
  }

  /**
   * 코딩 세부 단계 식별
   */
  private identifyCodingSubStage(event: BaseEvent): CodingSubStage | null {
    // UseCase 도출
    if (this.matchesPattern(event, [
      /use[_-]?case/i,
      /user[_-]?story/i,
      /scenario/i,
      /requirement/i
    ])) {
      return CodingSubStage.USE_CASE;
    }

    // Event Storming
    if (this.matchesPattern(event, [
      /event[_-]?storm/i,
      /domain[_-]?event/i,
      /aggregate/i,
      /bounded[_-]?context/i
    ])) {
      return CodingSubStage.EVENT_STORMING;
    }

    // Domain 모델링
    if (this.matchesPattern(event, [
      /domain[_-]?model/i,
      /entity/i,
      /value[_-]?object/i,
      /repository/i
    ])) {
      return CodingSubStage.DOMAIN_MODELING;
    }

    // UseCase 상세 설계
    if (this.matchesPattern(event, [
      /detail[_-]?design/i,
      /sequence[_-]?diagram/i,
      /flow[_-]?chart/i,
      /activity[_-]?diagram/i
    ])) {
      return CodingSubStage.USE_CASE_DETAIL;
    }

    // AI 프롬프트 설계
    if (this.matchesPattern(event, [
      /ai[_-]?prompt/i,
      /claude[_-]?prompt/i,
      /gpt[_-]?prompt/i,
      /prompt[_-]?engineering/i
    ])) {
      return CodingSubStage.AI_PROMPT_DESIGN;
    }

    // 1차 뼈대 구현
    if (this.matchesPattern(event, [
      /scaffold/i,
      /skeleton/i,
      /boilerplate/i,
      /initial[_-]?impl/i
    ])) {
      return CodingSubStage.INITIAL_IMPLEMENTATION;
    }

    // 비즈니스 로직 구현
    if (this.matchesPattern(event, [
      /business[_-]?logic/i,
      /service[_-]?impl/i,
      /controller/i,
      /handler/i
    ])) {
      return CodingSubStage.BUSINESS_LOGIC;
    }

    // 리팩토링
    if (this.matchesPattern(event, [
      /refactor/i,
      /cleanup/i,
      /optimize/i,
      /improve/i
    ])) {
      return CodingSubStage.REFACTORING;
    }

    // 단위 테스트
    if (this.matchesPattern(event, [
      /unit[_-]?test/i,
      /\.test\.[jt]sx?$/i,
      /\.spec\.[jt]sx?$/i,
      /describe\(/i,
      /it\(/i,
      /test\(/i
    ])) {
      return CodingSubStage.UNIT_TEST;
    }

    // 통합 테스트
    if (this.matchesPattern(event, [
      /integration[_-]?test/i,
      /api[_-]?test/i,
      /integration/i
    ])) {
      return CodingSubStage.INTEGRATION_TEST;
    }

    // E2E 테스트
    if (this.matchesPattern(event, [
      /e2e[_-]?test/i,
      /end[_-]?to[_-]?end/i,
      /cypress/i,
      /playwright/i,
      /selenium/i
    ])) {
      return CodingSubStage.E2E_TEST;
    }

    return null;
  }

  /**
   * 패턴 매칭 헬퍼
   */
  private matchesPattern(event: BaseEvent, patterns: RegExp[]): boolean {
    const content = this.getEventContent(event);
    if (!content) return false;

    return patterns.some(pattern => pattern.test(content));
  }

  /**
   * 이벤트 컨텐츠 추출
   */
  private getEventContent(event: BaseEvent): string | null {
    if (event.category === EventCategory.FILE) {
      const fileEvent = event as FileEvent;
      return `${fileEvent.data.newFile.path} ${fileEvent.data.context?.type || ''}`;
    }
    
    if (event.category === EventCategory.GIT) {
      const gitEvent = event as GitEvent;
      if ('commit' in gitEvent.data) {
        const commitData = gitEvent.data as GitCommitEventData;
        return commitData.commit.message;
      } else if ('branch' in gitEvent.data) {
        const branchData = gitEvent.data as GitBranchEventData;
        return branchData.branch.name;
      }
      return '';
    }

    if (event.category === EventCategory.SYSTEM) {
      return JSON.stringify(event.data);
    }

    return null;
  }

  /**
   * 세부 단계 진행률 계산
   */
  public getCodingSubStageProgress(): Map<CodingSubStage, number> {
    const progress = new Map<CodingSubStage, number>();
    const allSubStages = Object.values(CodingSubStage);

    for (const subStage of allSubStages) {
      progress.set(subStage, this.currentSubStages.has(subStage) ? 100 : 0);
    }

    return progress;
  }

  /**
   * 단계 전환 히스토리 가져오기
   */
  public getTransitionHistory(limit: number = 10): StageTransition[] {
    return this.recentTransitions.slice(-limit);
  }

  /**
   * 현재 개발 단계 가져오기
   */
  public getCurrentStage(_projectId?: string): DevelopmentStage {
    return this.currentStage || DevelopmentStage.PRD;
  }

  /**
   * 특정 단계의 활동 시간 계산
   */
  public getStageTimeSpent(stage: DevelopmentStage): number {
    const activities = this.stageActivities.get(stage) || [];
    if (activities.length === 0) return 0;

    return activities.reduce((total, activity) => {
      const duration = activity.endTime 
        ? activity.endTime - activity.startTime 
        : Date.now() - activity.startTime;
      return total + duration;
    }, 0);
  }

  /**
   * 리소스 정리
   */
  public dispose(): void {
    this.removeAllListeners();
    this.stageActivities.clear();
    this.recentTransitions = [];
    this.currentSubStages.clear();
  }
}