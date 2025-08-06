/**
 * Memory Optimizer
 * 메모리 사용량 최적화 및 관리
 */

import { EventEmitter } from 'eventemitter3';
import { performanceProfiler } from './performance-profiler.js';

export interface MemoryConfig {
  maxHeapUsage: number; // bytes
  maxCacheSize: number; // entries
  gcThreshold: number; // 0-1 (heap usage percentage)
  cleanupInterval: number; // ms
  enableAutoCleanup: boolean;
  defaultTTL?: number; // default time to live in ms
}

export interface CacheEntry<T = any> {
  key: string;
  value: T;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  size: number; // estimated size in bytes
  ttl: number | undefined; // time to live in ms
}

export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  cacheSize: number;
  cacheEntries: number;
  gcEvents: number;
  cleanupEvents: number;
  memoryPressure: 'low' | 'medium' | 'high' | 'critical';
}

export class MemoryOptimizer extends EventEmitter {
  private config: MemoryConfig;
  private cache = new Map<string, CacheEntry>();
  private cleanupTimer?: NodeJS.Timeout | undefined;
  private gcEvents = 0;
  private cleanupEvents = 0;
  private isOptimizing = false;

  // LRU 캐시를 위한 이중 연결 리스트
  private lruHead: CacheEntry | null = null;
  private lruTail: CacheEntry | null = null;

  constructor(config?: Partial<MemoryConfig>) {
    super();
    
    this.config = {
      maxHeapUsage: 512 * 1024 * 1024, // 512MB
      maxCacheSize: 10000,
      gcThreshold: 0.8, // 80%
      cleanupInterval: 30000, // 30초
      enableAutoCleanup: true,
      ...config
    };

    this.setupMemoryMonitoring();
    
    if (this.config.enableAutoCleanup) {
      this.startAutoCleanup();
    }
  }

  /**
   * 캐시에 데이터 저장
   */
  set<T>(key: string, value: T, ttl?: number): void {
    const metricId = performanceProfiler.startMetric('memory_cache_set');
    
    try {
      const now = Date.now();
      const estimatedSize = this.estimateSize(value);

      // 기존 엔트리가 있으면 제거
      if (this.cache.has(key)) {
        this.delete(key);
      }

      // 메모리 압박 상황 체크
      if (this.isMemoryPressureHigh()) {
        this.performEmergencyCleanup();
      }

      // 캐시 크기 제한 체크
      if (this.cache.size >= this.config.maxCacheSize) {
        this.evictLRU();
      }

      const entry: CacheEntry<T> = {
        key,
        value,
        timestamp: now,
        accessCount: 1,
        lastAccessed: now,
        size: estimatedSize,
        ttl: ttl ?? this.config.defaultTTL
      };

      this.cache.set(key, entry);
      this.addToLRU(entry);

      this.emit('cacheSet', { key, size: estimatedSize });
    } finally {
      performanceProfiler.endMetric(metricId);
    }
  }

