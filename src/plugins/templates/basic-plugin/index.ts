/**
 * 기본 플러그인 템플릿
 * DevFlow Monitor 플러그인 개발을 위한 기본 구조
 */

import {
  Plugin,
  PluginMetadata,
  PluginAPIContext,
  PluginHealthStatus,
  PluginCategory,
  PluginPermission
} from '../../types.js';

/**
 * 플러그인 설정 인터페이스
 */
interface BasicPluginConfig {
  enabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * 기본 플러그인 클래스
 */
export class BasicPlugin implements Plugin {
  /** 플러그인 메타데이터 */
  readonly metadata: PluginMetadata = {
    id: 'example-basic-plugin',
    name: 'Basic Plugin Example',
    version: '1.0.0',
    description: 'A basic DevFlow Monitor plugin template that demonstrates core functionality',
    author: 'DevFlow Monitor Team',
    category: PluginCategory.UTILITY,
    tags: ['example', 'template', 'basic'],
    minDevFlowVersion: '1.0.0',
    homepage: 'https://github.com/devflow-monitor/plugins/basic-plugin',
    repository: 'https://github.com/devflow-monitor/plugins/basic-plugin',
    license: 'MIT',
    permissions: [
      PluginPermission.READ_EVENTS,
      PluginPermission.WRITE_EVENTS
    ],
    configSchema: {
      type: 'object',
      properties: {
        enabled: {
          type: 'boolean',
          default: true,
          description: 'Enable or disable the plugin'
        },
        logLevel: {
          type: 'string',
          enum: ['debug', 'info', 'warn', 'error'],
          default: 'info',
          description: 'Logging level'
        }
      }
    }
  };

  private context?: PluginAPIContext;
  private config: BasicPluginConfig = {
    enabled: true,
    logLevel: 'info'
  };
  private isActive = false;
  private eventListeners = new Map<string, Function>();

  /**
   * 플러그인 초기화
   */
  async initialize(context: PluginAPIContext): Promise<void> {
    this.context = context;
    
    // 설정 로드
    this.config = {
      ...this.config,
      ...context.config
    };

    this.log('info', 'Plugin initialized', { config: this.config });

    // 설정 검증
    if (!this.validateConfig(this.config)) {
      throw new Error('Invalid plugin configuration');
    }
  }

  /**
   * 플러그인 활성화
   */
  async activate(): Promise<void> {
    if (!this.context) {
      throw new Error('Plugin not initialized');
    }

    if (!this.config.enabled) {
      this.log('info', 'Plugin is disabled in configuration');
      return;
    }

    this.log('info', 'Activating plugin...');

    // 이벤트 리스너 등록
    this.setupEventListeners();

    // 정기 작업 시작 (예시)
    this.startPeriodicTasks();

    this.isActive = true;
    this.log('info', 'Plugin activated successfully');
  }

  /**
   * 플러그인 비활성화
   */
  async deactivate(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    this.log('info', 'Deactivating plugin...');

    // 이벤트 리스너 제거
    this.removeEventListeners();

    // 정기 작업 중지
    this.stopPeriodicTasks();

    this.isActive = false;
    this.log('info', 'Plugin deactivated successfully');
  }

  /**
   * 플러그인 해제
   */
  async dispose(): Promise<void> {
    await this.deactivate();
    
    this.log('info', 'Plugin disposed');
    
    // 리소스 정리
    this.eventListeners.clear();
    this.context = undefined;
  }

  /**
   * 설정 업데이트
   */
  async updateConfig(config: Record<string, any>): Promise<void> {
    const newConfig = { ...this.config, ...config } as BasicPluginConfig;
    
    if (!this.validateConfig(newConfig)) {
      throw new Error('Invalid configuration');
    }

    const oldConfig = { ...this.config };
    this.config = newConfig;

    this.log('info', 'Configuration updated', { 
      oldConfig, 
      newConfig: this.config 
    });

    // 설정 변경에 따른 동작 조정
    if (oldConfig.enabled !== newConfig.enabled) {
      if (newConfig.enabled && !this.isActive) {
        await this.activate();
      } else if (!newConfig.enabled && this.isActive) {
        await this.deactivate();
      }
    }
  }

  /**
   * 헬스 체크
   */
  async healthCheck(): Promise<PluginHealthStatus> {
    try {
      // 플러그인 상태 체크
      if (!this.context) {
        return {
          status: 'error',
          message: 'Plugin context not available',
          lastCheck: new Date()
        };
      }

      if (!this.config.enabled) {
        return {
          status: 'warning',
          message: 'Plugin is disabled',
          lastCheck: new Date()
        };
      }

      if (!this.isActive) {
        return {
          status: 'warning',
          message: 'Plugin is not active',
          lastCheck: new Date()
        };
      }

      // 추가 헬스 체크 로직 (예: 외부 서비스 연결 확인 등)

      return {
        status: 'healthy',
        message: 'Plugin is running normally',
        details: {
          isActive: this.isActive,
          config: this.config,
          eventListeners: this.eventListeners.size
        },
        lastCheck: new Date()
      };

    } catch (error) {
      return {
        status: 'error',
        message: error.message,
        lastCheck: new Date()
      };
    }
  }

