/**
 * DevFlow Monitor MCP - 고급 보고서 시스템 타입 정의
 * 
 * 프로젝트 보고서 생성, 예약, 배포를 위한 핵심 타입들을 정의합니다.
 */

import { EventCategory, EventSeverity } from '../events/types/base.js';
import { DevelopmentStage } from '../analyzers/types/stage.js';
import { BottleneckType } from '../analyzers/types/metrics.js';
import { DevelopmentMethodology } from '../analyzers/types/methodology.js';

/**
 * 보고서 타입
 */
export enum ReportType {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  CUSTOM = 'custom',
  INCIDENT = 'incident',
  PERFORMANCE = 'performance',
  METHODOLOGY = 'methodology',
  AI_USAGE = 'ai_usage',
  CROSS_PROJECT = 'cross_project'
}

/**
 * 보고서 형식
 */
export enum ReportFormat {
  PDF = 'pdf',
  HTML = 'html',
  MARKDOWN = 'markdown',
  JSON = 'json',
  CSV = 'csv',
  EXCEL = 'excel'
}

/**
 * 보고서 배포 채널
 */
export enum DeliveryChannel {
  EMAIL = 'email',
  SLACK = 'slack',
  WEBHOOK = 'webhook',
  FILE_SYSTEM = 'file_system',
  S3 = 's3',
  FTP = 'ftp'
}

/**
 * 보고서 상태
 */
export enum ReportStatus {
  PENDING = 'pending',
  GENERATING = 'generating',
  COMPLETED = 'completed',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * 보고서 메타데이터
 */
export interface ReportMetadata {
  /** 보고서 ID */
  id: string;
  
  /** 보고서 타입 */
  type: ReportType;
  
  /** 보고서 제목 */
  title: string;
  
  /** 보고서 설명 */
  description?: string;
  
  /** 생성 시간 */
  createdAt: number;
  
  /** 수정 시간 */
  updatedAt: number;
  
  /** 보고서 상태 */
  status: ReportStatus;
  
  /** 보고 기간 시작 */
  periodStart: number;
  
  /** 보고 기간 종료 */
  periodEnd: number;
  
  /** 프로젝트 ID (다중 프로젝트 지원) */
  projectIds: string[];
  
  /** 생성자 정보 */
  createdBy: string;
  
  /** 태그 */
  tags: string[];
}

/**
 * 보고서 설정
 */
export interface ReportConfig {
  /** 보고서 타입 */
  type: ReportType;
  
  /** 포함할 섹션 */
  sections: ReportSection[];
  
  /** 출력 형식 */
  formats: ReportFormat[];
  
  /** 배포 채널 */
  deliveryChannels: DeliveryConfig[];
  
  /** 필터 설정 */
  filters?: ReportFilters;
  
  /** 커스텀 파라미터 */
  parameters?: Record<string, any>;
  
  /** 템플릿 ID (선택적) */
  templateId?: string;
  
  /** 스타일 설정 */
  styling?: ReportStyling;
}

/**
 * 보고서 섹션
 */
export interface ReportSection {
  /** 섹션 ID */
  id: string;
  
  /** 섹션 이름 */
  name: string;
  
  /** 섹션 타입 */
  type: ReportSectionType;
  
  /** 포함 여부 */
  enabled: boolean;
  
  /** 섹션 설정 */
  config?: Record<string, any>;
  
  /** 표시 순서 */
  order: number;
}

/**
 * 보고서 섹션 타입
 */
export enum ReportSectionType {
  EXECUTIVE_SUMMARY = 'executive_summary',
  METRICS_OVERVIEW = 'metrics_overview',
  ACTIVITY_TIMELINE = 'activity_timeline',
  DEVELOPMENT_STAGES = 'development_stages',
  METHODOLOGY_COMPLIANCE = 'methodology_compliance',
  AI_COLLABORATION = 'ai_collaboration',
  BOTTLENECK_ANALYSIS = 'bottleneck_analysis',
  PERFORMANCE_TRENDS = 'performance_trends',
  QUALITY_METRICS = 'quality_metrics',
  TEAM_PRODUCTIVITY = 'team_productivity',
  INCIDENT_REPORT = 'incident_report',
  RECOMMENDATIONS = 'recommendations',
  CUSTOM = 'custom'
}

/**
 * 보고서 필터
 */
export interface ReportFilters {
  /** 이벤트 카테고리 필터 */
  eventCategories?: EventCategory[];
  
  /** 이벤트 심각도 필터 */
  eventSeverities?: EventSeverity[];
  
  /** 개발 단계 필터 */
  developmentStages?: DevelopmentStage[];
  
  /** 방법론 필터 */
  methodologies?: DevelopmentMethodology[];
  
  /** 병목 타입 필터 */
  bottleneckTypes?: BottleneckType[];
  
