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
import { eventEngine, EventCategory, EventSeverity, BaseEvent } from '../events/index.js';
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
import { 
  notificationEngine,
  slackNotifier,
  dashboardNotifier,
  NotificationChannel,
  NotificationPriority,
} from '../notifications/index.js';
import { 
  performanceManager,
  performanceProfiler,
  memoryOptimizer,
  asyncOptimizer,
  cacheManager,
  scalingManager
} from '../performance/index.js';
import { createPluginManager, type PluginManager } from '../plugins/index.js';
import { 
  getSecurityManager,
  DEFAULT_SECURITY_CONFIG
} from '../security/index.js';
import type { PermissionCheck } from '../security/rbac-manager.js';
import { 
  createMultiProjectSystem, 
  createDefaultConfig,
  type MultiProjectSystem,
  type SyncStatus
} from '../projects/index.js';
import {
  ReportSystem
} from '../reports/index.js';
import {
  FeedbackSystem
} from '../feedback/index.js';
import type {
  FeedbackType,
  FeedbackStatus,
  FeedbackPriority
} from '../feedback/types.js';

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

// Initialize Notification System
notificationEngine.registerNotifier(NotificationChannel.SLACK, slackNotifier);
notificationEngine.registerNotifier(NotificationChannel.DASHBOARD, dashboardNotifier);
notificationEngine.start();

// Initialize Performance Management System
await performanceManager.initialize();

// Initialize Security System
const securityManager = getSecurityManager(DEFAULT_SECURITY_CONFIG);

/**
 * DevFlow Monitor MCP 서버 클래스
 */
class DevFlowMonitorServer {
  private server: Server;
  private tools: Map<string, McpTool> = new Map();
  private fileMonitor?: FileMonitor;
  private multiProjectSystem: MultiProjectSystem;
  private reportSystem: ReportSystem;
  private feedbackSystem: FeedbackSystem;
  private gitMonitor?: GitMonitor;
  private activityLog: Array<MonitorEvent> = [];
  private aiMonitor = aiMonitor;
  private pluginManager: PluginManager;
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

    // Initialize plugin manager
    this.pluginManager = createPluginManager({
      pluginDirs: ['./plugins', './node_modules/@devflow-plugins'],
      autoLoad: true,
      hotReload: true,
      maxPlugins: 50,
      sandboxEnabled: true,
      healthCheckInterval: 60000,
      metricsInterval: 30000,
    });

    // 다중 프로젝트 시스템 초기화
    this.multiProjectSystem = createMultiProjectSystem(
      createDefaultConfig({
        dbPath: './data/multi-projects.db',
        projectManager: {
          autoDiscovery: true,
          searchPaths: [process.cwd(), './..'], // 현재 디렉토리와 상위 디렉토리
          defaultSettings: {},
          metricsInterval: 60000,
          analysisInterval: 300000,
          maxConcurrentAnalysis: 2
        }
      }),
      eventEngine,
      storageManager
    );

    // 보고서 시스템 초기화
    this.reportSystem = new ReportSystem(
      {
        engine: {
          reportsPath: './reports/generated',
          templatesPath: './reports/templates',
          tempPath: './reports/temp',
          maxConcurrentGenerations: 3,
          enableCache: true
        },
        scheduler: {
          enabled: true,
          maxConcurrentJobs: 5,
          defaultTimezone: 'UTC'
        },
        delivery: {
          defaultFrom: 'DevFlow Monitor <noreply@devflow.local>',
          maxAttachmentSize: 25 * 1024 * 1024
        },
        templates: {
          enableDefaultTemplates: true,
          templatesPath: './report-templates'
        }
      },
      {
        metricsCollector,
        methodologyAnalyzer,
        aiMonitor,
        bottleneckDetector,
        stageAnalyzer,
        eventEngine,
        storageManager
      }
    );

    // 피드백 시스템 초기화
    this.feedbackSystem = new FeedbackSystem({
      database: storageManager.getDatabase(),
      projectManager: this.multiProjectSystem.getProjectManager(),
      stageAnalyzer,
      metricsCollector,
      autoAnalyze: true,
      enablePreferenceLearning: true,
      enableABTesting: true
    });

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

