import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEngine } from '../../src/events/engine';
import { FileMonitor } from '../../src/monitors/file';
import { GitMonitor } from '../../src/monitors/git';
import { StorageManager } from '../../src/storage';
import { QueueManager } from '../../src/events/queue-manager';
import { APIIntegrationManager } from '../../src/integrations/manager';
import { MetricsCollector } from '../../src/analyzers/metrics-collector';
import { NotificationEngine } from '../../src/notifications/notification-engine';
import { rm, mkdir } from 'fs/promises';
import { join } from 'path';

/**
 * Integration Test Suite: System Components Integration
 * 
 * Tests the integration between major system components:
 * - EventEngine ↔ Monitors
 * - Monitors ↔ Storage
 * - EventEngine ↔ QueueManager
 * - Metrics ↔ Notifications
 */
describe('System Integration Tests', () => {
  const testWorkspace = join(__dirname, '../../test-integration-workspace');
  let eventEngine: EventEngine;
  let fileMonitor: FileMonitor;
  let gitMonitor: GitMonitor;
  let storageManager: StorageManager;
  let queueManager: QueueManager;
  let metricsCollector: MetricsCollector;
  let notificationEngine: NotificationEngine;

  beforeEach(async () => {
    // Clean workspace
    await rm(testWorkspace, { recursive: true, force: true });
    await mkdir(testWorkspace, { recursive: true });

    // Initialize components
    eventEngine = new EventEngine();
    storageManager = new StorageManager(':memory:');
    await storageManager.initialize();
    
    queueManager = new QueueManager(eventEngine);
    fileMonitor = new FileMonitor(testWorkspace, eventEngine);
    gitMonitor = new GitMonitor(testWorkspace, eventEngine);
    metricsCollector = new MetricsCollector(eventEngine);
    notificationEngine = new NotificationEngine(eventEngine);
  });

  afterEach(async () => {
    // Cleanup
    await fileMonitor.stop();
    await gitMonitor.stop();
    await storageManager.close();
    await rm(testWorkspace, { recursive: true, force: true });
  });

  describe('Monitor → EventEngine → Storage Integration', () => {
    it('should propagate file events through the system', async () => {
      const receivedEvents: any[] = [];
      
      // Subscribe to events
      eventEngine.on('file.*', (event) => {
        receivedEvents.push(event);
      });

      // Set up storage listener
      eventEngine.on('event.published', async (event) => {
        await storageManager.getEventRepository().save(event);
      });

      // Start monitoring
      await fileMonitor.start();

      // Create a test file
      const fs = await import('fs/promises');
      await fs.writeFile(join(testWorkspace, 'test.ts'), 'export const test = 1;');

      // Wait for event propagation
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify event was received
      expect(receivedEvents.length).toBeGreaterThan(0);
      expect(receivedEvents[0].type).toBe('file.created');

      // Verify event was stored
      const storedEvents = await storageManager.getEventRepository().findByTimeRange(
        new Date(Date.now() - 1000),
        new Date()
      );
      expect(storedEvents.length).toBeGreaterThan(0);
    });

    it('should handle Git events with full context', async () => {
      const gitEvents: any[] = [];
      
      eventEngine.on('git.*', (event) => {
        gitEvents.push(event);
      });

      await gitMonitor.start();

      // Initialize git repo
      const simpleGit = (await import('simple-git')).default;
      const git = simpleGit(testWorkspace);
      await git.init();
      
      // Create and commit a file
      const fs = await import('fs/promises');
      await fs.writeFile(join(testWorkspace, 'README.md'), '# Test Project');
      await git.add('README.md');
      await git.commit('Initial commit');

      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(gitEvents.length).toBeGreaterThan(0);
      const commitEvent = gitEvents.find(e => e.type === 'git.commit');
      expect(commitEvent).toBeDefined();
      expect(commitEvent.data.message).toBe('Initial commit');
    });
  });

  describe('EventEngine ↔ QueueManager Integration', () => {
    it('should handle high-volume events through queue', async () => {
      const processedEvents: any[] = [];
      
      // Subscribe to processed events
      queueManager.on('batch.processed', (batch) => {
        processedEvents.push(...batch.events);
      });

      // Generate many events
      for (let i = 0; i < 150; i++) {
        eventEngine.emit('test.event', {
          id: `test-${i}`,
          type: 'test.event',
          timestamp: new Date(),
          category: 'test',
          severity: 'info',
          source: 'test',
          data: { index: i }
        });
      }

      // Wait for batch processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify all events were processed
      expect(processedEvents.length).toBe(150);
    });

    it('should prioritize critical events', async () => {
      const processedOrder: string[] = [];
      
      queueManager.on('event.processed', (event) => {
        processedOrder.push(event.severity);
      });

      // Add events with different priorities
      const severities = ['info', 'warning', 'error', 'critical'];
      for (const severity of severities) {
        eventEngine.emit('priority.test', {
          id: `test-${severity}`,
          type: 'priority.test',
          timestamp: new Date(),
          category: 'test',
          severity: severity as any,
          source: 'test',
          data: {}
        });
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      // Critical should be processed first
      expect(processedOrder[0]).toBe('critical');
    });
  });

  describe('Metrics → Notifications Integration', () => {
    it('should trigger notifications on metric thresholds', async () => {
      const notifications: any[] = [];
      
      // Set up notification rule
      await notificationEngine.addRule({
        id: 'high-error-rate',
        name: 'High Error Rate',
        enabled: true,
        conditions: {
          eventTypes: ['metric.threshold.exceeded'],
          severities: ['error', 'critical']
        },
        actions: [{
          type: 'dashboard',
          config: { priority: 'high' }
        }],
        throttle: { maxPerHour: 10 }
      });

      notificationEngine.on('notification.sent', (notification) => {
        notifications.push(notification);
      });

      // Simulate high error rate
      for (let i = 0; i < 10; i++) {
        eventEngine.emit('error.occurred', {
          id: `error-${i}`,
          type: 'error.occurred',
          timestamp: new Date(),
          category: 'system',
          severity: 'error',
          source: 'test',
          data: { message: 'Test error' }
        });
      }

      // Let metrics collector process
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check if notification was triggered
      const errorMetrics = metricsCollector.getSnapshot();
      expect(errorMetrics.errorRate).toBeGreaterThan(0);
      
      // Emit threshold exceeded event
      eventEngine.emit('metric.threshold.exceeded', {
        id: 'threshold-1',
        type: 'metric.threshold.exceeded',
        timestamp: new Date(),
        category: 'metric',
        severity: 'error',
        source: 'metrics',
        data: {
          metric: 'errorRate',
          value: errorMetrics.errorRate,
          threshold: 5
        }
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(notifications.length).toBeGreaterThan(0);
    });
  });

  describe('Full System Flow', () => {
    it('should handle complete development workflow', async () => {
      const workflowEvents: any[] = [];
      
      eventEngine.on('*', (event) => {
        workflowEvents.push(event);
      });

      // Start all monitors
      await fileMonitor.start();
      await gitMonitor.start();

      // Simulate development workflow
      const fs = await import('fs/promises');
      const git = (await import('simple-git')).default(testWorkspace);
      
      // 1. Initialize project
      await git.init();
      
      // 2. Create source files
      await fs.writeFile(join(testWorkspace, 'index.ts'), 'export function main() {}');
      await fs.writeFile(join(testWorkspace, 'test.spec.ts'), 'describe("test", () => {});');
      
      // 3. Git operations
      await git.add('.');
      await git.commit('feat: initial implementation');
      
      // 4. Create feature branch
      await git.checkoutLocalBranch('feature/new-feature');
      
      // 5. Make changes
      await fs.appendFile(join(testWorkspace, 'index.ts'), '\nexport function helper() {}');
      await git.add('index.ts');
      await git.commit('feat: add helper function');

      // Wait for all events to process
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify workflow events
      const eventTypes = workflowEvents.map(e => e.type);
      
      expect(eventTypes).toContain('file.created');
      expect(eventTypes).toContain('git.commit');
      expect(eventTypes).toContain('git.branch.created');
      
      // Verify metrics were collected
      const metrics = metricsCollector.getSnapshot();
      expect(metrics.totalEvents).toBeGreaterThan(0);
      expect(metrics.fileOperations).toBeGreaterThan(0);
      expect(metrics.gitOperations).toBeGreaterThan(0);
    });
  });
});