/**
 * DevFlow Monitor MCP - 보고서 스케줄러
 * 
 * 정기적인 보고서 생성을 관리하는 스케줄러입니다.
 */

import { EventEmitter } from 'eventemitter3';
import cron from 'node-cron';
import parser from 'cron-parser';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger.js';
import {
  ReportSchedule,
  SchedulePattern,
  ReportConfig,
  ReportResult,
  ReportEventType,
  ReportEvent
} from './types.js';
import { ReportEngine } from './report-engine.js';
import { ReportDelivery } from './delivery.js';
import { StorageManager } from '../storage/index.js';

/**
 * 스케줄러 설정
 */
export interface SchedulerConfig {
  /** 활성화 여부 */
  enabled?: boolean;
  
  /** 최대 동시 실행 수 */
  maxConcurrentJobs?: number;
  
  /** 기본 타임존 */
  defaultTimezone?: string;
  
  /** 스케줄 체크 간격 (밀리초) */
  checkInterval?: number;
  
  /** 오류 재시도 횟수 */
  retryAttempts?: number;
  
  /** 재시도 대기 시간 (밀리초) */
  retryDelay?: number;
}

/**
 * 스케줄 작업
 */
interface ScheduleJob {
  /** 작업 ID */
  id: string;
  
  /** 스케줄 */
  schedule: ReportSchedule;
  
  /** Cron 작업 */
  cronJob?: cron.ScheduledTask;
  
  /** 실행 중 여부 */
  running: boolean;
  
  /** 마지막 실행 결과 */
  lastResult?: ReportResult;
  
  /** 마지막 오류 */
  lastError?: string;
}

/**
 * 보고서 스케줄러
 */
export class ReportScheduler extends EventEmitter {
  private logger: Logger;
  private config: Required<SchedulerConfig>;
  private schedules: Map<string, ScheduleJob>;
  private reportEngine: ReportEngine;
  private reportDelivery: ReportDelivery;
  private storageManager: StorageManager;
  private checkTimer?: NodeJS.Timer;
  
  constructor(
    config: SchedulerConfig,
    reportEngine: ReportEngine,
    reportDelivery: ReportDelivery,
    storageManager: StorageManager
  ) {
    super();
    this.logger = new Logger('ReportScheduler');
    this.config = {
      enabled: true,
      maxConcurrentJobs: 5,
      defaultTimezone: 'UTC',
      checkInterval: 60000, // 1분
      retryAttempts: 3,
      retryDelay: 300000, // 5분
      ...config
    };
    
    this.schedules = new Map();
    this.reportEngine = reportEngine;
    this.reportDelivery = reportDelivery;
    this.storageManager = storageManager;
    
    if (this.config.enabled) {
      this.initialize();
    }
  }

  /**
   * 초기화
   */
  private async initialize(): Promise<void> {
    try {
      // 저장된 스케줄 로드
      await this.loadSchedules();
      
      // 정기 체크 시작
      this.startPeriodicCheck();
      
      this.logger.info('Report scheduler initialized', {
        schedulesCount: this.schedules.size
      });
    } catch (error) {
      this.logger.error('Failed to initialize scheduler', error);
    }
  }

