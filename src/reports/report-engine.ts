/**
 * DevFlow Monitor MCP - 보고서 엔진
 * 
 * 다양한 형식의 보고서를 생성하는 핵심 엔진입니다.
 */

import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Logger } from '../utils/logger.js';
import {
  ReportType,
  ReportFormat,
  ReportStatus,
  ReportMetadata,
  ReportConfig,
  ReportSection,
  ReportSectionType,
  ReportFilters,
  ReportData,
  ReportResult,
  GeneratedFile,
  ReportEvent,
  ReportEventType,
  ChartData,
  TableData
} from './types.js';
import { MetricsCollector } from '../analyzers/metrics-collector.js';
import { MethodologyAnalyzer } from '../analyzers/methodology-analyzer.js';
import { AIMonitor } from '../analyzers/ai-monitor.js';
import { BottleneckDetector } from '../analyzers/bottleneck-detector.js';
import { StageAnalyzer } from '../analyzers/stage-analyzer.js';
import { EventEngine } from '../events/engine.js';
import { StorageManager } from '../storage/index.js';

/**
 * 보고서 엔진 설정
 */
export interface ReportEngineConfig {
  /** 보고서 저장 경로 */
  reportsPath: string;
  
  /** 템플릿 경로 */
  templatesPath: string;
  
  /** 임시 파일 경로 */
  tempPath: string;
  
  /** 최대 동시 생성 수 */
  maxConcurrentGenerations?: number;
  
  /** 타임아웃 (밀리초) */
  generationTimeout?: number;
  
  /** 캐시 활성화 */
  enableCache?: boolean;
  
  /** 캐시 TTL (밀리초) */
  cacheTTL?: number;
}

/**
 * 보고서 엔진
 */
export class ReportEngine extends EventEmitter {
  private logger: Logger;
  private config: Required<ReportEngineConfig>;
  private generationQueue: Map<string, Promise<ReportResult>>;
  private reportCache: Map<string, { result: ReportResult; timestamp: number }>;
  
  // 의존성
  private metricsCollector: MetricsCollector;
  private methodologyAnalyzer: MethodologyAnalyzer;
  private aiMonitor: AIMonitor;
  private bottleneckDetector: BottleneckDetector;
  private stageAnalyzer: StageAnalyzer;
  private eventEngine: EventEngine;
  private storageManager: StorageManager;

  constructor(
    config: ReportEngineConfig,
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
    this.logger = new Logger('ReportEngine');
    this.config = {
      maxConcurrentGenerations: 3,
      generationTimeout: 300000, // 5분
      enableCache: true,
      cacheTTL: 3600000, // 1시간
      ...config
    };
    
    this.generationQueue = new Map();
    this.reportCache = new Map();
    
    // 의존성 주입
    this.metricsCollector = dependencies.metricsCollector;
    this.methodologyAnalyzer = dependencies.methodologyAnalyzer;
    this.aiMonitor = dependencies.aiMonitor;
    this.bottleneckDetector = dependencies.bottleneckDetector;
    this.stageAnalyzer = dependencies.stageAnalyzer;
    this.eventEngine = dependencies.eventEngine;
    this.storageManager = dependencies.storageManager;
    
    this.initializeEngine();
  }

  /**
   * 엔진 초기화
   */
  private async initializeEngine(): Promise<void> {
    try {
      // 디렉토리 생성
      await this.ensureDirectories();
      
      // 캐시 정리 스케줄
      if (this.config.enableCache) {
        setInterval(() => this.cleanupCache(), 60000); // 1분마다
      }
      
      this.logger.info('Report engine initialized');
    } catch (error) {
      this.logger.error('Failed to initialize report engine', error);
      throw error;
    }
  }

  /**
   * 디렉토리 확인 및 생성
   */
  private async ensureDirectories(): Promise<void> {
    const dirs = [
      this.config.reportsPath,
      this.config.templatesPath,
      this.config.tempPath
    ];
    
    for (const dir of dirs) {
      try {
        await fs.access(dir);
      } catch {
        await fs.mkdir(dir, { recursive: true });
      }
    }
  }

