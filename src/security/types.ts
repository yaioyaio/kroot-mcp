/**
 * Security Types
 * 보안 시스템 타입 정의
 */

export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  roles: Role[];
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Permission {
  id: string;
  resource: string;
  action: PermissionAction;
  conditions?: Record<string, any>;
  createdAt: Date;
}

export type PermissionAction = 
  | 'create'
  | 'read' 
  | 'update'
  | 'delete'
  | 'execute'
  | 'admin';

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface JWTPayload {
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  iat: number;
  exp: number;
  jti: string;
}

export interface AuthContext {
  user: User;
  permissions: Set<string>;
  sessionId: string;
  ipAddress: string;
  userAgent: string;
}

export interface SecurityConfig {
  jwt: {
    secret: string;
    expiresIn: string;
    refreshExpiresIn: string;
    issuer: string;
    audience: string;
  };
  encryption: {
    algorithm: string;
    keyLength: number;
    iterations: number;
  };
  rateLimit: {
    windowMs: number;
    maxAttempts: number;
    skipSuccessfulRequests: boolean;
  };
  session: {
    maxSessions: number;
    timeoutMs: number;
    cleanupInterval: number;
  };
}

export interface LoginRequest {
  username: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResponse {
  success: boolean;
  token?: AuthToken;
  user?: Omit<User, 'passwordHash'>;
  message: string;
}

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  userId?: string;
  username?: string;
  ipAddress: string;
  userAgent: string;
  resource?: string;
  action?: string;
  success: boolean;
  message: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export type SecurityEventType = 
  | 'login_attempt'
  | 'login_success'  
  | 'login_failure'
  | 'logout'
  | 'token_refresh'
  | 'token_expired'
  | 'token_verified'
  | 'token_verification_failed'
  | 'permission_denied'
  | 'permission_granted'
  | 'unauthorized_access'
  | 'suspicious_activity'
  | 'account_locked'
  | 'password_changed'
  | 'role_changed'
  | 'role_created'
  | 'role_updated'
  | 'role_deleted'
  | 'role_delete_failed'
  | 'role_assigned'
  | 'role_revoked'
  | 'key_rotated'
  | 'key_rotation_failed'
  | 'key_rotation_scheduled'
  | 'old_keys_cleaned'
  | 'automatic_key_rotation_failed';

export interface RateLimitConfig {
  windowMs: number;
  maxAttempts: number;
  message: string;
  standardHeaders: boolean;
  legacyHeaders: boolean;
}

export interface EncryptionResult {
  encrypted: string;
  iv: string;
  tag?: string;
}

export interface DecryptionInput {
  encrypted: string;
  iv: string;
  tag?: string;
}

export interface APIKey {
  id: string;
  name: string;
  keyHash: string;
  userId: string;
  permissions: Permission[];
  expiresAt?: Date;
  lastUsedAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionInfo {
  sessionId: string;
  userId: string;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  lastAccessAt: Date;
  expiresAt: Date;
  isActive: boolean;
}

// 예약된 역할 및 권한
export const RESERVED_ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  READONLY: 'readonly',
  SERVICE: 'service'
} as const;

export const RESERVED_PERMISSIONS = {
  // MCP 도구 권한
  MCP_GET_PROJECT_STATUS: 'mcp:getProjectStatus',
  MCP_GET_METRICS: 'mcp:getMetrics',
  MCP_GET_ACTIVITY_LOG: 'mcp:getActivityLog',
  MCP_ANALYZE_BOTTLENECKS: 'mcp:analyzeBottlenecks',
  MCP_CHECK_METHODOLOGY: 'mcp:checkMethodology',
  MCP_GENERATE_REPORT: 'mcp:generateReport',
  MCP_ANALYZE_STAGE: 'mcp:analyzeStage',
  MCP_ANALYZE_AI_COLLABORATION: 'mcp:analyzeAICollaboration',
  
  // WebSocket 권한
  WEBSOCKET_START_SERVER: 'websocket:startServer',
  WEBSOCKET_STOP_SERVER: 'websocket:stopServer',
  WEBSOCKET_GET_STATS: 'websocket:getStats',
  WEBSOCKET_BROADCAST: 'websocket:broadcast',
  
  // 대시보드 권한
  DASHBOARD_START: 'dashboard:start',
  DASHBOARD_VIEW: 'dashboard:view',
  DASHBOARD_CONTROL: 'dashboard:control',
  
  // 메트릭 권한
  METRICS_VIEW_ADVANCED: 'metrics:viewAdvanced',
  METRICS_VIEW_BOTTLENECKS: 'metrics:viewBottlenecks',
  METRICS_ANALYZE_PRODUCTIVITY: 'metrics:analyzeProductivity',
  
  // 알림 권한
  NOTIFICATIONS_CONFIGURE: 'notifications:configure',
  NOTIFICATIONS_SEND: 'notifications:send',
  NOTIFICATIONS_VIEW_STATS: 'notifications:viewStats',
  NOTIFICATIONS_MANAGE_RULES: 'notifications:manageRules',
  
  // 성능 최적화 권한
  PERFORMANCE_VIEW_REPORT: 'performance:viewReport',
  PERFORMANCE_OPTIMIZE: 'performance:optimize',
  PERFORMANCE_VIEW_METRICS: 'performance:viewMetrics',
  PERFORMANCE_PROFILE: 'performance:profile',
  PERFORMANCE_MANAGE_CACHES: 'performance:manageCaches',
  
  // 시스템 관리 권한
  SYSTEM_ADMIN: 'system:admin',
  SYSTEM_CONFIG: 'system:config',
  SYSTEM_LOGS: 'system:logs',
  SYSTEM_USERS: 'system:users',
  SYSTEM_SECURITY: 'system:security'
} as const;

export type ReservedRole = typeof RESERVED_ROLES[keyof typeof RESERVED_ROLES];
export type ReservedPermission = typeof RESERVED_PERMISSIONS[keyof typeof RESERVED_PERMISSIONS];

// 권한 검사 인터페이스
export interface PermissionCheck {
  resource: string;
  action: PermissionAction;
  conditions?: Record<string, any>;
}

// 역할 할당 요청 인터페이스
export interface RoleAssignmentRequest {
  userId: string;
  roleId: string;
  assignedBy: string;
  reason?: string;
}