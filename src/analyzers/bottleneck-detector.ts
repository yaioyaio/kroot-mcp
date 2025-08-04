/**
 * 병목 현상 감지기
 * 개발 과정에서 발생하는 병목 현상을 자동으로 감지하고 분석합니다.
 */

import { EventEmitter } from 'eventemitter3';
import { eventEngine } from '../events/engine.js';
import { BaseEvent, EventCategory, EventSeverity } from '../events/types/base.js';
import { metricsCollector } from './metrics-collector.js';
import {
  Bottleneck,
  BottleneckType,
  MetricData,
  TrendDirection,
} from './types/metrics.js';

export interface BottleneckDetectorOptions {
  checkInterval?: number;
  alertThreshold?: number;
  confidenceThreshold?: number;
  enabledDetectors?: BottleneckType[];
}

export class BottleneckDetector extends EventEmitter {
  private isRunning = false;
  private detectionTimer?: NodeJS.Timeout | undefined;
  private eventSubscriptionId?: string | undefined;
  private bottlenecks = new Map<string, Bottleneck>();
  private detectionRules = new Map<BottleneckType, DetectionRule>();
  private eventHistory: BaseEvent[] = [];

  constructor(private options: BottleneckDetectorOptions = {}) {
    super();
    this.initializeDetectionRules();
  }

  /**
   * 감지 시작
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

    // 주기적 병목 감지
    this.detectionTimer = setInterval(() => {
      this.detectBottlenecks();
    }, this.options.checkInterval || 60000); // 1분

    console.log('🔍 BottleneckDetector started');
  }

  /**
   * 감지 중지
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

    if (this.detectionTimer) {
      clearInterval(this.detectionTimer);
      this.detectionTimer = undefined;
    }

    console.log('🔍 BottleneckDetector stopped');
  }

  /**
   * 이벤트 처리
   */
  private handleEvent(event: BaseEvent): void {
    this.eventHistory.push(event);

    // 메모리 관리: 최근 1000개 이벤트만 유지
    if (this.eventHistory.length > 1000) {
      this.eventHistory = this.eventHistory.slice(-500);
    }

    // 실시간 병목 감지 (중요한 이벤트만)
    if (event.severity === EventSeverity.ERROR || event.severity === EventSeverity.CRITICAL) {
      this.detectRealTimeBottlenecks(event);
    }
  }

  /**
   * 실시간 병목 감지
   */
  private detectRealTimeBottlenecks(event: BaseEvent): void {
    // 빌드 실패 감지
    if (event.category === EventCategory.BUILD && event.data.success === false) {
      this.createBottleneck({
        type: BottleneckType.TECHNICAL,
        category: EventCategory.BUILD,
        severity: EventSeverity.ERROR,
        title: 'Build Failure',
        description: `Build failed: ${event.data.error || 'Unknown error'}`,
        location: event.source,
        impact: 70,
        confidence: 85,
        metadata: event.data,
      });
    }

    // 테스트 실패 감지
    if (event.category === EventCategory.TEST && event.data.passed === false) {
      this.createBottleneck({
        type: BottleneckType.QUALITY,
        category: EventCategory.TEST,
        severity: EventSeverity.WARNING,
        title: 'Test Failure',
        description: `Test failed: ${event.data.testName || 'Unknown test'}`,
        location: event.source,
        impact: 50,
        confidence: 90,
        metadata: event.data,
      });
    }
  }

  /**
   * 주기적 병목 감지
   */
  private detectBottlenecks(): void {
    const metrics = metricsCollector.getAllMetrics();
    
    for (const [type, rule] of this.detectionRules) {
      if (this.options.enabledDetectors && !this.options.enabledDetectors.includes(type)) {
        continue;
      }

      try {
        const bottleneck = rule.detect(metrics, this.eventHistory);
        if (bottleneck && bottleneck.confidence >= (this.options.confidenceThreshold || 70)) {
          this.updateBottleneck(bottleneck);
        }
      } catch (error) {
        console.error(`Error detecting ${type} bottleneck:`, error);
      }
    }

    // 해결된 병목 현상 정리
    this.cleanupResolvedBottlenecks();

    this.emit('bottlenecks-updated', Array.from(this.bottlenecks.values()));
  }

  /**
   * 병목 현상 생성
   */
  private createBottleneck(data: Partial<Bottleneck>): void {
    const now = new Date();
    const id = `${data.type}_${Date.now()}`;

    const bottleneck: Bottleneck = {
      id,
      type: data.type || BottleneckType.PROCESS,
      category: data.category || EventCategory.SYSTEM,
      severity: data.severity || EventSeverity.WARNING,
      title: data.title || 'Unknown Bottleneck',
      description: data.description || '',
      location: data.location || 'Unknown',
      impact: data.impact || 50,
      confidence: data.confidence || 50,
      detectedAt: now,
      lastOccurred: now,
      frequency: 1,
      duration: 0,
      affectedMetrics: data.affectedMetrics || [],
      suggestedActions: data.suggestedActions || [],
      metadata: data.metadata || {},
    };

    this.bottlenecks.set(id, bottleneck);
    this.emit('bottleneck-detected', bottleneck);
  }

