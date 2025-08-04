#!/usr/bin/env node

/**
 * DevFlow Monitor MCP 서버 엔트리포인트
 *
 * 이 파일은 MCP 서버의 메인 진입점으로, 모든 핵심 기능을 초기화하고
 * Claude Desktop과의 통신을 관리합니다.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { config, validateConfig } from './config.js';
import {
  type McpTool,
  type GetProjectStatusArgs,
  type GetMetricsArgs,
  type GetActivityLogArgs,
  type AnalyzeBottlenecksArgs,
  type CheckMethodologyArgs,
  type GenerateReportArgs,
  type ProjectStatusResponse,
  type MetricsResponse,
  type ActivityLogResponse,
  type BottleneckAnalysisResponse,
  type CheckMethodologyResponse,
  type GenerateReportResponse,
} from './types.js';
import { FileMonitor, GitMonitor } from '../monitors/index.js';
import type { MonitorEvent } from '../monitors/base.js';
import { eventEngine, EventCategory, BaseEvent } from '../events/index.js';
import { getStorageManager } from '../storage/index.js';
import { wsServer } from './websocket.js';
import { streamManager } from './stream-manager.js';
import { StageAnalyzer } from '../analyzers/stage-analyzer.js';
import { MethodologyAnalyzer } from '../analyzers/methodology-analyzer.js';
import { AIMonitor } from '../analyzers/ai-monitor.js';
import { metricsCollector } from '../analyzers/metrics-collector.js';
import { bottleneckDetector } from '../analyzers/bottleneck-detector.js';
import { metricsAnalyzer } from '../analyzers/metrics-analyzer.js';
import { DevelopmentMethodology } from '../analyzers/types/methodology.js';
import { AITool } from '../analyzers/types/ai.js';
// import { BottleneckType } from '../analyzers/types/metrics.js';

// Initialize Storage Manager
const storageManager = getStorageManager();
storageManager.connectEventEngine(eventEngine);

// Initialize Stage Analyzer
const stageAnalyzer = new StageAnalyzer({
  confidenceThreshold: 0.7,
  transitionCooldown: 60000, // 1분
  historySize: 50,
  eventEngine,
  storageManager
});

// Initialize Methodology Analyzer
const methodologyAnalyzer = new MethodologyAnalyzer();

// Initialize AI Monitor
const aiMonitor = new AIMonitor();

// Initialize Metrics System
metricsCollector.start();
bottleneckDetector.start();
metricsAnalyzer.start();

/**
 * DevFlow Monitor MCP 서버 클래스
 */
class DevFlowMonitorServer {
  private server: Server;
  private tools: Map<string, McpTool> = new Map();
  private fileMonitor?: FileMonitor;
  private gitMonitor?: GitMonitor;
  private activityLog: Array<MonitorEvent> = [];
  private aiMonitor = aiMonitor;
  // private wsServerStarted = false;

  constructor() {
    // 설정 검증
    validateConfig(config);

    // MCP 서버 초기화
    this.server = new Server(
      {
        name: config.server.name,
        version: config.server.version,
      },
      {
        capabilities: {
          tools: config.protocol.capabilities.tools ? {} : undefined,
          resources: config.protocol.capabilities.resources ? {} : undefined,
          prompts: config.protocol.capabilities.prompts ? {} : undefined,
          logging: config.protocol.capabilities.logging ? {} : undefined,
        },
      },
    );

    this.setupTools();
    this.setupHandlers();

    // Initialize monitors if enabled
    if (config.monitoring.fileWatch.enabled) {
      this.initializeMonitors();
    }
  }

