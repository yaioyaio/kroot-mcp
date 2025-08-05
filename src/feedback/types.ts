/**
 * DevFlow Monitor MCP - 사용자 피드백 시스템 타입 정의
 * 
 * 사용자 피드백 수집, 분석, 개선을 위한 핵심 타입들을 정의합니다.
 */

import { EventCategory, EventSeverity } from '../events/types/base.js';
import { DevelopmentStage } from '../analyzers/types/stages.js';

/**
 * 피드백 타입
 */
export enum FeedbackType {
  BUG_REPORT = 'bug_report',
  FEATURE_REQUEST = 'feature_request',
  USABILITY_ISSUE = 'usability_issue',
  PERFORMANCE_ISSUE = 'performance_issue',
  DOCUMENTATION = 'documentation',
  GENERAL = 'general',
  PRAISE = 'praise'
}

/**
 * 피드백 상태
 */
export enum FeedbackStatus {
  NEW = 'new',
  REVIEWING = 'reviewing',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  DEFERRED = 'deferred'
}

/**
 * 피드백 우선순위
 */
export enum FeedbackPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

/**
 * 피드백 소스
 */
export enum FeedbackSource {
  IN_APP = 'in_app',
  CLI = 'cli',
  API = 'api',
  DASHBOARD = 'dashboard',
  EMAIL = 'email',
  GITHUB = 'github',
  SURVEY = 'survey'
}

/**
 * 피드백 메타데이터
 */
export interface FeedbackMetadata {
  /** 피드백 ID */
  id: string;
  
  /** 피드백 타입 */
  type: FeedbackType;
  
  /** 제목 */
  title: string;
  
  /** 설명 */
  description: string;
  
  /** 상태 */
  status: FeedbackStatus;
  
  /** 우선순위 */
  priority: FeedbackPriority;
  
  /** 소스 */
  source: FeedbackSource;
  
  /** 제출자 정보 */
  submitter: {
    id?: string;
    email?: string;
    name?: string;
  };
  
  /** 프로젝트 ID */
  projectId?: string;
  
  /** 제출 시간 */
  submittedAt: number;
  
  /** 수정 시간 */
  updatedAt: number;
  
  /** 태그 */
  tags: string[];
  
  /** 첨부 파일 */
  attachments?: FeedbackAttachment[];
}

/**
 * 피드백 첨부 파일
 */
export interface FeedbackAttachment {
  /** 파일 ID */
  id: string;
  
  /** 파일명 */
  filename: string;
  
  /** MIME 타입 */
  mimeType: string;
  
  /** 파일 크기 (바이트) */
  size: number;
  
  /** 파일 URL 또는 경로 */
  url: string;
  
  /** 업로드 시간 */
  uploadedAt: number;
}

/**
 * 피드백 컨텍스트
 */
export interface FeedbackContext {
  /** 시스템 정보 */
  system: {
    platform: string;
    version: string;
    nodeVersion: string;
    cpuArch: string;
    memory: {
      total: number;
      free: number;
    };
  };
  
  /** 프로젝트 상태 */
  project?: {
    id: string;
    name: string;
    stage: DevelopmentStage;
    activeTime: number;
    eventCount: number;
  };
  
  /** 성능 메트릭 */
  performance?: {
    cpuUsage: number;
    memoryUsage: number;
    eventQueueSize: number;
    responseTime: number;
  };
  
  /** 오류 정보 (버그 리포트인 경우) */
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  
  /** 화면 정보 (UI 피드백인 경우) */
  ui?: {
    view: string;
    action?: string;
    timestamp: number;
  };
}

/**
 * 사용성 메트릭
 */
export interface UsabilityMetrics {
  /** 태스크 완료 시간 */
  taskCompletionTime?: number;
  
  /** 오류율 */
  errorRate?: number;
  
  /** 클릭 수 */
  clickCount?: number;
  
  /** 네비게이션 경로 */
  navigationPath?: string[];
  
  /** 혼란 지점 */
  confusionPoints?: {
    element: string;
    duration: number;
    attempts: number;
  }[];
}

/**
 * 피드백 분석 결과
 */
export interface FeedbackAnalysis {
  /** 분석 ID */
  id: string;
  
  /** 피드백 ID */
  feedbackId: string;
  
  /** 감정 분석 */
  sentiment: {
    score: number; // -1 to 1
    label: 'positive' | 'neutral' | 'negative';
    confidence: number;
  };
  
  /** 카테고리 추천 */
  suggestedCategories: {
    category: string;
    confidence: number;
  }[];
  
  /** 우선순위 추천 */
  suggestedPriority: {
    priority: FeedbackPriority;
    confidence: number;
  };
  
  /** 유사 피드백 */
  similarFeedback: {
    id: string;
    similarity: number;
    title: string;
  }[];
  
  /** 키워드 추출 */
  keywords: string[];
  
  /** 분석 시간 */
  analyzedAt: number;
}

/**
 * 개선 제안
 */
export interface ImprovementSuggestion {
  /** 제안 ID */
  id: string;
  
  /** 관련 피드백 ID들 */
  feedbackIds: string[];
  
  /** 제안 타입 */
  type: 'feature' | 'fix' | 'enhancement' | 'documentation';
  
  /** 제목 */
  title: string;
  
  /** 설명 */
  description: string;
  
