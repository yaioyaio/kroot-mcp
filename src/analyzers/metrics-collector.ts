/**
 * 메트릭 수집기
 * 개발 과정에서 생성되는 모든 이벤트를 분석하여 메트릭을 수집하고 계산합니다.
 */

import { EventEmitter } from 'eventemitter3';
import { eventEngine } from '../events/engine.js';
import { BaseEvent, EventCategory } from '../events/types/base.js';
import {
  MetricType,
  MetricUnit,
  MetricData,
  MetricDefinition,
  MetricSummary,
  AggregationType,
  TrendDirection,
} from './types/metrics.js';

export interface MetricCollectorOptions {
  samplingInterval?: number;
  retentionPeriod?: number;
  aggregationWindow?: number;
  enabledMetrics?: MetricType[];
}

export class MetricsCollector extends EventEmitter {
  private isRunning = false;
  private metrics = new Map<string, MetricData>();
  private rawEvents: BaseEvent[] = [];
  private samplingTimer?: NodeJS.Timeout | undefined;
  private eventSubscriptionId?: string | undefined;
  private startTime = Date.now();

  constructor(private options: MetricCollectorOptions = {}) {
    super();
    this.initializeDefaultMetrics();
  }

  /**
   * 메트릭 수집 시작
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // 이벤트 구독
    this.eventSubscriptionId = eventEngine.subscribe('*', (event) => {
      this.handleEvent(event);
    });

    // 주기적 메트릭 계산
    this.samplingTimer = setInterval(() => {
      this.calculateMetrics();
    }, this.options.samplingInterval || 30000); // 30초

    console.log('📊 MetricsCollector started');
  }

  /**
   * 메트릭 수집 중지
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.eventSubscriptionId) {
      eventEngine.unsubscribe(this.eventSubscriptionId);
      this.eventSubscriptionId = undefined;
    }

    if (this.samplingTimer) {
      clearInterval(this.samplingTimer);
      this.samplingTimer = undefined;
    }

    console.log('📊 MetricsCollector stopped');
  }

  /**
   * 이벤트 처리
   */
  private handleEvent(event: BaseEvent): void {
    this.rawEvents.push(event);

    // 메모리 관리: 보존 기간을 초과한 이벤트 제거
    const retentionMs = (this.options.retentionPeriod || 7) * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - retentionMs;
    this.rawEvents = this.rawEvents.filter(e => e.timestamp > cutoff);

    // 실시간 메트릭 업데이트
    this.updateRealTimeMetrics(event);
  }

  /**
   * 실시간 메트릭 업데이트
   */
  private updateRealTimeMetrics(event: BaseEvent): void {
    const now = new Date();

    // 이벤트 카테고리별 카운트
    const categoryMetricId = `events_by_category_${event.category}`;
    this.updateMetricValue(categoryMetricId, 1, MetricUnit.COUNT, now);

    // 심각도별 카운트
    const severityMetricId = `events_by_severity_${event.severity}`;
    this.updateMetricValue(severityMetricId, 1, MetricUnit.COUNT, now);

    // 카테고리별 특수 메트릭
    switch (event.category) {
      case EventCategory.FILE:
        this.handleFileEvent(event, now);
        break;
      case EventCategory.GIT:
        this.handleGitEvent(event, now);
        break;
      case EventCategory.TEST:
        this.handleTestEvent(event, now);
        break;
      case EventCategory.BUILD:
        this.handleBuildEvent(event, now);
        break;
      case EventCategory.AI:
        this.handleAIEvent(event, now);
        break;
    }
  }

  /**
   * 파일 이벤트 처리
   */
  private handleFileEvent(event: BaseEvent, timestamp: Date): void {
    if (event.type === 'file:changed') {
      this.updateMetricValue('file_changes_per_hour', 1, MetricUnit.RATE, timestamp);
      
      if (event.data.path && event.data.path.match(/\.(ts|js|tsx|jsx)$/)) {
        this.updateMetricValue('code_file_changes', 1, MetricUnit.COUNT, timestamp);
      }
    }
  }

