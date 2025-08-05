/**
 * DevFlow Monitor MCP - 다중 프로젝트 지원 타입 정의
 * 
 * 프로젝트 관리, 멀티테넌시, 크로스 프로젝트 분석을 위한 핵심 타입들을 정의합니다.
 */

import { BaseEvent } from '../events/types/base.js';

/**
 * 프로젝트 식별자 및 메타데이터
 */
export interface ProjectMetadata {
  /** 프로젝트 고유 식별자 (UUID) */
  id: string;
  
  /** 프로젝트 이름 */
  name: string;
  
  /** 프로젝트 설명 */
  description?: string;
  
  /** 프로젝트 버전 */
  version: string;
  
  /** 생성 타임스탬프 */
  createdAt: number;
  
  /** 마지막 업데이트 타임스탬프 */
  updatedAt: number;
  
  /** 프로젝트 상태 */
  status: ProjectStatus;
  
  /** 프로젝트 타입 */
  type: ProjectType;
  
  /** 프로젝트 우선순위 */
  priority: ProjectPriority;
  
  /** 프로젝트 태그 */
  tags: string[];
  
  /** 프로젝트 소유자/팀 정보 */
  owner: ProjectOwner;
  
  /** 프로젝트 설정 */
  settings: ProjectSettings;
  
  /** 프로젝트 경로 정보 */
  paths: ProjectPaths;
  
  /** 리포지토리 정보 */
  repository?: RepositoryInfo;
}

/**
 * 프로젝트 상태
 */
export enum ProjectStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ARCHIVED = 'archived',
  MAINTENANCE = 'maintenance',
  DEVELOPMENT = 'development',
  PRODUCTION = 'production',
  DEPRECATED = 'deprecated'
}

/**
 * 프로젝트 타입
 */
export enum ProjectType {
  WEB_APPLICATION = 'web_application',
  MOBILE_APPLICATION = 'mobile_application',
  API_SERVICE = 'api_service',
  LIBRARY = 'library',
  CLI_TOOL = 'cli_tool',
  MICROSERVICE = 'microservice',
  MONOLITH = 'monolith',
  DATA_PIPELINE = 'data_pipeline',
  INFRASTRUCTURE = 'infrastructure',
  DOCUMENTATION = 'documentation',
  OTHER = 'other'
}

/**
 * 프로젝트 우선순위
 */
export enum ProjectPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

/**
 * 프로젝트 소유자 정보
 */
export interface ProjectOwner {
  /** 소유자 ID */
  userId: string;
  
  /** 소유자 이름 */
  name: string;
  
  /** 소유자 이메일 */
  email: string;
  
  /** 팀 ID (선택적) */
  teamId?: string;
  
  /** 팀 이름 (선택적) */
  teamName?: string;
  
  /** 역할 */
  role: ProjectRole;
}

/**
 * 프로젝트 역할
 */
export enum ProjectRole {
  OWNER = 'owner',
  MAINTAINER = 'maintainer',
  DEVELOPER = 'developer',
  CONTRIBUTOR = 'contributor',
  VIEWER = 'viewer'
}

/**
 * 프로젝트 설정
 */
export interface ProjectSettings {
  /** 모니터링 활성화 여부 */
  monitoringEnabled: boolean;
  
  /** 자동 분석 활성화 여부 */
  autoAnalysisEnabled: boolean;
  
  /** 알림 설정 */
  notifications: NotificationSettings;
  
  /** 동기화 설정 */
  sync: SyncSettings;
  
  /** 보고서 설정 */
  reporting: ReportingSettings;
  
  /** 필터 설정 */
  filters: FilterSettings;
  
  /** 커스텀 설정 */
  custom: Record<string, any>;
}

/**
 * 알림 설정
 */
export interface NotificationSettings {
  /** 알림 활성화 여부 */
  enabled: boolean;
  
  /** 알림 채널 */
  channels: NotificationChannel[];
  
  /** 알림 규칙 */
  rules: NotificationRule[];
  
  /** 조용한 시간 설정 */
  quietHours?: QuietHours;
}

export interface NotificationChannel {
  type: 'email' | 'slack' | 'webhook' | 'dashboard';
  enabled: boolean;
  config: Record<string, any>;
}

