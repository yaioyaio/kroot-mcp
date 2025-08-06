/**
 * DevFlow Monitor MCP - 피드백 수집기
 * 
 * 다양한 소스로부터 사용자 피드백을 수집하고 처리합니다.
 */

import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import * as os from 'os';
import {
  FeedbackMetadata,
  FeedbackType,
  FeedbackStatus,
  FeedbackPriority,
  FeedbackSource,
  FeedbackContext,
  FeedbackAttachment,
  FeedbackEvent,
  FeedbackEventType,
  UsabilityMetrics
} from './types.js';
type DatabaseService = {
  prepare: (sql: string) => any;
};
import type { ProjectManager } from '../projects/project-manager.js';
import type { StageAnalyzer } from '../analyzers/stage-analyzer.js';
import type { MetricsCollector } from '../analyzers/metrics-collector.js';
import { DevelopmentStage } from '../analyzers/types/stage.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger('FeedbackCollector');

/**
 * 피드백 수집기 설정
 */
export interface FeedbackCollectorConfig {
  /** 데이터베이스 서비스 */
  database: DatabaseService;
  
  /** 프로젝트 매니저 */
  projectManager?: ProjectManager | undefined;
  
  /** 스테이지 분석기 */
  stageAnalyzer?: StageAnalyzer | undefined;
  
  /** 메트릭 수집기 */
  metricsCollector?: MetricsCollector | undefined;
  
  /** 자동 컨텍스트 수집 여부 */
  autoCollectContext?: boolean | undefined;
  
  /** 익명 피드백 허용 여부 */
  allowAnonymous?: boolean | undefined;
  
  /** 최대 첨부 파일 크기 (바이트) */
  maxAttachmentSize?: number | undefined;
  
  /** 최대 첨부 파일 개수 */
  maxAttachments?: number | undefined;
}

/**
 * 피드백 제출 옵션
 */
export interface FeedbackSubmitOptions {
  /** 피드백 타입 */
  type: FeedbackType;
  
  /** 제목 */
  title: string;
  
  /** 설명 */
  description: string;
  
  /** 소스 */
  source?: FeedbackSource | undefined;
  
  /** 우선순위 */
  priority?: FeedbackPriority | undefined;
  
  /** 프로젝트 ID */
  projectId?: string | undefined;
  
  /** 제출자 정보 */
  submitter?: {
    id?: string;
    email?: string;
    name?: string;
  } | undefined;
  
  /** 태그 */
  tags?: string[] | undefined;
  
  /** 첨부 파일 */
  attachments?: FeedbackAttachment[] | undefined;
  
  /** 커스텀 컨텍스트 */
  customContext?: Record<string, any> | undefined;
  
  /** 사용성 메트릭 */
  usabilityMetrics?: UsabilityMetrics | undefined;
}

/**
 * 피드백 수집기
 */
export class FeedbackCollector extends EventEmitter {
  private config: FeedbackCollectorConfig & {
    autoCollectContext: boolean;
    allowAnonymous: boolean;
    maxAttachmentSize: number;
    maxAttachments: number;
  };
  private db: DatabaseService;
  
  constructor(config: FeedbackCollectorConfig) {
    super();
    
    this.config = {
      ...config,
      autoCollectContext: config.autoCollectContext ?? true,
      allowAnonymous: config.allowAnonymous ?? true,
      maxAttachmentSize: config.maxAttachmentSize ?? 10 * 1024 * 1024, // 10MB
      maxAttachments: config.maxAttachments ?? 5
    };
    
    this.db = config.database;
    this.initializeDatabase();
  }
  