  /**
   * 병목 현상 업데이트
   */
  private updateBottleneck(newBottleneck: Bottleneck): void {
    const existingId = this.findSimilarBottleneck(newBottleneck);
    
    if (existingId) {
      const existing = this.bottlenecks.get(existingId)!;
      existing.lastOccurred = new Date();
      existing.frequency += 1;
      existing.confidence = Math.min(100, existing.confidence + 5);
      existing.duration = existing.lastOccurred.getTime() - existing.detectedAt.getTime();
      
      this.bottlenecks.set(existingId, existing);
      this.emit('bottleneck-updated', existing);
    } else {
      this.bottlenecks.set(newBottleneck.id, newBottleneck);
      this.emit('bottleneck-detected', newBottleneck);
    }
  }

  /**
   * 유사한 병목 현상 찾기
   */
  private findSimilarBottleneck(bottleneck: Bottleneck): string | undefined {
    for (const [id, existing] of this.bottlenecks) {
      if (
        existing.type === bottleneck.type &&
        existing.category === bottleneck.category &&
        existing.location === bottleneck.location &&
        this.isSimilarTitle(existing.title, bottleneck.title)
      ) {
        return id;
      }
    }
    return undefined;
  }

  /**
   * 제목 유사도 검사
   */
  private isSimilarTitle(title1: string, title2: string): boolean {
    const words1 = title1.toLowerCase().split(/\s+/);
    const words2 = title2.toLowerCase().split(/\s+/);
    
    const commonWords = words1.filter(word => words2.includes(word));
    const similarity = commonWords.length / Math.max(words1.length, words2.length);
    
    return similarity > 0.6;
  }

  /**
   * 해결된 병목 현상 정리
   */
  private cleanupResolvedBottlenecks(): void {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5분

    for (const [id, bottleneck] of this.bottlenecks) {
      if (now - bottleneck.lastOccurred.getTime() > staleThreshold) {
        this.bottlenecks.delete(id);
        this.emit('bottleneck-resolved', bottleneck);
      }
    }
  }

  /**
   * 감지 규칙 초기화
   */
  private initializeDetectionRules(): void {
    // 프로세스 병목 감지
    this.detectionRules.set(BottleneckType.PROCESS, {
      detect: (metrics, _events) => {
        const buildTime = metrics.get('build_time');
        if (buildTime && buildTime.summary.trend === TrendDirection.INCREASING) {
          return {
            id: `process_${Date.now()}`,
            type: BottleneckType.PROCESS,
            category: EventCategory.BUILD,
            severity: EventSeverity.WARNING,
            title: 'Increasing Build Time',
            description: `Build time has been increasing: ${buildTime.summary.changePercentage.toFixed(1)}% change`,
            location: 'Build Process',
            impact: Math.min(80, Math.abs(buildTime.summary.changePercentage)),
            confidence: 75,
            detectedAt: new Date(),
            lastOccurred: new Date(),
            frequency: 1,
            duration: 0,
            affectedMetrics: ['build_time'],
            suggestedActions: [
              'Review build configuration',
              'Check for dependency issues',
              'Optimize build scripts',
            ],
            metadata: { metric: buildTime },
          };
        }
        return null;
      },
    });

    // 품질 병목 감지
    this.detectionRules.set(BottleneckType.QUALITY, {
      detect: (metrics, _events) => {
        const testCoverage = metrics.get('test_coverage');
        if (testCoverage && testCoverage.summary.trend === TrendDirection.DECREASING) {
          return {
            id: `quality_${Date.now()}`,
            type: BottleneckType.QUALITY,
            category: EventCategory.TEST,
            severity: EventSeverity.WARNING,
            title: 'Decreasing Test Coverage',
            description: `Test coverage has been decreasing: ${Math.abs(testCoverage.summary.changePercentage).toFixed(1)}% drop`,
            location: 'Test Suite',
            impact: Math.min(70, Math.abs(testCoverage.summary.changePercentage)),
            confidence: 80,
            detectedAt: new Date(),
            lastOccurred: new Date(),
            frequency: 1,
            duration: 0,
            affectedMetrics: ['test_coverage'],
            suggestedActions: [
              'Add more unit tests',
              'Review uncovered code paths',
              'Implement integration tests',
            ],
            metadata: { metric: testCoverage },
          };
        }
        return null;
      },
    });

    // 리소스 병목 감지
    this.detectionRules.set(BottleneckType.RESOURCE, {
      detect: (metrics, _events) => {
        const fileChanges = metrics.get('file_changes_per_hour');
        if (fileChanges && fileChanges.summary.current > 100) {
          return {
            id: `resource_${Date.now()}`,
            type: BottleneckType.RESOURCE,
            category: EventCategory.FILE,
            severity: EventSeverity.INFO,
            title: 'High File Change Rate',
            description: `Unusually high file change rate: ${fileChanges.summary.current} changes/hour`,
            location: 'File System',
            impact: 40,
            confidence: 60,
            detectedAt: new Date(),
            lastOccurred: new Date(),
            frequency: 1,
            duration: 0,
            affectedMetrics: ['file_changes_per_hour'],
            suggestedActions: [
              'Review file watching patterns',
              'Check for infinite loops in file operations',
              'Optimize file processing',
            ],
            metadata: { metric: fileChanges },
          };
        }
        return null;
      },
    });

    // 워크플로우 병목 감지
    this.detectionRules.set(BottleneckType.WORKFLOW, {
      detect: (_metrics, events) => {
        const recentEvents = events.filter((e: { timestamp: number }) => Date.now() - e.timestamp < 10 * 60 * 1000); // 최근 10분
        const errorEvents = recentEvents.filter(e => e.severity === EventSeverity.ERROR);
        
        if (errorEvents.length > 5) {
          return {
            id: `workflow_${Date.now()}`,
            type: BottleneckType.WORKFLOW,
            category: EventCategory.SYSTEM,
            severity: EventSeverity.WARNING,
            title: 'High Error Rate',
            description: `High number of errors in the last 10 minutes: ${errorEvents.length} errors`,
            location: 'Development Workflow',
            impact: Math.min(90, errorEvents.length * 10),
            confidence: 85,
            detectedAt: new Date(),
            lastOccurred: new Date(),
            frequency: 1,
            duration: 0,
            affectedMetrics: ['error_rate'],
            suggestedActions: [
              'Review recent changes',
              'Check system logs',
              'Validate configuration',
            ],
            metadata: { errorCount: errorEvents.length, errors: errorEvents },
          };
        }
        return null;
      },
    });

    // 기술적 병목 감지
    this.detectionRules.set(BottleneckType.TECHNICAL, {
      detect: (_metrics, _events) => {
        const memoryUsage = process.memoryUsage();
        const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
        
        if (memoryUsagePercent > 85) {
          return {
            id: `technical_${Date.now()}`,
            type: BottleneckType.TECHNICAL,
            category: EventCategory.SYSTEM,
            severity: EventSeverity.WARNING,
            title: 'High Memory Usage',
            description: `Memory usage is ${memoryUsagePercent.toFixed(1)}%`,
            location: 'System Resources',
            impact: Math.min(95, memoryUsagePercent),
            confidence: 90,
            detectedAt: new Date(),
            lastOccurred: new Date(),
            frequency: 1,
            duration: 0,
            affectedMetrics: ['memory_usage'],
            suggestedActions: [
              'Check for memory leaks',
              'Optimize data structures',
              'Implement garbage collection',
            ],
            metadata: { memoryUsage },
          };
        }
        return null;
      },
    });
  }