export interface NotificationRule {
  id: string;
  name: string;
  condition: string;
  action: string;
  enabled: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface QuietHours {
  enabled: boolean;
  startTime: string; // HH:mm format
  endTime: string;   // HH:mm format
  timezone: string;
}

/**
 * 동기화 설정
 */
export interface SyncSettings {
  /** 동기화 활성화 여부 */
  enabled: boolean;
  
  /** 동기화 간격 (초) */
  interval: number;
  
  /** 배치 크기 */
  batchSize: number;
  
  /** 자동 동기화 여부 */
  autoSync: boolean;
  
  /** 충돌 해결 전략 */
  conflictResolution: ConflictResolutionStrategy;
  
  /** 오프라인 큐 설정 */
  offlineQueue: OfflineQueueSettings;
}

export enum ConflictResolutionStrategy {
  LAST_WRITE_WINS = 'last_write_wins',
  PRESERVE_ALL = 'preserve_all',
  MANUAL_RESOLVE = 'manual_resolve'
}

export interface OfflineQueueSettings {
  enabled: boolean;
  maxSize: number;
  retention: number; // days
}

/**
 * 보고서 설정
 */
export interface ReportingSettings {
  /** 자동 보고서 생성 여부 */
  autoGenerate: boolean;
  
  /** 보고서 템플릿 */
  templates: ReportTemplate[];
  
  /** 보고서 스케줄 */
  schedules: ReportSchedule[];
  
  /** 보고서 형식 */
  formats: ReportFormat[];
}

export interface ReportTemplate {
  id: string;
  name: string;
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  sections: ReportSection[];
  enabled: boolean;
}

export interface ReportSection {
  type: 'metrics' | 'analysis' | 'trends' | 'issues';
  config: Record<string, any>;
}

export interface ReportSchedule {
  id: string;
  templateId: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string;
  recipients: string[];
  enabled: boolean;
}

export type ReportFormat = 'pdf' | 'html' | 'markdown' | 'json';

/**
 * 필터 설정
 */
export interface FilterSettings {
  /** 파일 필터 */
  files: FileFilter;
  
  /** 이벤트 필터 */
  events: EventFilter;
  
  /** 분석 필터 */
  analysis: AnalysisFilter;
}

export interface FileFilter {
  /** 포함할 확장자 */
  includeExtensions: string[];
  
  /** 제외할 확장자 */
  excludeExtensions: string[];
  
  /** 포함할 경로 패턴 */
  includePaths: string[];
  
  /** 제외할 경로 패턴 */
  excludePaths: string[];
  
  /** 최대 파일 크기 (bytes) */
  maxFileSize: number;
}

export interface EventFilter {
  /** 포함할 이벤트 타입 */
  includeTypes: string[];
  
  /** 제외할 이벤트 타입 */
  excludeTypes: string[];
  
  /** 최소 심각도 레벨 */
  minSeverity: 'low' | 'medium' | 'high' | 'critical';
}

export interface AnalysisFilter {
  /** 분석할 기간 (일) */
  timeWindow: number;
  
  /** 최소 신뢰도 */
  minConfidence: number;
  
  /** 분석 대상 패턴 */
  patterns: string[];
}

/**
 * 프로젝트 경로 정보
 */
export interface ProjectPaths {
  /** 프로젝트 루트 경로 */
  root: string;
  
  /** 소스 코드 경로 */
  source: string[];
  
  /** 테스트 코드 경로 */
  test: string[];
  
  /** 문서 경로 */
  docs: string[];
  
  /** 빌드 출력 경로 */
  build: string[];
  
  /** 설정 파일 경로 */
  config: string[];
}

/**
 * 리포지토리 정보
 */
export interface RepositoryInfo {
  /** 리포지토리 타입 */
  type: 'git' | 'svn' | 'mercurial';
  
  /** 원격 URL */
  remoteUrl: string;
  
  /** 기본 브랜치 */
  defaultBranch: string;
  
  /** 현재 브랜치 */
  currentBranch: string;
  
  /** 마지막 커밋 해시 */
  lastCommit: string;
  
  /** 마지막 커밋 시간 */
  lastCommitTime: number;
  
  /** 리포지토리 상태 */
  status: RepositoryStatus;
}

export interface RepositoryStatus {
  /** 변경된 파일 수 */
  modifiedFiles: number;
  
  /** 스테이징된 파일 수 */
  stagedFiles: number;
  
  /** 추가된 파일 수 */
  addedFiles: number;
  
