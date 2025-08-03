#!/usr/bin/env node

/**
 * Storage layer test script
 */

import { getStorageManager } from '../dist/storage/index.js';
import { EventEngine } from '../dist/events/engine.js';
import { EventCategory, EventSeverity } from '../dist/events/types/index.js';
import { randomUUID } from 'crypto';

console.log('=== DevFlow Monitor Storage Test ===\n');

// Initialize components
const eventEngine = new EventEngine();
const storageManager = getStorageManager({
  path: './data/test-devflow.db',
  verbose: true,
});

// Connect storage to event engine
storageManager.connectEventEngine(eventEngine);

console.log('Storage manager initialized and connected to EventEngine\n');

// Test 1: Publish various events
console.log('Test 1: Publishing test events...');

const testEvents = [
  {
    id: randomUUID(),
    type: 'file:changed',
    category: EventCategory.FILE,
    timestamp: new Date(),
    severity: EventSeverity.INFO,
    source: 'test-script',
    data: {
      filePath: '/src/test.ts',
      fileHash: 'abc123',
      fileSize: 1024,
      action: 'modified'
    },
    metadata: {
      userId: 'test-user',
      deviceId: 'test-device'
    }
  },
  {
    id: randomUUID(),
    type: 'activity:created',
    category: EventCategory.ACTIVITY,
    timestamp: new Date(),
    severity: EventSeverity.INFO,
    source: 'test-script',
    data: {
      stage: 'coding',
      action: 'file_save',
      details: 'Saved test.ts file',
      actor: 'developer'
    }
  },
  {
    id: randomUUID(),
    type: 'stage:transition',
    category: EventCategory.STAGE,
    timestamp: new Date(),
    severity: EventSeverity.NOTICE,
    source: 'test-script',
    data: {
      fromStage: 'planning',
      toStage: 'coding',
      confidence: 0.85
    }
  },
  {
    id: randomUUID(),
    type: 'git:commit',
    category: EventCategory.GIT,
    timestamp: new Date(),
    severity: EventSeverity.INFO,
    source: 'test-script',
    data: {
      action: 'commit',
      stage: 'coding',
      actor: 'developer',
      details: 'feat: Add new feature'
    }
  }
];

// Publish events
for (const event of testEvents) {
  eventEngine.publish(event);
  console.log(`Published ${event.type} event`);
}

// Wait for events to be processed
await new Promise(resolve => setTimeout(resolve, 1000));

console.log('\nTest 2: Querying stored data...');

// Test 2: Query events
const repos = storageManager.repositories;

// Get event statistics
const eventStats = await repos.events.getStatistics();
console.log('\nEvent Statistics:', JSON.stringify(eventStats, null, 2));

// Get recent events
const recentEvents = await repos.events.findAll({ limit: 5, orderBy: 'timestamp', orderDirection: 'DESC' });
console.log(`\nFound ${recentEvents.length} recent events`);

// Get activities by stage
const codingActivities = await repos.activities.findByStage('coding');
console.log(`\nFound ${codingActivities.length} coding activities`);

// Get stage transitions
const transitions = await repos.stageTransitions.findAll();
console.log(`\nFound ${transitions.length} stage transitions`);

// Get file cache stats
const cacheStats = await repos.fileMonitorCache.getStatistics();
console.log('\nFile Cache Statistics:', JSON.stringify(cacheStats, null, 2));

// Test 3: Storage statistics
console.log('\nTest 3: Getting storage statistics...');
const storageStats = await storageManager.getStatistics();
console.log('\nStorage Statistics:', JSON.stringify(storageStats, null, 2));

// Test 4: Test metrics
console.log('\nTest 4: Testing metrics repository...');

// Create some test metrics
const metricsData = [
  {
    metric_type: 'performance',
    metric_name: 'response_time',
    value: 125.5,
    timestamp: Date.now(),
    timeframe: '1h'
  },
  {
    metric_type: 'performance',
    metric_name: 'response_time',
    value: 130.2,
    timestamp: Date.now() - 3600000, // 1 hour ago
    timeframe: '1h'
  },
  {
    metric_type: 'quality',
    metric_name: 'test_coverage',
    value: 85.3,
    timestamp: Date.now(),
    timeframe: '1d'
  }
];

for (const metric of metricsData) {
  await repos.metrics.create(metric);
  console.log(`Created ${metric.metric_type}:${metric.metric_name} metric`);
}

// Query metrics
const performanceMetrics = await repos.metrics.findByType('performance');
console.log(`\nFound ${performanceMetrics.length} performance metrics`);

const avgResponseTime = await repos.metrics.getAggregated(
  'performance',
  'response_time',
  Date.now() - 86400000, // 24 hours ago
  Date.now(),
  'avg'
);
console.log(`Average response time (24h): ${avgResponseTime}ms`);

// Test 5: Database backup
console.log('\nTest 5: Testing database backup...');
try {
  await storageManager.backup('./data/test-devflow-backup.db');
  console.log('Database backup created successfully');
} catch (error) {
  console.error('Backup failed:', error.message);
}

// Test 6: Clean old data
console.log('\nTest 6: Testing data cleanup...');
const cleanupResults = await storageManager.cleanOldData(30);
console.log('Cleanup results:', cleanupResults);

// Cleanup
console.log('\n=== Test Complete ===');

// Show final statistics
const finalStats = await storageManager.getStatistics();
console.log('\nFinal Database Statistics:');
console.log(`- Tables: ${finalStats.database.tables}`);
console.log(`- Total Rows: ${finalStats.database.totalRows}`);
console.log(`- File Size: ${finalStats.database.fileSize ? (finalStats.database.fileSize / 1024).toFixed(2) + ' KB' : 'N/A'}`);

// Close connections
storageManager.close();
console.log('\nConnections closed. Test complete.');