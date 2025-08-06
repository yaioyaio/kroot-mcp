/**
 * 플러그인 API 프로바이더
 * 플러그인이 사용할 수 있는 API 컨텍스트 제공
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import axios, { AxiosInstance } from 'axios';
import {
  PluginAPIContext,
  PluginDescriptor,
  PluginLogger,
  PluginFileSystem,
  PluginHTTPClient,
  PluginDatabase,
  PluginMCPTools,
  PluginNotifications,
  PluginCommunication,
  PluginStorage,
  PluginPermission
} from './types.js';

/**
 * 플러그인 API 프로바이더
 */
export class PluginAPIProvider {
  private contexts = new Map<string, PluginAPIContext>();
  private eventBus = new EventEmitter();
  private storages = new Map<string, Map<string, any>>();

  constructor() {
    this.eventBus.setMaxListeners(1000); // 많은 플러그인을 위해 리스너 한도 증가
  }

  /**
   * 플러그인용 API 컨텍스트 생성
   */
  async createContext(descriptor: PluginDescriptor): Promise<PluginAPIContext> {
    const pluginId = descriptor.id;
    const permissions = descriptor.manifest.permissions || [];

    const context: PluginAPIContext = {
      metadata: descriptor.manifest,
      config: descriptor.manifest.configSchema || {},
      events: this.createEventInterface(pluginId, permissions),
      logger: this.createLogger(pluginId),
      fs: this.createFileSystemInterface(pluginId, permissions),
      http: this.createHTTPInterface(pluginId, permissions),
      database: this.createDatabaseInterface(pluginId, permissions),
      mcp: this.createMCPInterface(pluginId, permissions),
      notifications: this.createNotificationInterface(pluginId, permissions),
      communication: this.createCommunicationInterface(pluginId),
      storage: this.createStorageInterface(pluginId)
    };

    this.contexts.set(pluginId, context);
    return context;
  }

  /**
   * API 컨텍스트 해제
   */
  async destroyContext(pluginId: string): Promise<void> {
    const context = this.contexts.get(pluginId);
    if (!context) {
      return;
    }

    // 이벤트 리스너 정리
    this.eventBus.removeAllListeners(`plugin.${pluginId}.*`);
    
    // 스토리지 정리
    this.storages.delete(pluginId);
    
    // 컨텍스트 제거
    this.contexts.delete(pluginId);
  }

  /**
   * 이벤트 인터페이스 생성
   */
  private createEventInterface(pluginId: string, permissions: PluginPermission[]): EventEmitter {
    const eventInterface = new EventEmitter();
    
    // 이벤트 읽기 권한 체크
    const canReadEvents = permissions.includes(PluginPermission.READ_EVENTS);
    const canWriteEvents = permissions.includes(PluginPermission.WRITE_EVENTS);

    if (canReadEvents) {
      // 글로벌 이벤트를 플러그인에 전달
      this.eventBus.on('*', (event, data) => {
        eventInterface.emit(event, data);
      });
    }

    if (canWriteEvents) {
      // 플러그인 이벤트를 글로벌 버스에 전달
      eventInterface.on('*', (event, data) => {
        this.eventBus.emit(`plugin.${pluginId}.${event}`, data);
        this.eventBus.emit(event, { ...data, source: pluginId });
      });
    }

    return eventInterface;
  }

  /**
   * 로거 인터페이스 생성
   */
  private createLogger(pluginId: string): PluginLogger {
    const prefix = `[Plugin:${pluginId}]`;
    
    return {
      debug: (message: string, meta?: any) => {
        console.debug(`${prefix} [DEBUG] ${message}`, meta || '');
      },
      
      info: (message: string, meta?: any) => {
        console.info(`${prefix} [INFO] ${message}`, meta || '');
      },
      
      warn: (message: string, meta?: any) => {
        console.warn(`${prefix} [WARN] ${message}`, meta || '');
      },
      
      error: (message: string, error?: Error, meta?: any) => {
        console.error(`${prefix} [ERROR] ${message}`, error || '', meta || '');
      }
    };
  }

