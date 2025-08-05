/**
 * 플러그인 샌드박스
 * 플러그인을 격리된 환경에서 실행
 */

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { join } from 'path';
import {
  PluginDescriptor,
  PluginSandboxInfo,
  PluginPermission
} from './types.js';

/**
 * 샌드박스 설정
 */
export interface SandboxConfig {
  enabled: boolean;
  memoryLimit: number;      // bytes
  cpuLimit: number;         // percentage
  networkAllowed: boolean;
  fileSystemAccess: 'none' | 'readonly' | 'readwrite';
}

/**
 * 샌드박스 환경 정보
 */
export interface SandboxEnvironment {
  id: string;
  pluginId: string;
  worker?: Worker;
  isolationLevel: 'none' | 'basic' | 'strict';
  resourceLimits: {
    memory: number;
    cpu: number;
    files: number;
  };
  allowedAPIs: string[];
  startTime: Date;
  lastActivity: Date;
}

/**
 * 플러그인 샌드박스 매니저
 */
export class PluginSandbox extends EventEmitter {
  private environments = new Map<string, SandboxEnvironment>();
  private resourceMonitor?: NodeJS.Timeout;

  constructor(
    private config: SandboxConfig
  ) {
    super();
    
    if (this.config.enabled) {
      this.startResourceMonitoring();
    }
  }

  /**
   * 샌드박스 환경 생성
   */
  async createEnvironment(descriptor: PluginDescriptor): Promise<PluginSandboxInfo> {
    const pluginId = descriptor.id;
    const permissions = descriptor.manifest.permissions || [];
    
    console.log(`[PluginSandbox] Creating environment for plugin: ${pluginId}`);

    // 격리 레벨 결정
    const isolationLevel = this.determineIsolationLevel(permissions);
    
    // 리소스 제한 설정
    const resourceLimits = {
      memory: this.config.memoryLimit,
      cpu: this.config.cpuLimit,
      files: this.getFileLimit(permissions)
    };

    // 허용된 API 목록 생성
    const allowedAPIs = this.generateAllowedAPIs(permissions);

    const environment: SandboxEnvironment = {
      id: this.generateEnvironmentId(pluginId),
      pluginId,
      isolationLevel,
      resourceLimits,
      allowedAPIs,
      startTime: new Date(),
      lastActivity: new Date()
    };

    // 워커 스레드 생성 (strict 격리 레벨인 경우)
    if (isolationLevel === 'strict') {
      environment.worker = await this.createWorkerThread(descriptor, environment);
    }

    this.environments.set(pluginId, environment);

    const sandboxInfo: PluginSandboxInfo = {
      pid: environment.worker?.threadId,
      isolationLevel,
      resourceLimits,
      allowedAPIs
    };

    this.emit('environment.created', { pluginId, environment: sandboxInfo });
    console.log(`[PluginSandbox] Environment created for ${pluginId} with ${isolationLevel} isolation`);

    return sandboxInfo;
  }

  /**
   * 샌드박스 환경 해제
   */
  async destroyEnvironment(pluginId: string): Promise<void> {
    const environment = this.environments.get(pluginId);
    if (!environment) {
      return;
    }

    console.log(`[PluginSandbox] Destroying environment for plugin: ${pluginId}`);

    // 워커 스레드 종료
    if (environment.worker) {
      await environment.worker.terminate();
    }

    this.environments.delete(pluginId);
    this.emit('environment.destroyed', { pluginId });

    console.log(`[PluginSandbox] Environment destroyed for plugin: ${pluginId}`);
  }

  /**
   * 격리 레벨 결정
   */
  private determineIsolationLevel(permissions: PluginPermission[]): 'none' | 'basic' | 'strict' {
    // 위험한 권한들
    const dangerousPermissions = [
      PluginPermission.WRITE_FILES,
      PluginPermission.NETWORK_ACCESS,
      PluginPermission.SYSTEM_INFO,
      PluginPermission.DATABASE_WRITE,
      PluginPermission.SECURITY
    ];

    // 중간 위험 권한들
    const moderatePermissions = [
      PluginPermission.READ_FILES,
      PluginPermission.DATABASE_READ,
      PluginPermission.USER_DATA
    ];

    const hasDangerousPerms = permissions.some(p => dangerousPermissions.includes(p));
    const hasModeratePerms = permissions.some(p => moderatePermissions.includes(p));

    if (hasDangerousPerms) {
      return 'strict';
    } else if (hasModeratePerms) {
      return 'basic';
    } else {
      return 'none';
    }
  }

