import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QueueManager } from '../../../src/events/queue-manager.js';
import { BaseEvent, EventCategory, EventSeverity } from '../../../src/events/types/index.js';

describe('QueueManager', () => {
  let queueManager: QueueManager;

  beforeEach(() => {
    queueManager = new QueueManager({
      enableAutoRouting: false, // Disable for testing
      enableMetrics: false,
    });
  });

  afterEach(async () => {
    await queueManager.shutdown();
  });

  const createEvent = (
    category: EventCategory = EventCategory.SYSTEM,
    severity: EventSeverity = EventSeverity.INFO
  ): BaseEvent => ({
    id: `event-${Math.random()}`,
    type: 'test:event',
    category,
    timestamp: Date.now(),
    severity,
    source: 'test',
    data: { test: true },
  });

  describe('queue creation', () => {
    it('should create default queues', () => {
      expect(queueManager.getQueue('default')).toBeDefined();
      expect(queueManager.getQueue('priority')).toBeDefined();
      expect(queueManager.getQueue('batch')).toBeDefined();
      expect(queueManager.getQueue('failed')).toBeDefined();
    });

    it('should create custom queue', () => {
      const queue = queueManager.createQueue('custom', {
        maxSize: 500,
        batchSize: 50,
      });

      expect(queue).toBeDefined();
      expect(queueManager.getQueue('custom')).toBe(queue);
    });

    it('should throw error for duplicate queue', () => {
      expect(() => {
        queueManager.createQueue('default');
      }).toThrow('already exists');
    });

    it('should respect max queues limit', () => {
      const manager = new QueueManager({ maxQueues: 5 });

      // Already has 4 default queues
      manager.createQueue('custom1');

      expect(() => {
        manager.createQueue('custom2');
      }).toThrow('Maximum number of queues');

      manager.shutdown();
    });
  });

  describe('queue destruction', () => {
    it('should destroy custom queue', async () => {
      queueManager.createQueue('temp');
      await queueManager.destroyQueue('temp');

      expect(queueManager.getQueue('temp')).toBeUndefined();
    });

    it('should not allow destroying system queues', async () => {
      await expect(queueManager.destroyQueue('default')).rejects.toThrow(
        'Cannot destroy system queue'
      );
    });
  });

  describe('routing rules', () => {
    it('should add routing rule', () => {
      queueManager.addRoutingRule({
        name: 'test-rule',
        predicate: (event) => event.severity === EventSeverity.CRITICAL,
        queueName: 'priority',
        priority: 100,
      });

      // Test by routing an event
      const event = createEvent(EventCategory.SYSTEM, EventSeverity.CRITICAL);
      queueManager.routeEvent(event);

      const stats = queueManager.getQueueStats('priority');
      expect(stats?.enqueuedCount).toBe(1);
    });

    it('should apply rules by priority order', async () => {
      queueManager.addRoutingRule({
        name: 'low-priority',
        predicate: () => true,
        queueName: 'batch',
        priority: 10,
      });

      queueManager.addRoutingRule({
        name: 'high-priority',
        predicate: (event) => event.severity === EventSeverity.ERROR,
        queueName: 'priority',
        priority: 100,
      });

      const event = createEvent(EventCategory.SYSTEM, EventSeverity.ERROR);
      await queueManager.routeEvent(event);

      // Should route to priority queue due to higher priority rule
      const priorityStats = queueManager.getQueueStats('priority');
      const batchStats = queueManager.getQueueStats('batch');

      expect(priorityStats?.enqueuedCount).toBe(1);
      expect(batchStats?.enqueuedCount).toBe(0);
    });

    it('should remove routing rule', () => {
      queueManager.addRoutingRule({
        name: 'temp-rule',
        predicate: () => true,
        queueName: 'default',
      });

      const removed = queueManager.removeRoutingRule('temp-rule');
      expect(removed).toBe(true);

      const removedAgain = queueManager.removeRoutingRule('temp-rule');
      expect(removedAgain).toBe(false);
    });
  });

  describe('event routing', () => {
    it('should route to default queue when no rules match', async () => {
      const event = createEvent();
      const routed = await queueManager.routeEvent(event);

      expect(routed).toBe(true);
      const stats = queueManager.getQueueStats('default');
      expect(stats?.enqueuedCount).toBe(1);
    });

    it('should emit event:routed', async () => {
      let routedEvent: BaseEvent | null = null;
      let routedQueue: string | null = null;

      queueManager.on('event:routed', (event, queueName) => {
        routedEvent = event;
        routedQueue = queueName;
      });

      const event = createEvent();
      await queueManager.routeEvent(event);

      expect(routedEvent).toBe(event);
      expect(routedQueue).toBe('default');
    });

    it('should handle batch routing', async () => {
      const events = [
        createEvent(),
        createEvent(),
        createEvent(),
      ];

      const count = await queueManager.routeEventBatch(events);

      expect(count).toBe(3);
      const stats = queueManager.getQueueStats('default');
      expect(stats?.enqueuedCount).toBe(3);
    });
  });

  describe('processors', () => {
    it('should register and call processor', async () => {
      let processedEvents: BaseEvent[] = [];

      queueManager.registerProcessor('default', async (events) => {
        processedEvents = events;
      });

      const event = createEvent();
      await queueManager.routeEvent(event);

      // Flush the queue to trigger processing
      const queue = queueManager.getQueue('default');
      await queue?.flush();

      expect(processedEvents.length).toBe(1);
      expect(processedEvents[0]).toBe(event);
    });

    it('should emit batch:processed', async () => {
      let emittedEvents: BaseEvent[] = [];
      let emittedQueue: string = '';

      queueManager.on('batch:processed', (events, queueName) => {
        emittedEvents = events;
        emittedQueue = queueName;
      });

      queueManager.registerProcessor('default', async () => {
        // Empty processor
      });

      await queueManager.routeEvent(createEvent());
      await queueManager.getQueue('default')?.flush();

      expect(emittedEvents.length).toBe(1);
      expect(emittedQueue).toBe('default');
    });

    it('should handle processor errors', async () => {
      let errorEmitted = false;

      queueManager.on('error', () => {
        errorEmitted = true;
      });

      queueManager.registerProcessor('default', async () => {
        throw new Error('Process error');
      });

      await queueManager.routeEvent(createEvent());
      await queueManager.getQueue('default')?.flush();

      expect(errorEmitted).toBe(true);
    });

    it('should move failed events to failed queue', async () => {
      queueManager.registerProcessor('default', async () => {
        throw new Error('Process error');
      });

      await queueManager.routeEvent(createEvent());
      await queueManager.getQueue('default')?.flush();

      // Check failed queue
      const failedStats = queueManager.getQueueStats('failed');
      expect(failedStats?.enqueuedCount).toBe(1);
    });
  });

  describe('statistics', () => {
    it('should get all queue stats', async () => {
      await queueManager.routeEvent(createEvent());
      await queueManager.routeEvent(createEvent());

      const allStats = queueManager.getAllStats();

      expect(allStats.size).toBe(4); // 4 default queues
      expect(allStats.get('default')?.enqueuedCount).toBe(2);
    });

    it('should get specific queue stats', async () => {
      await queueManager.routeEvent(createEvent());

      const stats = queueManager.getQueueStats('default');

      expect(stats).toBeDefined();
      expect(stats?.enqueuedCount).toBe(1);
    });
  });

  describe('flush operations', () => {
    it('should flush all queues', async () => {
      let processedCount = 0;

      // Register processors for all queues
      ['default', 'priority', 'batch', 'failed'].forEach(queueName => {
        queueManager.registerProcessor(queueName, async (events) => {
          processedCount += events.length;
        });
      });

      // Add events to different queues
      await queueManager.routeEvent(createEvent());
      
      queueManager.addRoutingRule({
        name: 'priority-rule',
        predicate: (event) => event.severity === EventSeverity.ERROR,
        queueName: 'priority',
      });
      await queueManager.routeEvent(createEvent(EventCategory.SYSTEM, EventSeverity.ERROR));

      await queueManager.flushAll();

      expect(processedCount).toBe(2);
    });
  });

  describe('auto routing', () => {
    it('should setup default routing rules when enabled', () => {
      const manager = new QueueManager({
        enableAutoRouting: true,
      });

      // Test critical events go to priority queue
      const criticalEvent = createEvent(EventCategory.SYSTEM, EventSeverity.CRITICAL);
      manager.routeEvent(criticalEvent);

      const priorityStats = manager.getQueueStats('priority');
      expect(priorityStats?.enqueuedCount).toBe(1);

      manager.shutdown();
    });
  });
});