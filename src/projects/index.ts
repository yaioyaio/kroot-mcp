/**
 * DevFlow Monitor MCP - 다중 프로젝트 지원 시스템
 * 
 * 여러 프로젝트를 동시에 모니터링하고 관리하는 종합 시스템입니다.
 */

// 타입 정의
export * from './types.js';

// 프로젝트 관리자
export { ProjectManager } from './project-manager.js';
export type { ProjectManagerConfig } from './project-manager.js';

// 동기화 클라이언트
export { SyncClient } from './sync-client.js';
export type { 
  SyncConfig, 
  SyncResult, 
  SyncError, 
  SyncClientStatus 
} from './sync-client.js';

// 크로스 프로젝트 분석기
export { CrossProjectAnalyzer } from './cross-analyzer.js';
export type { 
  CrossAnalyzerConfig, 
  AnalysisContext 
} from './cross-analyzer.js';

// 유틸리티 함수들
import { ProjectManager, ProjectManagerConfig } from './project-manager.js';
import { SyncClient, SyncConfig } from './sync-client.js';
import { CrossProjectAnalyzer, CrossAnalyzerConfig } from './cross-analyzer.js';
import { EventEngine } from '../events/engine.js';
import { StorageManager } from '../storage/storage-manager.js';
import Database from 'better-sqlite3';
import { Logger } from '../utils/logger.js';

/**
 * 다중 프로젝트 시스템 설정
 */
export interface MultiProjectSystemConfig {
  /** 프로젝트 관리자 설정 */
  projectManager: ProjectManagerConfig;
  
  /** 동기화 클라이언트 설정 (선택적) */
  syncClient?: SyncConfig;
  
  /** 크로스 분석기 설정 */
  crossAnalyzer?: Partial<CrossAnalyzerConfig>;
  
  /** 데이터베이스 경로 */
  dbPath?: string;
  
  /** 로그 레벨 */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * 다중 프로젝트 시스템
 * 
 * 프로젝트 관리, 동기화, 분석을 통합 관리하는 메인 클래스입니다.
 */
export class MultiProjectSystem {
  private projectManager: ProjectManager;
  private syncClient?: SyncClient;
  private crossAnalyzer: CrossProjectAnalyzer;
  private db: Database.Database;
  private logger: Logger;
  
  private isRunning = false;

  constructor(
    config: MultiProjectSystemConfig,
    eventEngine: EventEngine,
    storageManager: StorageManager
  ) {
    this.logger = new Logger('MultiProjectSystem');
    
    // 데이터베이스 초기화
    this.db = new Database(config.dbPath || ':memory:');
    
    // 프로젝트 관리자 초기화
    this.projectManager = new ProjectManager(
      config.projectManager,
      eventEngine,
      storageManager
    );
    
    // 동기화 클라이언트 초기화 (선택적)
    if (config.syncClient) {
      this.syncClient = new SyncClient(config.syncClient, this.db);
    }
    
    // 크로스 분석기 초기화
    this.crossAnalyzer = new CrossProjectAnalyzer(config.crossAnalyzer);
    
    // 이벤트 리스너 설정
    this.setupEventListeners();
    
    this.logger.info('다중 프로젝트 시스템 초기화됨', {
      hasSyncClient: !!this.syncClient,
      dbPath: config.dbPath
    });
  }

  /**
   * 이벤트 리스너 설정
   */
  private setupEventListeners(): void {
    // 프로젝트 관리자 이벤트
    this.projectManager.on('project:created', (project) => {
      this.logger.info('프로젝트 생성됨:', { id: project.id, name: project.name });
    });

    this.projectManager.on('project:updated', (project) => {
      this.logger.debug('프로젝트 업데이트됨:', { id: project.id, name: project.name });
    });

    this.projectManager.on('metrics:collected', (projectId, metrics) => {
      this.logger.debug('메트릭 수집됨:', { projectId, timestamp: metrics.timestamp });
    });

    this.projectManager.on('analysis:completed', (analysis) => {
      this.logger.info('크로스 프로젝트 분석 완료:', {
        id: analysis.id,
        type: analysis.type,
        projectsCount: analysis.projects.length
      });
    });

    // 동기화 클라이언트 이벤트
    if (this.syncClient) {
      this.syncClient.on('sync:completed', (result) => {
        this.logger.info('동기화 완료:', {
          success: result.success,
          syncedCount: result.syncedIds.length,
          duration: result.duration
        });
      });

      this.syncClient.on('sync:failed', (error) => {
        this.logger.error('동기화 실패:', { error: error.message, type: error.type });
      });

      this.syncClient.on('connection:lost', () => {
        this.logger.warn('서버 연결 끊어짐');
      });

      this.syncClient.on('connection:established', () => {
        this.logger.info('서버 연결 복구됨');
      });
    }

    // 오류 이벤트 처리
    this.projectManager.on('error', (error) => {
      this.logger.error('프로젝트 관리자 오류:', error);
    });

    if (this.syncClient) {
      this.syncClient.on('error', (error) => {
        this.logger.error('동기화 클라이언트 오류:', error);
      });
    }
  }