  /**
   * 파일 접근 제한 수 계산
   */
  private getFileLimit(permissions: PluginPermission[]): number {
    if (permissions.includes(PluginPermission.WRITE_FILES)) {
      return 1000; // 많은 파일 접근 허용
    } else if (permissions.includes(PluginPermission.READ_FILES)) {
      return 500;  // 제한된 파일 접근
    } else {
      return 0;    // 파일 접근 없음
    }
  }

  /**
   * 허용된 API 목록 생성
   */
  private generateAllowedAPIs(permissions: PluginPermission[]): string[] {
    const allowedAPIs: string[] = [];

    // 기본 API는 항상 허용
    allowedAPIs.push('logger', 'events', 'storage', 'communication');

    // 권한에 따른 API 추가
    if (permissions.includes(PluginPermission.READ_FILES) || 
        permissions.includes(PluginPermission.WRITE_FILES)) {
      allowedAPIs.push('fs');
    }

    if (permissions.includes(PluginPermission.NETWORK_ACCESS)) {
      allowedAPIs.push('http');
    }

    if (permissions.includes(PluginPermission.DATABASE_READ) || 
        permissions.includes(PluginPermission.DATABASE_WRITE)) {
      allowedAPIs.push('database');
    }

    if (permissions.includes(PluginPermission.MCP_TOOLS)) {
      allowedAPIs.push('mcp');
    }

    if (permissions.includes(PluginPermission.NOTIFICATIONS)) {
      allowedAPIs.push('notifications');
    }

    return allowedAPIs;
  }

