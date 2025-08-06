/**
 * Audit Logger
 * 보안 감사 로그 시스템
 */

import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'eventemitter3';
import Database from 'better-sqlite3';
import {
  SecurityEvent,
  SecurityEventType,
  SecurityConfig
} from './types.js';

export interface AuditLogConfig {
  logDirectory: string;
  maxFileSize: number;
  maxFiles: number;
  rotationInterval: number;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
}

export interface AuditEntry {
  id: string;
  timestamp: Date;
  eventType: SecurityEventType;
  userId?: string;
  username?: string;
  ipAddress: string;
  userAgent: string;
  resource?: string;
  action?: string;
  success: boolean;
  message: string;
  metadata?: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  sessionId?: string;
  correlationId?: string;
}

export interface AuditQuery {
  startDate?: Date;
  endDate?: Date;
  eventTypes?: SecurityEventType[];
  userId?: string;
  ipAddress?: string;
  resource?: string;
  success?: boolean;
  severity?: string[];
  limit?: number;
  offset?: number;
}

export interface AuditSummary {
  totalEvents: number;
  successfulEvents: number;
  failedEvents: number;
  eventTypeDistribution: Record<string, number>;
  severityDistribution: Record<string, number>;
  topUsers: Array<{ userId: string; username?: string; count: number }>;
  topIpAddresses: Array<{ ipAddress: string; count: number }>;
  timeRange: { start: Date; end: Date };
}

export class AuditLogger extends EventEmitter {
  private config: AuditLogConfig;
  private database!: Database.Database;
  private currentLogFile: string | null = null;
  private logBuffer: AuditEntry[] = [];
  private rotationTimer?: NodeJS.Timeout;
  private flushTimer?: NodeJS.Timeout;

  private readonly BUFFER_SIZE = 100;
  private readonly FLUSH_INTERVAL = 5000; // 5초마다 플러시

  constructor(config: AuditLogConfig, _securityConfig?: SecurityConfig) {
    super();
    this.config = config;
    this.initializeDatabase();
    this.initializeLogRotation();
    this.startPeriodicFlush();
  }