  /**
   * 파일 시스템 인터페이스 생성
   */
  private createFileSystemInterface(_pluginId: string, permissions: PluginPermission[]): PluginFileSystem {
    const canReadFiles = permissions.includes(PluginPermission.READ_FILES);
    const canWriteFiles = permissions.includes(PluginPermission.WRITE_FILES);

    return {
      readFile: async (path: string): Promise<string> => {
        if (!canReadFiles) {
          throw new Error('Plugin does not have file read permission');
        }
        
        // 보안: 플러그인 디렉토리 외부 접근 제한
        if (path.includes('..') || !path.startsWith('/')) {
          throw new Error('Invalid file path');
        }
        
        return fs.readFile(path, 'utf-8');
      },

      writeFile: async (path: string, content: string): Promise<void> => {
        if (!canWriteFiles) {
          throw new Error('Plugin does not have file write permission');
        }
        
        // 보안: 플러그인 디렉토리 외부 접근 제한
        if (path.includes('..') || !path.startsWith('/')) {
          throw new Error('Invalid file path');
        }
        
        await fs.writeFile(path, content, 'utf-8');
      },

      exists: async (path: string): Promise<boolean> => {
        if (!canReadFiles) {
          return false;
        }
        
        try {
          await fs.access(path);
          return true;
        } catch {
          return false;
        }
      },

      mkdir: async (path: string): Promise<void> => {
        if (!canWriteFiles) {
          throw new Error('Plugin does not have file write permission');
        }
        
        await fs.mkdir(path, { recursive: true });
      },

      readDir: async (path: string): Promise<string[]> => {
        if (!canReadFiles) {
          throw new Error('Plugin does not have file read permission');
        }
        
        const entries = await fs.readdir(path);
        return entries;
      },

      watch: (path: string, callback: (event: string, filename: string) => void): void => {
        if (!canReadFiles) {
          throw new Error('Plugin does not have file read permission');
        }
        
        // 파일 감시는 chokidar나 fs.watch 사용
        const { watch } = require('fs');
        watch(path, { recursive: true }, callback);
      }
    };
  }

