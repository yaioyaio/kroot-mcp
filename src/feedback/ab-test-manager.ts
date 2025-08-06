/**
 * DevFlow Monitor MCP - A/B 테스트 매니저
 * 
 * 기능 변경사항에 대한 A/B 테스트를 관리합니다.
 */

import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import {
  ABTestConfig,
  ABTestVariant,
  ABTestMetric,
  ABTestResult,
  FeedbackEvent,
  FeedbackEventType
} from './types.js';
type DatabaseService = {
  prepare: (sql: string) => any;
};
import { Logger } from '../utils/logger.js';

const logger = new Logger('ABTestManager');

/**
 * A/B 테스트 매니저 설정
 */
export interface ABTestManagerConfig {
  /** 데이터베이스 서비스 */
  database: DatabaseService;
  
  /** 최소 샘플 크기 */
  minSampleSize?: number;
  
  /** 신뢰 수준 (0-1) */
  confidenceLevel?: number;
  
  /** 테스트 자동 종료 여부 */
  autoComplete?: boolean;
  
  /** 메트릭 수집 간격 (밀리초) */
  metricsInterval?: number;
}

/**
 * 메트릭 이벤트
 */
export interface MetricEvent {
  /** 테스트 ID */
  testId: string;
  
  /** 변형 ID */
  variantId: string;
  
  /** 사용자 ID */
  userId: string;
  
  /** 메트릭 이름 */
  metric: string;
  
  /** 메트릭 값 */
  value: number;
  
  /** 타임스탬프 */
  timestamp: number;
}

/**
 * A/B 테스트 매니저
 */
export class ABTestManager extends EventEmitter {
  private config: Required<ABTestManagerConfig>;
  private db: DatabaseService;
  private activeTests: Map<string, ABTestConfig> = new Map();
  private metricsTimer?: NodeJS.Timeout | undefined;
  private userAssignments: Map<string, Map<string, string>> = new Map(); // testId -> userId -> variantId
  
  constructor(config: ABTestManagerConfig) {
    super();
    
    this.config = {
      ...config,
      minSampleSize: config.minSampleSize ?? 100,
      confidenceLevel: config.confidenceLevel ?? 0.95,
      autoComplete: config.autoComplete ?? true,
      metricsInterval: config.metricsInterval ?? 5 * 60 * 1000 // 5분
    };
    
    this.db = config.database;
    this.initializeDatabase();
  }
  
  /**
   * 데이터베이스 초기화
   */
  private initializeDatabase(): void {
    // A/B 테스트 테이블
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS ab_tests (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        audience_percentage REAL NOT NULL,
        audience_criteria TEXT,
        start_time INTEGER,
        end_time INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();
    
    // 변형 테이블
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS ab_test_variants (
        id TEXT PRIMARY KEY,
        test_id TEXT NOT NULL,
        name TEXT NOT NULL,
        traffic_percentage REAL NOT NULL,
        changes TEXT NOT NULL,
        is_control INTEGER NOT NULL,
        FOREIGN KEY (test_id) REFERENCES ab_tests(id) ON DELETE CASCADE
      )
    `).run();
    
    // 메트릭 정의 테이블
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS ab_test_metrics (
        test_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        goal REAL,
        calculation TEXT NOT NULL,
        PRIMARY KEY (test_id, name),
        FOREIGN KEY (test_id) REFERENCES ab_tests(id) ON DELETE CASCADE
      )
    `).run();
    
    // 사용자 할당 테이블
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS ab_test_assignments (
        test_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        variant_id TEXT NOT NULL,
        assigned_at INTEGER NOT NULL,
        PRIMARY KEY (test_id, user_id),
        FOREIGN KEY (test_id) REFERENCES ab_tests(id) ON DELETE CASCADE,
        FOREIGN KEY (variant_id) REFERENCES ab_test_variants(id) ON DELETE CASCADE
      )
    `).run();
    
    // 메트릭 이벤트 테이블
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS ab_test_events (
        id TEXT PRIMARY KEY,
        test_id TEXT NOT NULL,
        variant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        metric TEXT NOT NULL,
        value REAL NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (test_id) REFERENCES ab_tests(id) ON DELETE CASCADE,
        FOREIGN KEY (variant_id) REFERENCES ab_test_variants(id) ON DELETE CASCADE
      )
    `).run();
    
