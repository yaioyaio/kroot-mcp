/**
 * Performance Profiler
 * 시스템 성능 분석 및 병목점 식별
 */

import { EventEmitter } from 'eventemitter3';

export interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
}

export interface CPUSnapshot {
  timestamp: number;
  userTime: number;
  systemTime: number;
  cpuUsage: number;
}

export interface ProfilerStats {
  averageResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  memoryTrend: 'increasing' | 'stable' | 'decreasing';
  memoryLeakPotential: number; // 0-100 score
  bottlenecks: BottleneckInfo[];
  recommendations: string[];
}

export interface BottleneckInfo {
  operation: string;
  averageDuration: number;
  callCount: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  impact: string;
}

export class PerformanceProfiler extends EventEmitter {
  private metrics: Map<string, PerformanceMetric> = new Map();
  private completedMetrics: PerformanceMetric[] = [];
  private memorySnapshots: MemorySnapshot[] = [];
  private cpuSnapshots: CPUSnapshot[] = [];
  private isMonitoring = false;
  private monitoringInterval?: NodeJS.Timeout;
  private maxHistorySize = 1000;

  constructor() {
    super();
    this.setupMemoryMonitoring();
  }

  /**
   * 성능 메트릭 추적 시작
   */
  startMetric(name: string, metadata?: Record<string, any>): string {
    const metricId = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const metric: PerformanceMetric = {
      name,
      startTime: performance.now(),
      metadata
    };

    this.metrics.set(metricId, metric);
    return metricId;
  }

  /**
   * 성능 메트릭 추적 종료
   */
  endMetric(metricId: string): PerformanceMetric | null {
    const metric = this.metrics.get(metricId);
    if (!metric) {
      return null;
    }

    const endTime = performance.now();
    metric.endTime = endTime;
    metric.duration = endTime - metric.startTime;

    this.metrics.delete(metricId);
    this.completedMetrics.push(metric);

    // 히스토리 크기 제한
    if (this.completedMetrics.length > this.maxHistorySize) {
      this.completedMetrics = this.completedMetrics.slice(-this.maxHistorySize);
    }

    // 성능 이벤트 발행
    this.emit('metricCompleted', metric);

    // 병목 현상 감지
    if (metric.duration! > 1000) { // 1초 이상
      this.emit('bottleneckDetected', {
        operation: metric.name,
        duration: metric.duration,
        severity: this.getBottleneckSeverity(metric.duration!)
      });
    }

    return metric;
  }

