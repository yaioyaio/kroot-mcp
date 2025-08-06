/**
 * RBAC Manager
 * Role-Based Access Control 권한 관리 시스템
 */

import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import {
  Role,
  Permission,
  PermissionAction,
  SecurityEvent,
  RESERVED_ROLES
} from './types.js';

export interface PermissionCheck {
  resource: string;
  action: PermissionAction;
  conditions?: Record<string, any>;
}

export interface RoleAssignmentRequest {
  userId: string;
  roleId: string;
  assignedBy: string;
  reason?: string;
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  matchedPermissions: Permission[];
}

export class RBACManager extends EventEmitter {
  private roles = new Map<string, Role>();
  private permissions = new Map<string, Permission>();
  private userRoleCache = new Map<string, Set<string>>();

  constructor() {
    super();
    this.initializeReservedRoles();
  }

  /**
   * 예약된 역할 초기화
   */
  private initializeReservedRoles(): void {
    // Admin 역할
    const adminRole: Role = {
      id: uuidv4(),
      name: RESERVED_ROLES.ADMIN,
      description: 'System Administrator with full access',
      permissions: this.createSystemPermissions(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // User 역할
    const userRole: Role = {
      id: uuidv4(),
      name: RESERVED_ROLES.USER,
      description: 'Regular user with limited access',
      permissions: this.createUserPermissions(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // ReadOnly 역할
    const readOnlyRole: Role = {
      id: uuidv4(),
      name: RESERVED_ROLES.READONLY,
      description: 'Read-only access to most resources',
      permissions: this.createReadOnlyPermissions(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Service 역할
    const serviceRole: Role = {
      id: uuidv4(),
      name: RESERVED_ROLES.SERVICE,
      description: 'Service account with API access',
      permissions: this.createServicePermissions(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.roles.set(adminRole.id, adminRole);
    this.roles.set(userRole.id, userRole);
    this.roles.set(readOnlyRole.id, readOnlyRole);
    this.roles.set(serviceRole.id, serviceRole);

    // 권한들도 저장
    [adminRole, userRole, readOnlyRole, serviceRole].forEach(role => {
      role.permissions.forEach(permission => {
        this.permissions.set(permission.id, permission);
      });
    });
  }

  /**
   * 시스템 관리자 권한 생성
   */
  private createSystemPermissions(): Permission[] {
    const permissions = [
      // MCP 도구 권한
      { resource: 'mcp', action: 'execute' as PermissionAction },
      { resource: 'mcp', action: 'admin' as PermissionAction },
      
      // WebSocket 권한
      { resource: 'websocket', action: 'admin' as PermissionAction },
      { resource: 'websocket', action: 'execute' as PermissionAction },
      
      // 대시보드 권한
      { resource: 'dashboard', action: 'admin' as PermissionAction },
      { resource: 'dashboard', action: 'execute' as PermissionAction },
      
      // 메트릭 권한
      { resource: 'metrics', action: 'admin' as PermissionAction },
      { resource: 'metrics', action: 'read' as PermissionAction },
      
      // 알림 권한
      { resource: 'notifications', action: 'admin' as PermissionAction },
      { resource: 'notifications', action: 'execute' as PermissionAction },
      
      // 성능 최적화 권한
      { resource: 'performance', action: 'admin' as PermissionAction },
      { resource: 'performance', action: 'execute' as PermissionAction },
      
      // 시스템 관리 권한
      { resource: 'system', action: 'admin' as PermissionAction },
      { resource: 'system', action: 'read' as PermissionAction },
      { resource: 'system', action: 'update' as PermissionAction },
      { resource: 'users', action: 'admin' as PermissionAction },
      { resource: 'security', action: 'admin' as PermissionAction }
    ];

    return permissions.map(perm => ({
      id: uuidv4(),
      resource: perm.resource,
      action: perm.action,
      createdAt: new Date()
    }));
  }

  /**
   * 일반 사용자 권한 생성
   */
  private createUserPermissions(): Permission[] {
    const permissions = [
      // MCP 도구 기본 권한
      { resource: 'mcp', action: 'read' as PermissionAction },
      { resource: 'mcp', action: 'execute' as PermissionAction },
      
      // 대시보드 보기 권한
      { resource: 'dashboard', action: 'read' as PermissionAction },
      { resource: 'dashboard', action: 'execute' as PermissionAction },
      
      // 메트릭 보기 권한
      { resource: 'metrics', action: 'read' as PermissionAction },
      
      // 알림 기본 권한
      { resource: 'notifications', action: 'read' as PermissionAction },
      { resource: 'notifications', action: 'execute' as PermissionAction },
      
      // 성능 모니터링 권한
      { resource: 'performance', action: 'read' as PermissionAction }
    ];

    return permissions.map(perm => ({
      id: uuidv4(),
      resource: perm.resource,
      action: perm.action,
      createdAt: new Date()
    }));
  }

  /**
   * 읽기 전용 권한 생성
   */
  private createReadOnlyPermissions(): Permission[] {
    const permissions = [
      { resource: 'mcp', action: 'read' as PermissionAction },
      { resource: 'dashboard', action: 'read' as PermissionAction },
      { resource: 'metrics', action: 'read' as PermissionAction },
      { resource: 'notifications', action: 'read' as PermissionAction },
      { resource: 'performance', action: 'read' as PermissionAction },
      { resource: 'system', action: 'read' as PermissionAction }
    ];

    return permissions.map(perm => ({
      id: uuidv4(),
      resource: perm.resource,
      action: perm.action,
      createdAt: new Date()
    }));
  }

  /**
   * 서비스 계정 권한 생성
   */
  private createServicePermissions(): Permission[] {
    const permissions = [
      // MCP API 접근 권한
      { resource: 'mcp', action: 'execute' as PermissionAction },
      { resource: 'mcp', action: 'read' as PermissionAction },
      
      // 메트릭 수집 권한
      { resource: 'metrics', action: 'read' as PermissionAction },
      { resource: 'metrics', action: 'create' as PermissionAction },
      
      // 알림 발송 권한
      { resource: 'notifications', action: 'execute' as PermissionAction },
      
      // 성능 데이터 수집 권한
      { resource: 'performance', action: 'read' as PermissionAction },
      { resource: 'performance', action: 'create' as PermissionAction }
    ];

    return permissions.map(perm => ({
      id: uuidv4(),
      resource: perm.resource,
      action: perm.action,
      createdAt: new Date()
    }));
  }

  /**
   * 권한 확인
   */
  async checkPermission(
    userId: string, 
    check: PermissionCheck,
    context?: Record<string, any>
  ): Promise<PermissionCheckResult> {
    try {
      const userRoles = await this.getUserRoles(userId);
      const matchedPermissions: Permission[] = [];

      for (const role of userRoles) {
        for (const permission of role.permissions) {
          if (this.matchesPermission(permission, check, context)) {
            matchedPermissions.push(permission);
          }
        }
      }

      const allowed = matchedPermissions.length > 0;
      
      this.logSecurityEvent({
        type: allowed ? 'permission_granted' : 'permission_denied',
        userId,
        resource: check.resource,
        action: check.action,
        success: allowed,
        message: allowed 
          ? `Permission granted for ${check.resource}:${check.action}`
          : `Permission denied for ${check.resource}:${check.action}`,
        metadata: { check, matchedPermissions: matchedPermissions.length }
      });

      return {
        allowed,
        reason: allowed 
          ? `Granted by ${matchedPermissions.length} permission(s)`
          : `No matching permissions found`,
        matchedPermissions
      };

    } catch (error) {
      this.logSecurityEvent({
        type: 'permission_denied',
        userId,
        resource: check.resource,
        action: check.action,
        success: false,
        message: `Permission check failed: ${(error as Error).message}`
      });

      return {
        allowed: false,
        reason: 'Permission check failed',
        matchedPermissions: []
      };
    }
  }

  /**
   * 권한 매칭 검사
   */
  private matchesPermission(
    permission: Permission,
    check: PermissionCheck,
    context?: Record<string, any>
  ): boolean {
    // 리소스 매칭 (와일드카드 지원)
    if (permission.resource !== check.resource && permission.resource !== '*') {
      return false;
    }

    // 액션 매칭 (admin은 모든 액션 허용)
    if (permission.action !== check.action && permission.action !== 'admin') {
      return false;
    }

    // 조건부 권한 검사
    if (permission.conditions && check.conditions) {
      return this.evaluateConditions(permission.conditions, check.conditions, context);
    }

    return true;
  }

  /**
   * 조건부 권한 평가
   */
  private evaluateConditions(
    permissionConditions: Record<string, any>,
    checkConditions: Record<string, any>,
    context?: Record<string, any>
  ): boolean {
    for (const [key, value] of Object.entries(permissionConditions)) {
      if (key === 'owner' && context?.userId) {
        // 소유자 권한 확인
        if (checkConditions.ownerId !== context.userId) {
          return false;
        }
      } else if (key === 'department' && context?.department) {
        // 부서 권한 확인
        if (value !== context.department) {
          return false;
        }
      } else if (key === 'timeRange') {
        // 시간 기반 권한 확인
        const now = new Date();
        const startTime = new Date(value.start);
        const endTime = new Date(value.end);
        if (now < startTime || now > endTime) {
          return false;
        }
      } else if (checkConditions[key] !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * 사용자 역할 조회
   */
  async getUserRoles(userId: string): Promise<Role[]> {
    // 캐시에서 먼저 확인
    const cachedRoleIds = this.userRoleCache.get(userId);
    if (cachedRoleIds) {
      return Array.from(cachedRoleIds)
        .map(roleId => this.roles.get(roleId))
        .filter((role): role is Role => role !== undefined);
    }

    // 실제 구현에서는 데이터베이스에서 조회
    // 시뮬레이션을 위한 더미 데이터
    const dummyUserRoles = new Map<string, string[]>([
      ['1', ['admin']], // admin 사용자
      ['2', ['user']]   // 일반 사용자
    ]);

    const roleNames = dummyUserRoles.get(userId) || ['readonly'];
    const roles = Array.from(this.roles.values())
      .filter(role => roleNames.includes(role.name));

    // 캐시 업데이트
    const roleIds = new Set(roles.map(role => role.id));
    this.userRoleCache.set(userId, roleIds);

    return roles;
  }

  /**
   * 역할 생성
   */
  async createRole(
    name: string,
    description: string,
    permissions: Permission[],
    createdBy: string
  ): Promise<Role> {
    const role: Role = {
      id: uuidv4(),
      name,
      description,
      permissions,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.roles.set(role.id, role);

    // 권한들도 저장
    permissions.forEach(permission => {
      this.permissions.set(permission.id, permission);
    });

    this.logSecurityEvent({
      type: 'role_created',
      userId: createdBy,
      resource: 'roles',
      action: 'create',
      success: true,
      message: `Role '${name}' created with ${permissions.length} permissions`,
      metadata: { roleId: role.id, permissionCount: permissions.length }
    });

    return role;
  }

  /**
   * 역할 업데이트
   */
  async updateRole(
    roleId: string,
    updates: Partial<Pick<Role, 'name' | 'description' | 'permissions'>>,
    updatedBy: string
  ): Promise<Role | null> {
    const role = this.roles.get(roleId);
    if (!role) {
      return null;
    }

    const oldRole = { ...role };
    
    if (updates.name !== undefined) {
      role.name = updates.name;
    }
    if (updates.description !== undefined) {
      role.description = updates.description;
    }
    if (updates.permissions !== undefined) {
      role.permissions = updates.permissions;
      // 새 권한들 저장
      updates.permissions.forEach(permission => {
        this.permissions.set(permission.id, permission);
      });
    }
    
    role.updatedAt = new Date();
    this.roles.set(roleId, role);

    // 사용자 역할 캐시 무효화
    this.invalidateUserRoleCache();

    this.logSecurityEvent({
      type: 'role_updated',
      userId: updatedBy,
      resource: 'roles',
      action: 'update',
      success: true,
      message: `Role '${role.name}' updated`,
      metadata: { 
        roleId, 
        changes: Object.keys(updates),
        oldName: oldRole.name,
        newName: role.name
      }
    });

    return role;
  }

  /**
   * 역할 삭제
   */
  async deleteRole(roleId: string, deletedBy: string): Promise<boolean> {
    const role = this.roles.get(roleId);
    if (!role) {
      return false;
    }

    // 예약된 역할은 삭제 불가
    if (Object.values(RESERVED_ROLES).includes(role.name as any)) {
      this.logSecurityEvent({
        type: 'role_delete_failed',
        userId: deletedBy,
        resource: 'roles',
        action: 'delete',
        success: false,
        message: `Cannot delete reserved role '${role.name}'`
      });
      return false;
    }

    this.roles.delete(roleId);
    
    // 관련 권한들도 삭제
    role.permissions.forEach(permission => {
      this.permissions.delete(permission.id);
    });

    // 사용자 역할 캐시 무효화
    this.invalidateUserRoleCache();

    this.logSecurityEvent({
      type: 'role_deleted',
      userId: deletedBy,
      resource: 'roles',
      action: 'delete',
      success: true,
      message: `Role '${role.name}' deleted`,
      metadata: { roleId, roleName: role.name }
    });

    return true;
  }

  /**
   * 사용자에게 역할 할당
   */
  async assignRole(request: RoleAssignmentRequest): Promise<boolean> {
    const { userId, roleId, assignedBy, reason } = request;
    
    const role = this.roles.get(roleId);
    if (!role) {
      return false;
    }

    // 실제 구현에서는 데이터베이스에 저장
    // 여기서는 캐시만 업데이트
    const userRoles = this.userRoleCache.get(userId) || new Set();
    userRoles.add(roleId);
    this.userRoleCache.set(userId, userRoles);

    this.logSecurityEvent({
      type: 'role_assigned',
      userId: assignedBy,
      resource: 'users',
      action: 'update',
      success: true,
      message: `Role '${role.name}' assigned to user ${userId}`,
      metadata: { 
        targetUserId: userId,
        roleId,
        roleName: role.name,
        reason: reason || 'No reason provided'
      }
    });

    return true;
  }

  /**
   * 사용자에게서 역할 제거
   */
  async revokeRole(userId: string, roleId: string, revokedBy: string): Promise<boolean> {
    const role = this.roles.get(roleId);
    if (!role) {
      return false;
    }

    const userRoles = this.userRoleCache.get(userId);
    if (!userRoles || !userRoles.has(roleId)) {
      return false;
    }

    userRoles.delete(roleId);
    this.userRoleCache.set(userId, userRoles);

    this.logSecurityEvent({
      type: 'role_revoked',
      userId: revokedBy,
      resource: 'users',
      action: 'update',
      success: true,
      message: `Role '${role.name}' revoked from user ${userId}`,
      metadata: { 
        targetUserId: userId,
        roleId,
        roleName: role.name
      }
    });

    return true;
  }

  /**
   * 역할 목록 조회
   */
  getRoles(): Role[] {
    return Array.from(this.roles.values());
  }

  /**
   * 역할 조회
   */
  getRole(roleId: string): Role | null {
    return this.roles.get(roleId) || null;
  }

  /**
   * 역할 이름으로 조회
   */
  getRoleByName(name: string): Role | null {
    return Array.from(this.roles.values()).find(role => role.name === name) || null;
  }

  /**
   * 권한 목록 조회
   */
  getPermissions(): Permission[] {
    return Array.from(this.permissions.values());
  }

  /**
   * 사용자 역할 캐시 무효화
   */
  private invalidateUserRoleCache(): void {
    this.userRoleCache.clear();
  }

  /**
   * 보안 이벤트 로깅
   */
  private logSecurityEvent(eventData: Omit<SecurityEvent, 'id' | 'timestamp' | 'ipAddress' | 'userAgent'>): void {
    const event: SecurityEvent = {
      id: uuidv4(),
      timestamp: new Date(),
      ipAddress: 'unknown',
      userAgent: 'rbac-manager',
      ...eventData
    };

    this.emit('securityEvent', event);
  }

  /**
   * RBAC 통계 조회
   */
  getRBACStats(): Record<string, any> {
    const roles = Array.from(this.roles.values());
    const permissions = Array.from(this.permissions.values());
    
    return {
      totalRoles: roles.length,
      totalPermissions: permissions.length,
      reservedRoles: Object.values(RESERVED_ROLES).length,
      customRoles: roles.filter(role => 
        !Object.values(RESERVED_ROLES).includes(role.name as any)
      ).length,
      cachedUsers: this.userRoleCache.size,
      roleDistribution: roles.map(role => ({
        name: role.name,
        permissionCount: role.permissions.length
      }))
    };
  }

  /**
   * 정리 작업
   */
  cleanup(): void {
    this.roles.clear();
    this.permissions.clear();
    this.userRoleCache.clear();
    this.removeAllListeners();
  }
}