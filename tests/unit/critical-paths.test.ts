import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEngine } from '../../src/events/engine';
import { StorageManager } from '../../src/storage';
import { SecurityManager } from '../../src/security';
import { NotificationEngine } from '../../src/notifications/notification-engine';
import { MetricsCollector } from '../../src/analyzers/metrics-collector';
import { BottleneckDetector } from '../../src/analyzers/bottleneck-detector';

/**
 * Critical Path Tests
 * 
 * These tests ensure 100% coverage of critical system paths:
 * - Event flow from source to storage
 * - Security authentication and authorization
 * - Error handling and recovery
 * - Data integrity
 */
describe('Critical Path Coverage', () => {
  let eventEngine: EventEngine;
  let storageManager: StorageManager;
  let securityManager: SecurityManager;

  beforeEach(async () => {
    eventEngine = new EventEngine();
    
    // Use dynamic import to avoid circular dependency issues
    const { StorageManager } = await import('../../src/storage');
    storageManager = new StorageManager(':memory:');
    
    // Ensure initialize method exists
    if (storageManager.initialize) {
      await storageManager.initialize();
    }
    
    // Use dynamic import for SecurityManager
    const { SecurityManager } = await import('../../src/security');
    securityManager = SecurityManager.getInstance();
  });

  describe('Event Processing Critical Path', () => {
    it('should handle event from creation to storage', async () => {
      const eventRepo = storageManager.getEventRepository();
      let storedEvent: any = null;

      // Subscribe to store events
      eventEngine.on('event.published', async (event) => {
        storedEvent = await eventRepo.save(event);
      });

      // Create and publish event
      const testEvent = {
        id: 'critical-1',
        type: 'test.critical',
        timestamp: new Date(),
        category: 'test' as const,
        severity: 'critical' as const,
        source: 'test',
        data: { important: true }
      };

      eventEngine.publish(testEvent);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify event was stored
      expect(storedEvent).toBeDefined();
      expect(storedEvent.id).toBe(testEvent.id);

      // Verify event can be retrieved
      const retrieved = await eventRepo.findById(testEvent.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.data.important).toBe(true);
    });

    it('should handle event validation failures gracefully', () => {
      const errorHandler = vi.fn();
      eventEngine.on('error', errorHandler);

      // Publish invalid event
      const invalidEvent = {
        // Missing required fields
        type: 'invalid',
        data: {}
      };

      expect(() => {
        eventEngine.publish(invalidEvent as any);
      }).toThrow();

      // Should not crash the system
      expect(eventEngine.getStats().totalEvents).toBe(0);
    });

    it('should recover from storage failures', async () => {
      // Mock storage failure
      const eventRepo = storageManager.getEventRepository();
      vi.spyOn(eventRepo, 'save').mockRejectedValueOnce(new Error('Storage failed'));

      const errorEvents: any[] = [];
      eventEngine.on('error', (error) => {
        errorEvents.push(error);
      });

      // Attempt to store event
      eventEngine.on('event.published', async (event) => {
        try {
          await eventRepo.save(event);
        } catch (error) {
          eventEngine.emit('error', error);
        }
      });

      const testEvent = {
        id: 'recovery-1',
        type: 'test.recovery',
        timestamp: new Date(),
        category: 'test' as const,
        severity: 'info' as const,
        source: 'test',
        data: {}
      };

      eventEngine.publish(testEvent);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Should emit error but continue operating
      expect(errorEvents.length).toBe(1);
      expect(eventEngine.getStats().totalEvents).toBe(1);
    });
  });

  describe('Security Critical Path', () => {
    it('should enforce authentication for sensitive operations', async () => {
      const authManager = securityManager.getAuthManager();
      
      // Attempt without authentication
      const result1 = await authManager.verifyToken('invalid-token');
      expect(result1.valid).toBe(false);

      // Login and get token
      const loginResult = await authManager.login('admin', 'admin123');
      expect(loginResult.success).toBe(true);
      expect(loginResult.accessToken).toBeDefined();

      // Verify with valid token
      const result2 = await authManager.verifyToken(loginResult.accessToken!);
      expect(result2.valid).toBe(true);
      expect(result2.payload?.username).toBe('admin');
    });

    it('should enforce role-based permissions', async () => {
      const rbacManager = securityManager.getRBACManager();
      const authManager = securityManager.getAuthManager();

      // Create test user with limited role
      await rbacManager.createRole('viewer', 'Read-only access', [
        'tools.read',
        'metrics.view'
      ]);

      await authManager.createUser('testuser', 'password123', ['viewer']);

      // Check permissions
      const canRead = await rbacManager.checkPermission('testuser', 'tools.read');
      const canWrite = await rbacManager.checkPermission('testuser', 'tools.write');

      expect(canRead).toBe(true);
      expect(canWrite).toBe(false);
    });

    it('should handle encryption/decryption correctly', async () => {
      const encryptionManager = securityManager.getEncryptionManager();
      
      const sensitiveData = {
        apiKey: 'secret-api-key-12345',
        password: 'user-password'
      };

      // Encrypt
      const encrypted = await encryptionManager.encrypt(
        JSON.stringify(sensitiveData)
      );
      expect(encrypted).not.toContain('secret-api-key');

      // Decrypt
      const decrypted = await encryptionManager.decrypt(encrypted);
      const parsedData = JSON.parse(decrypted);
      
      expect(parsedData.apiKey).toBe(sensitiveData.apiKey);
      expect(parsedData.password).toBe(sensitiveData.password);
    });
  });

  describe('Notification Critical Path', () => {
    it('should deliver critical notifications', async () => {
      const notificationEngine = new NotificationEngine(eventEngine);
      const deliveredNotifications: any[] = [];

      // Add notification rule
      await notificationEngine.addRule({
        id: 'critical-alerts',
        name: 'Critical Alerts',
        enabled: true,
        conditions: {
          severities: ['critical', 'error']
        },
        actions: [{
          type: 'dashboard',
          config: { priority: 'urgent' }
        }],
        throttle: { maxPerHour: 100 }
      });

      notificationEngine.on('notification.sent', (notification) => {
        deliveredNotifications.push(notification);
      });

      // Trigger critical event
      eventEngine.publish({
        id: 'critical-alert-1',
        type: 'system.critical',
        timestamp: new Date(),
        category: 'system' as const,
        severity: 'critical' as const,
        source: 'test',
        data: { message: 'Critical system error' }
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify notification was sent
      expect(deliveredNotifications.length).toBe(1);
      expect(deliveredNotifications[0].priority).toBe('urgent');
    });

    it('should respect notification throttling', async () => {
      const notificationEngine = new NotificationEngine(eventEngine);
      const deliveredNotifications: any[] = [];

      // Add rule with strict throttling
      await notificationEngine.addRule({
        id: 'throttled-rule',
        name: 'Throttled Notifications',
        enabled: true,
        conditions: {
          eventTypes: ['test.throttle']
        },
        actions: [{
          type: 'dashboard',
          config: {}
        }],
        throttle: { maxPerHour: 2 }
      });

      notificationEngine.on('notification.sent', (notification) => {
        deliveredNotifications.push(notification);
      });

      // Send multiple events
      for (let i = 0; i < 5; i++) {
        eventEngine.publish({
          id: `throttle-${i}`,
          type: 'test.throttle',
          timestamp: new Date(),
          category: 'test' as const,
          severity: 'info' as const,
          source: 'test',
          data: {}
        });
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      // Should only send 2 notifications due to throttling
      expect(deliveredNotifications.length).toBe(2);
    });
  });

  describe('Metrics and Bottleneck Detection Critical Path', () => {
    it('should detect performance bottlenecks', async () => {
      const metricsCollector = new MetricsCollector(eventEngine);
      const bottleneckDetector = new BottleneckDetector(eventEngine, metricsCollector);
      
      const detectedBottlenecks: any[] = [];
      eventEngine.on('bottleneck.detected', (bottleneck) => {
        detectedBottlenecks.push(bottleneck);
      });

      // Simulate slow file operations
      for (let i = 0; i < 20; i++) {
        eventEngine.publish({
          id: `slow-file-${i}`,
          type: 'file.written',
          timestamp: new Date(),
          category: 'file' as const,
          severity: 'info' as const,
          source: 'test',
          data: { 
            path: '/test/file.ts',
            duration: 5000 // 5 seconds (slow)
          }
        });
      }

      // Let detector analyze
      await bottleneckDetector.analyze();

      // Should detect file operation bottleneck
      const fileBottleneck = detectedBottlenecks.find(
        b => b.type === 'process' && b.subtype === 'file_operations'
      );
      expect(fileBottleneck).toBeDefined();
    });

    it('should calculate accurate metrics', () => {
      const metricsCollector = new MetricsCollector(eventEngine);

      // Generate test events
      const eventTypes = ['file.created', 'git.commit', 'test.passed', 'error.occurred'];
      const severities = ['info', 'warning', 'error', 'critical'];
      
      for (let i = 0; i < 100; i++) {
        eventEngine.publish({
          id: `metric-${i}`,
          type: eventTypes[i % eventTypes.length],
          timestamp: new Date(),
          category: 'test' as const,
          severity: severities[i % severities.length] as any,
          source: 'test',
          data: {}
        });
      }

      const snapshot = metricsCollector.getSnapshot();

      expect(snapshot.totalEvents).toBe(100);
      expect(snapshot.eventsByCategory.test).toBe(100);
      expect(snapshot.errorRate).toBeGreaterThan(0);
      expect(snapshot.eventRate).toBeGreaterThan(0);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle cascading failures gracefully', async () => {
      const errorLog: any[] = [];
      eventEngine.on('error', (error) => errorLog.push(error));

      // Simulate multiple component failures
      const badMonitor = {
        start: () => { throw new Error('Monitor start failed'); },
        stop: () => { throw new Error('Monitor stop failed'); }
      };

      // System should continue operating
      try {
        await badMonitor.start();
      } catch (error) {
        eventEngine.emit('error', error);
      }

      try {
        await badMonitor.stop();
      } catch (error) {
        eventEngine.emit('error', error);
      }

      expect(errorLog.length).toBe(2);
      
      // System should still be functional
      const testEvent = {
        id: 'after-error',
        type: 'test.resilience',
        timestamp: new Date(),
        category: 'test' as const,
        severity: 'info' as const,
        source: 'test',
        data: {}
      };

      eventEngine.publish(testEvent);
      expect(eventEngine.getStats().totalEvents).toBeGreaterThan(0);
    });
  });
});