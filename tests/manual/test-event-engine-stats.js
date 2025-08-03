#!/usr/bin/env node

/**
 * EventEngine Statistics Test
 * Tests the EventEngine statistics and integration
 */

import { spawn } from 'child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

// Direct import to check EventEngine stats
import { eventEngine } from '../../dist/events/engine.js';

// Test directory
const TEST_DIR = join(projectRoot, 'test-event-stats');

// Create test directory
if (!existsSync(TEST_DIR)) {
  mkdirSync(TEST_DIR, { recursive: true });
}

console.log('🧪 Starting EventEngine Statistics Test');
console.log('📂 Test directory:', TEST_DIR);

// Start the MCP server
const serverPath = join(projectRoot, 'dist', 'server', 'index.js');
const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: projectRoot,
  env: { ...process.env, EVENT_STATS_TEST: 'true' }
});

let serverReady = false;

// Handle server output
server.stderr.on('data', (data) => {
  const output = data.toString();
  console.log('🖥️  Server:', output.trim());
  
  if (output.includes('File monitoring ready')) {
    serverReady = true;
    runTests();
  }
});

server.on('error', (error) => {
  console.error('❌ Failed to start server:', error);
  cleanup();
  process.exit(1);
});

// Test scenarios
async function runTests() {
  console.log('\n📋 Running EventEngine statistics tests...\n');

  try {
    // Wait for server to be fully ready
    await sleep(1000);
    
    // Get initial statistics
    console.log('📊 Initial EventEngine Statistics:');
    let stats = eventEngine.getStatistics();
    console.log(JSON.stringify(stats, null, 2));
    console.log(`📈 Queue size: ${eventEngine.getQueueSize()}`);
    console.log(`👥 Subscriber count: ${eventEngine.getSubscriberCount()}\n`);
    
    // Test 1: Create multiple files
    console.log('1️⃣ Creating multiple files...');
    for (let i = 0; i < 5; i++) {
      writeFileSync(join(TEST_DIR, `test-${i}.ts`), `console.log(${i});`);
      await sleep(200);
    }
    await sleep(1000);
    
    // Test 2: Create config files
    console.log('2️⃣ Creating config files...');
    writeFileSync(join(TEST_DIR, 'config.json'), '{"test": true}');
    writeFileSync(join(TEST_DIR, 'tsconfig.json'), '{"compilerOptions": {}}');
    await sleep(1000);
    
    // Test 3: Create test files
    console.log('3️⃣ Creating test files...');
    writeFileSync(join(TEST_DIR, 'test.spec.ts'), 'describe("test", () => {});');
    writeFileSync(join(TEST_DIR, 'another.test.js'), 'test("sample", () => {});');
    await sleep(1000);
    
    // Test 4: Rapid changes (test deduplication)
    console.log('4️⃣ Testing rapid changes...');
    const rapidFile = join(TEST_DIR, 'rapid.js');
    for (let i = 0; i < 10; i++) {
      writeFileSync(rapidFile, `// Rapid change ${i}`);
      await sleep(50);
    }
    await sleep(1500);
    
    // Get final statistics
    console.log('\n📊 Final EventEngine Statistics:');
    stats = eventEngine.getStatistics();
    console.log(JSON.stringify(stats, null, 2));
    console.log(`📈 Queue size: ${eventEngine.getQueueSize()}`);
    console.log(`👥 Subscriber count: ${eventEngine.getSubscriberCount()}`);
    
    // Analyze results
    console.log('\n📋 Analysis:');
    console.log(`✅ Total events processed: ${stats.totalEvents}`);
    console.log(`📁 File events: ${stats.eventsByCategory.file || 0}`);
    console.log(`🔧 System events: ${stats.eventsByCategory.system || 0}`);
    console.log(`📊 Events per hour: ${stats.eventsPerHour}`);
    
    // Check MCP activity log
    console.log('\n🔍 Checking MCP activity log...');
    const activityLog = await checkActivityLog();
    
    console.log('\n✅ Test completed!');
    
    // Give some time to see the results
    await sleep(2000);
    
  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    cleanup();
  }
}

// Send JSON-RPC request to check activity log
async function checkActivityLog() {
  return new Promise((resolve) => {
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'getActivityLog',
        arguments: { limit: 50 }
      }
    };
    
    const responseHandler = (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.id === request.id) {
          server.stdout.off('data', responseHandler);
          
          if (response.result && response.result.content) {
            const content = JSON.parse(response.result.content[0].text);
            console.log(`📋 MCP Activity Log: ${content.totalCount} activities`);
            
            // Count by type
            const typeCounts = {};
            content.activities.forEach(a => {
              typeCounts[a.action] = (typeCounts[a.action] || 0) + 1;
            });
            console.log('📊 Activity types:', JSON.stringify(typeCounts, null, 2));
            
            resolve(content);
          }
        }
      } catch (error) {
        // Ignore parsing errors
      }
    };
    
    server.stdout.on('data', responseHandler);
    server.stdin.write(JSON.stringify(request) + '\n');
  });
}

// Helper function to sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Cleanup function
function cleanup() {
  console.log('\n🧹 Cleaning up...');
  
  // Kill the server
  server.kill();
  
  // Remove test directory
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  
  console.log('✨ Done!');
  process.exit(0);
}

// Handle exit
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);