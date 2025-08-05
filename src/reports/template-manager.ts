/**
 * DevFlow Monitor MCP - 보고서 템플릿 관리자
 * 
 * 보고서 템플릿을 관리하고 제공하는 시스템입니다.
 */

import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../utils/logger.js';
import {
  ReportTemplate,
  ReportType,
  ReportConfig,
  ReportSection,
  ReportSectionType,
  ReportFormat,
  DeliveryChannel
} from './types.js';

/**
 * 템플릿 관리자 설정
 */
export interface TemplateManagerConfig {
  /** 템플릿 저장 경로 */
  templatesPath: string;
  
  /** 기본 템플릿 활성화 */
  enableDefaultTemplates?: boolean;
  
  /** 템플릿 캐시 활성화 */
  enableCache?: boolean;
  
  /** 캐시 TTL (밀리초) */
  cacheTTL?: number;
}

/**
 * 보고서 템플릿 관리자
 */
export class TemplateManager extends EventEmitter {
  private logger: Logger;
  private config: Required<TemplateManagerConfig>;
  private templates: Map<string, ReportTemplate>;
  private templateCache: Map<string, { template: ReportTemplate; timestamp: number }>;
  
  constructor(config: TemplateManagerConfig) {
    super();
    this.logger = new Logger('TemplateManager');
    this.config = {
      enableDefaultTemplates: true,
      enableCache: true,
      cacheTTL: 3600000, // 1시간
      ...config
    };
    
    this.templates = new Map();
    this.templateCache = new Map();
    
    this.initialize();
  }

  /**
   * 초기화
   */
  private async initialize(): Promise<void> {
    try {
      // 템플릿 디렉토리 확인
      await this.ensureTemplateDirectory();
      
      // 기본 템플릿 생성
      if (this.config.enableDefaultTemplates) {
        await this.createDefaultTemplates();
      }
      
      // 저장된 템플릿 로드
      await this.loadTemplates();
      
      // 캐시 정리 스케줄
      if (this.config.enableCache) {
        setInterval(() => this.cleanupCache(), 60000); // 1분마다
      }
      
      this.logger.info('Template manager initialized', {
        templatesCount: this.templates.size
      });
    } catch (error) {
      this.logger.error('Failed to initialize template manager', error);
    }
  }

  /**
   * 템플릿 디렉토리 확인
   */
  private async ensureTemplateDirectory(): Promise<void> {
    try {
      await fs.access(this.config.templatesPath);
    } catch {
      await fs.mkdir(this.config.templatesPath, { recursive: true });
    }
  }

  /**
   * 기본 템플릿 생성
   */
  private async createDefaultTemplates(): Promise<void> {
    const defaultTemplates: Array<{
      name: string;
      description: string;
      type: ReportType;
      config: ReportConfig;
    }> = [
      {
        name: 'Daily Development Report',
        description: 'Comprehensive daily report for development activities',
        type: ReportType.DAILY,
        config: this.createDailyReportConfig()
      },
      {
        name: 'Weekly Team Summary',
        description: 'Weekly summary of team productivity and progress',
        type: ReportType.WEEKLY,
        config: this.createWeeklyReportConfig()
      },
      {
        name: 'Monthly Performance Analysis',
        description: 'In-depth monthly performance and quality analysis',
        type: ReportType.MONTHLY,
        config: this.createMonthlyReportConfig()
      },
      {
        name: 'Methodology Compliance Report',
        description: 'Analysis of development methodology compliance',
        type: ReportType.METHODOLOGY,
        config: this.createMethodologyReportConfig()
      },
      {
        name: 'AI Collaboration Analysis',
        description: 'Detailed analysis of AI tool usage and effectiveness',
        type: ReportType.AI_USAGE,
        config: this.createAIUsageReportConfig()
      }
    ];
    
    for (const templateData of defaultTemplates) {
      const existing = Array.from(this.templates.values()).find(
        t => t.name === templateData.name && t.type === templateData.type
      );
      
      if (!existing) {
        await this.createTemplate(
          templateData.name,
          templateData.description,
          templateData.type,
          templateData.config,
          'system',
          true
        );
      }
    }
  }

