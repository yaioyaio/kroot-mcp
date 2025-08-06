/**
 * 플러그인 로더
 * 플러그인의 로드, 언로드, 라이프사이클 관리
 */

import { EventEmitter } from 'events';
import { promises as fs, watch } from 'fs';
import { join, dirname, extname } from 'path';
import { createHash } from 'crypto';
import {
  Plugin,
  PluginManifest,
  PluginDescriptor,
  PluginRuntime,
  PluginStatus,
  PluginLoaderConfig,
  PluginAPIContext,
  PluginHealthStatus,
  PluginSandboxInfo
} from './types.js';
import { PluginAPIProvider } from './api-provider.js';
import { PluginSandbox } from './sandbox.js';

/**
 * 플러그인 로더
 */
export class PluginLoader extends EventEmitter {
  private plugins = new Map<string, PluginDescriptor>();
  private runtimes = new Map<string, PluginRuntime>();
  private watchers = new Map<string, any>();
  private apiProvider: PluginAPIProvider;
  private sandbox?: PluginSandbox;

  constructor(
    private config: PluginLoaderConfig
  ) {
    super();
    this.apiProvider = new PluginAPIProvider();
    
    if (this.config.sandbox.enabled) {
      this.sandbox = new PluginSandbox(this.config.sandbox);
    }
  }

