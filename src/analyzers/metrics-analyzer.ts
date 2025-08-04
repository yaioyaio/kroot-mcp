/**
 * 메트릭 분석기
 * 수집된 메트릭을 분석하여 인사이트와 권장사항을 제공합니다.
 */

import { EventEmitter } from 'eventemitter3';
import { metricsCollector } from './metrics-collector.js';
import { bottleneckDetector } from './bottleneck-detector.js';
import {
  MetricAnalysisResult,
  ProductivityMetrics,
  QualityMetrics,
  PerformanceMetrics,
  CollaborationMetrics,
  MetricData,
  MetricDefinition,
  MetricUnit,
  MetricType,
  TrendDirection,
  AggregationType,
  Bottleneck,
  MetricAlert,
  MetricAlertType,
} from './types/metrics.js';
import { EventSeverity, EventCategory } from '../events/types/base.js';

export interface MetricsAnalyzerOptions {
  analysisInterval?: number;
  alertThresholds?: Record<string, number>;
  enableInsights?: boolean;
  enableRecommendations?: boolean;
}

export class MetricsAnalyzer extends EventEmitter {
  private isRunning = false;
  private analysisTimer?: NodeJS.Timeout | undefined;
  private lastAnalysis?: MetricAnalysisResult;
  private alerts = new Map<string, MetricAlert>();

  constructor(private options: MetricsAnalyzerOptions = {}) {
    super();
  }

  /**
   * 분석 시작
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // 주기적 분석
    this.analysisTimer = setInterval(() => {
      this.performAnalysis();
    }, this.options.analysisInterval || 120000); // 2분

    // 초기 분석
    this.performAnalysis();

    console.log('📈 MetricsAnalyzer started');
  }

  /**
   * 분석 중지
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = undefined;
    }

    console.log('📈 MetricsAnalyzer stopped');
  }

  /**
   * 메트릭 분석 수행
   */
  async performAnalysis(): Promise<MetricAnalysisResult> {
    const now = new Date();
    const allMetrics = metricsCollector.getAllMetrics();
    const bottlenecks = bottleneckDetector.getAllBottlenecks();

    // 카테고리별 메트릭 분류
    const productivityMetrics = this.extractProductivityMetrics(allMetrics);
    const qualityMetrics = this.extractQualityMetrics(allMetrics);
    const performanceMetrics = this.extractPerformanceMetrics(allMetrics);
    const collaborationMetrics = this.extractCollaborationMetrics(allMetrics);

    // 전체 점수 계산
    const overallScore = this.calculateOverallScore(
      productivityMetrics,
      qualityMetrics,
      performanceMetrics,
      collaborationMetrics
    );

    // 트렌드 분석
    const overallTrend = this.analyzeOverallTrend(allMetrics);

    // 인사이트 생성
    const insights = this.options.enableInsights ? this.generateInsights(allMetrics, bottlenecks) : [];

    // 권장사항 생성
    const recommendations = this.options.enableRecommendations ? this.generateRecommendations(allMetrics, bottlenecks) : [];

    // 알림 생성
    const alerts = this.generateAlerts(allMetrics);

    const result: MetricAnalysisResult = {
      summary: {
        totalMetrics: allMetrics.size,
        activeBottlenecks: bottlenecks.length,
        overallScore,
        trend: overallTrend,
      },
      productivity: productivityMetrics,
      quality: qualityMetrics,
      performance: performanceMetrics,
      collaboration: collaborationMetrics,
      bottlenecks,
      insights,
      recommendations,
      alerts,
      generatedAt: now,
    };

    this.lastAnalysis = result;
    this.emit('analysis-completed', result);

    return result;
  }

  /**
   * 생산성 메트릭 추출
   */
  private extractProductivityMetrics(allMetrics: Map<string, MetricData>): ProductivityMetrics {
    return {
      linesOfCodePerHour: this.findOrCreateMetric(allMetrics, 'lines_per_hour', 'Lines of Code per Hour', MetricUnit.RATE),
      commitsPerDay: this.findOrCreateMetric(allMetrics, 'commits_per_day', 'Commits per Day', MetricUnit.RATE),
      filesModifiedPerCommit: this.findOrCreateMetric(allMetrics, 'files_per_commit', 'Files Modified per Commit', MetricUnit.RATIO),
      testCoverage: this.findOrCreateMetric(allMetrics, 'test_coverage', 'Test Coverage', MetricUnit.PERCENTAGE),
      codeReviewTime: this.findOrCreateMetric(allMetrics, 'code_review_time', 'Code Review Time', MetricUnit.DURATION),
      bugFixTime: this.findOrCreateMetric(allMetrics, 'bug_fix_time', 'Bug Fix Time', MetricUnit.DURATION),
      featureDeliveryTime: this.findOrCreateMetric(allMetrics, 'feature_delivery_time', 'Feature Delivery Time', MetricUnit.DURATION),
      workingHours: this.findOrCreateMetric(allMetrics, 'working_hours', 'Working Hours', MetricUnit.DURATION),
    };
  }

