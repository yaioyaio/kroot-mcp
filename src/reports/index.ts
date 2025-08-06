/**
 * DevFlow Monitor MCP - 고급 보고서 시스템
 * 
 * 보고서 생성, 스케줄링, 배포를 통합 관리하는 시스템입니다.
 */

import { EventEmitter } from 'eventemitter3';
import { Logger } from '../utils/logger.js';
import { ReportEngine, ReportEngineConfig } from './report-engine.js';
import { ReportScheduler, SchedulerConfig } from './scheduler.js';
import { ReportDelivery, DeliverySystemConfig } from './delivery.js';
import { TemplateManager, TemplateManagerConfig } from './template-manager.js';
import { PDFGenerator, PDFGeneratorConfig } from './pdf-generator.js';
import {
  ReportType,
  ReportFormat,
  ReportConfig,
  ReportResult,
  ReportSchedule,
  SchedulePattern,
  ReportTemplate,
  DeliveryConfig,
  ReportEvent,
  ReportEventType
} from './types.js';

// 의존성 타입
import { MetricsCollector } from '../analyzers/metrics-collector.js';
import { MethodologyAnalyzer } from '../analyzers/methodology-analyzer.js';
import { AIMonitor } from '../analyzers/ai-monitor.js';
import { BottleneckDetector } from '../analyzers/bottleneck-detector.js';
import { StageAnalyzer } from '../analyzers/stage-analyzer.js';
import { EventEngine } from '../events/engine.js';
import { StorageManager } from '../storage/index.js';

/**
 * 보고서 시스템 설정
 */
export interface ReportSystemConfig {
  /** 보고서 엔진 설정 */
  engine?: ReportEngineConfig;
  
  /** 스케줄러 설정 */
  scheduler?: SchedulerConfig;
  
  /** 배포 시스템 설정 */
  delivery?: DeliverySystemConfig;
  
  /** 템플릿 관리자 설정 */
  templates?: TemplateManagerConfig;
  
  /** PDF 생성기 설정 */
  pdf?: PDFGeneratorConfig;
  
  /** 시스템 활성화 */
  enabled?: boolean;
}

/**
 * 통합 보고서 시스템
 */
export class ReportSystem extends EventEmitter {
  private logger: Logger;
  private config: ReportSystemConfig;
  
  // 컴포넌트
  private reportEngine!: ReportEngine;
  private reportScheduler!: ReportScheduler;
  private reportDelivery!: ReportDelivery;
  private templateManager!: TemplateManager;
  private pdfGenerator!: PDFGenerator;
  
  // 의존성
  private dependencies: {
    metricsCollector: MetricsCollector;
    methodologyAnalyzer: MethodologyAnalyzer;
    aiMonitor: AIMonitor;
    bottleneckDetector: BottleneckDetector;
    stageAnalyzer: StageAnalyzer;
    eventEngine: EventEngine;
    storageManager: StorageManager;
  };
  
  constructor(
    config: ReportSystemConfig,
    dependencies: {
      metricsCollector: MetricsCollector;
      methodologyAnalyzer: MethodologyAnalyzer;
      aiMonitor: AIMonitor;
      bottleneckDetector: BottleneckDetector;
      stageAnalyzer: StageAnalyzer;
      eventEngine: EventEngine;
      storageManager: StorageManager;
    }
  ) {
    super();
    this.logger = new Logger('ReportSystem');
    this.config = {
      enabled: true,
      ...config
    };
    this.dependencies = dependencies;
    
    // 컴포넌트 초기화
    this.initializeComponents();
    
    // 이벤트 리스너 설정
    this.setupEventListeners();
    
    this.logger.info('Report system initialized');
  }

  /**
   * 컴포넌트 초기화
   */
  private initializeComponents(): void {
    // 보고서 엔진
    this.reportEngine = new ReportEngine(
      {
        reportsPath: './reports/generated',
        templatesPath: './reports/templates',
        tempPath: './reports/temp',
        ...this.config.engine
      },
      this.dependencies
    );
    
    // 배포 시스템
    this.reportDelivery = new ReportDelivery({
      ...this.config.delivery
    });
    
    // 스케줄러
    this.reportScheduler = new ReportScheduler(
      {
        enabled: this.config.enabled,
        ...this.config.scheduler
      },
      this.reportEngine,
      this.reportDelivery,
      this.dependencies.storageManager
    );
    
    // 템플릿 관리자
    this.templateManager = new TemplateManager({
      templatesPath: './reports/templates',
      ...this.config.templates
    });
    
    // PDF 생성기
    this.pdfGenerator = new PDFGenerator({
      ...this.config.pdf
    });
  }

