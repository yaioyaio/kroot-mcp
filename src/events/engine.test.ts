import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEngine } from './engine.js';
import { BaseEvent, EventCategory, EventSeverity } from './types/index.js';

describe('EventEngine', () => {
  let eventEngine: EventEngine;

  beforeEach(() => {
    eventEngine = new EventEngine();
  });

  describe('subscribe/unsubscribe', () => {
    it('should subscribe to events and receive them', async () => {
      const handler = vi.fn();
      const event: BaseEvent = {
        id: 'test-1',
        type: 'test:event',
        category: EventCategory.SYSTEM,
        timestamp: Date.now(),
        severity: EventSeverity.INFO,
        source: 'test',
        data: { message: 'test' },
      };

      eventEngine.subscribe('test:event', handler);
      await eventEngine.publish(event);

      expect(handler).toHaveBeenCalledWith(event);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should support wildcard subscriptions', async () => {
      const handler = vi.fn();
      const event: BaseEvent = {
        id: 'test-2',
        type: 'any:event',
        category: EventCategory.SYSTEM,
        timestamp: Date.now(),
        severity: EventSeverity.INFO,
        source: 'test',
        data: {},
      };

      eventEngine.subscribe('*', handler);
      await eventEngine.publish(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should support regex pattern subscriptions', async () => {
      const handler = vi.fn();
      const event: BaseEvent = {
        id: 'test-3',
        type: 'file:changed',
        category: EventCategory.FILE,
        timestamp: Date.now(),
        severity: EventSeverity.INFO,
        source: 'test',
        data: {},
      };

      eventEngine.subscribe(/^file:/, handler);
      await eventEngine.publish(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should unsubscribe handlers', async () => {
      const handler = vi.fn();
      const event: BaseEvent = {
        id: 'test-4',
        type: 'test:event',
        category: EventCategory.SYSTEM,
        timestamp: Date.now(),
        severity: EventSeverity.INFO,
        source: 'test',
        data: {},
      };

      const subscriberId = eventEngine.subscribe('test:event', handler);
      eventEngine.unsubscribe(subscriberId);
      await eventEngine.publish(event);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('event filtering', () => {
    it('should apply subscriber filters', async () => {
      const handler = vi.fn();
      const event: BaseEvent = {
        id: 'test-5',
        type: 'test:event',
        category: EventCategory.SYSTEM,
        timestamp: Date.now(),
        severity: EventSeverity.DEBUG,
        source: 'test',
        data: {},
      };

      eventEngine.subscribe('test:event', handler, {
        filter: (e) => e.severity !== EventSeverity.DEBUG,
      });
      await eventEngine.publish(event);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should apply global filters', async () => {
      const handler = vi.fn();
      const event: BaseEvent = {
        id: 'test-6',
        type: 'test:event',
        category: EventCategory.SYSTEM,
        timestamp: Date.now(),
        severity: EventSeverity.DEBUG,
        source: 'test',
        data: {},
      };

      eventEngine.addGlobalFilter((e) => e.severity !== EventSeverity.DEBUG);
      eventEngine.subscribe('test:event', handler);
      await eventEngine.publish(event);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('event transformation', () => {
    it('should apply transformers to events', async () => {
      const handler = vi.fn();
      const transformer = vi.fn((event: BaseEvent) => ({
        ...event,
        data: { ...event.data, transformed: true },
      }));

      const event: BaseEvent = {
        id: 'test-7',
        type: 'test:event',
        category: EventCategory.SYSTEM,
        timestamp: Date.now(),
        severity: EventSeverity.INFO,
        source: 'test',
        data: { original: true },
      };

      eventEngine.registerTransformer('test:event', transformer);
      eventEngine.subscribe('test:event', handler);
      await eventEngine.publish(event);

      expect(transformer).toHaveBeenCalledWith(event);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { original: true, transformed: true },
        }),
      );
    });
  });

  describe('statistics', () => {
    it('should track event statistics', async () => {
      const event: BaseEvent = {
        id: 'test-8',
        type: 'test:event',
        category: EventCategory.FILE,
        timestamp: Date.now(),
        severity: EventSeverity.INFO,
        source: 'test',
        data: {},
      };

      const initialStats = eventEngine.getStatistics();
      expect(initialStats.totalEvents).toBe(0);

      await eventEngine.publish(event);

      const stats = eventEngine.getStatistics();
      expect(stats.totalEvents).toBe(1);
      expect(stats.eventsByCategory.file).toBe(1);
      expect(stats.eventsBySeverity.info).toBe(1);
    });
  });

  describe('event priority', () => {
    it('should handle subscribers by priority', async () => {
      const order: number[] = [];
      const handler1 = vi.fn(() => {
        order.push(1);
      });
      const handler2 = vi.fn(() => {
        order.push(2);
      });
      const handler3 = vi.fn(() => {
        order.push(3);
      });

      const event: BaseEvent = {
        id: 'test-9',
        type: 'test:event',
        category: EventCategory.SYSTEM,
        timestamp: Date.now(),
        severity: EventSeverity.INFO,
        source: 'test',
        data: {},
      };

      eventEngine.subscribe('test:event', handler3, { priority: 0 });
      eventEngine.subscribe('test:event', handler1, { priority: 10 });
      eventEngine.subscribe('test:event', handler2, { priority: 5 });

      await eventEngine.publish(event);

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('error handling', () => {
    it('should emit error events when handlers fail', async () => {
      const errorHandler = vi.fn();
      const failingHandler = vi.fn(() => {
        throw new Error('Handler error');
      });

      const event: BaseEvent = {
        id: 'test-10',
        type: 'test:event',
        category: EventCategory.SYSTEM,
        timestamp: Date.now(),
        severity: EventSeverity.INFO,
        source: 'test',
        data: {},
      };

      eventEngine.subscribe('system:error', errorHandler);
      eventEngine.subscribe('test:event', failingHandler);
      await eventEngine.publish(event);

      expect(failingHandler).toHaveBeenCalled();
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'system:error',
          category: EventCategory.SYSTEM,
          severity: EventSeverity.ERROR,
          data: expect.objectContaining({
            error: 'Handler error',
          }),
        }),
      );
    });
  });

  describe('batch publishing', () => {
    it('should handle batch event publishing', async () => {
      const handler = vi.fn();
      const events: BaseEvent[] = [
        {
          id: 'batch-1',
          type: 'test:event',
          category: EventCategory.SYSTEM,
          timestamp: Date.now(),
          severity: EventSeverity.INFO,
          source: 'test',
          data: { index: 0 },
        },
        {
          id: 'batch-2',
          type: 'test:event',
          category: EventCategory.SYSTEM,
          timestamp: Date.now(),
          severity: EventSeverity.INFO,
          source: 'test',
          data: { index: 1 },
        },
      ];

      eventEngine.subscribe('test:event', handler);
      await eventEngine.publishBatch({
        id: 'batch-test',
        events,
        createdAt: new Date(),
      });

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'batch-1' }));
      expect(handler).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'batch-2' }));
    });
  });
});
