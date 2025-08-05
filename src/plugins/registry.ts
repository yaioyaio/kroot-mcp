/**
 * 플러그인 레지스트리
 * 플러그인 설치, 업데이트, 제거 관리
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import axios from 'axios';
import { PluginManifest } from './types.js';

/**
 * 레지스트리 플러그인 정보
 */
export interface RegistryPluginInfo {
  name: string;
  version: string;
  description: string;
  author: string;
  category: string;
  tags: string[];
  downloadUrl: string;
  homepage?: string;
  repository?: string;
  license?: string;
  dependencies?: Record<string, string>;
  verified: boolean;
  downloads: number;
  rating: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 플러그인 레지스트리
 */
export class PluginRegistry {
  private cache = new Map<string, RegistryPluginInfo>();
  private cacheExpiry = new Map<string, number>();
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1시간

  constructor(
    private registryUrl: string,
    private localDir = join(process.cwd(), 'plugins')
  ) {}

  /**
   * 레지스트리 초기화
   */
  async initialize(): Promise<void> {
    try {
      // 로컬 플러그인 디렉토리 생성
      await this.ensureDirectory(this.localDir);
      
      console.log('[PluginRegistry] Initialized');
    } catch (error) {
      console.error('[PluginRegistry] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * 플러그인 검색
   */
  async searchPlugins(query: string, limit = 20): Promise<RegistryPluginInfo[]> {
    try {
      const response = await axios.get(`${this.registryUrl}/search`, {
        params: { q: query, limit },
        timeout: 10000
      });

      return response.data.plugins || [];
    } catch (error) {
      console.error('[PluginRegistry] Search failed:', error);
      return [];
    }
  }

  /**
   * 플러그인 정보 조회
   */
  async getPluginInfo(name: string): Promise<RegistryPluginInfo | null> {
    try {
      // 캐시 확인
      const cached = this.getFromCache(name);
      if (cached) {
        return cached;
      }

      const response = await axios.get(`${this.registryUrl}/plugins/${name}`, {
        timeout: 10000
      });

      const pluginInfo: RegistryPluginInfo = {
        ...response.data,
        createdAt: new Date(response.data.createdAt),
        updatedAt: new Date(response.data.updatedAt)
      };

      // 캐시에 저장
      this.setCache(name, pluginInfo);

      return pluginInfo;
    } catch (error) {
      console.error(`[PluginRegistry] Failed to get plugin info for ${name}:`, error);
      return null;
    }
  }

  /**
   * 최신 버전 조회
   */
  async getLatestVersion(name: string): Promise<string | null> {
    const pluginInfo = await this.getPluginInfo(name);
    return pluginInfo ? pluginInfo.version : null;
  }

  /**
   * 플러그인 설치
   */
  async installPlugin(name: string, version?: string, forceUpdate = false): Promise<boolean> {
    try {
      console.log(`[PluginRegistry] Installing ${name}${version ? `@${version}` : ''}`);

      // 플러그인 정보 조회
      const pluginInfo = await this.getPluginInfo(name);
      if (!pluginInfo) {
        throw new Error(`Plugin not found in registry: ${name}`);
      }

      const targetVersion = version || pluginInfo.version;
      const pluginDir = join(this.localDir, name);

      // 이미 설치된 경우 체크
      if (!forceUpdate && await this.isPluginInstalled(name, targetVersion)) {
        console.log(`[PluginRegistry] Plugin already installed: ${name}@${targetVersion}`);
        return true;
      }

      // 플러그인 다운로드
      const downloadUrl = pluginInfo.downloadUrl.replace('{version}', targetVersion);
      await this.downloadAndExtract(downloadUrl, pluginDir);

      // 매니페스트 검증
      const manifestPath = join(pluginDir, 'package.json');
      const manifest = await this.loadManifest(manifestPath);
      
      if (!manifest) {
        throw new Error('Invalid plugin manifest');
      }

      // 종속성 설치 (npm install)
      if (manifest.dependencies && Object.keys(manifest.dependencies).length > 0) {
        await this.installDependencies(pluginDir);
      }

      console.log(`[PluginRegistry] Plugin installed successfully: ${name}@${targetVersion}`);
      return true;

    } catch (error) {
      console.error(`[PluginRegistry] Failed to install ${name}:`, error);
      return false;
    }
  }

  /**
   * 플러그인 제거
   */
  async uninstallPlugin(name: string): Promise<boolean> {
    try {
      console.log(`[PluginRegistry] Uninstalling ${name}`);

      const pluginDir = join(this.localDir, name);
      
      // 디렉토리 존재 확인
      if (await this.directoryExists(pluginDir)) {
        // 디렉토리 삭제
        await fs.rm(pluginDir, { recursive: true, force: true });
      }

      console.log(`[PluginRegistry] Plugin uninstalled: ${name}`);
      return true;

    } catch (error) {
      console.error(`[PluginRegistry] Failed to uninstall ${name}:`, error);
      return false;
    }
  }

  /**
   * 설치된 플러그인 목록
   */
  async getInstalledPlugins(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.localDir, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    } catch (error) {
      console.error('[PluginRegistry] Failed to get installed plugins:', error);
      return [];
    }
  }

  /**
   * 플러그인 설치 여부 확인
   */
  async isPluginInstalled(name: string, version?: string): Promise<boolean> {
    try {
      const pluginDir = join(this.localDir, name);
      const manifestPath = join(pluginDir, 'package.json');

      if (!await this.fileExists(manifestPath)) {
        return false;
      }

      if (!version) {
        return true;
      }

      const manifest = await this.loadManifest(manifestPath);
      return manifest ? manifest.version === version : false;

    } catch {
      return false;
    }
  }

  /**
   * 플러그인 다운로드 및 압축 해제
   */
  private async downloadAndExtract(url: string, targetDir: string): Promise<void> {
    try {
      // 기존 디렉토리 삭제
      if (await this.directoryExists(targetDir)) {
        await fs.rm(targetDir, { recursive: true, force: true });
      }

      // 디렉토리 생성
      await fs.mkdir(targetDir, { recursive: true });

      // 파일 다운로드
      const response = await axios.get(url, {
        responseType: 'stream',
        timeout: 60000 // 1분
      });

      // 임시 파일로 저장
      const tempFile = join(targetDir, 'plugin.tar.gz');
      const writer = require('fs').createWriteStream(tempFile);
      
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      // 압축 해제 (tar 사용)
      const tar = require('tar');
      await tar.extract({
        file: tempFile,
        cwd: targetDir,
        strip: 1 // 최상위 디렉토리 제거
      });

      // 임시 파일 삭제
      await fs.unlink(tempFile);

    } catch (error) {
      throw new Error(`Failed to download and extract plugin: ${error.message}`);
    }
  }

  /**
   * 종속성 설치
   */
  private async installDependencies(pluginDir: string): Promise<void> {
    try {
      const { spawn } = require('child_process');
      
      await new Promise((resolve, reject) => {
        const npm = spawn('npm', ['install'], { 
          cwd: pluginDir,
          stdio: 'pipe'
        });

        let output = '';
        npm.stdout.on('data', (data: Buffer) => {
          output += data.toString();
        });

        npm.stderr.on('data', (data: Buffer) => {
          output += data.toString();
        });

        npm.on('close', (code: number) => {
          if (code === 0) {
            resolve(void 0);
          } else {
            reject(new Error(`npm install failed with code ${code}: ${output}`));
          }
        });
      });

    } catch (error) {
      console.warn('[PluginRegistry] Failed to install dependencies:', error.message);
      // 종속성 설치 실패는 치명적이지 않음
    }
  }

  /**
   * 매니페스트 로드
   */
  private async loadManifest(manifestPath: string): Promise<PluginManifest | null> {
    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * 캐시에서 조회
   */
  private getFromCache(name: string): RegistryPluginInfo | null {
    const expiry = this.cacheExpiry.get(name);
    if (!expiry || Date.now() > expiry) {
      this.cache.delete(name);
      this.cacheExpiry.delete(name);
      return null;
    }

    return this.cache.get(name) || null;
  }

  /**
   * 캐시에 저장
   */
  private setCache(name: string, info: RegistryPluginInfo): void {
    this.cache.set(name, info);
    this.cacheExpiry.set(name, Date.now() + this.CACHE_TTL);
  }

  /**
   * 디렉토리 존재 확인 및 생성
   */
  private async ensureDirectory(path: string): Promise<void> {
    try {
      await fs.access(path);
    } catch {
      await fs.mkdir(path, { recursive: true });
    }
  }

  /**
   * 파일 존재 확인
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
   * 디렉토리 존재 확인
   */
  private async directoryExists(path: string): Promise<boolean> {
    try {
      const stats = await fs.stat(path);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * 정리
   */
  async dispose(): Promise<void> {
    this.cache.clear();
    this.cacheExpiry.clear();
    console.log('[PluginRegistry] Disposed');
  }
}