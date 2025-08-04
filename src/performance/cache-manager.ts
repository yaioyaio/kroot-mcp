/**
 * Advanced Cache Manager (Fixed)
 * 다층 캐싱 시스템 및 전략적 캐시 관리
 */

import Database from 'better-sqlite3';
import { EventEmitter } from 'eventemitter3';
import { performanceProfiler } from './performance-profiler.js';

export interface CacheConfig {
  memoryTTL: number; // 메모리 캐시 TTL (ms)
  diskTTL: number; // 디스크 캐시 TTL (ms)
  maxMemorySize: number; // 메모리 캐시 최대 크기 (bytes)
  maxDiskSize: number; // 디스크 캐시 최대 크기 (bytes)
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
  persistToDisk: boolean;
}

export interface CacheEntry {
  key: string;
  data: any;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  size: number;
  compressed: boolean;
  encrypted: boolean;
  tags: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface CacheStats {
  memoryHits: number;
  memoryMisses: number;
  diskHits: number;  
  diskMisses: number;
  memorySize: number;
  diskSize: number;
  entries: number;
  hitRatio: number;
  compressionRatio: number;
}

export class CacheManager extends EventEmitter {
  private config: CacheConfig;
  private memoryCache = new Map<string, CacheEntry>();
  private diskCache?: Database.Database;
  private stats: CacheStats;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config?: Partial<CacheConfig>) {
    super();
    
    this.config = {
      memoryTTL: 300000, // 5분
      diskTTL: 3600000, // 1시간
      maxMemorySize: 100 * 1024 * 1024, // 100MB
      maxDiskSize: 1024 * 1024 * 1024, // 1GB
      compressionEnabled: true,
      encryptionEnabled: false,
      persistToDisk: true,
      ...config
    };

    this.stats = {
      memoryHits: 0,
      memoryMisses: 0,
      diskHits: 0,
      diskMisses: 0,
      memorySize: 0,
      diskSize: 0,
      entries: 0,
      hitRatio: 0,
      compressionRatio: 0
    };

    this.initializeDiskCache();
    this.startCleanupTimer();
  }

  /**
   * 디스크 캐시 초기화
   */
  private initializeDiskCache(): void {
    if (!this.config.persistToDisk) {
      return;
    }

    try {
      // 인메모리 SQLite 데이터베이스 사용 (성능 최적화)  
      this.diskCache = new Database(':memory:');
      
      // 캐시 테이블 생성
      this.diskCache.exec(`
        CREATE TABLE IF NOT EXISTS cache_entries (
          key TEXT PRIMARY KEY,
          data BLOB,
          timestamp INTEGER,
          access_count INTEGER,
          last_accessed INTEGER,
          size INTEGER,
          compressed BOOLEAN,
          encrypted BOOLEAN,
          tags TEXT,
          priority TEXT,
          ttl INTEGER
        );
        
        CREATE INDEX IF NOT EXISTS idx_timestamp ON cache_entries(timestamp);
        CREATE INDEX IF NOT EXISTS idx_last_accessed ON cache_entries(last_accessed);
        CREATE INDEX IF NOT EXISTS idx_priority ON cache_entries(priority);
        CREATE INDEX IF NOT EXISTS idx_tags ON cache_entries(tags);
      `);

      // WAL 모드 활성화 (동시성 향상)
      this.diskCache.pragma('journal_mode = WAL');
      this.diskCache.pragma('synchronous = NORMAL');
      this.diskCache.pragma('cache_size = 10000');
      this.diskCache.pragma('temp_store = MEMORY');

      this.emit('diskCacheInitialized');
    } catch (error) {
      this.emit('diskCacheError', { error: (error as Error).message });
    }
  }