  /**
   * 플러그인 로더 초기화
   */
  async initialize(): Promise<void> {
    try {
      // 플러그인 디렉토리 생성
      for (const pluginDir of this.config.pluginDirs) {
        await this.ensureDirectory(pluginDir);
      }

      // 기존 플러그인 검색
      await this.discoverPlugins();

      // 자동 로드 설정시 모든 플러그인 로드
      if (this.config.autoLoad) {
        await this.loadAllPlugins();
      }

      // 핫 리로드 설정시 파일 감시 시작
      if (this.config.hotReload) {
        this.startWatching();
      }

      console.log(`[PluginLoader] Initialized with ${this.plugins.size} plugins discovered`);
    } catch (error) {
      console.error('[PluginLoader] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * 플러그인 검색
   */
  async discoverPlugins(): Promise<void> {
    const discovered = new Map<string, PluginDescriptor>();

    for (const pluginDir of this.config.pluginDirs) {
      try {
        const entries = await fs.readdir(pluginDir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const pluginPath = join(pluginDir, entry.name);
            const descriptor = await this.loadPluginDescriptor(pluginPath);
            
            if (descriptor) {
              discovered.set(descriptor.id, descriptor);
            }
          }
        }
      } catch (error) {
        console.error(`[PluginLoader] Failed to scan directory ${pluginDir}:`, error);
      }
    }

    this.plugins = discovered;
    this.emit('plugins.discovered', Array.from(discovered.values()));
  }

  /**
   * 플러그인 디스크립터 로드
   */
  private async loadPluginDescriptor(pluginPath: string): Promise<PluginDescriptor | null> {
    try {
      const manifestPath = join(pluginPath, 'package.json');
      const manifestExists = await this.fileExists(manifestPath);
      
      if (!manifestExists) {
        return null;
      }

      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest: PluginManifest = JSON.parse(manifestContent);

      // 필수 필드 검증
      if (!manifest.name || !manifest.version || !manifest.main) {
        console.warn(`[PluginLoader] Invalid manifest in ${pluginPath}`);
        return null;
      }

      // 플러그인 메타데이터 검증
      if (!this.validatePluginMetadata(manifest)) {
        console.warn(`[PluginLoader] Invalid plugin metadata in ${pluginPath}`);
        return null;
      }

      const stats = await fs.stat(pluginPath);
      const checksum = await this.calculateChecksum(pluginPath);

      return {
        id: manifest.id || manifest.name,
        path: pluginPath,
        manifest,
        loaded: false,
        active: false,
        lastModified: stats.mtime,
        checksum
      };
    } catch (error) {
      console.error(`[PluginLoader] Failed to load descriptor for ${pluginPath}:`, error);
      return null;
    }
  }

  /**
   * 플러그인 메타데이터 검증
   */
  private validatePluginMetadata(manifest: PluginManifest): boolean {
    const required = ['id', 'name', 'version', 'description', 'author', 'category', 'permissions'];
    
    for (const field of required) {
      if (!manifest[field as keyof PluginManifest]) {
        console.error(`[PluginLoader] Missing required field: ${field}`);
        return false;
      }
    }

    // 버전 형식 검증 (간단한 SemVer 체크)
    const versionRegex = /^\d+\.\d+\.\d+/;
    if (!versionRegex.test(manifest.version)) {
      console.error(`[PluginLoader] Invalid version format: ${manifest.version}`);
      return false;
    }

    return true;
  }

  /**
   * 플러그인 로드
   */
  async loadPlugin(pluginId: string): Promise<boolean> {
    try {
      const descriptor = this.plugins.get(pluginId);
      if (!descriptor) {
        throw new Error(`Plugin not found: ${pluginId}`);
      }

      if (descriptor.loaded) {
        console.warn(`[PluginLoader] Plugin already loaded: ${pluginId}`);
        return true;
      }

      // 최대 플러그인 수 체크
      if (this.runtimes.size >= this.config.maxPlugins) {
        throw new Error(`Maximum number of plugins (${this.config.maxPlugins}) reached`);
      }

      console.log(`[PluginLoader] Loading plugin: ${pluginId}`);

      // 플러그인 모듈 로드
      const pluginModule = await this.loadPluginModule(descriptor);
      
      // API 컨텍스트 생성
      const context = await this.createAPIContext(descriptor);
      
      // 샌드박스 환경 설정
      let sandboxInfo: PluginSandboxInfo | undefined;
      if (this.sandbox) {
        sandboxInfo = await this.sandbox.createEnvironment(descriptor);
      }

      // 런타임 생성
      const runtime: PluginRuntime = {
        instance: pluginModule,
        status: PluginStatus.LOADED,
        context,
        loadedAt: new Date(),
        metrics: {
          cpuUsage: 0,
          memoryUsage: 0,
          eventsProcessed: 0,
          apiCalls: 0,
          avgResponseTime: 0,
          errorCount: 0,
          lastActivity: new Date()
        },
        sandbox: sandboxInfo
      };

      // 플러그인 초기화
      await this.initializePlugin(runtime);

      this.runtimes.set(pluginId, runtime);
      descriptor.loaded = true;

      this.emit('plugin.loaded', { pluginId, metadata: descriptor.manifest });
      console.log(`[PluginLoader] Plugin loaded successfully: ${pluginId}`);

      return true;
    } catch (error) {
      console.error(`[PluginLoader] Failed to load plugin ${pluginId}:`, error);
      this.emit('plugin.error', { pluginId, error: error as Error });
      return false;
    }
  }

  /**
   * 플러그인 모듈 로드
   */
  private async loadPluginModule(descriptor: PluginDescriptor): Promise<Plugin> {
    const pluginPath = join(descriptor.path, descriptor.manifest.main);
    
    try {
      // ES 모듈 또는 CommonJS 모듈 동적 로드
      let pluginModule;
      
      if (extname(pluginPath) === '.mjs' || (descriptor.manifest as any).type === 'module') {
        pluginModule = await import(`file://${pluginPath}`);
      } else {
        // CommonJS 모듈의 경우
        delete require.cache[require.resolve(pluginPath)];
        pluginModule = require(pluginPath);
      }

      // 기본 export 또는 Plugin export 찾기
      const PluginClass = pluginModule.default || pluginModule.Plugin || pluginModule;
      
      if (typeof PluginClass !== 'function') {
        throw new Error('Plugin must export a class or constructor function');
      }

      const instance = new PluginClass();
      
      // Plugin 인터페이스 구현 검증
      if (!this.validatePluginInterface(instance)) {
        throw new Error('Plugin does not implement required interface');
      }

      return instance;
    } catch (error) {
      throw new Error(`Failed to load plugin module: ${(error as Error).message}`);
    }
  }

  /**
   * 플러그인 인터페이스 검증
   */
  private validatePluginInterface(instance: any): boolean {
    const requiredMethods = ['initialize', 'activate', 'deactivate', 'dispose'];
    
    for (const method of requiredMethods) {
      if (typeof instance[method] !== 'function') {
        console.error(`[PluginLoader] Missing required method: ${method}`);
        return false;
      }
    }

    if (!instance.metadata || typeof instance.metadata !== 'object') {
      console.error('[PluginLoader] Missing plugin metadata');
      return false;
    }

    return true;
  }

  /**
   * API 컨텍스트 생성
   */
  private async createAPIContext(descriptor: PluginDescriptor): Promise<PluginAPIContext> {
    return this.apiProvider.createContext(descriptor);
  }

  /**
   * 플러그인 초기화
   */
  private async initializePlugin(runtime: PluginRuntime): Promise<void> {
    try {
      runtime.status = PluginStatus.LOADING;
      
      const timeout = this.config.timeouts.initialize;
      await this.withTimeout(
        runtime.instance.initialize(runtime.context),
        timeout,
        `Plugin initialization timeout (${timeout}ms)`
      );

      runtime.status = PluginStatus.LOADED;
      console.log(`[PluginLoader] Plugin initialized: ${runtime.instance.metadata.id}`);
    } catch (error) {
      runtime.status = PluginStatus.ERROR;
      runtime.lastError = error as Error;
      throw error;
    }
  }

  /**
   * 플러그인 활성화
   */
  async activatePlugin(pluginId: string): Promise<boolean> {
    try {
      const runtime = this.runtimes.get(pluginId);
      if (!runtime) {
        throw new Error(`Plugin not loaded: ${pluginId}`);
      }

      if (runtime.status === PluginStatus.RUNNING) {
        console.warn(`[PluginLoader] Plugin already active: ${pluginId}`);
        return true;
      }

      console.log(`[PluginLoader] Activating plugin: ${pluginId}`);

      runtime.status = PluginStatus.LOADING;
      
      const timeout = this.config.timeouts.activate;
      await this.withTimeout(
        runtime.instance.activate(),
        timeout,
        `Plugin activation timeout (${timeout}ms)`
      );

      runtime.status = PluginStatus.RUNNING;
      runtime.activatedAt = new Date();

      const descriptor = this.plugins.get(pluginId);
      if (descriptor) {
        descriptor.active = true;
      }

      this.emit('plugin.activated', { pluginId });
      console.log(`[PluginLoader] Plugin activated: ${pluginId}`);

      return true;
    } catch (error) {
      const runtime = this.runtimes.get(pluginId);
      if (runtime) {
        runtime.status = PluginStatus.ERROR;
        runtime.lastError = error as Error;
      }
      
      console.error(`[PluginLoader] Failed to activate plugin ${pluginId}:`, error);
      this.emit('plugin.error', { pluginId, error: error as Error });
      return false;
    }
  }

  /**
   * 플러그인 비활성화
   */
  async deactivatePlugin(pluginId: string): Promise<boolean> {
    try {
      const runtime = this.runtimes.get(pluginId);
      if (!runtime) {
        throw new Error(`Plugin not loaded: ${pluginId}`);
      }

      if (runtime.status !== PluginStatus.RUNNING) {
        console.warn(`[PluginLoader] Plugin not active: ${pluginId}`);
        return true;
      }

      console.log(`[PluginLoader] Deactivating plugin: ${pluginId}`);

      const timeout = this.config.timeouts.deactivate;
      await this.withTimeout(
        runtime.instance.deactivate(),
        timeout,
        `Plugin deactivation timeout (${timeout}ms)`
      );

      runtime.status = PluginStatus.LOADED;
      runtime.activatedAt = undefined;

      const descriptor = this.plugins.get(pluginId);
      if (descriptor) {
        descriptor.active = false;
      }

      this.emit('plugin.deactivated', { pluginId });
      console.log(`[PluginLoader] Plugin deactivated: ${pluginId}`);

      return true;
    } catch (error) {
      const runtime = this.runtimes.get(pluginId);
      if (runtime) {
        runtime.status = PluginStatus.ERROR;
        runtime.lastError = error as Error;
      }
      
      console.error(`[PluginLoader] Failed to deactivate plugin ${pluginId}:`, error);
      this.emit('plugin.error', { pluginId, error: error as Error });
      return false;
    }
  }

  /**
   * 플러그인 언로드
   */
  async unloadPlugin(pluginId: string): Promise<boolean> {
    try {
      const runtime = this.runtimes.get(pluginId);
      const descriptor = this.plugins.get(pluginId);
      
      if (!runtime || !descriptor) {
        console.warn(`[PluginLoader] Plugin not found: ${pluginId}`);
        return true;
      }

      console.log(`[PluginLoader] Unloading plugin: ${pluginId}`);

      // 먼저 비활성화
      if (runtime.status === PluginStatus.RUNNING) {
        await this.deactivatePlugin(pluginId);
      }

      // 플러그인 해제
      try {
        await runtime.instance.dispose();
      } catch (error) {
        console.error(`[PluginLoader] Error during plugin disposal: ${error}`);
      }

      // 샌드박스 정리
      if (runtime.sandbox && this.sandbox) {
        await this.sandbox.destroyEnvironment(pluginId);
      }

      // API 컨텍스트 정리
      await this.apiProvider.destroyContext(pluginId);

      // 런타임 제거
      this.runtimes.delete(pluginId);
      descriptor.loaded = false;
      descriptor.active = false;

      this.emit('plugin.unloaded', { pluginId });
      console.log(`[PluginLoader] Plugin unloaded: ${pluginId}`);

      return true;
    } catch (error) {
      console.error(`[PluginLoader] Failed to unload plugin ${pluginId}:`, error);
      this.emit('plugin.error', { pluginId, error: error as Error });
      return false;
    }
  }

  /**
   * 모든 플러그인 로드
   */
  async loadAllPlugins(): Promise<void> {
    const pluginIds = Array.from(this.plugins.keys());
    
    for (const pluginId of pluginIds) {
      await this.loadPlugin(pluginId);
    }
  }

  /**
   * 모든 플러그인 언로드
   */
  async unloadAllPlugins(): Promise<void> {
    const pluginIds = Array.from(this.runtimes.keys());
    
    for (const pluginId of pluginIds) {
      await this.unloadPlugin(pluginId);
    }
  }

  /**
   * 플러그인 상태 조회
   */
  getPluginStatus(pluginId: string): PluginStatus | null {
    const runtime = this.runtimes.get(pluginId);
    return runtime ? runtime.status : null;
  }

  /**
   * 플러그인 목록 조회
   */
  getPlugins(): PluginDescriptor[] {
    return Array.from(this.plugins.values());
  }

  /**
   * 활성 플러그인 목록 조회
   */
  getActivePlugins(): PluginDescriptor[] {
    return Array.from(this.plugins.values()).filter(p => p.active);
  }

  /**
   * 플러그인 헬스 체크
   */
  async checkPluginHealth(pluginId: string): Promise<PluginHealthStatus | null> {
    const runtime = this.runtimes.get(pluginId);
    if (!runtime || runtime.status !== PluginStatus.RUNNING) {
      return null;
    }

    try {
      if (runtime.instance.healthCheck) {
        const status = await runtime.instance.healthCheck();
        this.emit('plugin.health.checked', { pluginId, status });
        return status;
      }
      
      return {
        status: 'healthy',
        message: 'Plugin is running normally',
        lastCheck: new Date()
      };
    } catch (error) {
      const status: PluginHealthStatus = {
        status: 'error',
        message: (error as Error).message,
        lastCheck: new Date()
      };
      
      this.emit('plugin.health.checked', { pluginId, status });
      return status;
    }
  }

  /**
   * 파일 감시 시작
   */
  private startWatching(): void {
    for (const pluginDir of this.config.pluginDirs) {
      try {
        const watcher = watch(pluginDir, { recursive: true }, (_eventType, filename) => {
          if (filename && filename.endsWith('package.json')) {
            this.handlePluginChange(pluginDir, filename);
          }
        });
        
        this.watchers.set(pluginDir, watcher);
        console.log(`[PluginLoader] Started watching ${pluginDir}`);
      } catch (error) {
        console.error(`[PluginLoader] Failed to watch ${pluginDir}:`, error);
      }
    }
  }

  /**
   * 플러그인 변경 처리
   */
  private async handlePluginChange(pluginDir: string, filename: string): Promise<void> {
    try {
      const pluginPath = join(pluginDir, dirname(filename));
      const descriptor = await this.loadPluginDescriptor(pluginPath);
      
      if (!descriptor) {
        return;
      }

      const existingDescriptor = this.plugins.get(descriptor.id);
      
      if (existingDescriptor && existingDescriptor.checksum !== descriptor.checksum) {
        console.log(`[PluginLoader] Plugin changed, reloading: ${descriptor.id}`);
        
        // 기존 플러그인 언로드 후 새로 로드
        await this.unloadPlugin(descriptor.id);
        this.plugins.set(descriptor.id, descriptor);
        await this.loadPlugin(descriptor.id);
      } else if (!existingDescriptor) {
        console.log(`[PluginLoader] New plugin discovered: ${descriptor.id}`);
        this.plugins.set(descriptor.id, descriptor);
        
        if (this.config.autoLoad) {
          await this.loadPlugin(descriptor.id);
        }
      }
    } catch (error) {
      console.error('[PluginLoader] Error handling plugin change:', error);
    }
  }

  /**
   * 정리
   */
  async dispose(): Promise<void> {
    // 파일 감시 중지
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();

    // 모든 플러그인 언로드
    await this.unloadAllPlugins();

    // API 프로바이더 정리
    await this.apiProvider.dispose();

    // 샌드박스 정리
    if (this.sandbox) {
      await this.sandbox.dispose();
    }

    console.log('[PluginLoader] Disposed');
  }

  /**
   * 유틸리티: 타임아웃이 있는 Promise
   */
  private withTimeout<T>(promise: Promise<T>, timeout: number, errorMessage: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(errorMessage));
      }, timeout);

      promise
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timer));
    });
  }

  /**
   * 유틸리티: 디렉토리 존재 확인 및 생성
   */
  private async ensureDirectory(path: string): Promise<void> {
    try {
      await fs.access(path);
    } catch {
      await fs.mkdir(path, { recursive: true });
    }
  }

  /**
   * 유틸리티: 파일 존재 확인
   */
  private async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 유틸리티: 체크섬 계산
   */
  private async calculateChecksum(pluginPath: string): Promise<string> {
    try {
      const manifestPath = join(pluginPath, 'package.json');
      const content = await fs.readFile(manifestPath, 'utf-8');
      return createHash('sha256').update(content).digest('hex');
    } catch {
      return '';
    }
  }
}