  /** 파일 패턴 필터 */
  filePatterns?: string[];
  
  /** 사용자 필터 */
  users?: string[];
  
  /** 커스텀 필터 */
  custom?: Record<string, any>;
}

/**
 * 배포 설정
 */
export interface DeliveryConfig {
  /** 배포 채널 */
  channel: DeliveryChannel;
  
  /** 채널별 설정 */
  config: EmailConfig | SlackConfig | WebhookConfig | FileSystemConfig | S3Config | FTPConfig;
  
  /** 활성화 여부 */
  enabled: boolean;
}

/**
 * 이메일 설정
 */
export interface EmailConfig {
  /** 수신자 목록 */
  recipients: string[];
  
  /** 참조 목록 */
  cc?: string[];
  
  /** 숨은 참조 목록 */
  bcc?: string[];
  
  /** 회신 주소 */
  replyTo?: string;
  
  /** 제목 템플릿 */
  subjectTemplate?: string;
  
  /** 본문 템플릿 */
  bodyTemplate?: string;
  
  /** 첨부파일로 포함할 형식 */
  attachmentFormats?: ReportFormat[];
}

/**
 * Slack 설정
 */
export interface SlackConfig {
  /** 웹훅 URL */
  webhookUrl: string;
  
  /** 채널 */
  channel?: string;
  
  /** 사용자명 */
  username?: string;
  
  /** 아이콘 */
  iconEmoji?: string;
  
  /** 메시지 템플릿 */
  messageTemplate?: string;
  
  /** 파일 업로드 여부 */
  uploadFiles?: boolean;
}

/**
 * 웹훅 설정
 */
export interface WebhookConfig {
  /** 웹훅 URL */
  url: string;
  
  /** HTTP 메서드 */
  method?: 'POST' | 'PUT';
  
  /** 헤더 */
  headers?: Record<string, string>;
  
  /** 인증 정보 */
  auth?: {
    type: 'basic' | 'bearer' | 'api_key';
    credentials: Record<string, string>;
  };
  
  /** 페이로드 템플릿 */
  payloadTemplate?: string;
}

/**
 * 파일시스템 설정
 */
export interface FileSystemConfig {
  /** 저장 경로 */
  path: string;
  
  /** 파일명 템플릿 */
  filenameTemplate?: string;
  
  /** 덮어쓰기 여부 */
  overwrite?: boolean;
  
  /** 압축 여부 */
  compress?: boolean;
}

/**
 * S3 설정
 */
export interface S3Config {
  /** 버킷 이름 */
  bucket: string;
  
  /** 키 프리픽스 */
  keyPrefix?: string;
  
  /** 리전 */
  region?: string;
  
  /** ACL */
  acl?: string;
  
  /** 메타데이터 */
  metadata?: Record<string, string>;
}

/**
 * FTP 설정
 */
export interface FTPConfig {
  /** 호스트 */
  host: string;
  
  /** 포트 */
  port?: number;
  
  /** 사용자명 */
  username: string;
  
  /** 비밀번호 */
  password: string;
  
  /** 원격 경로 */
  remotePath: string;
  
  /** 보안 연결 */
  secure?: boolean;
}

/**
 * 보고서 스타일링
 */
export interface ReportStyling {
  /** 테마 */
  theme?: 'light' | 'dark' | 'custom';
  
  /** 로고 URL */
  logoUrl?: string;
  
  /** 색상 스키마 */
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    text?: string;
  };
  
  /** 폰트 설정 */
  fonts?: {
    heading?: string;
    body?: string;
    monospace?: string;
  };
  
  /** 커스텀 CSS */
  customCss?: string;
}

/**
 * 보고서 스케줄
 */
export interface ReportSchedule {
  /** 스케줄 ID */
  id: string;
  
  /** 스케줄 이름 */
  name: string;
  
  /** 활성화 여부 */
  enabled: boolean;
  
  /** 보고서 설정 */
  reportConfig: ReportConfig;
  
  /** 스케줄 패턴 */
  schedule: SchedulePattern;
  
  /** 다음 실행 시간 */
  nextRunAt?: number;
  
  /** 마지막 실행 시간 */
  lastRunAt?: number;
  
  /** 타임존 */
  timezone?: string;
  
  /** 생성자 */
  createdBy: string;
  
  /** 생성 시간 */
  createdAt: number;
  
  /** 수정 시간 */
  updatedAt: number;
}

/**
 * 스케줄 패턴
 */
export interface SchedulePattern {
  /** 패턴 타입 */
  type: 'cron' | 'interval' | 'daily' | 'weekly' | 'monthly';
  
  /** Cron 표현식 (type이 cron일 때) */
  cron?: string;
  
  /** 간격 (밀리초, type이 interval일 때) */
  interval?: number;
  
