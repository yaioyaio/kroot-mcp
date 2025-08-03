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
  };
  milestones: {
    current: string;
    progress: {
      total: number;
      completed: number;
      current: string;
    };
  };
  environment: {
    nodeVersion: string;
    platform: string;
    cwd: string;
  };
  details?: unknown;
}

/**
 * 메트릭 응답 타입
 */
export interface MetricsResponse {
  timeRange: string;
  metricType: string;
  data: {
    commits: number;
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
    testsPassed: number;
    testsFailed: number;
    buildSuccess: number;
    buildFailed: number;
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
  }>;
  filters: {
    limit: number;
    stage?: string;
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
  }>;
  recommendations: string[];
  nextSteps: string[];
}
