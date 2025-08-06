/**
 * 플러그인 시스템
 * DevFlow Monitor 플러그인 아키텍처
 */

// 플러그인 매니저 (메인 API)
export { PluginManager } from './manager.js';
export type { PluginManagerConfig } from './manager.js';
import { PluginManager } from './manager.js';

// 플러그인 로더
export { PluginLoader } from './loader.js';

// 플러그인 레지스트리
export { PluginRegistry, type RegistryPluginInfo } from './registry.js';

// API 프로바이더
export { PluginAPIProvider } from './api-provider.js';

// 샌드박스
export { PluginSandbox, type SandboxConfig, type SandboxEnvironment } from './sandbox.js';

// 타입 정의
export * from './types.js';

// 기본 템플릿
export { default as BasicPlugin } from './templates/basic-plugin/index.js';

/**
 * 기본 플러그인 매니저 설정
 */
import type { PluginManagerConfig } from './manager.js';

export const DEFAULT_PLUGIN_CONFIG: Partial<PluginManagerConfig> = {
  pluginDirs: ['./plugins', './node_modules/@devflow-plugins'],
  autoLoad: true,
  hotReload: true,
  maxPlugins: 50,
  sandboxEnabled: true,
  healthCheckInterval: 60000, // 1분
  metricsInterval: 30000,     // 30초
};

/**
 * 플러그인 매니저 팩토리 함수
 */
export function createPluginManager(config?: Partial<PluginManagerConfig>) {
  const finalConfig = {
    ...DEFAULT_PLUGIN_CONFIG,
    ...config
  } as PluginManagerConfig;

  return new PluginManager(finalConfig);
}

/**
 * 플러그인 시스템 유틸리티
 */
export class PluginUtils {
  /**
   * 플러그인 ID 검증
   */
  static validatePluginId(id: string): boolean {
    // 영문자, 숫자, 하이픈, 언더스코어만 허용
    const pattern = /^[a-zA-Z0-9-_]+$/;
    return pattern.test(id) && id.length >= 2 && id.length <= 100;
  }

  /**
   * 버전 비교 (SemVer)
   */
  static compareVersions(a: string, b: string): number {
    const parseVersion = (version: string) => {
      return version.split('.').map(v => parseInt(v, 10));
    };

    const versionA = parseVersion(a);
    const versionB = parseVersion(b);

    for (let i = 0; i < Math.max(versionA.length, versionB.length); i++) {
      const numA = versionA[i] || 0;
      const numB = versionB[i] || 0;

      if (numA > numB) return 1;
      if (numA < numB) return -1;
    }

    return 0;
  }

  /**
   * 플러그인 호환성 체크
   */
  static isCompatible(pluginVersion: string, systemVersion: string): boolean {
    // 간단한 호환성 체크 (메이저 버전이 같아야 함)
    const pluginMajor = parseInt(pluginVersion.split('.')[0] || '0', 10);
    const systemMajor = parseInt(systemVersion.split('.')[0] || '0', 10);

    return pluginMajor === systemMajor;
  }

  /**
   * 권한 검증
   */
  static validatePermissions(permissions: string[]): boolean {
    // Import at runtime to avoid circular dependencies
    const { PluginPermission } = require('./types.js');
    const validPermissions = Object.values(PluginPermission);
    return permissions.every(permission => validPermissions.includes(permission as any));
  }

  /**
   * 플러그인 매니페스트 검증
   */
  static validateManifest(manifest: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 필수 필드 체크
    const requiredFields = ['id', 'name', 'version', 'description', 'author', 'category'];
    for (const field of requiredFields) {
      if (!manifest[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // ID 형식 체크
    if (manifest.id && !this.validatePluginId(manifest.id)) {
      errors.push('Invalid plugin ID format');
    }

    // 버전 형식 체크
    if (manifest.version && !/^\d+\.\d+\.\d+/.test(manifest.version)) {
      errors.push('Invalid version format (must be SemVer)');
    }

    // 권한 체크
    if (manifest.permissions && !this.validatePermissions(manifest.permissions)) {
      errors.push('Invalid permissions');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// 인터페이스 재내보내기 (편의상)
import type {
  Plugin,
  PluginMetadata,
  PluginAPIContext,
  PluginStatus,
  PluginCategory,
  PluginPermission
} from './types.js';

export type {
  Plugin,
  PluginMetadata,
  PluginAPIContext,
  PluginStatus,
  PluginCategory,
  PluginPermission
};