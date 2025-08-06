/**
 * DevFlow Monitor MCP - 동기화 클라이언트
 * 
 * 로컬 프로젝트 데이터를 중앙 서버와 동기화하는 클라이언트입니다.
 */

import { EventEmitter } from 'events';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';

import {
  SyncEvent,
  SyncStatus as SyncStatusEnum,
  ProjectMetadata,
  ConflictResolutionStrategy
} from './types.js';

import { Logger } from '../utils/logger.js';
import { BaseEvent } from '../events/types/base.js';

/**
 * 동기화 설정
 */
export interface SyncConfig {
  /** 동기화 활성화 여부 */
  enabled: boolean;
  
  /** 서버 엔드포인트 */
  endpoint: string;
  
  /** API 키 */
  apiKey: string;
  
  /** 사용자 ID */
  userId: string;
  
  /** 기기 ID */
  deviceId: string;
  
  /** 동기화 간격 (초) */
  interval: number;
  
  /** 배치 크기 */
  batchSize: number;
  
  /** 최대 재시도 횟수 */
  maxRetries: number;
  
  /** 재시도 지연 시간 (밀리초) */
  retryDelay: number;
  
  /** 충돌 해결 전략 */
  conflictResolution: ConflictResolutionStrategy;
  
  /** 압축 사용 여부 */
  compression: boolean;
  
  /** 오프라인 큐 최대 크기 */
  maxQueueSize: number;
}

/**
 * 동기화 결과
 */
export interface SyncResult {
  /** 성공 여부 */
  success: boolean;
  
  /** 동기화된 이벤트 ID들 */
  syncedIds: string[];
  
  /** 실패한 이벤트 ID들 */
  failedIds: string[];
  
  /** 오류 정보 */
  errors: SyncError[];
  
  /** 동기화 소요 시간 (밀리초) */
  duration: number;
  
  /** 전송된 바이트 수 */
  bytesTransferred: number;
}

/**
 * 동기화 오류
 */
export interface SyncError {
  /** 오류 ID */
  id: string;
  
  /** 이벤트 ID */
  eventId: string;
  
  /** 오류 타입 */
  type: 'network' | 'auth' | 'validation' | 'conflict' | 'server' | 'unknown';
  
  /** 오류 메시지 */
  message: string;
  
  /** 오류 코드 */
  code?: string;
  
  /** 재시도 가능 여부 */
  retryable: boolean;
  
  /** 발생 시간 */
  timestamp: number;
}

/**
 * 동기화 상태
 */
export interface SyncClientStatus {
  /** 마지막 동기화 시간 */
  lastSyncTime: number;
  
  /** 동기화 대기 중인 이벤트 수 */
  pendingEvents: number;
  
  /** 실패한 이벤트 수 */
  failedEvents: number;
  
  /** 연결 상태 */
  connected: boolean;
  
  /** 동기화 진행 중 여부 */
  syncing: boolean;
  
  /** 평균 동기화 지연 시간 (밀리초) */
  avgLatency: number;
  
  /** 성공률 (0-1) */
  successRate: number;
}

/**
 * 동기화 클라이언트 이벤트
 */
export interface SyncClientEvents {
  'sync:started': () => void;
  'sync:completed': (result: SyncResult) => void;
  'sync:failed': (error: SyncError) => void;
  'sync:progress': (progress: { current: number; total: number }) => void;
  'connection:established': () => void;
  'connection:lost': () => void;
  'conflict:detected': (event: SyncEvent) => void;
  'queue:full': (size: number) => void;
  'error': (error: Error) => void;
}

/**
 * 동기화 클라이언트
 */
export class SyncClient extends EventEmitter {
  private config: SyncConfig;
  private db: Database.Database;
  private logger: Logger;
  private httpClient: AxiosInstance;
  
  private syncTimer?: NodeJS.Timeout | undefined;
  private isConnected = false;
  private isSyncing = false;
  private syncStats = {
    totalSyncs: 0,
    successfulSyncs: 0,
    failedSyncs: 0,
    totalLatency: 0
  };

