/**
 * DevFlow Monitor MCP - 사용자 피드백 시스템
 * 
 * 피드백 수집, 분석, 개선 제안 및 A/B 테스트를 통합 관리합니다.
 */

import { EventEmitter } from 'eventemitter3';
import {
  FeedbackMetadata,
  FeedbackType,
  FeedbackStatus,
  FeedbackPriority,
  FeedbackEvent,
  FeedbackEventType,
  ImprovementSuggestion,
  UserPreference,
  ABTestConfig,
  ABTestResult
} from './types.js';
import { FeedbackCollector, FeedbackSubmitOptions } from './collector.js';
import { FeedbackAnalyzer } from './analyzer.js';
import { PreferenceLearner, UserBehaviorEvent } from './preference-learner.js';
import { ABTestManager, MetricEvent } from './ab-test-manager.js';
type DatabaseService = {
  prepare: (sql: string) => any;
};
import type { ProjectManager } from '../projects/project-manager.js';
import type { StageAnalyzer } from '../analyzers/stage-analyzer.js';
import type { MetricsCollector } from '../analyzers/metrics-collector.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger('FeedbackSystem');

/**
 * 피드백 시스템 설정
 */
export interface FeedbackSystemConfig {
  /** 데이터베이스 서비스 */
  database: DatabaseService;
  
  /** 프로젝트 매니저 */
  projectManager?: ProjectManager;
  
  /** 스테이지 분석기 */
  stageAnalyzer?: StageAnalyzer;
  
  /** 메트릭 수집기 */
  metricsCollector?: MetricsCollector;
  
  /** 자동 분석 활성화 */
  autoAnalyze?: boolean;
  
  /** 선호도 학습 활성화 */
  enablePreferenceLearning?: boolean;
  
  /** A/B 테스트 활성화 */
  enableABTesting?: boolean;
}

/**
 * 통합 피드백 시스템
 */
export class FeedbackSystem extends EventEmitter {
  private config: Required<FeedbackSystemConfig>;
  private collector: FeedbackCollector;
  private analyzer: FeedbackAnalyzer;
  private preferenceLearner?: PreferenceLearner;
  private abTestManager?: ABTestManager;
  
  constructor(config: FeedbackSystemConfig) {
    super();
    
    this.config = {
      ...config,
      autoAnalyze: config.autoAnalyze ?? true,
      enablePreferenceLearning: config.enablePreferenceLearning ?? true,
      enableABTesting: config.enableABTesting ?? true
    };
    
    // 컴포넌트 초기화
    this.collector = new FeedbackCollector({
      database: config.database,
      projectManager: config.projectManager,
      stageAnalyzer: config.stageAnalyzer,
      metricsCollector: config.metricsCollector
    });
    
    this.analyzer = new FeedbackAnalyzer({
      database: config.database
    });
    
    if (this.config.enablePreferenceLearning) {
      this.preferenceLearner = new PreferenceLearner({
        database: config.database
      });
    }
    
    if (this.config.enableABTesting) {
      this.abTestManager = new ABTestManager({
        database: config.database
      });
    }
    
    this.setupEventHandlers();
  }
  
  /**
   * 시스템 시작
   */
  async start(): Promise<void> {
    logger.info('Starting feedback system');
    
    // 선호도 학습 시작
    if (this.preferenceLearner) {
      this.preferenceLearner.start();
    }
    
    // A/B 테스트 매니저 시작
    if (this.abTestManager) {
      await this.abTestManager.start();
    }
    
    logger.info('Feedback system started');
  }
  
  /**
   * 시스템 중지
   */
  stop(): void {
    logger.info('Stopping feedback system');
    
    // 선호도 학습 중지
    if (this.preferenceLearner) {
      this.preferenceLearner.stop();
    }
    
    // A/B 테스트 매니저 중지
    if (this.abTestManager) {
      this.abTestManager.stop();
    }
    
    logger.info('Feedback system stopped');
  }
  