  /**
   * 일일 보고서 설정 생성
   */
  private createDailyReportConfig(): ReportConfig {
    return {
      type: ReportType.DAILY,
      sections: [
        {
          id: 'executive-summary',
          name: 'Executive Summary',
          type: ReportSectionType.EXECUTIVE_SUMMARY,
          enabled: true,
          order: 1
        },
        {
          id: 'activity-timeline',
          name: 'Activity Timeline',
          type: ReportSectionType.ACTIVITY_TIMELINE,
          enabled: true,
          order: 2
        },
        {
          id: 'development-stages',
          name: 'Development Progress',
          type: ReportSectionType.DEVELOPMENT_STAGES,
          enabled: true,
          order: 3
        },
        {
          id: 'bottlenecks',
          name: 'Bottleneck Analysis',
          type: ReportSectionType.BOTTLENECK_ANALYSIS,
          enabled: true,
          order: 4
        },
        {
          id: 'recommendations',
          name: 'Recommendations',
          type: ReportSectionType.RECOMMENDATIONS,
          enabled: true,
          order: 5
        }
      ],
      formats: [ReportFormat.HTML, ReportFormat.PDF],
      deliveryChannels: [],
      parameters: {
        includeCharts: true,
        includeTables: true,
        maxEvents: 100
      }
    };
  }

  /**
   * 주간 보고서 설정 생성
   */
  private createWeeklyReportConfig(): ReportConfig {
    return {
      type: ReportType.WEEKLY,
      sections: [
        {
          id: 'executive-summary',
          name: 'Executive Summary',
          type: ReportSectionType.EXECUTIVE_SUMMARY,
          enabled: true,
          order: 1
        },
        {
          id: 'metrics-overview',
          name: 'Metrics Overview',
          type: ReportSectionType.METRICS_OVERVIEW,
          enabled: true,
          order: 2
        },
        {
          id: 'team-productivity',
          name: 'Team Productivity',
          type: ReportSectionType.TEAM_PRODUCTIVITY,
          enabled: true,
          order: 3
        },
        {
          id: 'quality-metrics',
          name: 'Quality Metrics',
          type: ReportSectionType.QUALITY_METRICS,
          enabled: true,
          order: 4
        },
        {
          id: 'performance-trends',
          name: 'Performance Trends',
          type: ReportSectionType.PERFORMANCE_TRENDS,
          enabled: true,
          order: 5
        },
        {
          id: 'recommendations',
          name: 'Recommendations',
          type: ReportSectionType.RECOMMENDATIONS,
          enabled: true,
          order: 6
        }
      ],
      formats: [ReportFormat.HTML, ReportFormat.PDF, ReportFormat.MARKDOWN],
      deliveryChannels: [],
      parameters: {
        includeCharts: true,
        includeTables: true,
        compareWithPrevious: true
      }
    };
  }