  /**
   * 이벤트 리스너 설정
   */
  private setupEventListeners(): void {
    // 엔진 이벤트
    this.reportEngine.on(ReportEventType.GENERATION_STARTED, (event: ReportEvent) => {
      this.emit(ReportEventType.GENERATION_STARTED, event);
      this.logger.debug('Report generation started', { reportId: event.reportId });
    });
    
    this.reportEngine.on(ReportEventType.GENERATION_COMPLETED, (event: ReportEvent) => {
      this.emit(ReportEventType.GENERATION_COMPLETED, event);
      this.logger.info('Report generation completed', { reportId: event.reportId });
    });
    
    this.reportEngine.on(ReportEventType.GENERATION_FAILED, (event: ReportEvent) => {
      this.emit(ReportEventType.GENERATION_FAILED, event);
      this.logger.error('Report generation failed', { reportId: event.reportId });
    });
    
    // 스케줄러 이벤트
    this.reportScheduler.on(ReportEventType.SCHEDULE_EXECUTED, (event: ReportEvent) => {
      this.emit(ReportEventType.SCHEDULE_EXECUTED, event);
      this.logger.info('Scheduled report executed', { reportId: event.reportId });
    });
    
    // 배포 이벤트
    this.reportDelivery.on(ReportEventType.DELIVERY_COMPLETED, (event: any) => {
      this.emit(ReportEventType.DELIVERY_COMPLETED, event);
      this.logger.info('Report delivered', event);
    });
    
    this.reportDelivery.on(ReportEventType.DELIVERY_FAILED, (event: any) => {
      this.emit(ReportEventType.DELIVERY_FAILED, event);
      this.logger.error('Report delivery failed', event);
    });
  }

  /**
   * 보고서 생성
   */
  async generateReport(
    config: ReportConfig,
    projectIds?: string[],
    periodStart?: number,
    periodEnd?: number
  ): Promise<ReportResult> {
    if (!this.config.enabled) {
      throw new Error('Report system is disabled');
    }
    
    return this.reportEngine.generateReport(config, projectIds, periodStart, periodEnd);
  }

  /**
   * 템플릿으로부터 보고서 생성
   */
  async generateFromTemplate(
    templateId: string,
    overrides?: Partial<ReportConfig>,
    projectIds?: string[],
    periodStart?: number,
    periodEnd?: number
  ): Promise<ReportResult> {
    const config = this.templateManager.createConfigFromTemplate(templateId, overrides);
    if (!config) {
      throw new Error(`Template not found: ${templateId}`);
    }
    
    return this.generateReport(config, projectIds, periodStart, periodEnd);
  }

  /**
   * 빠른 보고서 생성 헬퍼 메서드들
   */
  
  async generateDailyReport(projectIds?: string[]): Promise<ReportResult> {
    const template = this.templateManager.getAllTemplates({
      type: ReportType.DAILY,
      createdBy: 'system'
    })[0];
    
    if (!template) {
      throw new Error('Daily report template not found');
    }
    
    return this.generateFromTemplate(template.id, {}, projectIds);
  }
  
  async generateWeeklyReport(projectIds?: string[]): Promise<ReportResult> {
    const template = this.templateManager.getAllTemplates({
      type: ReportType.WEEKLY,
      createdBy: 'system'
    })[0];
    
    if (!template) {
      throw new Error('Weekly report template not found');
    }
    
    return this.generateFromTemplate(template.id, {}, projectIds);
  }
  
  async generateMonthlyReport(projectIds?: string[]): Promise<ReportResult> {
    const template = this.templateManager.getAllTemplates({
      type: ReportType.MONTHLY,
      createdBy: 'system'
    })[0];
    
    if (!template) {
      throw new Error('Monthly report template not found');
    }
    
    return this.generateFromTemplate(template.id, {}, projectIds);
  }

  /**
   * 스케줄 관리
   */
  
  async createSchedule(
    name: string,
    reportConfig: ReportConfig,
    pattern: SchedulePattern,
    createdBy?: string
  ): Promise<ReportSchedule> {
    return this.reportScheduler.createSchedule(name, reportConfig, pattern, createdBy);
  }
  
  async updateSchedule(
    scheduleId: string,
    updates: Partial<ReportSchedule>
  ): Promise<ReportSchedule | null> {
    return this.reportScheduler.updateSchedule(scheduleId, updates);
  }
  
  async deleteSchedule(scheduleId: string): Promise<boolean> {
    return this.reportScheduler.deleteSchedule(scheduleId);
  }
  
  getSchedule(scheduleId: string): ReportSchedule | null {
    return this.reportScheduler.getSchedule(scheduleId);
  }
  
  getAllSchedules(): ReportSchedule[] {
    return this.reportScheduler.getAllSchedules();
  }
  
  async runScheduleNow(scheduleId: string): Promise<ReportResult> {
    return this.reportScheduler.runScheduleNow(scheduleId);
  }

  /**
   * 템플릿 관리
   */
  
  async createTemplate(
    name: string,
    description: string,
    type: ReportType,
    defaultConfig: ReportConfig,
    createdBy?: string,
    isPublic?: boolean
  ): Promise<ReportTemplate> {
    return this.templateManager.createTemplate(
      name,
      description,
      type,
      defaultConfig,
      createdBy,
      isPublic
    );
  }
  
