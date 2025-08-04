/**
 * 보안 시스템 테스트 시뮬레이션
 * 실제 보안 시스템의 모든 기능을 시뮬레이션합니다.
 */

import crypto from 'crypto';
import { EventEmitter } from 'eventemitter3';

// 시뮬레이션된 보안 매니저 클래스
class SecurityManagerSimulation extends EventEmitter {
  constructor() {
    super();
    this.users = new Map([
      ['1', {
        id: '1',
        username: 'admin',
        email: 'admin@devflow.com',
        passwordHash: this.hashPassword('admin123'),
        roles: ['admin'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }],
      ['2', {
        id: '2',
        username: 'user',
        email: 'user@devflow.com',
        passwordHash: this.hashPassword('user123'),
        roles: ['user'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }]
    ]);

    this.roles = new Map([
      ['admin', {
        id: 'admin',
        name: 'admin',
        description: 'System Administrator',
        permissions: [
          { resource: 'system', action: 'admin' },
          { resource: 'mcp', action: 'execute' },
          { resource: 'users', action: 'admin' }
        ]
      }],
      ['user', {
        id: 'user',
        name: 'user',
        description: 'Regular User',
        permissions: [
          { resource: 'mcp', action: 'read' },
          { resource: 'dashboard', action: 'read' }
        ]
      }]
    ]);

    this.sessions = new Map();
    this.apiKeys = new Map();
    this.auditLogs = [];
    this.encryptionKey = crypto.randomBytes(32);
    this.stats = {
      activeSessions: 0,
      activeRefreshTokens: 0,
      activeAPIKeys: 0,
      totalRoles: this.roles.size,
      totalPermissions: Array.from(this.roles.values())
        .reduce((sum, role) => sum + role.permissions.length, 0),
      reservedRoles: 4,
      totalKeys: 1,
      activeKeyVersion: 1,
      keyAgeHours: 0
    };
  }

  // 비밀번호 해시
  hashPassword(password) {
    return crypto.createHash('sha256').update(password + 'devflow-salt').digest('hex');
  }

  // 감사 로그 기록
  logSecurityEvent(event) {
    const auditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      eventType: event.type,
      userId: event.userId,
      username: event.username,
      ipAddress: event.ipAddress || 'localhost',
      userAgent: event.userAgent || 'test-client',
      resource: event.resource,
      action: event.action,
      success: event.success,
      message: event.message,
      metadata: event.metadata,
      severity: this.determineSeverity(event.type),
      category: this.determineCategory(event.type)
    };

    this.auditLogs.push(auditEntry);
    
    // 최근 1000개만 유지
    if (this.auditLogs.length > 1000) {
      this.auditLogs = this.auditLogs.slice(-1000);
    }

    this.emit('auditLogged', auditEntry);
  }

  // 심각도 결정
  determineSeverity(eventType) {
    const critical = ['unauthorized_access', 'account_locked'];
    const high = ['login_failure', 'permission_denied'];
    const medium = ['login_success', 'logout'];
    
    if (critical.includes(eventType)) return 'critical';
    if (high.includes(eventType)) return 'high';
    if (medium.includes(eventType)) return 'medium';
    return 'low';
  }

  // 카테고리 결정
  determineCategory(eventType) {
    const auth = ['login_success', 'login_failure', 'logout'];
    const access = ['permission_denied', 'unauthorized_access'];
    
    if (auth.includes(eventType)) return 'authentication';
    if (access.includes(eventType)) return 'access_control';
    return 'system';
  }

  // 로그인
  async login(username, password, clientInfo, rememberMe = false) {
    const user = Array.from(this.users.values()).find(u => u.username === username);
    
    if (!user) {
      this.logSecurityEvent({
        type: 'login_failure',
        username,
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
        success: false,
        message: 'User not found'
      });
      
      return {
        success: false,
        message: '잘못된 사용자명 또는 비밀번호입니다.'
      };
    }

    const passwordValid = this.hashPassword(password) === user.passwordHash;
    
    if (!passwordValid) {
      this.logSecurityEvent({
        type: 'login_failure',
        userId: user.id,
        username,
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
        success: false,
        message: 'Invalid password'
      });
      
      return {
        success: false,
        message: '잘못된 사용자명 또는 비밀번호입니다.'
      };
    }

    // 세션 생성
    const sessionId = crypto.randomUUID();
    const session = {
      sessionId,
      userId: user.id,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
      createdAt: new Date(),
      isActive: true
    };

    this.sessions.set(sessionId, session);
    this.stats.activeSessions++;

    // JWT 토큰 시뮬레이션
    const token = {
      accessToken: `jwt.${Buffer.from(JSON.stringify({
        userId: user.id,
        username: user.username,
        roles: user.roles,
        sessionId
      })).toString('base64')}.signature`,
      refreshToken: crypto.randomBytes(32).toString('hex'),
      expiresIn: 3600,
      tokenType: 'Bearer'
    };

    this.logSecurityEvent({
      type: 'login_success',
      userId: user.id,
      username,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
      success: true,
      message: 'Login successful'
    });

    return {
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        roles: user.roles.map(roleName => this.roles.get(roleName)),
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
      message: '로그인에 성공했습니다.'
    };
  }

  // 토큰 검증
  async verifyToken(token) {
    try {
      if (!token.startsWith('jwt.')) {
        return null;
      }

      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      const user = this.users.get(payload.userId);
      const session = this.sessions.get(payload.sessionId);

      if (!user || !session || !session.isActive) {
        return null;
      }

      return {
        user: {
          ...user,
          roles: user.roles.map(roleName => this.roles.get(roleName))
        },
        permissions: new Set(
          user.roles.flatMap(roleName => 
            this.roles.get(roleName)?.permissions.map(p => `${p.resource}:${p.action}`) || []
          )
        ),
        sessionId: session.sessionId,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent
      };
    } catch (error) {
      return null;
    }
  }

  // 권한 확인
  async checkPermission(userId, check) {
    const user = this.users.get(userId);
    if (!user) {
      this.logSecurityEvent({
        type: 'permission_denied',
        userId,
        resource: check.resource,
        action: check.action,
        success: false,
        message: 'User not found'
      });
      
      return {
        allowed: false,
        reason: 'User not found',
        matchedPermissions: []
      };
    }

    const userPermissions = user.roles.flatMap(roleName => 
      this.roles.get(roleName)?.permissions || []
    );

    const matchedPermissions = userPermissions.filter(perm => 
      (perm.resource === check.resource || perm.resource === '*') &&
      (perm.action === check.action || perm.action === 'admin')
    );

    const allowed = matchedPermissions.length > 0;

    this.logSecurityEvent({
      type: allowed ? 'permission_granted' : 'permission_denied',
      userId,
      resource: check.resource,
      action: check.action,
      success: allowed,
      message: allowed ? 'Permission granted' : 'Permission denied'
    });

    return {
      allowed,
      reason: allowed ? 'Permission granted' : 'No matching permissions',
      matchedPermissions
    };
  }

  // API 키 생성
  async generateAPIKey(userId, name, permissions, expiresAt) {
    const apiKey = `devflow_${crypto.randomBytes(32).toString('hex')}`;
    
    const keyInfo = {
      id: crypto.randomUUID(),
      name,
      keyHash: crypto.createHash('sha256').update(apiKey).digest('hex'),
      userId,
      permissions,
      expiresAt,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.apiKeys.set(apiKey, keyInfo);
    this.stats.activeAPIKeys++;

    this.logSecurityEvent({
      type: 'api_key_created',
      userId,
      resource: 'api_keys',
      action: 'create',
      success: true,
      message: `API key '${name}' created`
    });

    return apiKey;
  }

  // API 키 검증
  async verifyAPIKey(apiKey) {
    const keyInfo = this.apiKeys.get(apiKey);
    
    if (!keyInfo || !keyInfo.isActive) {
      return null;
    }

    if (keyInfo.expiresAt && keyInfo.expiresAt < new Date()) {
      keyInfo.isActive = false;
      return null;
    }

    keyInfo.lastUsedAt = new Date();
    return keyInfo;
  }

  // 데이터 암호화
  async encrypt(data) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-gcm', this.encryptionKey);
    
    const encrypted = Buffer.concat([
      cipher.update(Buffer.from(data, 'utf8')),
      cipher.final()
    ]);

    const tag = cipher.getAuthTag();

    this.logSecurityEvent({
      type: 'data_encrypted',
      resource: 'encryption',
      action: 'create',
      success: true,
      message: 'Data encrypted successfully'
    });

    return {
      encrypted: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64')
    };
  }

  // 데이터 복호화
  async decrypt(input, keyId) {
    try {
      const decipher = crypto.createDecipher('aes-256-gcm', this.encryptionKey);
      
      if (input.tag) {
        decipher.setAuthTag(Buffer.from(input.tag, 'base64'));
      }

      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(input.encrypted, 'base64')),
        decipher.final()
      ]);

