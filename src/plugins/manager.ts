/**
 * 플러그인 매니저
 * 플러그인 시스템의 중앙 관리자
 */

import { EventEmitter } from 'events';
import { PluginLoader } from './loader.js';
import { PluginRegistry } from './registry.js';
import {
  PluginDescriptor,
  PluginStatus,
  PluginLoaderConfig,
  PluginHealthStatus,
  PluginMetrics,
} from './types.js';

/**
 * 플러그인 매니저 설정
 */
export interface PluginManagerConfig {
  /** 플러그인 디렉토리들 */
  pluginDirs: string[];
  /** 자동 로드 여부 */
  autoLoad: boolean;
  /** 핫 리로드 여부 */
  hotReload: boolean;
  /** 최대 플러그인 수 */
  maxPlugins: number;
  /** 샌드박스 활성화 */
  sandboxEnabled: boolean;
  /** 헬스 체크 간격 (ms) */
  healthCheckInterval: number;
  /** 메트릭 수집 간격 (ms) */
  metricsInterval: number;
  /** 플러그인 레지스트리 URL (옵션) */
  registryUrl?: string;
}

/**
 * 플러그인 매니저
 */
export class PluginManager extends EventEmitter {
  private loader: PluginLoader;
  private registry?: PluginRegistry;
  private healthCheckTimer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;
  private initialized = false;

  constructor(
    private config: PluginManagerConfig
  ) {
    super();

    // 플러그인 로더 설정
    const loaderConfig: PluginLoaderConfig = {
      pluginDirs: config.pluginDirs,
      autoLoad: config.autoLoad,
      hotReload: config.hotReload,
      maxPlugins: config.maxPlugins,
      timeouts: {
        initialize: 30000,
        activate: 10000,
        deactivate: 10000
      },
      sandbox: {
        enabled: config.sandboxEnabled,
        memoryLimit: 512 * 1024 * 1024, // 512MB
        cpuLimit: 80, // 80%
        networkAllowed: true,
        fileSystemAccess: 'readwrite'
      }
    };

    this.loader = new PluginLoader(loaderConfig);

    // 플러그인 레지스트리 (옵션)
    if (config.registryUrl) {
      this.registry = new PluginRegistry(config.registryUrl);
    }

    this.setupEventHandlers();
  }

  /**
   * 플러그인 매니저 초기화
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn('[PluginManager] Already initialized');
      return;
    }

    try {
      console.log('[PluginManager] Initializing...');

      // 플러그인 로더 초기화
      await this.loader.initialize();

      // 레지스트리 초기화
      if (this.registry) {
        await this.registry.initialize();
      }

      // 헬스 체크 시작
      this.startHealthCheck();

      // 메트릭 수집 시작
      this.startMetricsCollection();

      this.initialized = true;
      this.emit('manager.initialized');

      console.log('[PluginManager] Initialized successfully');
    } catch (error) {
      console.error('[PluginManager] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * 이벤트 핸들러 설정
   */
  private setupEventHandlers(): void {
    // 플러그인 로더 이벤트 전달
    this.loader.on('plugin.loaded', (event) => {
      this.emit('plugin.loaded', event);
    });

    this.loader.on('plugin.activated', (event) => {
      this.emit('plugin.activated', event);
    });

    this.loader.on('plugin.deactivated', (event) => {
      this.emit('plugin.deactivated', event);
    });

    this.loader.on('plugin.unloaded', (event) => {
      this.emit('plugin.unloaded', event);
    });

    this.loader.on('plugin.error', (event) => {
      this.emit('plugin.error', event);
      console.error(`[PluginManager] Plugin error: ${event.pluginId}`, event.error);
    });

    this.loader.on('plugins.discovered', (plugins) => {
      this.emit('plugins.discovered', plugins);
      console.log(`[PluginManager] Discovered ${plugins.length} plugins`);
    });
  }

  /**
   * 플러그인 설치 (레지스트리에서)
   */
  async installPlugin(pluginName: string, version?: string): Promise<boolean> {
    if (!this.registry) {
      throw new Error('Plugin registry not configured');
    }

    try {
      console.log(`[PluginManager] Installing plugin: ${pluginName}${version ? `@${version}` : ''}`);

      const success = await this.registry.installPlugin(pluginName, version);
      
      if (success) {
        // 새로 설치된 플러그인 검색
        await this.loader.discoverPlugins();
        this.emit('plugin.installed', { pluginName, version });
        console.log(`[PluginManager] Plugin installed: ${pluginName}`);
      }

      return success;
    } catch (error) {
      console.error(`[PluginManager] Failed to install plugin ${pluginName}:`, error);
      this.emit('plugin.install.failed', { pluginName, error });
      return false;
    }
  }