  /** 삭제된 파일 수 */
  deletedFiles: number;
  
  /** 추적되지 않는 파일 수 */
  untrackedFiles: number;
  
  /** 앞선 커밋 수 */
  ahead: number;
  
  /** 뒤진 커밋 수 */
  behind: number;
}

/**
 * 프로젝트 메트릭
 */
export interface ProjectMetrics {
  /** 프로젝트 ID */
  projectId: string;
  
  /** 수집 시간 */
  timestamp: number;
  
  /** 코드 메트릭 */
  code: CodeMetrics;
  
  /** 활동 메트릭 */
  activity: ActivityMetrics;
  
  /** 품질 메트릭 */
  quality: QualityMetrics;
  
  /** 성능 메트릭 */
  performance: PerformanceMetrics;
  
  /** 팀 메트릭 */
  team: TeamMetrics;
}

export interface CodeMetrics {
  /** 총 라인 수 */
  totalLines: number;
  
  /** 코드 라인 수 */
  codeLines: number;
  
  /** 주석 라인 수 */
  commentLines: number;
  
  /** 빈 라인 수 */
  blankLines: number;
  
  /** 파일 수 */
  fileCount: number;
  
  /** 함수 수 */
  functionCount: number;
  
  /** 클래스 수 */
  classCount: number;
  
  /** 복잡도 점수 */
  complexity: number;
  
  /** 중복 코드 비율 */
  duplication: number;
}

export interface ActivityMetrics {
  /** 커밋 수 */
  commits: number;
  
  /** 활성 시간 (분) */
  activeTime: number;
  
  /** 파일 변경 수 */
  fileChanges: number;
  
  /** 추가된 라인 수 */
  linesAdded: number;
  
  /** 삭제된 라인 수 */
  linesDeleted: number;
  
  /** 빌드 수 */
  builds: number;
  
  /** 테스트 실행 수 */
  testRuns: number;
}

export interface QualityMetrics {
  /** 테스트 커버리지 */
  testCoverage: number;
  
  /** 테스트 성공률 */
  testSuccessRate: number;
  
  /** 코드 품질 점수 */
  codeQuality: number;
  
  /** 버그 수 */
  bugCount: number;
  
  /** 취약점 수 */
  vulnerabilities: number;
  
  /** 기술 부채 점수 */
  technicalDebt: number;
}

export interface PerformanceMetrics {
  /** 빌드 시간 (초) */
  buildTime: number;
  
  /** 테스트 시간 (초) */
  testTime: number;
  
  /** CI/CD 시간 (초) */
  cicdTime: number;
  
  /** 메모리 사용량 (MB) */
  memoryUsage: number;
  
  /** CPU 사용량 (%) */
  cpuUsage: number;
}

export interface TeamMetrics {
  /** 활성 개발자 수 */
  activeDevelopers: number;
  
  /** 평균 커밋 크기 */
  avgCommitSize: number;
  
  /** 코드 리뷰 비율 */
  codeReviewRate: number;
  
  /** 협업 점수 */
  collaborationScore: number;
}

/**
 * 크로스 프로젝트 분석
 */
export interface CrossProjectAnalysis {
  /** 분석 ID */
  id: string;
  
  /** 분석 시간 */
  timestamp: number;
  
  /** 대상 프로젝트들 */
  projects: string[];
  
  /** 분석 타입 */
  type: AnalysisType;
  
  /** 분석 결과 */
  results: AnalysisResult[];
  
  /** 인사이트 */
  insights: Insight[];
  
  /** 권장사항 */
  recommendations: Recommendation[];
}

export enum AnalysisType {
  DEPENDENCY = 'dependency',
  SIMILARITY = 'similarity',
  PERFORMANCE = 'performance',
  QUALITY = 'quality',
  TREND = 'trend',
  BOTTLENECK = 'bottleneck',
  COLLABORATION = 'collaboration'
}

export interface AnalysisResult {
  /** 결과 타입 */
  type: string;
  
  /** 점수 또는 값 */
  score: number;
  
  /** 신뢰도 */
  confidence: number;
  
  /** 세부 데이터 */
  data: Record<string, any>;
  
  /** 설명 */
  description: string;
}

export interface Insight {
  /** 인사이트 ID */
  id: string;
  
  /** 제목 */
  title: string;
  
  /** 설명 */
  description: string;
  
  /** 중요도 */
  importance: 'low' | 'medium' | 'high' | 'critical';
  