  /**
   * 워커 스레드 생성
   */
  private async createWorkerThread(
    descriptor: PluginDescriptor, 
    environment: SandboxEnvironment
  ): Promise<Worker> {
    const workerScript = join(__dirname, 'sandbox-worker.js');
    
    const worker = new Worker(workerScript, {
      workerData: {
        pluginPath: descriptor.path,
        pluginManifest: descriptor.manifest,
        environment: {
          id: environment.id,
          resourceLimits: environment.resourceLimits,
          allowedAPIs: environment.allowedAPIs
        }
      },
      resourceLimits: {
        maxOldGenerationSizeMb: Math.floor(environment.resourceLimits.memory / 1024 / 1024),
        maxYoungGenerationSizeMb: Math.floor(environment.resourceLimits.memory / 1024 / 1024 / 2)
      }
    });

    // 워커 이벤트 처리
    worker.on('message', (message) => {
      this.handleWorkerMessage(descriptor.id, message);
    });

    worker.on('error', (error) => {
      console.error(`[PluginSandbox] Worker error for ${descriptor.id}:`, error);
      this.emit('environment.error', { pluginId: descriptor.id, error });
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`[PluginSandbox] Worker exited with code ${code} for ${descriptor.id}`);
      }
      this.emit('environment.exited', { pluginId: descriptor.id, code });
    });

    return worker;
  }

  /**
   * 워커 메시지 처리
   */
  private handleWorkerMessage(pluginId: string, message: any): void {
    const environment = this.environments.get(pluginId);
    if (!environment) {
      return;
    }

    environment.lastActivity = new Date();

    switch (message.type) {
      case 'api_call':
        this.handleAPICall(pluginId, message);
        break;
      
      case 'log':
        console.log(`[Plugin:${pluginId}] ${message.level}: ${message.message}`);
        break;
      
      case 'metric':
        this.emit('environment.metric', { pluginId, metric: message.data });
        break;
      
      default:
        console.warn(`[PluginSandbox] Unknown message type from ${pluginId}:`, message.type);
    }
  }

  /**
   * API 호출 처리
   */
  private handleAPICall(pluginId: string, message: any): void {
    const environment = this.environments.get(pluginId);
    if (!environment) {
      return;
    }

    const { api, method, args, callId } = message;

    // API 접근 권한 확인
    if (!environment.allowedAPIs.includes(api)) {
      this.sendToWorker(pluginId, {
        type: 'api_response',
        callId,
        error: `API '${api}' not allowed for this plugin`
      });
      return;
    }

    // API 호출 처리 (실제 구현 필요)
    this.processAPICall(pluginId, api, method, args)
      .then(result => {
        this.sendToWorker(pluginId, {
          type: 'api_response',
          callId,
          result
        });
      })
      .catch(error => {
        this.sendToWorker(pluginId, {
          type: 'api_response',
          callId,
          error: error.message
        });
      });
  }

  /**
   * API 호출 실제 처리
   */
  private async processAPICall(pluginId: string, api: string, method: string, args: any[]): Promise<any> {
    // 실제 API 호출 처리 로직
    // 각 API별로 적절한 핸들러로 전달
    
    switch (api) {
      case 'logger':
        return this.handleLoggerAPI(pluginId, method, args);
      
      case 'storage':
        return this.handleStorageAPI(pluginId, method, args);
      
      case 'fs':
        return this.handleFileSystemAPI(pluginId, method, args);
      
      case 'http':
        return this.handleHTTPAPI(pluginId, method, args);
      
      default:
        throw new Error(`Unknown API: ${api}`);
    }
  }

  /**
   * 로거 API 처리
   */
  private async handleLoggerAPI(pluginId: string, method: string, args: any[]): Promise<any> {
    const [level, message, meta] = args;
    console.log(`[Plugin:${pluginId}] [${level.toUpperCase()}] ${message}`, meta || '');
    return true;
  }

  /**
   * 스토리지 API 처리
   */
  private async handleStorageAPI(pluginId: string, method: string, args: any[]): Promise<any> {
    // 실제 스토리지 구현과 연결
    throw new Error('Storage API not implemented yet');
  }

  /**
   * 파일 시스템 API 처리
   */
  private async handleFileSystemAPI(pluginId: string, method: string, args: any[]): Promise<any> {
    // 실제 파일 시스템 구현과 연결
    throw new Error('FileSystem API not implemented yet');
  }

  /**
   * HTTP API 처리
   */
  private async handleHTTPAPI(pluginId: string, method: string, args: any[]): Promise<any> {
    // 실제 HTTP 클라이언트 구현과 연결
    throw new Error('HTTP API not implemented yet');
  }

  /**
   * 워커에 메시지 전송
   */
  private sendToWorker(pluginId: string, message: any): void {
    const environment = this.environments.get(pluginId);
    if (environment?.worker) {
      environment.worker.postMessage(message);
    }
  }

  /**
   * 리소스 모니터링 시작
   */
  private startResourceMonitoring(): void {
    this.resourceMonitor = setInterval(() => {
      this.monitorResources();
    }, 5000); // 5초마다 모니터링
  }

  /**
   * 리소스 모니터링
   */
  private monitorResources(): void {
    for (const [pluginId, environment] of this.environments) {
      try {
        this.checkResourceUsage(pluginId, environment);
      } catch (error) {
        console.error(`[PluginSandbox] Error monitoring ${pluginId}:`, error);
      }
    }
  }

  /**
   * 리소스 사용량 체크
   */
  private checkResourceUsage(pluginId: string, environment: SandboxEnvironment): void {
    if (!environment.worker) {
      return;
    }

    // 메모리 사용량 체크 (워커 스레드의 경우 정확한 측정이 어려움)
    const memoryUsage = process.memoryUsage();
    const estimatedPluginMemory = memoryUsage.heapUsed / this.environments.size;

    if (estimatedPluginMemory > environment.resourceLimits.memory) {
      console.warn(`[PluginSandbox] Plugin ${pluginId} exceeding memory limit`);
      this.emit('environment.resource.exceeded', {
        pluginId,
        resource: 'memory',
        usage: estimatedPluginMemory,
        limit: environment.resourceLimits.memory
      });
    }

    // 비활성 플러그인 감지 (30분 이상 비활성)
    const inactiveTime = Date.now() - environment.lastActivity.getTime();
    if (inactiveTime > 30 * 60 * 1000) {
      console.warn(`[PluginSandbox] Plugin ${pluginId} has been inactive for ${Math.floor(inactiveTime / 60000)} minutes`);
      this.emit('environment.inactive', { pluginId, inactiveTime });
    }
  }

  /**
   * 환경 ID 생성
   */
  private generateEnvironmentId(pluginId: string): string {
    const timestamp = Date.now().toString();
    const hash = createHash('sha256').update(pluginId + timestamp).digest('hex');
    return `env_${hash.substring(0, 8)}`;
  }

  /**
   * 환경 정보 조회
   */
  getEnvironment(pluginId: string): SandboxEnvironment | null {
    return this.environments.get(pluginId) || null;
  }

  /**
   * 모든 환경 정보 조회
   */
  getAllEnvironments(): SandboxEnvironment[] {
    return Array.from(this.environments.values());
  }

  /**
   * 정리
   */
  async dispose(): Promise<void> {
    console.log('[PluginSandbox] Disposing...');

    // 리소스 모니터링 중지
    if (this.resourceMonitor) {
      clearInterval(this.resourceMonitor);
    }

    // 모든 환경 해제
    const pluginIds = Array.from(this.environments.keys());
    for (const pluginId of pluginIds) {
      await this.destroyEnvironment(pluginId);
    }

    console.log('[PluginSandbox] Disposed');
  }
}