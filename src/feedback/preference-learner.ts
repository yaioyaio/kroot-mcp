/**
 * DevFlow Monitor MCP - 사용자 선호도 학습기
 * 
 * 사용자의 행동 패턴을 분석하여 선호도를 학습합니다.
 */

import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import {
  UserPreference,
  FeedbackEvent,
  FeedbackEventType
} from './types.js';
type DatabaseService = {
  prepare: (sql: string) => any;
};
import type { BaseEvent } from '../events/types/base.js';
import { EventCategory } from '../events/types/base.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger('PreferenceLearner');

/**
 * 사용자 행동 이벤트
 */
export interface UserBehaviorEvent {
  /** 이벤트 타입 */
  type: 'feature_use' | 'workflow_complete' | 'preference_change' | 'tool_use';
  
  /** 사용자 ID */
  userId: string;
  
  /** 기능 또는 도구 이름 */
  feature?: string;
  
  /** 워크플로우 패턴 */
  workflow?: string;
  
  /** 소요 시간 (밀리초) */
  duration?: number;
  
  /** 만족도 (0-10) */
  satisfaction?: number;
  
  /** 추가 데이터 */
  metadata?: Record<string, any>;
  
  /** 타임스탬프 */
  timestamp: number;
}

/**
 * 선호도 학습기 설정
 */
export interface PreferenceLearnerConfig {
  /** 데이터베이스 서비스 */
  database: DatabaseService;
  
  /** 최소 데이터 포인트 (학습 시작 전) */
  minDataPoints?: number;
  
  /** 학습 주기 (밀리초) */
  learningInterval?: number;
  
  /** 만료 기간 (밀리초) */
  dataExpiration?: number;
  
  /** 신뢰도 임계값 */
  confidenceThreshold?: number;
}

/**
 * 사용자 선호도 학습기
 */
export class PreferenceLearner extends EventEmitter {
  private config: Required<PreferenceLearnerConfig>;
  private db: DatabaseService;
  private learningTimer?: NodeJS.Timeout | undefined;
  private behaviorBuffer: Map<string, UserBehaviorEvent[]> = new Map();
  
  constructor(config: PreferenceLearnerConfig) {
    super();
    
    this.config = {
      ...config,
      minDataPoints: config.minDataPoints ?? 10,
      learningInterval: config.learningInterval ?? 60 * 60 * 1000, // 1시간
      dataExpiration: config.dataExpiration ?? 30 * 24 * 60 * 60 * 1000, // 30일
      confidenceThreshold: config.confidenceThreshold ?? 0.6
    };
    
    this.db = config.database;
    this.initializeDatabase();
  }
  
