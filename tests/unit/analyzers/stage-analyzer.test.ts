/**
 * StageAnalyzer 단위 테스트
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StageAnalyzer } from '../../../src/analyzers/stage-analyzer';
import { EventEngine } from '../../../src/events/engine';
import { EventCategory, EventSeverity } from '../../../src/events/types/base';
import { FileEvent, FileChangeAction } from '../../../src/events/types/file';
import { GitEvent, GitEventType } from '../../../src/events/types/git';
import { DevelopmentStage, CodingSubStage } from '../../../src/analyzers/types/stage';

describe('StageAnalyzer', () => {
  let stageAnalyzer: StageAnalyzer;
  let eventEngine: EventEngine;

  beforeEach(() => {
    eventEngine = new EventEngine();
    stageAnalyzer = new StageAnalyzer({
      confidenceThreshold: 0.6,
      transitionCooldown: 100, // 100ms for testing
      historySize: 10,
      eventEngine,
    });
  });

  describe('Stage Detection', () => {
    it('should detect PRD stage from file events', async () => {
      const fileEvent: FileEvent = {
        id: '1',
        timestamp: Date.now(),
        category: EventCategory.FILE,
        type: 'file:create',
        severity: EventSeverity.INFO,
        source: 'test',
        data: {
          action: 'add',
          newFile: {
            path: '/docs/PRD.md',
            relativePath: 'docs/PRD.md',
            name: 'PRD.md',
            extension: '.md',
            size: 1000,
            isDirectory: false,
          },
        },
      };

      let detectedStage: DevelopmentStage | null = null;
      stageAnalyzer.on('stage:detected', (stage) => {
        detectedStage = stage;
      });

      eventEngine.publish(fileEvent);
      
      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(detectedStage).toBe(DevelopmentStage.PRD);
    });

    it('should detect Frontend stage from file patterns', async () => {
      const fileEvent: FileEvent = {
        id: '2',
        timestamp: Date.now(),
        category: EventCategory.FILE,
        type: 'file:create',
        severity: EventSeverity.INFO,
        source: 'test',
        data: {
          action: FileChangeAction.ADD,
          newFile: {
            path: '/src/components/Button.tsx',
            relativePath: 'src/components/Button.tsx',
            name: 'Button.tsx',
            extension: '.tsx',
            size: 500,
            isDirectory: false,
          },
        },
      };

      let detectedStage: DevelopmentStage | null = null;
      stageAnalyzer.on('stage:detected', (stage) => {
        detectedStage = stage;
      });

      eventEngine.publish(fileEvent);
      
      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(detectedStage).toBe(DevelopmentStage.FRONTEND);
    });

    it('should detect Git management stage from git events', async () => {
      const gitEvent: GitEvent = {
        id: '3',
        timestamp: Date.now(),
        category: EventCategory.GIT,
        type: GitEventType.COMMIT_CREATED,
        severity: EventSeverity.INFO,
        source: 'test',
        data: {
          commit: {
            hash: 'abc123',
            shortHash: 'abc123',
            message: 'feat: add new feature',
            author: {
              name: 'Test User',
              email: 'test@example.com',
              date: new Date(),
            },
            parents: [],
          },
          branch: {
            name: 'feature/new-feature',
            isRemote: false,
            isDefault: false,
          },
        },
      };

      let detectedStage: DevelopmentStage | null = null;
      stageAnalyzer.on('stage:detected', (stage) => {
        detectedStage = stage;
      });

      eventEngine.publish(gitEvent);
      
      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(detectedStage).toBe(DevelopmentStage.GIT_MANAGEMENT);
    });
  });

  describe('Coding SubStage Detection', () => {
    it('should detect use case substage', async () => {
      // First, set current stage to AI_COLLABORATION
      const aiEvent: FileEvent = {
        id: '4',
        timestamp: Date.now(),
        category: EventCategory.FILE,
        type: 'file:create',
        severity: EventSeverity.INFO,
        source: 'test',
        data: {
          action: FileChangeAction.ADD,
          newFile: {
            path: '/docs/claude-prompt.md',
            relativePath: 'docs/claude-prompt.md',
            name: 'claude-prompt.md',
            extension: '.md',
            size: 1000,
            isDirectory: false,
          },
        },
      };

      eventEngine.publish(aiEvent);
      
      // Wait for stage to be set
      await new Promise(resolve => setTimeout(resolve, 150));

      // Then detect substage
      const useCaseEvent: FileEvent = {
        id: '5',
        timestamp: Date.now() + 200, // After cooldown
        category: EventCategory.FILE,
        type: 'file:create',
        severity: EventSeverity.INFO,
        source: 'test',
        data: {
          action: FileChangeAction.ADD,
          newFile: {
            path: '/docs/use-case-diagram.md',
            relativePath: 'docs/use-case-diagram.md',
            name: 'use-case-diagram.md',
            extension: '.md',
            size: 1000,
            isDirectory: false,
          },
        },
      };

      let detectedSubStage: CodingSubStage | null = null;
      stageAnalyzer.on('substage:detected', (subStage) => {
        detectedSubStage = subStage;
      });

      eventEngine.publish(useCaseEvent);
      
      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(detectedSubStage).toBe(CodingSubStage.USE_CASE);
    });

    it('should detect unit test substage', async () => {
      // Set stage to CODING
      const codingEvent: FileEvent = {
        id: '6',
        timestamp: Date.now(),
        category: EventCategory.FILE,
        type: 'file:create',
        severity: EventSeverity.INFO,
        source: 'test',
        data: {
          action: FileChangeAction.ADD,
          newFile: {
            path: '/src/utils/helper.js',
            relativePath: 'src/utils/helper.js',
            name: 'helper.js',
            extension: '.js',
            size: 1000,
            isDirectory: false,
          },
        },
      };

      eventEngine.publish(codingEvent);
      
      // Wait for stage to be set
      await new Promise(resolve => setTimeout(resolve, 150));

      // Detect unit test substage
      const testEvent: FileEvent = {
        id: '7',
        timestamp: Date.now() + 200,
        category: EventCategory.FILE,
        type: 'file:create',
        severity: EventSeverity.INFO,
        source: 'test',
        data: {
          action: FileChangeAction.ADD,
          newFile: {
            path: '/tests/utils/helper.test.js',
            relativePath: 'tests/utils/helper.test.js',
            name: 'helper.test.js',
            extension: '.js',
            size: 1000,
            isDirectory: false,
          },
        },
      };

      let detectedSubStage: CodingSubStage | null = null;
      stageAnalyzer.on('substage:detected', (subStage) => {
        detectedSubStage = subStage;
      });

      eventEngine.publish(testEvent);
      
      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(detectedSubStage).toBe(CodingSubStage.UNIT_TEST);
    });
  });

  describe('Stage Transitions', () => {
    it('should track stage transitions', async () => {
      const transitions: any[] = [];
      stageAnalyzer.on('stage:transition', (transition) => {
        transitions.push(transition);
      });

      // First stage
      const prdEvent: FileEvent = {
        id: '8',
        timestamp: Date.now(),
        category: EventCategory.FILE,
        type: 'file:create',
        severity: EventSeverity.INFO,
        source: 'test',
        data: {
          action: FileChangeAction.ADD,
          newFile: {
            path: '/docs/PRD.md',
            relativePath: 'docs/PRD.md',
            name: 'PRD.md',
            extension: '.md',
            size: 1000,
            isDirectory: false,
          },
        },
      };

      eventEngine.publish(prdEvent);
      
      // Wait for first stage detection
      await new Promise(resolve => setTimeout(resolve, 150));

      // Second stage
      const planningEvent: FileEvent = {
        id: '9',
        timestamp: Date.now() + 200,
        category: EventCategory.FILE,
        type: 'file:create',
        severity: EventSeverity.INFO,
        source: 'test',
        data: {
          action: FileChangeAction.ADD,
          newFile: {
            path: '/docs/planning.md',
            relativePath: 'docs/planning.md',
            name: 'planning.md',
            extension: '.md',
            size: 1000,
            isDirectory: false,
          },
        },
      };

      eventEngine.publish(planningEvent);
      
      // Wait for second stage detection
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(transitions).toHaveLength(2);
      expect(transitions[0].toStage).toBe(DevelopmentStage.PRD);
      expect(transitions[1].fromStage).toBe(DevelopmentStage.PRD);
      expect(transitions[1].toStage).toBe(DevelopmentStage.PLANNING);
    });
  });

  describe('Analysis', () => {
    it('should provide comprehensive analysis', () => {
      // Generate some activity
      const event: FileEvent = {
        id: '10',
        timestamp: Date.now(),
        category: EventCategory.FILE,
        type: 'file:create',
        severity: EventSeverity.INFO,
        source: 'test',
        data: {
          action: FileChangeAction.ADD,
          newFile: {
            path: '/src/index.ts',
            relativePath: 'src/index.ts',
            name: 'index.ts',
            extension: '.ts',
            size: 1000,
            isDirectory: false,
          },
        },
      };

      eventEngine.publish(event);

      const analysis = stageAnalyzer.analyze();

      expect(analysis).toHaveProperty('currentStage');
      expect(analysis).toHaveProperty('confidence');
      expect(analysis).toHaveProperty('activeSubStages');
      expect(analysis).toHaveProperty('recentTransitions');
      expect(analysis).toHaveProperty('stageProgress');
      expect(analysis).toHaveProperty('suggestions');
      expect(analysis.stageProgress).toBeInstanceOf(Map);
      expect(analysis.suggestions.length).toBeGreaterThan(0);
    });

    it('should calculate stage progress', async () => {
      const event: FileEvent = {
        id: '11',
        timestamp: Date.now(),
        category: EventCategory.FILE,
        type: 'file:create',
        severity: EventSeverity.INFO,
        source: 'test',
        data: {
          action: FileChangeAction.ADD,
          newFile: {
            path: '/src/components/App.tsx',
            relativePath: 'src/components/App.tsx',
            name: 'App.tsx',
            extension: '.tsx',
            size: 1000,
            isDirectory: false,
          },
        },
      };

      eventEngine.publish(event);
      
      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 100));

      const analysis = stageAnalyzer.analyze();
      const frontendProgress = analysis.stageProgress.get(DevelopmentStage.FRONTEND);
      
      expect(frontendProgress).toBeDefined();
      expect(frontendProgress).toBeGreaterThan(0);
    });
  });

  describe('Time Tracking', () => {
    it('should track time spent in each stage', async () => {
      const event: FileEvent = {
        id: '12',
        timestamp: Date.now(),
        category: EventCategory.FILE,
        type: 'file:create',
        severity: EventSeverity.INFO,
        source: 'test',
        data: {
          action: FileChangeAction.ADD,
          newFile: {
            path: '/docs/PRD.md',
            relativePath: 'docs/PRD.md',
            name: 'PRD.md',
            extension: '.md',
            size: 1000,
            isDirectory: false,
          },
        },
      };

      eventEngine.publish(event);

      // Wait some time
      await new Promise(resolve => setTimeout(resolve, 50));

      const timeSpent = stageAnalyzer.getStageTimeSpent(DevelopmentStage.PRD);
      expect(timeSpent).toBeGreaterThan(0);
    });
  });

  describe('Resource Management', () => {
    it('should clean up resources on dispose', () => {
      stageAnalyzer.dispose();
      
      const analysis = stageAnalyzer.analyze();
      expect(analysis.recentTransitions).toHaveLength(0);
      expect(analysis.activeSubStages).toHaveLength(0);
    });
  });
});