  /**
   * 시스템 시작
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('시스템이 이미 실행 중입니다');
    }

    try {
      this.logger.info('다중 프로젝트 시스템 시작 중...');

      // 프로젝트 관리자 시작
      await this.projectManager.start();

      // 동기화 클라이언트 시작 (있는 경우)
      if (this.syncClient) {
        await this.syncClient.start();
      }

      this.isRunning = true;
      this.logger.info('다중 프로젝트 시스템 시작 완료');

    } catch (error) {
      this.logger.error('시스템 시작 실패:', error);
      throw error;
    }
  }

  /**
   * 시스템 중지
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      this.logger.info('다중 프로젝트 시스템 중지 중...');

      // 동기화 클라이언트 중지
      if (this.syncClient) {
        await this.syncClient.stop();
      }

      // 프로젝트 관리자 중지
      await this.projectManager.stop();

      this.isRunning = false;
      this.logger.info('다중 프로젝트 시스템 중지 완료');

    } catch (error) {
      this.logger.error('시스템 중지 실패:', error);
      throw error;
    }
  }

  /**
   * 프로젝트 관리자 접근
   */
  getProjectManager(): ProjectManager {
    return this.projectManager;
  }

  /**
   * 동기화 클라이언트 접근
   */
  getSyncClient(): SyncClient | undefined {
    return this.syncClient;
  }

  /**
   * 크로스 분석기 접근
   */
  getCrossAnalyzer(): CrossProjectAnalyzer {
    return this.crossAnalyzer;
  }

  /**
   * 시스템 상태 조회
   */
  getSystemStatus(): {
    running: boolean;
    projectsCount: number;
    activeProjects: number;
    syncEnabled: boolean;
    syncStatus?: any;
    runningAnalysis: number;
  } {
    const stats = this.projectManager.getProjectStats();
    
    return {
      running: this.isRunning,
      projectsCount: stats.total,
      activeProjects: stats.byStatus['active'] || 0,
      syncEnabled: !!this.syncClient,
      syncStatus: this.syncClient?.getSyncStatus(),
      runningAnalysis: this.crossAnalyzer.getRunningAnalysis().length
    };
  }

  /**
   * 프로젝트 검색 및 필터링
   */
  async searchProjects(query: {
    name?: string;
    type?: string;
    status?: string;
    tags?: string[];
    ownerId?: string;
  }): Promise<import('./types.js').ProjectMetadata[]> {
    
    const allProjects = this.projectManager.getAllProjects();
    
    return allProjects.filter(project => {
      if (query.name && !project.name.toLowerCase().includes(query.name.toLowerCase())) {
        return false;
      }
      
      if (query.type && project.type !== query.type) {
        return false;
      }
      
      if (query.status && project.status !== query.status) {
        return false;
      }
      
      if (query.ownerId && project.owner.userId !== query.ownerId) {
        return false;
      }
      
      if (query.tags && query.tags.length > 0) {
        const hasMatchingTag = query.tags.some(tag => 
          project.tags.some(projectTag => 
            projectTag.toLowerCase().includes(tag.toLowerCase())
          )
        );
        if (!hasMatchingTag) {
          return false;
        }
      }
      
      return true;
    });
  }

  /**
   * 프로젝트 메트릭 수집 트리거
   */
  async collectMetrics(projectId?: string): Promise<void> {
    if (projectId) {
      await this.projectManager.collectProjectMetrics(projectId);
    } else {
      // 모든 활성 프로젝트의 메트릭 수집
      const activeProjects = this.projectManager.getProjectsByFilter({
        status: 'active' as any
      });
      
      for (const project of activeProjects) {
        await this.projectManager.collectProjectMetrics(project.id);
      }
    }
  }