  /**
   * HTTP 클라이언트 인터페이스 생성
   */
  private createHTTPInterface(pluginId: string, permissions: PluginPermission[]): PluginHTTPClient {
    const canAccessNetwork = permissions.includes(PluginPermission.NETWORK_ACCESS);
    
    if (!canAccessNetwork) {
      // 네트워크 접근 권한이 없는 경우 더미 인터페이스 반환
      const noPermissionError = () => {
        throw new Error('Plugin does not have network access permission');
      };
      
      return {
        get: noPermissionError,
        post: noPermissionError,
        put: noPermissionError,
        delete: noPermissionError
      };
    }

    const httpClient: AxiosInstance = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent': `DevFlowMonitor-Plugin/${pluginId}`
      }
    });

    return {
      get: async (url: string, options?: any) => {
        const response = await httpClient.get(url, options);
        return response.data;
      },

      post: async (url: string, data: any, options?: any) => {
        const response = await httpClient.post(url, data, options);
        return response.data;
      },

      put: async (url: string, data: any, options?: any) => {
        const response = await httpClient.put(url, data, options);
        return response.data;
      },

      delete: async (url: string, options?: any) => {
        const response = await httpClient.delete(url, options);
        return response.data;
      }
    };
  }

  /**
   * 데이터베이스 인터페이스 생성
   */
  private createDatabaseInterface(_pluginId: string, permissions: PluginPermission[]): PluginDatabase {
    const canReadDB = permissions.includes(PluginPermission.DATABASE_READ);
    const canWriteDB = permissions.includes(PluginPermission.DATABASE_WRITE);

    return {
      query: async (sql: string, _params?: any[]): Promise<any[]> => {
        if (!canReadDB && !sql.toLowerCase().trim().startsWith('select')) {
          throw new Error('Plugin does not have database read permission');
        }
        if (!canWriteDB && !sql.toLowerCase().trim().startsWith('select')) {
          throw new Error('Plugin does not have database write permission');
        }
        
        // 실제 데이터베이스 쿼리는 StorageManager를 통해 실행
        // 여기서는 플레이스홀더
        throw new Error('Database interface not implemented yet');
      },

      insert: async (_table: string, _data: Record<string, any>): Promise<number> => {
        if (!canWriteDB) {
          throw new Error('Plugin does not have database write permission');
        }
        
        // 실제 구현 필요
        throw new Error('Database interface not implemented yet');
      },

      update: async (_table: string, _data: Record<string, any>, _where: Record<string, any>): Promise<number> => {
        if (!canWriteDB) {
          throw new Error('Plugin does not have database write permission');
        }
        
        // 실제 구현 필요
        throw new Error('Database interface not implemented yet');
      },

      delete: async (_table: string, _where: Record<string, any>): Promise<number> => {
        if (!canWriteDB) {
          throw new Error('Plugin does not have database write permission');
        }
        
        // 실제 구현 필요
        throw new Error('Database interface not implemented yet');
      }
    };
  }

  /**
   * MCP 도구 인터페이스 생성
   */
  private createMCPInterface(pluginId: string, permissions: PluginPermission[]): PluginMCPTools {
    const canUseMCPTools = permissions.includes(PluginPermission.MCP_TOOLS);
    
    const registeredTools = new Map<string, Function>();

    return {
      registerTool: (name: string, _description: string, handler: Function): void => {
        if (!canUseMCPTools) {
          throw new Error('Plugin does not have MCP tools permission');
        }
        
        const toolName = `plugin_${pluginId}_${name}`;
        registeredTools.set(toolName, handler);
        
        // 실제 MCP 서버에 도구 등록 (나중에 구현)
        console.log(`[PluginAPI] Tool registered: ${toolName}`);
      },

      unregisterTool: (name: string): void => {
        if (!canUseMCPTools) {
          throw new Error('Plugin does not have MCP tools permission');
        }
        
        const toolName = `plugin_${pluginId}_${name}`;
        registeredTools.delete(toolName);
        
        // 실제 MCP 서버에서 도구 제거 (나중에 구현)
        console.log(`[PluginAPI] Tool unregistered: ${toolName}`);
      },

      callTool: async (name: string, args: any): Promise<any> => {
        if (!canUseMCPTools) {
          throw new Error('Plugin does not have MCP tools permission');
        }
        
        const handler = registeredTools.get(name);
        if (!handler) {
          throw new Error(`Tool not found: ${name}`);
        }
        
        return handler(args);
      }
    };
  }

  /**
   * 알림 인터페이스 생성
   */
  private createNotificationInterface(pluginId: string, permissions: PluginPermission[]): PluginNotifications {
    const canSendNotifications = permissions.includes(PluginPermission.NOTIFICATIONS);

    return {
      send: async (message: string, level: 'info' | 'warning' | 'error', options?: any): Promise<void> => {
        if (!canSendNotifications) {
          throw new Error('Plugin does not have notification permission');
        }
        
        // 실제 알림 시스템에 전달 (나중에 구현)
        console.log(`[Plugin:${pluginId}] Notification [${level.toUpperCase()}]: ${message}`);
        
        this.eventBus.emit('plugin.notification', {
          pluginId,
          message,
          level,
          options,
          timestamp: new Date()
        });
      },

      createRule: async (_rule: any): Promise<string> => {
        if (!canSendNotifications) {
          throw new Error('Plugin does not have notification permission');
        }
        
        // 알림 규칙 생성 (나중에 구현)
        const ruleId = `plugin_${pluginId}_${Date.now()}`;
        console.log(`[Plugin:${pluginId}] Notification rule created: ${ruleId}`);
        return ruleId;
      },

      removeRule: async (ruleId: string): Promise<void> => {
        if (!canSendNotifications) {
          throw new Error('Plugin does not have notification permission');
        }
        
        // 알림 규칙 제거 (나중에 구현)
        console.log(`[Plugin:${pluginId}] Notification rule removed: ${ruleId}`);
      }
    };
  }

  /**
   * 플러그인 간 통신 인터페이스 생성
   */
  private createCommunicationInterface(pluginId: string): PluginCommunication {
    return {
      sendMessage: async (targetPlugin: string, message: any): Promise<void> => {
        this.eventBus.emit(`plugin.message.${targetPlugin}`, {
          from: pluginId,
          to: targetPlugin,
          message,
          timestamp: new Date()
        });
      },

      broadcast: (event: string, data: any): void => {
        this.eventBus.emit(`plugin.broadcast.${event}`, {
          from: pluginId,
          event,
          data,
          timestamp: new Date()
        });
      },

      subscribe: (event: string, handler: (...args: any[]) => void): void => {
        this.eventBus.on(`plugin.broadcast.${event}`, handler);
        this.eventBus.on(`plugin.message.${pluginId}`, handler);
      },

      unsubscribe: (event: string, handler: (...args: any[]) => void): void => {
        this.eventBus.off(`plugin.broadcast.${event}`, handler);
        this.eventBus.off(`plugin.message.${pluginId}`, handler);
      }
    };
  }

  /**
   * 스토리지 인터페이스 생성
   */
  private createStorageInterface(pluginId: string): PluginStorage {
    // 플러그인별 독립적인 스토리지 공간
    if (!this.storages.has(pluginId)) {
      this.storages.set(pluginId, new Map<string, any>());
    }
    
    const storage = this.storages.get(pluginId)!;

    return {
      get: async (key: string): Promise<any> => {
        return storage.get(key);
      },

      set: async (key: string, value: any): Promise<void> => {
        storage.set(key, value);
        
        // 지속성을 위해 파일에 저장 (나중에 구현)
        // await this.persistPluginStorage(pluginId, storage);
      },

      delete: async (key: string): Promise<void> => {
        storage.delete(key);
        
        // 지속성을 위해 파일에 저장 (나중에 구현)
        // await this.persistPluginStorage(pluginId, storage);
      },

      clear: async (): Promise<void> => {
        storage.clear();
        
        // 지속성을 위해 파일에 저장 (나중에 구현)
        // await this.persistPluginStorage(pluginId, storage);
      },

      keys: async (): Promise<string[]> => {
        return Array.from(storage.keys());
      }
    };
  }

  /**
   * 글로벌 이벤트 발생
   */
  emitGlobalEvent(event: string, data: any): void {
    this.eventBus.emit(event, data);
  }

  /**
   * 글로벌 이벤트 구독
   */
  onGlobalEvent(event: string, handler: (...args: any[]) => void): void {
    this.eventBus.on(event, handler);
  }

  /**
   * 정리
   */
  async dispose(): Promise<void> {
    // 모든 이벤트 리스너 제거
    this.eventBus.removeAllListeners();
    
    // 모든 컨텍스트 정리
    this.contexts.clear();
    
    // 모든 스토리지 정리
    this.storages.clear();
    
    console.log('[PluginAPIProvider] Disposed');
  }

  /**
   * 플러그인 스토리지 지속성 (향후 구현)
   */
  // private async persistPluginStorage(_pluginId: string, _storage: Map<string, any>): Promise<void> {
  //   // JSON 파일로 저장하거나 데이터베이스에 저장
  //   // 구현 필요
  // }

  /**
   * 플러그인 스토리지 복원 (향후 구현)
   */
  // private async restorePluginStorage(_pluginId: string): Promise<Map<string, any>> {
  //   // JSON 파일에서 복원하거나 데이터베이스에서 복원
  //   // 구현 필요
  //   return new Map<string, any>();
  // }
}