  async updateTemplate(
    templateId: string,
    updates: Partial<ReportTemplate>
  ): Promise<ReportTemplate | null> {
    return this.templateManager.updateTemplate(templateId, updates);
  }
  
  async deleteTemplate(templateId: string): Promise<boolean> {
    return this.templateManager.deleteTemplate(templateId);
  }
  
  getTemplate(templateId: string): ReportTemplate | null {
    return this.templateManager.getTemplate(templateId);
  }
  
  getAllTemplates(filters?: any): ReportTemplate[] {
    return this.templateManager.getAllTemplates(filters);
  }
  
  async cloneTemplate(
    templateId: string,
    newName: string,
    createdBy: string
  ): Promise<ReportTemplate | null> {
    return this.templateManager.cloneTemplate(templateId, newName, createdBy);
  }
  
  async exportTemplate(templateId: string): Promise<string | null> {
    return this.templateManager.exportTemplate(templateId);
  }
  
  async importTemplate(
    templateData: string,
    createdBy: string
  ): Promise<ReportTemplate> {
    return this.templateManager.importTemplate(templateData, createdBy);
  }

  /**
   * 보고서 배포
   */
  
  async deliverReport(
    report: ReportResult,
    configs: DeliveryConfig[]
  ): Promise<any> {
    return this.reportDelivery.deliver(report, configs);
  }

  /**
   * 시스템 상태
   */
  
  getSystemStatus(): {
    enabled: boolean;
    schedules: {
      total: number;
      active: number;
      running: number;
    };
    templates: {
      total: number;
      system: number;
      user: number;
    };
    recent: {
      generated: number;
      delivered: number;
      failed: number;
    };
  } {
    const schedules = this.getAllSchedules();
    const templates = this.getAllTemplates();
    
    return {
      enabled: this.config.enabled || false,
      schedules: {
        total: schedules.length,
        active: schedules.filter(s => s.enabled).length,
        running: 0 // 실제 구현에서는 실행 중인 스케줄 확인
      },
      templates: {
        total: templates.length,
        system: templates.filter(t => t.createdBy === 'system').length,
        user: templates.filter(t => t.createdBy !== 'system').length
      },
      recent: {
        generated: 0, // 실제 구현에서는 최근 통계 확인
        delivered: 0,
        failed: 0
      }
    };
  }

  /**
   * 빠른 스케줄 생성 헬퍼
   */
  
  async createDailySchedule(
    name: string,
    time: string,
    deliveryConfigs?: DeliveryConfig[],
    createdBy?: string
  ): Promise<ReportSchedule> {
    const template = this.getAllTemplates({
      type: ReportType.DAILY,
      createdBy: 'system'
    })[0];
    
    if (!template) {
      throw new Error('Daily report template not found');
    }
    
    const config = this.templateManager.createConfigFromTemplate(template.id);
    if (!config) {
      throw new Error('Failed to create config from template');
    }
    
    if (deliveryConfigs) {
      config.deliveryChannels = deliveryConfigs;
    }
    
    return this.createSchedule(
      name,
      config,
      { type: 'daily', time },
      createdBy
    );
  }
  
  async createWeeklySchedule(
    name: string,
    dayOfWeek: number,
    time: string,
    deliveryConfigs?: DeliveryConfig[],
    createdBy?: string
  ): Promise<ReportSchedule> {
    const template = this.getAllTemplates({
      type: ReportType.WEEKLY,
      createdBy: 'system'
    })[0];
    
    if (!template) {
      throw new Error('Weekly report template not found');
    }
    
    const config = this.templateManager.createConfigFromTemplate(template.id);
    if (!config) {
      throw new Error('Failed to create config from template');
    }
    
    if (deliveryConfigs) {
      config.deliveryChannels = deliveryConfigs;
    }
    
    return this.createSchedule(
      name,
      config,
      { type: 'weekly', dayOfWeek, time },
      createdBy
    );
  }
  
  async createMonthlySchedule(
    name: string,
    dayOfMonth: number,
    time: string,
    deliveryConfigs?: DeliveryConfig[],
    createdBy?: string
  ): Promise<ReportSchedule> {
    const template = this.getAllTemplates({
      type: ReportType.MONTHLY,
      createdBy: 'system'
    })[0];
    
    if (!template) {
      throw new Error('Monthly report template not found');
    }
    
    const config = this.templateManager.createConfigFromTemplate(template.id);
    if (!config) {
      throw new Error('Failed to create config from template');
    }
    
    if (deliveryConfigs) {
      config.deliveryChannels = deliveryConfigs;
    }
    
    return this.createSchedule(
      name,
      config,
      { type: 'monthly', dayOfMonth, time },
      createdBy
    );
  }

  /**
   * 시스템 종료
   */
  async shutdown(): Promise<void> {
    await this.reportScheduler.shutdown();
    this.logger.info('Report system shut down');
  }
}

// 타입 재내보내기
export * from './types.js';
export { ReportEngine, ReportScheduler, ReportDelivery, TemplateManager, PDFGenerator };