/**
 * Authentication Manager
 * JWT 기반 인증 관리 시스템
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'eventemitter3';
import {
  User,
  AuthToken,
  JWTPayload,
  AuthContext,
  SecurityConfig,
  LoginRequest,
  LoginResponse,
  SecurityEvent,
  SessionInfo,
  APIKey
} from './types.js';

export class AuthManager extends EventEmitter {
  private config: SecurityConfig;
  private activeSessions = new Map<string, SessionInfo>();
  private refreshTokens = new Map<string, { userId: string; expiresAt: Date }>();
  private apiKeys = new Map<string, APIKey>();
  private rateLimitMap = new Map<string, { count: number; resetTime: number }>();

  constructor(config: SecurityConfig) {
    super();
    this.config = config;
    this.startCleanupTimer();
  }

  /**
   * 사용자 로그인
   */
  async login(request: LoginRequest, clientInfo: { ipAddress: string; userAgent: string }): Promise<LoginResponse> {
    const { username, password, rememberMe = false } = request;
    const { ipAddress, userAgent } = clientInfo;

    try {
      // Rate limiting 확인
      if (!this.checkRateLimit(ipAddress)) {
        this.logSecurityEvent({
          type: 'login_attempt',
          username,
          ipAddress,
          userAgent,
          success: false,
          message: 'Rate limit exceeded'
        });

        return {
          success: false,
          message: '너무 많은 로그인 시도입니다. 잠시 후 다시 시도해주세요.'
        };
      }

      // 사용자 인증 (실제 구현에서는 데이터베이스에서 조회)
      const user = await this.authenticateUser(username, password);
      
      if (!user) {
        this.logSecurityEvent({
          type: 'login_failure',
          username,
          ipAddress,
          userAgent,
          success: false,
          message: 'Invalid credentials'
        });

        return {
          success: false,
          message: '잘못된 사용자명 또는 비밀번호입니다.'
        };
      }

      if (!user.isActive) {
        this.logSecurityEvent({
          type: 'login_failure',
          userId: user.id,
          username,
          ipAddress,
          userAgent,
          success: false,
          message: 'Account disabled'
        });

        return {
          success: false,
          message: '비활성화된 계정입니다.'
        };
      }

      // JWT 토큰 생성
      const token = await this.generateAuthToken(user, rememberMe);
      
      // 세션 생성
      const sessionId = uuidv4();
      this.createSession(sessionId, user.id, ipAddress, userAgent);

      // 성공 로그
      this.logSecurityEvent({
        type: 'login_success',
        userId: user.id,
        username,
        ipAddress,
        userAgent,
        success: true,
        message: 'Login successful'
      });

      // 사용자 정보에서 비밀번호 해시 제거
      const { passwordHash, ...userInfo } = user;

      return {
        success: true,
        token,
        user: userInfo,
        message: '로그인에 성공했습니다.'
      };

    } catch (error) {
      this.logSecurityEvent({
        type: 'login_failure',
        username,
        ipAddress,
        userAgent,
        success: false,
        message: `Login error: ${(error as Error).message}`
      });

      return {
        success: false,
        message: '로그인 중 오류가 발생했습니다.'
      };
    }
  }

  /**
   * JWT 토큰 생성
   */
  private async generateAuthToken(user: User, rememberMe: boolean): Promise<AuthToken> {
    const jti = uuidv4();
    const expiresIn = rememberMe ? this.config.jwt.refreshExpiresIn : this.config.jwt.expiresIn;
    
    const payload: JWTPayload = {
      userId: user.id,
      username: user.username,
      roles: user.roles.map(role => role.name),
      permissions: user.roles.flatMap(role => 
        role.permissions.map(permission => `${permission.resource}:${permission.action}`)
      ),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.parseTimeToSeconds(expiresIn),
      jti
    };

    const accessToken = jwt.sign(payload, this.config.jwt.secret, {
      issuer: this.config.jwt.issuer,
      audience: this.config.jwt.audience,
      algorithm: 'HS256'
    });

    // Refresh token 생성
    const refreshToken = this.generateRefreshToken(user.id, rememberMe);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseTimeToSeconds(expiresIn),
      tokenType: 'Bearer'
    };
  }

  /**
   * Refresh token 생성
   */
  private generateRefreshToken(userId: string, rememberMe: boolean): string {
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setTime(expiresAt.getTime() + 
      this.parseTimeToSeconds(rememberMe ? '30d' : this.config.jwt.refreshExpiresIn) * 1000
    );

    this.refreshTokens.set(refreshToken, { userId, expiresAt });
    return refreshToken;
  }

  /**
   * JWT 토큰 검증
   */
  async verifyToken(token: string): Promise<AuthContext | null> {
    try {
      const decoded = jwt.verify(token, this.config.jwt.secret, {
        issuer: this.config.jwt.issuer,
        audience: this.config.jwt.audience
      }) as JWTPayload;

      // 세션 확인
      const session = Array.from(this.activeSessions.values())
        .find(s => s.userId === decoded.userId && s.isActive);

      if (!session) {
        return null;
      }

      // 사용자 정보 조회 (실제 구현에서는 데이터베이스에서 조회)
      const user = await this.getUserById(decoded.userId);
      if (!user || !user.isActive) {
        return null;
      }

      // 권한 집합 생성
      const permissions = new Set(decoded.permissions);

      return {
        user,
        permissions,
        sessionId: session.sessionId,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent
      };

    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        this.logSecurityEvent({
          type: 'unauthorized_access',
          ipAddress: 'unknown',
          userAgent: 'unknown',
          success: false,
          message: `Invalid JWT: ${error.message}`
        });
      }
      return null;
    }
  }

  /**
   * Refresh token으로 새 토큰 발급
   */
  async refreshAccessToken(refreshToken: string): Promise<AuthToken | null> {
    const tokenInfo = this.refreshTokens.get(refreshToken);
    
    if (!tokenInfo || tokenInfo.expiresAt < new Date()) {
      if (tokenInfo) {
        this.refreshTokens.delete(refreshToken);
      }
      return null;
    }

    const user = await this.getUserById(tokenInfo.userId);
    if (!user || !user.isActive) {
      this.refreshTokens.delete(refreshToken);
      return null;
    }

    // 기존 refresh token 무효화 및 새 토큰 생성
    this.refreshTokens.delete(refreshToken);
    const newToken = await this.generateAuthToken(user, false);

    this.logSecurityEvent({
      type: 'token_refresh',
      userId: user.id,
      username: user.username,
      ipAddress: 'unknown',
      userAgent: 'unknown',
      success: true,
      message: 'Token refreshed successfully'
    });

    return newToken;
  }

  /**
   * 로그아웃
   */
  async logout(sessionId: string, userId: string): Promise<boolean> {
    try {
      // 세션 무효화
      const session = this.activeSessions.get(sessionId);
      if (session) {
        session.isActive = false;
        this.activeSessions.delete(sessionId);
      }

      // 해당 사용자의 모든 refresh token 무효화
      for (const [token, info] of this.refreshTokens.entries()) {
        if (info.userId === userId) {
          this.refreshTokens.delete(token);
        }
      }

      const user = await this.getUserById(userId);
      this.logSecurityEvent({
        type: 'logout',
        userId,
        username: user?.username || 'unknown',
        ipAddress: session?.ipAddress || 'unknown',
        userAgent: session?.userAgent || 'unknown',
        success: true,
        message: 'Logout successful'
      });

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * API 키 생성
   */
  async generateAPIKey(userId: string, name: string, permissions: string[], expiresAt?: Date): Promise<string> {
    const apiKey = `devflow_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = await bcrypt.hash(apiKey, 12);

    const apiKeyInfo: APIKey = {
      id: uuidv4(),
      name,
      keyHash,
      userId,
      permissions: permissions.map(perm => {
        const [resource, action] = perm.split(':');
        return {
          id: uuidv4(),
          resource,
          action: action as any,
          createdAt: new Date()
        };
      }),
      expiresAt,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.apiKeys.set(apiKey, apiKeyInfo);
    return apiKey;
  }

  /**
   * API 키 검증
   */
  async verifyAPIKey(apiKey: string): Promise<APIKey | null> {
    const keyInfo = this.apiKeys.get(apiKey);
    
    if (!keyInfo || !keyInfo.isActive) {
      return null;
    }

    if (keyInfo.expiresAt && keyInfo.expiresAt < new Date()) {
      keyInfo.isActive = false;
      return null;
    }

    // 마지막 사용 시간 업데이트
    keyInfo.lastUsedAt = new Date();
    return keyInfo;
  }

  /**
   * 세션 생성
   */
  private createSession(sessionId: string, userId: string, ipAddress: string, userAgent: string): void {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.session.timeoutMs);

    const session: SessionInfo = {
      sessionId,
      userId,
      ipAddress,
      userAgent,
      createdAt: now,
      lastAccessAt: now,
      expiresAt,
      isActive: true
    };

    this.activeSessions.set(sessionId, session);

    // 사용자당 최대 세션 수 제한
    this.enforceMaxSessions(userId);
  }

  /**
   * 사용자당 최대 세션 수 제한
   */
  private enforceMaxSessions(userId: string): void {
    const userSessions = Array.from(this.activeSessions.values())
      .filter(session => session.userId === userId && session.isActive)
      .sort((a, b) => b.lastAccessAt.getTime() - a.lastAccessAt.getTime());

    // 최대 세션 수 초과 시 오래된 세션 제거
    if (userSessions.length > this.config.session.maxSessions) {
      const sessionsToRemove = userSessions.slice(this.config.session.maxSessions);
      for (const session of sessionsToRemove) {
        session.isActive = false;
        this.activeSessions.delete(session.sessionId);
      }
    }
  }

  /**
   * Rate limiting 확인
   */
  private checkRateLimit(identifier: string): boolean {
    const now = Date.now();
    const limit = this.rateLimitMap.get(identifier);

    if (!limit || now > limit.resetTime) {
      this.rateLimitMap.set(identifier, {
        count: 1,
        resetTime: now + this.config.rateLimit.windowMs
      });
      return true;
    }

    if (limit.count >= this.config.rateLimit.maxAttempts) {
      return false;
    }

    limit.count++;
    return true;
  }

  /**
   * 사용자 인증 (데이터베이스 조회 시뮬레이션)
   */
  private async authenticateUser(username: string, password: string): Promise<User | null> {
    // 실제 구현에서는 데이터베이스에서 사용자 조회
    // 여기서는 시뮬레이션을 위한 더미 데이터
    const dummyUsers: User[] = [
      {
        id: '1',
        username: 'admin',
        email: 'admin@devflow.com',
        passwordHash: await bcrypt.hash('admin123', 12),
        roles: [
          {
            id: '1',
            name: 'admin',
            description: 'System Administrator',
            permissions: [
              { id: '1', resource: 'system', action: 'admin', createdAt: new Date() },
              { id: '2', resource: 'mcp', action: 'execute', createdAt: new Date() }
            ],
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: '2',
        username: 'user',
        email: 'user@devflow.com',
        passwordHash: await bcrypt.hash('user123', 12),
        roles: [
          {
            id: '2',
            name: 'user',
            description: 'Regular User',
            permissions: [
              { id: '3', resource: 'mcp', action: 'read', createdAt: new Date() },
              { id: '4', resource: 'dashboard', action: 'read', createdAt: new Date() }
            ],
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    const user = dummyUsers.find(u => u.username === username);
    if (!user) return null;

    const isValid = await bcrypt.compare(password, user.passwordHash);
    return isValid ? user : null;
  }

  /**
   * 사용자 ID로 사용자 조회
   */
  private async getUserById(userId: string): Promise<User | null> {
    // 실제 구현에서는 데이터베이스에서 조회
    // 시뮬레이션을 위한 더미 구현
    if (userId === '1') {
      return {
        id: '1',
        username: 'admin',
        email: 'admin@devflow.com',
        passwordHash: '',
        roles: [
          {
            id: '1',
            name: 'admin',
            description: 'System Administrator',
            permissions: [
              { id: '1', resource: 'system', action: 'admin', createdAt: new Date() }
            ],
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }
    return null;
  }

  /**
   * 보안 이벤트 로깅
   */
  private logSecurityEvent(eventData: Omit<SecurityEvent, 'id' | 'timestamp'>): void {
    const event: SecurityEvent = {
      id: uuidv4(),
      timestamp: new Date(),
      ...eventData
    };

    this.emit('securityEvent', event);
  }

  /**
   * 시간 문자열을 초로 변환
   */
  private parseTimeToSeconds(timeStr: string): number {
    const unit = timeStr.slice(-1);
    const value = parseInt(timeStr.slice(0, -1));

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: return parseInt(timeStr); // 숫자만 있는 경우 초로 간주
    }
  }

  /**
   * 정리 타이머 시작
   */
  private startCleanupTimer(): void {
    setInterval(() => {
      const now = Date.now();

      // 만료된 세션 정리
      for (const [sessionId, session] of this.activeSessions.entries()) {
        if (!session.isActive || session.expiresAt.getTime() < now) {
          this.activeSessions.delete(sessionId);
        }
      }

      // 만료된 refresh token 정리
      for (const [token, info] of this.refreshTokens.entries()) {
        if (info.expiresAt.getTime() < now) {
          this.refreshTokens.delete(token);
        }
      }

      // Rate limit 정리
      for (const [identifier, limit] of this.rateLimitMap.entries()) {
        if (now > limit.resetTime) {
          this.rateLimitMap.delete(identifier);
        }
      }

    }, this.config.session.cleanupInterval);
  }

  /**
   * 활성 세션 조회
   */
  getActiveSessions(): SessionInfo[] {
    return Array.from(this.activeSessions.values())
      .filter(session => session.isActive);
  }

  /**
   * 보안 통계 조회
   */
  getSecurityStats(): Record<string, any> {
    return {
      activeSessions: this.activeSessions.size,
      activeRefreshTokens: this.refreshTokens.size,
      activeAPIKeys: Array.from(this.apiKeys.values()).filter(key => key.isActive).length,
      rateLimitEntries: this.rateLimitMap.size
    };
  }

  /**
   * 정리 작업
   */
  cleanup(): void {
    this.activeSessions.clear();
    this.refreshTokens.clear();
    this.apiKeys.clear();
    this.rateLimitMap.clear();
    this.removeAllListeners();
  }
}