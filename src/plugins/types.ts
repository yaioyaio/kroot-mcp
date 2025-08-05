/**
 * 플러그인 시스템 타입 정의
 */

import { EventEmitter } from 'events';

/**
 * 플러그인 메타데이터
 */
export interface PluginMetadata {
  /** 플러그인 고유 ID */
  id: string;
  /** 플러그인 이름 */
  name: string;
  /** 플러그인 버전 (SemVer 형식) */
  version: string;
  /** 플러그인 설명 */
  description: string;
  /** 플러그인 작성자 */
  author: string;
  /** 플러그인 카테고리 */
  category: PluginCategory;
  /** 플러그인 태그들 */
  tags: string[];
  /** 최소 호환 DevFlow Monitor 버전 */
  minDevFlowVersion: string;
  /** 플러그인 홈페이지 URL */
  homepage?: string;
  /** 플러그인 저장소 URL */
  repository?: string;
  /** 플러그인 라이선스 */
  license?: string;
  /** 플러그인 종속성 */
  dependencies?: Record<string, string>;
  /** 플러그인 권한 요청 */
  permissions: PluginPermission[];
  /** 플러그인 설정 스키마 */
  configSchema?: Record<string, any>;
  /** 플러그인 아이콘 */
  icon?: string;
}

/**
 * 플러그인 카테고리
 */
export enum PluginCategory {
  MONITOR = 'monitor',           // 모니터링 플러그인
  INTEGRATION = 'integration',   // 외부 통합 플러그인
  ANALYZER = 'analyzer',         // 분석 플러그인
  NOTIFICATION = 'notification', // 알림 플러그인
  DASHBOARD = 'dashboard',       // 대시보드 플러그인
  UTILITY = 'utility',           // 유틸리티 플러그인
  WORKFLOW = 'workflow',         // 워크플로우 플러그인
  SECURITY = 'security',         // 보안 플러그인
  PERFORMANCE = 'performance',   // 성능 플러그인
  REPORTING = 'reporting'        // 리포팅 플러그인
}

/**
 * 플러그인 권한
 */
export enum PluginPermission {
  READ_FILES = 'files:read',
  WRITE_FILES = 'files:write',
  READ_EVENTS = 'events:read',
  WRITE_EVENTS = 'events:write',
  READ_CONFIG = 'config:read',
  WRITE_CONFIG = 'config:write',
  NETWORK_ACCESS = 'network:access',
  SYSTEM_INFO = 'system:info',
  USER_DATA = 'user:data',
  DATABASE_READ = 'database:read',
  DATABASE_WRITE = 'database:write',
  MCP_TOOLS = 'mcp:tools',
  NOTIFICATIONS = 'notifications:send',
  PERFORMANCE = 'performance:monitor',
  SECURITY = 'security:access'
}

/**
 * 플러그인 상태
 */
export enum PluginStatus {
  UNLOADED = 'unloaded',
  LOADING = 'loading',
  LOADED = 'loaded',
  RUNNING = 'running',
  PAUSED = 'paused',
  ERROR = 'error',
  DISABLED = 'disabled'
}

/**
 * 플러그인 라이프사이클 단계
 */
export enum PluginLifecycle {
  INITIALIZE = 'initialize',
  ACTIVATE = 'activate',
  DEACTIVATE = 'deactivate',
  DISPOSE = 'dispose'
}

/**
 * 플러그인 API 컨텍스트
 */
export interface PluginAPIContext {
  /** 플러그인 메타데이터 */
  metadata: PluginMetadata;
  /** 플러그인 설정 */
  config: Record<string, any>;
  /** 이벤트 엔진 접근 */
  events: EventEmitter;
  /** 로거 */
  logger: PluginLogger;
  /** 파일 시스템 접근 */
  fs: PluginFileSystem;
  /** HTTP 클라이언트 */
  http: PluginHTTPClient;
  /** 데이터베이스 접근 */
  database: PluginDatabase;
  /** MCP 도구 등록 */
  mcp: PluginMCPTools;
  /** 알림 시스템 */
  notifications: PluginNotifications;
  /** 플러그인 간 통신 */
  communication: PluginCommunication;
  /** 스토리지 접근 */
  storage: PluginStorage;
}

/**
 * 플러그인 인터페이스
 */
export interface Plugin {
  /** 플러그인 메타데이터 */
  readonly metadata: PluginMetadata;
  
  /** 플러그인 초기화 */
  initialize(context: PluginAPIContext): Promise<void>;
  
  /** 플러그인 활성화 */
  activate(): Promise<void>;
  
  /** 플러그인 비활성화 */
  deactivate(): Promise<void>;
  
  /** 플러그인 해제 */
  dispose(): Promise<void>;
  
  /** 플러그인 설정 업데이트 */
  updateConfig?(config: Record<string, any>): Promise<void>;
  
  /** 플러그인 상태 체크 */
  healthCheck?(): Promise<PluginHealthStatus>;
}

/**
 * 플러그인 헬스 상태
 */
export interface PluginHealthStatus {
  /** 상태 */
  status: 'healthy' | 'warning' | 'error';
  /** 상태 메시지 */
  message?: string;
  /** 상세 정보 */
  details?: Record<string, any>;
  /** 마지막 체크 시간 */
  lastCheck: Date;
}

/**
 * 플러그인 로더 설정
 */
