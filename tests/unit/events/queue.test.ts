import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventQueue } from '../../../src/events/queue.js';
import { BaseEvent, EventCategory, EventSeverity } from '../../../src/events/types/index.js';

describe('EventQueue', () => {
  let queue: EventQueue;

  beforeEach(() => {
    queue = new EventQueue({
      maxSize: 100,
      maxMemoryMB: 10,
      batchSize: 10,
      flushInterval: 100,
      priorityLevels: 5,
    });
  });

  afterEach(async () => {
    await queue.shutdown();
  });

  const createEvent = (severity: EventSeverity = EventSeverity.INFO): BaseEvent => ({
    id: `event-${Math.random()}`,
    type: 'test:event',
    category: EventCategory.SYSTEM,
    timestamp: Date.now(),
    severity,
    source: 'test',
    data: { test: true },
  });

  describe('enqueue', () => {
    it('should enqueue events successfully', async () => {
      const event = createEvent();
      const result = await queue.enqueue(event);
      
      expect(result).toBe(true);
      expect(queue.getStats().size).toBe(1);
      expect(queue.getStats().enqueuedCount).toBe(1);
    });

    it('should handle priority correctly', async () => {
      const criticalEvent = createEvent(EventSeverity.CRITICAL);
      const infoEvent = createEvent(EventSeverity.INFO);
      
      await queue.enqueue(infoEvent);
      await queue.enqueue(criticalEvent);
      
      const stats = queue.getStats();
      expect(stats.priorityDistribution.get(1)).toBe(1); // INFO
      expect(stats.priorityDistribution.get(4)).toBe(1); // CRITICAL
    });

    it('should trigger flush when batch size is reached', async () => {
      const flushSpy = vi.spyOn(queue, 'flush');
      
      // Add events up to batch size
      for (let i = 0; i < 10; i++) {
        await queue.enqueue(createEvent());
      }
      
      expect(flushSpy).toHaveBeenCalled();
    });
  });

  describe('dequeue', () => {
    it('should dequeue events in priority order', async () => {
      const criticalEvent = createEvent(EventSeverity.CRITICAL);
      const errorEvent = createEvent(EventSeverity.ERROR);
      const infoEvent = createEvent(EventSeverity.INFO);
      
      await queue.enqueue(infoEvent);
      await queue.enqueue(errorEvent);
      await queue.enqueue(criticalEvent);
      
      const events = queue.dequeue(3);
      
      expect(events[0].severity).toBe(EventSeverity.CRITICAL);
      expect(events[1].severity).toBe(EventSeverity.ERROR);
      expect(events[2].severity).toBe(EventSeverity.INFO);
    });

    it('should update stats on dequeue', async () => {
      await queue.enqueue(createEvent());
      await queue.enqueue(createEvent());
      
      queue.dequeue(1);
      
      const stats = queue.getStats();
      expect(stats.size).toBe(1);
      expect(stats.dequeuedCount).toBe(1);
    });
  });

  describe('memory management', () => {
    it('should track memory usage', async () => {
      const event = createEvent();
      await queue.enqueue(event);
      
      const stats = queue.getStats();
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });

    it('should evict events when memory limit is reached', async () => {
      const smallQueue = new EventQueue({
        maxSize: 1000,
        maxMemoryMB: 0.001, // Very small memory limit
      });

      let overflowEmitted = false;
      smallQueue.on('overflow', () => {
        overflowEmitted = true;
      });

      // Add many events to exceed memory
      for (let i = 0; i < 100; i++) {
        await smallQueue.enqueue(createEvent());
      }

      expect(overflowEmitted).toBe(true);
      await smallQueue.shutdown();
    });
  });

  describe('retry logic', () => {
    it('should retry failed events', async () => {
      const event = createEvent();
      await queue.enqueue(event);
      
      // Simulate failure and retry
      const retryResult = await queue.retry(event);
      
      expect(retryResult).toBe(true);
    });

    it('should respect max retry attempts', async () => {
      const event = createEvent();
      const testQueue = new EventQueue({ retryAttempts: 2 });

      // Force multiple retries
      for (let i = 0; i < 3; i++) {
        await testQueue.retry(event);
      }

      // Last retry should fail
      const finalRetry = await testQueue.retry(event);
      expect(finalRetry).toBe(false);

      await testQueue.shutdown();
    });
  });

  describe('batch processing', () => {
    it('should emit process event with batch', async () => {
      let processedEvents: BaseEvent[] = [];
      
      queue.on('process', (events) => {
        processedEvents = events;
      });

      // Add events
      for (let i = 0; i < 5; i++) {
        await queue.enqueue(createEvent());
      }

      await queue.flush();

      expect(processedEvents.length).toBe(5);
    });
  });

  describe('statistics', () => {
    it('should calculate throughput', async () => {
      queue.on('process', () => {}); // Empty handler

      for (let i = 0; i < 10; i++) {
        await queue.enqueue(createEvent());
      }

      await queue.flush();

      const stats = queue.getStats();
      expect(stats.throughput).toBeGreaterThan(0);
    });

    it('should track oldest event age', async () => {
      // Disable auto flush to keep events in queue
      const testQueue = new EventQueue({
        flushInterval: 0, // Disable auto flush
      });
      
      await testQueue.enqueue(createEvent());
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const stats = testQueue.getStats();
      expect(stats.oldestEventAge).toBeDefined();
      expect(stats.oldestEventAge).toBeGreaterThan(50);
      
      await testQueue.shutdown();
    });
  });

  describe('auto flush', () => {
    it('should auto flush at intervals', async () => {
      const flushSpy = vi.spyOn(queue, 'flush');
      
      await queue.enqueue(createEvent());
      
      // Wait for auto flush
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(flushSpy).toHaveBeenCalled();
    });
  });

  describe('shutdown', () => {
    it('should process remaining events on shutdown', async () => {
      let processedCount = 0;
      
      queue.on('process', (events) => {
        processedCount += events.length;
      });

      // Add events
      for (let i = 0; i < 5; i++) {
        await queue.enqueue(createEvent());
      }

      await queue.shutdown();

      expect(processedCount).toBe(5);
    });
  });
});