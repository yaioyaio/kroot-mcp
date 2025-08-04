/**
 * Security Module Index
 * 보안 시스템 통합 진입점
 */

import { EventEmitter } from 'eventemitter3';
import { AuthManager } from './auth-manager.js';
import { RBACManager } from './rbac-manager.js';
import { EncryptionManager } from './encryption-manager.js';
import { AuditLogger } from './audit-logger.js';
import {
  SecurityConfig,
  SecurityEvent,
  User,
  AuthContext,
  PermissionCheck
} from './types.js';

export interface SecurityManagerConfig {
  security: SecurityConfig;
  audit: {
    logDirectory: string;
    maxFileSize: number;
    maxFiles: number;
    rotationInterval: number;
    compressionEnabled: boolean;
    encryptionEnabled: boolean;
  };
  keyRotation?: {
    enabled: boolean;
    intervalDays: number;
    keepOldKeys: number;
  };
}

export class SecurityManager extends EventEmitter {
  private authManager: AuthManager;
  private rbacManager: RBACManager;
  private encryptionManager: EncryptionManager;
  private auditLogger: AuditLogger;
  private initialized = false;

  constructor(config: SecurityManagerConfig) {
    super();
    
    // 보안 구성 요소 초기화
    this.authManager = new AuthManager(config.security);
    this.rbacManager = new RBACManager();
    this.encryptionManager = new EncryptionManager(config.security, config.keyRotation);
    this.auditLogger = new AuditLogger(config.audit, config.security);

    this.setupEventHandlers();
    this.initialized = true;
  }

  /**
   * 이벤트 핸들러 설정
   */
  private setupEventHandlers(): void {
    // 인증 매니저 이벤트
    this.authManager.on('securityEvent', (event: SecurityEvent) => {
      this.auditLogger.log(event);
      this.emit('securityEvent', event);
    });

    // RBAC 매니저 이벤트
    this.rbacManager.on('securityEvent', (event: SecurityEvent) => {
      this.auditLogger.log(event);
      this.emit('securityEvent', event);
    });

    // 암호화 매니저 이벤트
    this.encryptionManager.on('securityEvent', (event: SecurityEvent) => {
      this.auditLogger.log(event);
      this.emit('securityEvent', event);
    });

    this.encryptionManager.on('keyRotated', (data) => {
      this.emit('keyRotated', data);
    });

    // 감사 로거 이벤트
    this.auditLogger.on('auditLogged', (entry) => {
      this.emit('auditLogged', entry);
    });

    this.auditLogger.on('auditError', (error) => {
      this.emit('auditError', error);
    });

    this.auditLogger.on('logRotated', (data) => {
      this.emit('logRotated', data);
    });
  }

  /**
   * 사용자 로그인
   */
  async login(
    username: string,
    password: string,
    clientInfo: { ipAddress: string; userAgent: string },
    rememberMe?: boolean
  ) {
    this.ensureInitialized();
    return this.authManager.login(
      { username, password, rememberMe },
      clientInfo
    );
  }

  /**
   * JWT 토큰 검증
   */
  async verifyToken(token: string): Promise<AuthContext | null> {
    this.ensureInitialized();
    return this.authManager.verifyToken(token);
  }

  /**
   * 권한 확인
   */
  async checkPermission(
    userId: string,
    check: PermissionCheck,
    context?: Record<string, any>
  ) {
    this.ensureInitialized();
    return this.rbacManager.checkPermission(userId, check, context);
  }

  /**
   * 사용자 로그아웃
   */
  async logout(sessionId: string, userId: string): Promise<boolean> {
    this.ensureInitialized();
    return this.authManager.logout(sessionId, userId);
  }

  /**
   * API 키 생성
   */
  async generateAPIKey(
    userId: string,
    name: string,
    permissions: string[],
    expiresAt?: Date
  ): Promise<string> {
    this.ensureInitialized();
    return this.authManager.generateAPIKey(userId, name, permissions, expiresAt);
  }