  /**
   * 품질 메트릭 추출
   */
  private extractQualityMetrics(allMetrics: Map<string, MetricData>): QualityMetrics {
    return {
      codeComplexity: this.findOrCreateMetric(allMetrics, 'code_complexity', 'Code Complexity', MetricUnit.SCORE),
      duplicateLines: this.findOrCreateMetric(allMetrics, 'duplicate_lines', 'Duplicate Lines', MetricUnit.COUNT),
      technicalDebt: this.findOrCreateMetric(allMetrics, 'technical_debt', 'Technical Debt', MetricUnit.SCORE),
      bugDensity: this.findOrCreateMetric(allMetrics, 'bug_density', 'Bug Density', MetricUnit.RATIO),
      testPassRate: this.findOrCreateMetric(allMetrics, 'test_pass_rate', 'Test Pass Rate', MetricUnit.PERCENTAGE),
      codeReviewApprovalRate: this.findOrCreateMetric(allMetrics, 'code_review_approval_rate', 'Code Review Approval Rate', MetricUnit.PERCENTAGE),
      refactoringFrequency: this.findOrCreateMetric(allMetrics, 'refactoring_frequency', 'Refactoring Frequency', MetricUnit.RATE),
      documentationCoverage: this.findOrCreateMetric(allMetrics, 'documentation_coverage', 'Documentation Coverage', MetricUnit.PERCENTAGE),
    };
  }

  /**
   * 성능 메트릭 추출
   */
  private extractPerformanceMetrics(allMetrics: Map<string, MetricData>): PerformanceMetrics {
    return {
      buildTime: this.findOrCreateMetric(allMetrics, 'build_time', 'Build Time', MetricUnit.DURATION),
      testExecutionTime: this.findOrCreateMetric(allMetrics, 'test_execution_time', 'Test Execution Time', MetricUnit.DURATION),
      deploymentTime: this.findOrCreateMetric(allMetrics, 'deployment_time', 'Deployment Time', MetricUnit.DURATION),
      memoryUsage: this.findOrCreateMetric(allMetrics, 'memory_usage', 'Memory Usage', MetricUnit.BYTES),
      cpuUsage: this.findOrCreateMetric(allMetrics, 'cpu_usage', 'CPU Usage', MetricUnit.PERCENTAGE),
      diskUsage: this.findOrCreateMetric(allMetrics, 'disk_usage', 'Disk Usage', MetricUnit.BYTES),
      networkLatency: this.findOrCreateMetric(allMetrics, 'network_latency', 'Network Latency', MetricUnit.DURATION),
      errorRate: this.findOrCreateMetric(allMetrics, 'error_rate', 'Error Rate', MetricUnit.PERCENTAGE),
    };
  }

  /**
   * 협업 메트릭 추출
   */
  private extractCollaborationMetrics(allMetrics: Map<string, MetricData>): CollaborationMetrics {
    return {
      pullRequestsPerDeveloper: this.findOrCreateMetric(allMetrics, 'pr_per_developer', 'Pull Requests per Developer', MetricUnit.RATIO),
      codeReviewParticipation: this.findOrCreateMetric(allMetrics, 'code_review_participation', 'Code Review Participation', MetricUnit.PERCENTAGE),
      communicationFrequency: this.findOrCreateMetric(allMetrics, 'communication_frequency', 'Communication Frequency', MetricUnit.RATE),
      knowledgeSharing: this.findOrCreateMetric(allMetrics, 'knowledge_sharing', 'Knowledge Sharing', MetricUnit.SCORE),
      pairProgrammingTime: this.findOrCreateMetric(allMetrics, 'pair_programming_time', 'Pair Programming Time', MetricUnit.DURATION),
      meetingTime: this.findOrCreateMetric(allMetrics, 'meeting_time', 'Meeting Time', MetricUnit.DURATION),
      mentorshipActivities: this.findOrCreateMetric(allMetrics, 'mentorship_activities', 'Mentorship Activities', MetricUnit.COUNT),
    };
  }