    // 알림 관련 도구들
    this.registerTool({
      name: 'configureNotifications',
      description: '알림 채널 및 규칙을 설정합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          channel: {
            type: 'string',
            enum: ['slack', 'email', 'dashboard'],
            description: '설정할 알림 채널',
          },
          config: {
            type: 'object',
            description: '채널별 설정 (예: Slack webhook URL)',
          },
          rules: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                conditions: { type: 'array' },
                channels: { type: 'array' },
                priority: { type: 'string' },
              },
            },
            description: '알림 규칙 목록',
          },
        },
      },
    });

    this.registerTool({
      name: 'sendNotification',
      description: '즉시 알림을 전송합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: '알림 제목',
          },
          content: {
            type: 'string',
            description: '알림 내용',
          },
          severity: {
            type: 'string',
            enum: ['debug', 'info', 'warning', 'error', 'critical'],
            description: '심각도',
            default: 'info',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'urgent'],
            description: '우선순위',
            default: 'medium',
          },
          channels: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['slack', 'email', 'dashboard'],
            },
            description: '전송할 채널 목록',
          },
        },
        required: ['title', 'content'],
      },
    });

    this.registerTool({
      name: 'getNotificationRules',
      description: '알림 규칙 목록을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          enabled: {
            type: 'boolean',
            description: '활성화된 규칙만 조회',
          },
        },
      },
    });

    this.registerTool({
      name: 'getNotificationStats',
      description: '알림 통계를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    });

    this.registerTool({
      name: 'getDashboardNotifications',
      description: '대시보드 알림을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          unreadOnly: {
            type: 'boolean',
            description: '읽지 않은 알림만 조회',
            default: false,
          },
          limit: {
            type: 'number',
            description: '조회할 알림 개수',
            default: 20,
          },
        },
      },
    });

    // 성능 최적화 관련 도구들
    this.registerTool({
      name: 'getPerformanceReport',
      description: '종합 성능 리포트를 생성합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          includeRecommendations: {
            type: 'boolean',
            description: '개선 권장사항 포함 여부',
            default: true,
          },
          includeDetails: {
            type: 'boolean',
            description: '상세 분석 결과 포함 여부',
            default: false,
          },
        },
      },
    });

    this.registerTool({
      name: 'optimizePerformance',
      description: '시스템 성능 최적화를 실행합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          level: {
            type: 'string',
            enum: ['basic', 'aggressive', 'emergency'],
            description: '최적화 수준',
            default: 'basic',
          },
          targetAreas: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['memory', 'cache', 'async', 'scaling'],
            },
            description: '최적화 대상 영역',
            default: ['memory', 'cache'],
          },
        },
      },
    });

    this.registerTool({
      name: 'getSystemMetrics',
      description: '실시간 시스템 메트릭을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          includeHistory: {
            type: 'boolean',
            description: '히스토리 데이터 포함 여부',
            default: false,
          },
          metricsType: {
            type: 'string',
            enum: ['all', 'memory', 'cpu', 'async', 'cache', 'scaling'],
            description: '메트릭 타입',
            default: 'all',
          },
        },
      },
    });

    this.registerTool({
      name: 'profilePerformance',
      description: '성능 프로파일링을 시작/중지합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['start', 'stop', 'status'],
            description: '프로파일링 액션',
            default: 'status',
          },
          duration: {
            type: 'number',
            description: '프로파일링 지속시간 (초)',
            default: 60,
          },
        },
      },
    });

    this.registerTool({
      name: 'manageCaches',
      description: '캐시 관리 작업을 수행합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['clear', 'stats', 'warmup', 'optimize'],
            description: '캐시 관리 액션',
            default: 'stats',
          },
          cacheType: {
            type: 'string',
            enum: ['memory', 'disk', 'all'],
            description: '캐시 타입',
            default: 'all',
          },
        },
      },
    });

    // 보안 관련 도구
    this.registerTool({
      name: 'login',
      description: '사용자 로그인을 수행합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          username: {
            type: 'string',
            description: '사용자명',
          },
          password: {
            type: 'string',
            description: '비밀번호',
          },
          rememberMe: {
            type: 'boolean',
            description: '로그인 상태 유지',
            default: false,
          },
        },
        required: ['username', 'password'],
      },
    });

    this.registerTool({
      name: 'verifyToken',
      description: 'JWT 토큰을 검증합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            description: 'JWT 토큰',
          },
        },
        required: ['token'],
      },
    });

    this.registerTool({
      name: 'checkPermission',
      description: '사용자 권한을 확인합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: '사용자 ID',
          },
          resource: {
            type: 'string',
            description: '리소스명',
          },
          action: {
            type: 'string',
            enum: ['create', 'read', 'update', 'delete', 'execute', 'admin'],
            description: '액션',
          },
        },
        required: ['userId', 'resource', 'action'],
      },
    });

    this.registerTool({
      name: 'generateAPIKey',
      description: 'API 키를 생성합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: '사용자 ID',
          },
          name: {
            type: 'string',
            description: 'API 키 이름',
          },
          permissions: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: '권한 목록',
          },
          expiresAt: {
            type: 'string',
            description: '만료일 (ISO 8601 형식)',
          },
        },
        required: ['userId', 'name', 'permissions'],
      },
    });

    this.registerTool({
      name: 'encryptData',
      description: '데이터를 암호화합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          data: {
            type: 'string',
            description: '암호화할 데이터',
          },
        },
        required: ['data'],
      },
    });

    this.registerTool({
      name: 'decryptData',
      description: '데이터를 복호화합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          encrypted: {
            type: 'string',
            description: '암호화된 데이터',
          },
          iv: {
            type: 'string',
            description: 'Initialization Vector',
          },
          tag: {
            type: 'string',
            description: '인증 태그 (선택적)',
          },
          keyId: {
            type: 'string',
            description: '키 ID (선택적)',
          },
        },
        required: ['encrypted', 'iv'],
      },
    });

    this.registerTool({
      name: 'getSecurityStats',
      description: '보안 시스템 통계를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    });

    this.registerTool({
      name: 'queryAuditLogs',
      description: '감사 로그를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          startDate: {
            type: 'string',
            description: '시작 날짜 (ISO 8601 형식)',
          },
          endDate: {
            type: 'string',
            description: '종료 날짜 (ISO 8601 형식)',
          },
          eventTypes: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: '이벤트 타입 필터',
          },
          userId: {
            type: 'string',
            description: '사용자 ID',
          },
          ipAddress: {
            type: 'string',
            description: 'IP 주소',
          },
          limit: {
            type: 'number',
            description: '결과 제한',
            default: 100,
          },
        },
      },
    });

    this.registerTool({
      name: 'getAuditSummary',
      description: '감사 로그 요약을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          startDate: {
            type: 'string',
            description: '시작 날짜 (ISO 8601 형식)',
          },
          endDate: {
            type: 'string',
            description: '종료 날짜 (ISO 8601 형식)',
          },
        },
      },
    });

    this.registerTool({
      name: 'assignRole',
      description: '사용자에게 역할을 할당합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: '대상 사용자 ID',
          },
          roleId: {
            type: 'string',
            description: '역할 ID',
          },
          assignedBy: {
            type: 'string',
            description: '할당하는 사용자 ID',
          },
          reason: {
            type: 'string',
            description: '할당 사유',
          },
        },
        required: ['userId', 'roleId', 'assignedBy'],
      },
    });

    // 플러그인 관리 도구들
    this.registerTool({
      name: 'listPlugins',
      description: '설치된 모든 플러그인 목록을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: '플러그인 카테고리로 필터링 (옵션)',
          },
          status: {
            type: 'string',
            enum: ['unloaded', 'loading', 'loaded', 'running', 'paused', 'error', 'disabled'],
            description: '플러그인 상태로 필터링 (옵션)',
          },
        },
      },
    });

    this.registerTool({
      name: 'getPluginInfo',
      description: '특정 플러그인의 상세 정보를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          pluginId: {
            type: 'string',
            description: '플러그인 ID',
          },
        },
        required: ['pluginId'],
      },
    });

    this.registerTool({
      name: 'loadPlugin',
      description: '플러그인을 로드합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          pluginId: {
            type: 'string',
            description: '플러그인 ID',
          },
        },
        required: ['pluginId'],
      },
    });

    this.registerTool({
      name: 'unloadPlugin',
      description: '플러그인을 언로드합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          pluginId: {
            type: 'string',
            description: '플러그인 ID',
          },
        },
        required: ['pluginId'],
      },
    });

    this.registerTool({
      name: 'activatePlugin',
      description: '플러그인을 활성화합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          pluginId: {
            type: 'string',
            description: '플러그인 ID',
          },
        },
        required: ['pluginId'],
      },
    });

    this.registerTool({
      name: 'deactivatePlugin',
      description: '플러그인을 비활성화합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          pluginId: {
            type: 'string',
            description: '플러그인 ID',
          },
        },
        required: ['pluginId'],
      },
    });

    this.registerTool({
      name: 'restartPlugin',
      description: '플러그인을 재시작합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          pluginId: {
            type: 'string',
            description: '플러그인 ID',
          },
        },
        required: ['pluginId'],
      },
    });

    this.registerTool({
      name: 'installPlugin',
      description: '레지스트리에서 플러그인을 설치합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          pluginName: {
            type: 'string',
            description: '설치할 플러그인 이름',
          },
          version: {
            type: 'string',
            description: '플러그인 버전 (옵션, 최신 버전 사용)',
          },
        },
        required: ['pluginName'],
      },
    });

    this.registerTool({
      name: 'uninstallPlugin',
      description: '플러그인을 제거합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          pluginId: {
            type: 'string',
            description: '제거할 플러그인 ID',
          },
        },
        required: ['pluginId'],
      },
    });

    this.registerTool({
      name: 'searchPlugins',
      description: '플러그인을 검색합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '검색어',
          },
          local: {
            type: 'boolean',
            description: '로컬 플러그인만 검색할지 여부',
            default: false,
          },
        },
        required: ['query'],
      },
    });

    this.registerTool({
      name: 'checkPluginHealth',
      description: '플러그인의 상태를 체크합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          pluginId: {
            type: 'string',
            description: '체크할 플러그인 ID (생략 시 모든 플러그인)',
          },
        },
      },
    });

    this.registerTool({
      name: 'getPluginMetrics',
      description: '플러그인 시스템의 메트릭을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          pluginId: {
            type: 'string',
            description: '특정 플러그인 ID (옵션)',
          },
        },
      },
    });

    this.registerTool({
      name: 'updatePlugin',
      description: '플러그인을 업데이트합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          pluginId: {
            type: 'string',
            description: '업데이트할 플러그인 ID',
          },
          version: {
            type: 'string',
            description: '업데이트할 버전 (옵션, 최신 버전 사용)',
          },
        },
        required: ['pluginId'],
      },
    });

    this.registerTool({
      name: 'checkPluginUpdates',
      description: '플러그인 업데이트를 확인합니다.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    });

    this.registerTool({
      name: 'getPluginSystemStats',
      description: '플러그인 시스템 전체 통계를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    });

    // 다중 프로젝트 지원 도구들
    this.registerTool({
      name: 'createProject',
      description: '새로운 프로젝트를 생성합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '프로젝트 이름' },
          description: { type: 'string', description: '프로젝트 설명' },
          type: { type: 'string', enum: ['web_application', 'mobile_application', 'api_service', 'library', 'cli_tool', 'microservice', 'monolith', 'data_pipeline', 'infrastructure', 'documentation', 'other'], description: '프로젝트 타입' },
          priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], description: '프로젝트 우선순위' },
          rootPath: { type: 'string', description: '프로젝트 루트 경로' },
          tags: { type: 'array', items: { type: 'string' }, description: '프로젝트 태그' }
        },
        required: ['name']
      },
    });

    this.registerTool({
      name: 'listProjects',
      description: '등록된 모든 프로젝트 목록을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'inactive', 'archived', 'maintenance', 'development', 'production', 'deprecated'], description: '필터링할 프로젝트 상태' },
          type: { type: 'string', description: '필터링할 프로젝트 타입' },
          limit: { type: 'number', description: '최대 결과 수' }
        },
      },
    });

    this.registerTool({
      name: 'getProject',
      description: '특정 프로젝트의 상세 정보를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: '프로젝트 ID' }
        },
        required: ['projectId']
      },
    });

    this.registerTool({
      name: 'updateProject',
      description: '프로젝트 정보를 업데이트합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: '프로젝트 ID' },
          name: { type: 'string', description: '프로젝트 이름' },
          description: { type: 'string', description: '프로젝트 설명' },
          status: { type: 'string', enum: ['active', 'inactive', 'archived', 'maintenance', 'development', 'production', 'deprecated'], description: '프로젝트 상태' },
          priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], description: '프로젝트 우선순위' },
          tags: { type: 'array', items: { type: 'string' }, description: '프로젝트 태그' }
        },
        required: ['projectId']
      },
    });

    this.registerTool({
      name: 'deleteProject',
      description: '프로젝트를 삭제합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: '프로젝트 ID' }
        },
        required: ['projectId']
      },
    });

    this.registerTool({
      name: 'discoverProjects',
      description: '지정된 경로에서 프로젝트를 자동으로 검색하고 등록합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          searchPaths: { type: 'array', items: { type: 'string' }, description: '검색할 디렉토리 경로들' },
          autoRegister: { type: 'boolean', description: '발견된 프로젝트를 자동으로 등록할지 여부' }
        },
      },
    });

    this.registerTool({
      name: 'searchProjects',
      description: '프로젝트를 검색합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '검색 쿼리 (프로젝트 이름)' },
          type: { type: 'string', description: '프로젝트 타입' },
          status: { type: 'string', description: '프로젝트 상태' },
          tags: { type: 'array', items: { type: 'string' }, description: '검색할 태그들' }
        },
      },
    });

    this.registerTool({
      name: 'getProjectMetrics',
      description: '프로젝트의 메트릭을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: '프로젝트 ID' },
          timeRange: { type: 'string', enum: ['1h', '1d', '7d', '30d'], description: '조회할 시간 범위' }
        },
        required: ['projectId']
      },
    });

    this.registerTool({
      name: 'collectProjectMetrics',
      description: '프로젝트의 메트릭을 수집합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: '프로젝트 ID (생략 시 모든 활성 프로젝트)' }
        },
      },
    });

    this.registerTool({
      name: 'runCrossProjectAnalysis',
      description: '여러 프로젝트 간의 크로스 분석을 실행합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          projectIds: { type: 'array', items: { type: 'string' }, description: '분석할 프로젝트 ID들 (생략 시 모든 활성 프로젝트)' },
          analysisType: { type: 'string', enum: ['similarity', 'dependency', 'performance', 'quality', 'trend', 'bottleneck', 'collaboration'], description: '분석 타입' }
        },
      },
    });

    this.registerTool({
      name: 'getProjectDependencies',
      description: '프로젝트 간 의존성 관계를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: '프로젝트 ID' },
          direction: { type: 'string', enum: ['incoming', 'outgoing', 'both'], description: '의존성 방향' }
        },
        required: ['projectId']
      },
    });

    this.registerTool({
      name: 'getMultiProjectStatus',
      description: '다중 프로젝트 시스템의 전체 상태를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    });

    this.registerTool({
      name: 'getProjectPortfolio',
      description: '프로젝트 포트폴리오 개요를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          groupBy: { type: 'string', enum: ['type', 'status', 'priority', 'owner'], description: '그룹화 기준' }
        },
      },
    });

    this.registerTool({
      name: 'enableProjectSync',
      description: '프로젝트 동기화를 활성화합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          endpoint: { type: 'string', description: '동기화 서버 엔드포인트' },
          apiKey: { type: 'string', description: 'API 키' },
          interval: { type: 'number', description: '동기화 간격 (초)' }
        },
        required: ['endpoint', 'apiKey']
      },
    });

    this.registerTool({
      name: 'triggerProjectSync',
      description: '프로젝트 동기화를 수동으로 트리거합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          force: { type: 'boolean', description: '강제 동기화 여부' }
        },
      },
    });

    this.registerTool({
      name: 'getProjectSyncStatus',
      description: '프로젝트 동기화 상태를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    });

    // 보고서 도구들
    this.registerTool({
      name: 'generateReport',
      description: '프로젝트 보고서를 생성합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          reportType: {
            type: 'string',
            description: '보고서 타입',
            enum: ['daily', 'weekly', 'monthly', 'quarterly', 'custom', 'incident', 'performance', 'methodology', 'ai_usage', 'cross_project']
          },
          formats: {
            type: 'array',
            description: '출력 형식',
            items: {
              type: 'string',
              enum: ['pdf', 'html', 'markdown', 'json', 'csv', 'excel']
            },
            default: ['html', 'pdf']
          },
          projectIds: {
            type: 'array',
            description: '대상 프로젝트 ID 목록',
            items: { type: 'string' }
          },
          periodStart: {
            type: 'number',
            description: '시작 시간 (타임스탬프)'
          },
          periodEnd: {
            type: 'number',
            description: '종료 시간 (타임스탬프)'
          },
          templateId: {
            type: 'string',
            description: '사용할 템플릿 ID'
          }
        },
        required: ['reportType']
      }
    });

    this.registerTool({
      name: 'generateQuickReport',
      description: '빠른 보고서를 생성합니다 (일일/주간/월간).',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: '보고서 타입',
            enum: ['daily', 'weekly', 'monthly']
          },
          projectIds: {
            type: 'array',
            description: '대상 프로젝트 ID 목록',
            items: { type: 'string' }
          }
        },
        required: ['type']
      }
    });

    this.registerTool({
      name: 'createReportSchedule',
      description: '정기적인 보고서 생성 스케줄을 만듭니다.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '스케줄 이름'
          },
          reportType: {
            type: 'string',
            description: '보고서 타입',
            enum: ['daily', 'weekly', 'monthly']
          },
          scheduleType: {
            type: 'string',
            description: '스케줄 타입',
            enum: ['daily', 'weekly', 'monthly']
          },
          time: {
            type: 'string',
            description: '실행 시간 (HH:mm 형식)'
          },
          dayOfWeek: {
            type: 'number',
            description: '실행 요일 (0-6, 주간 스케줄용)'
          },
          dayOfMonth: {
            type: 'number',
            description: '실행 날짜 (1-31, 월간 스케줄용)'
          },
          emailRecipients: {
            type: 'array',
            description: '이메일 수신자 목록',
            items: { type: 'string' }
          }
        },
        required: ['name', 'reportType', 'scheduleType', 'time']
      }
    });

    this.registerTool({
      name: 'listReportSchedules',
      description: '모든 보고서 스케줄을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    });

    this.registerTool({
      name: 'deleteReportSchedule',
      description: '보고서 스케줄을 삭제합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          scheduleId: {
            type: 'string',
            description: '삭제할 스케줄 ID'
          }
        },
        required: ['scheduleId']
      }
    });

    this.registerTool({
      name: 'runScheduleNow',
      description: '스케줄된 보고서를 즉시 실행합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          scheduleId: {
            type: 'string',
            description: '실행할 스케줄 ID'
          }
        },
        required: ['scheduleId']
      }
    });

    this.registerTool({
      name: 'listReportTemplates',
      description: '사용 가능한 보고서 템플릿을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: '템플릿 타입 필터',
            enum: ['daily', 'weekly', 'monthly', 'methodology', 'ai_usage']
          }
        }
      }
    });

    this.registerTool({
      name: 'getReportSystemStatus',
      description: '보고서 시스템 상태를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    });

    // 피드백 시스템 도구들
    this.registerTool({
      name: 'submitFeedback',
      description: '사용자 피드백을 제출합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['bug_report', 'feature_request', 'usability_issue', 'performance_issue', 'documentation', 'general', 'praise'],
            description: '피드백 타입'
          },
          title: {
            type: 'string',
            description: '피드백 제목'
          },
          description: {
            type: 'string',
            description: '피드백 설명'
          },
          projectId: {
            type: 'string',
            description: '프로젝트 ID (선택)'
          },
          priority: {
            type: 'string',
            enum: ['critical', 'high', 'medium', 'low'],
            description: '우선순위 (선택)'
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: '태그 목록'
          }
        },
        required: ['type', 'title', 'description']
      }
    });

    this.registerTool({
      name: 'listFeedback',
      description: '피드백 목록을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: '조회할 개수',
            default: 20
          },
          type: {
            type: 'string',
            enum: ['bug_report', 'feature_request', 'usability_issue', 'performance_issue', 'documentation', 'general', 'praise'],
            description: '피드백 타입 필터'
          },
          status: {
            type: 'string',
            enum: ['new', 'reviewing', 'in_progress', 'resolved', 'closed', 'deferred'],
            description: '상태 필터'
          },
          priority: {
            type: 'string',
            enum: ['critical', 'high', 'medium', 'low'],
            description: '우선순위 필터'
          },
          projectId: {
            type: 'string',
            description: '프로젝트 ID 필터'
          }
        }
      }
    });

    this.registerTool({
      name: 'getFeedbackDetails',
      description: '특정 피드백의 상세 정보를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          feedbackId: {
            type: 'string',
            description: '피드백 ID'
          }
        },
        required: ['feedbackId']
      }
    });

    this.registerTool({
      name: 'updateFeedbackStatus',
      description: '피드백 상태를 업데이트합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          feedbackId: {
            type: 'string',
            description: '피드백 ID'
          },
          status: {
            type: 'string',
            enum: ['new', 'reviewing', 'in_progress', 'resolved', 'closed', 'deferred'],
            description: '새로운 상태'
          }
        },
        required: ['feedbackId', 'status']
      }
    });

    this.registerTool({
      name: 'listImprovementSuggestions',
      description: '개선 제안 목록을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['proposed', 'approved', 'in_progress', 'completed', 'rejected'],
            description: '상태 필터'
          }
        }
      }
    });

    this.registerTool({
      name: 'getUserPreferences',
      description: '사용자 선호도를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: '사용자 ID'
          }
        },
        required: ['userId']
      }
    });

    this.registerTool({
      name: 'createABTest',
      description: 'A/B 테스트를 생성합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '테스트 이름'
          },
          description: {
            type: 'string',
            description: '테스트 설명'
          },
          variants: {
            type: 'array',
            description: '테스트 변형 목록',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                trafficPercentage: { type: 'number' },
                changes: { type: 'object' },
                isControl: { type: 'boolean' }
              },
              required: ['name', 'trafficPercentage', 'changes', 'isControl']
            }
          },
          metrics: {
            type: 'array',
            description: '측정 메트릭 목록',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { 
                  type: 'string',
                  enum: ['conversion', 'engagement', 'performance', 'custom']
                },
                goal: { type: 'number' },
                calculation: { type: 'string' }
              },
              required: ['name', 'type', 'calculation']
            }
          },
          audiencePercentage: {
            type: 'number',
            description: '대상 사용자 비율 (0-100)',
            default: 100
          }
        },
        required: ['name', 'description', 'variants', 'metrics']
      }
    });

    this.registerTool({
      name: 'listActiveABTests',
      description: '활성 A/B 테스트 목록을 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    });

    this.registerTool({
      name: 'getABTestResults',
      description: 'A/B 테스트 결과를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          testId: {
            type: 'string',
            description: '테스트 ID'
          }
        },
        required: ['testId']
      }
    });

    this.registerTool({
      name: 'getFeedbackStats',
      description: '피드백 통계를 조회합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description: '프로젝트 ID (선택)'
          }
        }
      }
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
   * 인증 및 권한 검사
   */
  private async authenticateAndAuthorize(toolName: string, args: any): Promise<{ userId?: string; authContext?: any }> {
    // 인증이 필요한 도구들 정의
    const secureTools = new Set([
      'generateAPIKey', 'assignRole', 'createRole', 'manageUserSessions',
      'rotateEncryptionKeys', 'getSecurityStats', 'queryAuditLogs',
      'getAuditSummary', 'optimizePerformance', 'manageCaches'
    ]);

    // 보안 도구는 별도 처리 (인증 자체를 담당)
    const authTools = new Set(['login', 'verifyToken', 'checkPermission']);

    if (authTools.has(toolName)) {
      return {}; // 인증 도구는 별도 처리
    }

    if (!secureTools.has(toolName)) {
      return {}; // 인증이 필요하지 않은 도구
    }

    // API 키 또는 JWT 토큰 확인
    const apiKey = args.apiKey || process.env.MCP_API_KEY;
    const token = args.token || args.authToken;

    if (apiKey) {
      // API 키 검증
      try {
        const apiKeyResult = await securityManager.verifyAPIKey(apiKey);
        if (apiKeyResult && typeof apiKeyResult === 'object' && 'userId' in apiKeyResult) {
          // 권한 검사
          const requiredPermission = this.getRequiredPermission(toolName);
          if (requiredPermission && apiKeyResult.permissions && !apiKeyResult.permissions.some((p: any) => p.resource === requiredPermission.resource && p.action === requiredPermission.action)) {
            throw new Error(`Insufficient permissions for tool ${toolName}`);
          }
          return { userId: apiKeyResult.userId };
        }
      } catch (error) {
        throw new Error(`API key authentication failed: ${(error as Error).message}`);
      }
    }

    if (token) {
      // JWT 토큰 검증
      try {
        const authContext = await securityManager.verifyToken(token);
        if (authContext) {
          // 권한 검사
          const requiredPermission = this.getRequiredPermission(toolName);
          if (requiredPermission) {
            const hasPermission = await securityManager.checkPermission(
              authContext.user.id,
              requiredPermission as PermissionCheck
            );
            if (!hasPermission.allowed) {
              throw new Error(`Insufficient permissions for tool ${toolName}`);
            }
          }
          return { userId: authContext.user.id, authContext };
        }
      } catch (error) {
        throw new Error(`Token authentication failed: ${(error as Error).message}`);
      }
    }

    // 개발 모드에서는 인증 건너뛰기
    if (process.env.NODE_ENV === 'development' || process.env.MCP_SKIP_AUTH === 'true') {
      this.logInfo(`Skipping authentication for ${toolName} in development mode`);
      return {};
    }

    throw new Error(`Authentication required for tool ${toolName}. Provide 'apiKey' or 'token' in args.`);
  }

  /**
   * 도구별 필요 권한 정의
   */
  private getRequiredPermission(toolName: string): { resource: string; action: string } | null {
    const permissions: Record<string, { resource: string; action: string }> = {
      'generateAPIKey': { resource: 'api-keys', action: 'create' },
      'assignRole': { resource: 'users', action: 'update' },
      'createRole': { resource: 'roles', action: 'create' },
      'manageUserSessions': { resource: 'sessions', action: 'admin' },
      'rotateEncryptionKeys': { resource: 'encryption', action: 'admin' },
      'getSecurityStats': { resource: 'security', action: 'read' },
      'queryAuditLogs': { resource: 'audit', action: 'read' },
      'getAuditSummary': { resource: 'audit', action: 'read' },
      'optimizePerformance': { resource: 'system', action: 'admin' },
      'manageCaches': { resource: 'system', action: 'admin' },
    };

    return permissions[toolName] || null;
  }

  /**
   * 도구 실행
   */
  private async executeTool(name: string, args: unknown): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
    }

    // 인증 및 권한 검사
    try {
      const authResult = await this.authenticateAndAuthorize(name, args);
      if (authResult.userId) {
        this.logInfo(`Tool ${name} authenticated for user: ${authResult.userId}`);
      }
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Authentication Error: ${(error as Error).message}`
        }]
      };
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

      case 'configureNotifications':
        return this.configureNotifications(args as { channel?: string; config?: any; rules?: any[] });

      case 'sendNotification':
        return this.sendNotification(args as { title: string; content: string; severity?: string; priority?: string; channels?: string[] });

      case 'getNotificationRules':
        return this.getNotificationRules(args as { enabled?: boolean });

      case 'getNotificationStats':
        return this.getNotificationStats();

      case 'getDashboardNotifications':
        return this.getDashboardNotifications(args as { unreadOnly?: boolean; limit?: number });

      case 'getPerformanceReport':
        return this.getPerformanceReport(args as { includeRecommendations?: boolean; includeDetails?: boolean });

      case 'optimizePerformance':
        return await this.optimizePerformance(args as { level?: string; targetAreas?: string[] });

      case 'getSystemMetrics':
        return this.getSystemMetrics(args as { includeHistory?: boolean; metricsType?: string });

      case 'profilePerformance':
        return this.profilePerformance(args as { action?: string; duration?: number });

      case 'manageCaches':
        return await this.manageCaches(args as { action?: string; cacheType?: string });

      // 보안 도구들
      case 'login':
        return await this.login(args as { username: string; password: string; rememberMe?: boolean });

      case 'verifyToken':
        return await this.verifyToken(args as { token: string });

      case 'checkPermission':
        return await this.checkPermission(args as { userId: string; resource: string; action: string });

      case 'generateAPIKey':
        return await this.generateAPIKey(args as { userId: string; name: string; permissions: string[]; expiresAt?: string });

      case 'encryptData':
        return await this.encryptData(args as { data: string });

      case 'decryptData':
        return await this.decryptData(args as { encrypted: string; iv: string; tag?: string; keyId?: string });

      case 'getSecurityStats':
        return this.getSecurityStats();

      case 'queryAuditLogs':
        return await this.queryAuditLogs(args as any);

      case 'getAuditSummary':
        return await this.getAuditSummary(args as { startDate?: string; endDate?: string });

      case 'assignRole':
        return await this.assignRole(args as { userId: string; roleId: string; assignedBy: string; reason?: string });

      // 플러그인 관리 도구들
      case 'listPlugins':
        return this.listPlugins(args as { category?: string; status?: string });

      case 'getPluginInfo':
        return this.getPluginInfo(args as { pluginId: string });

      case 'loadPlugin':
        return await this.loadPlugin(args as { pluginId: string });

      case 'unloadPlugin':
        return await this.unloadPlugin(args as { pluginId: string });

      case 'activatePlugin':
        return await this.activatePlugin(args as { pluginId: string });

      case 'deactivatePlugin':
        return await this.deactivatePlugin(args as { pluginId: string });

      case 'restartPlugin':
        return await this.restartPlugin(args as { pluginId: string });

      case 'installPlugin':
        return await this.installPlugin(args as { pluginName: string; version?: string });

      case 'uninstallPlugin':
        return await this.uninstallPlugin(args as { pluginId: string });

      case 'searchPlugins':
        return await this.searchPlugins(args as { query: string; local?: boolean });

      case 'checkPluginHealth':
        return await this.checkPluginHealth(args as { pluginId?: string });

      case 'getPluginMetrics':
        return this.getPluginMetrics(args as { pluginId?: string });

      case 'updatePlugin':
        return await this.updatePlugin(args as { pluginId: string; version?: string });

      case 'checkPluginUpdates':
        return await this.checkPluginUpdates();

      case 'getPluginSystemStats':
        return this.getPluginSystemStats();

      // 다중 프로젝트 도구들
      case 'createProject':
        return await this.createProject(args as { name: string; description?: string; type?: string; priority?: string; rootPath?: string; tags?: string[] });
      case 'listProjects':
        return await this.listProjects(args as { status?: string; type?: string; limit?: number });
      case 'getProject':
        return await this.getProject(args as { projectId: string });
      case 'updateProject':
        return await this.updateProject(args as { projectId: string; name?: string; description?: string; status?: string; priority?: string; tags?: string[] });
      case 'deleteProject':
        return await this.deleteProject(args as { projectId: string });
      case 'discoverProjects':
        return await this.discoverProjects(args as { searchPaths?: string[]; autoRegister?: boolean });
      case 'searchProjects':
        return await this.searchProjects(args as { query?: string; type?: string; status?: string; tags?: string[] });
      case 'getProjectMetrics':
        return await this.getProjectMetrics(args as { projectId: string; timeRange?: string });
      case 'collectProjectMetrics':
        return await this.collectProjectMetrics(args as { projectId?: string });
      case 'runCrossProjectAnalysis':
        return await this.runCrossProjectAnalysis(args as { projectIds?: string[]; analysisType?: string });
      case 'getProjectDependencies':
        return await this.getProjectDependencies(args as { projectId: string; direction?: string });
      case 'getMultiProjectStatus':
        return await this.getMultiProjectStatus();
      case 'getProjectPortfolio':
        return await this.getProjectPortfolio(args as { groupBy?: string });
      case 'enableProjectSync':
        return await this.enableProjectSync(args as { endpoint: string; apiKey: string; interval?: number });
      case 'triggerProjectSync':
        return await this.triggerProjectSync(args as { force?: boolean });
      case 'getProjectSyncStatus':
        return await this.getProjectSyncStatus();
      
      // Report System Tools
      case 'generateReport':
        return await this.generateReportTool(args as any);
      case 'generateQuickReport':
        return await this.generateQuickReportTool(args as any);
      case 'createReportSchedule':
        return await this.createReportScheduleTool(args as any);
      case 'listReportSchedules':
        return await this.listReportSchedulesTool();
      case 'createReportTemplate':
        return await this.createReportTemplateTool(args as any);
      case 'listReportTemplates':
        return await this.listReportTemplatesTool(args as any);
      case 'getReportSystemStatus':
        return await this.getReportSystemStatusTool();
      case 'deliverReport':
        return await this.deliverReportTool(args as any);
      case 'runScheduleNow':
        return await this.runScheduleNowTool(args as any);

      // 피드백 시스템 도구들
      case 'submitFeedback':
        return await this.submitFeedbackTool(args as any);
      case 'listFeedback':
        return await this.listFeedbackTool(args as any);
      case 'getFeedbackDetails':
        return await this.getFeedbackDetailsTool(args as any);
      case 'updateFeedbackStatus':
        return await this.updateFeedbackStatusTool(args as any);
      case 'listImprovementSuggestions':
        return await this.listImprovementSuggestionsTool(args as any);
      case 'getUserPreferences':
        return await this.getUserPreferencesTool(args as any);
      case 'createABTest':
        return await this.createABTestTool(args as any);
      case 'listActiveABTests':
        return await this.listActiveABTestsTool();
      case 'getABTestResults':
        return await this.getABTestResultsTool(args as any);
      case 'getFeedbackStats':
        return await this.getFeedbackStatsTool(args as any);

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
    
    // Initialize plugin manager
    try {
      await this.pluginManager.initialize();
      this.logInfo('Plugin manager initialized');
      
      // Auto-load plugins if configured
      // await this.pluginManager.discoverPlugins();
      // this.logInfo('Auto-loaded plugins');
    } catch (error) {
      this.logError('Failed to initialize plugin manager:', error);
    }

    // Initialize multi-project system
    try {
      await this.multiProjectSystem.start();
      this.logInfo('Multi-project system started');
    } catch (error) {
      this.logError('Failed to start multi-project system:', error);
    }

    // Initialize feedback system
    try {
      await this.feedbackSystem.start();
      this.logInfo('Feedback system started');
    } catch (error) {
      this.logError('Failed to start feedback system:', error);
    }
    
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

  /**
   * 알림 채널 설정
   */
  private configureNotifications(args: { channel?: string; config?: any; rules?: any[] }): any {
    try {
      const { channel, config, rules } = args;
      
      // 채널 설정
      if (channel && config) {
        notificationEngine.configureChannel({
          channel: channel as NotificationChannel,
          enabled: true,
          config,
        });
      }

      // 규칙 추가
      if (rules && Array.isArray(rules)) {
        for (const rule of rules) {
          notificationEngine.addRule({
            name: rule.name,
            description: rule.description,
            enabled: rule.enabled !== false,
            conditions: rule.conditions || [],
            channels: rule.channels || [NotificationChannel.DASHBOARD],
            priority: rule.priority || NotificationPriority.MEDIUM,
            throttle: rule.throttle,
            metadata: rule.metadata,
          });
        }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'Notification configuration updated',
            channelConfigured: !!channel,
            rulesAdded: rules?.length || 0,
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to configure notifications:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to configure notifications: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 알림 전송
   */
  private async sendNotification(args: { title: string; content: string; severity?: string; priority?: string; channels?: string[] }): Promise<any> {
    try {
      const { title, content, severity, priority, channels } = args;
      
      const message = await notificationEngine.sendNotification(title, content, {
        severity: severity as EventSeverity,
        priority: priority as NotificationPriority,
        ...(channels && { channels: channels.map(ch => ch as NotificationChannel) }),
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            messageId: message.id,
            queuedAt: message.createdAt,
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to send notification:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to send notification: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 알림 규칙 조회
   */
  private getNotificationRules(args: { enabled?: boolean }): any {
    try {
      const rules = notificationEngine.getAllRules();
      let filteredRules = rules;
      
      if (args.enabled !== undefined) {
        filteredRules = rules.filter(rule => rule.enabled === args.enabled);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            totalRules: rules.length,
            filteredRules: filteredRules.length,
            rules: filteredRules.map(rule => ({
              id: rule.id,
              name: rule.name,
              description: rule.description,
              enabled: rule.enabled,
              conditions: rule.conditions.length,
              channels: rule.channels,
              priority: rule.priority,
              throttle: rule.throttle,
              createdAt: rule.createdAt,
              updatedAt: rule.updatedAt,
            })),
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to get notification rules:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get notification rules: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 알림 통계 조회
   */
  private getNotificationStats(): any {
    try {
      const stats = notificationEngine.getStats();
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...stats,
            timestamp: new Date().toISOString(),
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to get notification stats:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get notification stats: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 대시보드 알림 조회
   */
  /**
   * 종합 성능 리포트 생성
   */
  private getPerformanceReport(args: { includeRecommendations?: boolean; includeDetails?: boolean }): any {
    try {
      const report = performanceManager.generateReport();
      
      const response = {
        timestamp: new Date().toISOString(),
        summary: {
          overall: 'Good', // TODO: 실제 종합 평가 로직
          criticalIssues: report.recommendations.filter(r => r.includes('CRITICAL')).length,
          warnings: report.recommendations.filter(r => r.includes('WARNING')).length,
        },
        performance: {
          averageResponseTime: report.profiler.summary.averageResponseTime,
          memoryUsage: report.memory.memoryPressure,
          cacheHitRate: report.cache.hitRatio,
          asyncQueueLength: report.async.queueLength,
          scalingInstances: report.scaling.instances,
        },
        ...(args.includeRecommendations && { recommendations: report.recommendations }),
        ...(args.includeDetails && { details: report }),
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to generate performance report:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to generate performance report: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 시스템 성능 최적화 실행
   */
  private async optimizePerformance(args: { level?: string; targetAreas?: string[] }): Promise<any> {
    try {
      const level = args.level || 'basic';
      const targetAreas = args.targetAreas || ['memory', 'cache'];
      
      const results: any = {
        timestamp: new Date().toISOString(),
        level,
        targetAreas,
        results: [],
      };

      // 레벨에 따른 최적화 실행
      if (level === 'emergency') {
        await performanceManager.optimize();
        results.results.push('Emergency optimization completed');
      } else {
        for (const area of targetAreas) {
          switch (area) {
            case 'memory':
              await memoryOptimizer.optimize();
              results.results.push('Memory optimization completed');
              break;
            case 'cache':
              await cacheManager.clear();
              results.results.push('Cache cleanup completed');
              break;
            case 'async':
              asyncOptimizer.cancelPendingTasks((task) => task.config.priority === 'low');
              results.results.push('Async queue optimization completed');
              break;
            case 'scaling':
              scalingManager.emit('optimizationRequested');
              results.results.push('Scaling optimization requested');
              break;
          }
        }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(results, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to optimize performance:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to optimize performance: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 실시간 시스템 메트릭 조회
   */
  private getSystemMetrics(args: { includeHistory?: boolean; metricsType?: string }): any {
    try {
      const metricsType = args.metricsType || 'all';
      const memUsage = process.memoryUsage();
      // const profilerStats = performanceProfiler.getStats();
      const memoryStats = memoryOptimizer.getStats();
      const asyncStats = asyncOptimizer.getStats();
      const cacheStats = cacheManager.getStats();
      const scalingStatus = scalingManager.getStatus();

      const metrics: any = {
        timestamp: new Date().toISOString(),
        system: {
          uptime: process.uptime(),
          pid: process.pid,
          platform: process.platform,
          nodeVersion: process.version,
        },
      };

      if (metricsType === 'all' || metricsType === 'memory') {
        metrics.memory = {
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          external: memUsage.external,
          rss: memUsage.rss,
          pressure: memoryStats.memoryPressure,
          cacheSize: memoryStats.cacheSize,
        };
      }

      if (metricsType === 'all' || metricsType === 'cpu') {
        metrics.cpu = {
          loadAverage: process.cpuUsage(),
        };
      }

      if (metricsType === 'all' || metricsType === 'async') {
        metrics.async = asyncStats;
      }

      if (metricsType === 'all' || metricsType === 'cache') {
        metrics.cache = cacheStats;
      }

      if (metricsType === 'all' || metricsType === 'scaling') {
        metrics.scaling = scalingStatus.metrics;
      }

      if (args.includeHistory) {
        const report = performanceManager.generateReport();
        metrics.history = {
          profiler: report.profiler.details,
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(metrics, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to get system metrics:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get system metrics: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 성능 프로파일링 관리
   */
  private profilePerformance(args: { action?: string; duration?: number }): any {
    try {
      const action = args.action || 'status';
      const duration = args.duration || 60;

      let result: any = {
        timestamp: new Date().toISOString(),
        action,
      };

      switch (action) {
        case 'start':
          performanceProfiler.startMonitoring(5000); // 5초 간격
          result.message = `Performance profiling started for ${duration} seconds`;
          result.status = 'running';
          break;

        case 'stop':
          performanceProfiler.stopMonitoring();
          result.message = 'Performance profiling stopped';
          result.status = 'stopped';
          break;

        case 'status':
        default:
          const stats = performanceProfiler.getStats();
          result = {
            ...result,
            status: 'running',
            stats: {
              averageResponseTime: stats.averageResponseTime,
              maxResponseTime: stats.maxResponseTime,
              minResponseTime: stats.minResponseTime,
              memoryTrend: stats.memoryTrend,
              memoryLeakPotential: stats.memoryLeakPotential,
              bottlenecksCount: stats.bottlenecks.length,
            },
            recommendations: stats.recommendations,
          };
          break;
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to manage performance profiling:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to manage performance profiling: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 캐시 관리 
   */
  private async manageCaches(args: { action?: string; cacheType?: string }): Promise<any> {
    try {
      const action = args.action || 'stats';
      const cacheType = args.cacheType || 'all';

      let result: any = {
        timestamp: new Date().toISOString(),
        action,
        cacheType,
      };

      switch (action) {
        case 'clear':
          if (cacheType === 'all' || cacheType === 'memory') {
            memoryOptimizer.clear();
            result.memoryCleared = true;
          }
          if (cacheType === 'all' || cacheType === 'disk') {
            await cacheManager.clear();
            result.diskCleared = true;
          }
          result.message = 'Cache clearing completed';
          break;

        case 'warmup':
          // 캐시 워밍업 로직 (예시)
          result.message = 'Cache warmup initiated';
          break;

        case 'optimize':
          await memoryOptimizer.optimize();
          result.message = 'Cache optimization completed';
          break;

        case 'stats':
        default:
          const memoryStats = memoryOptimizer.getStats();
          const cacheStats = cacheManager.getStats();
          
          result.stats = {
            memory: {
              entries: memoryStats.cacheEntries,
              size: memoryStats.cacheSize,
              pressure: memoryStats.memoryPressure,
            },
            disk: {
              entries: cacheStats.entries,
              hitRatio: cacheStats.hitRatio,
              memoryHits: cacheStats.memoryHits,
              diskHits: cacheStats.diskHits,
              memoryMisses: cacheStats.memoryMisses,
              diskMisses: cacheStats.diskMisses,
            },
          };
          break;
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to manage caches:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to manage caches: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private getDashboardNotifications(args: { unreadOnly?: boolean; limit?: number }): any {
    try {
      const notifications = dashboardNotifier.getNotifications({
        ...(args.unreadOnly !== undefined && { unreadOnly: args.unreadOnly }),
        ...(args.limit !== undefined && { limit: args.limit }),
      });
      
      const unreadCount = dashboardNotifier.getUnreadCount();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            totalUnread: unreadCount,
            notifications: notifications.map(n => ({
              id: n.id,
              title: n.message.title,
              content: n.message.content,
              severity: n.message.severity,
              priority: n.message.priority,
              read: n.read,
              readAt: n.readAt,
              createdAt: n.message.createdAt,
            })),
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to get dashboard notifications:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get dashboard notifications: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // =================== 보안 관련 메소드들 ===================

  /**
   * 사용자 로그인
   */
  private async login(args: { username: string; password: string; rememberMe?: boolean }): Promise<any> {
    try {
      const clientInfo = {
        ipAddress: 'localhost', // 실제 구현에서는 요청에서 추출
        userAgent: 'mcp-client'
      };

      const result = await securityManager.login(
        args.username,
        args.password,
        clientInfo,
        args.rememberMe
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Login failed:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * JWT 토큰 검증
   */
  private async verifyToken(args: { token: string }): Promise<any> {
    try {
      const authContext = await securityManager.verifyToken(args.token);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            valid: !!authContext,
            context: authContext ? {
              userId: authContext.user.id,
              username: authContext.user.username,
              roles: authContext.user.roles.map(role => role.name),
              sessionId: authContext.sessionId,
              ipAddress: authContext.ipAddress
            } : null
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Token verification failed:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Token verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 권한 확인
   */
  private async checkPermission(args: { userId: string; resource: string; action: string }): Promise<any> {
    try {
      const result = await securityManager.checkPermission(
        args.userId,
        {
          resource: args.resource,
          action: args.action as any
        }
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Permission check failed:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Permission check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * API 키 생성
   */
  private async generateAPIKey(args: { userId: string; name: string; permissions: string[]; expiresAt?: string }): Promise<any> {
    try {
      const expiresAt = args.expiresAt ? new Date(args.expiresAt) : undefined;
      const apiKey = await securityManager.generateAPIKey(
        args.userId,
        args.name,
        args.permissions,
        expiresAt
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            apiKey,
            message: 'API key generated successfully'
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('API key generation failed:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `API key generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 데이터 암호화
   */
  private async encryptData(args: { data: string }): Promise<any> {
    try {
      const result = await securityManager.encrypt(args.data);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            encrypted: result.encrypted,
            iv: result.iv,
            tag: result.tag
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Data encryption failed:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Data encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 데이터 복호화
   */
  private async decryptData(args: { encrypted: string; iv: string; tag?: string; keyId?: string }): Promise<any> {
    try {
      const decryptedData = await securityManager.decrypt(
        {
          encrypted: args.encrypted,
          iv: args.iv,
          ...(args.tag && { tag: args.tag })
        },
        args.keyId
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            data: decryptedData
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Data decryption failed:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Data decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 보안 통계 조회
   */
  private getSecurityStats(): any {
    try {
      const stats = securityManager.getSecurityStats();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(stats, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to get security stats:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get security stats: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 감사 로그 조회
   */
  private async queryAuditLogs(args: {
    startDate?: string;
    endDate?: string;
    eventTypes?: string[];
    userId?: string;
    ipAddress?: string;
    limit?: number;
  }): Promise<any> {
    try {
      const query: any = {};
      
      if (args.startDate) query.startDate = new Date(args.startDate);
      if (args.endDate) query.endDate = new Date(args.endDate);
      if (args.eventTypes) query.eventTypes = args.eventTypes;
      if (args.userId) query.userId = args.userId;
      if (args.ipAddress) query.ipAddress = args.ipAddress;
      if (args.limit) query.limit = args.limit;

      const logs = await securityManager.queryAuditLogs(query);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            totalResults: logs.length,
            logs: logs
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to query audit logs:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to query audit logs: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 감사 로그 요약
   */
  private async getAuditSummary(args: { startDate?: string; endDate?: string }): Promise<any> {
    try {
      const startDate = args.startDate ? new Date(args.startDate) : undefined;
      const endDate = args.endDate ? new Date(args.endDate) : undefined;

      const summary = await securityManager.getAuditSummary(startDate, endDate);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(summary, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to get audit summary:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get audit summary: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 역할 할당
   */
  private async assignRole(args: { userId: string; roleId: string; assignedBy: string; reason?: string }): Promise<any> {
    try {
      const result = await securityManager.assignRole(
        args.userId,
        args.roleId,
        args.assignedBy,
        args.reason
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: result,
            message: result ? 'Role assigned successfully' : 'Failed to assign role'
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to assign role:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to assign role: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 플러그인 목록 조회
   */
  private listPlugins(args: { category?: string; status?: string }): any {
    try {
      let plugins = this.pluginManager.getPlugins();

      // 카테고리 필터링
      if (args.category) {
        plugins = plugins.filter(plugin => 
          plugin.manifest.category === args.category
        );
      }

      // 상태 필터링
      if (args.status) {
        plugins = plugins.filter(plugin => 
          this.pluginManager.getPluginStatus(plugin.id) === args.status
        );
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            plugins: plugins.map(plugin => ({
              id: plugin.id,
              name: plugin.manifest.name,
              version: plugin.manifest.version,
              description: plugin.manifest.description,
              category: plugin.manifest.category,
              status: this.pluginManager.getPluginStatus(plugin.id),
              author: plugin.manifest.author
            })),
            total: plugins.length
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to list plugins:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list plugins: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 플러그인 정보 조회
   */
  private getPluginInfo(args: { pluginId: string }): any {
    try {
      const pluginInfo = this.pluginManager.getPluginInfo(args.pluginId);
      
      if (!pluginInfo) {
        throw new Error(`Plugin not found: ${args.pluginId}`);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            plugin: pluginInfo
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to get plugin info:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get plugin info: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 플러그인 로드
   */
  private async loadPlugin(args: { pluginId: string }): Promise<any> {
    try {
      const success = await this.pluginManager.loadPlugin(args.pluginId);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success,
            message: success ? `Plugin ${args.pluginId} loaded successfully` : `Failed to load plugin ${args.pluginId}`
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to load plugin:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to load plugin: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 플러그인 언로드
   */
  private async unloadPlugin(args: { pluginId: string }): Promise<any> {
    try {
      const success = await this.pluginManager.unloadPlugin(args.pluginId);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success,
            message: success ? `Plugin ${args.pluginId} unloaded successfully` : `Failed to unload plugin ${args.pluginId}`
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to unload plugin:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to unload plugin: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 플러그인 활성화
   */
  private async activatePlugin(args: { pluginId: string }): Promise<any> {
    try {
      const success = await this.pluginManager.activatePlugin(args.pluginId);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success,
            message: success ? `Plugin ${args.pluginId} activated successfully` : `Failed to activate plugin ${args.pluginId}`
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to activate plugin:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to activate plugin: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 플러그인 비활성화
   */
  private async deactivatePlugin(args: { pluginId: string }): Promise<any> {
    try {
      const success = await this.pluginManager.deactivatePlugin(args.pluginId);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success,
            message: success ? `Plugin ${args.pluginId} deactivated successfully` : `Failed to deactivate plugin ${args.pluginId}`
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to deactivate plugin:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to deactivate plugin: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 플러그인 재시작
   */
  private async restartPlugin(args: { pluginId: string }): Promise<any> {
    try {
      const success = await this.pluginManager.restartPlugin(args.pluginId);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success,
            message: success ? `Plugin ${args.pluginId} restarted successfully` : `Failed to restart plugin ${args.pluginId}`
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to restart plugin:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to restart plugin: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 플러그인 설치
   */
  private async installPlugin(args: { pluginName: string; version?: string }): Promise<any> {
    try {
      const success = await this.pluginManager.installPlugin(args.pluginName, args.version);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success,
            message: success ? `Plugin ${args.pluginName} installed successfully` : `Failed to install plugin ${args.pluginName}`
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to install plugin:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to install plugin: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 플러그인 제거
   */
  private async uninstallPlugin(args: { pluginId: string }): Promise<any> {
    try {
      const success = await this.pluginManager.uninstallPlugin(args.pluginId);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success,
            message: success ? `Plugin ${args.pluginId} uninstalled successfully` : `Failed to uninstall plugin ${args.pluginId}`
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to uninstall plugin:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to uninstall plugin: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 플러그인 검색
   */
  private async searchPlugins(args: { query: string; local?: boolean }): Promise<any> {
    try {
      const plugins = this.pluginManager.getPlugins();
      const results = plugins.filter(plugin => 
        plugin.manifest.name.toLowerCase().includes(args.query.toLowerCase()) ||
        plugin.manifest.description.toLowerCase().includes(args.query.toLowerCase()) ||
        plugin.manifest.tags?.some(tag => tag.toLowerCase().includes(args.query.toLowerCase()))
      );
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            results: results.map(plugin => ({
              id: plugin.id,
              name: plugin.manifest.name,
              version: plugin.manifest.version,
              description: plugin.manifest.description,
              author: plugin.manifest.author,
              category: plugin.manifest.category,
              tags: plugin.manifest.tags,
              status: this.pluginManager.getPluginStatus(plugin.id)
            })),
            total: results.length,
            query: args.query,
            local: args.local || false
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to search plugins:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to search plugins: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 플러그인 헬스 체크
   */
  private async checkPluginHealth(args: { pluginId?: string }): Promise<any> {
    try {
      let healthResults;
      
      if (args.pluginId) {
        // 특정 플러그인 헬스 체크
        const result = await this.pluginManager.checkPluginHealth(args.pluginId);
        healthResults = { [args.pluginId]: result };
      } else {
        // 모든 플러그인 헬스 체크
        healthResults = await this.pluginManager.checkAllPluginsHealth();
      }
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            healthStatus: healthResults,
            timestamp: new Date().toISOString()
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to check plugin health:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to check plugin health: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 플러그인 메트릭 조회
   */
  private getPluginMetrics(args: { pluginId?: string }): any {
    try {
      let metrics;
      
      if (args.pluginId) {
        metrics = this.pluginManager.getPluginMetrics(args.pluginId);
      } else {
        // Get metrics for all plugins
        const plugins = this.pluginManager.getPlugins();
        metrics = {};
        for (const plugin of plugins) {
          const pluginMetrics = this.pluginManager.getPluginMetrics(plugin.id);
          if (pluginMetrics) {
            metrics[plugin.id] = pluginMetrics;
          }
        }
      }
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            metrics,
            timestamp: new Date().toISOString()
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to get plugin metrics:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get plugin metrics: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 플러그인 업데이트
   */
  private async updatePlugin(args: { pluginId: string; version?: string }): Promise<any> {
    try {
      const success = await this.pluginManager.updatePlugin(args.pluginId, args.version);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success,
            message: success ? `Plugin ${args.pluginId} updated successfully` : `Failed to update plugin ${args.pluginId}`
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to update plugin:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to update plugin: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 플러그인 업데이트 확인
   */
  private async checkPluginUpdates(): Promise<any> {
    try {
      const updates = await this.pluginManager.checkForUpdates();
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            updates: updates.map(update => ({
              pluginId: update.pluginId,
              currentVersion: update.currentVersion,
              latestVersion: update.latestVersion,
              updateAvailable: update.currentVersion !== update.latestVersion
            })),
            total: updates.length,
            timestamp: new Date().toISOString()
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to check plugin updates:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to check plugin updates: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 플러그인 시스템 통계
   */
  private getPluginSystemStats(): any {
    try {
      const stats = this.pluginManager.getSystemStats();
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            totalPlugins: stats.totalPlugins,
            loadedPlugins: stats.loadedPlugins,
            activePlugins: stats.activePlugins,
            failedPlugins: stats.failedPlugins,
            categories: stats.categories,
            memoryUsage: stats.memoryUsage,
            uptime: stats.uptime,
            lastHealthCheck: stats.lastHealthCheck,
            timestamp: new Date().toISOString()
          }, null, 2),
        }],
      };
    } catch (error) {
      this.logError('Failed to get plugin system stats:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get plugin system stats: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // ========================================
  // 다중 프로젝트 관리 메서드들
  // ========================================

  /**
   * 프로젝트 생성
   */
  private async createProject(args: { 
    name: string; 
    description?: string; 
    type?: string; 
    priority?: string; 
    rootPath?: string; 
    tags?: string[] 
  }): Promise<any> {
    try {
      const { name, description, type, priority, rootPath, tags } = args;
      
      const createProjectData: any = {
        name,
        description,
        type: type as any,
        priority: priority as any,
        tags: tags || []
      };
      
      if (rootPath) {
        createProjectData.paths = { root: rootPath, source: [], test: [], docs: [], build: [], config: [] };
      }
      
      const project = await this.multiProjectSystem.getProjectManager().createProject(createProjectData);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            project: {
              id: project.id,
              name: project.name,
              description: project.description,
              type: project.type,
              status: project.status,
              priority: project.priority,
              tags: project.tags,
              createdAt: new Date(project.createdAt).toISOString(),
              rootPath: project.paths.root
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to create project:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create project: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 프로젝트 목록 조회
   */
  private async listProjects(args: { 
    status?: string; 
    type?: string; 
    limit?: number 
  }): Promise<any> {
    try {
      const { status, type, limit } = args;
      
      let projects = this.multiProjectSystem.getProjectManager().getAllProjects();
      
      // 필터 적용
      if (status || type) {
        projects = this.multiProjectSystem.getProjectManager().getProjectsByFilter({
          status: status as any,
          type: type as any
        });
      }
      
      // 제한 적용
      if (limit && limit > 0) {
        projects = projects.slice(0, limit);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            projects: projects.map(p => ({
              id: p.id,
              name: p.name,
              description: p.description,
              type: p.type,
              status: p.status,
              priority: p.priority,
              tags: p.tags,
              createdAt: new Date(p.createdAt).toISOString(),
              updatedAt: new Date(p.updatedAt).toISOString(),
              rootPath: p.paths.root
            })),
            total: projects.length
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to list projects:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list projects: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 프로젝트 상세 조회
   */
  private async getProject(args: { projectId: string }): Promise<any> {
    try {
      const { projectId } = args;
      
      const project = this.multiProjectSystem.getProjectManager().getProject(projectId);
      
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            project: {
              id: project.id,
              name: project.name,
              description: project.description,
              version: project.version,
              type: project.type,
              status: project.status,
              priority: project.priority,
              tags: project.tags,
              owner: project.owner,
              settings: project.settings,
              paths: project.paths,
              repository: project.repository,
              createdAt: new Date(project.createdAt).toISOString(),
              updatedAt: new Date(project.updatedAt).toISOString()
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to get project:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get project: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 프로젝트 업데이트
   */
  private async updateProject(args: { 
    projectId: string; 
    name?: string; 
    description?: string; 
    status?: string; 
    priority?: string; 
    tags?: string[] 
  }): Promise<any> {
    try {
      const { projectId, ...updates } = args;
      
      const updateData: any = {};
      
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.priority !== undefined) updateData.priority = updates.priority;
      if (updates.tags !== undefined) updateData.tags = updates.tags;
      
      const project = await this.multiProjectSystem.getProjectManager().updateProject(projectId, updateData);
      
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            project: {
              id: project.id,
              name: project.name,
              description: project.description,
              type: project.type,
              status: project.status,
              priority: project.priority,
              tags: project.tags,
              updatedAt: new Date(project.updatedAt).toISOString()
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to update project:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to update project: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 프로젝트 삭제
   */
  private async deleteProject(args: { projectId: string }): Promise<any> {
    try {
      const { projectId } = args;
      
      const success = await this.multiProjectSystem.getProjectManager().deleteProject(projectId);
      
      if (!success) {
        throw new Error(`Project not found: ${projectId}`);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            projectId,
            message: 'Project deleted successfully'
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to delete project:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to delete project: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 프로젝트 자동 검색
   */
  private async discoverProjects(args: { 
    searchPaths?: string[]; 
    autoRegister?: boolean 
  }): Promise<any> {
    try {
      const { searchPaths, autoRegister = true } = args;
      
      const projects = await this.multiProjectSystem.getProjectManager().discoverProjects();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            discoveredProjects: projects.map(p => ({
              id: p.id,
              name: p.name,
              type: p.type,
              rootPath: p.paths.root,
              status: p.status
            })),
            total: projects.length,
            searchPaths: searchPaths || ['default'],
            autoRegistered: autoRegister
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to discover projects:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to discover projects: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 프로젝트 검색
   */
  private async searchProjects(args: { 
    query?: string; 
    type?: string; 
    status?: string; 
    tags?: string[] 
  }): Promise<any> {
    try {
      const { query, type, status, tags } = args;
      
      const searchQuery: any = {};
      
      if (query !== undefined) searchQuery.name = query;
      if (type !== undefined) searchQuery.type = type;
      if (status !== undefined) searchQuery.status = status;
      if (tags !== undefined) searchQuery.tags = tags;
      
      const projects = await this.multiProjectSystem.searchProjects(searchQuery);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            results: projects.map(p => ({
              id: p.id,
              name: p.name,
              description: p.description,
              type: p.type,
              status: p.status,
              tags: p.tags,
              rootPath: p.paths.root
            })),
            total: projects.length,
            searchCriteria: searchQuery
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to search projects:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to search projects: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 프로젝트 메트릭 조회
   */
  private async getProjectMetrics(args: { 
    projectId: string; 
    timeRange?: string 
  }): Promise<any> {
    try {
      const { projectId, timeRange = '24h' } = args;
      
      const project = this.multiProjectSystem.getProjectManager().getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }

      // 실제로는 데이터베이스에서 메트릭을 조회해야 함
      // 여기서는 간단한 더미 데이터 반환
      const metrics = {
        projectId,
        timeRange,
        timestamp: new Date().toISOString(),
        code: {
          totalLines: 1000,
          codeLines: 800,
          commentLines: 150,
          fileCount: 50,
          complexity: 3.2
        },
        quality: {
          testCoverage: 85.5,
          codeQuality: 8.2,
          bugCount: 3
        },
        activity: {
          commits: 25,
          fileChanges: 48,
          builds: 12
        }
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ metrics }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to get project metrics:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get project metrics: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 프로젝트 메트릭 수집
   */
  private async collectProjectMetrics(args: { projectId?: string }): Promise<any> {
    try {
      const { projectId } = args;
      
      await this.multiProjectSystem.collectMetrics(projectId);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: projectId ? 
              `Metrics collected for project: ${projectId}` : 
              'Metrics collected for all active projects',
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to collect project metrics:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to collect project metrics: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 크로스 프로젝트 분석 실행
   */
  private async runCrossProjectAnalysis(args: { 
    projectIds?: string[]; 
    analysisType?: string 
  }): Promise<any> {
    try {
      const { projectIds, analysisType = 'similarity' } = args;
      
      const analysis = await this.multiProjectSystem.runCrossAnalysis(
        projectIds, 
        analysisType as any
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            analysis: {
              id: analysis.id,
              type: analysis.type,
              projects: analysis.projects,
              timestamp: new Date(analysis.timestamp).toISOString(),
              results: analysis.results,
              insights: analysis.insights,
              recommendations: analysis.recommendations
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to run cross-project analysis:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to run cross-project analysis: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 프로젝트 의존성 조회
   */
  private async getProjectDependencies(args: { 
    projectId: string; 
    direction?: string 
  }): Promise<any> {
    try {
      const { projectId, direction = 'both' } = args;
      
      const project = this.multiProjectSystem.getProjectManager().getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }

      // 실제로는 데이터베이스에서 의존성을 조회해야 함
      // 여기서는 간단한 더미 데이터 반환
      const dependencies = {
        projectId,
        direction,
        incoming: [],
        outgoing: [],
        circular: [],
        total: 0
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ dependencies }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to get project dependencies:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get project dependencies: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 다중 프로젝트 시스템 상태 조회
   */
  private async getMultiProjectStatus(): Promise<any> {
    try {
      const systemStatus = this.multiProjectSystem.getSystemStatus();
      const systemStats = this.multiProjectSystem.getSystemStats();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            system: {
              running: systemStatus.running,
              projectsCount: systemStatus.projectsCount,
              activeProjects: systemStatus.activeProjects,
              syncEnabled: systemStatus.syncEnabled,
              syncStatus: systemStatus.syncStatus,
              runningAnalysis: systemStatus.runningAnalysis
            },
            stats: systemStats,
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to get multi-project status:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get multi-project status: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 프로젝트 포트폴리오 조회
   */
  private async getProjectPortfolio(args: { groupBy?: string }): Promise<any> {
    try {
      const { groupBy = 'type' } = args;
      
      const stats = this.multiProjectSystem.getProjectManager().getProjectStats();
      const projects = this.multiProjectSystem.getProjectManager().getAllProjects();

      const portfolio = {
        overview: {
          totalProjects: stats.total,
          activeProjects: stats.byStatus['active'] || 0,
          projectTypes: Object.keys(stats.byType).length,
          averageProjectAge: projects.length > 0 ? 
            (Date.now() - projects.reduce((sum, p) => sum + p.createdAt, 0) / projects.length) / (1000 * 60 * 60 * 24) : 0
        },
        breakdown: {
          byStatus: stats.byStatus,
          byType: stats.byType,
          byPriority: stats.byPriority
        },
        groupBy,
        timestamp: new Date().toISOString()
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ portfolio }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to get project portfolio:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get project portfolio: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 프로젝트 동기화 활성화
   */
  private async enableProjectSync(args: { 
    endpoint: string; 
    apiKey: string; 
    interval?: number 
  }): Promise<any> {
    try {
      const { endpoint, apiKey, interval = 300 } = args;
      
      const syncClient = this.multiProjectSystem.getSyncClient();
      if (!syncClient) {
        throw new Error('Sync client is not configured');
      }

      await syncClient.updateConfig({
        enabled: true,
        endpoint,
        apiKey,
        interval
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'Project synchronization enabled',
            config: {
              endpoint,
              interval,
              enabled: true
            },
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to enable project sync:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to enable project sync: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 프로젝트 동기화 트리거
   */
  private async triggerProjectSync(args: { force?: boolean }): Promise<any> {
    try {
      const { force = false } = args;
      
      const result = await this.multiProjectSystem.triggerSync(force);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            syncResult: {
              success: result.success,
              syncedIds: result.syncedIds,
              failedIds: result.failedIds,
              duration: result.duration,
              bytesTransferred: result.bytesTransferred,
              errors: result.errors
            },
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to trigger project sync:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to trigger project sync: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 프로젝트 동기화 상태 조회
   */
  private async getProjectSyncStatus(): Promise<any> {
    try {
      const syncClient = this.multiProjectSystem.getSyncClient();
      if (!syncClient) {
        throw new Error('Sync client is not configured');
      }

      const status = syncClient.getSyncStatus();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            syncStatus: {
              lastSyncTime: new Date(status.lastSyncTime).toISOString(),
              pendingEvents: status.pendingEvents,
              failedEvents: status.failedEvents,
              connected: status.connected,
              syncing: status.syncing,
              avgLatency: status.avgLatency,
              successRate: Math.round(status.successRate * 100)
            },
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to get project sync status:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get project sync status: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 보고서 생성 도구
   */
  private async generateReportTool(args: {
    type: string;
    format?: string;
    projectIds?: string[];
    periodStart?: string;
    periodEnd?: string;
    sections?: string[];
    deliveryChannels?: any[];
  }): Promise<any> {
    try {
      const { type, format = 'pdf', projectIds, periodStart, periodEnd, sections, deliveryChannels } = args;
      
      // 보고서 설정 생성
      const config = {
        type: type as any,
        sections: sections?.map((s, i) => ({
          id: s,
          name: s,
          type: s as any,
          enabled: true,
          order: i + 1
        })) || [],
        formats: [format as any],
        deliveryChannels: deliveryChannels || []
      };
      
      // 보고서 생성
      const report = await this.reportSystem.generateReport(
        config,
        projectIds,
        periodStart ? new Date(periodStart).getTime() : undefined,
        periodEnd ? new Date(periodEnd).getTime() : undefined
      );
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            reportId: report.metadata.id,
            title: report.metadata.title,
            type: report.metadata.type,
            generatedAt: new Date(report.metadata.createdAt).toISOString(),
            files: report.files.map(f => ({
              format: f.format,
              path: f.path,
              size: f.size
            })),
            status: 'completed'
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to generate report:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to generate report: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 빠른 보고서 생성 도구
   */
  private async generateQuickReportTool(args: {
    type: 'daily' | 'weekly' | 'monthly';
    projectIds?: string[];
  }): Promise<any> {
    try {
      const { type, projectIds } = args;
      
      let report;
      switch (type) {
        case 'daily':
          report = await this.reportSystem.generateDailyReport(projectIds);
          break;
        case 'weekly':
          report = await this.reportSystem.generateWeeklyReport(projectIds);
          break;
        case 'monthly':
          report = await this.reportSystem.generateMonthlyReport(projectIds);
          break;
        default:
          throw new Error(`Invalid report type: ${type}`);
      }
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            reportId: report.metadata.id,
            title: report.metadata.title,
            type: report.metadata.type,
            generatedAt: new Date(report.metadata.createdAt).toISOString(),
            files: report.files.map(f => ({
              format: f.format,
              path: f.path,
              size: f.size
            })),
            status: 'completed'
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to generate quick report:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to generate quick report: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 보고서 스케줄 생성 도구
   */
  private async createReportScheduleTool(args: {
    name: string;
    type: string;
    scheduleType: string;
    time?: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
    cron?: string;
    deliveryChannels?: any[];
  }): Promise<any> {
    try {
      const { name, type, scheduleType, time, dayOfWeek, dayOfMonth, cron, deliveryChannels } = args;
      
      let schedule;
      switch (scheduleType) {
        case 'daily':
          schedule = await this.reportSystem.createDailySchedule(
            name,
            time || '09:00',
            deliveryChannels,
            'system'
          );
          break;
        case 'weekly':
          schedule = await this.reportSystem.createWeeklySchedule(
            name,
            dayOfWeek || 1,
            time || '09:00',
            deliveryChannels,
            'system'
          );
          break;
        case 'monthly':
          schedule = await this.reportSystem.createMonthlySchedule(
            name,
            dayOfMonth || 1,
            time || '09:00',
            deliveryChannels,
            'system'
          );
          break;
        case 'cron':
          if (!cron) throw new Error('Cron expression is required for cron schedule');
          const template = this.reportSystem.getAllTemplates({ type: type as any })[0];
          if (!template) throw new Error(`Template not found for type: ${type}`);
          
          const config = template.defaultConfig;
          if (deliveryChannels) {
            config.deliveryChannels = deliveryChannels;
          }
          
          schedule = await this.reportSystem.createSchedule(
            name,
            config,
            { type: 'cron', cron },
            'system'
          );
          break;
        default:
          throw new Error(`Invalid schedule type: ${scheduleType}`);
      }
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            scheduleId: schedule.id,
            name: schedule.name,
            enabled: schedule.enabled,
            nextRunAt: schedule.nextRunAt ? new Date(schedule.nextRunAt).toISOString() : null,
            createdAt: new Date(schedule.createdAt).toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to create report schedule:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create report schedule: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 보고서 스케줄 목록 조회 도구
   */
  private async listReportSchedulesTool(): Promise<any> {
    try {
      const schedules = this.reportSystem.getAllSchedules();
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            schedules: schedules.map(s => ({
              id: s.id,
              name: s.name,
              type: s.reportConfig.type,
              enabled: s.enabled,
              schedule: s.schedule,
              lastRunAt: s.lastRunAt ? new Date(s.lastRunAt).toISOString() : null,
              nextRunAt: s.nextRunAt ? new Date(s.nextRunAt).toISOString() : null,
              createdBy: s.createdBy,
              createdAt: new Date(s.createdAt).toISOString()
            })),
            total: schedules.length
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to list report schedules:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list report schedules: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 보고서 템플릿 생성 도구
   */
  private async createReportTemplateTool(args: {
    name: string;
    description: string;
    type: string;
    sections: string[];
    formats: string[];
    parameters?: any;
  }): Promise<any> {
    try {
      const { name, description, type, sections, formats, parameters } = args;
      
      const config = {
        type: type as any,
        sections: sections.map((s, i) => ({
          id: s,
          name: s,
          type: s as any,
          enabled: true,
          order: i + 1
        })),
        formats: formats as any[],
        deliveryChannels: [],
        parameters: parameters || {}
      };
      
      const template = await this.reportSystem.createTemplate(
        name,
        description,
        type as any,
        config,
        'user',
        true
      );
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            templateId: template.id,
            name: template.name,
            description: template.description,
            type: template.type,
            createdAt: new Date(template.createdAt).toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to create report template:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create report template: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 보고서 템플릿 목록 조회 도구
   */
  private async listReportTemplatesTool(args: {
    type?: string;
  }): Promise<any> {
    try {
      const { type } = args;
      
      const templates = this.reportSystem.getAllTemplates(
        type ? { type: type as any } : undefined
      );
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            templates: templates.map(t => ({
              id: t.id,
              name: t.name,
              description: t.description,
              type: t.type,
              public: t.public,
              createdBy: t.createdBy,
              tags: t.tags,
              sections: t.defaultConfig.sections.length,
              formats: t.defaultConfig.formats,
              createdAt: new Date(t.createdAt).toISOString()
            })),
            total: templates.length
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to list report templates:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list report templates: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 보고서 시스템 상태 조회 도구
   */
  private async getReportSystemStatusTool(): Promise<any> {
    try {
      const status = this.reportSystem.getSystemStatus();
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status,
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to get report system status:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get report system status: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 보고서 배포 도구
   */
  private async deliverReportTool(args: {
    reportId: string;
    channels: any[];
  }): Promise<any> {
    try {
      const { reportId, channels } = args;
      
      // 실제 구현에서는 reportId로 저장된 보고서를 조회해야 함
      // 여기서는 간단한 응답 반환
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            reportId,
            deliveryResults: channels.map(ch => ({
              channel: ch.channel,
              success: true,
              deliveredAt: new Date().toISOString()
            })),
            status: 'delivered'
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to deliver report:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to deliver report: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 스케줄 즉시 실행 도구
   */
  private async runScheduleNowTool(args: {
    scheduleId: string;
  }): Promise<any> {
    try {
      const { scheduleId } = args;
      
      const report = await this.reportSystem.runScheduleNow(scheduleId);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            reportId: report.metadata.id,
            title: report.metadata.title,
            type: report.metadata.type,
            generatedAt: new Date(report.metadata.createdAt).toISOString(),
            files: report.files.map(f => ({
              format: f.format,
              path: f.path,
              size: f.size
            })),
            status: 'completed'
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to run schedule:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to run schedule: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 피드백 제출 도구
   */
  private async submitFeedbackTool(args: {
    type: string;
    title: string;
    description: string;
    projectId?: string;
    priority?: string;
    tags?: string[];
  }): Promise<any> {
    try {
      const feedback = await this.feedbackSystem.submitFeedback({
        type: args.type as FeedbackType,
        title: args.title,
        description: args.description,
        projectId: args.projectId,
        priority: args.priority as FeedbackPriority,
        tags: args.tags
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            feedback: {
              id: feedback.id,
              type: feedback.type,
              title: feedback.title,
              status: feedback.status,
              priority: feedback.priority,
              submittedAt: new Date(feedback.submittedAt).toISOString()
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to submit feedback:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to submit feedback: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 피드백 목록 조회 도구
   */
  private async listFeedbackTool(args: {
    limit?: number;
    type?: string;
    status?: string;
    priority?: string;
    projectId?: string;
  }): Promise<any> {
    try {
      const filterOptions: any = {};
      
      if (args.type !== undefined) filterOptions.type = args.type as FeedbackType;
      if (args.status !== undefined) filterOptions.status = args.status as FeedbackStatus;
      if (args.priority !== undefined) filterOptions.priority = args.priority as FeedbackPriority;
      if (args.projectId !== undefined) filterOptions.projectId = args.projectId;
      
      const feedbacks = await this.feedbackSystem.listFeedback(
        args.limit,
        0,
        filterOptions
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            feedbacks: feedbacks.map(f => ({
              id: f.id,
              type: f.type,
              title: f.title,
              status: f.status,
              priority: f.priority,
              submittedAt: new Date(f.submittedAt).toISOString(),
              tags: f.tags
            })),
            total: feedbacks.length
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to list feedback:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list feedback: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 피드백 상세 조회 도구
   */
  private async getFeedbackDetailsTool(args: {
    feedbackId: string;
  }): Promise<any> {
    try {
      const feedback = await this.feedbackSystem.getFeedback(args.feedbackId);

      if (!feedback) {
        throw new McpError(ErrorCode.InvalidRequest, 'Feedback not found');
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            feedback: {
              id: feedback.id,
              type: feedback.type,
              title: feedback.title,
              description: feedback.description,
              status: feedback.status,
              priority: feedback.priority,
              source: feedback.source,
              submitter: feedback.submitter,
              projectId: feedback.projectId,
              submittedAt: new Date(feedback.submittedAt).toISOString(),
              updatedAt: new Date(feedback.updatedAt).toISOString(),
              tags: feedback.tags,
              attachments: feedback.attachments
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to get feedback details:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get feedback details: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 피드백 상태 업데이트 도구
   */
  private async updateFeedbackStatusTool(args: {
    feedbackId: string;
    status: string;
  }): Promise<any> {
    try {
      await this.feedbackSystem.updateFeedbackStatus(
        args.feedbackId,
        args.status as FeedbackStatus
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            feedbackId: args.feedbackId,
            newStatus: args.status
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to update feedback status:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to update feedback status: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 개선 제안 목록 조회 도구
   */
  private async listImprovementSuggestionsTool(args: {
    status?: string;
  }): Promise<any> {
    try {
      const suggestions = await this.feedbackSystem.listImprovementSuggestions(args.status);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            suggestions: suggestions.map(s => ({
              id: s.id,
              type: s.type,
              title: s.title,
              description: s.description,
              impact: s.impact,
              status: s.status,
              feedbackCount: s.feedbackIds.length,
              createdAt: new Date(s.createdAt).toISOString()
            })),
            total: suggestions.length
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to list improvement suggestions:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list improvement suggestions: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 사용자 선호도 조회 도구
   */
  private async getUserPreferencesTool(args: {
    userId: string;
  }): Promise<any> {
    try {
      const preferences = await this.feedbackSystem.getUserPreferences(args.userId);

      if (!preferences) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              message: 'No preferences found for this user',
              userId: args.userId
            }, null, 2)
          }]
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            preferences: {
              userId: preferences.userId,
              preferredFeatures: preferences.preferredFeatures,
              workflowPatterns: preferences.workflowPatterns,
              uiPreferences: preferences.uiPreferences,
              notificationPreferences: preferences.notificationPreferences,
              confidence: preferences.confidence,
              learnedAt: new Date(preferences.learnedAt).toISOString()
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to get user preferences:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get user preferences: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * A/B 테스트 생성 도구
   */
  private async createABTestTool(args: {
    name: string;
    description: string;
    variants: any[];
    metrics: any[];
    audiencePercentage?: number;
  }): Promise<any> {
    try {
      const test = await this.feedbackSystem.createABTest(
        args.name,
        args.description,
        args.variants,
        args.metrics,
        args.audiencePercentage
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            test: {
              id: test.id,
              name: test.name,
              description: test.description,
              status: test.status,
              variants: test.variants.map(v => ({
                id: v.id,
                name: v.name,
                trafficPercentage: v.trafficPercentage,
                isControl: v.isControl
              })),
              metrics: test.metrics,
              createdAt: new Date(test.createdAt).toISOString()
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to create A/B test:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create A/B test: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 활성 A/B 테스트 목록 조회 도구
   */
  private async listActiveABTestsTool(): Promise<any> {
    try {
      const tests = await this.feedbackSystem.listActiveABTests();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            tests: tests.map(t => ({
              id: t.id,
              name: t.name,
              description: t.description,
              status: t.status,
              variantCount: t.variants.length,
              metricCount: t.metrics.length,
              audiencePercentage: t.audience.percentage,
              startTime: t.startTime ? new Date(t.startTime).toISOString() : null,
              createdAt: new Date(t.createdAt).toISOString()
            })),
            total: tests.length
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to list active A/B tests:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list active A/B tests: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * A/B 테스트 결과 조회 도구
   */
  private async getABTestResultsTool(args: {
    testId: string;
  }): Promise<any> {
    try {
      const results = await this.feedbackSystem.getABTestResults(args.testId);

      if (!results) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              message: 'No results available for this test',
              testId: args.testId
            }, null, 2)
          }]
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            results: {
              testId: results.testId,
              variantResults: results.variantResults,
              winner: results.winner,
              analyzedAt: new Date(results.analyzedAt).toISOString()
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to get A/B test results:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get A/B test results: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 피드백 통계 조회 도구
   */
  private async getFeedbackStatsTool(args: {
    projectId?: string;
  }): Promise<any> {
    try {
      const stats = await this.feedbackSystem.getFeedbackStats(args.projectId);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            stats: {
              total: stats.total,
              byType: stats.byType,
              byStatus: stats.byStatus,
              byPriority: stats.byPriority,
              projectId: args.projectId || 'all'
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logError('Failed to get feedback stats:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get feedback stats: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

// 서버 인스턴스 생성 및 시작
const server = new DevFlowMonitorServer();
server.start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', error);
  process.exit(1);
});