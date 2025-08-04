/**
 * AI 협업 추적 관련 타입 정의
 */

/**
 * 지원하는 AI 도구
 */
export enum AITool {
  CLAUDE = 'claude',
  GITHUB_COPILOT = 'github_copilot',
  CHATGPT = 'chatgpt',
  CURSOR = 'cursor',
  TABNINE = 'tabnine',
  CODEWHISPERER = 'codewhisperer',
  OTHER = 'other'
}

/**
 * AI 도구 사용 유형
 */
export enum AIUsageType {
  CODE_GENERATION = 'code_generation',
  CODE_COMPLETION = 'code_completion',
  CODE_EXPLANATION = 'code_explanation',
  CODE_REVIEW = 'code_review',
  DEBUGGING = 'debugging',
  REFACTORING = 'refactoring',
  DOCUMENTATION = 'documentation',
  TESTING = 'testing',
  ARCHITECTURE = 'architecture',
  OTHER = 'other'
}

/**
 * AI 제안 상태
 */
export enum AISuggestionStatus {
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  MODIFIED = 'modified',
  PENDING = 'pending'
}

/**
 * AI 사용 감지 결과
 */
export interface AIUsageDetection {
  tool: AITool;
  usageType: AIUsageType;
  timestamp: number;
  filePath?: string;
  lineRange?: {
    start: number;
    end: number;
  };
  prompt?: string;
  suggestion?: string;
  confidence: number;
  context?: string;
}

/**
 * AI 제안 추적
 */
export interface AISuggestion {
  id: string;
  tool: AITool;
  usageType: AIUsageType;
  status: AISuggestionStatus;
  timestamp: number;
  filePath: string;
  originalCode?: string;
  suggestedCode: string;
  acceptedCode?: string;
  modificationRatio?: number; // 0-1, 수정된 비율
  responseTime?: number; // ms
  tokenCount?: number;
}

/**
 * AI 도구 세션
 */
export interface AISession {
  id: string;
  tool: AITool;
  startTime: number;
  endTime?: number;
  interactions: AIInteraction[];
  totalTokens?: number;
  totalCost?: number;
}

/**
 * AI 상호작용
 */
export interface AIInteraction {
  timestamp: number;
  type: AIUsageType;
  prompt?: string;
  response?: string;
  tokenCount?: number;
  duration?: number; // ms
  result?: AISuggestionStatus;
}

/**
 * AI 효과성 메트릭
 */
export interface AIEffectivenessMetrics {
  tool: AITool;
  timeWindow: 'hour' | 'day' | 'week' | 'month';
  acceptanceRate: number; // 0-1
  modificationRate: number; // 0-1
  averageResponseTime: number; // ms
  totalInteractions: number;
  successfulInteractions: number;
  tokenEfficiency: number; // 유용한 코드 / 총 토큰
  timesSaved: number; // 예상 절약 시간 (분)
  codeQualityImpact: {
    bugsIntroduced: number;
    bugsFixed: number;
    complexityChange: number;
    testCoverageChange: number;
  };
}

/**
 * AI 사용 패턴
 */
export interface AIUsagePattern {
  tool: AITool;
  patterns: {
    mostUsedTypes: AIUsageType[];
    peakHours: number[]; // 0-23
    averageSessionDuration: number; // 분
    preferredFileTypes: string[];
    commonPromptPatterns: string[];
  };
  productivity: {
    linesGeneratedPerHour: number;
    functionsCompletedPerDay: number;
    testsWrittenPerWeek: number;
  };
}

/**
 * AI 코드 품질 분석
 */
export interface AICodeQualityAnalysis {
  suggestion: AISuggestion;
  quality: {
    readability: number; // 0-100
    maintainability: number; // 0-100
    performance: number; // 0-100
    security: number; // 0-100
    testability: number; // 0-100
  };
  issues: {
    type: 'bug' | 'vulnerability' | 'code_smell' | 'performance';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
  }[];
  improvements: string[];
}

/**
 * AI 협업 분석 결과
 */
export interface AICollaborationAnalysis {
  timestamp: number;
  tools: {
    [key in AITool]?: {
      sessions: number;
      interactions: number;
      acceptanceRate: number;
      timesSaved: number;
      preferredUsageTypes: AIUsageType[];
    };
  };
  overallMetrics: {
    totalAIAssistedTime: number; // 분
    humanCodingTime: number; // 분
    aiContributionRatio: number; // 0-1
    productivityGain: number; // 백분율
  };
  insights: {
    mostEffectiveTool: AITool;
    bestUseCases: AIUsageType[];
    improvementAreas: string[];
    recommendations: string[];
  };
  trends: {
    adoptionRate: number[]; // 시간별 사용률
    qualityTrend: number[]; // 시간별 품질 점수
    efficiencyTrend: number[]; // 시간별 효율성
  };
}

/**
 * AI 모니터 이벤트
 */
export interface AIMonitorEvents {
  aiUsageDetected: (detection: AIUsageDetection) => void;
  suggestionTracked: (suggestion: AISuggestion) => void;
  sessionStarted: (session: AISession) => void;
  sessionEnded: (session: AISession) => void;
  metricsUpdated: (metrics: AIEffectivenessMetrics) => void;
  patternIdentified: (pattern: AIUsagePattern) => void;
  qualityAnalyzed: (analysis: AICodeQualityAnalysis) => void;
}

/**
 * AI 도구 설정
 */
export interface AIToolConfig {
  tool: AITool;
  enabled: boolean;
  apiEndpoint?: string;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  detectionPatterns?: RegExp[];
  filePatterns?: string[];
}

/**
 * AI 감지 규칙
 */
export interface AIDetectionRule {
  tool: AITool;
  patterns: {
    comment?: RegExp[];
    code?: RegExp[];
    file?: RegExp[];
    process?: RegExp[];
  };
  confidence: number;
}