  /**
   * 플러그인 제거
   */
  async uninstallPlugin(pluginId: string): Promise<boolean> {
    try {
      console.log(`[PluginManager] Uninstalling plugin: ${pluginId}`);

      // 먼저 언로드
      await this.unloadPlugin(pluginId);

      // 레지스트리에서 제거
      if (this.registry) {
        await this.registry.uninstallPlugin(pluginId);
      }

      this.emit('plugin.uninstalled', { pluginId });
      console.log(`[PluginManager] Plugin uninstalled: ${pluginId}`);

      return true;
    } catch (error) {
      console.error(`[PluginManager] Failed to uninstall plugin ${pluginId}:`, error);
      this.emit('plugin.uninstall.failed', { pluginId, error });
      return false;
    }
  }

  /**
   * 플러그인 로드
   */
  async loadPlugin(pluginId: string): Promise<boolean> {
    return this.loader.loadPlugin(pluginId);
  }

  /**
   * 플러그인 언로드
   */
  async unloadPlugin(pluginId: string): Promise<boolean> {
    return this.loader.unloadPlugin(pluginId);
  }

  /**
   * 플러그인 활성화
   */
  async activatePlugin(pluginId: string): Promise<boolean> {
    return this.loader.activatePlugin(pluginId);
  }

  /**
   * 플러그인 비활성화
   */
  async deactivatePlugin(pluginId: string): Promise<boolean> {
    return this.loader.deactivatePlugin(pluginId);
  }

  /**
   * 플러그인 재시작
   */
  async restartPlugin(pluginId: string): Promise<boolean> {
    try {
      console.log(`[PluginManager] Restarting plugin: ${pluginId}`);

      await this.deactivatePlugin(pluginId);
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기
      const success = await this.activatePlugin(pluginId);

      if (success) {
        this.emit('plugin.restarted', { pluginId });
        console.log(`[PluginManager] Plugin restarted: ${pluginId}`);
      }

      return success;
    } catch (error) {
      console.error(`[PluginManager] Failed to restart plugin ${pluginId}:`, error);
      this.emit('plugin.restart.failed', { pluginId, error });
      return false;
    }
  }

  /**
   * 플러그인 목록 조회
   */
  getPlugins(): PluginDescriptor[] {
    return this.loader.getPlugins();
  }

  /**
   * 활성 플러그인 목록 조회
   */
  getActivePlugins(): PluginDescriptor[] {
    return this.loader.getActivePlugins();
  }

  /**
   * 플러그인 상태 조회
   */
  getPluginStatus(pluginId: string): PluginStatus | null {
    return this.loader.getPluginStatus(pluginId);
  }

  /**
   * 플러그인 정보 조회 (상세)
   */
  getPluginInfo(pluginId: string): any {
    const plugins = this.getPlugins();
    const plugin = plugins.find(p => p.id === pluginId);
    
    if (!plugin) {
      return null;
    }

    return {
      ...plugin,
      status: this.getPluginStatus(pluginId),
      metrics: this.getPluginMetrics(pluginId),
      health: null // 실시간으로 체크하지 않음
    };
  }

  /**
   * 플러그인 검색
   */
  searchPlugins(query: string): PluginDescriptor[] {
    const plugins = this.getPlugins();
    const searchTerms = query.toLowerCase().split(' ');

    return plugins.filter(plugin => {
      const searchableText = [
        plugin.manifest.name,
        plugin.manifest.description,
        plugin.manifest.author,
        plugin.manifest.category,
        ...(plugin.manifest.tags || []),
        ...(plugin.manifest.keywords || [])
      ].join(' ').toLowerCase();

      return searchTerms.every(term => searchableText.includes(term));
    });
  }

  /**
   * 카테고리별 플러그인 조회
   */
  getPluginsByCategory(category: string): PluginDescriptor[] {
    const plugins = this.getPlugins();
    return plugins.filter(plugin => plugin.manifest.category === category);
  }

  /**
   * 플러그인 헬스 체크
   */
  async checkPluginHealth(pluginId: string): Promise<PluginHealthStatus | null> {
    return this.loader.checkPluginHealth(pluginId);
  }

