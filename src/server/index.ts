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
  type ProjectStatusResponse,
  type MetricsResponse,
  type ActivityLogResponse,
  type BottleneckAnalysisResponse,
} from './types.js';

/**
 * DevFlow Monitor MCP 서버 클래스
 */
class DevFlowMonitorServer {
  private server: Server;
  private tools: Map<string, McpTool> = new Map();

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
    this.server.setRequestHandler(CallToolRequestSchema, (request) => {
      const { name, arguments: args } = request.params;

      this.logDebug(`Executing tool: ${name}`, args);

      if (!this.tools.has(name)) {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }

      try {
        return this.executeTool(name, args || {});
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
  private executeTool(
    name: string,
    args: unknown,
  ): { content: Array<{ type: 'text'; text: string }> } {
    switch (name) {
      case 'getProjectStatus':
        return this.getProjectStatus(args as GetProjectStatusArgs);

      case 'getMetrics':
        return this.getMetrics(args as GetMetricsArgs);

      case 'getActivityLog':
        return this.getActivityLog(args as GetActivityLogArgs);

      case 'analyzeBottlenecks':
        return this.analyzeBottlenecks(args as AnalyzeBottlenecksArgs);

      default:
        throw new Error(`Unimplemented tool: ${name}`);
    }
  }

  /**
   * 프로젝트 상태 조회 구현
   */
  private getProjectStatus(args: GetProjectStatusArgs): {
    content: Array<{ type: 'text'; text: string }>;
  } {
    const { includeDetails = false } = args;

    const status: ProjectStatusResponse = {
      project: {
        name: config.server.name,
        version: config.server.version,
        status: 'active',
        lastActivity: new Date().toISOString(),
      },
      milestones: {
        current: 'Milestone 1: MVP 기반 구축',
        progress: {
          total: 5,
          completed: 1, // 프로젝트 초기화 완료
          current: 'MCP 서버 구현',
        },
      },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        cwd: process.cwd(),
      },
    };

    if (includeDetails) {
      status.details = {
        configuration: config,
        serverInfo: {
          name: config.server.name,
          version: config.server.version,
        },
        tools: Array.from(this.tools.keys()),
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
   * 메트릭 조회 구현
   */
  private getMetrics(args: GetMetricsArgs): { content: Array<{ type: 'text'; text: string }> } {
    const { timeRange = '1d', metricType = 'all' } = args;

    // 현재는 샘플 데이터 반환 (추후 실제 데이터 수집 구현)
    const metrics: MetricsResponse = {
      timeRange,
      metricType,
      data: {
        commits: timeRange === '1d' ? 3 : 15,
        filesChanged: timeRange === '1d' ? 8 : 45,
        linesAdded: timeRange === '1d' ? 150 : 800,
        linesRemoved: timeRange === '1d' ? 50 : 200,
        testsPassed: timeRange === '1d' ? 25 : 120,
        testsFailed: timeRange === '1d' ? 2 : 8,
        buildSuccess: timeRange === '1d' ? 5 : 20,
        buildFailed: timeRange === '1d' ? 1 : 3,
      },
      summary: `${timeRange} 기간 동안의 개발 활동 메트릭`,
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
   * 활동 로그 조회 구현
   */
  private getActivityLog(args: GetActivityLogArgs): {
    content: Array<{ type: 'text'; text: string }>;
  } {
    const { limit = 20, stage } = args;

    // 현재는 샘플 데이터 반환 (추후 실제 로그 시스템 구현)
    const activities = Array.from({ length: Math.min(limit, 10) }, (_, i) => ({
      id: `activity-${i + 1}`,
      timestamp: new Date(Date.now() - i * 60000).toISOString(),
      stage: stage || (['planning', 'coding', 'testing', 'review'][i % 4] as string),
      action: 'File modified',
      details: `Modified src/server/${['index.ts', 'config.ts', 'handlers.ts'][i % 3]}`,
      actor: 'developer',
    }));

    const response: ActivityLogResponse = {
      totalCount: activities.length,
      activities,
      filters: { limit, ...(stage && { stage }) },
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
   * 병목 현상 분석 구현
   */
  private analyzeBottlenecks(args: AnalyzeBottlenecksArgs): {
    content: Array<{ type: 'text'; text: string }>;
  } {
    const { analysisDepth = 'basic' } = args;

    const analysis: BottleneckAnalysisResponse = {
      analysisDepth,
      timestamp: new Date().toISOString(),
      bottlenecks: [
        {
          category: 'development',
          severity: 'low',
          description: 'MCP 서버 구현 진행 중',
          suggestion: '단계별 구현 계속 진행',
        },
      ],
      recommendations: [
        'MCP 서버 핵심 기능 구현 완료 후 테스트 실시',
        '이벤트 시스템 구축으로 실시간 모니터링 준비',
      ],
      nextSteps: ['파일 시스템 모니터링 구현', '데이터 저장소 설정', 'Claude Desktop 연동 테스트'],
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
  public async start(): Promise<void> {
    const transport = new StdioServerTransport();

    this.logInfo(`Starting DevFlow Monitor MCP Server v${config.server.version}`);
    this.logInfo(`Configuration loaded: ${config.development.debug ? 'debug' : 'production'} mode`);

    await this.server.connect(transport);
    this.logInfo('MCP Server connected and ready');
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
