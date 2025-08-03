import { describe, it, expect } from 'vitest';
import { 
  validateEvent, 
  createFileEvent, 
  createGitEvent, 
  createActivityEvent,
  createStageEvent,
  createSystemEvent 
} from './validation.js';
import { EventCategory, EventSeverity } from '../types/index.js';

describe('Event Validation', () => {
  describe('validateEvent', () => {
    it('should validate a valid event', () => {
      const event = {
        id: 'test-123',
        type: 'file:created',
        category: EventCategory.FILE,
        timestamp: new Date(),
        severity: EventSeverity.INFO,
        source: 'test',
        data: {
          action: 'add',
          path: '/test/file.ts',
        },
      };

      const result = validateEvent(event);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject(event);
    });

    it('should reject invalid event', () => {
      const event = {
        type: 'invalid',
        // Missing required fields
      };

      const result = validateEvent(event);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle optional fields', () => {
      const event = {
        id: 'test-123',
        type: 'system:info',
        category: EventCategory.SYSTEM,
        timestamp: new Date(),
        severity: EventSeverity.INFO,
        source: 'test',
        data: {},
        metadata: {
          userId: 'user-123',
          sessionId: 'session-456',
        },
        tags: ['important', 'system'],
      };

      const result = validateEvent(event);
      expect(result.success).toBe(true);
      expect(result.data?.metadata).toEqual(event.metadata);
      expect(result.data?.tags).toEqual(event.tags);
    });
  });

  describe('createFileEvent', () => {
    it('should create a valid file created event', () => {
      const result = createFileEvent('created', {
        action: 'created',
        newFile: {
          path: '/src/test.ts',
          relativePath: 'src/test.ts',
          name: 'test.ts',
          extension: '.ts',
          size: 1024,
          modifiedAt: new Date(),
          isDirectory: false,
        },
      });

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('file:created');
      expect(result.data?.category).toBe(EventCategory.FILE);
      expect(result.data?.data.newFile.path).toBe('/src/test.ts');
    });

    it('should create a valid file changed event', () => {
      const now = new Date();
      const result = createFileEvent('changed', {
        action: 'changed',
        oldFile: {
          path: '/src/old.ts',
          relativePath: 'src/old.ts',
          name: 'old.ts',
          extension: '.ts',
          size: 500,
          modifiedAt: now,
          isDirectory: false,
        },
        newFile: {
          path: '/src/new.ts',
          relativePath: 'src/new.ts',
          name: 'new.ts',
          extension: '.ts',
          size: 600,
          modifiedAt: now,
          isDirectory: false,
        },
      });

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('file:changed');
      expect(result.data?.data.oldFile).toBeDefined();
      expect(result.data?.data.newFile).toBeDefined();
    });

    it('should handle validation errors', () => {
      const result = createFileEvent('created', {
        action: 'add',
        // Missing required newFile
      } as any);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('createGitEvent', () => {
    it('should create a valid git commit event', () => {
      const result = createGitEvent('committed', {
        action: 'commit',
        repository: '/project/repo',
        branch: 'main',
        commit: {
          hash: 'abc123',
          message: 'feat: add new feature',
          author: 'developer@example.com',
          timestamp: new Date(),
        },
      });

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('git:committed');
      expect(result.data?.category).toBe(EventCategory.GIT);
      expect(result.data?.data.commit.hash).toBe('abc123');
    });

    it('should create a valid git branch event', () => {
      const result = createGitEvent('branched', {
        action: 'branch',
        repository: '/project/repo',
        branch: 'feature/new-feature',
        fromBranch: 'develop',
      });

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('git:branched');
      expect(result.data?.data.fromBranch).toBe('develop');
    });
  });

  describe('createActivityEvent', () => {
    it('should create a valid activity event', () => {
      const result = createActivityEvent({
        stage: 'development',
        action: 'file_edited',
        details: 'Updated user service',
        actor: 'developer-1',
        timestamp: new Date(),
      });

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('activity:tracked');
      expect(result.data?.category).toBe(EventCategory.ACTIVITY);
      expect(result.data?.data.stage).toBe('development');
    });

    it('should handle optional metadata', () => {
      const result = createActivityEvent({
        stage: 'testing',
        action: 'test_run',
        details: 'Running unit tests',
        actor: 'ci-system',
        timestamp: new Date(),
        metadata: {
          testSuite: 'unit',
          coverage: 85.5,
        },
      });

      expect(result.success).toBe(true);
      expect(result.data?.metadata?.testSuite).toBe('unit');
    });
  });

  describe('createStageEvent', () => {
    it('should create a valid stage transition event', () => {
      const result = createStageEvent({
        fromStage: 'planning',
        toStage: 'development',
        confidence: 0.95,
        timestamp: new Date(),
      });

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('stage:transitioned');
      expect(result.data?.category).toBe(EventCategory.STAGE);
      expect(result.data?.data.confidence).toBe(0.95);
    });

    it('should handle initial stage transition', () => {
      const result = createStageEvent({
        toStage: 'planning',
        confidence: 1.0,
        timestamp: new Date(),
      });

      expect(result.success).toBe(true);
      expect(result.data?.data.fromStage).toBeUndefined();
      expect(result.data?.data.toStage).toBe('planning');
    });
  });

  describe('createSystemEvent', () => {
    it('should create a valid system event', () => {
      const result = createSystemEvent('started', {
        component: 'FileMonitor',
        message: 'File monitoring started',
        timestamp: new Date(),
      });

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('system:started');
      expect(result.data?.category).toBe(EventCategory.SYSTEM);
      expect(result.data?.data.component).toBe('FileMonitor');
    });

    it('should create error events with proper severity', () => {
      const result = createSystemEvent('error', {
        component: 'Database',
        message: 'Connection failed',
        error: new Error('Connection timeout'),
        timestamp: new Date(),
      });

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('system:error');
      expect(result.data?.severity).toBe(EventSeverity.ERROR);
      expect(result.data?.data.error).toBe('Connection timeout');
    });

    it('should handle metrics in system events', () => {
      const result = createSystemEvent('metrics', {
        component: 'Performance',
        message: 'System metrics update',
        metrics: {
          cpu: 45.2,
          memory: 2048,
          requestsPerSecond: 150,
        },
        timestamp: new Date(),
      });

      expect(result.success).toBe(true);
      expect(result.data?.data.metrics?.cpu).toBe(45.2);
    });
  });
});