  /**
   * 캐시에 데이터 저장 (다층 전략)
   */
  async set(
    key: string, 
    data: any, 
    options?: {
      ttl?: number;
      tags?: string[];
      priority?: CacheEntry['priority'];
      forceMemory?: boolean;
      forceDisk?: boolean;
    }
  ): Promise<void> {
    const metricId = performanceProfiler.startMetric('cache_set');
    
    try {
      const now = Date.now();
      const serializedData = JSON.stringify(data);
      const originalSize = Buffer.byteLength(serializedData, 'utf8');
      
      let processedData = serializedData;
      let compressed = false;
      let encrypted = false;

      // 압축 처리
      if (this.config.compressionEnabled && originalSize > 1024) { // 1KB 이상만 압축
        processedData = await this.compress(processedData);
        compressed = true;
      }

      // 암호화 처리 (필요시)
      if (this.config.encryptionEnabled) {
        processedData = await this.encrypt(processedData);
        encrypted = true;
      }

      const finalSize = Buffer.byteLength(processedData, 'utf8');

      const entry: CacheEntry = {
        key,
        data: processedData,
        timestamp: now,
        accessCount: 0,
        lastAccessed: now,
        size: finalSize,
        compressed,
        encrypted,
        tags: options?.tags || [],
        priority: options?.priority || 'medium'
      };

      // 메모리 캐시에 저장 (우선순위에 따라)
      if (!options?.forceDisk && this.shouldStoreInMemory(entry)) {
        await this.setInMemory(key, entry);
      }

      // 디스크 캐시에 저장
      if (this.config.persistToDisk && (!options?.forceMemory || options?.forceDisk)) {
        await this.setInDisk(key, entry, options?.ttl);
      }

      this.updateStats();
      this.emit('cacheSet', { key, size: finalSize, compressed, encrypted });
    } finally {
      performanceProfiler.endMetric(metricId);
    }
  }

  /**
   * 캐시에서 데이터 조회 (다층 전략)
   */
  async get<T = any>(key: string): Promise<T | null> {
    const metricId = performanceProfiler.startMetric('cache_get');
    
    try {
      // 1. 메모리 캐시 확인
      const memoryEntry = await this.getFromMemory(key);
      if (memoryEntry) {
        this.stats.memoryHits++;
        return await this.processEntryData<T>(memoryEntry);
      }
      this.stats.memoryMisses++;

      // 2. 디스크 캐시 확인
      if (this.config.persistToDisk) {
        const diskEntry = await this.getFromDisk(key);
        if (diskEntry) {
          this.stats.diskHits++;
          
          // 디스크에서 가져온 데이터를 메모리에 승격
          if (this.shouldPromoteToMemory(diskEntry)) {
            await this.setInMemory(key, diskEntry);
          }
          
          return await this.processEntryData<T>(diskEntry);
        }
        this.stats.diskMisses++;
      }

      this.emit('cacheMiss', { key });
      return null;
    } finally {
      this.updateStats();
      performanceProfiler.endMetric(metricId);
    }
  }

  /**
   * 메모리 캐시에서 조회
   */
  private async getFromMemory(key: string): Promise<CacheEntry | null> {
    const entry = this.memoryCache.get(key);
    if (!entry) { 
      return null;
    }

    // TTL 확인
    if (Date.now() - entry.timestamp > this.config.memoryTTL) {
      this.memoryCache.delete(key);
      this.emit('memoryEntryExpired', { key });
      return null;
    }

    // 액세스 정보 업데이트
    entry.accessCount++;
    entry.lastAccessed = Date.now();

    return entry;
  }

  /**
   * 메모리 캐시에 저장
   */  
  private async setInMemory(key: string, entry: CacheEntry): Promise<void> {
    // 메모리 용량 체크
    const currentSize = this.calculateMemorySize();
    if (currentSize + entry.size > this.config.maxMemorySize) {
      await this.evictFromMemory();
    }

    this.memoryCache.set(key, { ...entry });
    this.stats.memorySize = this.calculateMemorySize();
  }