  /** 카테고리 */
  category: string;
  
  /** 관련 데이터 */
  data: Record<string, any>;
}

export interface Recommendation {
  /** 권장사항 ID */
  id: string;
  
  /** 제목 */
  title: string;
  
  /** 설명 */
  description: string;
  
  /** 우선순위 */
  priority: ProjectPriority;
  
  /** 예상 영향도 */
  impact: 'low' | 'medium' | 'high';
  
  /** 구현 난이도 */
  effort: 'low' | 'medium' | 'high';
  
  /** 관련 프로젝트들 */
  affectedProjects: string[];
  
  /** 액션 아이템 */
  actions: ActionItem[];
}

export interface ActionItem {
  /** 액션 ID */
  id: string;
  
  /** 액션 제목 */
  title: string;
  
  /** 액션 설명 */
  description: string;
  
  /** 완료 여부 */
  completed: boolean;
  
  /** 담당자 */
  assignee?: string;
  
  /** 마감일 */
  dueDate?: number;
}

/**
 * 프로젝트 의존성
 */
export interface ProjectDependency {
  /** 의존성 ID */
  id: string;
  
  /** 소스 프로젝트 ID */
  sourceProjectId: string;
  
  /** 타겟 프로젝트 ID */
  targetProjectId: string;
  
  /** 의존성 타입 */
  type: DependencyType;
  
  /** 의존성 강도 */
  strength: number;
  
  /** 설명 */
  description?: string;
  
  /** 생성 시간 */
  createdAt: number;
  
  /** 업데이트 시간 */
  updatedAt: number;
}

export enum DependencyType {
  DIRECT = 'direct',
  INDIRECT = 'indirect',
  SHARED_RESOURCE = 'shared_resource',
  DATA_DEPENDENCY = 'data_dependency',
  API_DEPENDENCY = 'api_dependency',
  TEAM_DEPENDENCY = 'team_dependency'
}

/**
 * 프로젝트 포트폴리오
 */
export interface ProjectPortfolio {
  /** 포트폴리오 ID */
  id: string;
  
  /** 포트폴리오 이름 */
  name: string;
  
  /** 설명 */
  description?: string;
  
  /** 소유자 */
  owner: ProjectOwner;
  
  /** 포함된 프로젝트들 */
  projects: string[];
  
  /** 포트폴리오 메트릭 */
  metrics: PortfolioMetrics;
  
  /** 생성 시간 */
  createdAt: number;
  
  /** 업데이트 시간 */
  updatedAt: number;
}

export interface PortfolioMetrics {
  /** 총 프로젝트 수 */
  totalProjects: number;
  
  /** 활성 프로젝트 수 */
  activeProjects: number;
  
  /** 평균 코드 품질 */
  avgCodeQuality: number;
  
  /** 평균 테스트 커버리지 */
  avgTestCoverage: number;
  
  /** 총 개발자 수 */
  totalDevelopers: number;
  
  /** 총 코드 라인 수 */
  totalCodeLines: number;
  
  /** 월 평균 커밋 수 */
  avgMonthlyCommits: number;
  
  /** 주요 기술 스택 */
  techStack: TechStackItem[];
}

export interface TechStackItem {
  /** 기술 이름 */
  name: string;
  
  /** 사용하는 프로젝트 수 */
  projectCount: number;
  
  /** 전체 대비 비율 */
  percentage: number;
}

/**
 * 동기화 이벤트
 */
export interface SyncEvent extends BaseEvent {
  /** 이벤트 고유 ID (UUID) */
  syncId: string;
  
  /** 로컬 데이터베이스 ID */
  localId: number;
  
  /** 기기 ID */
  deviceId: string;
  
  /** 사용자 ID */
  userId: string;
  
  /** 프로젝트 ID */
  projectId: string;
  
  /** 동기화 상태 */
  syncStatus: SyncStatus;
  
  /** 동기화 시도 횟수 */
  syncAttempts: number;
  
  /** 마지막 동기화 오류 */
  lastSyncError?: string;
  
  /** 동기화 완료 시간 */
  syncedAt?: number;
}

export enum SyncStatus {
  PENDING = 'pending',
  SYNCING = 'syncing',
  SYNCED = 'synced',
  FAILED = 'failed',
  CONFLICT = 'conflict'
}

/**
 * Exports
 */
export * from './types.js';