  /**
   * 월간 보고서 설정 생성
   */
  private createMonthlyReportConfig(): ReportConfig {
    return {
      type: ReportType.MONTHLY,
      sections: [
        {
          id: 'executive-summary',
          name: 'Executive Summary',
          type: ReportSectionType.EXECUTIVE_SUMMARY,
          enabled: true,
          order: 1
        },
        {
          id: 'metrics-overview',
          name: 'Comprehensive Metrics',
          type: ReportSectionType.METRICS_OVERVIEW,
          enabled: true,
          order: 2
        },
        {
          id: 'methodology-compliance',
          name: 'Methodology Compliance',
          type: ReportSectionType.METHODOLOGY_COMPLIANCE,
          enabled: true,
          order: 3
        },
        {
          id: 'ai-collaboration',
          name: 'AI Tool Usage',
          type: ReportSectionType.AI_COLLABORATION,
          enabled: true,
          order: 4
        },
        {
          id: 'quality-metrics',
          name: 'Quality Analysis',
          type: ReportSectionType.QUALITY_METRICS,
          enabled: true,
          order: 5
        },
        {
          id: 'performance-trends',
          name: 'Performance Trends',
          type: ReportSectionType.PERFORMANCE_TRENDS,
          enabled: true,
          order: 6
        },
        {
          id: 'team-productivity',
          name: 'Team Performance',
          type: ReportSectionType.TEAM_PRODUCTIVITY,
          enabled: true,
          order: 7
        },
        {
          id: 'bottlenecks',
          name: 'Bottleneck Analysis',
          type: ReportSectionType.BOTTLENECK_ANALYSIS,
          enabled: true,
          order: 8
        },
        {
          id: 'recommendations',
          name: 'Strategic Recommendations',
          type: ReportSectionType.RECOMMENDATIONS,
          enabled: true,
          order: 9
        }
      ],
      formats: [ReportFormat.PDF, ReportFormat.HTML],
      deliveryChannels: [],
      parameters: {
        includeCharts: true,
        includeTables: true,
        includeComparison: true,
        detailLevel: 'high'
      }
    };
  }

  /**
   * 방법론 보고서 설정 생성
   */
  private createMethodologyReportConfig(): ReportConfig {
    return {
      type: ReportType.METHODOLOGY,
      sections: [
        {
          id: 'executive-summary',
          name: 'Executive Summary',
          type: ReportSectionType.EXECUTIVE_SUMMARY,
          enabled: true,
          order: 1
        },
        {
          id: 'methodology-compliance',
          name: 'Methodology Compliance Analysis',
          type: ReportSectionType.METHODOLOGY_COMPLIANCE,
          enabled: true,
          order: 2,
          config: {
            methodologies: ['DDD', 'TDD', 'BDD', 'EDA'],
            includeDetails: true,
            includeHistory: true
          }
        },
        {
          id: 'development-stages',
          name: 'Development Process Analysis',
          type: ReportSectionType.DEVELOPMENT_STAGES,
          enabled: true,
          order: 3
        },
        {
          id: 'recommendations',
          name: 'Improvement Recommendations',
          type: ReportSectionType.RECOMMENDATIONS,
          enabled: true,
          order: 4
        }
      ],
      formats: [ReportFormat.PDF, ReportFormat.MARKDOWN],
      deliveryChannels: [],
      parameters: {
        focusOnMethodology: true,
        includeExamples: true
      }
    };
  }

  /**
   * AI 사용 보고서 설정 생성
   */
  private createAIUsageReportConfig(): ReportConfig {
    return {
      type: ReportType.AI_USAGE,
      sections: [
        {
          id: 'executive-summary',
          name: 'Executive Summary',
          type: ReportSectionType.EXECUTIVE_SUMMARY,
          enabled: true,
          order: 1
        },
        {
          id: 'ai-collaboration',
          name: 'AI Collaboration Analysis',
          type: ReportSectionType.AI_COLLABORATION,
          enabled: true,
          order: 2,
          config: {
            includeTools: ['Claude', 'GitHub Copilot', 'ChatGPT', 'Cursor'],
            includeEffectiveness: true,
            includePatterns: true
          }
        },
        {
          id: 'metrics-overview',
          name: 'AI Usage Metrics',
          type: ReportSectionType.METRICS_OVERVIEW,
          enabled: true,
          order: 3
        },
        {
          id: 'performance-trends',
          name: 'AI Impact on Performance',
          type: ReportSectionType.PERFORMANCE_TRENDS,
          enabled: true,
          order: 4
        },
        {
          id: 'recommendations',
          name: 'AI Usage Recommendations',
          type: ReportSectionType.RECOMMENDATIONS,
          enabled: true,
          order: 5
        }
      ],
      formats: [ReportFormat.PDF, ReportFormat.HTML],
      deliveryChannels: [],
      parameters: {
        focusOnAI: true,
        includeROI: true
      }
    };
  }