  /**
   * 데이터베이스 초기화
   */
  private initializeDatabase(): void {
    // 피드백 테이블 생성
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        source TEXT NOT NULL,
        submitter_id TEXT,
        submitter_email TEXT,
        submitter_name TEXT,
        project_id TEXT,
        submitted_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        tags TEXT,
        context TEXT,
        usability_metrics TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      )
    `).run();
    
    // 첨부 파일 테이블 생성
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS feedback_attachments (
        id TEXT PRIMARY KEY,
        feedback_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        url TEXT NOT NULL,
        uploaded_at INTEGER NOT NULL,
        FOREIGN KEY (feedback_id) REFERENCES feedback(id) ON DELETE CASCADE
      )
    `).run();
    
    // 인덱스 생성
    this.db.prepare('CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(type)').run();
    this.db.prepare('CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status)').run();
    this.db.prepare('CREATE INDEX IF NOT EXISTS idx_feedback_priority ON feedback(priority)').run();
    this.db.prepare('CREATE INDEX IF NOT EXISTS idx_feedback_project ON feedback(project_id)').run();
    this.db.prepare('CREATE INDEX IF NOT EXISTS idx_feedback_submitted_at ON feedback(submitted_at)').run();
  }
  
  /**
   * 피드백 제출
   */
  async submitFeedback(options: FeedbackSubmitOptions): Promise<FeedbackMetadata> {
    try {
      // 유효성 검사
      this.validateFeedback(options);
      
      // 피드백 생성
      const feedback: FeedbackMetadata = {
        id: uuidv4(),
        type: options.type,
        title: options.title,
        description: options.description,
        status: FeedbackStatus.NEW,
        priority: options.priority || this.calculatePriority(options),
        source: options.source || FeedbackSource.IN_APP,
        submitter: options.submitter || {},
        submittedAt: Date.now(),
        updatedAt: Date.now(),
        tags: options.tags || [],
        ...(options.projectId && { projectId: options.projectId }),
        ...(options.attachments && { attachments: options.attachments })
      };
      
      // 익명 피드백 체크
      if (!this.config.allowAnonymous && !feedback.submitter.id && !feedback.submitter.email) {
        throw new Error('Anonymous feedback is not allowed');
      }
      
      // 컨텍스트 수집
      let context: FeedbackContext | undefined;
      if (this.config.autoCollectContext) {
        context = await this.collectContext(feedback.projectId);
      }
      
      // 데이터베이스에 저장
      this.saveFeedback(feedback, context, options.usabilityMetrics);
      
      // 첨부 파일 저장
      if (feedback.attachments && feedback.attachments.length > 0) {
        this.saveAttachments(feedback.id, feedback.attachments);
      }
      
      // 이벤트 발생
      const event: FeedbackEvent = {
        type: FeedbackEventType.FEEDBACK_SUBMITTED,
        feedbackId: feedback.id,
        timestamp: Date.now(),
        details: { type: feedback.type, priority: feedback.priority }
      };
      this.emit('feedbackSubmitted', event);
      
      logger.info('Feedback submitted', {
        id: feedback.id,
        type: feedback.type,
        priority: feedback.priority
      });
      
      return feedback;
      
    } catch (error) {
      logger.error('Failed to submit feedback', error);
      throw error;
    }
  }
  
  /**
   * 피드백 유효성 검사
   */
  private validateFeedback(options: FeedbackSubmitOptions): void {
    if (!options.title || options.title.trim().length === 0) {
      throw new Error('Feedback title is required');
    }
    
    if (!options.description || options.description.trim().length === 0) {
      throw new Error('Feedback description is required');
    }
    
    if (options.title.length > 200) {
      throw new Error('Feedback title is too long (max 200 characters)');
    }
    
    if (options.description.length > 5000) {
      throw new Error('Feedback description is too long (max 5000 characters)');
    }
    
    // 첨부 파일 검증
    if (options.attachments) {
      if (options.attachments.length > this.config.maxAttachments) {
        throw new Error(`Too many attachments (max ${this.config.maxAttachments})`);
      }
      
      for (const attachment of options.attachments) {
        if (attachment.size > this.config.maxAttachmentSize) {
          throw new Error(`Attachment ${attachment.filename} is too large (max ${this.config.maxAttachmentSize} bytes)`);
        }
      }
    }
  }
  
  /**
   * 우선순위 자동 계산
   */
  private calculatePriority(options: FeedbackSubmitOptions): FeedbackPriority {
    // 타입별 기본 우선순위
    const typePriority: Record<FeedbackType, FeedbackPriority> = {
      [FeedbackType.BUG_REPORT]: FeedbackPriority.HIGH,
      [FeedbackType.PERFORMANCE_ISSUE]: FeedbackPriority.HIGH,
      [FeedbackType.USABILITY_ISSUE]: FeedbackPriority.MEDIUM,
      [FeedbackType.FEATURE_REQUEST]: FeedbackPriority.MEDIUM,
      [FeedbackType.DOCUMENTATION]: FeedbackPriority.LOW,
      [FeedbackType.GENERAL]: FeedbackPriority.LOW,
      [FeedbackType.PRAISE]: FeedbackPriority.LOW
    };
    
    let priority = typePriority[options.type];
    
    // 키워드 기반 우선순위 조정
    const criticalKeywords = ['crash', 'error', 'broken', 'security', 'data loss', 'critical'];
    const highKeywords = ['bug', 'issue', 'problem', 'slow', 'performance'];
    
    const lowerDescription = options.description.toLowerCase();
    
    if (criticalKeywords.some(keyword => lowerDescription.includes(keyword))) {
      priority = FeedbackPriority.CRITICAL;
    } else if (highKeywords.some(keyword => lowerDescription.includes(keyword)) && 
               priority === FeedbackPriority.MEDIUM) {
      priority = FeedbackPriority.HIGH;
    }
    
    return priority;
  }
  
  /**
   * 컨텍스트 수집
   */
  private async collectContext(projectId?: string): Promise<FeedbackContext> {
    const context: FeedbackContext = {
      system: {
        platform: process.platform,
        version: process.version,
        nodeVersion: process.versions.node,
        cpuArch: os.arch(),
        memory: {
          total: os.totalmem(),
          free: os.freemem()
        }
      }
    };
    
    // 프로젝트 정보 수집
    if (projectId && this.config.projectManager) {
      try {
        const project = await this.config.projectManager.getProject(projectId);
        const projectStats = await this.config.projectManager.getProjectStats();
        
        if (project) {
          context.project = {
            id: project.id,
            name: project.name,
            stage: this.config.stageAnalyzer?.getCurrentStage() || DevelopmentStage.PLANNING,
            activeTime: Date.now() - project.createdAt,
            eventCount: projectStats.total
          };
        }
      } catch (error) {
        logger.warn('Failed to collect project context', { projectId, error });
      }
    }
    
    // 성능 메트릭 수집
    if (this.config.metricsCollector) {
      try {
        const snapshot = this.config.metricsCollector.getMetricsSnapshot();
        const allMetrics = snapshot.metrics;
        const cpuMetrics = allMetrics.cpu_usage?.values || [];
        const memoryMetrics = allMetrics.memory_usage?.values || [];
        
        context.performance = {
          cpuUsage: cpuMetrics.length > 0 ? (cpuMetrics[cpuMetrics.length - 1]?.value ?? 0) : 0,
          memoryUsage: memoryMetrics.length > 0 ? (memoryMetrics[memoryMetrics.length - 1]?.value ?? 0) : 0,
          eventQueueSize: 0, // TODO: 실제 큐 크기 가져오기
          responseTime: 0 // TODO: 평균 응답 시간 계산
        };
      } catch (error) {
        logger.warn('Failed to collect performance context', { error });
      }
    }
    
    return context;
  }
  
  /**
   * 피드백 저장
   */
  private saveFeedback(
    feedback: FeedbackMetadata,
    context?: FeedbackContext,
    usabilityMetrics?: UsabilityMetrics
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO feedback (
        id, type, title, description, status, priority, source,
        submitter_id, submitter_email, submitter_name, project_id,
        submitted_at, updated_at, tags, context, usability_metrics
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      feedback.id,
      feedback.type,
      feedback.title,
      feedback.description,
      feedback.status,
      feedback.priority,
      feedback.source,
      feedback.submitter.id || null,
      feedback.submitter.email || null,
      feedback.submitter.name || null,
      feedback.projectId || null,
      feedback.submittedAt,
      feedback.updatedAt,
      JSON.stringify(feedback.tags),
      context ? JSON.stringify(context) : null,
      usabilityMetrics ? JSON.stringify(usabilityMetrics) : null
    );
  }
  
  /**
   * 첨부 파일 저장
   */
  private saveAttachments(feedbackId: string, attachments: FeedbackAttachment[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO feedback_attachments (
        id, feedback_id, filename, mime_type, size, url, uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    for (const attachment of attachments) {
      stmt.run(
        attachment.id,
        feedbackId,
        attachment.filename,
        attachment.mimeType,
        attachment.size,
        attachment.url,
        attachment.uploadedAt
      );
    }
  }
  
  /**
   * 피드백 조회
   */
  async getFeedback(id: string): Promise<FeedbackMetadata | null> {
    const row = this.db.prepare(`
      SELECT * FROM feedback WHERE id = ?
    `).get(id) as any;
    
    if (!row) {
      return null;
    }
    
    // 첨부 파일 조회
    const attachments = this.db.prepare(`
      SELECT * FROM feedback_attachments WHERE feedback_id = ?
    `).all(row.id) as any[];
    
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      source: row.source,
      submitter: {
        id: row.submitter_id,
        email: row.submitter_email,
        name: row.submitter_name
      },
      projectId: row.project_id,
      submittedAt: row.submitted_at,
      updatedAt: row.updated_at,
      tags: JSON.parse(row.tags || '[]'),
      attachments: attachments.map(att => ({
        id: att.id,
        filename: att.filename,
        mimeType: att.mime_type,
        size: att.size,
        url: att.url,
        uploadedAt: att.uploaded_at
      }))
    };
  }
  
  /**
   * 피드백 목록 조회
   */
  async listFeedback(
    limit: number = 100,
    offset: number = 0,
    filters?: {
      type?: FeedbackType;
      status?: FeedbackStatus;
      priority?: FeedbackPriority;
      projectId?: string;
    }
  ): Promise<FeedbackMetadata[]> {
    let query = 'SELECT * FROM feedback WHERE 1=1';
    const params: any[] = [];
    
    if (filters?.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }
    
    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    
    if (filters?.priority) {
      query += ' AND priority = ?';
      params.push(filters.priority);
    }
    
    if (filters?.projectId) {
      query += ' AND project_id = ?';
      params.push(filters.projectId);
    }
    
    query += ' ORDER BY submitted_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const rows = this.db.prepare(query).all(...params) as any[];
    
    return rows.map(row => ({
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      source: row.source,
      submitter: {
        id: row.submitter_id,
        email: row.submitter_email,
        name: row.submitter_name
      },
      projectId: row.project_id,
      submittedAt: row.submitted_at,
      updatedAt: row.updated_at,
      tags: JSON.parse(row.tags || '[]')
    }));
  }
  
  /**
   * 피드백 상태 업데이트
   */
  async updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<void> {
    const result = this.db.prepare(`
      UPDATE feedback 
      SET status = ?, updated_at = ? 
      WHERE id = ?
    `).run(status, Date.now(), id);
    
    if (result.changes > 0) {
      const event: FeedbackEvent = {
        type: FeedbackEventType.FEEDBACK_STATUS_CHANGED,
        feedbackId: id,
        timestamp: Date.now(),
        details: { newStatus: status }
      };
      this.emit('feedbackStatusChanged', event);
      
      logger.info('Feedback status updated', { id, status });
    }
  }
  
  /**
   * 피드백 우선순위 업데이트
   */
  async updateFeedbackPriority(id: string, priority: FeedbackPriority): Promise<void> {
    const result = this.db.prepare(`
      UPDATE feedback 
      SET priority = ?, updated_at = ? 
      WHERE id = ?
    `).run(priority, Date.now(), id);
    
    if (result.changes > 0) {
      logger.info('Feedback priority updated', { id, priority });
    }
  }
  
  /**
   * 피드백 삭제
   */
  async deleteFeedback(id: string): Promise<void> {
    const result = this.db.prepare('DELETE FROM feedback WHERE id = ?').run(id);
    
    if (result.changes > 0) {
      logger.info('Feedback deleted', { id });
    }
  }
  
  /**
   * 통계 조회
   */
  async getStats(projectId?: string): Promise<{
    total: number;
    byType: Record<FeedbackType, number>;
    byStatus: Record<FeedbackStatus, number>;
    byPriority: Record<FeedbackPriority, number>;
  }> {
    let baseQuery = 'FROM feedback';
    const params: any[] = [];
    
    if (projectId) {
      baseQuery += ' WHERE project_id = ?';
      params.push(projectId);
    }
    
    // 총 개수
    const totalRow = this.db.prepare(`SELECT COUNT(*) as count ${baseQuery}`).get(...params) as any;
    
    // 타입별 통계
    const typeRows = this.db.prepare(`
      SELECT type, COUNT(*) as count ${baseQuery} ${projectId ? 'AND' : 'WHERE'} 1=1 GROUP BY type
    `).all(...params) as any[];
    
    // 상태별 통계
    const statusRows = this.db.prepare(`
      SELECT status, COUNT(*) as count ${baseQuery} ${projectId ? 'AND' : 'WHERE'} 1=1 GROUP BY status
    `).all(...params) as any[];
    
    // 우선순위별 통계
    const priorityRows = this.db.prepare(`
      SELECT priority, COUNT(*) as count ${baseQuery} ${projectId ? 'AND' : 'WHERE'} 1=1 GROUP BY priority
    `).all(...params) as any[];
    
    return {
      total: totalRow.count,
      byType: Object.fromEntries(typeRows.map(r => [r.type, r.count])) as any,
      byStatus: Object.fromEntries(statusRows.map(r => [r.status, r.count])) as any,
      byPriority: Object.fromEntries(priorityRows.map(r => [r.priority, r.count])) as any
    };
  }
}