  /**
   * Git 이벤트 처리
   */
  private handleGitEvent(event: BaseEvent, timestamp: Date): void {
    switch (event.type) {
      case 'git:commit':
        this.updateMetricValue('commits_per_day', 1, MetricUnit.RATE, timestamp);
        
        if (event.data.stats) {
          this.updateMetricValue('lines_added', event.data.stats.insertions || 0, MetricUnit.LINES, timestamp);
          this.updateMetricValue('lines_deleted', event.data.stats.deletions || 0, MetricUnit.LINES, timestamp);
          this.updateMetricValue('files_modified', event.data.stats.files || 0, MetricUnit.COUNT, timestamp);
        }
        break;
        
      case 'git:branch:created':
        this.updateMetricValue('branches_created', 1, MetricUnit.COUNT, timestamp);
        break;
        
      case 'git:merge':
        this.updateMetricValue('merges_per_day', 1, MetricUnit.RATE, timestamp);
        break;
    }
  }

  /**
   * 테스트 이벤트 처리
   */
  private handleTestEvent(event: BaseEvent, timestamp: Date): void {
    if (event.type === 'test:run') {
      this.updateMetricValue('test_runs', 1, MetricUnit.COUNT, timestamp);
      
      if (event.data.duration) {
        this.updateMetricValue('test_execution_time', event.data.duration, MetricUnit.DURATION, timestamp);
      }
      
      if (event.data.coverage) {
        this.updateMetricValue('test_coverage', event.data.coverage, MetricUnit.PERCENTAGE, timestamp);
      }
    }
  }

  /**
   * 빌드 이벤트 처리
   */
  private handleBuildEvent(event: BaseEvent, timestamp: Date): void {
    if (event.type === 'build:completed') {
      this.updateMetricValue('builds_per_day', 1, MetricUnit.RATE, timestamp);
      
      if (event.data.duration) {
        this.updateMetricValue('build_time', event.data.duration, MetricUnit.DURATION, timestamp);
      }
      
      if (event.data.success) {
        this.updateMetricValue('build_success_rate', 1, MetricUnit.PERCENTAGE, timestamp);
      } else {
        this.updateMetricValue('build_failure_rate', 1, MetricUnit.PERCENTAGE, timestamp);
      }
    }
  }

  /**
   * AI 이벤트 처리
   */
  private handleAIEvent(event: BaseEvent, timestamp: Date): void {
    if (event.type === 'ai:suggestion') {
      this.updateMetricValue('ai_suggestions', 1, MetricUnit.COUNT, timestamp);
      
      if (event.data.accepted) {
        this.updateMetricValue('ai_acceptance_rate', 1, MetricUnit.PERCENTAGE, timestamp);
      }
    }
  }

  /**
   * 메트릭 값 업데이트
   */
  private updateMetricValue(metricId: string, value: number, unit: MetricUnit, timestamp: Date): void {
    let metric = this.metrics.get(metricId);
    
    if (!metric) {
      // 동적 메트릭 생성
      const definition: MetricDefinition = {
        id: metricId,
        name: metricId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        description: `Auto-generated metric for ${metricId}`,
        type: this.inferMetricType(metricId),
        unit,
        aggregationType: this.inferAggregationType(unit),
        category: this.inferCategory(metricId),
        tags: ['auto-generated'],
      };
      
      metric = {
        definition,
        values: [],
        lastUpdated: timestamp,
        summary: this.createEmptySummary(),
      };
      
      this.metrics.set(metricId, metric);
    }

    // 값 추가
    metric.values.push({
      value,
      unit,
      timestamp,
    });

    metric.lastUpdated = timestamp;

    // 값 개수 제한 (메모리 관리)
    if (metric.values.length > 1000) {
      metric.values = metric.values.slice(-500);
    }
  }