  /**
   * MCP 도구 등록
   */
  private setupTools(): void {
    // 프로젝트 상태 조회 도구
    this.registerTool({
      name: 'getProjectStatus',
      description: '현재 프로젝트의 개발 상태와 진행률을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          includeDetails: {
            type: 'boolean',
            description: '상세 정보 포함 여부',
            default: false,
          },
        },
      },
    });

    // 개발 메트릭 조회 도구
    this.registerTool({
      name: 'getMetrics',
      description: '개발 프로세스 메트릭과 통계를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          timeRange: {
            type: 'string',
            description: '조회 기간 (1h, 1d, 1w, 1m)',
            enum: ['1h', '1d', '1w', '1m'],
            default: '1d',
          },
          metricType: {
            type: 'string',
            description: '메트릭 타입',
            enum: ['all', 'commits', 'files', 'tests', 'builds'],
            default: 'all',
          },
        },
      },
    });

    // 활동 로그 조회 도구
    this.registerTool({
      name: 'getActivityLog',
      description: '최근 개발 활동 로그를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: '조회할 로그 수',
            minimum: 1,
            maximum: 100,
            default: 20,
          },
          activityType: {
            type: 'string',
            description: '활동 타입 필터',
            enum: ['all', 'code', 'git', 'test', 'build', 'deploy'],
            default: 'all',
          },
        },
      },
    });

    // 병목 현상 분석 도구
    this.registerTool({
      name: 'analyzeBottlenecks',
      description: '개발 프로세스의 병목 현상을 분석합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          threshold: {
            type: 'number',
            description: '병목 감지 임계값 (0-1)',
            minimum: 0,
            maximum: 1,
            default: 0.7,
          },
          includeRecommendations: {
            type: 'boolean',
            description: '개선 권장사항 포함 여부',
            default: true,
          },
        },
      },
    });

    // 개발 방법론 준수 체크 도구
    this.registerTool({
      name: 'checkMethodology',
      description: '개발 방법론(DDD, TDD, BDD, EDA) 준수 상태를 확인합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          methodology: {
            type: 'string',
            description: '확인할 방법론',
            enum: ['all', 'ddd', 'tdd', 'bdd', 'eda'],
            default: 'all',
          },
          detailed: {
            type: 'boolean',
            description: '상세 분석 포함 여부',
            default: false,
          },
        },
      },
    });

    // 보고서 생성 도구
    this.registerTool({
      name: 'generateReport',
      description: '개발 현황 보고서를 생성합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          reportType: {
            type: 'string',
            description: '보고서 타입',
            enum: ['daily', 'weekly', 'monthly'],
            default: 'daily',
          },
          sections: {
            type: 'array',
            description: '포함할 섹션',
            items: {
              type: 'string',
              enum: ['status', 'metrics', 'activity', 'bottlenecks', 'methodology'],
            },
            default: ['status', 'metrics', 'activity'],
          },
        },
      },
    });

    // 개발 단계 분석 도구
    this.registerTool({
      name: 'analyzeStage',
      description: '현재 개발 단계를 분석하고 진행 상황을 제공합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          includeSubStages: {
            type: 'boolean',
            description: '코딩 세부 단계 포함 여부',
            default: true,
          },
          includeHistory: {
            type: 'boolean',
            description: '단계 전환 히스토리 포함 여부',
            default: false,
          },
          historyLimit: {
            type: 'number',
            description: '히스토리 항목 수 제한',
            default: 10,
          },
        },
      },
    });

    // AI 협업 분석 도구
    this.registerTool({
      name: 'analyzeAICollaboration',
      description: 'AI 도구 사용 현황과 효과성을 분석합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          tool: {
            type: 'string',
            description: '특정 AI 도구 필터',
            enum: ['all', 'claude', 'github_copilot', 'chatgpt', 'cursor', 'other'],
            default: 'all',
          },
          timeRange: {
            type: 'string',
            description: '분석 기간',
            enum: ['1h', '1d', '1w', '1m'],
            default: '1d',
          },
          includePatterns: {
            type: 'boolean',
            description: '사용 패턴 분석 포함',
            default: true,
          },
          includeQuality: {
            type: 'boolean',
            description: '코드 품질 분석 포함',
            default: true,
          },
        },
      },
    });

    // WebSocket 서버 제어 도구
    this.registerTool({
      name: 'startWebSocketServer',
      description: 'WebSocket 서버를 시작합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          port: {
            type: 'number',
            description: '서버 포트 번호',
            default: 8081,
          },
        },
      },
    });

    this.registerTool({
      name: 'stopWebSocketServer',
      description: 'WebSocket 서버를 중지합니다.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    });

    this.registerTool({
      name: 'getWebSocketStats',
      description: 'WebSocket 서버 통계를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    });

    this.registerTool({
      name: 'getStreamStats',
      description: '이벤트 스트림 통계를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    });

    this.registerTool({
      name: 'broadcastSystemNotification',
      description: '모든 WebSocket 클라이언트에게 시스템 알림을 브로드캐스트합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: '알림 메시지',
          },
          severity: {
            type: 'string',
            description: '알림 심각도',
            enum: ['info', 'warning', 'error'],
            default: 'info',
          },
          data: {
            type: 'object',
            description: '추가 데이터',
          },
        },
        required: ['message'],
      },
    });

    // 대시보드 도구
    this.registerTool({
      name: 'startDashboard',
      description: 'DevFlow Monitor 대시보드를 시작합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            description: '대시보드 모드',
            enum: ['tui', 'cli'],
            default: 'tui',
          },
          refreshInterval: {
            type: 'number',
            description: '새로고침 간격 (밀리초)',
            default: 1000,
          },
          maxEvents: {
            type: 'number',
            description: '최대 이벤트 수',
            default: 100,
          },
        },
      },
    });

    this.registerTool({
      name: 'getDashboardStatus',
      description: '대시보드 실행 상태를 확인합니다.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    });

    // 메트릭 관련 도구들
    this.registerTool({
      name: 'getAdvancedMetrics',
      description: '고급 메트릭 분석 결과를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          includeBottlenecks: {
            type: 'boolean',
            description: '병목 현상 분석 포함 여부',
            default: true,
          },
          includeInsights: {
            type: 'boolean',
            description: '인사이트 포함 여부',
            default: true,
          },
          includeRecommendations: {
            type: 'boolean',
            description: '권장사항 포함 여부',
            default: true,
          },
          timeRange: {
            type: 'string',
            description: '분석 시간 범위 (1h, 24h, 7d, 30d)',
            default: '24h',
          },
        },
      },
    });

    this.registerTool({
      name: 'getBottlenecks',
      description: '현재 감지된 병목 현상을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['process', 'resource', 'technical', 'communication', 'quality', 'workflow', 'dependency', 'skill'],
            description: '병목 현상 타입 필터',
          },
          severity: {
            type: 'string',
            enum: ['debug', 'info', 'warn', 'warning', 'error', 'critical'],
            description: '심각도 필터',
          },
          minImpact: {
            type: 'number',
            description: '최소 영향도 (0-100)',
            minimum: 0,
            maximum: 100,
          },
        },
      },
    });

    this.registerTool({
      name: 'getMetricsSnapshot',
      description: '현재 메트릭 스냅샷을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          includeHistory: {
            type: 'boolean',
            description: '히스토리 포함 여부',
            default: false,
          },
          metricTypes: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['productivity', 'quality', 'performance', 'collaboration', 'methodology', 'ai_usage', 'bottleneck', 'trend'],
            },
            description: '포함할 메트릭 타입들',
          },
        },
      },
    });

    this.registerTool({
      name: 'analyzeProductivity',
      description: '생산성 메트릭을 상세 분석합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          timeRange: {
            type: 'string',
            description: '분석 시간 범위 (1h, 24h, 7d, 30d)',
            default: '24h',
          },
          includeTrends: {
            type: 'boolean',
            description: '트렌드 분석 포함 여부',
            default: true,
          },
        },
      },
    });

    this.logInfo(`Registered ${this.tools.size} MCP tools`);
  }

  /**
   * 도구 등록 헬퍼 메소드
   */
  private registerTool(tool: McpTool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * MCP 프로토콜 핸들러 설정
   */
  private setupHandlers(): void {
    // 도구 목록 요청 핸들러
    this.server.setRequestHandler(ListToolsRequestSchema, () => {
      const tools = Array.from(this.tools.values());
      this.logDebug(`Listed ${tools.length} available tools`);

      return {
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      };
    });

    // 도구 실행 요청 핸들러
    this.server.setRequestHandler(CallToolRequestSchema, async (request, _extra) => {
      const { name, arguments: args = {} } = request.params;

      try {
        this.logDebug(`Executing tool: ${name}`, args);
        const result = await this.executeTool(name, args);
        this.logDebug(`Tool ${name} executed successfully`);
        return result;
      } catch (error) {
        this.logError(`Tool ${name} execution failed:`, error);
        
        if (error instanceof McpError) {
          throw error;
        }
        
        throw new McpError(
          ErrorCode.InternalError,
          error instanceof Error ? error.message : 'Unknown error occurred',
        );
      }
    });
  }

  /**
   * 도구 실행
   */
  private async executeTool(name: string, args: unknown): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
    }

    // 도구별 실행 로직
    switch (name) {
      case 'getProjectStatus':
        return this.getProjectStatus(args as GetProjectStatusArgs);
      
      case 'getMetrics':
        return this.getMetrics(args as GetMetricsArgs);
      
      case 'getActivityLog':
        return this.getActivityLog(args as GetActivityLogArgs);
      
      case 'analyzeBottlenecks':
        return this.analyzeBottlenecks(args as AnalyzeBottlenecksArgs);
      
      case 'checkMethodology':
        return this.checkMethodology(args as CheckMethodologyArgs);
      
      case 'generateReport':
        return this.generateReport(args as GenerateReportArgs);

      case 'analyzeStage':
        return this.analyzeStage(args as { includeSubStages?: boolean; includeHistory?: boolean; historyLimit?: number });

      case 'analyzeAICollaboration':
        return this.analyzeAICollaboration(args as { tool?: string; timeRange?: string; includePatterns?: boolean; includeQuality?: boolean });

      case 'startWebSocketServer':
        return await this.startWebSocketServer(args as { port?: number });

      case 'stopWebSocketServer':
        return await this.stopWebSocketServer();

      case 'getWebSocketStats':
        return this.getWebSocketStats();

      case 'getStreamStats':
        return this.getStreamStats();

      case 'broadcastSystemNotification':
        return this.broadcastSystemNotification(args as { message: string; severity: 'info' | 'warning' | 'error'; data?: any });

      case 'startDashboard':
        return this.startDashboard(args as { mode?: 'tui' | 'cli'; refreshInterval?: number; maxEvents?: number });

      case 'getDashboardStatus':
        return this.getDashboardStatus();

      case 'getAdvancedMetrics':
        return this.getAdvancedMetrics(args as { includeBottlenecks?: boolean; includeInsights?: boolean; includeRecommendations?: boolean; timeRange?: string });

      case 'getBottlenecks':
        return this.getBottlenecks(args as { type?: string; severity?: string; minImpact?: number });

      case 'getMetricsSnapshot':
        return this.getMetricsSnapshot(args as { includeHistory?: boolean; metricTypes?: string[] });

      case 'analyzeProductivity':
        return this.analyzeProductivity(args as { timeRange?: string; includeTrends?: boolean });

      default:
        throw new Error(`Unimplemented tool: ${name}`);
    }
  }

  /**
   * 프로젝트 상태 조회
   */
  private getProjectStatus(args: GetProjectStatusArgs): ProjectStatusResponse {
    const { includeDetails = false } = args;

    // Get queue status
    const queueManager = eventEngine.getQueueManager();
    const queueStats = queueManager ? {
      default: queueManager.getQueueStats('default'),
      priority: queueManager.getQueueStats('priority'),
      batch: queueManager.getQueueStats('batch'),
      failed: queueManager.getQueueStats('failed'),
    } : null;

    // Get event engine stats
    const engineStats = eventEngine.getStats();

    // Get stage analysis
    const stageAnalysis = stageAnalyzer.analyze();

    // Get methodology analysis
    const methodologyAnalysis = methodologyAnalyzer.analyze();

    // Calculate progress
    const milestones = [
      { name: 'MVP 기반 구축', progress: 100 },
      { name: '핵심 통합 구현', progress: 100 },
      { name: '지능형 모니터링', progress: 36.1 },
      { name: '프로덕션 준비', progress: 0 },
      { name: '확장 및 고도화', progress: 0 },
    ];

    const overallProgress = milestones.reduce((sum, m) => sum + m.progress, 0) / milestones.length;

    const status: any = {
      projectName: config.server.name,
      version: config.server.version,
      currentPhase: '지능형 모니터링',
      overallProgress: Math.round(overallProgress * 10) / 10,
      currentStage: {
        main: stageAnalysis.currentStage,
        sub: stageAnalysis.activeSubStages,
        confidence: Math.round(stageAnalysis.confidence * 100),
      },
      methodologyCompliance: {
        overall: methodologyAnalysis.overallScore,
        ddd: methodologyAnalysis.scores.DDD?.score || 0,
        tdd: methodologyAnalysis.scores.TDD?.score || 0,
        bdd: methodologyAnalysis.scores.BDD?.score || 0,
        eda: methodologyAnalysis.scores.EDA?.score || 0,
      },
      systemStatus: {
        monitors: {
          file: this.fileMonitor ? 'active' : 'inactive',
          git: this.gitMonitor ? 'active' : 'inactive',
        },
        eventEngine: engineStats,
        webSocket: wsServer.isRunning() ? 'active' : 'inactive',
      },
      milestones,
    };

    if (includeDetails) {
      status.details = {
        queues: queueStats,
        recentActivity: this.activityLog.slice(-10),
        stageHistory: stageAnalyzer.getTransitionHistory(5),
        methodologyTrends: methodologyAnalysis.trends,
      };
    }

    return {
      ...status,
      content: [
        {
          type: 'text',
          text: JSON.stringify(status, null, 2),
        },
      ],
    } as ProjectStatusResponse;
  }

  /**
   * 메트릭 조회
   */
  private async getMetrics(args: GetMetricsArgs): Promise<MetricsResponse> {
    const { timeRange = '1d', metricType = 'all' } = args;

    // Get storage manager metrics
    const storageMetrics = storageManager.getMetrics();

    // Get event metrics from EventEngine
    const eventStats = eventEngine.getStats();

    // Calculate time window
    const now = Date.now();
    const timeWindows: Record<string, number> = {
      '1h': 3600000,
      '1d': 86400000,
      '1w': 604800000,
      '1m': 2592000000,
    };
    const windowSize = timeWindows[timeRange as keyof typeof timeWindows] || timeWindows['1d'];
    const startTime = now - (windowSize as number);

    // Get recent events for metrics
    const eventRecords = await storageManager.repositories.events
      .findByTimeRange(startTime, now);
    
    // Convert EventRecord to BaseEvent
    const recentEvents = eventRecords.map((record: any) => {
      try {
        return JSON.parse(record.data);
      } catch {
        return null;
      }
    }).filter(Boolean) as BaseEvent[];

    // Calculate metrics based on metricType
    const metrics: any = {
      timeRange,
      period: {
        start: new Date(startTime).toISOString(),
        end: new Date(now).toISOString(),
      },
    };

    if (metricType === 'all' || metricType === 'commits') {
      const commitEvents = recentEvents.filter((e: any) => e.type === 'git:commit');
      metrics.commits = {
        total: commitEvents.length,
        averagePerDay: (commitEvents.length / ((windowSize as number) / 86400000)),
        byAuthor: this.groupByProperty(commitEvents, 'data.author'),
        byType: this.analyzeCommitTypes(commitEvents),
      };
    }

    if (metricType === 'all' || metricType === 'files') {
      const fileEvents = recentEvents.filter((e: any) => e.category === EventCategory.FILE);
      metrics.files = {
        total: fileEvents.length,
        added: fileEvents.filter((e: any) => e.data?.action === 'add').length,
        modified: fileEvents.filter((e: any) => e.data?.action === 'modify').length,
        deleted: fileEvents.filter((e: any) => e.data?.action === 'delete').length,
        byExtension: this.groupByFileExtension(fileEvents),
      };
    }

    if (metricType === 'all' || metricType === 'tests') {
      const testEvents = recentEvents.filter((e: any) => e.category === EventCategory.TEST);
      const passed = testEvents.filter((e: any) => e.data?.status === 'passed').length;
      const failed = testEvents.filter((e: any) => e.data?.status === 'failed').length;
      
      metrics.tests = {
        total: testEvents.length,
        passed,
        failed,
        successRate: testEvents.length > 0 ? (passed / testEvents.length) * 100 : 0,
        coverage: this.getLatestCoverage(testEvents),
      };
    }

    if (metricType === 'all' || metricType === 'builds') {
      const buildEvents = recentEvents.filter((e: any) => e.category === EventCategory.BUILD);
      const successful = buildEvents.filter((e: any) => e.data?.status === 'success').length;
      const failed = buildEvents.filter((e: any) => e.data?.status === 'failed').length;
      
      metrics.builds = {
        total: buildEvents.length,
        successful,
        failed,
        successRate: buildEvents.length > 0 ? (successful / buildEvents.length) * 100 : 0,
        averageDuration: this.calculateAverageDuration(buildEvents),
      };
    }

    // Add overall statistics
    metrics.overall = {
      totalEvents: recentEvents.length,
      eventsPerHour: recentEvents.length / ((windowSize as number) / 3600000),
      storageMetrics,
      systemLoad: {
        eventProcessing: eventStats,
        memoryUsage: process.memoryUsage(),
      },
    };

    // Add trend analysis
    metrics.trends = this.analyzeTrends(recentEvents, windowSize as number);

    // Add recommendations
    metrics.recommendations = this.generateMetricRecommendations(metrics);

    const response: MetricsResponse = {
      timeRange,
      metricType,
      timestamp: new Date().toISOString(),
      data: metrics,
      summary: `Metrics for ${timeRange} (${metricType})`,
      content: [
        {
          type: 'text',
          text: JSON.stringify(metrics, null, 2),
        },
      ],
    };
    
    return response;
  }

  /**
   * 활동 로그 조회
   */
  private async getActivityLog(args: GetActivityLogArgs): Promise<ActivityLogResponse> {
    const { limit = 20 } = args;

    // Get recent events from storage
    const eventRecords = await storageManager.repositories.events
      .findByTimeRange(Date.now() - 86400000, Date.now()); // Last 24 hours
    
    // Convert EventRecord to BaseEvent
    const allEvents = eventRecords.map((record: any) => {
      try {
        return JSON.parse(record.data);
      } catch {
        return null;
      }
    }).filter(Boolean) as BaseEvent[];
    
    const recentEvents = allEvents.slice(-limit);

    // Use all events for now
    let filteredEvents = recentEvents;

    // Format activities
    const activities = filteredEvents.map((event: any) => ({
      id: event.id,
      timestamp: new Date(event.timestamp).toISOString(),
      type: event.type,
      category: event.category,
      source: event.source,
      severity: event.severity,
      summary: this.generateEventSummary(event),
      data: event.data,
    }));

    // Group activities by category
    const byCategory: Record<string, number> = {};
    filteredEvents.forEach((event: any) => {
      byCategory[event.category] = (byCategory[event.category] || 0) + 1;
    });

    // Calculate activity rate
    const timeSpan = activities.length > 0 
      ? Date.now() - (filteredEvents[0] as any).timestamp
      : 0;
    const activityRate = timeSpan > 0 
      ? (activities.length / (timeSpan / 3600000)) // per hour
      : 0;

    const response: ActivityLogResponse = {
      totalCount: activities.length,
      activities: activities.map(a => ({
        ...a,
        stage: 'development', // default stage
        action: a.type,
        details: a.summary,
        actor: 'system'
      })),
      filters: {
        limit,
      },
      summary: {
        totalEvents: activities.length,
        timeRange: {
          start: activities.length > 0 ? (activities[0]?.timestamp ?? new Date().toISOString()) : new Date().toISOString(),
          end: activities.length > 0 ? (activities[activities.length - 1]?.timestamp ?? new Date().toISOString()) : new Date().toISOString(),
        },
        byCategory,
        bySeverity: {},
      },
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            activities,
            summary: {
              total: activities.length,
              timeRange: {
                start: activities.length > 0 ? (activities[0]?.timestamp ?? new Date().toISOString()) : new Date().toISOString(),
                end: activities.length > 0 ? (activities[activities.length - 1]?.timestamp ?? new Date().toISOString()) : new Date().toISOString(),
              },
              byCategory,
              activityRate: Math.round(activityRate * 10) / 10,
            },
          }, null, 2),
        },
      ],
    };

    return response;
  }

  /**
   * 병목 현상 분석
   */
  private analyzeBottlenecks(_args: AnalyzeBottlenecksArgs): BottleneckAnalysisResponse {
    const includeRecommendations = true;

    const bottlenecks: any[] = [];

    // Check event queue bottlenecks
    const queueManager = eventEngine.getQueueManager();
    if (queueManager) {
      const queueStats = queueManager.getStats();
      
      // Check for queue backlog
      if (queueStats.totalPending > 100) {
        bottlenecks.push({
          type: 'event_processing',
          severity: queueStats.totalPending > 500 ? 'high' : 'medium',
          description: `Event queue backlog: ${queueStats.totalPending} pending events`,
          metrics: {
            pending: queueStats.totalPending,
            processing: queueStats.totalProcessing,
            failed: queueStats.totalFailed,
          },
          impact: 'Delayed event processing may cause outdated analysis',
        });
      }

      // Check for high failure rate
      const totalProcessed = queueStats.totalProcessed + queueStats.totalFailed;
      if (totalProcessed > 0) {
        const failureRate = queueStats.totalFailed / totalProcessed;
        if (failureRate > 0.1) {
          bottlenecks.push({
            type: 'event_failures',
            severity: failureRate > 0.3 ? 'high' : 'medium',
            description: `High event failure rate: ${Math.round(failureRate * 100)}%`,
            metrics: {
              failureRate,
              totalFailed: queueStats.totalFailed,
            },
            impact: 'Lost events may result in incomplete monitoring',
          });
        }
      }
    }

    // Check memory usage
    const memUsage = process.memoryUsage();
    const memUsagePercent = memUsage.heapUsed / memUsage.heapTotal;
    if (memUsagePercent > 0.7) {
      bottlenecks.push({
        type: 'memory_pressure',
        severity: memUsagePercent > 0.9 ? 'high' : 'medium',
        description: `High memory usage: ${Math.round(memUsagePercent * 100)}%`,
        metrics: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          external: Math.round(memUsage.external / 1024 / 1024),
        },
        impact: 'May cause performance degradation or crashes',
      });
    }

    // Check development process bottlenecks
    const stageAnalysis = stageAnalyzer.analyze();
    const stuckThreshold = 24 * 60 * 60 * 1000; // 24 hours
    
    stageAnalysis.stageProgress.forEach((progress, stage) => {
      const timeSpent = stageAnalyzer.getStageTimeSpent(stage as any);
      if (timeSpent > stuckThreshold && progress < 100) {
        bottlenecks.push({
          type: 'development_stage',
          severity: timeSpent > stuckThreshold * 2 ? 'high' : 'medium',
          description: `Stuck in ${stage} stage for ${Math.round(timeSpent / 3600000)} hours`,
          metrics: {
            stage,
            progress,
            timeSpent: Math.round(timeSpent / 3600000),
          },
          impact: 'Project timeline may be at risk',
        });
      }
    });

    // Check methodology compliance
    const methodologyAnalysis = methodologyAnalyzer.analyze();
    Object.entries(methodologyAnalysis.scores).forEach(([methodology, score]) => {
      if (score.score < 30) {
        bottlenecks.push({
          type: 'methodology_compliance',
          severity: score.score < 10 ? 'high' : 'medium',
          description: `Low ${methodology} compliance: ${score.score}%`,
          metrics: {
            methodology,
            score: score.score,
            weaknesses: score.weaknesses,
          },
          impact: 'Poor code quality and maintainability',
        });
      }
    });

    const response: any = {
      bottlenecks,
      summary: {
        total: bottlenecks.length,
        high: bottlenecks.filter(b => b.severity === 'high').length,
        medium: bottlenecks.filter(b => b.severity === 'medium').length,
        low: bottlenecks.filter(b => b.severity === 'low').length,
      },
    };

    if (includeRecommendations) {
      response.recommendations = this.generateBottleneckRecommendations(bottlenecks);
    }

    return {
      ...response,
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
    } as BottleneckAnalysisResponse;
  }

  /**
   * 개발 방법론 준수 체크
   */
  private checkMethodology(args: CheckMethodologyArgs): CheckMethodologyResponse {
    const { methodology = 'all' } = args;

    // Get analysis from MethodologyAnalyzer
    const analysis = methodologyAnalyzer.analyze();

    const response: any = {
      timestamp: new Date().toISOString(),
      overallScore: analysis.overallScore,
    };

    // Helper function to format methodology data
    const formatMethodology = (_key: string, score: any) => {
      const result: any = {
        score: score.score,
        status: score.score >= 70 ? 'good' : score.score >= 40 ? 'fair' : 'poor',
      };

      if (true) { // always include details
        result.strengths = score.strengths;
        result.weaknesses = score.weaknesses;
        result.recommendations = score.recommendations;
        result.details = score.details;
      }

      return result;
    };

    if (methodology === 'all') {
      response.methodologies = {};
      Object.entries(analysis.scores).forEach(([key, score]) => {
        response.methodologies[key.toLowerCase()] = formatMethodology(key, score);
      });
      
      if (analysis.dominantMethodology) {
        response.dominantMethodology = analysis.dominantMethodology.toLowerCase();
      }
    } else {
      const methodologyKey = methodology.toUpperCase() as DevelopmentMethodology;
      const score = analysis.scores[methodologyKey];
      
      if (score) {
        response.methodology = methodology;
        Object.assign(response, formatMethodology(methodologyKey, score));
      } else {
        response.error = `Unknown methodology: ${methodology}`;
      }
    }

    // Add recent detections
    if (true) { // always include details
      response.recentDetections = analysis.detections
        .slice(-10)
        .map(d => ({
          methodology: d.methodology.toLowerCase(),
          pattern: d.pattern,
          confidence: Math.round(d.confidence * 100),
          timestamp: new Date(d.timestamp).toISOString(),
          evidence: d.evidence,
        }));
      
      response.trends = analysis.trends.map(t => ({
        methodology: t.methodology.toLowerCase(),
        growth: t.growth,
        timeWindow: t.timeWindow,
        usage: t.usage,
      }));
    }

    return {
      ...response,
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
    } as CheckMethodologyResponse;
  }

  /**
   * 보고서 생성
   */
  private async generateReport(args: GenerateReportArgs): Promise<GenerateReportResponse> {
    const { reportType = 'daily' } = args;
    const sections = ['status', 'metrics', 'activity'];

    const report: any = {
      type: reportType,
      generatedAt: new Date().toISOString(),
      project: {
        name: config.server.name,
        version: config.server.version,
      },
    };

    // Calculate time range based on report type
    const now = Date.now();
    const timeRanges: Record<string, number> = {
      daily: 86400000,
      weekly: 604800000,
      monthly: 2592000000,
    };
    const timeRange = timeRanges[reportType as keyof typeof timeRanges] || timeRanges.daily || 86400000;
    const startTime = now - timeRange;

    report.period = {
      start: new Date(startTime).toISOString(),
      end: new Date(now).toISOString(),
    };

    // Add requested sections
    if (sections.includes('status')) {
      const status = this.getProjectStatus({ includeDetails: false });
      report.status = JSON.parse((status as any).content[0].text);
    }

    if (sections.includes('metrics')) {
      const metrics = await this.getMetrics({ 
        timeRange: reportType === 'daily' ? '1d' : reportType === 'weekly' ? '1w' : '1m',
        metricType: 'all'
      });
      report.metrics = JSON.parse((metrics as any).content[0].text);
    }

    if (sections.includes('activity')) {
      const activity = await this.getActivityLog({ limit: 50 });
      report.activity = JSON.parse((activity as any).content[0].text);
    }

    if (sections.includes('bottlenecks')) {
      const bottlenecks = this.analyzeBottlenecks({});
      report.bottlenecks = JSON.parse((bottlenecks as any).content[0].text);
    }

    if (sections.includes('methodology')) {
      const methodology = this.checkMethodology({ methodology: 'all' });
      report.methodology = JSON.parse((methodology as any).content[0].text);
    }

    // Add executive summary
    report.summary = this.generateExecutiveSummary(report);

    return {
      ...report,
      content: [
        {
          type: 'text',
          text: JSON.stringify(report, null, 2),
        },
      ],
    } as GenerateReportResponse;
  }

  /**
   * 이벤트 요약 생성
   */
  private generateEventSummary(event: BaseEvent): string {
    switch (event.category) {
      case EventCategory.FILE:
        const fileData = event.data as any;
        return `File ${fileData.action}: ${fileData.newFile?.path || fileData.oldFile?.path || 'unknown'}`;
      
      case EventCategory.GIT:
        const gitData = event.data as any;
        return `Git ${gitData.action}: ${gitData.message || gitData.branch || 'unknown'}`;
      
      case EventCategory.TEST:
        const testData = event.data as any;
        return `Test ${testData.status}: ${testData.name || 'unknown'} (${testData.duration}ms)`;
      
      case EventCategory.BUILD:
        const buildData = event.data as any;
        return `Build ${buildData.status}: ${buildData.target || 'unknown'}`;
      
      default:
        return `${event.category} event: ${event.type}`;
    }
  }

  /**
   * 속성별 그룹화
   */
  private groupByProperty(items: any[], propertyPath: string): Record<string, number> {
    const groups: Record<string, number> = {};
    
    items.forEach(item => {
      const value = propertyPath.split('.').reduce((obj, prop) => obj?.[prop], item);
      if (value) {
        groups[value] = (groups[value] || 0) + 1;
      }
    });
    
    return groups;
  }

  /**
   * 파일 확장자별 그룹화
   */
  private groupByFileExtension(events: BaseEvent[]): Record<string, number> {
    const extensions: Record<string, number> = {};
    
    events.forEach(event => {
      const filePath = event.data?.newFile?.path || event.data?.oldFile?.path;
      if (filePath) {
        const ext = filePath.split('.').pop() || 'no-ext';
        extensions[ext] = (extensions[ext] || 0) + 1;
      }
    });
    
    return extensions;
  }

  /**
   * 커밋 타입 분석
   */
  private analyzeCommitTypes(commits: BaseEvent[]): Record<string, number> {
    const types: Record<string, number> = {};
    const conventionalCommitPattern = /^(feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert)(\(.+\))?:/;
    
    commits.forEach(event => {
      const message = event.data?.message || '';
      const match = message.match(conventionalCommitPattern);
      const type = match ? match[1] : 'other';
      types[type] = (types[type] || 0) + 1;
    });
    
    return types;
  }

  /**
   * 최신 커버리지 가져오기
   */
  private getLatestCoverage(testEvents: BaseEvent[]): number {
    const coverageEvents = testEvents
      .filter(e => e.data?.coverage !== undefined)
      .sort((a, b) => b.timestamp - a.timestamp);
    
    return coverageEvents.length > 0 ? coverageEvents[0]?.data?.coverage || 0 : 0;
  }

  /**
   * 평균 duration 계산
   */
  private calculateAverageDuration(events: BaseEvent[]): number {
    const durations = events
      .filter(e => e.data?.duration !== undefined)
      .map(e => e.data?.duration || 0);
    
    if (durations.length === 0) return 0;
    
    const sum = durations.reduce((a, b) => a + b, 0);
    return Math.round(sum / durations.length);
  }

  /**
   * 트렌드 분석
   */
  private analyzeTrends(events: BaseEvent[], windowSize: number): any {
    // Divide time window into 10 buckets
    const bucketSize = windowSize / 10;
    const buckets: number[] = new Array(10).fill(0);
    const now = Date.now();
    
    events.forEach(event => {
      const age = now - event.timestamp;
      const bucketIndex = Math.floor(age / bucketSize);
      if (bucketIndex >= 0 && bucketIndex < 10) {
        buckets[9 - bucketIndex] = (buckets[9 - bucketIndex] ?? 0) + 1;
      }
    });
    
    // Calculate trend direction
    const firstHalf = buckets.slice(0, 5).reduce((a, b) => a + b, 0);
    const secondHalf = buckets.slice(5, 10).reduce((a, b) => a + b, 0);
    const trend = secondHalf > firstHalf ? 'increasing' : secondHalf < firstHalf ? 'decreasing' : 'stable';
    
    return {
      buckets,
      trend,
      changeRate: firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0,
    };
  }

  /**
   * 메트릭 권장사항 생성
   */
  private generateMetricRecommendations(metrics: any): string[] {
    const recommendations: string[] = [];
    
    // Check commit frequency
    if (metrics.commits && metrics.commits.averagePerDay < 1) {
      recommendations.push('커밋 빈도가 낮습니다. 더 자주 작은 단위로 커밋하는 것을 권장합니다.');
    }
    
    // Check test success rate
    if (metrics.tests && metrics.tests.successRate < 80) {
      recommendations.push('테스트 성공률이 낮습니다. 실패하는 테스트를 수정하거나 제거하세요.');
    }
    
    // Check build success rate
    if (metrics.builds && metrics.builds.successRate < 90) {
      recommendations.push('빌드 성공률이 낮습니다. 빌드 설정을 점검하고 안정성을 개선하세요.');
    }
    
    // Check event processing rate
    if (metrics.overall && metrics.overall.eventsPerHour > 1000) {
      recommendations.push('이벤트 처리량이 높습니다. 성능 최적화를 고려하세요.');
    }
    
    return recommendations;
  }

  /**
   * 병목 현상 권장사항 생성
   */
  private generateBottleneckRecommendations(bottlenecks: any[]): string[] {
    const recommendations: string[] = [];
    
    bottlenecks.forEach(bottleneck => {
      switch (bottleneck.type) {
        case 'event_processing':
          recommendations.push('이벤트 큐 크기를 늘리거나 배치 처리 크기를 조정하세요.');
          break;
        case 'event_failures':
          recommendations.push('실패한 이벤트의 원인을 분석하고 에러 처리를 개선하세요.');
          break;
        case 'memory_pressure':
          recommendations.push('메모리 사용량을 모니터링하고 불필요한 데이터를 정리하세요.');
          break;
        case 'development_stage':
          recommendations.push(`${bottleneck.metrics.stage} 단계의 블로커를 확인하고 해결하세요.`);
          break;
        case 'methodology_compliance':
          recommendations.push(`${bottleneck.metrics.methodology} 방법론 준수를 위한 교육이나 도구 도입을 고려하세요.`);
          break;
      }
    });
    
    return recommendations;
  }

  /**
   * 실행 요약 생성
   */
  private generateExecutiveSummary(report: any): any {
    const summary: any = {
      highlights: [],
      concerns: [],
      recommendations: [],
    };
    
    // Analyze status
    if (report.status) {
      summary.highlights.push(`프로젝트 진행률: ${report.status.overallProgress}%`);
      summary.highlights.push(`현재 단계: ${report.status.currentStage.main}`);
    }
    
    // Analyze metrics
    if (report.metrics) {
      if (report.metrics.commits && report.metrics.commits.total > 0) {
        summary.highlights.push(`커밋 수: ${report.metrics.commits.total}`);
      }
      
      if (report.metrics.tests && report.metrics.tests.successRate < 80) {
        summary.concerns.push('테스트 성공률이 기준치 이하입니다.');
      }
    }
    
    // Analyze bottlenecks
    if (report.bottlenecks && report.bottlenecks.summary.high > 0) {
      summary.concerns.push(`${report.bottlenecks.summary.high}개의 심각한 병목 현상이 발견되었습니다.`);
    }
    
    // Analyze methodology
    if (report.methodology && report.methodology.overallScore < 50) {
      summary.concerns.push('전반적인 방법론 준수도가 낮습니다.');
    }
    
    // Add recommendations
    if (report.metrics?.recommendations) {
      summary.recommendations.push(...report.metrics.recommendations.slice(0, 3));
    }
    
    if (report.bottlenecks?.recommendations) {
      summary.recommendations.push(...report.bottlenecks.recommendations.slice(0, 2));
    }
    
    return summary;
  }

  /**
   * 모니터 초기화
   */
  private initializeMonitors(): void {
    this.initializeFileMonitor();
    this.initializeGitMonitor();
    this.initializeMethodologyAnalyzer();
    this.initializeAIMonitor();
  }

  /**
   * 파일 모니터 초기화
   */
  private initializeFileMonitor(): void {
    this.fileMonitor = new FileMonitor();

    // Listen for file events from FileMonitor (legacy)
    this.fileMonitor.on('event', (event: MonitorEvent) => {
      // Add to activity log
      this.activityLog.push(event);

      // Keep only last 1000 events
      if (this.activityLog.length > 1000) {
        this.activityLog = this.activityLog.slice(-1000);
      }

      this.logDebug(`File event: ${event.type}`, event.data);
    });

    // Subscribe to EventEngine for all file events
    eventEngine.subscribe(
      '*',
      (event: BaseEvent) => {
        // Only process file events
        if (event.category === EventCategory.FILE) {
          this.logDebug(`EventEngine file event: ${event.type}`, event.data);

          // Convert to MonitorEvent format for backward compatibility
          const monitorEvent: MonitorEvent = {
            type: event.type,
            timestamp: event.timestamp,
            source: event.source,
            data: event.data,
            ...(event.metadata && { metadata: event.metadata }),
          };

          // Also add EventEngine events to activity log
          if (
            !this.activityLog.some(
              (e) =>
                e.type === monitorEvent.type &&
                Math.abs(e.timestamp - monitorEvent.timestamp) < 100,
            )
          ) {
            this.activityLog.push(monitorEvent);

            if (this.activityLog.length > 1000) {
              this.activityLog = this.activityLog.slice(-1000);
            }
          }
        }
      },
      { priority: 10 },
    );

    // Start monitoring
    this.fileMonitor.start().catch((error) => {
      this.logError('Failed to start file monitor:', error);
    });

    this.logInfo('File monitor initialized with EventEngine integration');
  }

  /**
   * Git 모니터 초기화
   */
  private async initializeGitMonitor(): Promise<void> {
    try {
      this.gitMonitor = new GitMonitor(eventEngine, {
        repositoryPath: process.cwd(),
        pollInterval: 5000, // 5초마다 체크
        trackBranches: true,
        trackCommits: true,
        trackMerges: true,
        analyzeCommitMessages: true,
      });

      // Subscribe to EventEngine for all git events
      eventEngine.subscribe(
        '*',
        (event: BaseEvent) => {
          // Process git events
          if (event.category === EventCategory.GIT) {
            this.activityLog.push({
              type: event.type,
              timestamp: event.timestamp,
              data: event.data,
              source: event.source,
            });

            // Keep only last 1000 events
            if (this.activityLog.length > 1000) {
              this.activityLog = this.activityLog.slice(-1000);
            }

            this.logDebug(`Git event: ${event.type}`, event.data);
          }
        },
        { priority: 1 },
      );

      // Start git monitoring
      await this.gitMonitor.start();
      this.logInfo('Git monitor initialized and started');
    } catch (error) {
      this.logError('Failed to initialize Git monitor:', error);
      // Git 모니터링은 선택적이므로 에러가 발생해도 서버는 계속 실행
    }
  }

  /**
   * 방법론 분석기 초기화
   */
  private initializeMethodologyAnalyzer(): void {
    // Subscribe to EventEngine for all events
    eventEngine.subscribe(
      '*',
      async (event: BaseEvent) => {
        // Analyze event for methodology patterns
        await methodologyAnalyzer.analyzeEvent(event);
      },
      { priority: 2 }
    );

    this.logInfo('Methodology analyzer initialized with EventEngine integration');
  }

  /**
   * AI 모니터 초기화
   */
  private initializeAIMonitor(): void {
    // Subscribe to EventEngine for all events
    eventEngine.subscribe(
      '*',
      async (event: BaseEvent) => {
        // Analyze event for AI collaboration patterns
        await this.aiMonitor.analyzeEvent(event);
      },
      { priority: 3 }
    );

    this.logInfo('AI monitor initialized with EventEngine integration');
  }

  /**
   * 로깅 유틸리티
   */
  private logDebug(message: string, ...args: unknown[]): void {
    if (config.development.debug && config.development.logLevel === 'debug') {
      // eslint-disable-next-line no-console
      console.error(`[DEBUG] ${message}`, ...args);
    }
  }

  private logInfo(message: string, ...args: unknown[]): void {
    if (['debug', 'info'].includes(config.development.logLevel)) {
      // eslint-disable-next-line no-console
      console.error(`[INFO] ${message}`, ...args);
    }
  }

  private logError(message: string, ...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.error(`[ERROR] ${message}`, ...args);
  }

  /**
   * 서버 시작
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.logInfo('DevFlow Monitor MCP server started');
  }

  /**
   * WebSocket 서버 시작
   */
  private async startWebSocketServer(args: { port?: number }): Promise<any> {
    const { port = 8081 } = args;
    
    try {
      if (wsServer.isRunning()) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'already_running',
              message: 'WebSocket server is already running',
              port: wsServer.getPort(),
            }, null, 2),
          }],
        };
      }

      await wsServer.start(port);
      
      // Connect EventEngine to StreamManager
      if (!streamManager.isInitialized()) {
        streamManager.initialize(eventEngine);
      }
      
      this.logInfo(`WebSocket server started on port ${port}`);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'started',
            message: 'WebSocket server started successfully',
            port,
            url: `ws://localhost:${port}`,
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to start WebSocket server:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to start WebSocket server: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * WebSocket 서버 중지
   */
  private async stopWebSocketServer(): Promise<any> {
    try {
      if (!wsServer.isRunning()) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'not_running',
              message: 'WebSocket server is not running',
            }, null, 2),
          }],
        };
      }

      await wsServer.stop();
      
      this.logInfo('WebSocket server stopped');
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'stopped',
            message: 'WebSocket server stopped successfully',
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to stop WebSocket server:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to stop WebSocket server: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * WebSocket 서버 통계 조회
   */
  private getWebSocketStats(): any {
    const stats = wsServer.getStats();
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          isRunning: wsServer.isRunning(),
          port: wsServer.getPort(),
          connectedClients: stats.connectedClients,
          clients: stats.clients,
          uptime: stats.uptime,
        }, null, 2),
      }],
    };
  }

  /**
   * 스트림 통계 조회
   */
  private getStreamStats(): any {
    const stats = streamManager.getStats();
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(stats, null, 2),
      }],
    };
  }

  /**
   * 시스템 알림 브로드캐스트
   */
  private broadcastSystemNotification(args: { message: string; severity: 'info' | 'warning' | 'error'; data?: any }): any {
    const { message, severity = 'info', data } = args;
    
    if (!wsServer.isRunning()) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'error',
            message: 'WebSocket server is not running',
          }, null, 2),
        }],
      };
    }
    
    const notification = {
      type: 'system.notification',
      severity,
      message,
      data,
      timestamp: Date.now(),
    };
    
    wsServer.broadcastSystemNotification({
      message,
      severity,
      data
    });
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'success',
          message: 'Notification broadcasted successfully',
          notification,
          recipients: wsServer.getStats().connectedClients,
        }, null, 2),
      }],
    };
  }

  /**
   * 개발 단계 분석
   */
  private analyzeStage(args: { 
    includeSubStages?: boolean; 
    includeHistory?: boolean; 
    historyLimit?: number;
  }): {
    content: Array<{ type: 'text'; text: string }>;
  } {
    const {
      includeSubStages = true,
      includeHistory = false,
      historyLimit = 10,
    } = args;

    // 현재 분석 실행
    const analysis = stageAnalyzer.analyze();
    
    // 결과 포맷팅
    const result: any = {
      currentStage: analysis.currentStage,
      confidence: `${Math.round(analysis.confidence * 100)}%`,
      stageDescription: this.getStageDescription(analysis.currentStage),
    };

    // 세부 단계 정보 추가
    if (includeSubStages && analysis.activeSubStages && analysis.activeSubStages.length > 0) {
      result.activeSubStages = analysis.activeSubStages.map(subStage => ({
        name: subStage,
        description: this.getSubStageDescription(subStage),
      }));
    }

    // 단계별 진행률
    const progressArray: Array<{ stage: string; progress: number }> = [];
    analysis.stageProgress.forEach((progress, stage) => {
      progressArray.push({
        stage,
        progress,
      });
    });
    result.stageProgress = progressArray;

    // 히스토리 포함
    if (includeHistory) {
      result.recentTransitions = stageAnalyzer.getTransitionHistory(historyLimit).map(transition => ({
        from: transition.fromStage || 'start',
        to: transition.toStage,
        timestamp: new Date(transition.timestamp).toISOString(),
        confidence: `${Math.round(transition.confidence * 100)}%`,
        reason: transition.reason,
      }));
    }

    // 제안사항
    result.suggestions = analysis.suggestions;

    // 단계별 소요 시간 (분 단위)
    const timeSpent: Record<string, number> = {};
    progressArray.forEach(({ stage }) => {
      const ms = stageAnalyzer.getStageTimeSpent(stage as any);
      if (ms > 0) {
        timeSpent[stage] = Math.round(ms / 60000); // 분 단위로 변환
      }
    });
    if (Object.keys(timeSpent).length > 0) {
      result.timeSpentMinutes = timeSpent;
    }

    // JSON 포맷으로 반환
    const text = JSON.stringify(result, null, 2);

    return {
      content: [
        {
          type: 'text',
          text,
        },
      ],
    };
  }

  /**
   * AI 협업 분석
   */
  private analyzeAICollaboration(args: { 
    tool?: string; 
    timeRange?: string; 
    includePatterns?: boolean; 
    includeQuality?: boolean;
  }): {
    content: Array<{ type: 'text'; text: string }>;
  } {
    const {
      tool = 'all',
      timeRange = '1d',
      includePatterns = true,
      includeQuality = true,
    } = args;

    // AI 모니터에서 분석 가져오기
    const analysis = this.aiMonitor.analyze();
    
    // 결과 포맷팅
    const result: any = {
      timestamp: new Date().toISOString(),
      timeRange,
      overallMetrics: analysis.overallMetrics,
    };

    // 도구별 필터링
    if (tool === 'all') {
      result.tools = {};
      Object.entries(analysis.tools).forEach(([key, data]) => {
        if (data) {
          result.tools[key] = {
            sessions: data.sessions,
            interactions: data.interactions,
            acceptanceRate: `${Math.round(data.acceptanceRate * 100)}%`,
            timesSaved: `${data.timesSaved} minutes`,
            preferredUsageTypes: data.preferredUsageTypes,
          };
        }
      });
    } else {
      const toolKey = tool.toUpperCase() as AITool;
      const toolData = analysis.tools[toolKey];
      if (toolData) {
        result.tool = tool;
        result.metrics = {
          sessions: toolData.sessions,
          interactions: toolData.interactions,
          acceptanceRate: `${Math.round(toolData.acceptanceRate * 100)}%`,
          timesSaved: `${toolData.timesSaved} minutes`,
          preferredUsageTypes: toolData.preferredUsageTypes,
        };
      }
    }

    // 사용 패턴 포함
    if (includePatterns) {
      const patterns = this.aiMonitor.analyzeUsagePatterns();
      result.patterns = {};
      
      if (tool === 'all') {
        patterns.forEach((pattern, key) => {
          result.patterns[key] = {
            mostUsedTypes: pattern.patterns.mostUsedTypes,
            peakHours: pattern.patterns.peakHours,
            averageSessionDuration: `${Math.round(pattern.patterns.averageSessionDuration)} minutes`,
            preferredFileTypes: pattern.patterns.preferredFileTypes,
            productivity: pattern.productivity,
          };
        });
      } else {
        const toolKey = tool.toUpperCase() as AITool;
        const pattern = patterns.get(toolKey);
        if (pattern) {
          result.patterns = {
            mostUsedTypes: pattern.patterns.mostUsedTypes,
            peakHours: pattern.patterns.peakHours,
            averageSessionDuration: `${Math.round(pattern.patterns.averageSessionDuration)} minutes`,
            preferredFileTypes: pattern.patterns.preferredFileTypes,
            productivity: pattern.productivity,
          };
        }
      }
    }

    // 코드 품질 분석 포함
    if (includeQuality) {
      result.codeQuality = {
        averageScore: Math.round(this.calculateAverageAICodeQuality()),
        distribution: this.getAICodeQualityDistribution(),
        topIssues: this.getTopAICodeIssues(),
      };
    }

    // 인사이트 추가
    result.insights = analysis.insights;
    
    // 트렌드 추가
    result.trends = {
      adoptionRate: analysis.trends.adoptionRate.slice(-24), // 최근 24시간
      qualityTrend: analysis.trends.qualityTrend.slice(-24),
      efficiencyTrend: analysis.trends.efficiencyTrend.slice(-24),
    };

    // JSON 포맷으로 반환
    const text = JSON.stringify(result, null, 2);

    return {
      content: [
        {
          type: 'text',
          text,
        },
      ],
    };
  }

  /**
   * 평균 AI 코드 품질 계산
   */
  private calculateAverageAICodeQuality(): number {
    // AIMonitor의 private 메소드 호출을 위한 임시 구현
    // 실제로는 AIMonitor에 public 메소드를 추가해야 함
    return 75; // 예시값
  }

  /**
   * AI 코드 품질 분포 가져오기
   */
  private getAICodeQualityDistribution(): Record<string, number> {
    return {
      excellent: 20,
      good: 45,
      fair: 25,
      poor: 10,
    };
  }

  /**
   * 상위 AI 코드 이슈 가져오기
   */
  private getTopAICodeIssues(): string[] {
    return [
      'Unused variables in generated code',
      'Missing error handling',
      'Inconsistent naming conventions',
    ];
  }

  /**
   * 단계 설명 가져오기
   */
  private getStageDescription(stage: string): string {
    const descriptions: Record<string, string> = {
      prd: 'PRD (Product Requirements Document) 작성',
      planning: '기획서 작성',
      erd: 'ERD (Entity Relationship Diagram) 설계',
      wireframe: 'Wireframe 설계',
      screen_design: '화면단위 기획서 작성',
      design: '디자인 작업',
      frontend: '프론트엔드 개발',
      backend: '백엔드 개발',
      ai_collab: 'AI 협업',
      coding: '코딩 작업',
      git: 'Git 관리',
      deployment: '배포',
      operation: '운영'
    };
    return descriptions[stage] || stage;
  }

  /**
   * 세부 단계 설명 가져오기
   */
  private getSubStageDescription(subStage: string): string {
    const descriptions: Record<string, string> = {
      usecase: 'UseCase 도출',
      event_storming: 'Event Storming',
      domain_modeling: 'Domain 모델링',
      usecase_detail: 'UseCase 상세 설계',
      ai_prompt_design: 'AI 프롬프트 설계',
      first_implementation: '1차 뼈대 구현(AI)',
      business_logic: '비즈니스 로직 구현',
      refactoring: '리팩토링',
      unit_test: '단위 테스트',
      integration_test: '통합 테스트',
      e2e_test: 'E2E 테스트'
    };
    return descriptions[subStage] || subStage;
  }

  /**
   * 대시보드 시작
   */
  private dashboardInstance: any = null;

  private async startDashboard(args: { 
    mode?: 'tui' | 'cli'; 
    refreshInterval?: number; 
    maxEvents?: number;
  }): Promise<any> {
    const { mode = 'tui', refreshInterval = 1000, maxEvents = 100 } = args;

    try {
      // 이미 실행 중인 대시보드가 있는지 확인
      if (this.dashboardInstance) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'already_running',
              message: 'Dashboard is already running',
              mode: this.dashboardInstance.mode,
            }, null, 2),
          }],
        };
      }

      // 대시보드 모듈 동적 import
      const { launchDashboard } = await import('../dashboard/index.js');
      
      // 대시보드 시작 (백그라운드에서)
      const options = { mode, refreshInterval, maxEvents };
      
      // 프로미스로 대시보드 시작하되 await하지 않음 (백그라운드 실행)
      launchDashboard(options).catch((error) => {
        this.logError('Dashboard execution error:', error);
        this.dashboardInstance = null;
      });

      // 실행 상태 추적
      this.dashboardInstance = {
        mode,
        startTime: Date.now(),
        options,
      };

      this.logInfo(`Dashboard started in ${mode.toUpperCase()} mode`);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'started',
            message: `Dashboard started successfully in ${mode.toUpperCase()} mode`,
            mode,
            options,
            startTime: new Date().toISOString(),
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to start dashboard:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to start dashboard: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 고급 메트릭 분석 결과 조회
   */
  private async getAdvancedMetrics(args: { includeBottlenecks?: boolean; includeInsights?: boolean; includeRecommendations?: boolean; timeRange?: string }): Promise<any> {
    try {
      const {
        includeBottlenecks = true,
        includeInsights = true,
        includeRecommendations = true,
        timeRange = '24h'
      } = args;

      // 메트릭 분석 수행
      const analysisResult = await metricsAnalyzer.performAnalysis();

      const response = {
        timestamp: new Date().toISOString(),
        timeRange,
        summary: analysisResult.summary,
        productivity: {
          score: this.calculateProductivityScore(analysisResult.productivity),
          metrics: Object.entries(analysisResult.productivity).map(([key, metric]) => ({
            name: key,
            current: metric.summary.current,
            trend: metric.summary.trend,
            change: metric.summary.changePercentage,
          })),
        },
        quality: {
          score: this.calculateQualityScore(analysisResult.quality),
          metrics: Object.entries(analysisResult.quality).map(([key, metric]) => ({
            name: key,
            current: metric.summary.current,
            trend: metric.summary.trend,
            change: metric.summary.changePercentage,
          })),
        },
        performance: {
          score: this.calculatePerformanceScore(analysisResult.performance),
          metrics: Object.entries(analysisResult.performance).map(([key, metric]) => ({
            name: key,
            current: metric.summary.current,
            trend: metric.summary.trend,
            change: metric.summary.changePercentage,
          })),
        },
        ...(includeBottlenecks && { bottlenecks: analysisResult.bottlenecks }),
        ...(includeInsights && { insights: analysisResult.insights }),
        ...(includeRecommendations && { recommendations: analysisResult.recommendations }),
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to get advanced metrics:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get advanced metrics: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 병목 현상 조회
   */
  private getBottlenecks(args: { type?: string; severity?: string; minImpact?: number }): any {
    try {
      const { type, severity, minImpact } = args;
      let bottlenecks = bottleneckDetector.getAllBottlenecks();

      // 필터링
      if (type) {
        bottlenecks = bottlenecks.filter(b => b.type === type);
      }
      if (severity) {
        bottlenecks = bottlenecks.filter(b => b.severity === severity);
      }
      if (minImpact !== undefined) {
        bottlenecks = bottlenecks.filter(b => b.impact >= minImpact);
      }

      const stats = bottleneckDetector.getBottleneckStats();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            timestamp: new Date().toISOString(),
            totalBottlenecks: bottlenecks.length,
            filteredBottlenecks: bottlenecks.length,
            statistics: stats,
            bottlenecks: bottlenecks.map(b => ({
              id: b.id,
              type: b.type,
              severity: b.severity,
              title: b.title,
              description: b.description,
              location: b.location,
              impact: b.impact,
              confidence: b.confidence,
              frequency: b.frequency,
              detectedAt: b.detectedAt,
              lastOccurred: b.lastOccurred,
              suggestedActions: b.suggestedActions,
            })),
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to get bottlenecks:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get bottlenecks: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 메트릭 스냅샷 조회
   */
  private getMetricsSnapshot(args: { includeHistory?: boolean; metricTypes?: string[] }): any {
    try {
      const { includeHistory = false, metricTypes } = args;
      const snapshot = metricsCollector.getMetricsSnapshot();
      const allMetrics = metricsCollector.getAllMetrics();

      let filteredMetrics = Array.from(allMetrics.values());
      if (metricTypes && metricTypes.length > 0) {
        filteredMetrics = filteredMetrics.filter(metric => 
          metricTypes.includes(metric.definition.type)
        );
      }

      const response = {
        timestamp: snapshot.timestamp,
        uptime: snapshot.uptime,
        totalEvents: snapshot.totalEvents,
        totalMetrics: snapshot.totalMetrics,
        summary: snapshot.summary,
        metrics: filteredMetrics.map(metric => ({
          id: metric.definition.id,
          name: metric.definition.name,
          type: metric.definition.type,
          unit: metric.definition.unit,
          current: metric.summary.current,
          trend: metric.summary.trend,
          change: metric.summary.changePercentage,
          ...(includeHistory && {
            history: metric.values.slice(-10), // 최근 10개 값
          }),
        })),
        systemStats: {
          metricsCollector: metricsCollector.getStats(),
          bottleneckDetector: bottleneckDetector.getStats(),
          metricsAnalyzer: metricsAnalyzer.getStats(),
        },
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to get metrics snapshot:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get metrics snapshot: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 생산성 분석
   */
  private async analyzeProductivity(args: { timeRange?: string; includeTrends?: boolean }): Promise<any> {
    try {
      const { timeRange = '24h', includeTrends = true } = args;
      const analysisResult = await metricsAnalyzer.performAnalysis();
      const productivity = analysisResult.productivity;

      const productivityScore = this.calculateProductivityScore(productivity);
      
      const analysis = {
        timestamp: new Date().toISOString(),
        timeRange,
        overallScore: productivityScore,
        metrics: {
          codeVelocity: {
            linesPerHour: productivity.linesOfCodePerHour.summary.current,
            trend: productivity.linesOfCodePerHour.summary.trend,
            change: productivity.linesOfCodePerHour.summary.changePercentage,
          },
          commitActivity: {
            commitsPerDay: productivity.commitsPerDay.summary.current,
            trend: productivity.commitsPerDay.summary.trend,
            change: productivity.commitsPerDay.summary.changePercentage,
          },
          testCoverage: {
            coverage: productivity.testCoverage.summary.current,
            trend: productivity.testCoverage.summary.trend,
            change: productivity.testCoverage.summary.changePercentage,
          },
          deliveryTime: {
            featureDelivery: productivity.featureDeliveryTime.summary.current,
            bugFix: productivity.bugFixTime.summary.current,
            codeReview: productivity.codeReviewTime.summary.current,
          },
        },
        insights: this.generateProductivityInsights(productivity),
        recommendations: this.generateProductivityRecommendations(productivity),
        ...(includeTrends && {
          trends: this.analyzeProductivityTrends(productivity),
        }),
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(analysis, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to analyze productivity:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to analyze productivity: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 생산성 점수 계산
   */
  private calculateProductivityScore(productivity: any): number {
    const metrics = [
      productivity.linesOfCodePerHour,
      productivity.commitsPerDay,
      productivity.testCoverage,
    ];

    let totalScore = 0;
    let validMetrics = 0;

    for (const metric of metrics) {
      if (metric.values.length > 0) {
        let score = 50; // 기본 점수
        
        if (metric.summary.trend === 'increasing') score += 20;
        else if (metric.summary.trend === 'decreasing') score -= 20;
        
        if (Math.abs(metric.summary.changePercentage) > 20) score -= 10;
        
        totalScore += Math.max(0, Math.min(100, score));
        validMetrics++;
      }
    }

    return validMetrics > 0 ? Math.round(totalScore / validMetrics) : 50;
  }

  /**
   * 품질 점수 계산
   */
  private calculateQualityScore(quality: any): number {
    const metrics = [
      quality.testPassRate,
      quality.codeReviewApprovalRate,
    ];

    let totalScore = 0;
    let validMetrics = 0;

    for (const metric of metrics) {
      if (metric.values.length > 0) {
        let score = metric.summary.current; // 백분율 기반
        
        if (metric.summary.trend === 'increasing') score += 10;
        else if (metric.summary.trend === 'decreasing') score -= 10;
        
        totalScore += Math.max(0, Math.min(100, score));
        validMetrics++;
      }
    }

    return validMetrics > 0 ? Math.round(totalScore / validMetrics) : 50;
  }

  /**
   * 성능 점수 계산
   */
  private calculatePerformanceScore(performance: any): number {
    const metrics = [
      performance.buildTime,
      performance.testExecutionTime,
    ];

    let totalScore = 0;
    let validMetrics = 0;

    for (const metric of metrics) {
      if (metric.values.length > 0) {
        let score = 50; // 기본 점수
        
        // 시간 메트릭은 감소가 좋음
        if (metric.summary.trend === 'decreasing') score += 20;
        else if (metric.summary.trend === 'increasing') score -= 20;
        
        totalScore += Math.max(0, Math.min(100, score));
        validMetrics++;
      }
    }

    return validMetrics > 0 ? Math.round(totalScore / validMetrics) : 50;
  }

  /**
   * 생산성 인사이트 생성
   */
  private generateProductivityInsights(productivity: any): string[] {
    const insights: string[] = [];

    if (productivity.commitsPerDay.summary.current > 5) {
      insights.push('🚀 High commit frequency indicates active development');
    }

    if (productivity.testCoverage.summary.current > 80) {
      insights.push('✅ Excellent test coverage maintained');
    }

    if (productivity.linesOfCodePerHour.summary.trend === 'increasing') {
      insights.push('📈 Code productivity is improving');
    }

    return insights;
  }

  /**
   * 생산성 권장사항 생성
   */
  private generateProductivityRecommendations(productivity: any): string[] {
    const recommendations: string[] = [];

    if (productivity.testCoverage.summary.current < 70) {
      recommendations.push('Increase test coverage to improve code quality');
    }

    if (productivity.codeReviewTime.summary.current > 24 * 60 * 60 * 1000) { // 24시간
      recommendations.push('Consider reducing code review turnaround time');
    }

    if (productivity.bugFixTime.summary.trend === 'increasing') {
      recommendations.push('Investigate increasing bug fix time');
    }

    return recommendations;
  }

  /**
   * 생산성 트렌드 분석
   */
  private analyzeProductivityTrends(productivity: any): any {
    return {
      codeVelocity: productivity.linesOfCodePerHour.summary.trend,
      commitActivity: productivity.commitsPerDay.summary.trend,
      testCoverage: productivity.testCoverage.summary.trend,
      deliverySpeed: productivity.featureDeliveryTime.summary.trend,
    };
  }

  /**
   * 대시보드 상태 조회
   */
  private getDashboardStatus(): any {
    if (!this.dashboardInstance) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'not_running',
            message: 'Dashboard is not currently running',
          }, null, 2),
        }],
      };
    }

    const uptime = Date.now() - this.dashboardInstance.startTime;
    const uptimeMinutes = Math.floor(uptime / 60000);
    const uptimeSeconds = Math.floor((uptime % 60000) / 1000);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'running',
          mode: this.dashboardInstance.mode,
          startTime: new Date(this.dashboardInstance.startTime).toISOString(),
          uptime: `${uptimeMinutes}m ${uptimeSeconds}s`,
          options: this.dashboardInstance.options,
        }, null, 2),
      }],
    };
  }
}

// 서버 인스턴스 생성 및 시작
const server = new DevFlowMonitorServer();
server.start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', error);
  process.exit(1);
});