  /**
   * 템플릿 생성
   */
  async createTemplate(
    name: string,
    description: string,
    type: ReportType,
    defaultConfig: ReportConfig,
    createdBy: string = 'user',
    isPublic: boolean = false,
    category?: string,
    tags: string[] = []
  ): Promise<ReportTemplate> {
    const template: ReportTemplate = {
      id: uuidv4(),
      name,
      description,
      type,
      defaultConfig,
      category,
      tags,
      public: isPublic,
      createdBy,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    // 저장
    this.templates.set(template.id, template);
    await this.saveTemplate(template);
    
    this.logger.info('Template created', {
      templateId: template.id,
      name: template.name,
      type: template.type
    });
    
    return template;
  }

  /**
   * 템플릿 업데이트
   */
  async updateTemplate(
    templateId: string,
    updates: Partial<ReportTemplate>
  ): Promise<ReportTemplate | null> {
    const template = this.templates.get(templateId);
    if (!template) {
      return null;
    }
    
    // 시스템 템플릿은 수정 불가
    if (template.createdBy === 'system') {
      throw new Error('Cannot modify system templates');
    }
    
    const updatedTemplate: ReportTemplate = {
      ...template,
      ...updates,
      id: template.id, // ID는 변경 불가
      createdBy: template.createdBy, // 생성자는 변경 불가
      createdAt: template.createdAt, // 생성 시간은 변경 불가
      updatedAt: Date.now()
    };
    
    // 저장
    this.templates.set(templateId, updatedTemplate);
    await this.saveTemplate(updatedTemplate);
    
    // 캐시 무효화
    this.templateCache.delete(templateId);
    
    this.logger.info('Template updated', { templateId });
    
    return updatedTemplate;
  }

  /**
   * 템플릿 삭제
   */
  async deleteTemplate(templateId: string): Promise<boolean> {
    const template = this.templates.get(templateId);
    if (!template) {
      return false;
    }
    
    // 시스템 템플릿은 삭제 불가
    if (template.createdBy === 'system') {
      throw new Error('Cannot delete system templates');
    }
    
    // 삭제
    this.templates.delete(templateId);
    await this.removeTemplate(templateId);
    
    // 캐시 무효화
    this.templateCache.delete(templateId);
    
    this.logger.info('Template deleted', { templateId });
    
    return true;
  }

  /**
   * 템플릿 조회
   */
  getTemplate(templateId: string): ReportTemplate | null {
    return this.templates.get(templateId) || null;
  }

  /**
   * 모든 템플릿 조회
   */
  getAllTemplates(filters?: {
    type?: ReportType;
    category?: string;
    tags?: string[];
    public?: boolean;
    createdBy?: string;
  }): ReportTemplate[] {
    let templates = Array.from(this.templates.values());
    
    if (filters) {
      if (filters.type) {
        templates = templates.filter(t => t.type === filters.type);
      }
      
      if (filters.category) {
        templates = templates.filter(t => t.category === filters.category);
      }
      
      if (filters.tags && filters.tags.length > 0) {
        templates = templates.filter(t => 
          filters.tags!.some(tag => t.tags.includes(tag))
        );
      }
      
      if (filters.public !== undefined) {
        templates = templates.filter(t => t.public === filters.public);
      }
      
      if (filters.createdBy) {
        templates = templates.filter(t => t.createdBy === filters.createdBy);
      }
    }
    
    return templates;
  }

  /**
   * 템플릿으로부터 설정 생성
   */
  createConfigFromTemplate(
    templateId: string,
    overrides?: Partial<ReportConfig>
  ): ReportConfig | null {
    const template = this.getTemplate(templateId);
    if (!template) {
      return null;
    }
    
    return {
      ...template.defaultConfig,
      ...overrides,
      templateId
    };
  }

  /**
   * 템플릿 복제
   */
  async cloneTemplate(
    templateId: string,
    newName: string,
    createdBy: string
  ): Promise<ReportTemplate | null> {
    const template = this.getTemplate(templateId);
    if (!template) {
      return null;
    }
    
    return this.createTemplate(
      newName,
      `Clone of ${template.description || template.name}`,
      template.type,
      { ...template.defaultConfig },
      createdBy,
      false,
      template.category,
      [...template.tags, 'cloned']
    );
  }

  /**
   * 템플릿 내보내기
   */
  async exportTemplate(templateId: string): Promise<string | null> {
    const template = this.getTemplate(templateId);
    if (!template) {
      return null;
    }
    
    // 민감한 정보 제거
    const exportData = {
      ...template,
      id: undefined,
      createdBy: undefined,
      createdAt: undefined,
      updatedAt: undefined
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * 템플릿 가져오기
   */
  async importTemplate(
    templateData: string,
    createdBy: string
  ): Promise<ReportTemplate> {
    const data = JSON.parse(templateData);
    
    if (!data.name || !data.type || !data.defaultConfig) {
      throw new Error('Invalid template data');
    }
    
    return this.createTemplate(
      data.name,
      data.description || '',
      data.type,
      data.defaultConfig,
      createdBy,
      false,
      data.category,
      data.tags || []
    );
  }

  /**
   * 템플릿 저장
   */
  private async saveTemplate(template: ReportTemplate): Promise<void> {
    const filename = `${template.id}.json`;
    const filepath = path.join(this.config.templatesPath, filename);
    
    await fs.writeFile(filepath, JSON.stringify(template, null, 2));
  }

  /**
   * 템플릿 제거
   */
  private async removeTemplate(templateId: string): Promise<void> {
    const filename = `${templateId}.json`;
    const filepath = path.join(this.config.templatesPath, filename);
    
    try {
      await fs.unlink(filepath);
    } catch (error) {
      this.logger.warn('Failed to remove template file', { templateId, error });
    }
  }

  /**
   * 템플릿 로드
   */
  private async loadTemplates(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.templatesPath);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      for (const file of jsonFiles) {
        try {
          const filepath = path.join(this.config.templatesPath, file);
          const content = await fs.readFile(filepath, 'utf-8');
          const template = JSON.parse(content) as ReportTemplate;
          
          this.templates.set(template.id, template);
        } catch (error) {
          this.logger.error(`Failed to load template ${file}`, error);
        }
      }
      
      this.logger.info(`Loaded ${this.templates.size} templates`);
    } catch (error) {
      this.logger.error('Failed to load templates', error);
    }
  }

  /**
   * 캐시 정리
   */
  private cleanupCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, cached] of this.templateCache.entries()) {
      if (now - cached.timestamp > this.config.cacheTTL) {
        expiredKeys.push(key);
      }
    }
    
    for (const key of expiredKeys) {
      this.templateCache.delete(key);
    }
  }

  /**
   * 템플릿 검증
   */
  validateTemplate(template: ReportTemplate): string[] {
    const errors: string[] = [];
    
    if (!template.name || template.name.trim().length === 0) {
      errors.push('Template name is required');
    }
    
    if (!template.type) {
      errors.push('Template type is required');
    }
    
    if (!template.defaultConfig) {
      errors.push('Default configuration is required');
    } else {
      // 설정 검증
      if (!template.defaultConfig.sections || template.defaultConfig.sections.length === 0) {
        errors.push('At least one section is required');
      }
      
      if (!template.defaultConfig.formats || template.defaultConfig.formats.length === 0) {
        errors.push('At least one format is required');
      }
    }
    
    return errors;
  }

  /**
   * 카테고리 목록 조회
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    
    for (const template of this.templates.values()) {
      if (template.category) {
        categories.add(template.category);
      }
    }
    
    return Array.from(categories).sort();
  }

  /**
   * 태그 목록 조회
   */
  getTags(): string[] {
    const tags = new Set<string>();
    
    for (const template of this.templates.values()) {
      template.tags.forEach(tag => tags.add(tag));
    }
    
    return Array.from(tags).sort();
  }
}