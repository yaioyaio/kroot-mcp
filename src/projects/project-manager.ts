/**
 * DevFlow Monitor MCP - 프로젝트 관리자
 * 
 * 다중 프로젝트 관리, 설정, 메트릭 수집 및 분석을 담당하는 핵심 클래스입니다.
 */

import { EventEmitter } from 'events';
import { existsSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';

import {
  ProjectMetadata,
  ProjectStatus,
  ProjectType,
  ProjectPriority,
  ProjectOwner,
  ProjectSettings,
  ProjectMetrics,
  ProjectDependency,
  CrossProjectAnalysis,
  AnalysisType,
  SyncEvent,
  SyncStatus
} from './types.js';

import { EventEngine } from '../events/engine.js';
import { StorageManager } from '../storage/storage-manager.js';
import { Logger } from '../utils/logger.js';

/**
 * 프로젝트 관리자 설정
 */
export interface ProjectManagerConfig {
  /** 데이터베이스 파일 경로 */
  dbPath?: string;
  
  /** 자동 검색 활성화 여부 */
  autoDiscovery: boolean;
  
  /** 검색 대상 디렉토리들 */
  searchPaths: string[];
  
  /** 기본 프로젝트 설정 */
  defaultSettings: Partial<ProjectSettings>;
  
  /** 메트릭 수집 간격 (밀리초) */
  metricsInterval: number;
  
  /** 분석 실행 간격 (밀리초) */
  analysisInterval: number;
  
  /** 최대 동시 분석 작업 수 */
  maxConcurrentAnalysis: number;
}

/**
 * 프로젝트 이벤트
 */
export interface ProjectManagerEvents {
  'project:created': (project: ProjectMetadata) => void;
  'project:updated': (project: ProjectMetadata) => void;
  'project:deleted': (projectId: string) => void;
  'project:discovered': (project: ProjectMetadata) => void;
  'metrics:collected': (projectId: string, metrics: ProjectMetrics) => void;
  'analysis:completed': (analysis: CrossProjectAnalysis) => void;
  'sync:status': (projectId: string, status: SyncStatus) => void;
  'error': (error: Error) => void;
}

/**
 * 프로젝트 관리자 클래스
 */
export class ProjectManager extends EventEmitter {
  private db: Database.Database;
  private logger: Logger;
  private config: ProjectManagerConfig;
  private eventEngine: EventEngine;
  private storageManager: StorageManager;
  
  private metricsTimer?: NodeJS.Timeout | undefined;
  private analysisTimer?: NodeJS.Timeout | undefined;
  private runningAnalysis = new Set<string>();
  
  constructor(
    config: ProjectManagerConfig,
    eventEngine: EventEngine,
    storageManager: StorageManager
  ) {
    super();
    
    this.config = {
      dbPath: config.dbPath || ':memory:',
      autoDiscovery: config.autoDiscovery ?? true,
      searchPaths: config.searchPaths || [process.cwd()],
      defaultSettings: config.defaultSettings || {},
      metricsInterval: config.metricsInterval || 60000, // 1분
      analysisInterval: config.analysisInterval || 300000, // 5분
      maxConcurrentAnalysis: config.maxConcurrentAnalysis || 3,
      ...config
    };
    
    this.eventEngine = eventEngine;
    this.storageManager = storageManager;
    this.logger = new Logger('ProjectManager');
    
    // SQLite 데이터베이스 초기화
    this.db = new Database(this.config.dbPath);
    this.initializeDatabase();
    
    this.logger.info('프로젝트 관리자 초기화됨', {
      dbPath: this.config.dbPath,
      autoDiscovery: this.config.autoDiscovery,
      searchPathsCount: this.config.searchPaths.length
    });
  }

  /**
   * 데이터베이스 스키마 초기화
   */
  private initializeDatabase(): void {
    try {
      // 프로젝트 테이블
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          version TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          status TEXT NOT NULL,
          type TEXT NOT NULL,
          priority TEXT NOT NULL,
          tags TEXT, -- JSON array
          owner_data TEXT, -- JSON object
          settings_data TEXT, -- JSON object
          paths_data TEXT, -- JSON object
          repository_data TEXT -- JSON object
        );
      `);

      // 프로젝트 메트릭 테이블
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS project_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          code_metrics TEXT, -- JSON object
          activity_metrics TEXT, -- JSON object
          quality_metrics TEXT, -- JSON object
          performance_metrics TEXT, -- JSON object
          team_metrics TEXT, -- JSON object
          FOREIGN KEY (project_id) REFERENCES projects (id)
        );
      `);

      // 프로젝트 의존성 테이블
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS project_dependencies (
          id TEXT PRIMARY KEY,
          source_project_id TEXT NOT NULL,
          target_project_id TEXT NOT NULL,
          type TEXT NOT NULL,
          strength REAL NOT NULL,
          description TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (source_project_id) REFERENCES projects (id),
          FOREIGN KEY (target_project_id) REFERENCES projects (id)
        );
      `);

      // 크로스 프로젝트 분석 테이블
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS cross_project_analysis (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          projects TEXT NOT NULL, -- JSON array
          type TEXT NOT NULL,
          results_data TEXT, -- JSON object
          insights_data TEXT, -- JSON object
          recommendations_data TEXT -- JSON object
        );
      `);

      // 동기화 이벤트 테이블
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sync_events (
          sync_id TEXT PRIMARY KEY,
          local_id INTEGER NOT NULL,
          project_id TEXT NOT NULL,
          device_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          event_data TEXT, -- JSON object
          sync_status TEXT NOT NULL DEFAULT 'pending',
          sync_attempts INTEGER NOT NULL DEFAULT 0,
          last_sync_error TEXT,
          synced_at INTEGER,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects (id)
        );
      `);

      // 인덱스 생성
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (status);
        CREATE INDEX IF NOT EXISTS idx_projects_type ON projects (type);
        CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects (updated_at);
        CREATE INDEX IF NOT EXISTS idx_project_metrics_project_id ON project_metrics (project_id);
        CREATE INDEX IF NOT EXISTS idx_project_metrics_timestamp ON project_metrics (timestamp);
        CREATE INDEX IF NOT EXISTS idx_dependencies_source ON project_dependencies (source_project_id);
        CREATE INDEX IF NOT EXISTS idx_dependencies_target ON project_dependencies (target_project_id);
        CREATE INDEX IF NOT EXISTS idx_analysis_timestamp ON cross_project_analysis (timestamp);
        CREATE INDEX IF NOT EXISTS idx_sync_events_project_id ON sync_events (project_id);
        CREATE INDEX IF NOT EXISTS idx_sync_events_status ON sync_events (sync_status);
      `);

      this.logger.info('데이터베이스 초기화 완료');
    } catch (error) {
      this.logger.error('데이터베이스 초기화 실패:', error);
      throw error;
    }
  }

  /**
   * 관리자 시작
   */
  async start(): Promise<void> {
    try {
      // 자동 프로젝트 검색
      if (this.config.autoDiscovery) {
        await this.discoverProjects();
      }

      // 메트릭 수집 시작
      this.startMetricsCollection();

      // 분석 작업 시작
      this.startAnalysis();

      this.logger.info('프로젝트 관리자 시작됨');
    } catch (error) {
      this.logger.error('프로젝트 관리자 시작 실패:', error);
      throw error;
    }
  }

  /**
   * 관리자 중지
   */
  async stop(): Promise<void> {
    try {
      // 타이머 정리
      if (this.metricsTimer) {
        clearInterval(this.metricsTimer);
        this.metricsTimer = undefined;
      }

      if (this.analysisTimer) {
        clearInterval(this.analysisTimer);
        this.analysisTimer = undefined;
      }

      // 실행 중인 분석 대기
      await this.waitForRunningAnalysis();

      // 데이터베이스 연결 종료
      this.db.close();

      this.logger.info('프로젝트 관리자 중지됨');
    } catch (error) {
      this.logger.error('프로젝트 관리자 중지 실패:', error);
      throw error;
    }
  }

  /**
   * 프로젝트 생성
   */
  async createProject(projectData: Partial<ProjectMetadata>): Promise<ProjectMetadata> {
    try {
      const now = Date.now();
      const project: ProjectMetadata = {
        id: projectData.id || uuidv4(),
        name: projectData.name || 'Untitled Project',
        description: projectData.description,
        version: projectData.version || '1.0.0',
        createdAt: now,
        updatedAt: now,
        status: projectData.status || ProjectStatus.DEVELOPMENT,
        type: projectData.type || ProjectType.OTHER,
        priority: projectData.priority || ProjectPriority.MEDIUM,
        tags: projectData.tags || [],
        owner: projectData.owner || this.getDefaultOwner(),
        settings: { ...this.config.defaultSettings, ...projectData.settings } as ProjectSettings,
        paths: projectData.paths || { root: process.cwd(), source: [], test: [], docs: [], build: [], config: [] },
        repository: projectData.repository
      };

      // 데이터베이스에 저장
      const stmt = this.db.prepare(`
        INSERT INTO projects (
          id, name, description, version, created_at, updated_at,
          status, type, priority, tags, owner_data, settings_data,
          paths_data, repository_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        project.id,
        project.name,
        project.description,
        project.version,
        project.createdAt,
        project.updatedAt,
        project.status,
        project.type,
        project.priority,
        JSON.stringify(project.tags),
        JSON.stringify(project.owner),
        JSON.stringify(project.settings),
        JSON.stringify(project.paths),
        project.repository ? JSON.stringify(project.repository) : null
      );

      this.emit('project:created', project);
      this.logger.info('프로젝트 생성됨:', { id: project.id, name: project.name });

      return project;
    } catch (error) {
      this.logger.error('프로젝트 생성 실패:', error);
      throw error;
    }
  }

  /**
   * 프로젝트 조회
   */
  getProject(projectId: string): ProjectMetadata | null {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM projects WHERE id = ?
      `);
      
      const row = stmt.get(projectId) as any;
      if (!row) return null;

      return this.mapRowToProject(row);
    } catch (error) {
      this.logger.error('프로젝트 조회 실패:', error);
      return null;
    }
  }

  /**
   * 모든 프로젝트 조회
   */
  getAllProjects(): ProjectMetadata[] {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM projects ORDER BY updated_at DESC
      `);
      
      const rows = stmt.all() as any[];
      return rows.map(row => this.mapRowToProject(row));
    } catch (error) {
      this.logger.error('프로젝트 목록 조회 실패:', error);
      return [];
    }
  }

  /**
   * 프로젝트 필터링 조회
   */
  getProjectsByFilter(filter: {
    status?: ProjectStatus;
    type?: ProjectType;
    priority?: ProjectPriority;
    tags?: string[];
    ownerId?: string;
  }): ProjectMetadata[] {
    try {
      let query = 'SELECT * FROM projects WHERE 1=1';
      const params: any[] = [];

      if (filter.status) {
        query += ' AND status = ?';
        params.push(filter.status);
      }

      if (filter.type) {
        query += ' AND type = ?';
        params.push(filter.type);
      }

      if (filter.priority) {
        query += ' AND priority = ?';
        params.push(filter.priority);
      }

      if (filter.ownerId) {
        query += ' AND JSON_EXTRACT(owner_data, "$.userId") = ?';
        params.push(filter.ownerId);
      }

      query += ' ORDER BY updated_at DESC';

      const stmt = this.db.prepare(query);
      const rows = stmt.all(...params) as any[];
      
      let projects = rows.map(row => this.mapRowToProject(row));

      // 태그 필터링 (클라이언트 사이드)
      if (filter.tags && filter.tags.length > 0) {
        projects = projects.filter(project => 
          filter.tags!.some(tag => project.tags.includes(tag))
        );
      }

      return projects;
    } catch (error) {
      this.logger.error('프로젝트 필터링 조회 실패:', error);
      return [];
    }
  }

  /**
   * 프로젝트 업데이트
   */
  async updateProject(projectId: string, updates: Partial<ProjectMetadata>): Promise<ProjectMetadata | null> {
    try {
      const existing = this.getProject(projectId);
      if (!existing) {
        throw new Error(`프로젝트를 찾을 수 없습니다: ${projectId}`);
      }

      const updated: ProjectMetadata = {
        ...existing,
        ...updates,
        id: projectId, // ID는 변경 불가
        updatedAt: Date.now()
      };

      const stmt = this.db.prepare(`
        UPDATE projects SET
          name = ?, description = ?, version = ?, updated_at = ?,
          status = ?, type = ?, priority = ?, tags = ?,
          owner_data = ?, settings_data = ?, paths_data = ?, repository_data = ?
        WHERE id = ?
      `);

      stmt.run(
        updated.name,
        updated.description,
        updated.version,
        updated.updatedAt,
        updated.status,
        updated.type,
        updated.priority,
        JSON.stringify(updated.tags),
        JSON.stringify(updated.owner),
        JSON.stringify(updated.settings),
        JSON.stringify(updated.paths),
        updated.repository ? JSON.stringify(updated.repository) : null,
        projectId
      );

      this.emit('project:updated', updated);
      this.logger.info('프로젝트 업데이트됨:', { id: projectId, name: updated.name });

      return updated;
    } catch (error) {
      this.logger.error('프로젝트 업데이트 실패:', error);
      throw error;
    }
  }

  /**
   * 프로젝트 삭제
   */
  async deleteProject(projectId: string): Promise<boolean> {
    try {
      const existing = this.getProject(projectId);
      if (!existing) {
        return false;
      }

      // 관련 데이터 삭제
      this.db.transaction(() => {
        this.db.prepare('DELETE FROM sync_events WHERE project_id = ?').run(projectId);
        this.db.prepare('DELETE FROM project_metrics WHERE project_id = ?').run(projectId);
        this.db.prepare('DELETE FROM project_dependencies WHERE source_project_id = ? OR target_project_id = ?').run(projectId, projectId);
        this.db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
      })();

      this.emit('project:deleted', projectId);
      this.logger.info('프로젝트 삭제됨:', { id: projectId, name: existing.name });

      return true;
    } catch (error) {
      this.logger.error('프로젝트 삭제 실패:', error);
      throw error;
    }
  }

  /**
   * 프로젝트 자동 검색
   */
  async discoverProjects(): Promise<ProjectMetadata[]> {
    const discovered: ProjectMetadata[] = [];

    try {
      for (const searchPath of this.config.searchPaths) {
        const projects = await this.scanDirectory(searchPath);
        discovered.push(...projects);
      }

      this.logger.info('프로젝트 자동 검색 완료:', { count: discovered.length });
      return discovered;
    } catch (error) {
      this.logger.error('프로젝트 자동 검색 실패:', error);
      return discovered;
    }
  }

  /**
   * 디렉토리 스캔
   */
  private async scanDirectory(dirPath: string): Promise<ProjectMetadata[]> {
    const projects: ProjectMetadata[] = [];

    try {
      if (!existsSync(dirPath)) {
        return projects;
      }

      const resolvedPath = resolve(dirPath);
      
      // 프로젝트 식별자 파일들 검사
      const projectIndicators = [
        'package.json',
        'pom.xml',
        'Cargo.toml',
        'go.mod',
        'requirements.txt',
        'composer.json',
        '.git',
        'README.md'
      ];

      const hasProjectIndicator = projectIndicators.some(indicator => 
        existsSync(join(resolvedPath, indicator))
      );

      if (hasProjectIndicator) {
        const project = await this.createProjectFromDirectory(resolvedPath);
        if (project) {
          projects.push(project);
          this.emit('project:discovered', project);
        }
      }

    } catch (error) {
      this.logger.error('디렉토리 스캔 실패:', { path: dirPath, error });
    }

    return projects;
  }

  /**
   * 디렉토리에서 프로젝트 생성
   */
  private async createProjectFromDirectory(dirPath: string): Promise<ProjectMetadata | null> {
    try {
      const stats = statSync(dirPath);
      const projectName = dirPath.split('/').pop() || 'Unknown Project';
      
      // 기존 프로젝트인지 확인 (경로 기반)
      const existing = this.getAllProjects().find(p => p.paths.root === dirPath);
      if (existing) {
        this.logger.debug('기존 프로젝트 발견:', { path: dirPath, id: existing.id });
        return existing;
      }

      const project = await this.createProject({
        name: projectName,
        description: `Auto-discovered project at ${dirPath}`,
        paths: {
          root: dirPath,
          source: ['src', 'lib', 'app'].filter(p => existsSync(join(dirPath, p))),
          test: ['test', 'tests', '__tests__', 'spec'].filter(p => existsSync(join(dirPath, p))),
          docs: ['docs', 'documentation', 'doc'].filter(p => existsSync(join(dirPath, p))),
          build: ['build', 'dist', 'target', 'out'].filter(p => existsSync(join(dirPath, p))),
          config: ['.', 'config', 'conf'].filter(p => existsSync(join(dirPath, p)))
        },
        type: this.detectProjectType(dirPath),
        status: ProjectStatus.DEVELOPMENT,
        repository: this.detectRepositoryInfo(dirPath)
      });

      return project;
    } catch (error) {
      this.logger.error('디렉토리에서 프로젝트 생성 실패:', { path: dirPath, error });
      return null;
    }
  }

  /**
   * 프로젝트 타입 감지
   */
  private detectProjectType(dirPath: string): ProjectType {
    if (existsSync(join(dirPath, 'package.json'))) {
      const packageJson = require(join(dirPath, 'package.json'));
      if (packageJson.dependencies?.react || packageJson.dependencies?.vue || packageJson.dependencies?.angular) {
        return ProjectType.WEB_APPLICATION;
      }
      if (packageJson.dependencies?.['react-native'] || packageJson.dependencies?.['@ionic/react']) {
        return ProjectType.MOBILE_APPLICATION;
      }
      if (packageJson.dependencies?.express || packageJson.dependencies?.fastify || packageJson.dependencies?.koa) {
        return ProjectType.API_SERVICE;
      }
      if (packageJson.bin) {
        return ProjectType.CLI_TOOL;
      }
      return ProjectType.LIBRARY;
    }

    if (existsSync(join(dirPath, 'pom.xml'))) {
      return ProjectType.API_SERVICE;
    }

    if (existsSync(join(dirPath, 'Cargo.toml'))) {
      return ProjectType.CLI_TOOL;
    }

    if (existsSync(join(dirPath, 'go.mod'))) {
      return ProjectType.API_SERVICE;
    }

    if (existsSync(join(dirPath, 'requirements.txt')) || existsSync(join(dirPath, 'setup.py'))) {
      return ProjectType.DATA_PIPELINE;
    }

    if (existsSync(join(dirPath, 'Dockerfile')) || existsSync(join(dirPath, 'docker-compose.yml'))) {
      return ProjectType.INFRASTRUCTURE;
    }

    return ProjectType.OTHER;
  }

  /**
   * 레포지토리 정보 감지
   */
  private detectRepositoryInfo(dirPath: string): any {
    if (existsSync(join(dirPath, '.git'))) {
      // Git 정보 감지 로직 (간단화)
      return {
        type: 'git',
        remoteUrl: '', // git config에서 읽어올 수 있음
        defaultBranch: 'main',
        currentBranch: 'main',
        lastCommit: '',
        lastCommitTime: Date.now(),
        status: {
          modifiedFiles: 0,
          stagedFiles: 0,
          addedFiles: 0,
          deletedFiles: 0,
          untrackedFiles: 0,
          ahead: 0,
          behind: 0
        }
      };
    }
    return undefined;
  }

  /**
   * 기본 소유자 정보 생성
   */
  private getDefaultOwner(): ProjectOwner {
    return {
      userId: 'local-user',
      name: process.env.USER || process.env.USERNAME || 'Unknown User',
      email: 'user@localhost',
      role: 'owner' as any
    };
  }

  /**
   * 데이터베이스 행을 프로젝트 객체로 변환
   */
  private mapRowToProject(row: any): ProjectMetadata {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      status: row.status,
      type: row.type,
      priority: row.priority,
      tags: JSON.parse(row.tags || '[]'),
      owner: JSON.parse(row.owner_data),
      settings: JSON.parse(row.settings_data),
      paths: JSON.parse(row.paths_data),
      repository: row.repository_data ? JSON.parse(row.repository_data) : undefined
    };
  }

  /**
   * 메트릭 수집 시작
   */
  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(async () => {
      try {
        const projects = this.getAllProjects().filter(p => p.status === ProjectStatus.ACTIVE);
        
        for (const project of projects) {
          await this.collectProjectMetrics(project.id);
        }
      } catch (error) {
        this.logger.error('메트릭 수집 중 오류:', error);
      }
    }, this.config.metricsInterval);

    this.logger.info('메트릭 수집 시작됨', { interval: this.config.metricsInterval });
  }

  /**
   * 프로젝트 메트릭 수집
   */
  async collectProjectMetrics(projectId: string): Promise<ProjectMetrics | null> {
    try {
      const project = this.getProject(projectId);
      if (!project) return null;

      // 실제 메트릭 수집 로직 (간단화된 버전)
      const metrics: ProjectMetrics = {
        projectId,
        timestamp: Date.now(),
        code: {
          totalLines: 0,
          codeLines: 0,
          commentLines: 0,
          blankLines: 0,
          fileCount: 0,
          functionCount: 0,
          classCount: 0,
          complexity: 0,
          duplication: 0
        },
        activity: {
          commits: 0,
          activeTime: 0,
          fileChanges: 0,
          linesAdded: 0,
          linesDeleted: 0,
          builds: 0,
          testRuns: 0
        },
        quality: {
          testCoverage: 0,
          testSuccessRate: 0,
          codeQuality: 0,
          bugCount: 0,
          vulnerabilities: 0,
          technicalDebt: 0
        },
        performance: {
          buildTime: 0,
          testTime: 0,
          cicdTime: 0,
          memoryUsage: 0,
          cpuUsage: 0
        },
        team: {
          activeDevelopers: 1,
          avgCommitSize: 0,
          codeReviewRate: 0,
          collaborationScore: 0
        }
      };

      // 데이터베이스에 저장
      const stmt = this.db.prepare(`
        INSERT INTO project_metrics (
          project_id, timestamp, code_metrics, activity_metrics,
          quality_metrics, performance_metrics, team_metrics
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        projectId,
        metrics.timestamp,
        JSON.stringify(metrics.code),
        JSON.stringify(metrics.activity),
        JSON.stringify(metrics.quality),
        JSON.stringify(metrics.performance),
        JSON.stringify(metrics.team)
      );

      this.emit('metrics:collected', projectId, metrics);
      return metrics;
    } catch (error) {
      this.logger.error('프로젝트 메트릭 수집 실패:', error);
      return null;
    }
  }

  /**
   * 분석 작업 시작
   */
  private startAnalysis(): void {
    this.analysisTimer = setInterval(async () => {
      try {
        if (this.runningAnalysis.size < this.config.maxConcurrentAnalysis) {
          await this.runCrossProjectAnalysis();
        }
      } catch (error) {
        this.logger.error('분석 작업 중 오류:', error);
      }
    }, this.config.analysisInterval);

    this.logger.info('분석 작업 시작됨', { interval: this.config.analysisInterval });
  }

  /**
   * 크로스 프로젝트 분석 실행
   */
  private async runCrossProjectAnalysis(): Promise<void> {
    const analysisId = uuidv4();
    this.runningAnalysis.add(analysisId);

    try {
      const projects = this.getAllProjects().filter(p => p.status === ProjectStatus.ACTIVE);
      if (projects.length < 2) return;

      const analysis: CrossProjectAnalysis = {
        id: analysisId,
        timestamp: Date.now(),
        projects: projects.map(p => p.id),
        type: AnalysisType.SIMILARITY,
        results: [],
        insights: [],
        recommendations: []
      };

      // 분석 로직 실행 (간단화된 버전)
      // 실제로는 복잡한 프로젝트 간 유사성, 의존성, 성능 비교 등을 수행

      // 데이터베이스에 저장
      const stmt = this.db.prepare(`
        INSERT INTO cross_project_analysis (
          id, timestamp, projects, type, results_data, insights_data, recommendations_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        analysis.id,
        analysis.timestamp,
        JSON.stringify(analysis.projects),
        analysis.type,
        JSON.stringify(analysis.results),
        JSON.stringify(analysis.insights),
        JSON.stringify(analysis.recommendations)
      );

      this.emit('analysis:completed', analysis);
      this.logger.info('크로스 프로젝트 분석 완료:', { id: analysisId, projectsCount: projects.length });
    } catch (error) {
      this.logger.error('크로스 프로젝트 분석 실패:', error);
    } finally {
      this.runningAnalysis.delete(analysisId);
    }
  }

  /**
   * 실행 중인 분석 대기
   */
  private async waitForRunningAnalysis(): Promise<void> {
    while (this.runningAnalysis.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * 프로젝트 통계 조회
   */
  getProjectStats(): {
    total: number;
    byStatus: Record<ProjectStatus, number>;
    byType: Record<ProjectType, number>;
    byPriority: Record<ProjectPriority, number>;
  } {
    try {
      const projects = this.getAllProjects();
      
      const byStatus = {} as Record<ProjectStatus, number>;
      const byType = {} as Record<ProjectType, number>;
      const byPriority = {} as Record<ProjectPriority, number>;

      // 초기화
      Object.values(ProjectStatus).forEach(status => byStatus[status] = 0);
      Object.values(ProjectType).forEach(type => byType[type] = 0);
      Object.values(ProjectPriority).forEach(priority => byPriority[priority] = 0);

      // 집계
      projects.forEach(project => {
        byStatus[project.status]++;
        byType[project.type]++;
        byPriority[project.priority]++;
      });

      return {
        total: projects.length,
        byStatus,
        byType,
        byPriority
      };
    } catch (error) {
      this.logger.error('프로젝트 통계 조회 실패:', error);
      return {
        total: 0,
        byStatus: {} as Record<ProjectStatus, number>,
        byType: {} as Record<ProjectType, number>,
        byPriority: {} as Record<ProjectPriority, number>
      };
    }
  }
}

export default ProjectManager;