  /**
   * 캐시에서 데이터 조회
   */
  get<T>(key: string): T | undefined {
    const metricId = performanceProfiler.startMetric('memory_cache_get');
    
    try {
      const entry = this.cache.get(key) as CacheEntry<T> | undefined;
      
      if (!entry) {
        this.emit('cacheMiss', { key });
        return undefined;
      }

      // TTL 체크
      if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
        this.delete(key);
        this.emit('cacheExpired', { key });
        return undefined;
      }

      // 액세스 정보 업데이트
      entry.accessCount++;
      entry.lastAccessed = Date.now();
      
      // LRU 순서 업데이트
      this.moveToHead(entry);

      this.emit('cacheHit', { key, accessCount: entry.accessCount });
      return entry.value;
    } finally {
      performanceProfiler.endMetric(metricId);
    }
  }

  /**
   * 캐시에서 데이터 삭제
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    this.cache.delete(key);
    this.removeFromLRU(entry);
    
    this.emit('cacheDelete', { key, size: entry.size });
    return true;
  }

  /**
   * 캐시 클리어
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.lruHead = null;
    this.lruTail = null;
    
    this.emit('cacheClear', { entriesCleared: size });
  }

  /**
   * 메모리 압박 상황 확인
   */
  private isMemoryPressureHigh(): boolean {
    const memUsage = process.memoryUsage();
    const usageRatio = memUsage.heapUsed / this.config.maxHeapUsage;
    
    return usageRatio > this.config.gcThreshold;
  }

  /**
   * LRU 정책에 따라 가장 오래된 엔트리 제거
   */
  private evictLRU(): void {
    if (!this.lruTail) {
      return;
    }

    const evicted = this.lruTail;
    this.delete(evicted.key);
    
    this.emit('lruEviction', { 
      key: evicted.key, 
      accessCount: evicted.accessCount,
      age: Date.now() - evicted.timestamp
    });
  }

  /**
   * 응급 메모리 정리
   */
  private performEmergencyCleanup(): void {
    const metricId = performanceProfiler.startMetric('emergency_cleanup');
    
    try {
      this.cleanupEvents++;
      
      // 만료된 엔트리 먼저 정리
      this.cleanupExpiredEntries();
      
      // 여전히 압박 상황이면 LRU 정리
      let entriesToRemove = 0;
      if (this.isMemoryPressureHigh()) {
        entriesToRemove = Math.floor(this.cache.size * 0.2); // 20% 제거
        
        for (let i = 0; i < entriesToRemove && this.lruTail; i++) {
          this.evictLRU();
        }
      }

      // 강제 가비지 컬렉션 (개발 환경에서만)
      if (global.gc && this.isMemoryPressureHigh()) {
        global.gc();
        this.gcEvents++;
        this.emit('forcedGC', { trigger: 'emergency_cleanup' });
      }

      this.emit('emergencyCleanup', { 
        entriesRemoved: entriesToRemove,
        memoryFreed: this.calculateCacheSize()
      });
    } finally {
      performanceProfiler.endMetric(metricId);
    }
  }

  /**
   * 만료된 엔트리 정리
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.ttl && now - entry.timestamp > entry.ttl) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => this.delete(key));
    
    if (expiredKeys.length > 0) {
      this.emit('expiredEntriesCleanup', { count: expiredKeys.length });
    }
  }

  /**
   * 자동 정리 시작
   */
  private startAutoCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.performRoutineCleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * 일상적인 정리 작업
   */
  private performRoutineCleanup(): void {
    const metricId = performanceProfiler.startMetric('routine_cleanup');
    
    try {
      // 만료된 엔트리 정리
      this.cleanupExpiredEntries();
      
      // 메모리 압박 상황 체크
      if (this.isMemoryPressureHigh()) {
        this.performEmergencyCleanup();
      }

      // 사용하지 않는 엔트리 정리 (1시간 동안 액세스되지 않음)
      this.cleanupUnusedEntries();

      this.emit('routineCleanup', {
        timestamp: Date.now(),
        cacheSize: this.cache.size,
        memoryPressure: this.getMemoryPressureLevel()
      });
    } finally {
      performanceProfiler.endMetric(metricId);
    }
  }

  /**
   * 사용하지 않는 엔트리 정리
   */
  private cleanupUnusedEntries(): void {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const unusedKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.lastAccessed > oneHour && entry.accessCount === 1) {
        unusedKeys.push(key);
      }
    }

    // 최대 캐시의 10%만 제거
    const maxToRemove = Math.floor(this.cache.size * 0.1);
    const keysToRemove = unusedKeys.slice(0, maxToRemove);
    
    keysToRemove.forEach(key => this.delete(key));
    
    if (keysToRemove.length > 0) {
      this.emit('unusedEntriesCleanup', { count: keysToRemove.length });
    }
  }

  /**
   * LRU 리스트에 엔트리 추가 (헤드에)
   */
  private addToLRU(entry: CacheEntry): void {
    if (!this.lruHead) {
      this.lruHead = this.lruTail = entry;
      return;
    }

    (entry as any).next = this.lruHead;
    (this.lruHead as any).prev = entry;
    this.lruHead = entry;
  }

  /**
   * LRU 리스트에서 엔트리 제거
   */
  private removeFromLRU(entry: CacheEntry): void {
    const prev = (entry as any).prev;
    const next = (entry as any).next;

    if (prev) {
      prev.next = next;
    } else {
      this.lruHead = next;
    }

    if (next) {
      next.prev = prev;
    } else {
      this.lruTail = prev;
    }

    delete (entry as any).prev;
    delete (entry as any).next;
  }

  /**
   * 엔트리를 LRU 리스트 헤드로 이동
   */
  private moveToHead(entry: CacheEntry): void {
    this.removeFromLRU(entry);
    this.addToLRU(entry);
  }

  /**
   * 데이터 크기 추정
   */
  private estimateSize(value: any): number {
    if (value === null || value === undefined) {
      return 8;
    }

    if (typeof value === 'string') {
      return value.length * 2; // UTF-16
    }

    if (typeof value === 'number') {
      return 8;
    }

    if (typeof value === 'boolean') {
      return 4;
    }

    if (Buffer.isBuffer(value)) {
      return value.length;
    }

    if (Array.isArray(value)) {
      return value.reduce((total, item) => total + this.estimateSize(item), 0) + 16;
    }

    if (typeof value === 'object') {
      return Object.keys(value).reduce((total, key) => {
        return total + key.length * 2 + this.estimateSize(value[key]);
      }, 16);
    }

    return 16; // 기본값
  }

  /**
   * 캐시 총 크기 계산
   */
  private calculateCacheSize(): number {
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += entry.size;
    }
    return totalSize;
  }

  /**
   * 메모리 압박 수준 계산
   */
  private getMemoryPressureLevel(): 'low' | 'medium' | 'high' | 'critical' {
    const memUsage = process.memoryUsage();
    const usageRatio = memUsage.heapUsed / this.config.maxHeapUsage;

    if (usageRatio > 0.95) return 'critical';
    if (usageRatio > 0.8) return 'high';
    if (usageRatio > 0.6) return 'medium';
    return 'low';
  }

  /**
   * 메모리 모니터링 설정
   */
  private setupMemoryMonitoring(): void {
    // 메모리 압박 상황 모니터링
    setInterval(() => {
      const pressureLevel = this.getMemoryPressureLevel();
      
      if (pressureLevel === 'critical' || pressureLevel === 'high') {
        this.emit('memoryPressure', {
          level: pressureLevel,
          heapUsed: process.memoryUsage().heapUsed,
          threshold: this.config.maxHeapUsage
        });
      }
    }, 10000); // 10초마다 체크
  }

  /**
   * 메모리 통계 조회
   */
  getStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      cacheSize: this.calculateCacheSize(),
      cacheEntries: this.cache.size,
      gcEvents: this.gcEvents,
      cleanupEvents: this.cleanupEvents,
      memoryPressure: this.getMemoryPressureLevel()
    };
  }

  /**
   * 설정 업데이트
   */
  updateConfig(newConfig: Partial<MemoryConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // 자동 정리 재시작
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    if (this.config.enableAutoCleanup) {
      this.startAutoCleanup();
    }

    this.emit('configUpdated', this.config);
  }

  /**
   * 메모리 최적화 수행
   */
  optimize(): Promise<void> {
    return new Promise((resolve) => {
      if (this.isOptimizing) {
        resolve();
        return;
      }

      this.isOptimizing = true;
      const metricId = performanceProfiler.startMetric('memory_optimization');

      try {
        // 단계별 최적화
        this.cleanupExpiredEntries();
        this.cleanupUnusedEntries();
        
        // 심각한 상황이면 강제 정리
        if (this.getMemoryPressureLevel() === 'critical') {
          this.performEmergencyCleanup();
        }

        // 강제 GC (가능한 경우)
        if (global.gc) {
          global.gc();
          this.gcEvents++;
        }

        this.emit('optimizationComplete', {
          finalCacheSize: this.cache.size,
          memoryPressure: this.getMemoryPressureLevel(),
          memoryFreed: this.calculateCacheSize()
        });

        resolve();
      } finally {
        this.isOptimizing = false;
        performanceProfiler.endMetric(metricId);
      }
    });
  }

  /**
   * 리소스 정리
   */
  cleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    this.clear();
    this.removeAllListeners();
  }
}

// 싱글톤 인스턴스
export const memoryOptimizer = new MemoryOptimizer();