  /** 예상 영향도 */
  impact: {
    users: number;
    severity: 'high' | 'medium' | 'low';
    effort: 'high' | 'medium' | 'low';
  };
  
  /** 구현 상태 */
  status: 'proposed' | 'approved' | 'in_progress' | 'completed' | 'rejected';
  
  /** 생성 시간 */
  createdAt: number;
}

/**
 * 사용자 선호도
 */
export interface UserPreference {
  /** 사용자 ID */
  userId: string;
  
  /** 선호 기능 */
  preferredFeatures: {
    feature: string;
    usage: number;
    satisfaction: number;
  }[];
  
  /** 워크플로우 패턴 */
  workflowPatterns: {
    pattern: string;
    frequency: number;
    duration: number;
  }[];
  
  /** UI 선호도 */
  uiPreferences: {
    theme?: 'light' | 'dark' | 'auto';
    layout?: string;
    shortcuts?: Record<string, string>;
  };
  
  /** 알림 설정 */
  notificationPreferences: {
    channel: string;
    enabled: boolean;
    frequency?: string;
  }[];
  
  /** 학습 시간 */
  learnedAt: number;
  
  /** 신뢰도 */
  confidence: number;
}

/**
 * A/B 테스트 설정
 */
export interface ABTestConfig {
  /** 테스트 ID */
  id: string;
  
  /** 테스트 이름 */
  name: string;
  
  /** 설명 */
  description: string;
  
  /** 테스트 상태 */
  status: 'draft' | 'active' | 'paused' | 'completed';
  
  /** 변형 */
  variants: ABTestVariant[];
  
  /** 대상 사용자 */
  audience: {
    percentage: number;
    criteria?: Record<string, any>;
  };
  
  /** 메트릭 */
  metrics: ABTestMetric[];
  
  /** 시작 시간 */
  startTime?: number;
  
  /** 종료 시간 */
  endTime?: number;
  
  /** 생성 시간 */
  createdAt: number;
}

/**
 * A/B 테스트 변형
 */
export interface ABTestVariant {
  /** 변형 ID */
  id: string;
  
  /** 변형 이름 */
  name: string;
  
  /** 트래픽 비율 */
  trafficPercentage: number;
  
  /** 설정 변경사항 */
  changes: Record<string, any>;
  
  /** 컨트롤 그룹 여부 */
  isControl: boolean;
}

/**
 * A/B 테스트 메트릭
 */
export interface ABTestMetric {
  /** 메트릭 이름 */
  name: string;
  
  /** 메트릭 타입 */
  type: 'conversion' | 'engagement' | 'performance' | 'custom';
  
  /** 목표값 */
  goal?: number;
  
  /** 계산 방법 */
  calculation: string;
}

/**
 * A/B 테스트 결과
 */
export interface ABTestResult {
  /** 테스트 ID */
  testId: string;
  
  /** 변형별 결과 */
  variantResults: {
    variantId: string;
    participants: number;
    metrics: Record<string, number>;
    confidence: number;
  }[];
  
  /** 승자 */
  winner?: {
    variantId: string;
    confidence: number;
    improvement: number;
  };
  
  /** 분석 시간 */
  analyzedAt: number;
}

/**
 * 피드백 이벤트
 */
export interface FeedbackEvent {
  /** 이벤트 타입 */
  type: FeedbackEventType;
  
  /** 피드백 ID */
  feedbackId?: string;
  
  /** 타임스탬프 */
  timestamp: number;
  
  /** 세부 정보 */
  details?: any;
}

/**
 * 피드백 이벤트 타입
 */
export enum FeedbackEventType {
  FEEDBACK_SUBMITTED = 'feedback_submitted',
  FEEDBACK_ANALYZED = 'feedback_analyzed',
  FEEDBACK_STATUS_CHANGED = 'feedback_status_changed',
  IMPROVEMENT_SUGGESTED = 'improvement_suggested',
  PREFERENCE_LEARNED = 'preference_learned',
  AB_TEST_STARTED = 'ab_test_started',
  AB_TEST_COMPLETED = 'ab_test_completed'
}

/**
 * 피드백 필터
 */
export interface FeedbackFilter {
  /** 타입 필터 */
  types?: FeedbackType[];
  
  /** 상태 필터 */
  statuses?: FeedbackStatus[];
  
  /** 우선순위 필터 */
  priorities?: FeedbackPriority[];
  
  /** 소스 필터 */
  sources?: FeedbackSource[];
  
  /** 프로젝트 ID */
  projectId?: string;
  
  /** 날짜 범위 */
  dateRange?: {
    start: number;
    end: number;
  };
  
  /** 태그 필터 */
  tags?: string[];
  
  /** 검색어 */
  query?: string;
}

/**
 * 피드백 통계
 */
export interface FeedbackStats {
  /** 총 피드백 수 */
  total: number;
  
  /** 타입별 분포 */
  byType: Record<FeedbackType, number>;
  
  /** 상태별 분포 */
  byStatus: Record<FeedbackStatus, number>;
  
  /** 우선순위별 분포 */
  byPriority: Record<FeedbackPriority, number>;
  
  /** 평균 해결 시간 (밀리초) */
  averageResolutionTime: number;
  
  /** 감정 분포 */
  sentimentDistribution: {
    positive: number;
    neutral: number;
    negative: number;
  };
  
  /** 추세 */
  trend: {
    daily: number[];
    weekly: number[];
    monthly: number[];
  };
}