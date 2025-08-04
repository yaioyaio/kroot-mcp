/**
 * 메트릭 관련 타입 정의
 */

import { EventCategory, EventSeverity } from '../../events/types/base.js';

/**
 * 메트릭 타입
 */
export enum MetricType {
  PRODUCTIVITY = 'productivity',
  QUALITY = 'quality',
  PERFORMANCE = 'performance',
  COLLABORATION = 'collaboration',
  METHODOLOGY = 'methodology',
  AI_USAGE = 'ai_usage',
  BOTTLENECK = 'bottleneck',
  TREND = 'trend',
}

/**
 * 메트릭 단위
 */
export enum MetricUnit {
  COUNT = 'count',
  PERCENTAGE = 'percentage',
  RATIO = 'ratio',
  DURATION = 'duration',
  RATE = 'rate',
  SCORE = 'score',
  BYTES = 'bytes',
  LINES = 'lines',
}

/**
 * 시간 범위
 */
export interface TimeRange {
  start: Date;
  end: Date;
}

/**
 * 메트릭 값
 */
export interface MetricValue {
  value: number;
  unit: MetricUnit;
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * 메트릭 정의
 */
export interface MetricDefinition {
  id: string;
  name: string;
  description: string;
  type: MetricType;
  unit: MetricUnit;
  aggregationType: AggregationType;
  category: EventCategory;
  tags: string[];
}

/**
 * 집계 타입
 */
export enum AggregationType {
  SUM = 'sum',
  AVERAGE = 'average',
  COUNT = 'count',
  MIN = 'min',
  MAX = 'max',
  MEDIAN = 'median',
  PERCENTILE = 'percentile',
  RATE = 'rate',
  TREND = 'trend',
}

/**
 * 메트릭 데이터
 */
export interface MetricData {
  definition: MetricDefinition;
  values: MetricValue[];
  lastUpdated: Date;
  summary: MetricSummary;
}

/**
 * 메트릭 요약
 */
export interface MetricSummary {
  current: number;
  previous: number;
  change: number;
  changePercentage: number;
  trend: TrendDirection;
  min: number;
  max: number;
  average: number;
  median: number;
}

/**
 * 트렌드 방향
 */
export enum TrendDirection {
  INCREASING = 'increasing',
  DECREASING = 'decreasing',
  STABLE = 'stable',
  VOLATILE = 'volatile',
}

/**
 * 생산성 메트릭
 */
export interface ProductivityMetrics {
  linesOfCodePerHour: MetricData;
  commitsPerDay: MetricData;
  filesModifiedPerCommit: MetricData;
  testCoverage: MetricData;
  codeReviewTime: MetricData;
  bugFixTime: MetricData;
  featureDeliveryTime: MetricData;
  workingHours: MetricData;
}

/**
 * 품질 메트릭
 */
export interface QualityMetrics {
  codeComplexity: MetricData;
  duplicateLines: MetricData;
  technicalDebt: MetricData;
  bugDensity: MetricData;
  testPassRate: MetricData;
  codeReviewApprovalRate: MetricData;
  refactoringFrequency: MetricData;
  documentationCoverage: MetricData;
}

/**
 * 성능 메트릭
 */
export interface PerformanceMetrics {
  buildTime: MetricData;
  testExecutionTime: MetricData;
  deploymentTime: MetricData;
  memoryUsage: MetricData;
  cpuUsage: MetricData;
  diskUsage: MetricData;
  networkLatency: MetricData;
  errorRate: MetricData;
}

/**
 * 협업 메트릭
 */
export interface CollaborationMetrics {
  pullRequestsPerDeveloper: MetricData;
  codeReviewParticipation: MetricData;
  communicationFrequency: MetricData;
  knowledgeSharing: MetricData;
  pairProgrammingTime: MetricData;
  meetingTime: MetricData;
  mentorshipActivities: MetricData;
}

/**
 * 병목 현상
 */
export interface Bottleneck {
  id: string;
  type: BottleneckType;
  category: EventCategory;
  severity: EventSeverity;
  title: string;
  description: string;
  location: string;
  impact: number; // 0-100
  confidence: number; // 0-100
  detectedAt: Date;
  lastOccurred: Date;
  frequency: number;
  duration: number;
  affectedMetrics: string[];
  suggestedActions: string[];
  metadata: Record<string, any>;
}

/**
 * 병목 현상 타입
 */
export enum BottleneckType {
  PROCESS = 'process',
  RESOURCE = 'resource',
  TECHNICAL = 'technical',
  COMMUNICATION = 'communication',
  QUALITY = 'quality',
  WORKFLOW = 'workflow',
  DEPENDENCY = 'dependency',
  SKILL = 'skill',
}

/**
 * 메트릭 필터
 */
export interface MetricFilter {
  metricTypes?: MetricType[];
  categories?: EventCategory[];
  timeRange?: TimeRange;
  tags?: string[];
  developers?: string[];
  projects?: string[];
  aggregation?: AggregationType;
  threshold?: {
    min?: number;
    max?: number;
  };
}

/**
 * 메트릭 분석 결과
 */
export interface MetricAnalysisResult {
  summary: {
    totalMetrics: number;
    activeBottlenecks: number;
    overallScore: number;
    trend: TrendDirection;
  };
  productivity: ProductivityMetrics;
  quality: QualityMetrics;
  performance: PerformanceMetrics;
  collaboration: CollaborationMetrics;
  bottlenecks: Bottleneck[];
  insights: string[];
  recommendations: string[];
  alerts: MetricAlert[];
  generatedAt: Date;
}

/**
 * 메트릭 알림
 */
export interface MetricAlert {
  id: string;
  type: MetricAlertType;
  severity: EventSeverity;
  metric: string;
  threshold: number;
  currentValue: number;
  message: string;
  createdAt: Date;
  acknowledged: boolean;
}

/**
 * 메트릭 알림 타입
 */
export enum MetricAlertType {
  THRESHOLD_EXCEEDED = 'threshold_exceeded',
  THRESHOLD_BELOW = 'threshold_below',
  TREND_ANOMALY = 'trend_anomaly',
  BOTTLENECK_DETECTED = 'bottleneck_detected',
  PERFORMANCE_DEGRADATION = 'performance_degradation',
  QUALITY_DECLINE = 'quality_decline',
}

/**
 * 메트릭 설정
 */
export interface MetricConfig {
  enabled: boolean;
  samplingInterval: number; // milliseconds
  retentionPeriod: number; // days
  aggregationWindow: number; // minutes
  alertThresholds: Record<string, number>;
  customMetrics: MetricDefinition[];
}