  /**
   * 보고서 생성
   */
  async generateReport(
    config: ReportConfig,
    projectIds: string[] = [],
    periodStart?: number,
    periodEnd?: number
  ): Promise<ReportResult> {
    const reportId = uuidv4();
    const now = Date.now();
    
    // 캐시 확인
    if (this.config.enableCache) {
      const cacheKey = this.getCacheKey(config, projectIds, periodStart, periodEnd);
      const cached = this.reportCache.get(cacheKey);
      
      if (cached && (now - cached.timestamp) < this.config.cacheTTL) {
        this.logger.debug('Returning cached report', { reportId });
        return cached.result;
      }
    }
    
    // 동시 생성 제한 확인
    if (this.generationQueue.size >= this.config.maxConcurrentGenerations) {
      throw new Error('Maximum concurrent report generations reached');
    }
    
    // 메타데이터 생성
    const metadata: ReportMetadata = {
      id: reportId,
      type: config.type,
      title: this.generateTitle(config),
      description: config.parameters?.description,
      createdAt: now,
      updatedAt: now,
      status: ReportStatus.PENDING,
      periodStart: periodStart || now - 86400000, // 기본 24시간
      periodEnd: periodEnd || now,
      projectIds,
      createdBy: config.parameters?.createdBy || 'system',
      tags: config.parameters?.tags || []
    };
    
    // 생성 프로미스 생성
    const generationPromise = this.doGenerateReport(metadata, config);
    this.generationQueue.set(reportId, generationPromise);
    
    try {
      const result = await generationPromise;
      
      // 캐시 저장
      if (this.config.enableCache) {
        const cacheKey = this.getCacheKey(config, projectIds, periodStart, periodEnd);
        this.reportCache.set(cacheKey, { result, timestamp: now });
      }
      
      return result;
    } finally {
      this.generationQueue.delete(reportId);
    }
  }

  /**
   * 실제 보고서 생성 로직
   */
  private async doGenerateReport(
    metadata: ReportMetadata,
    config: ReportConfig
  ): Promise<ReportResult> {
    const startTime = Date.now();
    
    try {
      // 상태 업데이트
      metadata.status = ReportStatus.GENERATING;
      this.emitReportEvent(ReportEventType.GENERATION_STARTED, metadata.id);
      
      // 데이터 수집
      const data = await this.collectReportData(metadata, config);
      
      // 보고서 생성
      const files: GeneratedFile[] = [];
      
      for (const format of config.formats) {
        const file = await this.generateReportFile(metadata, config, data, format);
        files.push(file);
      }
      
      // 결과 생성
      const result: ReportResult = {
        metadata: {
          ...metadata,
          status: ReportStatus.COMPLETED,
          updatedAt: Date.now()
        },
        files,
        generationTime: Date.now() - startTime,
        warnings: []
      };
      
      // 완료 이벤트
      this.emitReportEvent(ReportEventType.GENERATION_COMPLETED, metadata.id, result);
      
      return result;
    } catch (error) {
      // 실패 처리
      metadata.status = ReportStatus.FAILED;
      metadata.updatedAt = Date.now();
      
      const result: ReportResult = {
        metadata,
        files: [],
        generationTime: Date.now() - startTime,
        error: error.message
      };
      
      this.emitReportEvent(ReportEventType.GENERATION_FAILED, metadata.id, result);
      
      throw error;
    }
  }

  /**
   * 보고서 데이터 수집
   */
  private async collectReportData(
    metadata: ReportMetadata,
    config: ReportConfig
  ): Promise<ReportData> {
    const data: ReportData = {
      metrics: {},
      events: [],
      analysis: {},
      charts: [],
      tables: [],
      custom: {}
    };
    
    // 섹션별 데이터 수집
    for (const section of config.sections.filter(s => s.enabled)) {
      await this.collectSectionData(section, metadata, config, data);
    }
    
    return data;
  }