  /**
   * 데이터베이스 초기화
   */
  private initializeDatabase(): void {
    const dbPath = path.join(this.config.logDirectory, 'audit.db');
    this.database = new Database(dbPath);
    
    // 감사 로그 테이블 생성
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        user_id TEXT,
        username TEXT,
        ip_address TEXT NOT NULL,
        user_agent TEXT NOT NULL,
        resource TEXT,
        action TEXT,
        success INTEGER NOT NULL,
        message TEXT NOT NULL,
        metadata TEXT,
        severity TEXT NOT NULL,
        category TEXT NOT NULL,
        session_id TEXT,
        correlation_id TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // 인덱스 생성
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_logs(event_type);
      CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_ip_address ON audit_logs(ip_address);
      CREATE INDEX IF NOT EXISTS idx_audit_severity ON audit_logs(severity);
      CREATE INDEX IF NOT EXISTS idx_audit_success ON audit_logs(success);
    `);

    this.database.pragma('journal_mode = WAL');
    this.database.pragma('synchronous = NORMAL');
    this.database.pragma('cache_size = 10000');
  }

  /**
   * 감사 로그 기록
   */
  async log(event: SecurityEvent, severity?: 'low' | 'medium' | 'high' | 'critical', category?: string): Promise<void> {
    try {
      const auditEntry: AuditEntry = {
        id: event.id,
        timestamp: event.timestamp,
        eventType: event.type,
        userId: event.userId,
        username: event.username,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        resource: event.resource,
        action: event.action,
        success: event.success,
        message: event.message,
        metadata: event.metadata,
        severity: severity || this.determineSeverity(event),
        category: category || this.determineCategory(event),
        sessionId: event.metadata?.sessionId,
        correlationId: event.metadata?.correlationId
      };

      // 버퍼에 추가
      this.logBuffer.push(auditEntry);

      // 버퍼가 가득 차면 즉시 플러시
      if (this.logBuffer.length >= this.BUFFER_SIZE) {
        await this.flushBuffer();
      }

      // 중요한 이벤트는 즉시 플러시
      if (auditEntry.severity === 'critical' || auditEntry.severity === 'high') {
        await this.flushBuffer();
      }

      this.emit('auditLogged', auditEntry);

    } catch (error) {
      this.emit('auditError', {
        message: `Failed to log audit entry: ${(error as Error).message}`,
        originalEvent: event,
        error
      });
    }
  }

  /**
   * 보안 이벤트 심각도 결정
   */
  private determineSeverity(event: SecurityEvent): 'low' | 'medium' | 'high' | 'critical' {
    const criticalEvents: SecurityEventType[] = [
      'unauthorized_access',
      'account_locked',
      'suspicious_activity'
    ];

    const highEvents: SecurityEventType[] = [
      'login_failure',
      'permission_denied',
      'role_changed'
    ];

    const mediumEvents: SecurityEventType[] = [
      'login_success',
      'logout',
      'token_refresh',
      'password_changed'
    ];

    if (criticalEvents.includes(event.type)) {
      return 'critical';
    } else if (highEvents.includes(event.type)) {
      return 'high';
    } else if (mediumEvents.includes(event.type)) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * 보안 이벤트 카테고리 결정
   */
  private determineCategory(event: SecurityEvent): string {
    const authEvents: SecurityEventType[] = [
      'login_attempt',
      'login_success',
      'login_failure',
      'logout',
      'token_refresh'
    ];

    const accessEvents: SecurityEventType[] = [
      'permission_denied',
      'unauthorized_access'
    ];

    const adminEvents: SecurityEventType[] = [
      'role_changed',
      'password_changed',
      'account_locked'
    ];

    if (authEvents.includes(event.type)) {
      return 'authentication';
    } else if (accessEvents.includes(event.type)) {
      return 'access_control';
    } else if (adminEvents.includes(event.type)) {
      return 'administration';
    } else {
      return 'system';
    }
  }

  /**
   * 버퍼 플러시 (데이터베이스에 저장)
   */
  private async flushBuffer(): Promise<void> {
    if (this.logBuffer.length === 0) {
      return;
    }

    const entries = [...this.logBuffer];
    this.logBuffer = [];

    try {
      const insertStmt = this.database.prepare(`
        INSERT INTO audit_logs (
          id, timestamp, event_type, user_id, username, ip_address, user_agent,
          resource, action, success, message, metadata, severity, category,
          session_id, correlation_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMany = this.database.transaction((entries: AuditEntry[]) => {
        for (const entry of entries) {
          insertStmt.run(
            entry.id,
            entry.timestamp.getTime(),
            entry.eventType,
            entry.userId || null,
            entry.username || null,
            entry.ipAddress,
            entry.userAgent,
            entry.resource || null,
            entry.action || null,
            entry.success ? 1 : 0,
            entry.message,
            entry.metadata ? JSON.stringify(entry.metadata) : null,
            entry.severity,
            entry.category,
            entry.sessionId || null,
            entry.correlationId || null
          );
        }
      });

      insertMany(entries);

      // 파일 로그도 기록 (설정에 따라)
      if (this.config.logDirectory) {
        await this.writeToLogFile(entries);
      }

    } catch (error) {
      // 실패한 엔트리들을 다시 버퍼에 추가
      this.logBuffer.unshift(...entries);
      
      this.emit('auditError', {
        message: `Failed to flush audit buffer: ${(error as Error).message}`,
        entriesCount: entries.length,
        error
      });
    }
  }

  /**
   * 로그 파일에 기록
   */
  private async writeToLogFile(entries: AuditEntry[]): Promise<void> {
    try {
      const logFileName = this.getLogFileName();
      const logContent = entries.map(entry => 
        JSON.stringify({
          ...entry,
          timestamp: entry.timestamp.toISOString()
        })
      ).join('\n') + '\n';

      await fs.appendFile(logFileName, logContent, 'utf8');

      // 파일 크기 확인 및 로테이션
      const stats = await fs.stat(logFileName);
      if (stats.size > this.config.maxFileSize) {
        await this.rotateLogFile();
      }

    } catch (error) {
      this.emit('auditError', {
        message: `Failed to write to log file: ${(error as Error).message}`,
        error
      });
    }
  }

  /**
   * 로그 파일명 생성
   */
  private getLogFileName(): string {
    if (!this.currentLogFile) {
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      this.currentLogFile = path.join(
        this.config.logDirectory,
        `audit-${dateStr}.log`
      );
    }
    return this.currentLogFile;
  }

  /**
   * 로그 파일 로테이션
   */
  private async rotateLogFile(): Promise<void> {
    try {
      if (!this.currentLogFile) {
        return;
      }

      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-');
      const rotatedFileName = this.currentLogFile.replace('.log', `-${timestamp}.log`);

      await fs.rename(this.currentLogFile, rotatedFileName);
      this.currentLogFile = null;

      // 압축 (설정에 따라)
      if (this.config.compressionEnabled) {
        await this.compressLogFile(rotatedFileName);
      }

      // 오래된 로그 파일 정리
      await this.cleanupOldLogFiles();

      this.emit('logRotated', { rotatedFile: rotatedFileName });

    } catch (error) {
      this.emit('auditError', {
        message: `Failed to rotate log file: ${(error as Error).message}`,
        error
      });
    }
  }