  /**
   * 스케줄 생성
   */
  async createSchedule(
    name: string,
    reportConfig: ReportConfig,
    pattern: SchedulePattern,
    createdBy: string = 'system'
  ): Promise<ReportSchedule> {
    const schedule: ReportSchedule = {
      id: uuidv4(),
      name,
      enabled: true,
      reportConfig,
      schedule: pattern,
      createdBy,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    // 타임존 설정
    if (!schedule.timezone) {
      schedule.timezone = this.config.defaultTimezone;
    }
    
    // 다음 실행 시간 계산
    schedule.nextRunAt = this.calculateNextRun(pattern);
    
    // 스케줄 작업 생성
    const job: ScheduleJob = {
      id: schedule.id,
      schedule,
      running: false
    };
    
    // Cron 작업 생성
    if (pattern.type === 'cron' && pattern.cron) {
      job.cronJob = this.createCronJob(schedule);
    }
    
    // 저장
    this.schedules.set(schedule.id, job);
    await this.saveSchedule(schedule);
    
    // 이벤트 발생
    this.emitScheduleEvent(ReportEventType.SCHEDULE_CREATED, schedule);
    
    this.logger.info('Schedule created', {
      scheduleId: schedule.id,
      name: schedule.name,
      pattern: pattern.type
    });
    
    return schedule;
  }

  /**
   * 스케줄 업데이트
   */
  async updateSchedule(
    scheduleId: string,
    updates: Partial<ReportSchedule>
  ): Promise<ReportSchedule | null> {
    const job = this.schedules.get(scheduleId);
    if (!job) {
      return null;
    }
    
    // 실행 중인 경우 거부
    if (job.running) {
      throw new Error('Cannot update schedule while it is running');
    }
    
    // 기존 Cron 작업 중지
    if (job.cronJob) {
      job.cronJob.stop();
      job.cronJob = undefined;
    }
    
    // 스케줄 업데이트
    const updatedSchedule: ReportSchedule = {
      ...job.schedule,
      ...updates,
      updatedAt: Date.now()
    };
    
    // 다음 실행 시간 재계산
    if (updates.schedule) {
      updatedSchedule.nextRunAt = this.calculateNextRun(updatedSchedule.schedule);
    }
    
    // 새 Cron 작업 생성
    if (updatedSchedule.enabled && updatedSchedule.schedule.type === 'cron' && updatedSchedule.schedule.cron) {
      job.cronJob = this.createCronJob(updatedSchedule);
    }
    
    // 업데이트
    job.schedule = updatedSchedule;
    await this.saveSchedule(updatedSchedule);
    
    // 이벤트 발생
    this.emitScheduleEvent(ReportEventType.SCHEDULE_UPDATED, updatedSchedule);
    
    this.logger.info('Schedule updated', { scheduleId });
    
    return updatedSchedule;
  }

  /**
   * 스케줄 삭제
   */
  async deleteSchedule(scheduleId: string): Promise<boolean> {
    const job = this.schedules.get(scheduleId);
    if (!job) {
      return false;
    }
    
    // 실행 중인 경우 거부
    if (job.running) {
      throw new Error('Cannot delete schedule while it is running');
    }
    
    // Cron 작업 중지
    if (job.cronJob) {
      job.cronJob.stop();
    }
    
    // 삭제
    this.schedules.delete(scheduleId);
    await this.removeSchedule(scheduleId);
    
    // 이벤트 발생
    this.emitScheduleEvent(ReportEventType.SCHEDULE_DELETED, job.schedule);
    
    this.logger.info('Schedule deleted', { scheduleId });
    
    return true;
  }

  /**
   * 스케줄 조회
   */
  getSchedule(scheduleId: string): ReportSchedule | null {
    const job = this.schedules.get(scheduleId);
    return job ? job.schedule : null;
  }

  /**
   * 모든 스케줄 조회
   */
  getAllSchedules(): ReportSchedule[] {
    return Array.from(this.schedules.values()).map(job => job.schedule);
  }

  /**
   * 스케줄 즉시 실행
   */
  async runScheduleNow(scheduleId: string): Promise<ReportResult> {
    const job = this.schedules.get(scheduleId);
    if (!job) {
      throw new Error('Schedule not found');
    }
    
    if (job.running) {
      throw new Error('Schedule is already running');
    }
    
    return this.executeSchedule(job);
  }

  /**
   * Cron 작업 생성
   */
  private createCronJob(schedule: ReportSchedule): cron.ScheduledTask {
    if (!schedule.schedule.cron) {
      throw new Error('Cron expression is required');
    }
    
    const task = cron.schedule(
      schedule.schedule.cron,
      async () => {
        const job = this.schedules.get(schedule.id);
        if (job && schedule.enabled) {
          try {
            await this.executeSchedule(job);
          } catch (error) {
            this.logger.error('Failed to execute scheduled report', {
              scheduleId: schedule.id,
              error
            });
          }
        }
      },
      {
        scheduled: true,
        timezone: schedule.timezone || this.config.defaultTimezone
      }
    );
    
    return task;
  }

  /**
   * 스케줄 실행
   */
  private async executeSchedule(job: ScheduleJob): Promise<ReportResult> {
    // 동시 실행 제한 확인
    const runningCount = Array.from(this.schedules.values()).filter(j => j.running).length;
    if (runningCount >= this.config.maxConcurrentJobs) {
      throw new Error('Maximum concurrent jobs reached');
    }
    
    job.running = true;
    const startTime = Date.now();
    
    try {
      this.logger.info('Executing scheduled report', {
        scheduleId: job.schedule.id,
        name: job.schedule.name
      });
      
      // 기간 계산
      const { periodStart, periodEnd } = this.calculateReportPeriod(job.schedule);
      
      // 보고서 생성
      const result = await this.reportEngine.generateReport(
        job.schedule.reportConfig,
        [], // 프로젝트 ID는 설정에서 가져올 수 있음
        periodStart,
        periodEnd
      );
      
      // 배포
      if (job.schedule.reportConfig.deliveryChannels?.length > 0) {
        const deliveryResults = await this.reportDelivery.deliver(
          result,
          job.schedule.reportConfig.deliveryChannels
        );
        result.deliveryResults = deliveryResults;
      }
      
      // 상태 업데이트
      job.lastResult = result;
      job.lastError = undefined;
      job.schedule.lastRunAt = startTime;
      job.schedule.nextRunAt = this.calculateNextRun(job.schedule.schedule);
      await this.saveSchedule(job.schedule);
      
      // 이벤트 발생
      this.emitScheduleEvent(ReportEventType.SCHEDULE_EXECUTED, job.schedule, result);
      
      this.logger.info('Scheduled report completed', {
        scheduleId: job.schedule.id,
        duration: Date.now() - startTime
      });
      
      return result;
    } catch (error) {
      // 오류 처리
      job.lastError = (error as Error).message;
      
      this.logger.error('Failed to execute scheduled report', {
        scheduleId: job.schedule.id,
        error
      });
      
      // 재시도 로직
      if (this.config.retryAttempts > 0) {
        this.scheduleRetry(job, 1);
      }
      
      throw error;
    } finally {
      job.running = false;
    }
  }

  /**
   * 재시도 스케줄링
   */
  private scheduleRetry(job: ScheduleJob, attempt: number): void {
    if (attempt > this.config.retryAttempts) {
      this.logger.error('Max retry attempts reached', {
        scheduleId: job.schedule.id
      });
      return;
    }
    
    setTimeout(async () => {
      try {
        await this.executeSchedule(job);
      } catch (error) {
        this.scheduleRetry(job, attempt + 1);
      }
    }, this.config.retryDelay * attempt);
  }

  /**
   * 다음 실행 시간 계산
   */
  private calculateNextRun(pattern: SchedulePattern): number {
    const now = new Date();
    
    switch (pattern.type) {
      case 'cron':
        if (pattern.cron) {
          const interval = parser.parseExpression(pattern.cron);
          return interval.next().getTime();
        }
        break;
        
      case 'interval':
        if (pattern.interval) {
          return now.getTime() + pattern.interval;
        }
        break;
        
      case 'daily':
        if (pattern.time) {
          const [hours, minutes] = pattern.time.split(':').map(Number);
          const next = new Date(now);
          next.setHours(hours, minutes, 0, 0);
          if (next.getTime() <= now.getTime()) {
            next.setDate(next.getDate() + 1);
          }
          return next.getTime();
        }
        break;
        
      case 'weekly':
        if (pattern.time && pattern.dayOfWeek !== undefined) {
          const [hours, minutes] = pattern.time.split(':').map(Number);
          const next = new Date(now);
          next.setHours(hours, minutes, 0, 0);
          
          // 다음 지정 요일 찾기
          const daysUntilNext = (pattern.dayOfWeek - now.getDay() + 7) % 7 || 7;
          next.setDate(next.getDate() + daysUntilNext);
          
          return next.getTime();
        }
        break;
        
      case 'monthly':
        if (pattern.time && pattern.dayOfMonth !== undefined) {
          const [hours, minutes] = pattern.time.split(':').map(Number);
          const next = new Date(now);
          next.setDate(pattern.dayOfMonth);
          next.setHours(hours, minutes, 0, 0);
          
          if (next.getTime() <= now.getTime()) {
            next.setMonth(next.getMonth() + 1);
          }
          
          return next.getTime();
        }
        break;
    }
    
    // 기본값: 1일 후
    return now.getTime() + 86400000;
  }

  /**
   * 보고 기간 계산
   */
  private calculateReportPeriod(schedule: ReportSchedule): {
    periodStart: number;
    periodEnd: number;
  } {
    const now = Date.now();
    let periodStart: number;
    let periodEnd: number = now;
    
    switch (schedule.reportConfig.type) {
      case 'daily':
        periodStart = now - 86400000; // 24시간
        break;
        
      case 'weekly':
        periodStart = now - 604800000; // 7일
        break;
        
      case 'monthly':
        periodStart = now - 2592000000; // 30일
        break;
        
      case 'quarterly':
        periodStart = now - 7776000000; // 90일
        break;
        
      default:
        periodStart = now - 86400000; // 기본 24시간
    }
    
    return { periodStart, periodEnd };
  }

  /**
   * 정기 체크 시작
   */
  private startPeriodicCheck(): void {
    this.checkTimer = setInterval(() => {
      this.checkSchedules();
    }, this.config.checkInterval);
  }

  /**
   * 스케줄 체크
   */
  private async checkSchedules(): Promise<void> {
    const now = Date.now();
    
    for (const job of this.schedules.values()) {
      if (!job.schedule.enabled || job.running) {
        continue;
      }
      
      // Cron이 아닌 스케줄 체크
      if (job.schedule.schedule.type !== 'cron' && job.schedule.nextRunAt) {
        if (job.schedule.nextRunAt <= now) {
          try {
            await this.executeSchedule(job);
          } catch (error) {
            this.logger.error('Failed to execute schedule', {
              scheduleId: job.schedule.id,
              error
            });
          }
        }
      }
    }
  }

  /**
   * 스케줄 로드
   */
  private async loadSchedules(): Promise<void> {
    try {
      // TODO: Implement schedule persistence
      const schedules: any[] = [];
      
      for (const data of schedules) {
        if (data.type === 'report_schedule') {
          const schedule = data.data as ReportSchedule;
          const job: ScheduleJob = {
            id: schedule.id,
            schedule,
            running: false
          };
          
          // Cron 작업 복원
          if (schedule.enabled && schedule.schedule.type === 'cron' && schedule.schedule.cron) {
            job.cronJob = this.createCronJob(schedule);
          }
          
          this.schedules.set(schedule.id, job);
        }
      }
      
      this.logger.info(`Loaded ${this.schedules.size} schedules`);
    } catch (error) {
      this.logger.error('Failed to load schedules', error);
    }
  }

  /**
   * 스케줄 저장
   */
  private async saveSchedule(schedule: ReportSchedule): Promise<void> {
    try {
      // TODO: Implement schedule persistence
      /*await this.storageManager.repositories.system.create({
        id: schedule.id,
        type: 'report_schedule',
        data: schedule,
        timestamp: Date.now()
      });*/
    } catch (error) {
      this.logger.error('Failed to save schedule', error);
    }
  }

  /**
   * 스케줄 제거
   */
  private async removeSchedule(scheduleId: string): Promise<void> {
    try {
      // 실제 구현에서는 ID로 삭제하는 메서드 필요
      this.logger.debug('Schedule removed from storage', { scheduleId });
    } catch (error) {
      this.logger.error('Failed to remove schedule', error);
    }
  }

  /**
   * 이벤트 발생
   */
  private emitScheduleEvent(
    type: ReportEventType,
    schedule: ReportSchedule,
    details?: any
  ): void {
    const event: ReportEvent = {
      type,
      reportId: schedule.id,
      timestamp: Date.now(),
      details: {
        schedule,
        ...details
      }
    };
    
    this.emit(type, event);
  }

  /**
   * 정리
   */
  async shutdown(): Promise<void> {
    // 타이머 중지
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
    }
    
    // 모든 Cron 작업 중지
    for (const job of this.schedules.values()) {
      if (job.cronJob) {
        job.cronJob.stop();
      }
    }
    
    this.logger.info('Report scheduler shut down');
  }
}