  /**
   * 주기적 메트릭 계산
   */
  private calculateMetrics(): void {
    for (const [_id, metric] of this.metrics) {
      this.updateMetricSummary(metric);
    }

    this.emit('metrics-updated', this.getMetricsSnapshot());
  }

  /**
   * 메트릭 요약 업데이트
   */
  private updateMetricSummary(metric: MetricData): void {
    const values = metric.values.map(v => v.value);
    
    if (values.length === 0) {
      return;
    }

    const current = values[values.length - 1] || 0;
    const previous = values.length > 1 ? values[values.length - 2] || 0 : current;
    const change = current - previous;
    const changePercentage = previous !== 0 ? (change / previous) * 100 : 0;

    metric.summary = {
      current,
      previous,
      change,
      changePercentage,
      trend: this.calculateTrend(values.slice(-10)), // 최근 10개 값으로 트렌드 계산
      min: Math.min(...values),
      max: Math.max(...values),
      average: values.reduce((a, b) => a + b, 0) / values.length,
      median: this.calculateMedian(values),
    };
  }

  /**
   * 트렌드 계산
   */
  private calculateTrend(values: number[]): TrendDirection {
    if (values.length < 3) {
      return TrendDirection.STABLE;
    }

    const recent = values.slice(-3);
    const older = values.slice(-6, -3);
    
    const recentAvg = recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
    const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : recentAvg;
    
    const change = ((recentAvg - olderAvg) / olderAvg) * 100;
    
    if (Math.abs(change) < 5) {
      return TrendDirection.STABLE;
    } else if (change > 0) {
      return TrendDirection.INCREASING;
    } else {
      return TrendDirection.DECREASING;
    }
  }