  /**
   * 모든 플러그인 헬스 체크
   */
  async checkAllPluginsHealth(): Promise<Record<string, PluginHealthStatus | null>> {
    const activePlugins = this.getActivePlugins();
    const healthResults: Record<string, PluginHealthStatus | null> = {};

    for (const plugin of activePlugins) {
      try {
        healthResults[plugin.id] = await this.checkPluginHealth(plugin.id);
      } catch (error) {
        healthResults[plugin.id] = {
          status: 'error',
          message: (error as Error).message,
          lastCheck: new Date()
        };
      }
    }

    return healthResults;
  }

  /**
   * 플러그인 메트릭 조회
   */
  getPluginMetrics(_pluginId: string): PluginMetrics | null {
    // 실제 메트릭 수집 로직 구현 필요
    return null;
  }

  /**
   * 시스템 통계 조회
   */
  getSystemStats(): any {
    const plugins = this.getPlugins();
    const activePlugins = this.getActivePlugins();

    const statusCounts = plugins.reduce((acc, plugin) => {
      const status = this.getPluginStatus(plugin.id) || 'unloaded';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const categoryCounts = plugins.reduce((acc, plugin) => {
      const category = plugin.manifest.category;
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalPlugins: plugins.length,
      activePlugins: activePlugins.length,
      statusCounts,
      categoryCounts,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };
  }

  /**
   * 헬스 체크 시작
   */
  private startHealthCheck(): void {
    if (this.config.healthCheckInterval <= 0) {
      return;
    }

    this.healthCheckTimer = setInterval(async () => {
      try {
        const healthResults = await this.checkAllPluginsHealth();
        
        for (const [pluginId, health] of Object.entries(healthResults)) {
          if (health && health.status === 'error') {
            this.emit('plugin.health.critical', { pluginId, health });
          }
        }

        this.emit('system.health.checked', healthResults);
      } catch (error) {
        console.error('[PluginManager] Health check error:', error);
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * 메트릭 수집 시작
   */
  private startMetricsCollection(): void {
    if (this.config.metricsInterval <= 0) {
      return;
    }

    this.metricsTimer = setInterval(() => {
      try {
        const stats = this.getSystemStats();
        this.emit('system.metrics.collected', stats);
      } catch (error) {
        console.error('[PluginManager] Metrics collection error:', error);
      }
    }, this.config.metricsInterval);
  }

  /**
   * 플러그인 매니저 종료
   */
  async dispose(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    console.log('[PluginManager] Disposing...');

    // 타이머 정리
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }

    // 모든 플러그인 언로드
    await this.loader.unloadAllPlugins();

    // 로더 정리
    await this.loader.dispose();

    // 레지스트리 정리
    if (this.registry) {
      await this.registry.dispose();
    }

    this.initialized = false;
    this.emit('manager.disposed');

    console.log('[PluginManager] Disposed successfully');
  }

  /**
   * 플러그인 업데이트 체크
   */
  async checkForUpdates(): Promise<Array<{ pluginId: string; currentVersion: string; latestVersion: string }>> {
    if (!this.registry) {
      return [];
    }

    const plugins = this.getPlugins();
    const updates = [];

    for (const plugin of plugins) {
      try {
        const latestVersion = await this.registry.getLatestVersion(plugin.manifest.name);
        if (latestVersion && latestVersion !== plugin.manifest.version) {
          updates.push({
            pluginId: plugin.id,
            currentVersion: plugin.manifest.version,
            latestVersion
          });
        }
      } catch (error) {
        console.error(`[PluginManager] Failed to check updates for ${plugin.id}:`, error);
      }
    }

    return updates;
  }

  /**
   * 플러그인 업데이트
   */
  async updatePlugin(pluginId: string, version?: string): Promise<boolean> {
    if (!this.registry) {
      throw new Error('Plugin registry not configured');
    }

    try {
      const plugin = this.getPlugins().find(p => p.id === pluginId);
      if (!plugin) {
        throw new Error(`Plugin not found: ${pluginId}`);
      }

      console.log(`[PluginManager] Updating plugin: ${pluginId}`);

      // 기존 플러그인 언로드
      await this.unloadPlugin(pluginId);

      // 새 버전 설치
      const success = await this.registry.installPlugin(plugin.manifest.name, version, true);

      if (success) {
        // 플러그인 재검색 및 로드
        await this.loader.discoverPlugins();
        await this.loadPlugin(pluginId);
        
        this.emit('plugin.updated', { pluginId, version });
        console.log(`[PluginManager] Plugin updated: ${pluginId}`);
      }

      return success;
    } catch (error) {
      console.error(`[PluginManager] Failed to update plugin ${pluginId}:`, error);
      this.emit('plugin.update.failed', { pluginId, error });
      return false;
    }
  }
}