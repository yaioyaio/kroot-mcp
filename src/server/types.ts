/**
 * MCP 서버 타입 정의
 */

/**
 * MCP 도구 인터페이스
 */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * 도구 실행 인자 타입들
 */
export interface GetProjectStatusArgs {
  includeDetails?: boolean;
}

export interface GetMetricsArgs {
  timeRange?: '1h' | '1d' | '1w' | '1m';
  metricType?: 'all' | 'commits' | 'files' | 'tests' | 'builds';
}

export interface GetActivityLogArgs {
  limit?: number;
  stage?: 'planning' | 'design' | 'coding' | 'testing' | 'review' | 'deployment' | 'monitoring';
}

export interface AnalyzeBottlenecksArgs {
  analysisDepth?: 'basic' | 'detailed' | 'comprehensive';
}

export interface CheckMethodologyArgs {
  methodology?: 'all' | 'ddd' | 'tdd' | 'bdd' | 'eda';
  includeRecommendations?: boolean;
}

export interface GenerateReportArgs {
  reportType?: 'daily' | 'weekly' | 'monthly' | 'custom';
  format?: 'json' | 'markdown' | 'summary';
  includeMetrics?: boolean;
  includeTrends?: boolean;
}

/**
 * MCP 응답 컨텐츠 타입 - SDK와 호환되는 타입 사용
 */
export interface McpTextContent {
  type: 'text';
  text: string;
}

export interface McpResponse {
  content: McpTextContent[];
  isError?: boolean;
}

/**
 * 프로젝트 상태 응답 타입
 */
export interface ProjectStatusResponse {
  project: {
    name: string;
    version: string;
    status: string;
    lastActivity: string;
    totalEvents?: number;
    uptime?: number;
  };
  milestones: {
    current: string;
    progress: {
      total: number;
      completed: number;
      current: string;
      percentage?: number;
    };
    completed?: string[];
  };
  environment: {
    nodeVersion: string;
    platform: string;
    cwd: string;
    memoryUsage?: any;
    pid?: number;
  };
  metrics?: {
    events?: any;
    activity?: any;
    queue?: any;
  };
  details?: unknown;
}

/**
 * 메트릭 응답 타입
 */
export interface MetricsResponse {
  timeRange: string;
  metricType: string;
  timestamp: string;
  data: {
    events?: {
      total: number;
      byCategory: Record<string, number>;
      bySeverity: Record<string, number>;
      rate: number;
    };
    git?: {
      commits: number;
      branches: number;
      merges: number;
    };
    files?: {
      changed: number;
      created: number;
      modified: number;
      deleted: number;
    };
    system?: {
      uptime: number;
      memoryUsage: number;
      cpuUsage: any;
    };
    queue?: {
      totalQueues: number;
      totalEvents: number;
      processing: number;
      throughput: number;
    };
  };
  analysis?: {
    trend: any;
    health: any;
    recommendations: string[];
  };
  summary: string;
}

/**
 * 활동 로그 응답 타입
 */
export interface ActivityLogResponse {
  totalCount: number;
  activities: Array<{
    id: string;
    timestamp: string;
    stage: string;
    action: string;
    details: string;
    actor: string;
    category?: string;
    severity?: string;
    metadata?: Record<string, any>;
  }>;
  filters: {
    limit: number;
    stage?: string;
  };
  summary?: {
    totalEvents: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    timeRange?: {
      start: string;
      end: string;
    };
  };
}

/**
 * 병목 분석 응답 타입
 */
export interface BottleneckAnalysisResponse {
  analysisDepth: string;
  timestamp: string;
  bottlenecks: Array<{
    category: string;
    severity: string;
    description: string;
    suggestion: string;
    metrics?: {
      current: number;
      threshold: number;
      recommendation: string;
      [key: string]: any;
    };
  }>;
  recommendations: string[];
  nextSteps: string[];
  systemMetrics?: {
    eventProcessingRate: number;
    memoryUsage: number;
    queueBacklog: number;
    activeMonitors: {
      fileMonitor: string;
      gitMonitor: string;
    };
  };
  analysis?: {
    pattern: any;
    trends: any;
    efficiency: any;
  };
}

/**
 * 방법론 검사 응답 타입
 */
export interface CheckMethodologyResponse {
  methodology: string;
  timestamp: string;
  compliance: {
    overall: number;
    byMethodology: Record<string, number>;
  };
  findings: Array<{
    methodology: string;
    status: 'compliant' | 'partial' | 'non-compliant';
    score: number;
    description: string;
    recommendations: string[];
  }>;
  summary: string;
}

/**
 * 리포트 생성 응답 타입
 */
export interface GenerateReportResponse {
  reportType: string;
  format: string;
  timestamp: string;
  period: {
    start: string;
    end: string;
  };
  summary: {
    totalActivities: number;
    keyMetrics: Record<string, number>;
    highlights: string[];
  };
  sections: Array<{
    title: string;
    content: string;
    metrics?: Record<string, number>;
  }>;
  recommendations: string[];
}