export interface PluginLoaderConfig {
  /** 플러그인 디렉토리 경로들 */
  pluginDirs: string[];
  /** 자동 로드 여부 */
  autoLoad: boolean;
  /** 핫 리로드 여부 */
  hotReload: boolean;
  /** 최대 플러그인 수 */
  maxPlugins: number;
  /** 타임아웃 설정 */
  timeouts: {
    initialize: number;
    activate: number;
    deactivate: number;
  };
  /** 샌드박스 설정 */
  sandbox: {
    enabled: boolean;
    memoryLimit: number;
    cpuLimit: number;
    networkAllowed: boolean;
    fileSystemAccess: 'none' | 'readonly' | 'readwrite';
  };
}

/**
 * 플러그인 런타임 정보
 */
export interface PluginRuntime {
  /** 플러그인 인스턴스 */
  instance: Plugin;
  /** 현재 상태 */
  status: PluginStatus;
  /** API 컨텍스트 */
  context: PluginAPIContext;
  /** 로드 시간 */
  loadedAt: Date;
  /** 활성화 시간 */
  activatedAt?: Date;
  /** 마지막 오류 */
  lastError?: Error;
  /** 성능 메트릭 */
  metrics: PluginMetrics;
  /** 샌드박스 정보 */
  sandbox?: PluginSandboxInfo;
}

/**
 * 플러그인 성능 메트릭
 */
export interface PluginMetrics {
  /** CPU 사용률 (%) */
  cpuUsage: number;
  /** 메모리 사용량 (bytes) */
  memoryUsage: number;
  /** 이벤트 처리 수 */
  eventsProcessed: number;
  /** API 호출 수 */
  apiCalls: number;
  /** 평균 응답 시간 (ms) */
  avgResponseTime: number;
  /** 오류 수 */
  errorCount: number;
  /** 마지막 활동 시간 */
  lastActivity: Date;
}

/**
 * 플러그인 샌드박스 정보
 */
export interface PluginSandboxInfo {
  /** 프로세스 ID */
  pid?: number;
  /** 격리 레벨 */
  isolationLevel: 'none' | 'basic' | 'strict';
  /** 리소스 제한 */
  resourceLimits: {
    memory: number;
    cpu: number;
    files: number;
  };
  /** 허용된 API들 */
  allowedAPIs: string[];
}

/**
 * 플러그인 로거 인터페이스
 */
export interface PluginLogger {
  debug(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, error?: Error, meta?: any): void;
}

/**
 * 플러그인 파일 시스템 인터페이스
 */
export interface PluginFileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  readDir(path: string): Promise<string[]>;
  watch(path: string, callback: (event: string, filename: string) => void): void;
}

/**
 * 플러그인 HTTP 클라이언트 인터페이스
 */
export interface PluginHTTPClient {
  get(url: string, options?: any): Promise<any>;
  post(url: string, data: any, options?: any): Promise<any>;
  put(url: string, data: any, options?: any): Promise<any>;
  delete(url: string, options?: any): Promise<any>;
}

/**
 * 플러그인 데이터베이스 인터페이스
 */
export interface PluginDatabase {
  query(sql: string, params?: any[]): Promise<any[]>;
  insert(table: string, data: Record<string, any>): Promise<number>;
  update(table: string, data: Record<string, any>, where: Record<string, any>): Promise<number>;
  delete(table: string, where: Record<string, any>): Promise<number>;
}

/**
 * 플러그인 MCP 도구 인터페이스
 */
export interface PluginMCPTools {
  registerTool(name: string, description: string, handler: Function): void;
  unregisterTool(name: string): void;
  callTool(name: string, args: any): Promise<any>;
}

/**
 * 플러그인 알림 인터페이스
 */
export interface PluginNotifications {
  send(message: string, level: 'info' | 'warning' | 'error', options?: any): Promise<void>;
  createRule(rule: any): Promise<string>;
  removeRule(ruleId: string): Promise<void>;
}

/**
 * 플러그인 간 통신 인터페이스
 */
export interface PluginCommunication {
  sendMessage(targetPlugin: string, message: any): Promise<void>;
  broadcast(event: string, data: any): void;
  subscribe(event: string, handler: Function): void;
  unsubscribe(event: string, handler: Function): void;
}

/**
 * 플러그인 스토리지 인터페이스
 */
export interface PluginStorage {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}

/**
 * 플러그인 이벤트 타입들
 */
export interface PluginEvents {
  'plugin.loaded': { pluginId: string; metadata: PluginMetadata };
  'plugin.activated': { pluginId: string };
  'plugin.deactivated': { pluginId: string };
  'plugin.error': { pluginId: string; error: Error };
  'plugin.unloaded': { pluginId: string };
  'plugin.config.updated': { pluginId: string; config: Record<string, any> };
  'plugin.health.checked': { pluginId: string; status: PluginHealthStatus };
}

/**
 * 플러그인 매니페스트 (package.json의 확장)
 */
export interface PluginManifest extends PluginMetadata {
  /** 메인 진입점 */
  main: string;
  /** TypeScript 진입점 */
  types?: string;
  /** 플러그인 키워드 */
  keywords?: string[];
  /** 엔진 요구사항 */
  engines?: {
    node?: string;
    devflow?: string;
  };
  /** 스크립트들 */
  scripts?: Record<string, string>;
  /** 개발 종속성 */
  devDependencies?: Record<string, string>;
}

/**
 * 플러그인 디스크립터 (런타임에서 사용)
 */
export interface PluginDescriptor {
  /** 플러그인 ID */
  id: string;
  /** 플러그인 경로 */
  path: string;
  /** 매니페스트 정보 */
  manifest: PluginManifest;
  /** 로드 여부 */
  loaded: boolean;
  /** 활성화 여부 */
  active: boolean;
  /** 마지막 수정 시간 */
  lastModified: Date;
  /** 체크섬 */
  checksum: string;
}