  /**
   * 섹션 데이터 수집
   */
  private async collectSectionData(
    section: ReportSection,
    metadata: ReportMetadata,
    config: ReportConfig,
    data: ReportData
  ): Promise<void> {
    switch (section.type) {
      case ReportSectionType.EXECUTIVE_SUMMARY:
        await this.collectExecutiveSummary(metadata, config, data);
        break;
        
      case ReportSectionType.METRICS_OVERVIEW:
        await this.collectMetricsOverview(metadata, config, data);
        break;
        
      case ReportSectionType.ACTIVITY_TIMELINE:
        await this.collectActivityTimeline(metadata, config, data);
        break;
        
      case ReportSectionType.DEVELOPMENT_STAGES:
        await this.collectDevelopmentStages(metadata, config, data);
        break;
        
      case ReportSectionType.METHODOLOGY_COMPLIANCE:
        await this.collectMethodologyCompliance(metadata, config, data);
        break;
        
      case ReportSectionType.AI_COLLABORATION:
        await this.collectAICollaboration(metadata, config, data);
        break;
        
      case ReportSectionType.BOTTLENECK_ANALYSIS:
        await this.collectBottleneckAnalysis(metadata, config, data);
        break;
        
      case ReportSectionType.PERFORMANCE_TRENDS:
        await this.collectPerformanceTrends(metadata, config, data);
        break;
        
      case ReportSectionType.QUALITY_METRICS:
        await this.collectQualityMetrics(metadata, config, data);
        break;
        
      case ReportSectionType.TEAM_PRODUCTIVITY:
        await this.collectTeamProductivity(metadata, config, data);
        break;
        
      case ReportSectionType.RECOMMENDATIONS:
        await this.collectRecommendations(metadata, config, data);
        break;
        
      case ReportSectionType.CUSTOM:
        await this.collectCustomSection(section, metadata, config, data);
        break;
    }
  }

  /**
   * 경영진 요약 수집
   */
  private async collectExecutiveSummary(
    metadata: ReportMetadata,
    config: ReportConfig,
    data: ReportData
  ): Promise<void> {
    const metrics = await this.metricsCollector.getSnapshot();
    const bottlenecks = await this.bottleneckDetector.detectBottlenecks();
    
    data.analysis.executiveSummary = {
      totalEvents: metrics.totalEvents,
      activeUsers: metrics.uniqueUsers?.size || 0,
      productivityScore: metrics.scores?.productivity || 0,
      qualityScore: metrics.scores?.quality || 0,
      criticalBottlenecks: bottlenecks.filter(b => b.severity === 'critical').length,
      keyHighlights: this.generateKeyHighlights(metrics, bottlenecks)
    };
  }

  /**
   * 메트릭 개요 수집
   */
  private async collectMetricsOverview(
    metadata: ReportMetadata,
    config: ReportConfig,
    data: ReportData
  ): Promise<void> {
    const metrics = await this.metricsCollector.getMetrics(
      metadata.periodStart,
      metadata.periodEnd
    );
    
    data.metrics = metrics;
    
    // 메트릭 차트 생성
    data.charts.push({
      id: 'metrics-timeline',
      type: 'line',
      title: 'Metrics Timeline',
      series: this.createMetricsTimeSeries(metrics),
      options: {
        xAxis: { type: 'datetime' },
        yAxis: { title: 'Value' }
      }
    });
  }

  /**
   * 활동 타임라인 수집
   */
  private async collectActivityTimeline(
    metadata: ReportMetadata,
    config: ReportConfig,
    data: ReportData
  ): Promise<void> {
    const events = await this.eventEngine.queryEvents({
      startTime: metadata.periodStart,
      endTime: metadata.periodEnd,
      categories: config.filters?.eventCategories,
      severities: config.filters?.eventSeverities,
      limit: 1000
    });
    
    data.events = events;
    
    // 활동 차트 생성
    data.charts.push({
      id: 'activity-heatmap',
      type: 'heatmap',
      title: 'Activity Heatmap',
      series: this.createActivityHeatmap(events),
      options: {
        xAxis: { type: 'datetime' },
        yAxis: { type: 'category' }
      }
    });
  }