  /**
   * 로그 파일 압축
   */
  private async compressLogFile(filePath: string): Promise<void> {
    // 실제 구현에서는 gzip 등을 사용
    // 여기서는 시뮬레이션
    const compressedPath = `${filePath}.gz`;
    this.emit('fileCompressed', { originalFile: filePath, compressedFile: compressedPath });
  }

  /**
   * 오래된 로그 파일 정리
   */
  private async cleanupOldLogFiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.logDirectory);
      const logFiles = files.filter(file => file.startsWith('audit-') && file.endsWith('.log'));
      
      if (logFiles.length > this.config.maxFiles) {
        // 파일명으로 정렬 (날짜 기준)
        logFiles.sort();
        const filesToDelete = logFiles.slice(0, logFiles.length - this.config.maxFiles);

        for (const file of filesToDelete) {
          const filePath = path.join(this.config.logDirectory, file);
          await fs.unlink(filePath);
        }

        this.emit('oldFilesCleanedUp', { deletedFiles: filesToDelete });
      }

    } catch (error) {
      this.emit('auditError', {
        message: `Failed to cleanup old log files: ${(error as Error).message}`,
        error
      });
    }
  }

  /**
   * 감사 로그 조회
   */
  async query(query: AuditQuery): Promise<AuditEntry[]> {
    try {
      let sql = 'SELECT * FROM audit_logs WHERE 1=1';
      const params: any[] = [];

      // 조건 추가
      if (query.startDate) {
        sql += ' AND timestamp >= ?';
        params.push(query.startDate.getTime());
      }

      if (query.endDate) {
        sql += ' AND timestamp <= ?';
        params.push(query.endDate.getTime());
      }

      if (query.eventTypes && query.eventTypes.length > 0) {
        sql += ` AND event_type IN (${query.eventTypes.map(() => '?').join(',')})`;
        params.push(...query.eventTypes);
      }

      if (query.userId) {
        sql += ' AND user_id = ?';
        params.push(query.userId);
      }

      if (query.ipAddress) {
        sql += ' AND ip_address = ?';
        params.push(query.ipAddress);
      }

      if (query.resource) {
        sql += ' AND resource = ?';
        params.push(query.resource);
      }

      if (query.success !== undefined) {
        sql += ' AND success = ?';
        params.push(query.success ? 1 : 0);
      }

      if (query.severity && query.severity.length > 0) {
        sql += ` AND severity IN (${query.severity.map(() => '?').join(',')})`;
        params.push(...query.severity);
      }

      // 정렬 및 제한
      sql += ' ORDER BY timestamp DESC';

      if (query.limit) {
        sql += ' LIMIT ?';
        params.push(query.limit);

        if (query.offset) {
          sql += ' OFFSET ?';
          params.push(query.offset);
        }
      }

      const stmt = this.database.prepare(sql);
      const rows = stmt.all(...params) as any[];

      return rows.map(row => ({
        id: row.id,
        timestamp: new Date(row.timestamp),
        eventType: row.event_type,
        userId: row.user_id,
        username: row.username,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        resource: row.resource,
        action: row.action,
        success: row.success === 1,
        message: row.message,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        severity: row.severity,
        category: row.category,
        sessionId: row.session_id,
        correlationId: row.correlation_id
      }));

    } catch (error) {
      this.emit('auditError', {
        message: `Failed to query audit logs: ${(error as Error).message}`,
        query,
        error
      });
      return [];
    }
  }

  /**
   * 감사 로그 요약 통계
   */
  async getSummary(startDate?: Date, endDate?: Date): Promise<AuditSummary> {
    try {
      let whereClause = '1=1';
      const params: any[] = [];

      if (startDate) {
        whereClause += ' AND timestamp >= ?';
        params.push(startDate.getTime());
      }

      if (endDate) {
        whereClause += ' AND timestamp <= ?';
        params.push(endDate.getTime());
      }

      // 총 이벤트 수
      const totalStmt = this.database.prepare(`SELECT COUNT(*) as count FROM audit_logs WHERE ${whereClause}`);
      const totalResult = totalStmt.get(...params) as any;
      const totalEvents = totalResult.count;

      // 성공/실패 분포
      const successStmt = this.database.prepare(`SELECT success, COUNT(*) as count FROM audit_logs WHERE ${whereClause} GROUP BY success`);
      const successResults = successStmt.all(...params) as any[];
      const successfulEvents = successResults.find(r => r.success === 1)?.count || 0;
      const failedEvents = successResults.find(r => r.success === 0)?.count || 0;

      // 이벤트 타입 분포
      const eventTypeStmt = this.database.prepare(`SELECT event_type, COUNT(*) as count FROM audit_logs WHERE ${whereClause} GROUP BY event_type ORDER BY count DESC`);
      const eventTypeResults = eventTypeStmt.all(...params) as any[];
      const eventTypeDistribution = Object.fromEntries(
        eventTypeResults.map(r => [r.event_type, r.count])
      );

      // 심각도 분포
      const severityStmt = this.database.prepare(`SELECT severity, COUNT(*) as count FROM audit_logs WHERE ${whereClause} GROUP BY severity ORDER BY count DESC`);
      const severityResults = severityStmt.all(...params) as any[];
      const severityDistribution = Object.fromEntries(
        severityResults.map(r => [r.severity, r.count])
      );

      // 상위 사용자
      const topUsersStmt = this.database.prepare(`SELECT user_id, username, COUNT(*) as count FROM audit_logs WHERE ${whereClause} AND user_id IS NOT NULL GROUP BY user_id, username ORDER BY count DESC LIMIT 10`);
      const topUsersResults = topUsersStmt.all(...params) as any[];
      const topUsers = topUsersResults.map(r => ({
        userId: r.user_id,
        username: r.username,
        count: r.count
      }));

      // 상위 IP 주소
      const topIpStmt = this.database.prepare(`SELECT ip_address, COUNT(*) as count FROM audit_logs WHERE ${whereClause} GROUP BY ip_address ORDER BY count DESC LIMIT 10`);
      const topIpResults = topIpStmt.all(...params) as any[];
      const topIpAddresses = topIpResults.map(r => ({
        ipAddress: r.ip_address,
        count: r.count
      }));

      // 시간 범위
      const timeRangeStmt = this.database.prepare(`SELECT MIN(timestamp) as start, MAX(timestamp) as end FROM audit_logs WHERE ${whereClause}`);
      const timeRangeResult = timeRangeStmt.get(...params) as any;

      return {
        totalEvents,
        successfulEvents,
        failedEvents,
        eventTypeDistribution,
        severityDistribution,
        topUsers,
        topIpAddresses,
        timeRange: {
          start: timeRangeResult.start ? new Date(timeRangeResult.start) : new Date(),
          end: timeRangeResult.end ? new Date(timeRangeResult.end) : new Date()
        }
      };

    } catch (error) {
      this.emit('auditError', {
        message: `Failed to generate audit summary: ${(error as Error).message}`,
        error
      });

      return {
        totalEvents: 0,
        successfulEvents: 0,
        failedEvents: 0,
        eventTypeDistribution: {},
        severityDistribution: {},
        topUsers: [],
        topIpAddresses: [],
        timeRange: { start: new Date(), end: new Date() }
      };
    }
  }

  /**
   * 로그 로테이션 초기화
   */
  private initializeLogRotation(): void {
    // 로그 디렉토리 생성
    fs.mkdir(this.config.logDirectory, { recursive: true }).catch(() => {});

    // 로테이션 타이머 설정
    this.rotationTimer = setInterval(() => {
      this.rotateLogFile().catch(error => {
        this.emit('auditError', {
          message: `Scheduled log rotation failed: ${error.message}`,
          error
        });
      });
    }, this.config.rotationInterval);
  }

  /**
   * 주기적 플러시 시작
   */
  private startPeriodicFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flushBuffer().catch(error => {
        this.emit('auditError', {
          message: `Periodic flush failed: ${error.message}`,
          error
        });
      });
    }, this.FLUSH_INTERVAL);
  }

  /**
   * 감사 로그 시스템 통계
   */
  getAuditStats(): Record<string, any> {
    return {
      bufferSize: this.logBuffer.length,
      maxBufferSize: this.BUFFER_SIZE,
      flushInterval: this.FLUSH_INTERVAL,
      currentLogFile: this.currentLogFile,
      config: {
        maxFileSize: this.config.maxFileSize,
        maxFiles: this.config.maxFiles,
        rotationInterval: this.config.rotationInterval,
        compressionEnabled: this.config.compressionEnabled,
        encryptionEnabled: this.config.encryptionEnabled
      }
    };
  }

  /**
   * 정리 작업
   */
  async cleanup(): Promise<void> {
    // 남은 버퍼 플러시
    if (this.logBuffer.length > 0) {
      await this.flushBuffer();
    }

    // 타이머 정리
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
    }

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // 데이터베이스 연결 종료
    if (this.database) {
      this.database.close();
    }

    this.removeAllListeners();
  }
}