  /**
   * 중앙값 계산
   */
  private calculateMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    return sorted.length % 2 !== 0
      ? sorted[mid] || 0
      : ((sorted[mid - 1] || 0) + (sorted[mid] || 0)) / 2;
  }

  /**
   * 메트릭 조회
   */
  getMetric(id: string): MetricData | undefined {
    return this.metrics.get(id);
  }

  /**
   * 모든 메트릭 조회
   */
  getAllMetrics(): Map<string, MetricData> {
    return new Map(this.metrics);
  }

  /**
   * 필터링된 메트릭 조회
   */
  getFilteredMetrics(filter: any): MetricData[] {
    const metrics = Array.from(this.metrics.values());
    
    return metrics.filter(metric => {
      if (filter.metricTypes && !filter.metricTypes.includes(metric.definition.type)) {
        return false;
      }
      
      if (filter.categories && !filter.categories.includes(metric.definition.category)) {
        return false;
      }
      
      if (filter.tags && !filter.tags.some((tag: string) => metric.definition.tags.includes(tag))) {
        return false;
      }
      
      if (filter.threshold) {
        const current = metric.summary.current;
        if (filter.threshold.min && current < filter.threshold.min) {
          return false;
        }
        if (filter.threshold.max && current > filter.threshold.max) {
          return false;
        }
      }
      
      return true;
    });
  }

  /**
   * 메트릭 스냅샷
   */
  getMetricsSnapshot() {
    const now = new Date();
    const uptime = now.getTime() - this.startTime;
    
    return {
      timestamp: now,
      uptime,
      totalEvents: this.rawEvents.length,
      totalMetrics: this.metrics.size,
      metrics: Object.fromEntries(this.metrics),
      summary: {
        topMetrics: this.getTopMetrics(5),
        alerts: this.generateAlerts(),
        trends: this.analyzeTrends(),
      },
    };
  }

  /**
   * 상위 메트릭 조회
   */
  private getTopMetrics(count: number): MetricData[] {
    return Array.from(this.metrics.values())
      .sort((a, b) => b.summary.current - a.summary.current)
      .slice(0, count);
  }

  /**
   * 알림 생성
   */
  private generateAlerts(): string[] {
    const alerts: string[] = [];
    
    for (const metric of this.metrics.values()) {
      if (metric.summary.changePercentage > 50) {
        alerts.push(`${metric.definition.name} increased by ${metric.summary.changePercentage.toFixed(1)}%`);
      }
      
      if (metric.summary.changePercentage < -30) {
        alerts.push(`${metric.definition.name} decreased by ${Math.abs(metric.summary.changePercentage).toFixed(1)}%`);
      }
    }
    
    return alerts;
  }

  /**
   * 트렌드 분석
   */
  private analyzeTrends(): Record<string, TrendDirection> {
    const trends: Record<string, TrendDirection> = {};
    
    for (const [id, metric] of this.metrics) {
      trends[id] = metric.summary.trend;
    }
    
    return trends;
  }

  /**
   * 기본 메트릭 초기화
   */
  private initializeDefaultMetrics(): void {
    const defaultMetrics: MetricDefinition[] = [
      {
        id: 'total_events',
        name: 'Total Events',
        description: 'Total number of events processed',
        type: MetricType.PRODUCTIVITY,
        unit: MetricUnit.COUNT,
        aggregationType: AggregationType.COUNT,
        category: EventCategory.SYSTEM,
        tags: ['system', 'events'],
      },
      {
        id: 'events_per_hour',
        name: 'Events Per Hour',
        description: 'Number of events processed per hour',
        type: MetricType.PRODUCTIVITY,
        unit: MetricUnit.RATE,
        aggregationType: AggregationType.RATE,
        category: EventCategory.SYSTEM,
        tags: ['system', 'events', 'rate'],
      },
    ];

    for (const definition of defaultMetrics) {
      this.metrics.set(definition.id, {
        definition,
        values: [],
        lastUpdated: new Date(),
        summary: this.createEmptySummary(),
      });
    }
  }

  /**
   * 빈 요약 생성
   */
  private createEmptySummary(): MetricSummary {
    return {
      current: 0,
      previous: 0,
      change: 0,
      changePercentage: 0,
      trend: TrendDirection.STABLE,
      min: 0,
      max: 0,
      average: 0,
      median: 0,
    };
  }

  /**
   * 메트릭 타입 추론
   */
  private inferMetricType(metricId: string): MetricType {
    if (metricId.includes('test') || metricId.includes('coverage')) {
      return MetricType.QUALITY;
    }
    if (metricId.includes('build') || metricId.includes('time')) {
      return MetricType.PERFORMANCE;
    }
    if (metricId.includes('ai')) {
      return MetricType.AI_USAGE;
    }
    if (metricId.includes('commit') || metricId.includes('lines')) {
      return MetricType.PRODUCTIVITY;
    }
    return MetricType.PRODUCTIVITY;
  }

  /**
   * 집계 타입 추론
   */
  private inferAggregationType(unit: MetricUnit): AggregationType {
    switch (unit) {
      case MetricUnit.COUNT:
        return AggregationType.SUM;
      case MetricUnit.PERCENTAGE:
      case MetricUnit.RATIO:
        return AggregationType.AVERAGE;
      case MetricUnit.DURATION:
        return AggregationType.AVERAGE;
      case MetricUnit.RATE:
        return AggregationType.RATE;
      default:
        return AggregationType.AVERAGE;
    }
  }

  /**
   * 카테고리 추론
   */
  private inferCategory(metricId: string): EventCategory {
    if (metricId.includes('file')) return EventCategory.FILE;
    if (metricId.includes('git') || metricId.includes('commit')) return EventCategory.GIT;
    if (metricId.includes('test')) return EventCategory.TEST;
    if (metricId.includes('build')) return EventCategory.BUILD;
    if (metricId.includes('ai')) return EventCategory.AI;
    return EventCategory.SYSTEM;
  }

  /**
   * 통계 조회
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      totalMetrics: this.metrics.size,
      totalEvents: this.rawEvents.length,
      uptime: Date.now() - this.startTime,
      memoryUsage: process.memoryUsage(),
    };
  }
}

// 싱글톤 인스턴스
export const metricsCollector = new MetricsCollector();