  /**
   * 개발 단계 수집
   */
  private async collectDevelopmentStages(
    metadata: ReportMetadata,
    config: ReportConfig,
    data: ReportData
  ): Promise<void> {
    const stageAnalysis = await this.stageAnalyzer.analyzeStage();
    
    data.analysis.developmentStages = stageAnalysis;
    
    // 단계 진행률 차트
    data.charts.push({
      id: 'stage-progress',
      type: 'bar',
      title: 'Stage Progress',
      series: [{
        name: 'Progress',
        data: stageAnalysis.stages.map(s => ({
          x: s.name,
          y: s.progress
        }))
      }],
      options: {
        xAxis: { type: 'category' },
        yAxis: { max: 100 }
      }
    });
  }

  /**
   * 방법론 준수도 수집
   */
  private async collectMethodologyCompliance(
    metadata: ReportMetadata,
    config: ReportConfig,
    data: ReportData
  ): Promise<void> {
    const methodologyScores = await this.methodologyAnalyzer.checkMethodology();
    
    data.analysis.methodologyCompliance = methodologyScores;
    
    // 방법론 점수 차트
    data.charts.push({
      id: 'methodology-scores',
      type: 'donut',
      title: 'Methodology Compliance',
      series: Object.entries(methodologyScores.scores).map(([method, score]) => ({
        name: method.toUpperCase(),
        value: score
      })),
      options: {
        legend: { position: 'right' }
      }
    });
  }

  /**
   * AI 협업 수집
   */
  private async collectAICollaboration(
    metadata: ReportMetadata,
    config: ReportConfig,
    data: ReportData
  ): Promise<void> {
    const aiAnalysis = await this.aiMonitor.analyzeAICollaboration(
      metadata.periodStart,
      metadata.periodEnd
    );
    
    data.analysis.aiCollaboration = aiAnalysis;
    
    // AI 사용 차트
    data.charts.push({
      id: 'ai-usage',
      type: 'area',
      title: 'AI Tool Usage',
      series: this.createAIUsageTimeSeries(aiAnalysis),
      options: {
        xAxis: { type: 'datetime' },
        yAxis: { title: 'Sessions' },
        stacked: true
      }
    });
  }

  /**
   * 병목 분석 수집
   */
  private async collectBottleneckAnalysis(
    metadata: ReportMetadata,
    config: ReportConfig,
    data: ReportData
  ): Promise<void> {
    const bottlenecks = await this.bottleneckDetector.detectBottlenecks();
    
    data.analysis.bottlenecks = bottlenecks;
    
    // 병목 테이블
    data.tables.push({
      id: 'bottleneck-list',
      title: 'Detected Bottlenecks',
      columns: [
        { key: 'type', title: 'Type', sortable: true },
        { key: 'severity', title: 'Severity', sortable: true },
        { key: 'description', title: 'Description' },
        { key: 'impact', title: 'Impact', type: 'number', sortable: true }
      ],
      rows: bottlenecks.map(b => ({
        type: b.type,
        severity: b.severity,
        description: b.description,
        impact: b.score
      }))
    });
  }

  /**
   * 성능 트렌드 수집
   */
  private async collectPerformanceTrends(
    metadata: ReportMetadata,
    config: ReportConfig,
    data: ReportData
  ): Promise<void> {
    const trends = await this.metricsCollector.getMetrics(
      metadata.periodStart,
      metadata.periodEnd
    );
    
    data.analysis.performanceTrends = {
      buildTime: this.calculateTrend(trends, 'buildTime'),
      testTime: this.calculateTrend(trends, 'testTime'),
      deploymentFrequency: this.calculateTrend(trends, 'deploymentFrequency'),
      leadTime: this.calculateTrend(trends, 'leadTime')
    };
  }

  /**
   * 품질 메트릭 수집
   */
  private async collectQualityMetrics(
    metadata: ReportMetadata,
    config: ReportConfig,
    data: ReportData
  ): Promise<void> {
    const metrics = await this.metricsCollector.getSnapshot();
    
    data.analysis.qualityMetrics = {
      testCoverage: metrics.averageTestCoverage || 0,
      codeReviewRate: metrics.codeReviewRate || 0,
      bugDensity: metrics.bugDensity || 0,
      technicalDebt: metrics.technicalDebt || 0
    };
    
    // 품질 트렌드 차트
    data.charts.push({
      id: 'quality-trends',
      type: 'line',
      title: 'Quality Trends',
      series: [
        { name: 'Test Coverage', data: [] },
        { name: 'Code Review Rate', data: [] },
        { name: 'Bug Density', data: [] }
      ],
      options: {
        xAxis: { type: 'datetime' },
        yAxis: { title: 'Percentage' }
      }
    });
  }

