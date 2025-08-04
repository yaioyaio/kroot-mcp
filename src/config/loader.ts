/**
 * Configuration Loader
 * 환경별 설정 파일 로딩 및 관리
 */

import * as fs from 'fs';
import * as path from 'path';
import { config as dotenv } from 'dotenv';

export interface AppConfig {
  server: {
    port: number;
    host: string;
    name: string;
  };
  database: {
    path: string;
    walMode: boolean;
    busyTimeout: number;
    cacheSize: number;
    synchronous: string;
  };
  monitoring: {
    fileSystem: {
      enabled: boolean;
      ignorePatterns: string[];
      watchExtensions: string[];
      debounceDelay?: number;
    };
    git: {
      enabled: boolean;
      pollInterval: number;
      branchPatterns: Record<string, string>;
    };
  };
  events: {
    batchSize: number;
    flushInterval: number;
    maxQueueSize: number;
    retryAttempts: number;
    retryDelay: number;
  };
  performance: {
    cache: {
      enabled: boolean;
      ttl: number;
      maxSize: number;
      checkPeriod: number;
    };
    scaling: {
      enabled: boolean;
      minWorkers: number;
      maxWorkers: number;
      scaleUpThreshold: number;
      scaleDownThreshold: number;
    };
  };
  security: {
    auth: {
      enabled: boolean;
      jwt: {
        secret?: string;
        expiresIn: string;
        refreshExpiresIn: string;
        issuer: string;
        audience: string;
      };
      apiKey?: {
        salt: string;
      };
      rateLimit: {
        windowMs: number;
        maxAttempts: number;
      };
    };
  };
  logging: {
    level: string;
    format: string;
    console: {
      enabled: boolean;
      colorize: boolean;
    };
    file: {
      enabled: boolean;
      path: string;
      maxSize: string;
      maxFiles: number;
    };
  };
  notifications: {
    enabled: boolean;
    channels: {
      dashboard: {
        enabled: boolean;
      };
      slack: {
        enabled: boolean;
        webhookUrl?: string;
      };
    };
  };
  debug?: {
    enabled: boolean;
    verboseErrors: boolean;
    stackTraces: boolean;
  };
}

export class ConfigLoader {
  private static instance: ConfigLoader;
  private config: AppConfig | null = null;
  private readonly configDir: string;
  private readonly environment: string;

  private constructor() {
    // Load environment variables
    dotenv();
    
    this.environment = process.env.NODE_ENV || 'development';
    this.configDir = path.join(process.cwd(), 'config');
  }

  static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  /**
   * Load configuration based on environment
   */
  load(): AppConfig {
    if (this.config) {
      return this.config;
    }

    // Load default configuration
    const defaultConfig = this.loadJsonFile(path.join(this.configDir, 'default.json'));
    
    // Load environment-specific configuration
    const envConfigPath = path.join(this.configDir, 'environments', `${this.environment}.json`);
    const envConfig = fs.existsSync(envConfigPath) ? this.loadJsonFile(envConfigPath) : {};
    
    // Merge configurations
    this.config = this.deepMerge(defaultConfig, envConfig) as AppConfig;
    
    // Apply environment variable overrides
    this.config = this.applyEnvironmentVariables(this.config);
    
    // Validate configuration
    this.validateConfig(this.config);
    
    return this.config;
  }

  /**
   * Get current configuration
   */
  get(): AppConfig {
    if (!this.config) {
      return this.load();
    }
    return this.config;
  }

  /**
   * Get specific configuration value
   */
  getValue<T>(path: string): T | undefined {
    const config = this.get();
    return this.getNestedValue(config, path);
  }

  /**
   * Load JSON file
   */
  private loadJsonFile(filePath: string): any {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`Failed to load config file: ${filePath}`, error);
      return {};
    }
  }

  /**
   * Deep merge objects
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] instanceof Object && key in target) {
          result[key] = this.deepMerge(target[key], source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }
    
    return result;
  }

  /**
   * Apply environment variable overrides
   */
  private applyEnvironmentVariables(config: any): any {
    const result = JSON.parse(JSON.stringify(config));
    
    // Replace ${VAR_NAME} or ${VAR_NAME:-default} patterns
    const replaceVars = (obj: any): any => {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          obj[key] = obj[key].replace(/\${([^}]+)}/g, (match: string, varName: string) => {
            const [name, defaultValue] = varName.split(':-');
            return process.env[name] || defaultValue || match;
          });
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          replaceVars(obj[key]);
        }
      }
      return obj;
    };
    
    return replaceVars(result);
  }

  /**
   * Get nested value from object
   */
  private getNestedValue<T>(obj: any, path: string): T | undefined {
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (current[key] === undefined) {
        return undefined;
      }
      current = current[key];
    }
    
    return current as T;
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: AppConfig): void {
    // Required fields validation
    if (!config.server?.port) {
      throw new Error('Server port is required');
    }
    
    if (!config.database?.path) {
      throw new Error('Database path is required');
    }
    
    // Security validation for production
    if (this.environment === 'production') {
      if (config.security.auth.enabled && !config.security.auth.jwt.secret) {
        throw new Error('JWT secret is required in production when auth is enabled');
      }
      
      if (config.security.auth.enabled && !config.security.auth.apiKey?.salt) {
        throw new Error('API key salt is required in production when auth is enabled');
      }
    }
    
    // Port range validation
    if (config.server.port < 1 || config.server.port > 65535) {
      throw new Error('Server port must be between 1 and 65535');
    }
  }

  /**
   * Reload configuration
   */
  reload(): AppConfig {
    this.config = null;
    return this.load();
  }

  /**
   * Get environment
   */
  getEnvironment(): string {
    return this.environment;
  }

  /**
   * Check if running in production
   */
  isProduction(): boolean {
    return this.environment === 'production';
  }

  /**
   * Check if running in development
   */
  isDevelopment(): boolean {
    return this.environment === 'development';
  }

  /**
   * Check if running in test
   */
  isTest(): boolean {
    return this.environment === 'test';
  }
}

// Export singleton instance
export const config = ConfigLoader.getInstance();