  /**
   * 메트릭 찾기 또는 생성
   */
  private findOrCreateMetric(allMetrics: Map<string, MetricData>, id: string, name: string, unit: MetricUnit): MetricData {
    const existing = allMetrics.get(id);
    if (existing) {
      return existing;
    }

    // 기본 메트릭 생성
    const definition: MetricDefinition = {
      id,
      name,
      description: `Auto-generated metric: ${name}`,
      type: this.inferMetricType(id),
      unit,
      aggregationType: this.inferAggregationType(unit),
      category: this.inferCategory(id),
      tags: ['auto-generated'],
    };

    return {
      definition,
      values: [],
      lastUpdated: new Date(),
      summary: {
        current: 0,
        previous: 0,
        change: 0,
        changePercentage: 0,
        trend: TrendDirection.STABLE,
        min: 0,
        max: 0,
        average: 0,
        median: 0,
      },
    };
  }

  /**
   * 전체 점수 계산
   */
  private calculateOverallScore(
    productivity: ProductivityMetrics,
    quality: QualityMetrics,
    performance: PerformanceMetrics,
    collaboration: CollaborationMetrics
  ): number {
    const scores = [
      this.calculateCategoryScore([
        productivity.linesOfCodePerHour,
        productivity.commitsPerDay,
        productivity.testCoverage,
      ]),
      this.calculateCategoryScore([
        quality.testPassRate,
        quality.codeReviewApprovalRate,
      ]),
      this.calculateCategoryScore([
        performance.buildTime,
        performance.testExecutionTime,
      ]),
      this.calculateCategoryScore([
        collaboration.codeReviewParticipation,
        collaboration.communicationFrequency,
      ]),
    ];

    const validScores = scores.filter(score => score > 0);
    return validScores.length > 0 ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) : 50;
  }

  /**
   * 카테고리 점수 계산
   */
  private calculateCategoryScore(metrics: MetricData[]): number {
    const validMetrics = metrics.filter(m => m.values.length > 0);
    if (validMetrics.length === 0) return 0;

    let totalScore = 0;
    for (const metric of validMetrics) {
      let score = 50; // 기본 점수

      // 트렌드에 따른 점수 조정
      switch (metric.summary.trend) {
        case TrendDirection.INCREASING:
          score += 20;
          break;
        case TrendDirection.DECREASING:
          score -= 20;
          break;
        case TrendDirection.VOLATILE:
          score -= 10;
          break;
      }

      // 변화율에 따른 점수 조정
      const changePercent = Math.abs(metric.summary.changePercentage);
      if (changePercent > 50) {
        score -= 15;
      } else if (changePercent > 20) {
        score -= 5;
      }

      totalScore += Math.max(0, Math.min(100, score));
    }

    return Math.round(totalScore / validMetrics.length);
  }

  /**
   * 전체 트렌드 분석
   */
  private analyzeOverallTrend(allMetrics: Map<string, MetricData>): TrendDirection {
    const trends = Array.from(allMetrics.values())
      .filter(m => m.values.length > 0)
      .map(m => m.summary.trend);

    if (trends.length === 0) return TrendDirection.STABLE;

    const trendCounts = trends.reduce((acc, trend) => {
      acc[trend] = (acc[trend] || 0) + 1;
      return acc;
    }, {} as Record<TrendDirection, number>);

    const maxCount = Math.max(...Object.values(trendCounts));
    const dominantTrend = Object.keys(trendCounts).find(
      trend => trendCounts[trend as TrendDirection] === maxCount
    ) as TrendDirection;

    return dominantTrend || TrendDirection.STABLE;
  }

  /**
   * 인사이트 생성
   */
  private generateInsights(allMetrics: Map<string, MetricData>, bottlenecks: Bottleneck[]): string[] {
    const insights: string[] = [];

    // 메트릭 기반 인사이트
    const metricsWithValues = Array.from(allMetrics.values()).filter(m => m.values.length > 0);
    
    if (metricsWithValues.length > 0) {
      const increasingMetrics = metricsWithValues.filter(m => m.summary.trend === TrendDirection.INCREASING);
      const decreasingMetrics = metricsWithValues.filter(m => m.summary.trend === TrendDirection.DECREASING);

      if (increasingMetrics.length > decreasingMetrics.length) {
        insights.push('📈 Overall development activity is trending upward');
      } else if (decreasingMetrics.length > increasingMetrics.length) {
        insights.push('📉 Some development metrics are declining');
      }

      // 특정 메트릭 인사이트
      const buildTime = allMetrics.get('build_time');
      if (buildTime && buildTime.summary.changePercentage > 30) {
        insights.push('⚠️ Build time has increased significantly - consider optimization');
      }

      const testCoverage = allMetrics.get('test_coverage');
      if (testCoverage && testCoverage.summary.current > 80) {
        insights.push('✅ Excellent test coverage maintained');
      }

      const commitsPerDay = allMetrics.get('commits_per_day');
      if (commitsPerDay && commitsPerDay.summary.current > 10) {
        insights.push('🚀 High development velocity detected');
      }
    }

    // 병목 현상 기반 인사이트
    if (bottlenecks.length > 0) {
      const highImpactBottlenecks = bottlenecks.filter(b => b.impact > 70);
      if (highImpactBottlenecks.length > 0) {
        insights.push(`🔍 ${highImpactBottlenecks.length} high-impact bottleneck(s) detected`);
      }

      const frequentBottlenecks = bottlenecks.filter(b => b.frequency > 3);
      if (frequentBottlenecks.length > 0) {
        insights.push(`🔄 ${frequentBottlenecks.length} recurring bottleneck(s) need attention`);
      }
    }

    return insights;
  }

  /**
   * 권장사항 생성
   */
  private generateRecommendations(allMetrics: Map<string, MetricData>, bottlenecks: Bottleneck[]): string[] {
    const recommendations: string[] = [];

    // 메트릭 기반 권장사항
    const buildTime = allMetrics.get('build_time');
    if (buildTime && buildTime.summary.trend === TrendDirection.INCREASING) {
      recommendations.push('Consider implementing build caching or parallel builds');
    }

    const testCoverage = allMetrics.get('test_coverage');
    if (testCoverage && testCoverage.summary.current < 70) {
      recommendations.push('Increase test coverage to improve code quality');
    }

    const errorRate = allMetrics.get('error_rate');
    if (errorRate && errorRate.summary.current > 5) {
      recommendations.push('Investigate and address high error rate');
    }

    // 병목 현상 기반 권장사항
    for (const bottleneck of bottlenecks) {
      if (bottleneck.impact > 60) {
        recommendations.push(...bottleneck.suggestedActions);
      }
    }

    return [...new Set(recommendations)]; // 중복 제거
  }

  /**
   * 알림 생성
   */
  private generateAlerts(allMetrics: Map<string, MetricData>): MetricAlert[] {
    const alerts: MetricAlert[] = [];
    const now = new Date();

    for (const [id, metric] of allMetrics) {
      const threshold = this.options.alertThresholds?.[id];
      if (!threshold) continue;

      const current = metric.summary.current;
      let alertType: MetricAlertType | null = null;
      let severity = EventSeverity.INFO;

      if (current > threshold) {
        alertType = MetricAlertType.THRESHOLD_EXCEEDED;
        severity = current > threshold * 1.5 ? EventSeverity.ERROR : EventSeverity.WARNING;
      } else if (current < threshold * 0.5) {
        alertType = MetricAlertType.THRESHOLD_BELOW;
        severity = EventSeverity.WARNING;
      }

      if (alertType) {
        const alertId = `${id}_${alertType}_${Date.now()}`;
        const alert: MetricAlert = {
          id: alertId,
          type: alertType,
          severity,
          metric: id,
          threshold,
          currentValue: current,
          message: `${metric.definition.name} is ${current} (threshold: ${threshold})`,
          createdAt: now,
          acknowledged: false,
        };

        alerts.push(alert);
        this.alerts.set(alertId, alert);
      }
    }

    return alerts;
  }

  /**
   * 메트릭 타입 추론
   */
  private inferMetricType(metricId: string): MetricType {
    if (metricId.includes('test') || metricId.includes('coverage') || metricId.includes('quality')) {
      return MetricType.QUALITY;
    }
    if (metricId.includes('build') || metricId.includes('time') || metricId.includes('performance')) {
      return MetricType.PERFORMANCE;
    }
    if (metricId.includes('ai')) {
      return MetricType.AI_USAGE;
    }
    if (metricId.includes('review') || metricId.includes('collaboration')) {
      return MetricType.COLLABORATION;
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
   * 최근 분석 결과 조회
   */
  getLastAnalysis(): MetricAnalysisResult | undefined {
    return this.lastAnalysis;
  }

  /**
   * 알림 조회
   */
  getAlerts(): MetricAlert[] {
    return Array.from(this.alerts.values());
  }

  /**
   * 알림 확인
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  /**
   * 상태 조회
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      lastAnalysisTime: this.lastAnalysis?.generatedAt,
      totalAlerts: this.alerts.size,
      unacknowledgedAlerts: Array.from(this.alerts.values()).filter(a => !a.acknowledged).length,
    };
  }
}

// 싱글톤 인스턴스
export const metricsAnalyzer = new MetricsAnalyzer();