  /**
   * 이벤트 핸들러 설정
   */
  private setupEventHandlers(): void {
    // 피드백 제출 시 자동 분석
    this.collector.on('feedbackSubmitted', async (event: FeedbackEvent) => {
      if (this.config.autoAnalyze && event.feedbackId) {
        try {
          const feedback = await this.collector.getFeedback(event.feedbackId);
          if (feedback) {
            await this.analyzer.analyzeFeedback(feedback);
          }
        } catch (error) {
          logger.error('Failed to auto-analyze feedback', { feedbackId: event.feedbackId, error });
        }
      }
      
      // 이벤트 전파
      this.emit('feedbackSubmitted', event);
    });
    
    // 분석 완료 이벤트 전파
    this.analyzer.on('feedbackAnalyzed', (event: FeedbackEvent) => {
      this.emit('feedbackAnalyzed', event);
    });
    
    // 개선 제안 이벤트 전파
    this.analyzer.on('improvementSuggested', (event: FeedbackEvent) => {
      this.emit('improvementSuggested', event);
    });
    
    // 선호도 학습 이벤트 전파
    if (this.preferenceLearner) {
      this.preferenceLearner.on('preferenceLearned', (event: FeedbackEvent) => {
        this.emit('preferenceLearned', event);
      });
    }
    
    // A/B 테스트 이벤트 전파
    if (this.abTestManager) {
      this.abTestManager.on('testStarted', (event: FeedbackEvent) => {
        this.emit('abTestStarted', event);
      });
      
      this.abTestManager.on('testCompleted', (event: FeedbackEvent) => {
        this.emit('abTestCompleted', event);
      });
    }
  }
  
  /**
   * 피드백 제출
   */
  async submitFeedback(options: FeedbackSubmitOptions): Promise<FeedbackMetadata> {
    return this.collector.submitFeedback(options);
  }
  
  /**
   * 피드백 조회
   */
  async getFeedback(id: string): Promise<FeedbackMetadata | null> {
    return this.collector.getFeedback(id);
  }
  
  /**
   * 피드백 목록 조회
   */
  async listFeedback(
    limit?: number,
    offset?: number,
    filters?: {
      type?: FeedbackType;
      status?: FeedbackStatus;
      priority?: FeedbackPriority;
      projectId?: string;
    }
  ): Promise<FeedbackMetadata[]> {
    return this.collector.listFeedback(limit, offset, filters);
  }
  
  /**
   * 피드백 상태 업데이트
   */
  async updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<void> {
    await this.collector.updateFeedbackStatus(id, status);
  }
  
  /**
   * 피드백 우선순위 업데이트
   */
  async updateFeedbackPriority(id: string, priority: FeedbackPriority): Promise<void> {
    await this.collector.updateFeedbackPriority(id, priority);
  }
  
  /**
   * 피드백 분석
   */
  async analyzeFeedback(feedbackId: string): Promise<void> {
    const feedback = await this.collector.getFeedback(feedbackId);
    if (feedback) {
      await this.analyzer.analyzeFeedback(feedback);
    }
  }
  
  /**
   * 개선 제안 목록 조회
   */
  async listImprovementSuggestions(status?: string): Promise<ImprovementSuggestion[]> {
    return this.analyzer.listImprovementSuggestions(status);
  }
  
  /**
   * 사용자 행동 기록
   */
  async recordUserBehavior(event: UserBehaviorEvent): Promise<void> {
    if (this.preferenceLearner) {
      await this.preferenceLearner.recordBehavior(event);
    }
  }
  
  /**
   * 사용자 선호도 조회
   */
  async getUserPreferences(userId: string): Promise<UserPreference | null> {
    if (this.preferenceLearner) {
      return this.preferenceLearner.getUserPreferences(userId);
    }
    return null;
  }
  