  /**
   * 크로스 프로젝트 분석 실행
   */
  async runCrossAnalysis(
    projectIds?: string[],
    analysisType: import('./types.js').AnalysisType = 'similarity' as any
  ): Promise<import('./types.js').CrossProjectAnalysis> {
    
    let targetProjects: import('./types.js').ProjectMetadata[];
    
    if (projectIds) {
      targetProjects = projectIds
        .map(id => this.projectManager.getProject(id))
        .filter(p => p !== null) as import('./types.js').ProjectMetadata[];
    } else {
      targetProjects = this.projectManager.getProjectsByFilter({
        status: 'active' as any
      });
    }

    if (targetProjects.length < 2) {
      throw new Error('분석을 위해서는 최소 2개 이상의 프로젝트가 필요합니다');
    }

    // 프로젝트 메트릭 수집 (간단화된 버전)
    const metricsMap = new Map<string, import('./types.js').ProjectMetrics[]>();
    
    // 실제로는 데이터베이스에서 메트릭을 조회해야 함
    // 여기서는 빈 배열로 초기화
    targetProjects.forEach(project => {
      metricsMap.set(project.id, []);
    });

    return this.crossAnalyzer.analyze(targetProjects, metricsMap, analysisType);
  }

  /**
   * 수동 동기화 트리거
   */
  async triggerSync(force = false): Promise<any> {
    if (!this.syncClient) {
      throw new Error('동기화 클라이언트가 설정되지 않았습니다');
    }
    
    return this.syncClient.triggerSync(force);
  }

  /**
   * 동기화 설정 업데이트
   */
  async updateSyncConfig(config: Partial<SyncConfig>): Promise<void> {
    if (!this.syncClient) {
      throw new Error('동기화 클라이언트가 설정되지 않았습니다');
    }
    
    await this.syncClient.updateConfig(config);
  }

  /**
   * 시스템 통계 조회
   */
  getSystemStats(): {
    projects: ReturnType<ProjectManager['getProjectStats']>;
    sync?: any;
    analysis: {
      running: number;
      total: number;
    };
    uptime: number;
  } {
    return {
      projects: this.projectManager.getProjectStats(),
      sync: this.syncClient?.getSyncStatus(),
      analysis: {
        running: this.crossAnalyzer.getRunningAnalysis().length,
        total: 0 // 실제로는 완료된 분석 수를 추적해야 함
      },
      uptime: process.uptime()
    };
  }
}

/**
 * 다중 프로젝트 시스템 생성 팩토리 함수
 */
export function createMultiProjectSystem(
  config: MultiProjectSystemConfig,
  eventEngine: EventEngine,
  storageManager: StorageManager
): MultiProjectSystem {
  return new MultiProjectSystem(config, eventEngine, storageManager);
}

/**
 * 기본 설정 생성 헬퍼
 */
export function createDefaultConfig(overrides: Partial<MultiProjectSystemConfig> = {}): MultiProjectSystemConfig {
  return {
    projectManager: {
      autoDiscovery: true,
      searchPaths: [process.cwd()],
      defaultSettings: {
        monitoringEnabled: true,
        autoAnalysisEnabled: true,
        notifications: {
          enabled: true,
          channels: [],
          rules: []
        },
        sync: {
          enabled: false,
          interval: 300,
          batchSize: 100,
          autoSync: false,
          conflictResolution: 'last_write_wins' as any,
          offlineQueue: {
            enabled: true,
            maxSize: 1000,
            retention: 7
          }
        },
        reporting: {
          autoGenerate: false,
          templates: [],
          schedules: [],
          formats: ['json']
        },
        filters: {
          files: {
            includeExtensions: ['.ts', '.js', '.jsx', '.tsx', '.py', '.java', '.go', '.rs'],
            excludeExtensions: ['.log', '.tmp', '.cache'],
            includePaths: ['src/', 'lib/', 'app/'],
            excludePaths: ['node_modules/', '.git/', 'dist/', 'build/'],
            maxFileSize: 1024 * 1024 // 1MB
          },
          events: {
            includeTypes: [],
            excludeTypes: [],
            minSeverity: 'info' as any
          },
          analysis: {
            timeWindow: 30,
            minConfidence: 0.7,
            patterns: []
          }
        },
        custom: {}
      },
      metricsInterval: 60000,
      analysisInterval: 300000,
      maxConcurrentAnalysis: 2
    },
    crossAnalyzer: {
      minConfidence: 0.7,
      timeWindow: 30,
      maxConcurrentAnalysis: 3,
      similarityWeights: {
        techStack: 0.3,
        codeStyle: 0.2,
        projectStructure: 0.2,
        dependencies: 0.2,
        teamMembers: 0.1
      },
      performanceThresholds: {
        buildTime: 300,
        testTime: 120,
        codeQuality: 80,
        testCoverage: 80
      }
    },
    dbPath: ':memory:',
    logLevel: 'info',
    ...overrides
  };
}