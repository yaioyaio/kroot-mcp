/**
 * Performance Optimization Module
 * 성능 최적화 모듈 통합 인덱스
 */

export { PerformanceProfiler, performanceProfiler } from './performance-profiler.js';
export { MemoryOptimizer, memoryOptimizer } from './memory-optimizer.js';
export { AsyncOptimizer, asyncOptimizer } from './async-optimizer.js';
export { CacheManager, cacheManager } from './cache-manager.js';
export { ScalingManager, scalingManager } from './scaling-manager.js';

// 내부에서 사용하기 위한 import
import { performanceProfiler } from './performance-profiler.js';
import { memoryOptimizer } from './memory-optimizer.js';
import { asyncOptimizer } from './async-optimizer.js';
import { cacheManager } from './cache-manager.js';
import { scalingManager } from './scaling-manager.js';

export type {
  PerformanceMetric,
  MemorySnapshot,
  CPUSnapshot,
  ProfilerStats,
  BottleneckInfo
} from './performance-profiler.js';

export type {
  MemoryConfig,
  CacheEntry as MemoryCacheEntry,
  MemoryStats
} from './memory-optimizer.js';

export type {
  TaskConfig,
  Task,
  BatchConfig,
  AsyncStats
} from './async-optimizer.js';

export type {
  CacheConfig,
  CacheEntry,
  CacheStats
} from './cache-manager.js';

export type {
  ScalingConfig,
  ResourceMetrics,
  ScalingAction,
  LoadBalancerConfig
} from './scaling-manager.js';

/**
 * 성능 최적화 매니저
 * 모든 성능 최적화 컴포넌트를 통합 관리
 */
export class PerformanceManager {
  private initialized = false;

  /**
   * 성능 최적화 시스템 초기화
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // 프로파일러 모니터링 시작
    performanceProfiler.startMonitoring();
    
    // 스케일링 매니저 모니터링 시작
    scalingManager.startMonitoring();
    
    // 이벤트 연결 설정
    this.setupEventConnections();
    
    this.initialized = true;
  }

  /**
   * 이벤트 연결 설정
   */
  private setupEventConnections(): void {
    // 메모리 압박 상황 시 최적화 트리거
    memoryOptimizer.on('memoryPressure', async (event: any) => {
      if (event.level === 'critical') {
        await this.performEmergencyOptimization();
      }
    });

    // 병목 현상 감지 시 스케일링 고려
    performanceProfiler.on('bottleneckDetected', (bottleneck: any) => {
      if (bottleneck.severity === 'critical') {
        scalingManager.emit('bottleneckAlert', bottleneck);
      }
    });

    // 캐시 정리 요청 시 실행
    scalingManager.on('cacheCleanupRequested', () => {
      cacheManager.clear();
    });
  }

  /**
   * 응급 최적화 실행
   */
  private async performEmergencyOptimization(): Promise<void> {
    // 1. 메모리 최적화
    await memoryOptimizer.optimize();
    
    // 2. 캐시 정리
    await cacheManager.clear();
    
    // 3. 비동기 작업 대기열 정리
    asyncOptimizer.cancelPendingTasks((task) => task.config.priority === 'low');
    
    // 4. 강제 가비지 컬렉션
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * 성능 리포트 생성
   */
  generateReport(): {
    profiler: any;
    memory: any;
    async: any;
    cache: any;
    scaling: any;
    recommendations: string[];
  } {
    const profilerReport = performanceProfiler.generateReport();
    const memoryStats = memoryOptimizer.getStats();
    const asyncStats = asyncOptimizer.getStats();
    const cacheStats = cacheManager.getStats();
    const scalingStatus = scalingManager.getStatus();

    return {
      profiler: profilerReport,
      memory: memoryStats,
      async: asyncStats,
      cache: cacheStats,
      scaling: scalingStatus,
      recommendations: this.generateRecommendations({
        profilerReport,
        memoryStats,
        asyncStats,
        cacheStats,
        scalingStatus
      })
    };
  }

  /**
   * 성능 개선 권장사항 생성
   */
  private generateRecommendations(data: any): string[] {
    const recommendations: string[] = [];

    // 메모리 관련 권장사항
    if (data.memoryStats.memoryPressure === 'high') {
      recommendations.push('메모리 사용량이 높습니다. 캐시 정리를 고려하세요.');
    }

    // 응답시간 관련 권장사항
    if (data.profilerReport.summary.averageResponseTime > 2000) {
      recommendations.push('평균 응답시간이 2초를 초과합니다. 비동기 처리 최적화가 필요합니다.');
    }

    // 캐시 관련 권장사항
    if (data.cacheStats.hitRatio < 50) {
      recommendations.push('캐시 적중률이 낮습니다. 캐시 전략을 재검토하세요.');
    }

    // 동시성 관련 권장사항
    if (data.asyncStats.queueLength > 100) {
      recommendations.push('비동기 작업 대기열이 길어졌습니다. 동시성 제한을 늘리거나 스케일링을 고려하세요.');
    }

    // 스케일링 관련 권장사항
    if (data.scalingStatus.metrics.cpuUsage > 90) {
      recommendations.push('CPU 사용률이 매우 높습니다. 즉시 스케일 업이 필요합니다.');
    }

    return recommendations;
  }

  /**
   * 최적화 실행
   */
  async optimize(): Promise<void> {
    await Promise.all([
      memoryOptimizer.optimize(),
      scalingManager.emit('optimizationRequested')
    ]);
  }

  /**
   * 리소스 정리
   */
  cleanup(): void {
    if (!this.initialized) {
      return;
    }

    performanceProfiler.cleanup();
    memoryOptimizer.cleanup();
    asyncOptimizer.cleanup();
    cacheManager.cleanup();
    scalingManager.cleanup();

    this.initialized = false;
  }
}

// 싱글톤 인스턴스
export const performanceManager = new PerformanceManager();