  /**
   * A/B 테스트 생성
   */
  async createABTest(
    name: string,
    description: string,
    variants: any[],
    metrics: any[],
    audiencePercentage?: number,
    audienceCriteria?: Record<string, any>
  ): Promise<ABTestConfig> {
    if (!this.abTestManager) {
      throw new Error('A/B testing is not enabled');
    }
    
    return this.abTestManager.createTest(
      name,
      description,
      variants,
      metrics,
      audiencePercentage,
      audienceCriteria
    );
  }
  
  /**
   * A/B 테스트 시작
   */
  async startABTest(testId: string): Promise<void> {
    if (!this.abTestManager) {
      throw new Error('A/B testing is not enabled');
    }
    
    await this.abTestManager.startTest(testId);
  }
  
  /**
   * A/B 테스트 중지
   */
  async stopABTest(testId: string): Promise<void> {
    if (!this.abTestManager) {
      throw new Error('A/B testing is not enabled');
    }
    
    await this.abTestManager.stopTest(testId);
  }
  
  /**
   * A/B 테스트 완료
   */
  async completeABTest(testId: string): Promise<ABTestResult> {
    if (!this.abTestManager) {
      throw new Error('A/B testing is not enabled');
    }
    
    return this.abTestManager.completeTest(testId);
  }
  
  /**
   * 사용자를 A/B 테스트 변형에 할당
   */
  async assignUserToVariant(testId: string, userId: string): Promise<string> {
    if (!this.abTestManager) {
      throw new Error('A/B testing is not enabled');
    }
    
    return this.abTestManager.assignUserToVariant(testId, userId);
  }
  
  /**
   * A/B 테스트 메트릭 기록
   */
  async recordABTestMetric(event: MetricEvent): Promise<void> {
    if (!this.abTestManager) {
      throw new Error('A/B testing is not enabled');
    }
    
    await this.abTestManager.recordMetric(event);
  }
  
  /**
   * 활성 A/B 테스트 목록 조회
   */
  async listActiveABTests(): Promise<ABTestConfig[]> {
    if (!this.abTestManager) {
      return [];
    }
    
    return this.abTestManager.listActiveTests();
  }
  
  /**
   * A/B 테스트 결과 조회
   */
  async getABTestResults(testId: string): Promise<ABTestResult | null> {
    if (!this.abTestManager) {
      return null;
    }
    
    return this.abTestManager.getTestResults(testId);
  }
  
  /**
   * 피드백 통계 조회
   */
  async getFeedbackStats(projectId?: string): Promise<{
    total: number;
    byType: Record<FeedbackType, number>;
    byStatus: Record<FeedbackStatus, number>;
    byPriority: Record<FeedbackPriority, number>;
  }> {
    return this.collector.getStats(projectId);
  }
  
  /**
   * 빠른 피드백 제출 헬퍼
   */
  async submitBugReport(
    title: string,
    description: string,
    projectId?: string,
    submitter?: { id?: string; email?: string; name?: string }
  ): Promise<FeedbackMetadata> {
    return this.submitFeedback({
      type: FeedbackType.BUG_REPORT,
      title,
      description,
      projectId,
      submitter
    });
  }
  
  async submitFeatureRequest(
    title: string,
    description: string,
    projectId?: string,
    submitter?: { id?: string; email?: string; name?: string }
  ): Promise<FeedbackMetadata> {
    return this.submitFeedback({
      type: FeedbackType.FEATURE_REQUEST,
      title,
      description,
      projectId,
      submitter
    });
  }
  
  async submitUsabilityIssue(
    title: string,
    description: string,
    projectId?: string,
    submitter?: { id?: string; email?: string; name?: string }
  ): Promise<FeedbackMetadata> {
    return this.submitFeedback({
      type: FeedbackType.USABILITY_ISSUE,
      title,
      description,
      projectId,
      submitter
    });
  }
}

// 타입 및 인터페이스 재내보내기
export * from './types.js';
export { FeedbackSubmitOptions, UserBehaviorEvent, MetricEvent };