  /**
   * 팀 생산성 수집
   */
  private async collectTeamProductivity(
    metadata: ReportMetadata,
    config: ReportConfig,
    data: ReportData
  ): Promise<void> {
    const metrics = await this.metricsCollector.getSnapshot();
    
    data.analysis.teamProductivity = {
      averageVelocity: metrics.averageVelocity || 0,
      cycleTime: metrics.cycleTime || 0,
      throughput: metrics.throughput || 0,
      collaborationScore: metrics.collaborationScore || 0
    };
  }

  /**
   * 권장사항 수집
   */
  private async collectRecommendations(
    metadata: ReportMetadata,
    config: ReportConfig,
    data: ReportData
  ): Promise<void> {
    const bottlenecks = await this.bottleneckDetector.detectBottlenecks();
    const methodologyScores = await this.methodologyAnalyzer.checkMethodology();
    
    data.analysis.recommendations = this.generateRecommendations(
      bottlenecks,
      methodologyScores,
      data.metrics
    );
  }

  /**
   * 커스텀 섹션 수집
   */
  private async collectCustomSection(
    section: ReportSection,
    metadata: ReportMetadata,
    config: ReportConfig,
    data: ReportData
  ): Promise<void> {
    // 커스텀 섹션 처리 로직
    if (section.config?.handler) {
      const handler = section.config.handler;
      if (typeof handler === 'function') {
        const customData = await handler(metadata, config, this);
        data.custom[section.id] = customData;
      }
    }
  }

