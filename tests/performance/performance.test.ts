import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEngine } from '../../src/events/engine';
import { QueueManager } from '../../src/events/queue-manager';
import { StorageManager } from '../../src/storage';
import { PerformanceProfiler } from '../../src/performance/performance-profiler';
import { MemoryOptimizer } from '../../src/performance/memory-optimizer';
import { CacheManager } from '../../src/performance/cache-manager';
import { FileMonitor } from '../../src/monitors/file';
import { join } from 'path';
import { rm, mkdir, writeFile } from 'fs/promises';

/**
 * Performance Test Suite
 * 
 * Tests system performance under various load conditions:
 * - High-volume event processing
 * - Memory usage optimization
 * - Cache performance
 * - Response time benchmarks
 */
describe('Performance Tests', () => {
  let eventEngine: EventEngine;
  let queueManager: QueueManager;
  let storageManager: StorageManager;
  let performanceProfiler: PerformanceProfiler;
  let memoryOptimizer: MemoryOptimizer;
  let cacheManager: CacheManager;
  const testWorkspace = join(__dirname, '../../test-performance-workspace');

  beforeEach(async () => {
    await rm(testWorkspace, { recursive: true, force: true });
    await mkdir(testWorkspace, { recursive: true });

    eventEngine = new EventEngine();
    storageManager = new StorageManager(':memory:');
    await storageManager.initialize();
    
    queueManager = new QueueManager(eventEngine);
    performanceProfiler = new PerformanceProfiler();
    memoryOptimizer = new MemoryOptimizer();
    cacheManager = new CacheManager(':memory:');
    await cacheManager.initialize();
  });

  afterEach(async () => {
    await storageManager.close();
    await cacheManager.close();
    await rm(testWorkspace, { recursive: true, force: true });
  });

  describe('Event Processing Performance', () => {
    it('should handle 10,000 events within 5 seconds', async () => {
      const startTime = Date.now();
      const eventCount = 10000;
      let processedCount = 0;

      queueManager.on('event.processed', () => {
        processedCount++;
      });

      // Generate events
      for (let i = 0; i < eventCount; i++) {
        eventEngine.emit('performance.test', {
          id: `perf-${i}`,
          type: 'performance.test',
          timestamp: new Date(),
          category: 'test',
          severity: 'info',
          source: 'performance-test',
          data: { index: i, payload: 'x'.repeat(100) }
        });
      }

      // Wait for processing
      while (processedCount < eventCount && Date.now() - startTime < 5000) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const duration = Date.now() - startTime;
      
      expect(processedCount).toBe(eventCount);
      expect(duration).toBeLessThan(5000);
      
      console.log(`Processed ${eventCount} events in ${duration}ms`);
      console.log(`Average: ${(duration / eventCount).toFixed(2)}ms per event`);
    });

    it('should maintain low latency under load', async () => {
      const latencies: number[] = [];
      
      eventEngine.on('performance.test', (event) => {
        const latency = Date.now() - new Date(event.timestamp).getTime();
        latencies.push(latency);
      });

      // Generate sustained load
      const interval = setInterval(() => {
        for (let i = 0; i < 100; i++) {
          eventEngine.emit('performance.test', {
            id: `latency-${Date.now()}-${i}`,
            type: 'performance.test',
            timestamp: new Date(),
            category: 'test',
            severity: 'info',
            source: 'latency-test',
            data: {}
          });
        }
      }, 100);

      // Run for 3 seconds
      await new Promise(resolve => setTimeout(resolve, 3000));
      clearInterval(interval);

      // Calculate percentiles
      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];

      expect(p50).toBeLessThan(10); // 50th percentile < 10ms
      expect(p95).toBeLessThan(50); // 95th percentile < 50ms
      expect(p99).toBeLessThan(100); // 99th percentile < 100ms

      console.log(`Latency - P50: ${p50}ms, P95: ${p95}ms, P99: ${p99}ms`);
    });
  });

  describe('Memory Performance', () => {
    it('should optimize memory usage under pressure', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const largeData: any[] = [];

      // Create memory pressure
      for (let i = 0; i < 1000; i++) {
        largeData.push({
          id: i,
          data: Buffer.alloc(1024 * 10), // 10KB per object
          timestamp: new Date()
        });
        
        // Let optimizer work
        if (i % 100 === 0) {
          await memoryOptimizer.optimizeIfNeeded();
        }
      }

      const peakMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (peakMemory - initialMemory) / 1024 / 1024; // MB

      // Should use less than 50MB for 10MB of data (with overhead)
      expect(memoryIncrease).toBeLessThan(50);

      // Clean up and verify memory is released
      largeData.length = 0;
      global.gc && global.gc(); // Force GC if available
      await new Promise(resolve => setTimeout(resolve, 100));

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryReleased = (peakMemory - finalMemory) / 1024 / 1024;

      // Should release at least 80% of allocated memory
      expect(memoryReleased).toBeGreaterThan(memoryIncrease * 0.8);
    });

    it('should handle memory leaks prevention', async () => {
      const iterations = 100;
      const samples: number[] = [];

      for (let i = 0; i < iterations; i++) {
        // Simulate operations that could leak memory
        const monitor = new FileMonitor(testWorkspace, eventEngine);
        await monitor.start();
        
        // Create some events
        for (let j = 0; j < 10; j++) {
          eventEngine.emit('memory.test', {
            id: `mem-${i}-${j}`,
            type: 'memory.test',
            timestamp: new Date(),
            category: 'test',
            severity: 'info',
            source: 'memory-test',
            data: { large: 'x'.repeat(1000) }
          });
        }

        await monitor.stop();

        // Sample memory every 10 iterations
        if (i % 10 === 0) {
          global.gc && global.gc();
          samples.push(process.memoryUsage().heapUsed);
        }
      }

      // Check for memory growth trend
      const firstHalf = samples.slice(0, samples.length / 2);
      const secondHalf = samples.slice(samples.length / 2);
      
      const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      
      const growthRate = (avgSecond - avgFirst) / avgFirst;
      
      // Memory growth should be less than 10%
      expect(growthRate).toBeLessThan(0.1);
    });
  });

  describe('Cache Performance', () => {
    it('should achieve high cache hit rate', async () => {
      const keys = 1000;
      const accessCount = 10000;
      let hits = 0;
      let misses = 0;

      // Populate cache
      for (let i = 0; i < keys; i++) {
        await cacheManager.set(`key-${i}`, { data: `value-${i}` }, 3600);
      }

      // Random access pattern
      const startTime = Date.now();
      for (let i = 0; i < accessCount; i++) {
        const key = `key-${Math.floor(Math.random() * keys)}`;
        const value = await cacheManager.get(key);
        if (value) {
          hits++;
        } else {
          misses++;
        }
      }
      const duration = Date.now() - startTime;

      const hitRate = hits / accessCount;
      expect(hitRate).toBeGreaterThan(0.95); // 95% hit rate

      const opsPerSecond = accessCount / (duration / 1000);
      expect(opsPerSecond).toBeGreaterThan(10000); // 10k+ ops/sec

      console.log(`Cache performance: ${hitRate * 100}% hit rate, ${opsPerSecond.toFixed(0)} ops/sec`);
    });

    it('should handle cache invalidation efficiently', async () => {
      // Populate cache with tagged entries
      for (let i = 0; i < 1000; i++) {
        await cacheManager.set(
          `tagged-${i}`, 
          { data: i }, 
          3600,
          [`group-${i % 10}`]
        );
      }

      const startTime = Date.now();
      
      // Invalidate by tag
      await cacheManager.invalidateByTags(['group-5']);
      
      const invalidationTime = Date.now() - startTime;
      expect(invalidationTime).toBeLessThan(100); // Fast invalidation

      // Verify invalidation
      let invalidatedCount = 0;
      for (let i = 0; i < 1000; i++) {
        const value = await cacheManager.get(`tagged-${i}`);
        if (!value && i % 10 === 5) {
          invalidatedCount++;
        }
      }

      expect(invalidatedCount).toBe(100); // All group-5 entries invalidated
    });
  });

  describe('Storage Performance', () => {
    it('should handle bulk inserts efficiently', async () => {
      const eventRepo = storageManager.getEventRepository();
      const batchSize = 1000;
      const batches = 10;

      const startTime = Date.now();

      for (let batch = 0; batch < batches; batch++) {
        const events = [];
        for (let i = 0; i < batchSize; i++) {
          events.push({
            id: `bulk-${batch}-${i}`,
            type: 'bulk.test',
            timestamp: new Date(),
            category: 'test',
            severity: 'info' as const,
            source: 'bulk-test',
            data: { batch, index: i }
          });
        }
        
        await Promise.all(events.map(e => eventRepo.save(e)));
      }

      const duration = Date.now() - startTime;
      const totalEvents = batchSize * batches;
      const eventsPerSecond = totalEvents / (duration / 1000);

      expect(eventsPerSecond).toBeGreaterThan(1000); // 1000+ events/sec
      
      console.log(`Storage performance: ${eventsPerSecond.toFixed(0)} events/sec`);
    });

    it('should query large datasets efficiently', async () => {
      const eventRepo = storageManager.getEventRepository();
      
      // Insert test data
      const now = new Date();
      for (let i = 0; i < 5000; i++) {
        await eventRepo.save({
          id: `query-${i}`,
          type: 'query.test',
          timestamp: new Date(now.getTime() - i * 1000), // Spread over time
          category: 'test',
          severity: ['info', 'warning', 'error'][i % 3] as any,
          source: 'query-test',
          data: { index: i }
        });
      }

      // Test query performance
      const queryStart = Date.now();
      const results = await eventRepo.findByTimeRange(
        new Date(now.getTime() - 3600000), // Last hour
        now
      );
      const queryDuration = Date.now() - queryStart;

      expect(queryDuration).toBeLessThan(100); // Query under 100ms
      expect(results.length).toBeGreaterThan(0);

      // Test aggregation performance
      const aggStart = Date.now();
      const errorCount = results.filter(e => e.severity === 'error').length;
      const aggDuration = Date.now() - aggStart;

      expect(aggDuration).toBeLessThan(50); // Aggregation under 50ms
      
      console.log(`Query performance: ${results.length} records in ${queryDuration}ms`);
    });
  });

  describe('System Load Test', () => {
    it('should handle realistic workload', async () => {
      const testDuration = 10000; // 10 seconds
      const metrics = {
        events: 0,
        queries: 0,
        cacheOps: 0,
        errors: 0
      };

      const startTime = Date.now();

      // Simulate file monitoring
      const fileMonitor = new FileMonitor(testWorkspace, eventEngine);
      await fileMonitor.start();

      // Event processing
      eventEngine.on('*', () => metrics.events++);
      eventEngine.on('error.*', () => metrics.errors++);

      // Simulate continuous workload
      const workloadInterval = setInterval(async () => {
        // File operations
        const filename = `test-${Date.now()}.ts`;
        await writeFile(join(testWorkspace, filename), 'export const x = 1;');

        // Cache operations
        const cacheKey = `cache-${Date.now()}`;
        await cacheManager.set(cacheKey, { data: 'test' }, 60);
        await cacheManager.get(cacheKey);
        metrics.cacheOps += 2;

        // Database queries
        const events = await storageManager.getEventRepository()
          .findByTimeRange(
            new Date(Date.now() - 60000),
            new Date()
          );
        metrics.queries++;

        // Generate some events
        for (let i = 0; i < 10; i++) {
          eventEngine.emit('workload.test', {
            id: `workload-${Date.now()}-${i}`,
            type: 'workload.test',
            timestamp: new Date(),
            category: 'test',
            severity: 'info',
            source: 'workload',
            data: {}
          });
        }
      }, 100);

      // Run test
      await new Promise(resolve => setTimeout(resolve, testDuration));
      clearInterval(workloadInterval);
      await fileMonitor.stop();

      const duration = Date.now() - startTime;
      const opsPerSecond = (metrics.events + metrics.queries + metrics.cacheOps) / (duration / 1000);

      expect(metrics.errors).toBe(0); // No errors under load
      expect(opsPerSecond).toBeGreaterThan(100); // 100+ ops/sec

      console.log('Load test results:', {
        duration: `${duration}ms`,
        events: metrics.events,
        queries: metrics.queries,
        cacheOps: metrics.cacheOps,
        errors: metrics.errors,
        opsPerSecond: opsPerSecond.toFixed(0)
      });
    });
  });
});