  /** 시간 (HH:mm 형식, daily/weekly/monthly일 때) */
  time?: string;
  
  /** 요일 (0-6, weekly일 때) */
  dayOfWeek?: number;
  
  /** 날짜 (1-31, monthly일 때) */
  dayOfMonth?: number;
}

/**
 * 보고서 템플릿
 */
export interface ReportTemplate {
  /** 템플릿 ID */
  id: string;
  
  /** 템플릿 이름 */
  name: string;
  
  /** 템플릿 설명 */
  description?: string;
  
  /** 템플릿 타입 */
  type: ReportType;
  
  /** 기본 설정 */
  defaultConfig: ReportConfig;
  
  /** 카테고리 */
  category?: string;
  
  /** 태그 */
  tags: string[];
  
  /** 공개 여부 */
  public: boolean;
  
  /** 생성자 */
  createdBy: string;
  
  /** 생성 시간 */
  createdAt: number;
  
  /** 수정 시간 */
  updatedAt: number;
}

/**
 * 보고서 결과
 */
export interface ReportResult {
  /** 보고서 메타데이터 */
  metadata: ReportMetadata;
  
  /** 생성된 파일 */
  files: GeneratedFile[];
  
  /** 배포 결과 */
  deliveryResults?: DeliveryResult[];
  
  /** 생성 시간 (밀리초) */
  generationTime: number;
  
  /** 오류 (있는 경우) */
  error?: string;
  
  /** 경고 메시지 */
  warnings?: string[];
}

/**
 * 생성된 파일
 */
export interface GeneratedFile {
  /** 파일 형식 */
  format: ReportFormat;
  
  /** 파일 경로 */
  path: string;
  
  /** 파일 크기 (바이트) */
  size: number;
  
  /** MIME 타입 */
  mimeType: string;
  
  /** 체크섬 */
  checksum?: string;
}

/**
 * 배포 결과
 */
export interface DeliveryResult {
  /** 배포 채널 */
  channel: DeliveryChannel;
  
  /** 성공 여부 */
  success: boolean;
  
  /** 배포 시간 */
  deliveredAt: number;
  
  /** 응답 */
  response?: any;
  
  /** 오류 (있는 경우) */
  error?: string;
}

/**
 * 보고서 데이터
 */
export interface ReportData {
  /** 메트릭 데이터 */
  metrics?: any;
  
  /** 이벤트 데이터 */
  events?: any[];
  
  /** 분석 데이터 */
  analysis?: any;
  
  /** 차트 데이터 */
  charts?: ChartData[];
  
  /** 테이블 데이터 */
  tables?: TableData[];
  
  /** 커스텀 데이터 */
  custom?: Record<string, any>;
}

/**
 * 차트 데이터
 */
export interface ChartData {
  /** 차트 ID */
  id: string;
  
  /** 차트 타입 */
  type: 'line' | 'bar' | 'pie' | 'donut' | 'area' | 'scatter' | 'heatmap';
  
  /** 차트 제목 */
  title: string;
  
  /** 데이터 시리즈 */
  series: any[];
  
  /** 옵션 */
  options?: any;
}

/**
 * 테이블 데이터
 */
export interface TableData {
  /** 테이블 ID */
  id: string;
  
  /** 테이블 제목 */
  title: string;
  
  /** 컬럼 정의 */
  columns: TableColumn[];
  
  /** 행 데이터 */
  rows: any[];
}

/**
 * 테이블 컬럼
 */
export interface TableColumn {
  /** 컬럼 키 */
  key: string;
  
  /** 컬럼 제목 */
  title: string;
  
  /** 데이터 타입 */
  type?: 'string' | 'number' | 'date' | 'boolean';
  
  /** 정렬 가능 여부 */
  sortable?: boolean;
  
  /** 너비 */
  width?: number;
  
  /** 정렬 */
  align?: 'left' | 'center' | 'right';
}

/**
 * 보고서 이벤트
 */
export interface ReportEvent {
  /** 이벤트 타입 */
  type: ReportEventType;
  
  /** 보고서 ID */
  reportId: string;
  
  /** 타임스탬프 */
  timestamp: number;
  
  /** 세부 정보 */
  details?: any;
}

/**
 * 보고서 이벤트 타입
 */
export enum ReportEventType {
  GENERATION_STARTED = 'generation_started',
  GENERATION_COMPLETED = 'generation_completed',
  GENERATION_FAILED = 'generation_failed',
  DELIVERY_STARTED = 'delivery_started',
  DELIVERY_COMPLETED = 'delivery_completed',
  DELIVERY_FAILED = 'delivery_failed',
  SCHEDULE_CREATED = 'schedule_created',
  SCHEDULE_UPDATED = 'schedule_updated',
  SCHEDULE_DELETED = 'schedule_deleted',
  SCHEDULE_EXECUTED = 'schedule_executed'
}