    // 인덱스 생성
    this.db.prepare('CREATE INDEX IF NOT EXISTS idx_test_assignments ON ab_test_assignments(test_id, user_id)').run();
    this.db.prepare('CREATE INDEX IF NOT EXISTS idx_test_events ON ab_test_events(test_id, metric, timestamp)').run();
  }
  
  /**
   * 매니저 시작
   */
  async start(): Promise<void> {
    // 활성 테스트 로드
    await this.loadActiveTests();
    
    // 메트릭 분석 타이머 시작
    if (!this.metricsTimer) {
      this.metricsTimer = setInterval(() => {
        this.analyzeAllTests();
      }, this.config.metricsInterval);
    }
    
    logger.info('A/B test manager started', { activeTests: this.activeTests.size });
  }
  
  /**
   * 매니저 중지
   */
  stop(): void {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = undefined;
    }
    
    this.activeTests.clear();
    this.userAssignments.clear();
    
    logger.info('A/B test manager stopped');
  }
  
  /**
   * A/B 테스트 생성
   */
  async createTest(
    name: string,
    description: string,
    variants: Omit<ABTestVariant, 'id'>[],
    metrics: ABTestMetric[],
    audiencePercentage: number = 100,
    audienceCriteria?: Record<string, any>
  ): Promise<ABTestConfig> {
    try {
      // 유효성 검사
      this.validateTestConfig(variants, metrics, audiencePercentage);
      
      // 테스트 생성
      const test: ABTestConfig = {
        id: uuidv4(),
        name,
        description,
        status: 'draft',
        variants: variants.map(v => ({ ...v, id: uuidv4() })),
        audience: audienceCriteria ? {
          percentage: audiencePercentage,
          criteria: audienceCriteria
        } : { percentage: audiencePercentage },
        metrics,
        createdAt: Date.now()
      };
      
      // 데이터베이스에 저장
      await this.saveTest(test);
      
      logger.info('A/B test created', { testId: test.id, name });
      
      return test;
      
    } catch (error) {
      logger.error('Failed to create A/B test', { name, error });
      throw error;
    }
  }
  
  /**
   * 테스트 시작
   */
  async startTest(testId: string): Promise<void> {
    const test = await this.getTest(testId);
    
    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }
    
    if (test.status !== 'draft') {
      throw new Error(`Test ${testId} is not in draft status`);
    }
    
    // 상태 업데이트
    test.status = 'active';
    test.startTime = Date.now();
    
    // 데이터베이스 업데이트
    this.db.prepare(`
      UPDATE ab_tests
      SET status = ?, start_time = ?, updated_at = ?
      WHERE id = ?
    `).run('active', test.startTime, Date.now(), testId);
    
    // 활성 테스트에 추가
    this.activeTests.set(testId, test);
    
    // 이벤트 발생
    const event: FeedbackEvent = {
      type: FeedbackEventType.AB_TEST_STARTED,
      timestamp: Date.now(),
      details: { testId, name: test.name }
    };
    this.emit('testStarted', event);
    
    logger.info('A/B test started', { testId, name: test.name });
  }
  
  /**
   * 테스트 중지
   */
  async stopTest(testId: string): Promise<void> {
    const test = this.activeTests.get(testId);
    
    if (!test || test.status !== 'active') {
      throw new Error(`Active test ${testId} not found`);
    }
    
    // 상태 업데이트
    test.status = 'paused';
    
    // 데이터베이스 업데이트
    this.db.prepare(`
      UPDATE ab_tests
      SET status = ?, updated_at = ?
      WHERE id = ?
    `).run('paused', Date.now(), testId);
    
    // 활성 테스트에서 제거
    this.activeTests.delete(testId);
    
    logger.info('A/B test stopped', { testId, name: test.name });
  }
  
  /**
   * 테스트 완료
   */
  async completeTest(testId: string): Promise<ABTestResult> {
    const test = await this.getTest(testId);
    
    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }
    
    if (test.status === 'completed') {
      throw new Error(`Test ${testId} is already completed`);
    }
    
    // 최종 분석 실행
    const result = await this.analyzeTest(testId);
    
    // 상태 업데이트
    test.status = 'completed';
    test.endTime = Date.now();
    
    // 데이터베이스 업데이트
    this.db.prepare(`
      UPDATE ab_tests
      SET status = ?, end_time = ?, updated_at = ?
      WHERE id = ?
    `).run('completed', test.endTime, Date.now(), testId);
    
    // 활성 테스트에서 제거
    this.activeTests.delete(testId);
    
    // 이벤트 발생
    const event: FeedbackEvent = {
      type: FeedbackEventType.AB_TEST_COMPLETED,
      timestamp: Date.now(),
      details: {
        testId,
        name: test.name,
        winner: result.winner
      }
    };
    this.emit('testCompleted', event);
    
    logger.info('A/B test completed', {
      testId,
      name: test.name,
      winner: result.winner
    });
    
    return result;
  }
  
  /**
   * 사용자를 변형에 할당
   */
  async assignUserToVariant(testId: string, userId: string): Promise<string> {
    const test = this.activeTests.get(testId);
    
    if (!test || test.status !== 'active') {
      throw new Error(`Active test ${testId} not found`);
    }
    
    // 기존 할당 확인
    let variantId = this.getUserAssignment(testId, userId);
    
    if (!variantId) {
      // 새로운 할당
      variantId = this.selectVariant(test, userId);
      
      // 할당 저장
      this.saveUserAssignment(testId, userId, variantId);
      
      // 메모리 캐시 업데이트
      if (!this.userAssignments.has(testId)) {
        this.userAssignments.set(testId, new Map());
      }
      this.userAssignments.get(testId)!.set(userId, variantId);
    }
    
    return variantId;
  }
  
  /**
   * 메트릭 이벤트 기록
   */
  async recordMetric(event: MetricEvent): Promise<void> {
    try {
      // 테스트 활성 상태 확인
      const test = this.activeTests.get(event.testId);
      if (!test) {
        return; // 비활성 테스트는 무시
      }
      
      // 사용자 할당 확인
      const assignedVariant = this.getUserAssignment(event.testId, event.userId);
      if (assignedVariant !== event.variantId) {
        logger.warn('Metric event variant mismatch', {
          testId: event.testId,
          userId: event.userId,
          expected: assignedVariant,
          actual: event.variantId
        });
        return;
      }
      
      // 이벤트 저장
      const stmt = this.db.prepare(`
        INSERT INTO ab_test_events (
          id, test_id, variant_id, user_id, metric, value, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        uuidv4(),
        event.testId,
        event.variantId,
        event.userId,
        event.metric,
        event.value,
        event.timestamp
      );
      
    } catch (error) {
      logger.error('Failed to record metric event', { event, error });
    }
  }
  
  /**
   * 테스트 분석
   */
  async analyzeTest(testId: string): Promise<ABTestResult> {
    const test = await this.getTest(testId);
    
    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }
    
    // 변형별 결과 계산
    const variantResults = await Promise.all(
      test.variants.map(async variant => {
        const stats = await this.calculateVariantStats(testId, variant.id, test.metrics);
        return {
          variantId: variant.id,
          participants: stats.participants,
          metrics: stats.metrics,
          confidence: stats.confidence
        };
      })
    );
    
    // 승자 결정
    const winner = this.determineWinner(test, variantResults);
    
    const result: ABTestResult = {
      testId,
      variantResults,
      winner,
      analyzedAt: Date.now()
    };
    
    return result;
  }
  
  /**
   * 변형 통계 계산
   */
  private async calculateVariantStats(
    testId: string,
    variantId: string,
    metrics: ABTestMetric[]
  ): Promise<{
    participants: number;
    metrics: Record<string, number>;
    confidence: number;
  }> {
    // 참가자 수
    const participantRow = this.db.prepare(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM ab_test_assignments
      WHERE test_id = ? AND variant_id = ?
    `).get(testId, variantId) as any;
    
    const participants = participantRow.count;
    
    // 메트릭별 계산
    const metricValues: Record<string, number> = {};
    
    for (const metric of metrics) {
      const value = await this.calculateMetricValue(testId, variantId, metric);
      metricValues[metric.name] = value;
    }
    
    // 신뢰도 계산 (간단한 버전)
    const confidence = participants >= this.config.minSampleSize ? 0.95 : 
                      participants / this.config.minSampleSize;
    
    return {
      participants,
      metrics: metricValues,
      confidence
    };
  }
  
  /**
   * 메트릭 값 계산
   */
  private async calculateMetricValue(
    testId: string,
    variantId: string,
    metric: ABTestMetric
  ): Promise<number> {
    switch (metric.type) {
      case 'conversion':
        // 전환율 계산
        const conversionRow = this.db.prepare(`
          SELECT 
            COUNT(DISTINCT CASE WHEN e.value > 0 THEN e.user_id END) as conversions,
            COUNT(DISTINCT a.user_id) as total
          FROM ab_test_assignments a
          LEFT JOIN ab_test_events e ON 
            a.test_id = e.test_id AND 
            a.user_id = e.user_id AND 
            a.variant_id = e.variant_id AND
            e.metric = ?
          WHERE a.test_id = ? AND a.variant_id = ?
        `).get(metric.name, testId, variantId) as any;
        
        return conversionRow.total > 0 ? 
               (conversionRow.conversions / conversionRow.total) * 100 : 0;
        
      case 'engagement':
        // 평균 참여도
        const engagementRow = this.db.prepare(`
          SELECT AVG(value) as avg_value
          FROM ab_test_events
          WHERE test_id = ? AND variant_id = ? AND metric = ?
        `).get(testId, variantId, metric.name) as any;
        
        return engagementRow.avg_value || 0;
        
      case 'performance':
        // 성능 메트릭 (예: 평균 응답 시간)
        const performanceRow = this.db.prepare(`
          SELECT AVG(value) as avg_value
          FROM ab_test_events
          WHERE test_id = ? AND variant_id = ? AND metric = ?
        `).get(testId, variantId, metric.name) as any;
        
        return performanceRow.avg_value || 0;
        
      default:
        // 커스텀 계산
        return 0;
    }
  }
  
  /**
   * 승자 결정
   */
  private determineWinner(
    test: ABTestConfig,
    results: Array<{
      variantId: string;
      participants: number;
      metrics: Record<string, number>;
      confidence: number;
    }>
  ): { variantId: string; confidence: number; improvement: number } | undefined {
    // 모든 변형이 최소 샘플 크기를 충족하는지 확인
    const allHaveEnoughData = results.every(r => r.participants >= this.config.minSampleSize);
    
    if (!allHaveEnoughData) {
      return undefined; // 아직 결정할 수 없음
    }
    
    // 컨트롤 그룹 찾기
    const controlVariant = test.variants.find(v => v.isControl);
    if (!controlVariant) {
      return undefined;
    }
    
    const controlResult = results.find(r => r.variantId === controlVariant.id);
    if (!controlResult) {
      return undefined;
    }
    
    // 각 변형과 컨트롤 비교
    let bestVariant = controlVariant.id;
    let bestImprovement = 0;
    let bestConfidence = 0;
    
    for (const result of results) {
      if (result.variantId === controlVariant.id) {
        continue;
      }
      
      // 주요 메트릭 기준으로 개선도 계산
      const primaryMetric = test.metrics[0]; // 첫 번째 메트릭을 주요 메트릭으로 간주
      if (!primaryMetric) continue;
      
      const controlValue = controlResult.metrics[primaryMetric.name];
      const variantValue = result.metrics[primaryMetric.name];
      
      let improvement = 0;
      if (controlValue !== undefined && variantValue !== undefined && controlValue !== 0) {
        improvement = ((variantValue - controlValue) / controlValue) * 100;
      }
      
      // 통계적 유의성 검사 (간단한 버전)
      const isSignificant = Math.abs(improvement) > 5 && result.confidence >= this.config.confidenceLevel;
      
      if (isSignificant && improvement > bestImprovement) {
        bestVariant = result.variantId;
        bestImprovement = improvement;
        bestConfidence = result.confidence;
      }
    }
    
    // 개선이 없으면 undefined 반환
    if (bestVariant === controlVariant.id) {
      return undefined;
    }
    
    return {
      variantId: bestVariant,
      confidence: bestConfidence,
      improvement: bestImprovement
    };
  }
  
  /**
   * 변형 선택 (해시 기반)
   */
  private selectVariant(test: ABTestConfig, userId: string): string {
    // 사용자 ID를 해시하여 일관된 할당 보장
    const hash = crypto.createHash('md5').update(`${test.id}:${userId}`).digest();
    const hashValue = hash.readUInt32BE(0) / 0xffffffff; // 0-1 범위로 정규화
    
    // 청중 백분율 확인
    if (hashValue * 100 > test.audience.percentage) {
      // 테스트 대상이 아님 - 컨트롤 그룹에 할당
      const controlVariant = test.variants.find(v => v.isControl);
      return controlVariant?.id || test.variants[0]?.id || '';
    }
    
    // 트래픽 비율에 따라 변형 선택
    let cumulative = 0;
    const random = hashValue;
    
    for (const variant of test.variants) {
      cumulative += variant.trafficPercentage / 100;
      if (random <= cumulative) {
        return variant.id;
      }
    }
    
    // 기본값 (발생하지 않아야 함)
    return test.variants[test.variants.length - 1]?.id || '';
  }
  
  /**
   * 테스트 설정 유효성 검사
   */
  private validateTestConfig(
    variants: Omit<ABTestVariant, 'id'>[],
    metrics: ABTestMetric[],
    audiencePercentage: number
  ): void {
    // 변형 검증
    if (variants.length < 2) {
      throw new Error('At least 2 variants are required');
    }
    
    const totalTraffic = variants.reduce((sum, v) => sum + v.trafficPercentage, 0);
    if (Math.abs(totalTraffic - 100) > 0.01) {
      throw new Error('Variant traffic percentages must sum to 100');
    }
    
    const controlCount = variants.filter(v => v.isControl).length;
    if (controlCount !== 1) {
      throw new Error('Exactly one control variant is required');
    }
    
    // 메트릭 검증
    if (metrics.length === 0) {
      throw new Error('At least one metric is required');
    }
    
    // 청중 비율 검증
    if (audiencePercentage <= 0 || audiencePercentage > 100) {
      throw new Error('Audience percentage must be between 0 and 100');
    }
  }
  
  /**
   * 활성 테스트 로드
   */
  private async loadActiveTests(): Promise<void> {
    const rows = this.db.prepare(`
      SELECT * FROM ab_tests WHERE status = 'active'
    `).all() as any[];
    
    for (const row of rows) {
      const test = await this.getTest(row.id);
      if (test) {
        this.activeTests.set(test.id, test);
        
        // 사용자 할당 로드
        await this.loadUserAssignments(test.id);
      }
    }
  }
  
  /**
   * 사용자 할당 로드
   */
  private async loadUserAssignments(testId: string): Promise<void> {
    const rows = this.db.prepare(`
      SELECT user_id, variant_id
      FROM ab_test_assignments
      WHERE test_id = ?
    `).all(testId) as any[];
    
    const assignments = new Map<string, string>();
    for (const row of rows) {
      assignments.set(row.user_id, row.variant_id);
    }
    
    this.userAssignments.set(testId, assignments);
  }
  
  /**
   * 모든 활성 테스트 분석
   */
  private async analyzeAllTests(): Promise<void> {
    for (const test of this.activeTests.values()) {
      try {
        const result = await this.analyzeTest(test.id);
        
        // 자동 완료 체크
        if (this.config.autoComplete && result.winner) {
          await this.completeTest(test.id);
        }
      } catch (error) {
        logger.error('Failed to analyze test', { testId: test.id, error });
      }
    }
  }
  
  /**
   * 테스트 저장
   */
  private async saveTest(test: ABTestConfig): Promise<void> {
    const db = this.db;
    
    // 트랜잭션 시작
    db.prepare('BEGIN').run();
    
    try {
      // 테스트 저장
      db.prepare(`
        INSERT INTO ab_tests (
          id, name, description, status, audience_percentage,
          audience_criteria, start_time, end_time, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        test.id,
        test.name,
        test.description,
        test.status,
        test.audience.percentage,
        test.audience.criteria ? JSON.stringify(test.audience.criteria) : null,
        test.startTime || null,
        test.endTime || null,
        test.createdAt,
        Date.now()
      );
      
      // 변형 저장
      const variantStmt = db.prepare(`
        INSERT INTO ab_test_variants (
          id, test_id, name, traffic_percentage, changes, is_control
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      for (const variant of test.variants) {
        variantStmt.run(
          variant.id,
          test.id,
          variant.name,
          variant.trafficPercentage,
          JSON.stringify(variant.changes),
          variant.isControl ? 1 : 0
        );
      }
      
      // 메트릭 저장
      const metricStmt = db.prepare(`
        INSERT INTO ab_test_metrics (
          test_id, name, type, goal, calculation
        ) VALUES (?, ?, ?, ?, ?)
      `);
      
      for (const metric of test.metrics) {
        metricStmt.run(
          test.id,
          metric.name,
          metric.type,
          metric.goal || null,
          metric.calculation
        );
      }
      
      db.prepare('COMMIT').run();
      
    } catch (error) {
      db.prepare('ROLLBACK').run();
      throw error;
    }
  }
  
  /**
   * 테스트 조회
   */
  private async getTest(testId: string): Promise<ABTestConfig | null> {
    const testRow = this.db.prepare(`
      SELECT * FROM ab_tests WHERE id = ?
    `).get(testId) as any;
    
    if (!testRow) {
      return null;
    }
    
    // 변형 조회
    const variantRows = this.db.prepare(`
      SELECT * FROM ab_test_variants WHERE test_id = ?
    `).all(testId) as any[];
    
    // 메트릭 조회
    const metricRows = this.db.prepare(`
      SELECT * FROM ab_test_metrics WHERE test_id = ?
    `).all(testId) as any[];
    
    return {
      id: testRow.id,
      name: testRow.name,
      description: testRow.description,
      status: testRow.status,
      variants: variantRows.map(v => ({
        id: v.id,
        name: v.name,
        trafficPercentage: v.traffic_percentage,
        changes: JSON.parse(v.changes),
        isControl: v.is_control === 1
      })),
      audience: {
        percentage: testRow.audience_percentage,
        criteria: testRow.audience_criteria ? JSON.parse(testRow.audience_criteria) : undefined
      },
      metrics: metricRows.map(m => ({
        name: m.name,
        type: m.type,
        goal: m.goal,
        calculation: m.calculation
      })),
      startTime: testRow.start_time,
      endTime: testRow.end_time,
      createdAt: testRow.created_at
    };
  }
  
  /**
   * 사용자 할당 조회
   */
  private getUserAssignment(testId: string, userId: string): string | undefined {
    // 메모리 캐시 확인
    const testAssignments = this.userAssignments.get(testId);
    if (testAssignments) {
      const cached = testAssignments.get(userId);
      if (cached) {
        return cached;
      }
    }
    
    // 데이터베이스 조회
    const row = this.db.prepare(`
      SELECT variant_id FROM ab_test_assignments
      WHERE test_id = ? AND user_id = ?
    `).get(testId, userId) as any;
    
    return row?.variant_id;
  }
  
  /**
   * 사용자 할당 저장
   */
  private saveUserAssignment(testId: string, userId: string, variantId: string): void {
    this.db.prepare(`
      INSERT INTO ab_test_assignments (test_id, user_id, variant_id, assigned_at)
      VALUES (?, ?, ?, ?)
    `).run(testId, userId, variantId, Date.now());
  }
  
  /**
   * 활성 테스트 목록 조회
   */
  async listActiveTests(): Promise<ABTestConfig[]> {
    return Array.from(this.activeTests.values());
  }
  
  /**
   * 테스트 결과 조회
   */
  async getTestResults(testId: string): Promise<ABTestResult | null> {
    const test = await this.getTest(testId);
    
    if (!test || test.status === 'draft') {
      return null;
    }
    
    return this.analyzeTest(testId);
  }
}