  /**
   * 모든 병목 현상 조회
   */
  getAllBottlenecks(): Bottleneck[] {
    return Array.from(this.bottlenecks.values());
  }

  /**
   * 심각도별 병목 현상 조회
   */
  getBottlenecksBySeverity(severity: EventSeverity): Bottleneck[] {
    return Array.from(this.bottlenecks.values()).filter(b => b.severity === severity);
  }

  /**
   * 타입별 병목 현상 조회
   */
  getBottlenecksByType(type: BottleneckType): Bottleneck[] {
    return Array.from(this.bottlenecks.values()).filter(b => b.type === type);
  }

  /**
   * 활성 병목 현상 수
   */
  getActiveBottleneckCount(): number {
    return this.bottlenecks.size;
  }

  /**
   * 병목 현상 통계
   */
  getBottleneckStats() {
    const bottlenecks = Array.from(this.bottlenecks.values());
    
    const byType = bottlenecks.reduce((acc, b) => {
      acc[b.type] = (acc[b.type] || 0) + 1;
      return acc;
    }, {} as Record<BottleneckType, number>);

    const bySeverity = bottlenecks.reduce((acc, b) => {
      acc[b.severity] = (acc[b.severity] || 0) + 1;
      return acc;
    }, {} as Record<EventSeverity, number>);

    const avgImpact = bottlenecks.length > 0 
      ? bottlenecks.reduce((sum, b) => sum + b.impact, 0) / bottlenecks.length 
      : 0;

    const avgConfidence = bottlenecks.length > 0 
      ? bottlenecks.reduce((sum, b) => sum + b.confidence, 0) / bottlenecks.length 
      : 0;

    return {
      total: bottlenecks.length,
      byType,
      bySeverity,
      averageImpact: Math.round(avgImpact),
      averageConfidence: Math.round(avgConfidence),
      mostFrequent: bottlenecks.sort((a, b) => b.frequency - a.frequency)[0],
      highestImpact: bottlenecks.sort((a, b) => b.impact - a.impact)[0],
    };
  }

  /**
   * 상태 조회
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      totalBottlenecks: this.bottlenecks.size,
      totalEvents: this.eventHistory.length,
      detectionRules: this.detectionRules.size,
      stats: this.getBottleneckStats(),
    };
  }
}

/**
 * 감지 규칙 인터페이스
 */
interface DetectionRule {
  detect(metrics: Map<string, MetricData>, events: BaseEvent[]): Bottleneck | null;
}

// 싱글톤 인스턴스
export const bottleneckDetector = new BottleneckDetector();