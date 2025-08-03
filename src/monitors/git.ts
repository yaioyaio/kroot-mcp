import { simpleGit, SimpleGit } from 'simple-git';
import { BaseMonitor } from './base.js';
import { EventEngine } from '../events/index.js';
import { EventCategory, EventSeverity, BaseEvent } from '../events/types/base.js';
import * as fs from 'fs';
import * as path from 'path';

export interface GitMonitorConfig {
  name: string;
  enabled: boolean;
  repositoryPath: string;
  pollInterval: number; // milliseconds
  trackBranches: boolean;
  trackCommits: boolean;
  trackMerges: boolean;
  analyzeCommitMessages: boolean;
}

export interface GitCommitInfo {
  hash: string;
  date: string;
  message: string;
  author_name: string;
  author_email: string;
  refs: string;
  diff?: {
    insertions: number;
    deletions: number;
    files: number;
  };
}

export interface GitBranchInfo {
  name: string;
  current: boolean;
  commit: string;
  label?: string;
}

export class GitMonitor extends BaseMonitor {
  private git: SimpleGit;
  private config: GitMonitorConfig;
  private eventEngine: EventEngine;
  private pollTimer?: NodeJS.Timeout | undefined;
  private lastCommitHash?: string;
  private lastBranchState: Map<string, string> = new Map();

  constructor(eventEngine: EventEngine, config: Partial<GitMonitorConfig> = {}) {
    super({ name: 'GitMonitor' });
    
    this.eventEngine = eventEngine;
    
    this.config = {
      name: 'GitMonitor',
      enabled: true,
      repositoryPath: process.cwd(),
      pollInterval: 5000, // 5 seconds
      trackBranches: true,
      trackCommits: true,
      trackMerges: true,
      analyzeCommitMessages: true,
      ...config
    };

    this.git = simpleGit(this.config.repositoryPath);
  }

  protected async onStart(): Promise<void> {

    try {
      // 리포지토리 유효성 검사
      await this.validateRepository();
      
      // 초기 상태 캐시
      await this.cacheInitialState();
      
      // 폴링 시작
      this.startPolling();
      
      // 시작 이벤트 발행
      await this.eventEngine.publish({
        id: this.generateEventId(),
        type: 'git:monitor_started',
        category: EventCategory.GIT,
        timestamp: new Date(),
        severity: EventSeverity.INFO,
        source: this.name,
        data: {
          repositoryPath: this.config.repositoryPath,
          config: this.config
        }
      });
      
    } catch (error) {
      this.logError('Failed to start GitMonitor:', error);
      throw error;
    }
  }

  protected async onStop(): Promise<void> {
    
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined as undefined;
    }

    this.logInfo('GitMonitor stopped');
    
