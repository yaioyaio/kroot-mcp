/**
 * MCP 서버 설정 관리
 * DevFlow Monitor MCP 서버의 모든 설정을 중앙에서 관리합니다.
 */

export interface ServerConfig {
  /**
   * 서버 기본 정보
   */
  server: {
    name: string;
    version: string;
    description: string;
  };

  /**
   * 프로토콜 설정
   */
  protocol: {
    version: string;
    capabilities: {
      tools: boolean;
      resources: boolean;
      prompts: boolean;
      logging: boolean;
    };
  };

  /**
   * 개발 환경 설정
   */
  development: {
    debug: boolean;
    logLevel: 'error' | 'warn' | 'info' | 'debug';
    hotReload: boolean;
  };

  /**
   * 모니터링 설정
   */
  monitoring: {
    fileWatch: {
      enabled: boolean;
      extensions: string[];
      ignorePatterns: string[];
      debounceMs: number;
    };
    gitWatch: {
      enabled: boolean;
      autoDetect: boolean;
      branches: string[];
    };
  };

  /**
   * 데이터 저장소 설정
   */
  storage: {
    type: 'sqlite' | 'memory';
    path: string;
    backup: {
      enabled: boolean;
      intervalMs: number;
    };
  };

  /**
   * 이벤트 시스템 설정
   */
  events: {
    maxListeners: number;
    bufferSize: number;
    retryAttempts: number;
  };
}

/**
 * 기본 서버 설정
 */
export const defaultConfig: ServerConfig = {
  server: {
    name: 'devflow-monitor-mcp',
    version: '0.1.0',
    description: 'AI-powered development process monitoring MCP server',
  },

  protocol: {
    version: '2024-11-05',
    capabilities: {
      tools: true,
      resources: true,
      prompts: false,
      logging: true,
    },
  },

  development: {
    debug: process.env.NODE_ENV !== 'production',
    logLevel: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    hotReload: process.env.NODE_ENV === 'development',
  },

  monitoring: {
    fileWatch: {
      enabled: true,
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.yml', '.yaml'],
      ignorePatterns: [
        'node_modules/**',
        'dist/**',
        'build/**',
        '.git/**',
        'coverage/**',
        '*.log',
        '.env*',
      ],
      debounceMs: 100,
    },
    gitWatch: {
      enabled: true,
      autoDetect: true,
      branches: ['main', 'develop', 'master'],
    },
  },

  storage: {
    type: 'sqlite',
    path: './data/devflow.db',
    backup: {
      enabled: true,
      intervalMs: 60000, // 1분마다 백업
    },
  },

  events: {
    maxListeners: 100,
    bufferSize: 1000,
    retryAttempts: 3,
  },
};

/**
 * 환경 변수에서 설정 오버라이드
 */
export function loadConfig(): ServerConfig {
  const config = { ...defaultConfig };

  // 환경 변수로 특정 설정 오버라이드
  if (process.env.MCP_SERVER_NAME) {
    config.server.name = process.env.MCP_SERVER_NAME;
  }

  if (process.env.MCP_DEBUG) {
    config.development.debug = process.env.MCP_DEBUG === 'true';
  }

  if (process.env.MCP_LOG_LEVEL) {
    config.development.logLevel = process.env.MCP_LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug';
  }

  if (process.env.MCP_STORAGE_PATH) {
    config.storage.path = process.env.MCP_STORAGE_PATH;
  }

  if (process.env.MCP_FILE_WATCH_DEBOUNCE) {
    config.monitoring.fileWatch.debounceMs = parseInt(process.env.MCP_FILE_WATCH_DEBOUNCE, 10);
  }

  return config;
}

/**
 * 설정 검증
 */
export function validateConfig(config: ServerConfig): void {
  if (!config.server.name || config.server.name.trim() === '') {
    throw new Error('Server name is required');
  }

  if (!config.server.version || config.server.version.trim() === '') {
    throw new Error('Server version is required');
  }

  if (config.monitoring.fileWatch.debounceMs < 0) {
    throw new Error('File watch debounce must be non-negative');
  }

  if (config.events.maxListeners <= 0) {
    throw new Error('Max listeners must be positive');
  }

  if (config.events.bufferSize <= 0) {
    throw new Error('Buffer size must be positive');
  }

  if (config.events.retryAttempts < 0) {
    throw new Error('Retry attempts must be non-negative');
  }
}

/**
 * 현재 사용 중인 설정
 */
export const config = loadConfig();

// 설정 검증 실행
validateConfig(config);
