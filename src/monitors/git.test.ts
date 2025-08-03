import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GitMonitor } from './git.js';
import { EventEngine } from '../events/index.js';
import { simpleGit } from 'simple-git';

// Mock simple-git
vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({
    checkIsRepo: vi.fn(),
    log: vi.fn(),
    branch: vi.fn(),
    diffSummary: vi.fn()
  }))
}));

describe('GitMonitor', () => {
  let gitMonitor: GitMonitor;
  let eventEngine: EventEngine;
  let mockGit: any;

  beforeEach(() => {
    eventEngine = new EventEngine();
    
    mockGit = {
      checkIsRepo: vi.fn().mockResolvedValue(true),
      log: vi.fn().mockResolvedValue({
        latest: {
          hash: 'abc123',
          message: 'Initial commit',
          author_name: 'Test User',
          author_email: 'test@example.com',
          date: '2025-08-03',
          refs: ''
        },
        all: []
      }),
      branch: vi.fn().mockResolvedValue({
        branches: {
          main: { commit: 'abc123' }
        }
      }),
      diffSummary: vi.fn().mockResolvedValue({
        insertions: 10,
        deletions: 5,
        files: [{ file: 'test.ts' }]
      })
    };

    (simpleGit as any).mockReturnValue(mockGit);
    
    gitMonitor = new GitMonitor(eventEngine, {
      repositoryPath: '/test/repo',
      pollInterval: 100 // 빠른 테스트를 위해 짧게 설정
    });
  });

  afterEach(async () => {
    if (gitMonitor.isRunning) {
      await gitMonitor.stop();
    }
  });

  describe('GitMonitor 초기화', () => {
    it('기본 설정으로 GitMonitor가 생성되어야 함', () => {
      const config = gitMonitor.getConfig();
      
      expect(config.name).toBe('GitMonitor');
      expect(config.enabled).toBe(true);
      expect(config.repositoryPath).toBe('/test/repo');
      expect(config.trackBranches).toBe(true);
      expect(config.trackCommits).toBe(true);
    });

    it('커스텀 설정이 적용되어야 함', () => {
      const customMonitor = new GitMonitor(eventEngine, {
        repositoryPath: '/custom/repo',
        trackBranches: false,
        pollInterval: 1000
      });

      const config = customMonitor.getConfig();
      expect(config.repositoryPath).toBe('/custom/repo');
      expect(config.trackBranches).toBe(false);
      expect(config.pollInterval).toBe(1000);
    });
  });

  describe('GitMonitor 시작/정지', () => {
    it('GitMonitor가 정상적으로 시작되어야 함', async () => {
      await gitMonitor.start();
      
      expect(gitMonitor.isRunning).toBe(true);
      expect(mockGit.checkIsRepo).toHaveBeenCalled();
      expect(mockGit.log).toHaveBeenCalled();
    });

    it('유효하지 않은 저장소에서 시작 시 에러가 발생해야 함', async () => {
      mockGit.checkIsRepo.mockResolvedValue(false);
      
      await expect(gitMonitor.start()).rejects.toThrow('not a Git repository');
    });

    it('GitMonitor가 정상적으로 정지되어야 함', async () => {
      await gitMonitor.start();
      await gitMonitor.stop();
      
      expect(gitMonitor.isRunning).toBe(false);
    });

    it('이미 실행 중일 때 재시작하면 경고가 발생해야 함', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      await gitMonitor.start();
      await gitMonitor.start(); // 두 번째 시작
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('already running')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('커밋 메시지 분석', () => {
    it('Conventional Commits 형식을 올바르게 분석해야 함', () => {
      // private 메서드에 접근하기 위해 any로 캐스팅
      const monitor = gitMonitor as any;
      
      const analysis = monitor.analyzeCommitMessage('feat(auth): add login functionality');
      
      expect(analysis.conventional).toBe(true);
      expect(analysis.type).toBe('feat');
      expect(analysis.scope).toBe('auth');
      expect(analysis.breaking).toBe(false);
    });

    it('Breaking Change를 감지해야 함', () => {
      const monitor = gitMonitor as any;
      
      const analysis = monitor.analyzeCommitMessage('feat!: remove deprecated API');
      
      expect(analysis.conventional).toBe(true);
      expect(analysis.breaking).toBe(true);
    });

    it('일반 커밋 메시지를 처리해야 함', () => {
      const monitor = gitMonitor as any;
      
      const analysis = monitor.analyzeCommitMessage('Update documentation');
      
      expect(analysis.conventional).toBe(false);
      expect(analysis.type).toBe('unknown');
      expect(analysis.keywords).toContain('update');
    });
  });

  describe('브랜치 패턴 분석', () => {
    it('feature 브랜치를 올바르게 식별해야 함', () => {
      const monitor = gitMonitor as any;
      
      const pattern = monitor.analyzeBranchPattern('feature/user-auth');
      
      expect(pattern.type).toBe('feature');
      expect(pattern.conventional).toBe(true);
    });

    it('bugfix 브랜치를 올바르게 식별해야 함', () => {
      const monitor = gitMonitor as any;
      
      const pattern = monitor.analyzeBranchPattern('bugfix/login-error');
      
      expect(pattern.type).toBe('bugfix');
      expect(pattern.conventional).toBe(true);
    });

    it('main 브랜치를 올바르게 식별해야 함', () => {
      const monitor = gitMonitor as any;
      
      const pattern = monitor.analyzeBranchPattern('main');
      
      expect(pattern.type).toBe('main');
      expect(pattern.conventional).toBe(true);
    });

    it('커스텀 브랜치를 처리해야 함', () => {
      const monitor = gitMonitor as any;
      
      const pattern = monitor.analyzeBranchPattern('my-custom-branch');
      
      expect(pattern.type).toBe('custom');
      expect(pattern.conventional).toBe(false);
    });
  });

  describe('머지 위험도 평가', () => {
    it('적은 커밋 수에 대해 낮은 위험도를 반환해야 함', () => {
      const monitor = gitMonitor as any;
      
      const risk = monitor.assessMergeRisk([{ hash: '1' }, { hash: '2' }]);
      
      expect(risk).toBe('low');
    });

    it('중간 커밋 수에 대해 중간 위험도를 반환해야 함', () => {
      const monitor = gitMonitor as any;
      
      const commits = Array.from({ length: 10 }, (_, i) => ({ hash: i.toString() }));
      const risk = monitor.assessMergeRisk(commits);
      
      expect(risk).toBe('medium');
    });

    it('많은 커밋 수에 대해 높은 위험도를 반환해야 함', () => {
      const monitor = gitMonitor as any;
      
      const commits = Array.from({ length: 25 }, (_, i) => ({ hash: i.toString() }));
      const risk = monitor.assessMergeRisk(commits);
      
      expect(risk).toBe('high');
    });
  });

  describe('머지 타입 결정', () => {
    it('단일 커밋에 대해 fast-forward를 반환해야 함', () => {
      const monitor = gitMonitor as any;
      
      const type = monitor.determineMergeType([{ message: 'feat: add feature' }]);
      
      expect(type).toBe('fast-forward');
    });

    it('머지 커밋이 있으면 merge-commit을 반환해야 함', () => {
      const monitor = gitMonitor as any;
      
      const commits = [
        { message: 'feat: add feature' },
        { message: 'Merge branch feature into main' }
      ];
      const type = monitor.determineMergeType(commits);
      
      expect(type).toBe('merge-commit');
    });

    it('머지 커밋이 없으면 squash를 반환해야 함', () => {
      const monitor = gitMonitor as any;
      
      const commits = [
        { message: 'feat: add feature' },
        { message: 'fix: bug fix' }
      ];
      const type = monitor.determineMergeType(commits);
      
      expect(type).toBe('squash');
    });
  });

  describe('이벤트 ID 생성', () => {
    it('고유한 이벤트 ID를 생성해야 함', () => {
      const monitor = gitMonitor as any;
      
      const id1 = monitor.generateEventId();
      const id2 = monitor.generateEventId();
      
      expect(id1).toMatch(/^git-\d+-[a-z0-9]+$/);
      expect(id2).toMatch(/^git-\d+-[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });
});