    // 정지 이벤트 발행
    await this.eventEngine.publish({
      id: this.generateEventId(),
      type: 'git:monitor_stopped',
      category: EventCategory.GIT,
      timestamp: new Date(),
      severity: EventSeverity.INFO,
      source: this.name,
      data: {
        repositoryPath: this.config.repositoryPath
      }
    });
  }

  getConfig(): GitMonitorConfig {
    return { ...this.config };
  }

  private async validateRepository(): Promise<void> {
    try {
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        throw new Error(`Directory ${this.config.repositoryPath} is not a Git repository`);
      }

      // .git 디렉토리 존재 확인
      const gitDir = path.join(this.config.repositoryPath, '.git');
      if (!fs.existsSync(gitDir)) {
        throw new Error(`Git directory not found: ${gitDir}`);
      }

    } catch (error) {
      throw new Error(`Invalid Git repository: ${error}`);
    }
  }

  private async cacheInitialState(): Promise<void> {
    try {
      // 현재 커밋 해시 캐시
      const log = await this.git.log({ maxCount: 1 });
      if (log.latest) {
        this.lastCommitHash = log.latest.hash;
      }

      // 브랜치 상태 캐시
      if (this.config.trackBranches) {
        const branches = await this.git.branch();
        for (const [branchName, branchInfo] of Object.entries(branches.branches)) {
          this.lastBranchState.set(branchName, branchInfo.commit);
        }
      }

    } catch (error) {
      this.logWarn('Failed to cache initial Git state:', error);
    }
  }

  private startPolling(): void {
    this.pollTimer = setInterval(async () => {
      try {
        await this.checkForChanges();
      } catch (error) {
        this.logError('Error during Git polling:', error);
      }
    }, this.config.pollInterval);
  }

  private async checkForChanges(): Promise<void> {
    if (this.config.trackCommits) {
      await this.checkForNewCommits();
    }

    if (this.config.trackBranches) {
      await this.checkForBranchChanges();
    }
  }

  private async checkForNewCommits(): Promise<void> {
    try {
      const log = await this.git.log({ maxCount: 10 });
      
      if (!log.latest) {
        return;
      }

      const latestHash = log.latest.hash;
      
      // 새 커밋이 있는지 확인
      if (this.lastCommitHash && latestHash !== this.lastCommitHash) {
        // 새 커밋들 처리
        const newCommits = log.all.filter(commit => 
          commit.hash !== this.lastCommitHash
        );

        for (const commit of newCommits.reverse()) {
          await this.processNewCommit(commit);
        }
      }

      this.lastCommitHash = latestHash;

    } catch (error) {
      this.logError('Error checking for new commits:', error);
    }
  }

  private async processNewCommit(commit: any): Promise<void> {
    try {
      // 커밋 통계 가져오기
      const diffStat = await this.git.diffSummary(`${commit.hash}~1`, commit.hash);
      
      const commitEvent: BaseEvent = {
        id: this.generateEventId(),
        type: 'git:commit',
        category: EventCategory.GIT,
        timestamp: new Date(),
        severity: EventSeverity.INFO,
        source: this.name,
        data: {
          action: 'commit',
          hash: commit.hash,
          message: commit.message,
          author: {
            name: commit.author_name,
            email: commit.author_email
          },
          date: commit.date,
          refs: commit.refs,
          stats: {
            insertions: diffStat.insertions || 0,
            deletions: diffStat.deletions || 0,
            files: diffStat.files?.length || 0
          },
          analysis: this.config.analyzeCommitMessages ? 
            this.analyzeCommitMessage(commit.message) : undefined
        }
      };

      await this.eventEngine.publish(commitEvent);
      this.logInfo(`New commit detected: ${commit.hash.substring(0, 7)} - ${commit.message}`);

    } catch (error) {
      this.logError(`Error processing commit ${commit.hash}:`, error);
    }
  }

  private async checkForBranchChanges(): Promise<void> {
    try {
      const branches = await this.git.branch();
      const currentBranchState = new Map<string, string>();

      // 현재 브랜치 상태 수집
      for (const [branchName, branchInfo] of Object.entries(branches.branches)) {
        currentBranchState.set(branchName, branchInfo.commit);
      }

      // 새 브랜치 또는 브랜치 변경 감지
      for (const [branchName, currentCommit] of currentBranchState) {
        const lastCommit = this.lastBranchState.get(branchName);
        
        if (!lastCommit) {
          // 새 브랜치
          await this.processBranchCreated(branchName, currentCommit);
        } else if (lastCommit !== currentCommit) {
          // 브랜치 업데이트
          await this.processBranchUpdated(branchName, lastCommit, currentCommit);
        }
      }

      // 삭제된 브랜치 감지
      for (const branchName of this.lastBranchState.keys()) {
        if (!currentBranchState.has(branchName)) {
          await this.processBranchDeleted(branchName);
        }
      }

      this.lastBranchState = currentBranchState;

    } catch (error) {
      this.logError('Error checking for branch changes:', error);
    }
  }

  private async processBranchCreated(branchName: string, commit: string): Promise<void> {
    const branchEvent: BaseEvent = {
      id: this.generateEventId(),
      type: 'git:branch_created',
      category: EventCategory.GIT,
      timestamp: new Date(),
      severity: EventSeverity.INFO,
      source: this.name,
      data: {
        action: 'branch_created',
        branchName,
        commit,
        pattern: this.analyzeBranchPattern(branchName)
      }
    };

    await this.eventEngine.publish(branchEvent);
    this.logInfo(`New branch created: ${branchName}`);
  }

  private async processBranchUpdated(branchName: string, oldCommit: string, newCommit: string): Promise<void> {
    // 머지 여부 확인
    const isMerge = await this.checkIfMerge(oldCommit, newCommit);
    
    if (isMerge && this.config.trackMerges) {
      await this.processMerge(branchName, oldCommit, newCommit);
    } else {
      const branchEvent: BaseEvent = {
        id: this.generateEventId(),
        type: 'git:branch_updated',
        category: EventCategory.GIT,
        timestamp: new Date(),
        severity: EventSeverity.INFO,
        source: this.name,
        data: {
          action: 'branch_updated',
          branchName,
          commit: newCommit,
          previousCommit: oldCommit,
          pattern: this.analyzeBranchPattern(branchName)
        }
      };

      await this.eventEngine.publish(branchEvent);
    }
  }

  private async processBranchDeleted(branchName: string): Promise<void> {
    const branchEvent: BaseEvent = {
      id: this.generateEventId(),
      type: 'git:branch_deleted',
      category: EventCategory.GIT,
      timestamp: new Date(),
      severity: EventSeverity.INFO,
      source: this.name,
      data: {
        action: 'branch_deleted',
        branchName,
        pattern: this.analyzeBranchPattern(branchName)
      }
    };

    await this.eventEngine.publish(branchEvent);
    this.logInfo(`Branch deleted: ${branchName}`);
  }

  private async processMerge(branchName: string, oldCommit: string, newCommit: string): Promise<void> {
    try {
      const log = await this.git.log({ from: oldCommit, to: newCommit });
      
      const mergeEvent: BaseEvent = {
        id: this.generateEventId(),
        type: 'git:merge',
        category: EventCategory.GIT,
        timestamp: new Date(),
        severity: EventSeverity.INFO,
        source: this.name,
        data: {
          action: 'merge',
          targetBranch: branchName,
          mergeCommit: newCommit,
          previousCommit: oldCommit,
          commitCount: log.all.length,
          analysis: {
            mergeType: this.determineMergeType([...log.all]),
            risk: this.assessMergeRisk([...log.all])
          }
        }
      };

      await this.eventEngine.publish(mergeEvent);
      this.logInfo(`Merge detected on ${branchName}: ${log.all.length} commits`);

    } catch (error) {
      this.logError(`Error processing merge on ${branchName}:`, error);
    }
  }

  private async checkIfMerge(oldCommit: string, newCommit: string): Promise<boolean> {
    try {
      const log = await this.git.log({ from: oldCommit, to: newCommit, maxCount: 10 });
      
      // 머지 커밋 특성 확인
      return log.all.some(commit => 
        commit.message.toLowerCase().includes('merge') ||
        commit.refs.includes('origin/') ||
        log.all.length > 1
      );
    } catch (error) {
      return false;
    }
  }

  private analyzeCommitMessage(message: string): any {
    const analysis = {
      type: 'unknown',
      scope: null as string | null,
      conventional: false,
      breaking: false,
      keywords: [] as string[]
    };

    // Conventional Commits 패턴 분석
    const conventionalPattern = /^(feat|fix|docs|style|refactor|test|chore|perf|ci|build)(\(.+\))?\!?:\s*(.+)/;
    const match = message.match(conventionalPattern);

    if (match) {
      analysis.conventional = true;
      analysis.type = match[1] ?? 'unknown';
      analysis.scope = match[2]?.slice(1, -1) ?? null;
      analysis.breaking = message.includes('!') || message.toLowerCase().includes('breaking');
    }

    // 키워드 분석
    const keywords = ['add', 'remove', 'update', 'fix', 'implement', 'refactor', 'test', 'docs'];
    analysis.keywords = keywords.filter(keyword => 
      message.toLowerCase().includes(keyword)
    );

    return analysis;
  }

  private analyzeBranchPattern(branchName: string): any {
    const patterns = {
      feature: /^(feature|feat)\//,
      bugfix: /^(bugfix|fix)\//,
      hotfix: /^hotfix\//,
      release: /^release\//,
      develop: /^(develop|dev)$/,
      main: /^(main|master)$/,
      experimental: /^(experiment|exp)\//
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(branchName)) {
        return { type, conventional: true };
      }
    }

    return { type: 'custom', conventional: false };
  }

  private determineMergeType(commits: readonly any[]): string {
    if (commits.length === 1) {
      return 'fast-forward';
    }

    const hasMergeCommit = commits.some(commit => 
      commit.message.toLowerCase().includes('merge')
    );

    return hasMergeCommit ? 'merge-commit' : 'squash';
  }

  private assessMergeRisk(commits: readonly any[]): string {
    if (commits.length > 20) {
      return 'high';
    } else if (commits.length > 5) {
      return 'medium';
    }
    return 'low';
  }

  private generateEventId(): string {
    return `git-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}