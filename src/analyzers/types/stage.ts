/**
 * DevFlow Monitor MCP - Development Stage Types
 * 
 * 개발 프로세스의 13단계를 정의하고 추적하기 위한 타입 정의
 */

/**
 * 개발 프로세스의 13단계
 */
export enum DevelopmentStage {
  // 기획 단계
  PRD = 'prd',                    // Product Requirements Document
  PLANNING = 'planning',           // 기획서 작성
  ERD = 'erd',                    // Entity Relationship Diagram
  WIREFRAME = 'wireframe',         // Wireframe 설계
  SCREEN_DESIGN = 'screen_design', // 화면단위 기획서
  DESIGN = 'design',              // 디자인 작업

  // 구현 단계
  FRONTEND = 'frontend',          // 프론트엔드 개발
  BACKEND = 'backend',            // 백엔드 개발
  AI_COLLABORATION = 'ai_collab', // AI 협업
  CODING = 'coding',              // 실제 코딩

  // 배포 단계
  GIT_MANAGEMENT = 'git',         // Git 관리
  DEPLOYMENT = 'deployment',      // 배포
  OPERATION = 'operation'         // 운영
}

/**
 * AI 협업 + 코딩 세부 단계
 */
export enum CodingSubStage {
  USE_CASE = 'use_case',                    // UseCase 도출
  EVENT_STORMING = 'event_storming',        // Event Storming
  DOMAIN_MODELING = 'domain_modeling',       // Domain 모델링
  USE_CASE_DETAIL = 'use_case_detail',      // UseCase 상세 설계
  AI_PROMPT_DESIGN = 'ai_prompt_design',    // AI 프롬프트 설계
  INITIAL_IMPLEMENTATION = 'initial_impl',   // 1차 뼈대 구현(AI)
  BUSINESS_LOGIC = 'business_logic',         // 비즈니스 로직 구현
  REFACTORING = 'refactoring',              // 리팩토링
  UNIT_TEST = 'unit_test',                  // 단위 테스트
  INTEGRATION_TEST = 'integration_test',     // 통합 테스트
  E2E_TEST = 'e2e_test'                     // E2E 테스트
}

/**
 * 단계 전환 이벤트
 */
export interface StageTransition {
  fromStage: DevelopmentStage | null;
  toStage: DevelopmentStage;
  timestamp: number;
  confidence: number;  // 0-1 신뢰도
  reason: string;
  metadata?: Record<string, any>;
}

/**
 * 단계별 활동 지표
 */
export interface StageActivity {
  stage: DevelopmentStage;
  subStage?: CodingSubStage;
  startTime: number;
  endTime?: number;
  duration?: number;
  activities: ActivityIndicator[];
  confidence: number;
}

/**
 * 활동 지표
 */
export interface ActivityIndicator {
  type: string;
  value: any;
  timestamp: number;
  source: string;
}

/**
 * 단계 감지 규칙
 */
export interface StageDetectionRule {
  stage: DevelopmentStage;
  patterns: StagePattern[];
  requiredConfidence: number;
}

/**
 * 단계 패턴
 */
export interface StagePattern {
  type: 'file' | 'git' | 'api' | 'event' | 'content';
  pattern: string | RegExp;
  weight: number;
  description?: string;
}

/**
 * 단계 분석 결과
 */
export interface StageAnalysisResult {
  currentStage: DevelopmentStage;
  confidence: number;
  activeSubStages?: CodingSubStage[];
  recentTransitions: StageTransition[];
  stageProgress: Map<DevelopmentStage, number>;
  suggestions: string[];
}

/**
 * 단계별 진행률
 */
export interface StageProgress {
  stage: DevelopmentStage;
  progress: number; // 0-100
  completedActivities: string[];
  remainingActivities: string[];
  estimatedTimeRemaining?: number;
}