  /**
   * 보고서 파일 생성
   */
  private async generateReportFile(
    metadata: ReportMetadata,
    config: ReportConfig,
    data: ReportData,
    format: ReportFormat
  ): Promise<GeneratedFile> {
    const filename = this.generateFilename(metadata, format);
    const filepath = path.join(this.config.reportsPath, filename);
    
    let content: Buffer;
    let mimeType: string;
    
    switch (format) {
      case ReportFormat.HTML:
        content = await this.generateHTMLReport(metadata, config, data);
        mimeType = 'text/html';
        break;
        
      case ReportFormat.MARKDOWN:
        content = await this.generateMarkdownReport(metadata, config, data);
        mimeType = 'text/markdown';
        break;
        
      case ReportFormat.JSON:
        content = Buffer.from(JSON.stringify({ metadata, data }, null, 2));
        mimeType = 'application/json';
        break;
        
      case ReportFormat.PDF:
        // PDF 생성은 별도 구현 필요
        content = Buffer.from('PDF generation not implemented yet');
        mimeType = 'application/pdf';
        break;
        
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
    
    await fs.writeFile(filepath, content);
    
    const stats = await fs.stat(filepath);
    
    return {
      format,
      path: filepath,
      size: stats.size,
      mimeType
    };
  }

  /**
   * HTML 보고서 생성
   */
  private async generateHTMLReport(
    metadata: ReportMetadata,
    config: ReportConfig,
    data: ReportData
  ): Promise<Buffer> {
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${metadata.title}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1, h2, h3 { color: #333; }
        .section { margin: 30px 0; }
        .metric { display: inline-block; margin: 10px; padding: 10px; background: #f0f0f0; }
        .chart { margin: 20px 0; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        ${config.styling?.customCss || ''}
    </style>
</head>
<body>
    <h1>${metadata.title}</h1>
    <p>Period: ${new Date(metadata.periodStart).toLocaleDateString()} - ${new Date(metadata.periodEnd).toLocaleDateString()}</p>
`;

    // 섹션 렌더링
    for (const section of config.sections.filter(s => s.enabled)) {
      html += this.renderHTMLSection(section, data);
    }

    html += '</body></html>';
    
    return Buffer.from(html);
  }

  /**
   * Markdown 보고서 생성
   */
  private async generateMarkdownReport(
    metadata: ReportMetadata,
    config: ReportConfig,
    data: ReportData
  ): Promise<Buffer> {
    let markdown = `# ${metadata.title}\n\n`;
    markdown += `**Period**: ${new Date(metadata.periodStart).toLocaleDateString()} - ${new Date(metadata.periodEnd).toLocaleDateString()}\n\n`;
    
    // 섹션 렌더링
    for (const section of config.sections.filter(s => s.enabled)) {
      markdown += this.renderMarkdownSection(section, data);
    }
    
    return Buffer.from(markdown);
  }

  /**
   * HTML 섹션 렌더링
   */
  private renderHTMLSection(section: ReportSection, data: ReportData): string {
    let html = `<div class="section">\n<h2>${section.name}</h2>\n`;
    
    switch (section.type) {
      case ReportSectionType.EXECUTIVE_SUMMARY:
        if (data.analysis.executiveSummary) {
          const summary = data.analysis.executiveSummary;
          html += `
            <div class="metric">Total Events: ${summary.totalEvents}</div>
            <div class="metric">Active Users: ${summary.activeUsers}</div>
            <div class="metric">Productivity Score: ${summary.productivityScore.toFixed(1)}</div>
            <div class="metric">Quality Score: ${summary.qualityScore.toFixed(1)}</div>
          `;
        }
        break;
        
      // 다른 섹션 타입 렌더링...
    }
    
    html += '</div>\n';
    return html;
  }

  /**
   * Markdown 섹션 렌더링
   */
  private renderMarkdownSection(section: ReportSection, data: ReportData): string {
    let markdown = `## ${section.name}\n\n`;
    
    switch (section.type) {
      case ReportSectionType.EXECUTIVE_SUMMARY:
        if (data.analysis.executiveSummary) {
          const summary = data.analysis.executiveSummary;
          markdown += `- **Total Events**: ${summary.totalEvents}\n`;
          markdown += `- **Active Users**: ${summary.activeUsers}\n`;
          markdown += `- **Productivity Score**: ${summary.productivityScore.toFixed(1)}\n`;
          markdown += `- **Quality Score**: ${summary.qualityScore.toFixed(1)}\n\n`;
        }
        break;
        
      // 다른 섹션 타입 렌더링...
    }
    
    return markdown;
  }

  /**
   * 유틸리티 메서드들
   */
  
  private generateTitle(config: ReportConfig): string {
    const typeLabels: Record<ReportType, string> = {
      [ReportType.DAILY]: 'Daily Report',
      [ReportType.WEEKLY]: 'Weekly Report',
      [ReportType.MONTHLY]: 'Monthly Report',
      [ReportType.QUARTERLY]: 'Quarterly Report',
      [ReportType.CUSTOM]: 'Custom Report',
      [ReportType.INCIDENT]: 'Incident Report',
      [ReportType.PERFORMANCE]: 'Performance Report',
      [ReportType.METHODOLOGY]: 'Methodology Report',
      [ReportType.AI_USAGE]: 'AI Usage Report',
      [ReportType.CROSS_PROJECT]: 'Cross-Project Report'
    };
    
    return config.parameters?.title || typeLabels[config.type] || 'Report';
  }

  private generateFilename(metadata: ReportMetadata, format: ReportFormat): string {
    const date = new Date(metadata.createdAt).toISOString().split('T')[0];
    const type = metadata.type.replace(/_/g, '-');
    return `${type}-${date}-${metadata.id.slice(0, 8)}.${format}`;
  }

  private getCacheKey(
    config: ReportConfig,
    projectIds: string[],
    periodStart?: number,
    periodEnd?: number
  ): string {
    return `${config.type}-${projectIds.join(',')}-${periodStart}-${periodEnd}`;
  }

  private generateKeyHighlights(metrics: any, bottlenecks: any[]): string[] {
    const highlights: string[] = [];
    
    if (metrics.scores?.productivity > 80) {
      highlights.push('High productivity score indicates efficient development');
    }
    
    if (bottlenecks.filter(b => b.severity === 'critical').length > 0) {
      highlights.push('Critical bottlenecks detected requiring immediate attention');
    }
    
    if (metrics.averageTestCoverage < 60) {
      highlights.push('Test coverage below recommended threshold');
    }
    
    return highlights;
  }

  private createMetricsTimeSeries(metrics: any): any[] {
    // 실제 구현에서는 시계열 데이터를 생성
    return [];
  }

  private createActivityHeatmap(events: any[]): any[] {
    // 실제 구현에서는 히트맵 데이터를 생성
    return [];
  }

  private createAIUsageTimeSeries(analysis: any): any[] {
    // 실제 구현에서는 AI 사용 시계열 데이터를 생성
    return [];
  }

  private calculateTrend(data: any, metric: string): any {
    // 실제 구현에서는 트렌드를 계산
    return { value: 0, change: 0, trend: 'stable' };
  }

  private generateRecommendations(
    bottlenecks: any[],
    methodologyScores: any,
    metrics: any
  ): string[] {
    const recommendations: string[] = [];
    
    if (bottlenecks.some(b => b.type === 'process' && b.severity === 'critical')) {
      recommendations.push('Review and optimize development process workflows');
    }
    
    if (methodologyScores.scores.tdd < 50) {
      recommendations.push('Increase test-driven development practices');
    }
    
    if (metrics?.averageTestCoverage < 70) {
      recommendations.push('Improve test coverage to at least 70%');
    }
    
    return recommendations;
  }

  private cleanupCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, cached] of this.reportCache.entries()) {
      if (now - cached.timestamp > this.config.cacheTTL) {
        expiredKeys.push(key);
      }
    }
    
    for (const key of expiredKeys) {
      this.reportCache.delete(key);
    }
    
    if (expiredKeys.length > 0) {
      this.logger.debug(`Cleaned up ${expiredKeys.length} expired cache entries`);
    }
  }

  private emitReportEvent(
    type: ReportEventType,
    reportId: string,
    details?: any
  ): void {
    const event: ReportEvent = {
      type,
      reportId,
      timestamp: Date.now(),
      details
    };
    
    this.emit(type, event);
  }

  /**
   * 보고서 조회
   */
  async getReport(reportId: string): Promise<ReportResult | null> {
    try {
      const files = await fs.readdir(this.config.reportsPath);
      const reportFiles = files.filter(f => f.includes(reportId));
      
      if (reportFiles.length === 0) {
        return null;
      }
      
      // 메타데이터를 JSON 파일에서 읽기 시도
      const jsonFile = reportFiles.find(f => f.endsWith('.json'));
      if (jsonFile) {
        const content = await fs.readFile(
          path.join(this.config.reportsPath, jsonFile),
          'utf-8'
        );
        const data = JSON.parse(content);
        return {
          metadata: data.metadata,
          files: reportFiles.map(f => ({
            format: this.getFormatFromFilename(f),
            path: path.join(this.config.reportsPath, f),
            size: 0, // 실제 구현에서는 파일 크기 확인
            mimeType: this.getMimeTypeFromFormat(this.getFormatFromFilename(f))
          })),
          generationTime: 0
        };
      }
      
      return null;
    } catch (error) {
      this.logger.error('Failed to get report', error);
      return null;
    }
  }

  private getFormatFromFilename(filename: string): ReportFormat {
    const ext = path.extname(filename).slice(1).toLowerCase();
    return ext as ReportFormat;
  }

  private getMimeTypeFromFormat(format: ReportFormat): string {
    const mimeTypes: Record<ReportFormat, string> = {
      [ReportFormat.PDF]: 'application/pdf',
      [ReportFormat.HTML]: 'text/html',
      [ReportFormat.MARKDOWN]: 'text/markdown',
      [ReportFormat.JSON]: 'application/json',
      [ReportFormat.CSV]: 'text/csv',
      [ReportFormat.EXCEL]: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };
    
    return mimeTypes[format] || 'application/octet-stream';
  }
}