  /**
   * 이벤트 리스너 설정
   */
  private setupEventListeners(): void {
    if (!this.context) return;

    // 파일 이벤트 리스너
    const fileEventListener = this.handleFileEvent.bind(this);
    this.context.events.on('file.*', fileEventListener);
    this.eventListeners.set('file.*', fileEventListener);

    // Git 이벤트 리스너
    const gitEventListener = this.handleGitEvent.bind(this);
    this.context.events.on('git.*', gitEventListener);
    this.eventListeners.set('git.*', gitEventListener);

    this.log('debug', 'Event listeners registered');
  }

  /**
   * 이벤트 리스너 제거
   */
  private removeEventListeners(): void {
    if (!this.context) return;

    for (const [event, listener] of this.eventListeners) {
      this.context.events.off(event, listener);
    }

    this.eventListeners.clear();
    this.log('debug', 'Event listeners removed');
  }

  /**
   * 파일 이벤트 처리
   */
  private handleFileEvent(event: any): void {
    this.log('debug', 'File event received', { 
      type: event.type, 
      path: event.data?.path 
    });

    // 파일 이벤트 처리 로직
    if (event.type === 'file.created') {
      this.onFileCreated(event);
    } else if (event.type === 'file.modified') {
      this.onFileModified(event);
    } else if (event.type === 'file.deleted') {
      this.onFileDeleted(event);
    }
  }

  /**
   * Git 이벤트 처리
   */
  private handleGitEvent(event: any): void {
    this.log('debug', 'Git event received', { 
      type: event.type, 
      data: event.data 
    });

    // Git 이벤트 처리 로직
    if (event.type === 'git.commit') {
      this.onGitCommit(event);
    } else if (event.type === 'git.branch.created') {
      this.onBranchCreated(event);
    }
  }

  /**
   * 파일 생성 이벤트 처리
   */
  private onFileCreated(event: any): void {
    const filePath = event.data?.path;
    if (!filePath) return;

    this.log('info', `New file created: ${filePath}`);

    // 사용자 정의 로직 추가
    // 예: 특정 파일 타입에 대한 처리
    if (filePath.endsWith('.ts') || filePath.endsWith('.js')) {
      this.analyzeCodeFile(filePath);
    }
  }

  /**
   * 파일 수정 이벤트 처리
   */
  private onFileModified(event: any): void {
    const filePath = event.data?.path;
    if (!filePath) return;

    this.log('info', `File modified: ${filePath}`);
    
    // 사용자 정의 로직 추가
  }

  /**
   * 파일 삭제 이벤트 처리
   */
  private onFileDeleted(event: any): void {
    const filePath = event.data?.path;
    if (!filePath) return;

    this.log('info', `File deleted: ${filePath}`);
  }

  /**
   * Git 커밋 이벤트 처리
   */
  private onGitCommit(event: any): void {
    const commitData = event.data;
    this.log('info', `New commit: ${commitData?.hash}`, commitData);

    // 커밋 분석 로직 추가
  }

  /**
   * 브랜치 생성 이벤트 처리
   */
  private onBranchCreated(event: any): void {
    const branchName = event.data?.name;
    this.log('info', `New branch created: ${branchName}`);
  }

  /**
   * 코드 파일 분석 (예시)
   */
  private async analyzeCodeFile(filePath: string): Promise<void> {
    try {
      if (!this.context?.fs) return;

      const content = await this.context.fs.readFile(filePath);
      const lineCount = content.split('\n').length;

      this.log('info', `Code file analysis: ${filePath}`, {
        lineCount,
        hasExports: content.includes('export'),
        hasImports: content.includes('import')
      });

      // 커스텀 이벤트 발생
      this.context.events.emit('plugin.analysis', {
        pluginId: this.metadata.id,
        type: 'code_analysis',
        file: filePath,
        metrics: {
          lines: lineCount,
          hasExports: content.includes('export'),
          hasImports: content.includes('import')
        }
      });

    } catch (error) {
      this.log('error', `Failed to analyze file: ${filePath}`, error);
    }
  }

  /**
   * 정기 작업 시작
   */
  private startPeriodicTasks(): void {
    // 예시: 5분마다 상태 리포트
    setInterval(() => {
      this.sendStatusReport();
    }, 5 * 60 * 1000);
  }

  /**
   * 정기 작업 중지
   */
  private stopPeriodicTasks(): void {
    // 실제 구현에서는 타이머를 저장하고 clearInterval 호출
  }

  /**
   * 상태 리포트 전송
   */
  private sendStatusReport(): void {
    if (!this.context || !this.isActive) return;

    this.log('debug', 'Sending status report');

    this.context.events.emit('plugin.status', {
      pluginId: this.metadata.id,
      status: 'active',
      config: this.config,
      timestamp: new Date()
    });
  }

  /**
   * 설정 검증
   */
  private validateConfig(config: BasicPluginConfig): boolean {
    if (typeof config.enabled !== 'boolean') {
      this.log('error', 'Invalid config: enabled must be boolean');
      return false;
    }

    const validLogLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLogLevels.includes(config.logLevel)) {
      this.log('error', 'Invalid config: logLevel must be one of', validLogLevels);
      return false;
    }

    return true;
  }

  /**
   * 로깅 헬퍼
   */
  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: any): void {
    if (!this.context?.logger) {
      return;
    }

    // 로그 레벨 체크
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.config.logLevel);
    const messageLevelIndex = levels.indexOf(level);

    if (messageLevelIndex < currentLevelIndex) {
      return;
    }

    this.context.logger[level](message, meta);
  }
}

// 기본 export
export default BasicPlugin;