      this.logSecurityEvent({
        type: 'data_decrypted',
        resource: 'encryption',
        action: 'read',
        success: true,
        message: 'Data decrypted successfully'
      });

      return decrypted.toString('utf8');
    } catch (error) {
      this.logSecurityEvent({
        type: 'decryption_failed',
        resource: 'encryption',
        action: 'read',
        success: false,
        message: `Decryption failed: ${error.message}`
      });
      
      throw error;
    }
  }

  // 해시 생성
  async createHash(data, algorithm = 'sha256', salt) {
    const input = salt ? `${data}${salt}` : data;
    const hash = crypto.createHash(algorithm);
    hash.update(input, 'utf8');
    
    this.logSecurityEvent({
      type: 'hash_created',
      resource: 'encryption',
      action: 'create',
      success: true,
      message: `Hash created using ${algorithm}`
    });

    return hash.digest('hex');
  }

  // HMAC 생성
  async createHMAC(data, secret, algorithm = 'sha256') {
    const secretKey = secret || this.encryptionKey.toString('hex');
    const hmac = crypto.createHmac(algorithm, secretKey);
    hmac.update(data, 'utf8');

    this.logSecurityEvent({
      type: 'hmac_created',
      resource: 'encryption',
      action: 'create',
      success: true,
      message: `HMAC created using ${algorithm}`
    });

    return hmac.digest('hex');
  }

  // 보안 토큰 생성
  async generateSecureToken(payload, expiresIn) {
    const tokenData = {
      ...payload,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      expiresAt: expiresIn ? Date.now() + expiresIn : undefined
    };

    const tokenString = JSON.stringify(tokenData);
    const encrypted = await this.encrypt(tokenString);
    
    const token = Buffer.from([
      'secure',
      encrypted.encrypted,
      encrypted.iv,
      encrypted.tag || ''
    ].join('.')).toString('base64url');

    this.logSecurityEvent({
      type: 'secure_token_created',
      resource: 'encryption',
      action: 'create',
      success: true,
      message: 'Secure token generated'
    });

    return token;
  }

  // 보안 토큰 검증
  async verifySecureToken(token) {
    try {
      const tokenString = Buffer.from(token, 'base64url').toString('utf8');
      const parts = tokenString.split('.');
      
      if (parts.length !== 4 || parts[0] !== 'secure') {
        return null;
      }

      const [, encrypted, iv, tag] = parts;
      const decryptedData = await this.decrypt({
        encrypted,
        iv,
        tag: tag || undefined
      });

      const tokenData = JSON.parse(decryptedData);

      if (tokenData.expiresAt && Date.now() > tokenData.expiresAt) {
        return null;
      }

      this.logSecurityEvent({
        type: 'token_verified',
        resource: 'encryption',
        action: 'read',
        success: true,
        message: 'Token verified successfully'
      });

      return tokenData;
    } catch (error) {
      return null;
    }
  }

  // 역할 할당
  async assignRole(userId, roleId, assignedBy, reason) {
    const user = this.users.get(userId);
    const role = this.roles.get(roleId);
    
    if (!user || !role) {
      return false;
    }

    if (!user.roles.includes(roleId)) {
      user.roles.push(roleId);
    }

    this.logSecurityEvent({
      type: 'role_assigned',
      userId: assignedBy,
      resource: 'users',
      action: 'update',
      success: true,
      message: `Role '${roleId}' assigned to user ${userId}`,
      metadata: { targetUserId: userId, roleId, reason }
    });

    return true;
  }

  // 사용자 역할 조회
  async getUserRoles(userId) {
    const user = this.users.get(userId);
    if (!user) {
      return [];
    }

    return user.roles.map(roleName => this.roles.get(roleName)).filter(Boolean);
  }

  // 역할 목록 조회
  getRoles() {
    return Array.from(this.roles.values());
  }

  // 감사 로그 조회
  async queryAuditLogs(query = {}) {
    let filteredLogs = [...this.auditLogs];

    if (query.startDate) {
      filteredLogs = filteredLogs.filter(log => log.timestamp >= query.startDate);
    }

    if (query.endDate) {
      filteredLogs = filteredLogs.filter(log => log.timestamp <= query.endDate);
    }

    if (query.eventTypes) {
      filteredLogs = filteredLogs.filter(log => query.eventTypes.includes(log.eventType));
    }

    if (query.userId) {
      filteredLogs = filteredLogs.filter(log => log.userId === query.userId);
    }

    if (query.ipAddress) {
      filteredLogs = filteredLogs.filter(log => log.ipAddress === query.ipAddress);
    }

    if (query.success !== undefined) {
      filteredLogs = filteredLogs.filter(log => log.success === query.success);
    }

    // 최신순 정렬
    filteredLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (query.limit) {
      filteredLogs = filteredLogs.slice(0, query.limit);
    }

    return filteredLogs;
  }

  // 감사 로그 요약
  async getAuditSummary(startDate, endDate) {
    const logs = await this.queryAuditLogs({ startDate, endDate });
    
    const summary = {
      totalEvents: logs.length,
      successfulEvents: logs.filter(log => log.success).length,
      failedEvents: logs.filter(log => !log.success).length,
      eventTypeDistribution: {},
      severityDistribution: {},
      topUsers: [],
      topIpAddresses: [],
      timeRange: {
        start: logs.length > 0 ? new Date(Math.min(...logs.map(l => l.timestamp.getTime()))) : new Date(),
        end: logs.length > 0 ? new Date(Math.max(...logs.map(l => l.timestamp.getTime()))) : new Date()
      }
    };

    // 이벤트 타입 분포
    logs.forEach(log => {
      summary.eventTypeDistribution[log.eventType] = 
        (summary.eventTypeDistribution[log.eventType] || 0) + 1;
    });

    // 심각도 분포
    logs.forEach(log => {
      summary.severityDistribution[log.severity] = 
        (summary.severityDistribution[log.severity] || 0) + 1;
    });

    return summary;
  }

  // 보안 통계
  getSecurityStats() {
    return {
      auth: {
        activeSessions: this.stats.activeSessions,
        activeRefreshTokens: this.stats.activeRefreshTokens,
        activeAPIKeys: this.stats.activeAPIKeys
      },
      rbac: {
        totalRoles: this.stats.totalRoles,
        totalPermissions: this.stats.totalPermissions,
        reservedRoles: this.stats.reservedRoles,
        customRoles: this.stats.totalRoles - this.stats.reservedRoles
      },
      encryption: {
        totalKeys: this.stats.totalKeys,
        activeKeyVersion: this.stats.activeKeyVersion,
        keyAgeHours: this.stats.keyAgeHours
      },
      audit: {
        totalLogs: this.auditLogs.length,
        bufferSize: 0,
        maxBufferSize: 100
      }
    };
  }

  // 상태 검사
  async healthCheck() {
    return {
      status: 'healthy',
      components: {
        auth: true,
        rbac: true,
        encryption: true,
        audit: true
      },
      details: {
        healthyComponents: 4,
        totalComponents: 4,
        initialized: true,
        uptime: process.uptime()
      }
    };
  }

  // 정리 작업
  async cleanup() {
    this.sessions.clear();
    this.apiKeys.clear();
    this.auditLogs = [];
    this.removeAllListeners();
  }
}

export function createSecurityManager() {
  return new SecurityManagerSimulation();
}