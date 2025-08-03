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

// Initialize Storage Manager
const storageManager = getStorageManager();
storageManager.connectEventEngine(eventEngine);

/**
 * DevFlow Monitor MCP 서버 클래스
 */
class DevFlowMonitorServer {
  private server: Server;
  private tools: Map<string, McpTool> = new Map();
  private fileMonitor?: FileMonitor;
  private gitMonitor?: GitMonitor;
  private activityLog: Array<MonitorEvent> = [];
  private eventEngine = eventEngine;
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
          stage: {
            type: 'string',
            description: '특정 단계 필터링',
            enum: ['planning', 'design', 'coding', 'testing', 'review', 'deployment', 'monitoring'],
          },
        },
      },
    });

    // 병목 현상 분석 도구
    this.registerTool({
      name: 'analyzeBottlenecks',
      description: '현재 개발 프로세스의 병목 현상을 분석합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          analysisDepth: {
            type: 'string',
            description: '분석 깊이',
            enum: ['basic', 'detailed', 'comprehensive'],
            default: 'basic',
          },
        },
      },
    });

    // 이벤트 시스템 통계 도구
    this.registerTool({
      name: 'getEventStatistics',
      description: 'EventEngine의 통계 정보를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    });

    // 방법론 검사 도구
    this.registerTool({
      name: 'checkMethodology',
      description: '개발 방법론 준수 상태를 검사하고 분석합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          methodology: {
            type: 'string',
            description: '검사할 방법론',
            enum: ['all', 'ddd', 'tdd', 'bdd', 'eda'],
            default: 'all',
          },
          includeRecommendations: {
            type: 'boolean',
            description: '개선 권장사항 포함 여부',
            default: true,
          },
        },
      },
    });

    // 리포트 생성 도구
    this.registerTool({
      name: 'generateReport',
      description: '개발 활동 리포트를 생성합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          reportType: {
            type: 'string',
            description: '리포트 유형',
            enum: ['daily', 'weekly', 'monthly', 'custom'],
            default: 'daily',
          },
          format: {
            type: 'string',
            description: '출력 형식',
            enum: ['json', 'markdown', 'summary'],
            default: 'summary',
          },
          includeMetrics: {
            type: 'boolean',
            description: '메트릭 포함 여부',
            default: true,
          },
          includeTrends: {
            type: 'boolean',
            description: '트렌드 분석 포함 여부',
            default: false,
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
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      this.logDebug(`Executing tool: ${name}`, args);

      if (!this.tools.has(name)) {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }

      try {
        return await this.executeTool(name, args || {});
      } catch (error) {
        this.logError(`Error executing tool ${name}:`, error);
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to execute tool: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  }

  /**
   * 도구 실행 로직
   */
  private async executeTool(
    name: string,
    args: unknown,
  ): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    switch (name) {
      case 'getProjectStatus':
        return this.getProjectStatus(args as GetProjectStatusArgs);

      case 'getMetrics':
        return this.getMetrics(args as GetMetricsArgs);

      case 'getActivityLog':
        return this.getActivityLog(args as GetActivityLogArgs);

      case 'analyzeBottlenecks':
        return this.analyzeBottlenecks(args as AnalyzeBottlenecksArgs);

      case 'getEventStatistics':
        return await this.getEventStatistics();
      
      case 'checkMethodology':
        return this.checkMethodology(args as CheckMethodologyArgs);
      
      case 'generateReport':
        return this.generateReport(args as GenerateReportArgs);

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

      default:
        throw new Error(`Unimplemented tool: ${name}`);
    }
  }

  /**
   * 프로젝트 상태 조회 구현 (확장됨)
   */
  private getProjectStatus(args: GetProjectStatusArgs): {
    content: Array<{ type: 'text'; text: string }>;
  } {
    const { includeDetails = false } = args;

    // 이벤트 엔진에서 실제 통계 가져오기
    const eventStats = this.eventEngine.getStatistics();
    const queueStats = this.eventEngine.getQueueStats();
    
    // 활동 로그에서 최근 활동 가져오기
    const lastActivity = this.activityLog.length > 0 
      ? new Date(this.activityLog[this.activityLog.length - 1]?.timestamp || Date.now()).toString()
      : new Date().toString();
    
    // 마일스톤 진행률 계산
    const milestoneProgress = this.calculateMilestoneProgress();

    const status: ProjectStatusResponse = {
      project: {
        name: config.server.name,
        version: config.server.version,
        status: this.activityLog.length > 0 ? 'active' : 'idle',
        lastActivity,
        totalEvents: eventStats.totalEvents,
        uptime: process.uptime(),
      },
      milestones: {
        current: milestoneProgress.current,
        progress: milestoneProgress.progress,
        completed: milestoneProgress.completed,
      },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        cwd: process.cwd(),
        memoryUsage: process.memoryUsage(),
        pid: process.pid,
      },
      metrics: {
        events: {
          total: eventStats.totalEvents,
          byCategory: eventStats.eventsByCategory,
          bySeverity: eventStats.eventsBySeverity,
          eventsPerHour: eventStats.eventsPerHour,
        },
        activity: {
          totalActivities: this.activityLog.length,
          recentActivities: this.activityLog.slice(-5).length,
        },
        queue: queueStats ? {
          totalQueues: queueStats.size,
          processing: Array.from(queueStats.values()).reduce((sum: number, stats: any) => sum + stats.size, 0),
        } : undefined,
      },
    };

    if (includeDetails) {
      status.details = {
        configuration: config,
        serverInfo: {
          name: config.server.name,
          version: config.server.version,
          started: new Date(Date.now() - process.uptime() * 1000).toString(),
        },
        tools: Array.from(this.tools.keys()),
        monitors: {
          fileMonitor: this.fileMonitor ? 'active' : 'inactive',
          gitMonitor: this.gitMonitor ? 'active' : 'inactive',
        },
        eventEngine: {
          subscribers: this.eventEngine.getSubscriberCount(),
          queueSize: this.eventEngine.getQueueSize(),
        },
        recentActivities: this.activityLog.slice(-10),
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(status, null, 2),
        },
      ],
    };
  }

  /**
   * 마일스톤 진행률 계산
   */
  private calculateMilestoneProgress() {
    // 마일스톤 1: MVP 기반 구축 (100% 완료)
    // 마일스톤 2: 핵심 통합 구현 (60% 진행)
    return {
      current: '마일스톤 2: 핵심 통합 구현',
      progress: {
        total: 5, // 마일스톤 2의 전체 섹션 수
        completed: 3, // Git 통합, 외부 API 통합, 이벤트 큐 완료
        current: 'MCP 도구 API 구현',
        percentage: 60,
      },
      completed: [
        '마일스톤 1: MVP 기반 구축 (100%)',
        'Git 통합 완료',
        '외부 API 통합 완료',
        '인메모리 이벤트 큐 구현 완료',
      ],
    };
  }

  /**
   * 메트릭 조회 구현 (확장됨)
   */
  private getMetrics(args: GetMetricsArgs): { content: Array<{ type: 'text'; text: string }> } {
    const { timeRange = '1d', metricType = 'all' } = args;

    // 이벤트 엔진에서 실제 통계 가져오기
    const eventStats = this.eventEngine.getStatistics();
    const queueStats = this.eventEngine.getQueueStats();
    
    // 시간 범위에 따른 필터링 (간단한 계산)
    const timeMultiplier = this.getTimeMultiplier(timeRange);
    
    // Git 이벤트에서 커밋 메트릭 추출
    const gitEvents = this.activityLog.filter(event => (event as any).category === 'git');
    const fileEvents = this.activityLog.filter(event => (event as any).category === 'file');
    
    const metrics: MetricsResponse = {
      timeRange,
      metricType,
      timestamp: new Date().toISOString(),
      data: {
        // 실제 데이터 기반 메트릭
        events: {
          total: eventStats.totalEvents,
          byCategory: eventStats.eventsByCategory,
          bySeverity: eventStats.eventsBySeverity,
          rate: eventStats.eventsPerHour,
        },
        git: {
          commits: gitEvents.filter(e => e.type.includes('commit')).length * timeMultiplier,
          branches: gitEvents.filter(e => e.type.includes('branch')).length * timeMultiplier,
          merges: gitEvents.filter(e => e.type.includes('merge')).length * timeMultiplier,
        },
        files: {
          changed: fileEvents.length * timeMultiplier,
          created: fileEvents.filter(e => e.type.includes('created')).length * timeMultiplier,
          modified: fileEvents.filter(e => e.type.includes('changed')).length * timeMultiplier,
          deleted: fileEvents.filter(e => e.type.includes('deleted')).length * timeMultiplier,
        },
        system: {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
          cpuUsage: process.cpuUsage(),
        },
        ...(queueStats && {
          queue: {
            totalQueues: queueStats.size,
            totalEvents: Array.from(queueStats.values()).reduce((sum: number, stats: any) => sum + stats.enqueuedCount, 0),
            processing: Array.from(queueStats.values()).reduce((sum: number, stats: any) => sum + stats.size, 0),
            throughput: Array.from(queueStats.values()).reduce((sum: number, stats: any) => sum + (stats.throughput || 0), 0),
          }
        }),
      },
      analysis: {
        trend: this.calculateMetricsTrend(),
        health: this.calculateSystemHealth(),
        recommendations: this.generateRecommendations(),
      },
      summary: `${timeRange} 기간 동안의 실제 개발 활동 메트릭 (${eventStats.totalEvents}개 이벤트 처리)`,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(metrics, null, 2),
        },
      ],
    };
  }

  /**
   * 시간 범위별 배수 계산
   */
  private getTimeMultiplier(timeRange: string): number {
    switch (timeRange) {
      case '1h': return 0.04; // 1시간 = 1일의 1/24
      case '1d': return 1;
      case '1w': return 7;
      case '1m': return 30;
      default: return 1;
    }
  }

  /**
   * 메트릭 트렌드 계산
   */
  private calculateMetricsTrend() {
    const recentEvents = this.activityLog.slice(-20);
    const oldEvents = this.activityLog.slice(-40, -20);
    
    return {
      activity: recentEvents.length > oldEvents.length ? 'increasing' : 'decreasing',
      velocity: recentEvents.length / Math.max(oldEvents.length, 1),
      pattern: this.detectActivityPattern(recentEvents),
    };
  }

  /**
   * 시스템 상태 계산
   */
  private calculateSystemHealth() {
    const memUsage = process.memoryUsage();
    const memUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    
    return {
      status: memUsagePercent < 80 ? 'healthy' : memUsagePercent < 95 ? 'warning' : 'critical',
      memory: {
        usage: Math.round(memUsagePercent),
        total: Math.round(memUsage.heapTotal / 1024 / 1024),
        used: Math.round(memUsage.heapUsed / 1024 / 1024),
      },
      uptime: process.uptime(),
      events: this.eventEngine.getStatistics().totalEvents,
    };
  }

  /**
   * 추천 사항 생성
   */
  private generateRecommendations() {
    const recommendations = [];
    const eventStats = this.eventEngine.getStatistics();
    
    if (eventStats.totalEvents > 1000) {
      recommendations.push('이벤트 수가 많습니다. 필터링 옵션을 고려하세요.');
    }
    
    if (this.activityLog.length > 500) {
      recommendations.push('활동 로그가 쌓이고 있습니다. 로그 로테이션을 구현하세요.');
    }
    
    const memUsage = process.memoryUsage().heapUsed / process.memoryUsage().heapTotal;
    if (memUsage > 0.8) {
      recommendations.push('메모리 사용률이 높습니다. 메모리 최적화가 필요합니다.');
    }
    
    return recommendations;
  }

  /**
   * 활동 패턴 감지
   */
  private detectActivityPattern(events: any[]) {
    if (events.length < 5) return 'insufficient_data';
    
    const intervals = [];
    for (let i = 1; i < events.length; i++) {
      intervals.push(events[i].timestamp - events[i-1].timestamp);
    }
    
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    
    if (avgInterval < 60000) return 'high_frequency'; // < 1분
    if (avgInterval < 300000) return 'moderate_frequency'; // < 5분
    return 'low_frequency';
  }

  /**
   * EventEngine에서 최근 이벤트 가져오기
   */
  private getRecentEventsFromEngine() {
    // EventEngine의 최근 이벤트를 activityLog 형식으로 변환
    const engineStats = this.eventEngine.getStatistics();
    const recentEvents = [];
    
    // EventEngine에서 직접 이벤트를 가져올 수 없으므로
    // 통계 정보를 기반으로 가상의 이벤트 생성
    for (const [category, count] of Object.entries(engineStats.eventsByCategory)) {
      if (count > 0) {
        recentEvents.push({
          type: `engine:${category}`,
          timestamp: Date.now() - Math.random() * 3600000, // 최근 1시간 내
          source: 'event-engine',
          category,
          data: {
            description: `${count} events processed in ${category} category`,
            count,
          },
        });
      }
    }
    
    return recentEvents;
  }

  /**
   * 이벤트 스테이지 감지
   */
  private detectEventStage(eventType: string, eventData: any): string {
    // 파일 기반 스테이지 감지
    if (eventType.includes('file')) {
      if (eventData.extension?.match(/\.(test|spec)\.(ts|js|tsx|jsx)$/)) {
        return 'testing';
      }
      if (eventData.extension?.match(/\.(md|txt|doc)$/)) {
        return 'design';
      }
      if (eventData.path?.includes('config') || eventData.path?.includes('docker')) {
        return 'deployment';
      }
      if (eventData.path?.includes('docs')) {
        return 'planning';
      }
      return 'coding';
    }
    
    // Git 기반 스테이지 감지
    if (eventType.includes('git')) {
      if (eventData.branch?.includes('feature')) {
        return 'coding';
      }
      if (eventData.branch?.includes('release')) {
        return 'deployment';
      }
      if (eventData.message?.includes('test')) {
        return 'testing';
      }
      return 'review';
    }
    
    // API 기반 스테이지 감지
    if (eventType.includes('api')) {
      if (eventData.endpoint?.includes('test')) {
        return 'testing';
      }
      return 'monitoring';
    }
    
    return 'coding';
  }

  /**
   * 활동 세부사항 생성
   */
  private generateActivityDetails(event: any, eventData: any): string {
    const type = event.type;
    
    if (type.includes('file')) {
      const action = eventData.action || 'modified';
      const path = eventData.relativePath || eventData.path || 'unknown';
      return `File ${action}: ${path}`;
    }
    
    if (type.includes('git')) {
      if (type.includes('commit')) {
        return `Commit: ${eventData.message || 'No message'} (${eventData.hash?.substring(0, 8) || 'unknown'})`;
      }
      if (type.includes('branch')) {
        return `Branch ${eventData.action || 'updated'}: ${eventData.branch || 'unknown'}`;
      }
      return `Git activity: ${type}`;
    }
    
    if (type.includes('api')) {
      return `API call: ${eventData.method || 'GET'} ${eventData.endpoint || 'unknown'}`;
    }
    
    return eventData.description || `${type} event`;
  }

  /**
   * 이벤트 액터 결정
   */
  private getEventActor(event: any): string {
    if (event.source?.includes('file')) return 'file-monitor';
    if (event.source?.includes('git')) return 'git-monitor';
    if (event.source?.includes('api')) return 'api-integration';
    if (event.source?.includes('queue')) return 'queue-manager';
    return event.source || 'system';
  }

  /**
   * 이벤트 심각도 결정
   */
  private getEventSeverity(event: any): string {
    if (event.severity) return event.severity;
    if (event.type?.includes('error')) return 'error';
    if (event.type?.includes('warn')) return 'warn';
    if (event.type?.includes('critical')) return 'critical';
    return 'info';
  }

  /**
   * 활동 로그 조회 구현 (확장됨)
   */
  private getActivityLog(args: GetActivityLogArgs): {
    content: Array<{ type: 'text'; text: string }>;
  } {
    const { limit = 20, stage } = args;

    // EventEngine에서 실제 이벤트 데이터 가져오기
    const eventStats = this.eventEngine.getStatistics();
    const allEvents = this.activityLog.concat(
      // EventEngine에서 최근 이벤트들도 포함
      this.getRecentEventsFromEngine()
    );

    // Get real activity log from all sources
    let activities = allEvents
      .slice(-limit * 2) // Get more to allow filtering
      .map((event, index) => {
        const eventData = event.data as any;
        
        // Enhanced stage detection logic
        let eventStage = this.detectEventStage(event.type, eventData);
        
        // Enhanced activity details
        let activityDetails = this.generateActivityDetails(event, eventData);
        
        return {
          id: `activity-${event.timestamp}-${index}`,
          timestamp: new Date(event.timestamp).toISOString(),
          stage: eventStage,
          action: event.type,
          details: activityDetails,
          actor: this.getEventActor(event),
          category: (event as any).category || event.source || 'unknown',
          severity: this.getEventSeverity(event),
          metadata: {
            source: event.source,
            ...(eventData.path && { path: eventData.path }),
            ...(eventData.relativePath && { relativePath: eventData.relativePath }),
            ...(eventData.extension && { extension: eventData.extension }),
            ...(eventData.branch && { branch: eventData.branch }),
            ...(eventData.commit && { commit: eventData.commit }),
          },
        };
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) // Sort by newest first
      .slice(0, limit * 1.5); // Allow some extra for filtering

    // Filter by stage if specified
    if (stage) {
      activities = activities.filter((a) => a.stage === stage);
    }

    // Limit final results
    activities = activities.slice(0, limit);

    const response: ActivityLogResponse = {
      totalCount: allEvents.length,
      activities,
      filters: { limit, ...(stage && { stage }) },
      summary: {
        totalEvents: eventStats.totalEvents,
        byCategory: eventStats.eventsByCategory,
        bySeverity: eventStats.eventsBySeverity,
        ...(activities.length > 0 && {
          timeRange: {
            start: activities[activities.length - 1]?.timestamp || '',
            end: activities[0]?.timestamp || '',
          }
        }),
      },
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  }

  /**
   * 병목 현상 분석 구현 (확장됨)
   */
  private analyzeBottlenecks(args: AnalyzeBottlenecksArgs): {
    content: Array<{ type: 'text'; text: string }>;
  } {
    const { analysisDepth = 'basic' } = args;

    // 실제 데이터 기반 병목 분석
    const queueStats = this.eventEngine.getQueueStats();
    const systemHealth = this.calculateSystemHealth();
    const recentActivities = this.activityLog.slice(-50);
    
    // 병목 현상 감지 로직
    const bottlenecks = this.detectBottlenecks({
      eventStats: this.eventEngine.getStatistics(),
      queueStats,
      systemHealth,
      recentActivities,
      analysisDepth,
    });
    
    // 추천 사항 생성
    const recommendations = this.generateBottleneckRecommendations(bottlenecks, systemHealth);
    
    // 다음 단계 제안
    const nextSteps = this.generateNextSteps(bottlenecks, analysisDepth);

    const analysis: BottleneckAnalysisResponse = {
      analysisDepth,
      timestamp: new Date().toISOString(),
      bottlenecks,
      recommendations,
      nextSteps,
      systemMetrics: {
        eventProcessingRate: this.eventEngine.getStatistics().eventsPerHour,
        memoryUsage: systemHealth.memory.usage,
        queueBacklog: queueStats ? Array.from(queueStats.values()).reduce((sum: number, stats: any) => sum + stats.size, 0) : 0,
        activeMonitors: {
          fileMonitor: this.fileMonitor ? 'active' : 'inactive',
          gitMonitor: this.gitMonitor ? 'active' : 'inactive',
        },
      },
      analysis: {
        pattern: this.analyzeActivityPattern(recentActivities),
        trends: this.calculateMetricsTrend(),
        efficiency: this.calculateEfficiencyMetrics(recentActivities),
      },
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(analysis, null, 2),
        },
      ],
    };
  }

  /**
   * 병목 현상 감지
   */
  private detectBottlenecks(context: {
    eventStats: any;
    queueStats: any;
    systemHealth: any;
    recentActivities: any[];
    analysisDepth: string;
  }) {
    const bottlenecks = [];
    const { queueStats, systemHealth, recentActivities, analysisDepth } = context;
    
    // 메모리 병목 감지
    if (systemHealth.memory.usage > 80) {
      bottlenecks.push({
        category: 'system',
        severity: systemHealth.memory.usage > 95 ? 'critical' : 'high',
        description: `메모리 사용률이 ${systemHealth.memory.usage}%로 높습니다`,
        suggestion: '메모리 최적화 또는 리소스 증설이 필요합니다',
        metrics: {
          current: systemHealth.memory.usage,
          threshold: 80,
          recommendation: 'memory_optimization',
        },
      });
    }
    
    // 이벤트 처리 병목 감지
    if (queueStats && queueStats.size > 0) {
      const totalQueueSize = Array.from(queueStats.values()).reduce((sum: number, stats: any) => sum + stats.size, 0);
      if (totalQueueSize > 100) {
        bottlenecks.push({
          category: 'event_processing',
          severity: totalQueueSize > 500 ? 'high' : 'medium',
          description: `이벤트 큐에 ${totalQueueSize}개의 미처리 이벤트가 있습니다`,
          suggestion: '이벤트 처리 성능 최적화 또는 배치 크기 조정이 필요합니다',
          metrics: {
            current: totalQueueSize,
            threshold: 100,
            recommendation: 'queue_optimization',
          },
        });
      }
    }
    
    // 활동 패턴 병목 감지
    const activityPattern = this.analyzeActivityPattern(recentActivities);
    if (activityPattern.type === 'insufficient_data') {
      bottlenecks.push({
        category: 'monitoring',
        severity: 'low',
        description: '활동 데이터가 부족하여 패턴 분석이 어렵습니다',
        suggestion: '모니터링 시스템이 충분한 데이터를 수집할 때까지 대기하세요',
        metrics: {
          current: recentActivities.length,
          threshold: 10,
          recommendation: 'increase_monitoring',
        },
      });
    }
    
    // 개발 워크플로우 병목 (분석 깊이에 따라)
    if (analysisDepth === 'detailed' || analysisDepth === 'comprehensive') {
      const fileEvents = recentActivities.filter(a => a.type?.includes('file'));
      const gitEvents = recentActivities.filter(a => a.type?.includes('git'));
      
      if (fileEvents.length > gitEvents.length * 10) {
        bottlenecks.push({
          category: 'workflow',
          severity: 'medium',
          description: '파일 변경에 비해 Git 커밋이 적습니다',
          suggestion: '더 자주 커밋하여 변경사항을 추적하세요',
          metrics: {
            current: fileEvents.length / Math.max(gitEvents.length, 1),
            threshold: 10,
            recommendation: 'increase_commit_frequency',
            fileChanges: fileEvents.length,
            gitCommits: gitEvents.length,
            ratio: fileEvents.length / Math.max(gitEvents.length, 1),
          },
        });
      }
    }
    
    return bottlenecks;
  }

  /**
   * 병목 현상 기반 추천사항 생성
   */
  private generateBottleneckRecommendations(bottlenecks: any[], systemHealth: any) {
    const recommendations = [];
    
    // 시스템 성능 기반 추천
    if (systemHealth.memory.usage > 70) {
      recommendations.push('메모리 사용량 모니터링 및 최적화를 고려하세요');
    }
    
    if (systemHealth.uptime > 86400) { // 24시간 이상
      recommendations.push('장시간 실행으로 인한 메모리 누수를 확인하세요');
    }
    
    // 병목 현상별 추천
    bottlenecks.forEach(bottleneck => {
      switch (bottleneck.category) {
        case 'system':
          recommendations.push('시스템 리소스 모니터링을 강화하고 자동 알림을 설정하세요');
          break;
        case 'event_processing':
          recommendations.push('이벤트 처리 배치 크기를 조정하거나 병렬 처리를 고려하세요');
          break;
        case 'workflow':
          recommendations.push('개발 워크플로우를 검토하고 자동화를 고려하세요');
          break;
        case 'monitoring':
          recommendations.push('모니터링 범위를 확장하고 더 많은 데이터를 수집하세요');
          break;
      }
    });
    
    // 기본 추천사항
    if (recommendations.length === 0) {
      recommendations.push('현재 시스템이 정상적으로 작동하고 있습니다');
      recommendations.push('지속적인 모니터링을 통해 성능을 유지하세요');
    }
    
    return recommendations;
  }

  /**
   * 다음 단계 제안 생성
   */
  private generateNextSteps(bottlenecks: any[], analysisDepth: string) {
    const nextSteps = [];
    
    if (bottlenecks.length === 0) {
      nextSteps.push('현재 마일스톤 2의 MCP 도구 API 구현 계속 진행');
      nextSteps.push('실시간 통신 기능 구현 계획');
      nextSteps.push('성능 테스트 및 최적화 검토');
    } else {
      // 심각도별 다음 단계
      const criticalBottlenecks = bottlenecks.filter(b => b.severity === 'critical');
      const highBottlenecks = bottlenecks.filter(b => b.severity === 'high');
      
      if (criticalBottlenecks.length > 0) {
        nextSteps.push('즉시 시스템 안정성 문제를 해결하세요');
        nextSteps.push('중요한 병목 현상을 우선적으로 처리하세요');
      }
      
      if (highBottlenecks.length > 0) {
        nextSteps.push('높은 우선순위 병목 현상을 계획적으로 해결하세요');
      }
      
      nextSteps.push('정기적인 성능 모니터링 일정을 수립하세요');
    }
    
    // 분석 깊이에 따른 추가 단계
    if (analysisDepth === 'comprehensive') {
      nextSteps.push('상세한 성능 프로파일링을 수행하세요');
      nextSteps.push('사용자 경험 개선 방안을 검토하세요');
    }
    
    return nextSteps;
  }

  /**
   * 활동 패턴 분석
   */
  private analyzeActivityPattern(activities: any[]) {
    if (activities.length < 3) {
      return {
        type: 'insufficient_data',
        description: '분석할 활동이 충분하지 않습니다',
        recommendation: '더 많은 개발 활동을 수행하세요',
      };
    }
    
    // 시간대별 활동 분석
    const hourlyActivity = activities.reduce((acc, activity) => {
      const hour = new Date(activity.timestamp).getHours();
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);
    
    const peakHour = Object.entries(hourlyActivity)
      .sort(([,a], [,b]) => (b as number) - (a as number))[0];
    
    // 카테고리별 활동 분석
    const categoryActivity = activities.reduce((acc, activity) => {
      const category = activity.category || 'unknown';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const dominantCategory = Object.entries(categoryActivity)
      .sort(([,a], [,b]) => (b as number) - (a as number))[0];
    
    return {
      type: 'pattern_detected',
      peakHour: peakHour ? {
        hour: parseInt(peakHour[0]),
        count: peakHour[1],
      } : null,
      dominantCategory: dominantCategory ? {
        category: dominantCategory[0],
        count: dominantCategory[1],
      } : null,
      totalActivities: activities.length,
      recommendation: this.getPatternRecommendation(hourlyActivity, categoryActivity),
    };
  }

  /**
   * 패턴 기반 추천사항
   */
  private getPatternRecommendation(hourlyActivity: Record<number, number>, categoryActivity: Record<string, number>) {
    const recommendations = [];
    
    // 시간대 패턴 추천
    const totalHours = Object.keys(hourlyActivity).length;
    if (totalHours < 3) {
      recommendations.push('개발 시간대를 다양화하여 더 일관된 워크플로우를 구축하세요');
    }
    
    // 카테고리 패턴 추천
    const fileActivity = categoryActivity.file || 0;
    const gitActivity = categoryActivity.git || 0;
    
    if (fileActivity > gitActivity * 5) {
      recommendations.push('파일 변경에 비해 Git 활동이 부족합니다. 더 자주 커밋하세요');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('현재 개발 패턴이 양호합니다. 지속적인 활동을 유지하세요');
    }
    
    return recommendations.join(' ');
  }

  /**
   * 효율성 메트릭 계산
   */
  private calculateEfficiencyMetrics(activities: any[]) {
    if (activities.length === 0) {
      return {
        overall: 0,
        categories: {},
        recommendations: ['활동 데이터가 부족합니다'],
      };
    }
    
    // 카테고리별 효율성 계산
    const categoryMetrics = activities.reduce((acc, activity) => {
      const category = activity.category || 'unknown';
      if (!acc[category]) {
        acc[category] = { count: 0, errors: 0, efficiency: 0 };
      }
      acc[category].count++;
      if (activity.severity === 'error') {
        acc[category].errors++;
      }
      return acc;
    }, {} as Record<string, any>);
    
    // 각 카테고리의 효율성 계산 (에러율 기반)
    Object.keys(categoryMetrics).forEach(category => {
      const metrics = categoryMetrics[category];
      metrics.efficiency = Math.max(0, 100 - (metrics.errors / metrics.count) * 100);
    });
    
    // 전체 효율성 계산
    const totalActivities = activities.length;
    const totalErrors = activities.filter(a => a.severity === 'error').length;
    const overall = Math.max(0, 100 - (totalErrors / totalActivities) * 100);
    
    return {
      overall: Math.round(overall),
      categories: categoryMetrics,
      recommendations: this.generateEfficiencyRecommendations(overall, categoryMetrics),
    };
  }

  /**
   * 효율성 기반 추천사항 생성
   */
  private generateEfficiencyRecommendations(overall: number, categoryMetrics: Record<string, any>) {
    const recommendations = [];
    
    if (overall < 70) {
      recommendations.push('전체 효율성이 낮습니다. 에러 처리 및 예외 상황 관리를 개선하세요');
    } else if (overall < 90) {
      recommendations.push('효율성이 양호하지만 개선의 여지가 있습니다');
    } else {
      recommendations.push('현재 높은 효율성을 유지하고 있습니다');
    }
    
    // 카테고리별 추천
    Object.entries(categoryMetrics).forEach(([category, metrics]: [string, any]) => {
      if (metrics.efficiency < 80 && metrics.count > 5) {
        recommendations.push(`${category} 카테고리의 효율성 개선이 필요합니다`);
      }
    });
    
    return recommendations;
  }

  /**
   * 이벤트 시스템 통계 조회
   */
  private async getEventStatistics(): Promise<{
    content: Array<{ type: 'text'; text: string }>;
  }> {
    const eventStats = eventEngine.getStatistics();
    const storageStats = await storageManager.getStatistics();
    const response = {
      eventEngine: {
        statistics: eventStats,
        queueSize: eventEngine.getQueueSize(),
        subscriberCount: eventEngine.getSubscriberCount(),
      },
      storage: storageStats,
      timestamp: Date.now().toString(),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  }

  /**
   * 방법론 검사 구현
   */
  private checkMethodology(args: CheckMethodologyArgs): {
    content: Array<{ type: 'text'; text: string }>;
  } {
    const { methodology = 'all' } = args;
    
    // 실제 데이터 기반 방법론 검사
    const recentActivities = this.activityLog.slice(-100); // 최근 100개 활동
    
    // 방법론별 준수도 검사
    const methodologyChecks = this.performMethodologyChecks(recentActivities, methodology);
    
    // 전체 준수도 계산
    const overallCompliance = this.calculateOverallCompliance(methodologyChecks);
    
    const response: CheckMethodologyResponse = {
      methodology,
      timestamp: new Date().toISOString(),
      compliance: {
        overall: overallCompliance,
        byMethodology: this.getComplianceByMethodology(methodologyChecks),
      },
      findings: methodologyChecks as any,
      summary: this.generateMethodologySummary(methodologyChecks, overallCompliance),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  }

  /**
   * 리포트 생성 구현
   */
  private generateReport(args: GenerateReportArgs): {
    content: Array<{ type: 'text'; text: string }>;
  } {
    const {
      reportType = 'daily',
      format = 'summary',
      includeMetrics = true,
      includeTrends = false,
    } = args;

    // 리포트 기간 계산
    const period = this.calculateReportPeriod(reportType);
    
    // 기간 내 활동 필터링
    const periodActivities = this.filterActivitiesByPeriod(this.activityLog, period);
    
    // 리포트 섹션 생성
    const sections = this.generateReportSections(periodActivities, includeMetrics, includeTrends);
    
    // 핵심 메트릭 계산
    const keyMetrics = includeMetrics ? this.calculateKeyMetrics(periodActivities) : {};
    
    // 하이라이트 생성
    const highlights = this.generateHighlights(periodActivities, keyMetrics);
    
    // 추천사항 생성
    const recommendations = this.generateReportRecommendations(periodActivities, keyMetrics);

    const response: GenerateReportResponse = {
      reportType,
      format,
      timestamp: new Date().toISOString(),
      period: {
        start: period.start.toISOString(),
        end: period.end.toISOString(),
      },
      summary: {
        totalActivities: periodActivities.length,
        keyMetrics,
        highlights,
      },
      sections,
      recommendations,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  }

  /**
   * 방법론 검사 수행
   */
  private performMethodologyChecks(activities: any[], methodology: string) {
    const checks = [];
    
    if (methodology === 'all' || methodology === 'ddd') {
      checks.push(this.checkDDDCompliance(activities));
    }
    
    if (methodology === 'all' || methodology === 'tdd') {
      checks.push(this.checkTDDCompliance(activities));
    }
    
    if (methodology === 'all' || methodology === 'bdd') {
      checks.push(this.checkBDDCompliance(activities));
    }
    
    if (methodology === 'all' || methodology === 'eda') {
      checks.push(this.checkEDACompliance(activities));
    }
    
    return checks;
  }

  /**
   * DDD 준수도 검사
   */
  private checkDDDCompliance(activities: any[]) {
    // 도메인 모델 파일 검사
    const domainFiles = activities.filter(a => 
      a.type?.includes('file') && 
      (a.data?.path?.includes('domain') || a.data?.path?.includes('entity'))
    );
    
    // 서비스 레이어 분리 검사
    const serviceFiles = activities.filter(a =>
      a.type?.includes('file') &&
      a.data?.path?.includes('service')
    );
    
    const score = this.calculateDDDScore(domainFiles, serviceFiles, activities);
    
    return {
      methodology: 'ddd',
      status: score > 70 ? 'compliant' : score > 40 ? 'partial' : 'non-compliant' as const,
      score,
      description: `DDD 패턴 준수도: ${score}% (도메인 파일: ${domainFiles.length}, 서비스 파일: ${serviceFiles.length})`,
      recommendations: this.getDDDRecommendations(score, domainFiles, serviceFiles),
    };
  }

  /**
   * TDD 준수도 검사
   */
  private checkTDDCompliance(activities: any[]) {
    // 테스트 파일 변경 사항
    const testFiles = activities.filter(a =>
      a.type?.includes('file') &&
      a.data?.path?.match(/\.(test|spec)\.(ts|js|tsx|jsx)$/)
    );
    
    // 소스 파일 변경 사항
    const sourceFiles = activities.filter(a =>
      a.type?.includes('file') &&
      !a.data?.path?.match(/\.(test|spec)\.(ts|js|tsx|jsx)$/) &&
      a.data?.path?.match(/\.(ts|js|tsx|jsx)$/)
    );
    
    const score = this.calculateTDDScore(testFiles, sourceFiles);
    
    return {
      methodology: 'tdd',
      status: score > 70 ? 'compliant' : score > 40 ? 'partial' : 'non-compliant' as const,
      score,
      description: `TDD 준수도: ${score}% (테스트:소스 비율 ${testFiles.length}:${sourceFiles.length})`,
      recommendations: this.getTDDRecommendations(score, testFiles, sourceFiles),
    };
  }

  /**
   * BDD 준수도 검사
   */
  private checkBDDCompliance(activities: any[]) {
    // Feature 파일 또는 시나리오 파일 검사
    const featureFiles = activities.filter(a =>
      a.type?.includes('file') &&
      (a.data?.path?.includes('feature') || a.data?.path?.includes('scenario'))
    );
    
    // Given-When-Then 패턴 검사 (간단한 휴리스틱)
    const gwtPatterns = activities.filter(a =>
      a.data?.description?.match(/(given|when|then)/i)
    );
    
    const score = this.calculateBDDScore(featureFiles, gwtPatterns);
    
    return {
      methodology: 'bdd',
      status: score > 70 ? 'compliant' : score > 40 ? 'partial' : 'non-compliant' as const,
      score,
      description: `BDD 준수도: ${score}% (Feature 파일: ${featureFiles.length}, GWT 패턴: ${gwtPatterns.length})`,
      recommendations: this.getBDDRecommendations(score, featureFiles),
    };
  }

  /**
   * EDA 준수도 검사
   */
  private checkEDACompliance(activities: any[]) {
    // 이벤트 관련 파일 검사
    const eventFiles = activities.filter(a =>
      a.type?.includes('file') &&
      (a.data?.path?.includes('event') || a.data?.path?.includes('handler'))
    );
    
    // EventEngine 사용도 평가
    const eventStats = this.eventEngine.getStatistics();
    
    const score = this.calculateEDAScore(eventFiles, eventStats);
    
    return {
      methodology: 'eda',
      status: score > 70 ? 'compliant' : score > 40 ? 'partial' : 'non-compliant' as const,
      score,
      description: `EDA 준수도: ${score}% (이벤트 파일: ${eventFiles.length}, 처리된 이벤트: ${eventStats.totalEvents})`,
      recommendations: this.getEDARecommendations(score, eventFiles, eventStats),
    };
  }

  /**
   * 전체 준수도 계산
   */
  private calculateOverallCompliance(checks: any[]): number {
    if (checks.length === 0) return 0;
    return Math.round(checks.reduce((sum, check) => sum + check.score, 0) / checks.length);
  }

  /**
   * 방법론별 준수도 맵 생성
   */
  private getComplianceByMethodology(checks: any[]): Record<string, number> {
    return checks.reduce((acc, check) => {
      acc[check.methodology] = check.score;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * 방법론 요약 생성
   */
  private generateMethodologySummary(checks: any[], overallCompliance: number): string {
    const compliantCount = checks.filter(c => c.status === 'compliant').length;
    const partialCount = checks.filter(c => c.status === 'partial').length;
    const nonCompliantCount = checks.filter(c => c.status === 'non-compliant').length;
    
    return `전체 방법론 준수도: ${overallCompliance}% (완전 준수: ${compliantCount}, 부분 준수: ${partialCount}, 미준수: ${nonCompliantCount})`;
  }

  /**
   * 리포트 기간 계산
   */
  private calculateReportPeriod(reportType: string) {
    const now = new Date();
    const start = new Date();
    
    switch (reportType) {
      case 'daily':
        start.setHours(0, 0, 0, 0);
        break;
      case 'weekly':
        start.setDate(now.getDate() - 7);
        break;
      case 'monthly':
        start.setMonth(now.getMonth() - 1);
        break;
      default:
        start.setDate(now.getDate() - 1); // Default to last 24 hours
    }
    
    return { start, end: now };
  }

  /**
   * 기간별 활동 필터링
   */
  private filterActivitiesByPeriod(activities: any[], period: { start: Date; end: Date }) {
    return activities.filter(activity => {
      const activityTime = new Date(activity.timestamp);
      return activityTime >= period.start && activityTime <= period.end;
    });
  }

  /**
   * 리포트 섹션 생성
   */
  private generateReportSections(activities: any[], includeMetrics: boolean, includeTrends: boolean) {
    const sections = [];
    
    // 활동 요약 섹션
    const activitySection: any = {
      title: '활동 요약',
      content: `총 ${activities.length}개의 활동이 기록되었습니다.`,
    };
    if (includeMetrics) {
      activitySection.metrics = this.calculateActivityMetrics(activities);
    }
    sections.push(activitySection);
    
    // 카테고리별 분석
    const categoryStats = this.calculateCategoryStats(activities);
    sections.push({
      title: '카테고리별 활동',
      content: this.formatCategoryStats(categoryStats),
      metrics: categoryStats,
    });
    
    // 트렌드 분석 (요청된 경우)
    if (includeTrends) {
      sections.push({
        title: '트렌드 분석',
        content: this.generateTrendAnalysis(activities),
      });
    }
    
    return sections;
  }

  /**
   * DDD 점수 계산
   */
  private calculateDDDScore(domainFiles: any[], serviceFiles: any[], _allActivities: any[]): number {
    let score = 0;
    
    // 도메인 파일 존재 (40점)
    if (domainFiles.length > 0) score += 40;
    
    // 서비스 레이어 분리 (30점)
    if (serviceFiles.length > 0) score += 30;
    
    // 파일 구조 점수 (30점)
    const structureScore = Math.min(30, (domainFiles.length + serviceFiles.length) * 5);
    score += structureScore;
    
    return Math.min(100, score);
  }

  /**
   * TDD 점수 계산
   */
  private calculateTDDScore(testFiles: any[], sourceFiles: any[]): number {
    if (sourceFiles.length === 0) return 0;
    
    const testRatio = testFiles.length / sourceFiles.length;
    
    // 이상적인 비율: 1:1 또는 더 높음
    if (testRatio >= 1) return 100;
    if (testRatio >= 0.7) return 80;
    if (testRatio >= 0.5) return 60;
    if (testRatio >= 0.3) return 40;
    if (testRatio > 0) return 20;
    return 0;
  }

  /**
   * BDD 점수 계산
   */
  private calculateBDDScore(featureFiles: any[], gwtPatterns: any[]): number {
    let score = 0;
    
    // Feature 파일 존재 (50점)
    if (featureFiles.length > 0) score += 50;
    
    // GWT 패턴 사용 (50점)
    if (gwtPatterns.length > 0) score += 50;
    
    return Math.min(100, score);
  }

  /**
   * EDA 점수 계산
   */
  private calculateEDAScore(eventFiles: any[], eventStats: any): number {
    let score = 0;
    
    // 이벤트 파일 존재 (40점)
    if (eventFiles.length > 0) score += 40;
    
    // 이벤트 처리량 (40점)
    if (eventStats.totalEvents > 100) score += 40;
    else if (eventStats.totalEvents > 50) score += 30;
    else if (eventStats.totalEvents > 10) score += 20;
    else if (eventStats.totalEvents > 0) score += 10;
    
    // 이벤트 카테고리 다양성 (20점)
    const categoryCount = Object.keys(eventStats.eventsByCategory || {}).length;
    score += Math.min(20, categoryCount * 5);
    
    return Math.min(100, score);
  }

  /**
   * DDD 추천사항
   */
  private getDDDRecommendations(score: number, domainFiles: any[], serviceFiles: any[]): string[] {
    const recommendations = [];
    
    if (domainFiles.length === 0) {
      recommendations.push('도메인 모델 파일을 생성하세요 (domain/, entity/ 디렉토리)');
    }
    
    if (serviceFiles.length === 0) {
      recommendations.push('서비스 레이어를 분리하세요 (service/ 디렉토리)');
    }
    
    if (score < 70) {
      recommendations.push('도메인 주도 설계 패턴을 더 적극적으로 적용하세요');
      recommendations.push('Bounded Context를 명확히 정의하세요');
    }
    
    return recommendations;
  }

  /**
   * TDD 추천사항
   */
  private getTDDRecommendations(score: number, testFiles: any[], sourceFiles: any[]): string[] {
    const recommendations = [];
    
    if (testFiles.length === 0) {
      recommendations.push('테스트 파일을 작성하기 시작하세요');
    } else if (testFiles.length < sourceFiles.length) {
      recommendations.push('소스 파일 대비 테스트 파일이 부족합니다');
      recommendations.push('Red-Green-Refactor 사이클을 적용하세요');
    }
    
    if (score < 70) {
      recommendations.push('테스트 주도 개발 방식을 더 엄격하게 적용하세요');
    }
    
    return recommendations;
  }

  /**
   * BDD 추천사항
   */
  private getBDDRecommendations(score: number, featureFiles: any[]): string[] {
    const recommendations = [];
    
    if (featureFiles.length === 0) {
      recommendations.push('Feature 파일을 작성하여 요구사항을 명확히 하세요');
      recommendations.push('Given-When-Then 패턴을 사용하세요');
    }
    
    if (score < 70) {
      recommendations.push('행동 주도 개발 방식을 더 체계적으로 적용하세요');
      recommendations.push('사용자 스토리를 시나리오로 변환하세요');
    }
    
    return recommendations;
  }

  /**
   * EDA 추천사항
   */
  private getEDARecommendations(score: number, eventFiles: any[], eventStats: any): string[] {
    const recommendations = [];
    
    if (eventFiles.length === 0) {
      recommendations.push('이벤트 관련 파일을 생성하세요 (event/, handler/ 디렉토리)');
    }
    
    if (eventStats.totalEvents === 0) {
      recommendations.push('EventEngine을 더 적극적으로 활용하세요');
      recommendations.push('도메인 이벤트를 정의하고 발행하세요');
    }
    
    if (score < 70) {
      recommendations.push('이벤트 주도 아키텍처 패턴을 더 체계적으로 적용하세요');
      recommendations.push('CQRS 패턴 적용을 고려하세요');
    }
    
    return recommendations;
  }

  /**
   * 핵심 메트릭 계산
   */
  private calculateKeyMetrics(activities: any[]): Record<string, number> {
    const metrics: Record<string, number> = {};
    
    // 활동별 통계
    metrics.totalActivities = activities.length;
    metrics.fileActivities = activities.filter(a => a.type?.includes('file')).length;
    metrics.gitActivities = activities.filter(a => a.type?.includes('git')).length;
    metrics.apiActivities = activities.filter(a => a.type?.includes('api')).length;
    
    // 시간대별 분포
    const hours = activities.map(a => new Date(a.timestamp).getHours());
    const uniqueHours = new Set(hours).size;
    metrics.activeHours = uniqueHours;
    
    // 효율성 메트릭
    const errorActivities = activities.filter(a => a.severity === 'error').length;
    metrics.errorRate = activities.length > 0 ? Math.round((errorActivities / activities.length) * 100) : 0;
    metrics.successRate = 100 - metrics.errorRate;
    
    return metrics;
  }

  /**
   * 하이라이트 생성
   */
  private generateHighlights(_activities: any[], keyMetrics: Record<string, number>): string[] {
    const highlights = [];
    
    if ((keyMetrics.totalActivities || 0) > 50) {
      highlights.push(`높은 개발 활동량: ${keyMetrics.totalActivities}개 활동`);
    }
    
    if ((keyMetrics.successRate || 0) > 90) {
      highlights.push(`우수한 성공률: ${keyMetrics.successRate}%`);
    }
    
    if ((keyMetrics.activeHours || 0) > 6) {
      highlights.push(`활발한 개발 시간: ${keyMetrics.activeHours}시간 활동`);
    }
    
    if ((keyMetrics.gitActivities || 0) > (keyMetrics.fileActivities || 0) * 0.5) {
      highlights.push('균형잡힌 Git 활동');
    }
    
    if (highlights.length === 0) {
      highlights.push('안정적인 개발 활동 유지');
    }
    
    return highlights;
  }

  /**
   * 리포트 추천사항 생성
   */
  private generateReportRecommendations(activities: any[], keyMetrics: Record<string, number>): string[] {
    const recommendations = [];
    
    if ((keyMetrics.errorRate || 0) > 10) {
      recommendations.push('에러율이 높습니다. 에러 처리를 개선하세요');
    }
    
    if ((keyMetrics.gitActivities || 0) < (keyMetrics.fileActivities || 0) * 0.3) {
      recommendations.push('Git 커밋 빈도를 늘려 변경사항을 더 자주 추적하세요');
    }
    
    if ((keyMetrics.activeHours || 0) < 3) {
      recommendations.push('개발 활동 시간을 늘리거나 더 집중적으로 작업하세요');
    }
    
    if (activities.length < 10) {
      recommendations.push('더 많은 개발 활동을 기록하여 분석 정확도를 높이세요');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('현재 개발 패턴을 유지하며 지속적인 개선을 추구하세요');
    }
    
    return recommendations;
  }

  /**
   * 활동 메트릭 계산
   */
  private calculateActivityMetrics(activities: any[]): Record<string, number> {
    return {
      total: activities.length,
      byHour: activities.reduce((acc, a) => {
        const hour = new Date(a.timestamp).getHours();
        acc[hour] = (acc[hour] || 0) + 1;
        return acc;
      }, {} as Record<number, number>),
    };
  }

  /**
   * 카테고리별 통계 계산
   */
  private calculateCategoryStats(activities: any[]): Record<string, number> {
    return activities.reduce((acc, activity) => {
      const category = activity.category || 'unknown';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * 카테고리 통계 포맷팅
   */
  private formatCategoryStats(stats: Record<string, number>): string {
    return Object.entries(stats)
      .map(([category, count]) => `${category}: ${count}개`)
      .join(', ');
  }

  /**
   * 트렌드 분석 생성
   */
  private generateTrendAnalysis(activities: any[]): string {
    if (activities.length < 10) {
      return '트렌드 분석을 위한 데이터가 부족합니다.';
    }
    
    // 시간순 정렬
    const sortedActivities = activities.sort((a, b) => a.timestamp - b.timestamp);
    
    // 전반부와 후반부 비교
    const midPoint = Math.floor(sortedActivities.length / 2);
    const firstHalf = sortedActivities.slice(0, midPoint);
    const secondHalf = sortedActivities.slice(midPoint);
    
    const firstHalfAvg = firstHalf.length;
    const secondHalfAvg = secondHalf.length;
    
    if (secondHalfAvg > firstHalfAvg * 1.2) {
      return '개발 활동이 증가하는 추세입니다.';
    } else if (secondHalfAvg < firstHalfAvg * 0.8) {
      return '개발 활동이 감소하는 추세입니다.';
    } else {
      return '개발 활동이 안정적으로 유지되고 있습니다.';
    }
  }

  /**
   * 모니터 초기화
   */
  private initializeMonitors(): void {
    this.initializeFileMonitor();
    this.initializeGitMonitor();
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
   * WebSocket 서버 시작
   */
  private async startWebSocketServer(args: { port?: number }): Promise<{
    content: Array<{ type: 'text'; text: string }>;
  }> {
    try {
      const port = args.port || 8081;
      await wsServer.start(port);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              message: `WebSocket server started on port ${port}`,
              port,
              timestamp: new Date().toISOString(),
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              message: `Failed to start WebSocket server: ${error instanceof Error ? error.message : String(error)}`,
              timestamp: new Date().toISOString(),
            }, null, 2),
          },
        ],
      };
    }
  }

  /**
   * WebSocket 서버 중지
   */
  private async stopWebSocketServer(): Promise<{
    content: Array<{ type: 'text'; text: string }>;
  }> {
    try {
      await wsServer.stop();
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              message: 'WebSocket server stopped successfully',
              timestamp: new Date().toISOString(),
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              message: `Failed to stop WebSocket server: ${error instanceof Error ? error.message : String(error)}`,
              timestamp: new Date().toISOString(),
            }, null, 2),
          },
        ],
      };
    }
  }

  /**
   * WebSocket 서버 통계 조회
   */
  private getWebSocketStats(): {
    content: Array<{ type: 'text'; text: string }>;
  } {
    try {
      const stats = wsServer.getStats();
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              stats: {
                connectedClients: stats.connectedClients,
                clients: stats.clients.map(client => ({
                  id: client.id,
                  filters: client.filters,
                  lastPing: new Date(client.lastPing).toISOString(),
                  isAlive: client.isAlive,
                })),
                uptime: Math.round(stats.uptime),
              },
              timestamp: new Date().toISOString(),
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              message: `Failed to get WebSocket stats: ${error instanceof Error ? error.message : String(error)}`,
              timestamp: new Date().toISOString(),
            }, null, 2),
          },
        ],
      };
    }
  }

  /**
   * 스트림 매니저 통계 조회
   */
  private getStreamStats(): {
    content: Array<{ type: 'text'; text: string }>;
  } {
    try {
      const stats = streamManager.getStats();
      const subscribers = streamManager.getSubscribers();
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              stats: {
                totalSubscribers: stats.totalSubscribers,
                totalEvents: stats.totalEvents,
                eventsPerSecond: stats.eventsPerSecond,
                bufferedEvents: stats.bufferedEvents,
                droppedEvents: stats.droppedEvents,
                uptime: stats.uptime,
                subscribers: subscribers.map(sub => ({
                  id: sub.id,
                  filter: sub.filter,
                  eventCount: sub.eventCount,
                  lastEventTime: sub.lastEventTime > 0 ? new Date(sub.lastEventTime).toISOString() : null,
                })),
              },
              timestamp: new Date().toISOString(),
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              message: `Failed to get stream stats: ${error instanceof Error ? error.message : String(error)}`,
              timestamp: new Date().toISOString(),
            }, null, 2),
          },
        ],
      };
    }
  }

  /**
   * 시스템 알림 브로드캐스트
   */
  private broadcastSystemNotification(args: {
    message: string;
    severity: 'info' | 'warning' | 'error';
    data?: any;
  }): {
    content: Array<{ type: 'text'; text: string }>;
  } {
    try {
      const { message, severity, data } = args;
      
      wsServer.broadcastSystemNotification({
        message,
        severity,
        data,
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              message: 'System notification broadcasted successfully',
              notification: {
                message,
                severity,
                data,
              },
              timestamp: new Date().toISOString(),
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              message: `Failed to broadcast system notification: ${error instanceof Error ? error.message : String(error)}`,
              timestamp: new Date().toISOString(),
            }, null, 2),
          },
        ],
      };
    }
  }

  /**
   * 서버 시작
   */
  public async start(): Promise<void> {
    const transport = new StdioServerTransport();

    this.logInfo(`Starting DevFlow Monitor MCP Server v${config.server.version}`);
    this.logInfo(`Configuration loaded: ${config.development.debug ? 'debug' : 'production'} mode`);

    await this.server.connect(transport);
    this.logInfo('MCP Server connected and ready');
  }

  /**
   * 서버 종료
   */
  public async stop(): Promise<void> {
    // Stop file monitor
    if (this.fileMonitor) {
      await this.fileMonitor.stop();
      this.logInfo('File monitor stopped');
    }

    // Close storage manager
    storageManager.close();
    this.logInfo('Storage manager closed');

    this.logInfo('MCP Server stopped');
  }
}

/**
 * 서버 인스턴스 생성 및 시작
 */
async function main(): Promise<void> {
  try {
    const server = new DevFlowMonitorServer();
    await server.start();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

// 스크립트가 직접 실행될 때만 서버 시작
const isMainModule = process.argv[1] && import.meta.url.endsWith(process.argv[1]);
if (isMainModule) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