  /**
   * API 키 검증
   */
  async verifyAPIKey(apiKey: string) {
    this.ensureInitialized();
    return this.authManager.verifyAPIKey(apiKey);
  }

  /**
   * 데이터 암호화
   */
  async encrypt(data: string | Buffer) {
    this.ensureInitialized();
    return this.encryptionManager.encrypt(data);
  }

  /**
   * 데이터 복호화
   */
  async decrypt(input: { encrypted: string; iv: string; tag?: string }, keyId?: string) {
    this.ensureInitialized();
    return this.encryptionManager.decrypt(input, keyId);
  }

  /**
   * 해시 생성
   */
  async createHash(data: string | Buffer, algorithm?: string, salt?: string) {
    this.ensureInitialized();
    return this.encryptionManager.createHash(data, algorithm, salt);
  }

  /**
   * HMAC 생성
   */
  async createHMAC(data: string | Buffer, secret?: string, algorithm?: string) {
    this.ensureInitialized();
    return this.encryptionManager.createHMAC(data, secret, algorithm);
  }

  /**
   * 보안 토큰 생성
   */
  async generateSecureToken(payload: Record<string, any>, expiresIn?: number) {
    this.ensureInitialized();
    return this.encryptionManager.generateSecureToken(payload, expiresIn);
  }

  /**
   * 보안 토큰 검증
   */
  async verifySecureToken(token: string) {
    this.ensureInitialized();
    return this.encryptionManager.verifySecureToken(token);
  }

  /**
   * 역할 생성
   */
  async createRole(name: string, description: string, permissions: any[], createdBy: string) {
    this.ensureInitialized();
    return this.rbacManager.createRole(name, description, permissions, createdBy);
  }

  /**
   * 사용자에게 역할 할당
   */
  async assignRole(userId: string, roleId: string, assignedBy: string, reason?: string) {
    this.ensureInitialized();
    return this.rbacManager.assignRole({ userId, roleId, assignedBy, reason });
  }

  /**
   * 사용자에게서 역할 제거
   */
  async revokeRole(userId: string, roleId: string, revokedBy: string) {
    this.ensureInitialized();
    return this.rbacManager.revokeRole(userId, roleId, revokedBy);
  }

  /**
   * 사용자 역할 조회
   */
  async getUserRoles(userId: string) {
    this.ensureInitialized();
    return this.rbacManager.getUserRoles(userId);
  }

  /**
   * 역할 목록 조회
   */
  getRoles() {
    this.ensureInitialized();
    return this.rbacManager.getRoles();
  }

  /**
   * 감사 로그 조회
   */
  async queryAuditLogs(query: any) {
    this.ensureInitialized();
    return this.auditLogger.query(query);
  }

  /**
   * 감사 로그 요약
   */
  async getAuditSummary(startDate?: Date, endDate?: Date) {
    this.ensureInitialized();
    return this.auditLogger.getSummary(startDate, endDate);
  }

  /**
   * 보안 통계 조회
   */
  getSecurityStats() {
    this.ensureInitialized();
    
    return {
      auth: this.authManager.getSecurityStats(),
      rbac: this.rbacManager.getRBACStats(),
      encryption: this.encryptionManager.getEncryptionStats(),
      audit: this.auditLogger.getAuditStats()
    };
  }

  /**
   * 활성 세션 조회
   */
  getActiveSessions() {
    this.ensureInitialized();
    return this.authManager.getActiveSessions();
  }

  /**
   * 키 순환 수동 실행
   */
  async rotateKeys() {
    this.ensureInitialized();
    return this.encryptionManager.rotateKeys();
  }