  constructor(config: SyncConfig, db: Database.Database) {
    super();
    
    this.config = config;
    this.db = db;
    this.logger = new Logger('SyncClient');
    
    // HTTP 클라이언트 설정
    this.httpClient = axios.create({
      baseURL: this.config.endpoint,
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': `DevFlow-Monitor-MCP/1.0.0 (${this.config.deviceId})`
      }
    });

    // 응답 인터셉터 설정
    this.httpClient.interceptors.response.use(
      response => response,
      error => this.handleHttpError(error)
    );

    this.logger.info('동기화 클라이언트 초기화됨', {
      endpoint: this.config.endpoint,
      userId: this.config.userId,
      deviceId: this.config.deviceId
    });
  }

  /**
   * 동기화 시작
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.info('동기화가 비활성화되어 있습니다');
      return;
    }

    try {
      // 연결 테스트
      await this.testConnection();
      
      // 주기적 동기화 시작
      this.startPeriodicSync();
      
      // 초기 동기화 실행
      await this.syncBatch();
      
      this.logger.info('동기화 클라이언트 시작됨');
    } catch (error) {
      this.logger.error('동기화 클라이언트 시작 실패:', error);
      throw error;
    }
  }

  /**
   * 동기화 중지
   */
  async stop(): Promise<void> {
    try {
      if (this.syncTimer) {
        clearInterval(this.syncTimer);
        this.syncTimer = undefined;
      }

      // 진행 중인 동기화 완료 대기
      while (this.isSyncing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      this.isConnected = false;
      this.logger.info('동기화 클라이언트 중지됨');
    } catch (error) {
      this.logger.error('동기화 클라이언트 중지 실패:', error);
      throw error;
    }
  }

  /**
   * 연결 테스트
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.httpClient.get('/health');
      
      if (response.status === 200) {
        this.isConnected = true;
        this.emit('connection:established');
        this.logger.info('서버 연결 성공');
        return true;
      }
      
      return false;
    } catch (error) {
      this.isConnected = false;
      this.emit('connection:lost');
      this.logger.error('서버 연결 실패:', error);
      return false;
    }
  }

  /**
   * 주기적 동기화 시작
   */
  private startPeriodicSync(): void {
    this.syncTimer = setInterval(async () => {
      if (!this.isSyncing && this.isConnected) {
        await this.syncBatch();
      }
    }, this.config.interval * 1000);
  }

  /**
   * 배치 동기화 실행
   */
  async syncBatch(): Promise<SyncResult> {
    if (this.isSyncing) {
      throw new Error('동기화가 이미 진행 중입니다');
    }

    this.isSyncing = true;
    this.emit('sync:started');

    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      syncedIds: [],
      failedIds: [],
      errors: [],
      duration: 0,
      bytesTransferred: 0
    };

    try {
      // 동기화할 이벤트들 조회
      const pendingEvents = this.getPendingEvents();
      
      if (pendingEvents.length === 0) {
        result.success = true;
        result.duration = Date.now() - startTime;
        this.emit('sync:completed', result);
        return result;
      }

      this.logger.info('배치 동기화 시작', { eventsCount: pendingEvents.length });

      // 이벤트들을 배치로 나누어 처리
      const batches = this.chunkArray(pendingEvents, this.config.batchSize);
      
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        this.emit('sync:progress', {
          current: i + 1,
          total: batches.length
        });

        try {
          const batchResult = await this.syncEventsBatch(batch || []);
          
          result.syncedIds.push(...batchResult.syncedIds);
          result.failedIds.push(...batchResult.failedIds);
          result.errors.push(...batchResult.errors);
          result.bytesTransferred += batchResult.bytesTransferred;
          
        } catch (error) {
          this.logger.error('배치 동기화 실패:', error);
          
          // 배치 전체를 실패로 처리
          const failedIds = batch?.map(event => event.syncId) || [];
          result.failedIds.push(...failedIds);
          
          result.errors.push({
            id: uuidv4(),
            eventId: 'batch',
            type: 'network',
            message: error instanceof Error ? error.message : '알 수 없는 오류',
            retryable: true,
            timestamp: Date.now()
          });
        }
      }

      // 결과 처리
      result.success = result.errors.length === 0;
      result.duration = Date.now() - startTime;

      // 통계 업데이트
      this.updateSyncStats(result);

      // 동기화 상태 업데이트
      await this.updateSyncStatus(result);

      this.emit('sync:completed', result);
      this.logger.info('배치 동기화 완료', {
        success: result.success,
        syncedCount: result.syncedIds.length,
        failedCount: result.failedIds.length,
        duration: result.duration
      });

    } catch (error) {
      result.success = false;
      result.duration = Date.now() - startTime;
      
      const syncError: SyncError = {
        id: uuidv4(),
        eventId: 'sync',
        type: 'unknown',
        message: error instanceof Error ? error.message : '알 수 없는 오류',
        retryable: true,
        timestamp: Date.now()
      };
      
      result.errors.push(syncError);
      
      this.emit('sync:failed', syncError);
      this.logger.error('동기화 실행 실패:', error);
    } finally {
      this.isSyncing = false;
    }

    return result;
  }

  /**
   * 이벤트 배치 동기화
   */
  private async syncEventsBatch(events: SyncEvent[]): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      syncedIds: [],
      failedIds: [],
      errors: [],
      duration: 0,
      bytesTransferred: 0
    };

    try {
      // 페이로드 준비
      const payload = {
        deviceId: this.config.deviceId,
        userId: this.config.userId,
        events: events.map(event => ({
          syncId: event.syncId,
          localId: event.localId,
          projectId: event.projectId,
          eventType: event.type,
          eventData: event,
          timestamp: event.timestamp
        })),
        compression: this.config.compression
      };

      const payloadSize = JSON.stringify(payload).length;
      result.bytesTransferred = payloadSize;

      // 서버로 전송
      const response = await this.httpClient.post('/sync/events', payload);

      if (response.status === 200 || response.status === 201) {
        const responseData = response.data;
        
        result.syncedIds = responseData.syncedIds || [];
        result.failedIds = responseData.failedIds || [];
        
        if (responseData.errors) {
          result.errors = responseData.errors;
        }

        // 성공한 이벤트들의 상태 업데이트
        if (result.syncedIds.length > 0) {
          await this.markEventsAsSynced(result.syncedIds);
        }

        // 실패한 이벤트들의 재시도 카운트 증가
        if (result.failedIds.length > 0) {
          await this.incrementRetryCount(result.failedIds);
        }

      } else {
        throw new Error(`예상치 못한 응답 코드: ${response.status}`);
      }

    } catch (error) {
      result.success = false;
      result.failedIds = events.map(e => e.syncId);
      
      const syncError = this.createSyncError(error, 'batch');
      result.errors.push(syncError);
    }

    return result;
  }

  /**
   * 동기화 대기 중인 이벤트들 조회
   */
  private getPendingEvents(): SyncEvent[] {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sync_events 
        WHERE sync_status = 'pending' 
        AND sync_attempts < ?
        ORDER BY created_at ASC
        LIMIT ?
      `);

      const rows = stmt.all(this.config.maxRetries, this.config.maxQueueSize) as any[];
      
      return rows.map(row => ({
        syncId: row.sync_id,
        localId: row.local_id,
        projectId: row.project_id,
        deviceId: row.device_id,
        userId: row.user_id,
        type: row.event_type,
        eventData: JSON.parse(row.event_data || '{}'),
        syncStatus: row.sync_status as SyncStatus,
        syncAttempts: row.sync_attempts,
        lastSyncError: row.last_sync_error,
        syncedAt: row.synced_at,
        timestamp: row.created_at,
        category: 'sync' as const,
        severity: 'info' as const,
        source: 'sync-client',
        data: {}
      } as SyncEvent));

    } catch (error) {
      this.logger.error('동기화 대기 이벤트 조회 실패:', error);
      return [];
    }
  }

  /**
   * 이벤트들을 동기화됨으로 표시
   */
  private async markEventsAsSynced(syncIds: string[]): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        UPDATE sync_events 
        SET sync_status = 'synced', synced_at = ?
        WHERE sync_id IN (${syncIds.map(() => '?').join(',')})
      `);

      stmt.run(Date.now(), ...syncIds);
      
      this.logger.debug('이벤트 동기화 완료 표시', { count: syncIds.length });
    } catch (error) {
      this.logger.error('동기화 상태 업데이트 실패:', error);
    }
  }

  /**
   * 이벤트들의 재시도 횟수 증가
   */
  private async incrementRetryCount(syncIds: string[]): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        UPDATE sync_events 
        SET sync_attempts = sync_attempts + 1,
            sync_status = CASE 
              WHEN sync_attempts + 1 >= ? THEN 'failed'
              ELSE 'pending'
            END
        WHERE sync_id IN (${syncIds.map(() => '?').join(',')})
      `);

      stmt.run(this.config.maxRetries, ...syncIds);
      
      this.logger.debug('재시도 횟수 증가', { count: syncIds.length });
    } catch (error) {
      this.logger.error('재시도 횟수 업데이트 실패:', error);
    }
  }

  /**
   * 동기화 통계 업데이트
   */
  private updateSyncStats(result: SyncResult): void {
    this.syncStats.totalSyncs++;
    this.syncStats.totalLatency += result.duration;
    
    if (result.success) {
      this.syncStats.successfulSyncs++;
    } else {
      this.syncStats.failedSyncs++;
    }
  }

  /**
   * 동기화 상태 업데이트
   */
  private async updateSyncStatus(result: SyncResult): Promise<void> {
    // 실제 구현에서는 동기화 상태를 데이터베이스나 메모리에 저장
    // 여기서는 로깅만 수행
    this.logger.debug('동기화 상태 업데이트', {
      lastSyncTime: Date.now(),
      success: result.success,
      duration: result.duration
    });
  }

  /**
   * HTTP 오류 처리
   */
  private handleHttpError(error: AxiosError): Promise<never> {
    if (error.response) {
      // 서버가 응답했지만 오류 상태 코드
      if (error.response.status === 401) {
        this.logger.error('인증 실패 - API 키를 확인하세요');
      } else if (error.response.status === 429) {
        this.logger.warn('요청 제한 초과 - 잠시 후 다시 시도');
      } else if (error.response.status >= 500) {
        this.logger.error('서버 오류:', error.response.status);
      }
    } else if (error.request) {
      // 요청이 전송되었지만 응답이 없음
      this.isConnected = false;
      this.emit('connection:lost');
      this.logger.error('서버 응답 없음');
    } else {
      // 요청 설정 중 오류
      this.logger.error('요청 설정 오류:', error.message);
    }

    return Promise.reject(error);
  }

  /**
   * 동기화 오류 생성
   */
  private createSyncError(error: any, eventId: string): SyncError {
    let type: SyncError['type'] = 'unknown';
    let retryable = true;

    if (error.response) {
      const status = error.response.status;
      if (status === 401 || status === 403) {
        type = 'auth';
        retryable = false;
      } else if (status === 400 || status === 422) {
        type = 'validation';
        retryable = false;
      } else if (status === 409) {
        type = 'conflict';
        retryable = true;
      } else if (status >= 500) {
        type = 'server';
        retryable = true;
      }
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      type = 'network';
      retryable = true;
    }

    return {
      id: uuidv4(),
      eventId,
      type,
      message: error.message || '알 수 없는 오류',
      code: error.code,
      retryable,
      timestamp: Date.now()
    };
  }

  /**
   * 배열을 청크로 나누기
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * 수동 동기화 트리거
   */
  async triggerSync(force = false): Promise<SyncResult> {
    if (this.isSyncing && !force) {
      throw new Error('동기화가 이미 진행 중입니다');
    }

    if (force) {
      this.isSyncing = false; // 강제로 재설정
    }

    return this.syncBatch();
  }

  /**
   * 동기화 설정 업데이트
   */
  async updateConfig(newConfig: Partial<SyncConfig>): Promise<void> {
    const wasEnabled = this.config.enabled;
    
    this.config = { ...this.config, ...newConfig };

    // 동기화 활성화/비활성화 변경 처리
    if (wasEnabled && !this.config.enabled) {
      await this.stop();
    } else if (!wasEnabled && this.config.enabled) {
      await this.start();
    }

    this.logger.info('동기화 설정 업데이트됨', newConfig);
  }

  /**
   * 현재 동기화 상태 조회
   */
  getSyncStatus(): SyncClientStatus {
    const pendingEvents = this.getPendingEvents().length;
    const failedEvents = this.db.prepare(
      'SELECT COUNT(*) as count FROM sync_events WHERE sync_status = "failed"'
    ).get() as any;

    return {
      lastSyncTime: this.syncStats.totalSyncs > 0 ? Date.now() : 0,
      pendingEvents,
      failedEvents: failedEvents?.count || 0,
      connected: this.isConnected,
      syncing: this.isSyncing,
      avgLatency: this.syncStats.totalSyncs > 0 ? 
        this.syncStats.totalLatency / this.syncStats.totalSyncs : 0,
      successRate: this.syncStats.totalSyncs > 0 ? 
        this.syncStats.successfulSyncs / this.syncStats.totalSyncs : 0
    } as SyncStatus;
  }

  /**
   * 동기화 큐 정리
   */
  async clearSyncQueue(): Promise<number> {
    try {
      const stmt = this.db.prepare('DELETE FROM sync_events WHERE sync_status = "failed"');
      const result = stmt.run();
      
      this.logger.info('동기화 큐 정리 완료', { deletedCount: result.changes });
      return result.changes;
    } catch (error) {
      this.logger.error('동기화 큐 정리 실패:', error);
      return 0;
    }
  }

  /**
   * 이벤트를 동기화 큐에 추가
   */
  async addEventToSyncQueue(event: BaseEvent, projectId: string): Promise<void> {
    try {
      // 큐 크기 확인
      const queueSize = this.getPendingEvents().length;
      if (queueSize >= this.config.maxQueueSize) {
        this.emit('queue:full', queueSize);
        this.logger.warn('동기화 큐가 가득참', { queueSize, maxSize: this.config.maxQueueSize });
        return;
      }

      const syncEvent: SyncEvent = {
        ...event,
        syncId: uuidv4(),
        localId: Date.now(), // 실제로는 로컬 DB의 auto increment ID
        projectId,
        deviceId: this.config.deviceId,
        userId: this.config.userId,
        syncStatus: SyncStatusEnum.PENDING,
        syncAttempts: 0
      };

      const stmt = this.db.prepare(`
        INSERT INTO sync_events (
          sync_id, local_id, project_id, device_id, user_id,
          event_type, event_data, sync_status, sync_attempts, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        syncEvent.syncId,
        syncEvent.localId,
        syncEvent.projectId,
        syncEvent.deviceId,
        syncEvent.userId,
        syncEvent.type,
        JSON.stringify(syncEvent.data),
        syncEvent.syncStatus,
        syncEvent.syncAttempts,
        syncEvent.timestamp
      );

      this.logger.debug('이벤트가 동기화 큐에 추가됨', {
        syncId: syncEvent.syncId,
        eventType: syncEvent.type,
        projectId: syncEvent.projectId
      });

    } catch (error) {
      this.logger.error('동기화 큐 추가 실패:', error);
      throw error;
    }
  }
}

export default SyncClient;