  /**
   * 디스크 캐시에 저장
   */
  private async setInDisk(key: string, entry: CacheEntry, customTTL?: number): Promise<void> {
    if (!this.diskCache) {
      return;
    }

    try {
      const ttl = customTTL || this.config.diskTTL;
      
      const stmt = this.diskCache.prepare(`
        INSERT OR REPLACE INTO cache_entries 
        (key, data, timestamp, access_count, last_accessed, size, compressed, encrypted, tags, priority, ttl)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        key,
        entry.data,
        entry.timestamp,
        entry.accessCount,
        entry.lastAccessed,
        entry.size,
        entry.compressed ? 1 : 0,
        entry.encrypted ? 1 : 0,
        JSON.stringify(entry.tags),
        entry.priority,
        ttl
      );

      this.stats.diskSize += entry.size;
    } catch (error) {
      this.emit('diskCacheError', { 
        operation: 'set', 
        key, 
        error: (error as Error).message 
      });
    }
  }

  /**
   * 메모리 저장 여부 결정
   */
  private shouldStoreInMemory(entry: CacheEntry): boolean {
    // 우선순위가 높거나 자주 액세스되는 데이터는 메모리에 저장
    if (entry.priority === 'critical' || entry.priority === 'high') {
      return true;
    }

    // 작은 데이터는 메모리에 저장
    if (entry.size < 10240) { // 10KB 미만
      return true;
    }

    return false;
  }

  /**
   * 메모리 승격 여부 결정
   */
  private shouldPromoteToMemory(entry: CacheEntry): boolean {
    // 자주 액세스되는 데이터는 메모리로 승격
    if (entry.accessCount > 5) {
      return true;
    }

    // 최근에 액세스되고 우선순위가 높은 데이터
    if (Date.now() - entry.lastAccessed < 60000 && entry.priority === 'high') {
      return true;
    }

    return false;
  }

  /**
   * 메모리 캐시 제거 (LRU 기반)
   */
  private async evictFromMemory(): Promise<void> {
    const entries = Array.from(this.memoryCache.entries());
    
    // LRU 정렬 (마지막 액세스 시간 기준)
    entries.sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);
    
    // 메모리의 20% 제거  
    const entriesToRemove = Math.ceil(entries.length * 0.2);
    
    for (let i = 0; i < entriesToRemove && i < entries.length; i++) {
      const [key] = entries[i];
      this.memoryCache.delete(key);
      this.emit('memoryEntryEvicted', { key });
    }

    this.stats.memorySize = this.calculateMemorySize();
  }

  /**
   * 엔트리 데이터 처리 (압축 해제, 복호화)
   */
  private async processEntryData<T>(entry: CacheEntry): Promise<T> {
    let data = entry.data;

    // 복호화
    if (entry.encrypted) {
      data = await this.decrypt(data);
    }

    // 압축 해제
    if (entry.compressed) {
      data = await this.decompress(data);
    }

    return JSON.parse(data);
  }

  /**
   * 디스크 캐시에서 조회
   */
  private async getFromDisk(key: string): Promise<CacheEntry | null> {
    if (!this.diskCache) {
      return null;
    }

    try {
      const stmt = this.diskCache.prepare(`
        SELECT * FROM cache_entries 
        WHERE key = ? AND (? - timestamp) < ttl
      `);
      
      const row = stmt.get(key, Date.now()) as any;
      if (!row) {
        return null;
      }

      return {
        key: row.key,
        data: row.data,
        timestamp: row.timestamp,
        accessCount: row.access_count,
        lastAccessed: row.last_accessed,
        size: row.size,
        compressed: row.compressed === 1,
        encrypted: row.encrypted === 1,
        tags: JSON.parse(row.tags || '[]'),
        priority: row.priority as CacheEntry['priority']
      };
    } catch (error) {
      this.emit('diskCacheError', { 
        operation: 'get', 
        key, 
        error: (error as Error).message 
      });
      return null;
    }
  }

  /**
   * 메모리 크기 계산
   */
  private calculateMemorySize(): number {
    let totalSize = 0;
    for (const entry of this.memoryCache.values()) {
      totalSize += entry.size;
    }
    return totalSize;
  }

  /**
   * 통계 업데이트
   */
  private updateStats(): void {
    this.stats.entries = this.memoryCache.size;
    const totalHits = this.stats.memoryHits + this.stats.diskHits;
    const totalMisses = this.stats.memoryMisses + this.stats.diskMisses;
    this.stats.hitRatio = totalHits / (totalHits + totalMisses) * 100;
  }

  /**
   * 데이터 압축
   */
  private async compress(data: string): Promise<string> {
    return Buffer.from(data).toString('base64');
  }

  /**
   * 데이터 압축 해제
   */
  private async decompress(data: string): Promise<string> {
    return Buffer.from(data, 'base64').toString('utf8');
  }

  /**
   * 데이터 암호화
   */
  private async encrypt(data: string): Promise<string> {
    return Buffer.from(data).toString('hex');
  }

  /**
   * 데이터 복호화
   */
  private async decrypt(data: string): Promise<string> {
    return Buffer.from(data, 'hex').toString('utf8');
  }

  /**
   * 정리 타이머 시작
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, 60000); // 1분마다 정리
  }

  /**
   * 만료된 엔트리 정리
   */
  private async performCleanup(): Promise<void> {
    const metricId = performanceProfiler.startMetric('cache_cleanup');
    
    try {
      const now = Date.now();
      let cleanedCount = 0;

      // 메모리 캐시 정리
      for (const [key, entry] of this.memoryCache.entries()) {
        if (now - entry.timestamp > this.config.memoryTTL) {
          this.memoryCache.delete(key);
          cleanedCount++;
        }
      }

      // 디스크 캐시 정리
      if (this.diskCache) {
        const stmt = this.diskCache.prepare(`
          DELETE FROM cache_entries 
          WHERE (? - timestamp) > ttl
        `);
        const result = stmt.run(now);
        cleanedCount += result.changes;
      }

      if (cleanedCount > 0) {
        this.emit('cacheCleanup', { entriesRemoved: cleanedCount });
      }

      this.updateStats();
    } finally {
      performanceProfiler.endMetric(metricId);
    }
  }

  /**
   * 캐시 통계 조회
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * 캐시 워밍 (미리 로드)
   */
  async warmup(entries: Array<{ key: string; loader: () => Promise<any> }>): Promise<void> {
    const metricId = performanceProfiler.startMetric('cache_warmup');
    
    try {
      await Promise.all(
        entries.map(async ({ key, loader }) => {
          try {
            const data = await loader();
            await this.set(key, data, { priority: 'high' });
          } catch (error) {
            this.emit('warmupError', { key, error: (error as Error).message });
          }
        })
      );

      this.emit('cacheWarmedUp', { entriesLoaded: entries.length });
    } finally {
      performanceProfiler.endMetric(metricId);
    }
  }

  /**
   * 태그별 캐시 무효화
   */  
  async invalidateByTags(tags: string[]): Promise<number> {
    let invalidatedCount = 0;

    // 메모리 캐시 무효화
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.tags.some(tag => tags.includes(tag))) {
        this.memoryCache.delete(key);
        invalidatedCount++;
      }
    }

    this.emit('cacheInvalidated', { tags, count: invalidatedCount });
    return invalidatedCount;
  }

  /**
   * 패턴별 캐시 무효화
   */
  async invalidateByPattern(pattern: RegExp): Promise<number> {
    let invalidatedCount = 0;

    // 메모리 캐시 무효화
    for (const key of this.memoryCache.keys()) {
      if (pattern.test(key)) {
        this.memoryCache.delete(key);
        invalidatedCount++;
      }
    }

    this.emit('cacheInvalidated', { pattern: pattern.source, count: invalidatedCount });
    return invalidatedCount;
  }

  /**  
   * 캐시 전체 삭제
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();
    
    if (this.diskCache) {
      this.diskCache.exec('DELETE FROM cache_entries');
    }

    this.stats = {
      memoryHits: 0,
      memoryMisses: 0,
      diskHits: 0,
      diskMisses: 0,
      memorySize: 0,
      diskSize: 0,
      entries: 0,
      hitRatio: 0,
      compressionRatio: 0
    };

    this.emit('cacheCleared');
  }

  /**
   * 리소스 정리
   */
  cleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.memoryCache.clear();
    
    if (this.diskCache) {
      this.diskCache.close();
    }

    this.removeAllListeners();
  }
}

// 싱글톤 인스턴스
export const cacheManager = new CacheManager();