  /**
   * 데이터베이스 초기화
   */
  private initializeDatabase(): void {
    // 사용자 행동 테이블
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS user_behaviors (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        feature TEXT,
        workflow TEXT,
        duration INTEGER,
        satisfaction INTEGER,
        metadata TEXT,
        timestamp INTEGER NOT NULL
      )
    `).run();
    
    // 사용자 선호도 테이블
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id TEXT PRIMARY KEY,
        preferred_features TEXT,
        workflow_patterns TEXT,
        ui_preferences TEXT,
        notification_preferences TEXT,
        learned_at INTEGER NOT NULL,
        confidence REAL NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();
    
    // 인덱스 생성
    this.db.prepare('CREATE INDEX IF NOT EXISTS idx_behaviors_user ON user_behaviors(user_id)').run();
    this.db.prepare('CREATE INDEX IF NOT EXISTS idx_behaviors_timestamp ON user_behaviors(timestamp)').run();
  }
  
  /**
   * 학습 시작
   */
  start(): void {
    if (this.learningTimer) {
      return;
    }
    
    // 주기적 학습 시작
    this.learningTimer = setInterval(() => {
      this.runLearningCycle();
    }, this.config.learningInterval);
    
    // 초기 학습 실행
    this.runLearningCycle();
    
    logger.info('Preference learner started');
  }
  
  /**
   * 학습 중지
   */
  stop(): void {
    if (this.learningTimer) {
      clearInterval(this.learningTimer);
      this.learningTimer = undefined;
    }
    
    // 버퍼 비우기
    this.flushBehaviorBuffer();
    
    logger.info('Preference learner stopped');
  }
  
  /**
   * 사용자 행동 기록
   */
  async recordBehavior(event: UserBehaviorEvent): Promise<void> {
    try {
      // 버퍼에 추가
      const userEvents = this.behaviorBuffer.get(event.userId) || [];
      userEvents.push(event);
      this.behaviorBuffer.set(event.userId, userEvents);
      
      // 버퍼가 크면 플러시
      if (userEvents.length >= 100) {
        await this.flushUserBehaviors(event.userId);
      }
      
    } catch (error) {
      logger.error('Failed to record user behavior', { userId: event.userId, error });
    }
  }
  
  /**
   * 프로젝트 이벤트로부터 행동 추출
   */
  async extractBehaviorFromEvent(event: BaseEvent, userId: string): Promise<void> {
    let behaviorEvent: UserBehaviorEvent | null = null;
    
    // 이벤트 타입에 따른 행동 추출
    switch (event.category) {
      case EventCategory.METHODOLOGY:
        behaviorEvent = {
          type: 'workflow_complete',
          userId,
          workflow: event.metadata?.methodology,
          timestamp: event.timestamp
        };
        break;
        
      case EventCategory.AI_COLLABORATION:
        behaviorEvent = {
          type: 'tool_use',
          userId,
          feature: event.metadata?.tool || 'ai_assistant',
          duration: event.metadata?.duration,
          timestamp: event.timestamp
        };
        break;
        
      case EventCategory.DEVELOPMENT:
        if (event.metadata?.stage) {
          behaviorEvent = {
            type: 'workflow_complete',
            userId,
            workflow: `stage_${event.metadata.stage}`,
            duration: event.metadata?.duration,
            timestamp: event.timestamp
          };
        }
        break;
    }
    
    if (behaviorEvent) {
      await this.recordBehavior(behaviorEvent);
    }
  }
  
  /**
   * 학습 주기 실행
   */
  private async runLearningCycle(): Promise<void> {
    try {
      logger.info('Running preference learning cycle');
      
      // 모든 버퍼 플러시
      await this.flushBehaviorBuffer();
      
      // 만료된 데이터 정리
      await this.cleanupExpiredData();
      
      // 각 사용자별로 학습
      const users = await this.getActiveUsers();
      for (const userId of users) {
        await this.learnUserPreferences(userId);
      }
      
      logger.info('Preference learning cycle completed', { userCount: users.length });
      
    } catch (error) {
      logger.error('Failed to run learning cycle', error);
    }
  }
  
  /**
   * 사용자 선호도 학습
   */
  private async learnUserPreferences(userId: string): Promise<void> {
    try {
      // 사용자 행동 데이터 조회
      const behaviors = await this.getUserBehaviors(userId);
      
      if (behaviors.length < this.config.minDataPoints) {
        return; // 데이터 부족
      }
      
      // 기능 선호도 분석
      const preferredFeatures = this.analyzeFeaturePreferences(behaviors);
      
      // 워크플로우 패턴 분석
      const workflowPatterns = this.analyzeWorkflowPatterns(behaviors);
      
      // UI 선호도 추론
      const uiPreferences = this.inferUIPreferences(behaviors);
      
      // 알림 선호도 추론
      const notificationPreferences = this.inferNotificationPreferences(behaviors);
      
      // 신뢰도 계산
      const confidence = this.calculateConfidence(behaviors);
      
      if (confidence < this.config.confidenceThreshold) {
        return; // 신뢰도 부족
      }
      
      // 선호도 생성 또는 업데이트
      const preference: UserPreference = {
        userId,
        preferredFeatures,
        workflowPatterns,
        uiPreferences,
        notificationPreferences,
        learnedAt: Date.now(),
        confidence
      };
      
      await this.saveUserPreference(preference);
      
      // 이벤트 발생
      const event: FeedbackEvent = {
        type: FeedbackEventType.PREFERENCE_LEARNED,
        timestamp: Date.now(),
        details: { userId, confidence }
      };
      this.emit('preferenceLearned', event);
      
      logger.info('User preferences learned', { userId, confidence });
      
    } catch (error) {
      logger.error('Failed to learn user preferences', { userId, error });
    }
  }
  
  /**
   * 기능 선호도 분석
   */
  private analyzeFeaturePreferences(behaviors: UserBehaviorEvent[]): Array<{
    feature: string;
    usage: number;
    satisfaction: number;
  }> {
    const featureStats = new Map<string, { count: number; totalSatisfaction: number }>();
    
    // 기능별 통계 집계
    for (const behavior of behaviors) {
      if (behavior.type === 'feature_use' && behavior.feature) {
        const stats = featureStats.get(behavior.feature) || { count: 0, totalSatisfaction: 0 };
        stats.count++;
        if (behavior.satisfaction !== undefined) {
          stats.totalSatisfaction += behavior.satisfaction;
        }
        featureStats.set(behavior.feature, stats);
      }
    }
    
    // 선호 기능 추출 (사용 빈도 기준 상위 10개)
    const preferences = Array.from(featureStats.entries())
      .map(([feature, stats]) => ({
        feature,
        usage: stats.count,
        satisfaction: stats.totalSatisfaction / stats.count || 5
      }))
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 10);
    
    return preferences;
  }
  
  /**
   * 워크플로우 패턴 분석
   */
  private analyzeWorkflowPatterns(behaviors: UserBehaviorEvent[]): Array<{
    pattern: string;
    frequency: number;
    duration: number;
  }> {
    const workflowStats = new Map<string, { count: number; totalDuration: number }>();
    
    // 워크플로우별 통계 집계
    for (const behavior of behaviors) {
      if (behavior.type === 'workflow_complete' && behavior.workflow) {
        const stats = workflowStats.get(behavior.workflow) || { count: 0, totalDuration: 0 };
        stats.count++;
        if (behavior.duration) {
          stats.totalDuration += behavior.duration;
        }
        workflowStats.set(behavior.workflow, stats);
      }
    }
    
    // 패턴 추출
    const patterns = Array.from(workflowStats.entries())
      .map(([pattern, stats]) => ({
        pattern,
        frequency: stats.count,
        duration: stats.totalDuration / stats.count || 0
      }))
      .sort((a, b) => b.frequency - a.frequency);
    
    return patterns;
  }
  
  /**
   * UI 선호도 추론
   */
  private inferUIPreferences(behaviors: UserBehaviorEvent[]): {
    theme?: 'light' | 'dark' | 'auto';
    layout?: string;
    shortcuts?: Record<string, string>;
  } {
    const preferences: any = {};
    
    // 시간대별 사용 패턴으로 테마 추론
    const hourlyUsage = new Array(24).fill(0);
    for (const behavior of behaviors) {
      const hour = new Date(behavior.timestamp).getHours();
      hourlyUsage[hour]++;
    }
    
    // 야간 사용이 많으면 다크 테마 선호 추론
    const nightUsage = hourlyUsage.slice(20).concat(hourlyUsage.slice(0, 6)).reduce((a, b) => a + b, 0);
    const totalUsage = hourlyUsage.reduce((a, b) => a + b, 0);
    
    if (totalUsage > 0) {
      const nightRatio = nightUsage / totalUsage;
      if (nightRatio > 0.6) {
        preferences.theme = 'dark';
      } else if (nightRatio < 0.2) {
        preferences.theme = 'light';
      } else {
        preferences.theme = 'auto';
      }
    }
    
    // 자주 사용하는 기능에 대한 단축키 추천
    const topFeatures = behaviors
      .filter(b => b.type === 'feature_use' && b.feature)
      .reduce((acc, b) => {
        acc[b.feature!] = (acc[b.feature!] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    
    const shortcuts: Record<string, string> = {};
    const sortedFeatures = Object.entries(topFeatures)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    
    // 간단한 단축키 할당 (실제로는 더 정교한 로직 필요)
    const shortcutKeys = ['Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+4', 'Ctrl+5'];
    sortedFeatures.forEach(([feature], index) => {
      const shortcut = shortcutKeys[index];
      if (shortcut) {
        shortcuts[feature] = shortcut;
      }
    });
    
    if (Object.keys(shortcuts).length > 0) {
      preferences.shortcuts = shortcuts;
    }
    
    return preferences;
  }
  
  /**
   * 알림 선호도 추론
   */
  private inferNotificationPreferences(behaviors: UserBehaviorEvent[]): Array<{
    channel: string;
    enabled: boolean;
    frequency?: string;
  }> {
    // 활동 패턴 분석
    const activityByHour = new Array(24).fill(0);
    for (const behavior of behaviors) {
      const hour = new Date(behavior.timestamp).getHours();
      activityByHour[hour]++;
    }
    
    // 활발한 시간대 찾기
    const avgActivity = activityByHour.reduce((a, b) => a + b, 0) / 24;
    const activeHours = activityByHour
      .map((count, hour) => ({ hour, count }))
      .filter(({ count }) => count > avgActivity * 0.5);
    
    // 기본 알림 설정
    const preferences = [
      {
        channel: 'dashboard',
        enabled: true,
        frequency: 'realtime'
      }
    ];
    
    // 활동이 집중된 시간대가 있으면 요약 알림 추천
    if (activeHours.length < 12) {
      preferences.push({
        channel: 'email',
        enabled: true,
        frequency: 'daily'
      });
    }
    
    return preferences;
  }
  
  /**
   * 신뢰도 계산
   */
  private calculateConfidence(behaviors: UserBehaviorEvent[]): number {
    // 데이터 포인트 수
    const dataPointScore = Math.min(behaviors.length / 100, 1) * 0.3;
    
    // 데이터 다양성
    const uniqueFeatures = new Set(behaviors.filter(b => b.feature).map(b => b.feature)).size;
    const diversityScore = Math.min(uniqueFeatures / 20, 1) * 0.3;
    
    // 시간 범위
    const timeRange = behaviors.length > 0
      ? (behaviors[behaviors.length - 1]?.timestamp || 0) - (behaviors[0]?.timestamp || 0)
      : 0;
    const timeRangeScore = Math.min(timeRange / (7 * 24 * 60 * 60 * 1000), 1) * 0.2; // 7일 기준
    
    // 최근성
    const recentBehaviors = behaviors.filter(b => 
      Date.now() - b.timestamp < 7 * 24 * 60 * 60 * 1000
    ).length;
    const recencyScore = (recentBehaviors / behaviors.length) * 0.2;
    
    return dataPointScore + diversityScore + timeRangeScore + recencyScore;
  }
  
  /**
   * 행동 버퍼 플러시
   */
  private async flushBehaviorBuffer(): Promise<void> {
    for (const [userId, behaviors] of this.behaviorBuffer.entries()) {
      if (behaviors.length > 0) {
        await this.flushUserBehaviors(userId);
      }
    }
  }
  
  /**
   * 사용자별 행동 플러시
   */
  private async flushUserBehaviors(userId: string): Promise<void> {
    const behaviors = this.behaviorBuffer.get(userId);
    if (!behaviors || behaviors.length === 0) {
      return;
    }
    
    const stmt = this.db.prepare(`
      INSERT INTO user_behaviors (
        id, user_id, type, feature, workflow, duration,
        satisfaction, metadata, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    for (const behavior of behaviors) {
      stmt.run(
        uuidv4(),
        behavior.userId,
        behavior.type,
        behavior.feature || null,
        behavior.workflow || null,
        behavior.duration || null,
        behavior.satisfaction || null,
        behavior.metadata ? JSON.stringify(behavior.metadata) : null,
        behavior.timestamp
      );
    }
    
    // 버퍼 클리어
    this.behaviorBuffer.set(userId, []);
  }
  
  /**
   * 활성 사용자 목록 조회
   */
  private async getActiveUsers(): Promise<string[]> {
    const thirtyDaysAgo = Date.now() - this.config.dataExpiration;
    
    const rows = this.db.prepare(`
      SELECT DISTINCT user_id
      FROM user_behaviors
      WHERE timestamp > ?
    `).all(thirtyDaysAgo) as any[];
    
    return rows.map(r => r.user_id);
  }
  
  /**
   * 사용자 행동 조회
   */
  private async getUserBehaviors(userId: string): Promise<UserBehaviorEvent[]> {
    const thirtyDaysAgo = Date.now() - this.config.dataExpiration;
    
    const rows = this.db.prepare(`
      SELECT * FROM user_behaviors
      WHERE user_id = ? AND timestamp > ?
      ORDER BY timestamp DESC
    `).all(userId, thirtyDaysAgo) as any[];
    
    return rows.map(row => ({
      type: row.type,
      userId: row.user_id,
      feature: row.feature,
      workflow: row.workflow,
      duration: row.duration,
      satisfaction: row.satisfaction,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      timestamp: row.timestamp
    }));
  }
  
  /**
   * 사용자 선호도 저장
   */
  private async saveUserPreference(preference: UserPreference): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO user_preferences (
        user_id, preferred_features, workflow_patterns,
        ui_preferences, notification_preferences,
        learned_at, confidence, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      preference.userId,
      JSON.stringify(preference.preferredFeatures),
      JSON.stringify(preference.workflowPatterns),
      JSON.stringify(preference.uiPreferences),
      JSON.stringify(preference.notificationPreferences),
      preference.learnedAt,
      preference.confidence,
      Date.now()
    );
  }
  
  /**
   * 사용자 선호도 조회
   */
  async getUserPreferences(userId: string): Promise<UserPreference | null> {
    const row = this.db.prepare(`
      SELECT * FROM user_preferences WHERE user_id = ?
    `).get(userId) as any;
    
    if (!row) {
      return null;
    }
    
    return {
      userId: row.user_id,
      preferredFeatures: JSON.parse(row.preferred_features || '[]'),
      workflowPatterns: JSON.parse(row.workflow_patterns || '[]'),
      uiPreferences: JSON.parse(row.ui_preferences || '{}'),
      notificationPreferences: JSON.parse(row.notification_preferences || '[]'),
      learnedAt: row.learned_at,
      confidence: row.confidence
    };
  }
  
  /**
   * 만료된 데이터 정리
   */
  private async cleanupExpiredData(): Promise<void> {
    const expirationTime = Date.now() - this.config.dataExpiration;
    
    const result = this.db.prepare(`
      DELETE FROM user_behaviors WHERE timestamp < ?
    `).run(expirationTime);
    
    if (result.changes > 0) {
      logger.info('Cleaned up expired behavior data', { deleted: result.changes });
    }
  }
}