  /**
   * 함수 실행 시간 측정 데코레이터
   */
  measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    return new Promise(async (resolve, reject) => {
      const metricId = this.startMetric(name);
      
      try {
        const result = await fn();
        this.endMetric(metricId);
        resolve(result);
      } catch (error) {
        this.endMetric(metricId);
        reject(error);
      }
    });
  }

  /**
   * 동기 함수 실행 시간 측정
   */
  measureSync<T>(name: string, fn: () => T): T {
    const metricId = this.startMetric(name);
    
    try {
      const result = fn();
      this.endMetric(metricId);
      return result;
    } catch (error) {
      this.endMetric(metricId);
      throw error;
    }
  }

  /**
   * 시스템 모니터링 시작
   */
  startMonitoring(intervalMs = 5000): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.captureMemorySnapshot();
      this.captureCPUSnapshot();
    }, intervalMs);

    this.emit('monitoringStarted');
  }

  /**
   * 시스템 모니터링 중지
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    this.emit('monitoringStopped');
  }

  /**
   * 메모리 스냅샷 캡처
   */
  private captureMemorySnapshot(): void {
    const memUsage = process.memoryUsage();
    
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      arrayBuffers: memUsage.arrayBuffers
    };

    this.memorySnapshots.push(snapshot);

    // 히스토리 크기 제한
    if (this.memorySnapshots.length > this.maxHistorySize) {
      this.memorySnapshots = this.memorySnapshots.slice(-this.maxHistorySize);
    }

    // 메모리 누수 경고
    if (this.detectMemoryLeak()) {
      this.emit('memoryLeakDetected', {
        currentHeapUsed: snapshot.heapUsed,
        trend: this.getMemoryTrend(),
        severity: this.getMemoryLeakSeverity()
      });
    }
  }

  /**
   * CPU 스냅샷 캡처
   */
  private captureCPUSnapshot(): void {
    const cpuUsage = process.cpuUsage();
    
    const snapshot: CPUSnapshot = {
      timestamp: Date.now(),
      userTime: cpuUsage.user,
      systemTime: cpuUsage.system,
      cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000 // 마이크로초를 초로 변환
    };

    this.cpuSnapshots.push(snapshot);

    // 히스토리 크기 제한
    if (this.cpuSnapshots.length > this.maxHistorySize) {
      this.cpuSnapshots = this.cpuSnapshots.slice(-this.maxHistorySize);
    }
  }

  /**
   * 성능 통계 생성
   */
  getStats(): ProfilerStats {
    const durations = this.completedMetrics
      .filter(m => m.duration !== undefined)
      .map(m => m.duration!);

    const bottlenecks = this.analyzeBottlenecks();
    
    return {
      averageResponseTime: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      maxResponseTime: durations.length > 0 ? Math.max(...durations) : 0,
      minResponseTime: durations.length > 0 ? Math.min(...durations) : 0,
      memoryTrend: this.getMemoryTrend(),
      memoryLeakPotential: this.getMemoryLeakPotential(),
      bottlenecks,
      recommendations: this.generateRecommendations(bottlenecks)
    };
  }

  /**
   * 병목 현상 분석
   */
  private analyzeBottlenecks(): BottleneckInfo[] {
    const operationStats = new Map<string, { durations: number[], count: number }>();

    // 작업별 통계 수집
    this.completedMetrics.forEach(metric => {
      if (!metric.duration) return;

      if (!operationStats.has(metric.name)) {
        operationStats.set(metric.name, { durations: [], count: 0 });
      }

      const stats = operationStats.get(metric.name)!;
      stats.durations.push(metric.duration);
      stats.count++;
    });

    // 병목 현상 분석
    const bottlenecks: BottleneckInfo[] = [];

    operationStats.forEach((stats, operation) => {
      const averageDuration = stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length;
      
      if (averageDuration > 100) { // 100ms 이상
        bottlenecks.push({
          operation,
          averageDuration,
          callCount: stats.count,
          severity: this.getBottleneckSeverity(averageDuration),
          impact: this.getBottleneckImpact(averageDuration, stats.count)
        });
      }
    });

    return bottlenecks.sort((a, b) => b.averageDuration - a.averageDuration);
  }

  /**
   * 병목 현상 심각도 판단
   */
  private getBottleneckSeverity(duration: number): 'low' | 'medium' | 'high' | 'critical' {
    if (duration > 5000) return 'critical'; // 5초 이상
    if (duration > 2000) return 'high';     // 2초 이상
    if (duration > 500) return 'medium';    // 500ms 이상
    return 'low';
  }

  /**
   * 병목 현상 영향도 분석
   */
  private getBottleneckImpact(duration: number, callCount: number): string {
    const totalImpact = duration * callCount;
    
    if (totalImpact > 60000) { // 1분 이상의 총 영향
      return `High impact: ${(totalImpact / 1000).toFixed(1)}s total delay across ${callCount} calls`;
    } else if (totalImpact > 10000) { // 10초 이상
      return `Medium impact: ${(totalImpact / 1000).toFixed(1)}s total delay across ${callCount} calls`;
    } else {
      return `Low impact: ${(totalImpact / 1000).toFixed(1)}s total delay across ${callCount} calls`;
    }
  }

  /**
   * 메모리 추세 분석
   */
  private getMemoryTrend(): 'increasing' | 'stable' | 'decreasing' {
    if (this.memorySnapshots.length < 10) {
      return 'stable';
    }

    const recent = this.memorySnapshots.slice(-10);
    const first = recent[0].heapUsed;
    const last = recent[recent.length - 1].heapUsed;
    
    const changePercent = ((last - first) / first) * 100;
    
    if (changePercent > 10) return 'increasing';
    if (changePercent < -10) return 'decreasing';
    return 'stable';
  }

  /**
   * 메모리 누수 감지
   */
  private detectMemoryLeak(): boolean {
    if (this.memorySnapshots.length < 20) {
      return false;
    }

    const recent = this.memorySnapshots.slice(-20);
    const increases = recent.reduce((count, snapshot, index) => {
      if (index === 0) return count;
      return snapshot.heapUsed > recent[index - 1].heapUsed ? count + 1 : count;
    }, 0);

    // 20개 중 15개 이상이 증가 추세면 메모리 누수 의심
    return increases >= 15;
  }

  /**
   * 메모리 누수 잠재성 점수
   */
  private getMemoryLeakPotential(): number {
    if (this.memorySnapshots.length < 10) {
      return 0;
    }

    const trend = this.getMemoryTrend();
    const recent = this.memorySnapshots.slice(-10);
    const growthRate = this.calculateMemoryGrowthRate(recent);

    let score = 0;
    
    if (trend === 'increasing') score += 40;
    if (growthRate > 0.1) score += 30; // 10% 이상 증가
    if (this.detectMemoryLeak()) score += 30;

    return Math.min(score, 100);
  }

  /**
   * 메모리 증가율 계산
   */
  private calculateMemoryGrowthRate(snapshots: MemorySnapshot[]): number {
    if (snapshots.length < 2) return 0;

    const first = snapshots[0].heapUsed;
    const last = snapshots[snapshots.length - 1].heapUsed;
    
    return (last - first) / first;
  }

  /**
   * 성능 개선 권장사항 생성
   */
  private generateRecommendations(bottlenecks: BottleneckInfo[]): string[] {
    const recommendations: string[] = [];

    // 병목 현상 기반 권장사항
    bottlenecks.forEach(bottleneck => {
      switch (bottleneck.severity) {
        case 'critical':
          recommendations.push(`CRITICAL: ${bottleneck.operation} 작업 최적화 필요 (평균 ${bottleneck.averageDuration.toFixed(0)}ms)`);
          break;
        case 'high':
          recommendations.push(`HIGH: ${bottleneck.operation} 작업에 캐싱 또는 비동기 처리 적용 검토`);
          break;
        case 'medium':
          recommendations.push(`MEDIUM: ${bottleneck.operation} 작업 성능 모니터링 지속`);
          break;
      }
    });

    // 메모리 기반 권장사항
    const memoryTrend = this.getMemoryTrend();
    const memoryLeakPotential = this.getMemoryLeakPotential();

    if (memoryTrend === 'increasing' && memoryLeakPotential > 70) {
      recommendations.push('CRITICAL: 메모리 누수 가능성 높음 - 즉시 조사 필요');
    } else if (memoryTrend === 'increasing') {
      recommendations.push('WARNING: 메모리 사용량 증가 추세 - 정기 모니터링 필요');
    }

    // 일반 권장사항
    if (recommendations.length === 0) {
      recommendations.push('성능 지표가 양호합니다. 현재 상태를 유지하세요.');
    }

    return recommendations;
  }

  /**
   * 메모리 모니터링 설정
   */
  private setupMemoryMonitoring(): void {
    // 초기 메모리 스냅샷
    this.captureMemorySnapshot();

    // 메모리 압박 상황 감지
    process.on('warning', (warning) => {
      if (warning.name === 'MaxListenersExceededWarning') {
        this.emit('performanceWarning', {
          type: 'memory',
          message: 'EventEmitter 리스너 수 초과',
          severity: 'medium'
        });
      }
    });
  }

  /**
   * 리소스 정리
   */
  cleanup(): void {
    this.stopMonitoring();
    this.metrics.clear();
    this.completedMetrics.length = 0;
    this.memorySnapshots.length = 0;
    this.cpuSnapshots.length = 0;
    this.removeAllListeners();
  }

  /**
   * 성능 리포트 생성
   */
  generateReport(): {
    summary: ProfilerStats;
    details: {
      recentMetrics: PerformanceMetric[];
      memoryHistory: MemorySnapshot[];
      cpuHistory: CPUSnapshot[];
    };
  } {
    return {
      summary: this.getStats(),
      details: {
        recentMetrics: this.completedMetrics.slice(-50),
        memoryHistory: this.memorySnapshots.slice(-50),
        cpuHistory: this.cpuSnapshots.slice(-50)
      }
    };
  }
}

// 싱글톤 인스턴스
export const performanceProfiler = new PerformanceProfiler();