  /**
   * 초기화 상태 확인
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('SecurityManager is not initialized');
    }
  }

  /**
   * 보안 시스템 상태 확인
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'warning' | 'error';
    components: Record<string, boolean>;
    details: Record<string, any>;
  }> {
    try {
      const components = {
        auth: true,
        rbac: true,
        encryption: true,
        audit: true
      };

      // 각 구성 요소 상태 확인
      try {
        this.authManager.getSecurityStats();
      } catch {
        components.auth = false;
      }

      try {
        this.rbacManager.getRBACStats();
      } catch {
        components.rbac = false;
      }

      try {
        this.encryptionManager.getEncryptionStats();
      } catch {
        components.encryption = false;
      }

      try {
        this.auditLogger.getAuditStats();
      } catch {
        components.audit = false;
      }

      const healthyComponents = Object.values(components).filter(Boolean).length;
      const totalComponents = Object.keys(components).length;

      let status: 'healthy' | 'warning' | 'error' = 'healthy';
      if (healthyComponents === 0) {
        status = 'error';
      } else if (healthyComponents < totalComponents) {
        status = 'warning';
      }

      return {
        status,
        components,
        details: {
          healthyComponents,
          totalComponents,
          initialized: this.initialized,
          uptime: process.uptime()
        }
      };

    } catch (error) {
      return {
        status: 'error',
        components: {
          auth: false,
          rbac: false,
          encryption: false,
          audit: false
        },
        details: {
          error: (error as Error).message,
          initialized: this.initialized
        }
      };
    }
  }

  /**
   * 정리 작업
   */
  async cleanup(): Promise<void> {
    if (this.authManager) {
      this.authManager.cleanup();
    }

    if (this.rbacManager) {
      this.rbacManager.cleanup();
    }

    if (this.encryptionManager) {
      this.encryptionManager.cleanup();
    }

    if (this.auditLogger) {
      await this.auditLogger.cleanup();
    }

    this.removeAllListeners();
    this.initialized = false;
  }
}

// 기본 보안 구성
export const DEFAULT_SECURITY_CONFIG: SecurityManagerConfig = {
  security: {
    jwt: {
      secret: process.env.JWT_SECRET || 'devflow-secret-key-change-in-production',
      expiresIn: '1h',
      refreshExpiresIn: '7d',
      issuer: 'devflow-monitor',
      audience: 'devflow-users'
    },
    encryption: {
      algorithm: 'aes-256-gcm',
      keyLength: 32,
      iterations: 100000
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15분
      maxAttempts: 5,
      skipSuccessfulRequests: false
    },
    session: {
      maxSessions: 5,
      timeoutMs: 24 * 60 * 60 * 1000, // 24시간
      cleanupInterval: 60 * 60 * 1000 // 1시간마다 정리
    }
  },
  audit: {
    logDirectory: './logs/audit',
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 30,
    rotationInterval: 24 * 60 * 60 * 1000, // 24시간
    compressionEnabled: true,
    encryptionEnabled: false
  },
  keyRotation: {
    enabled: false,
    intervalDays: 30,
    keepOldKeys: 5
  }
};

// 싱글톤 인스턴스
let securityManagerInstance: SecurityManager | null = null;

/**
 * 보안 매니저 싱글톤 인스턴스 생성/조회
 */
export function getSecurityManager(config?: SecurityManagerConfig): SecurityManager {
  if (!securityManagerInstance) {
    securityManagerInstance = new SecurityManager(config || DEFAULT_SECURITY_CONFIG);
  }
  return securityManagerInstance;
}

/**
 * 보안 매니저 싱글톤 인스턴스 정리
 */
export async function cleanupSecurityManager(): Promise<void> {
  if (securityManagerInstance) {
    await securityManagerInstance.cleanup();
    securityManagerInstance = null;
  }
}

// 타입 및 클래스 내보내기
export {
  AuthManager,
  RBACManager,
  EncryptionManager,
  AuditLogger
};

export type {
  SecurityConfig,
  SecurityEvent,
  User,
  AuthContext,
  PermissionCheck
} from './types.js';