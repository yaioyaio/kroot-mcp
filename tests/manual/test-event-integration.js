#!/usr/bin/env node

/**
 * Event System Integration Test
 * Tests the complete integration of EventEngine with MCP
 */

import { spawn } from 'child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

// Test directory
const TEST_DIR = join(projectRoot, 'test-integration');

// Create test directory
if (!existsSync(TEST_DIR)) {
  mkdirSync(TEST_DIR, { recursive: true });
}

console.log('🧪 Starting Event System Integration Test');
console.log('📂 Test directory:', TEST_DIR);

// Start the MCP server
const serverPath = join(projectRoot, 'dist', 'server', 'index.js');
const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: projectRoot,
  env: { ...process.env }
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

// Send JSON-RPC request
async function sendRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    };
    
    const timeout = setTimeout(() => {
      reject(new Error('Request timeout'));
    }, 5000);
    
    const responseHandler = (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.id === request.id) {
          clearTimeout(timeout);
          server.stdout.off('data', responseHandler);
          
          if (response.error) {
            reject(response.error);
          } else {
            resolve(response.result);
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

// Test scenarios
async function runTests() {
  console.log('\n📋 Running integration tests...\n');

  try {
    // Wait for server to be fully ready
    await sleep(1000);
    
    // Test 1: Check initial event statistics
    console.log('1️⃣ Checking initial EventEngine statistics...');
    let statsResult = await sendRequest('tools/call', {
      name: 'getEventStatistics',
      arguments: {}
    });
    let stats = JSON.parse(statsResult.content[0].text);
    console.log('Initial stats:', JSON.stringify(stats, null, 2));
    
    // Test 2: Create some files
    console.log('\n2️⃣ Creating test files...');
    writeFileSync(join(TEST_DIR, 'test1.ts'), 'console.log("test1");');
    writeFileSync(join(TEST_DIR, 'test2.js'), 'console.log("test2");');
    writeFileSync(join(TEST_DIR, 'config.json'), '{"test": true}');
    await sleep(1000);
    
    // Test 3: Check updated statistics
    console.log('\n3️⃣ Checking updated EventEngine statistics...');
    statsResult = await sendRequest('tools/call', {
      name: 'getEventStatistics',
      arguments: {}
    });
    stats = JSON.parse(statsResult.content[0].text);
    console.log('Updated stats:', JSON.stringify(stats, null, 2));
    
    // Test 4: Check activity log
    console.log('\n4️⃣ Checking activity log...');
    const activityResult = await sendRequest('tools/call', {
      name: 'getActivityLog',
      arguments: { limit: 20 }
    });
    const activities = JSON.parse(activityResult.content[0].text);
    console.log(`Total activities: ${activities.totalCount}`);
    console.log(`Recent activities: ${activities.activities.length}`);
    
    // Count event types
    const eventTypes = {};
    activities.activities.forEach(a => {
      eventTypes[a.action] = (eventTypes[a.action] || 0) + 1;
    });
    console.log('Event types:', eventTypes);
    
    // Test 5: Create test files to trigger context events
    console.log('\n5️⃣ Creating context-specific files...');
    writeFileSync(join(TEST_DIR, 'test.spec.ts'), 'describe("test", () => {});');
    mkdirSync(join(TEST_DIR, 'docs'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'docs', 'README.md'), '# Test Docs');
    await sleep(1000);
    
    // Test 6: Final statistics
    console.log('\n6️⃣ Final EventEngine statistics...');
    statsResult = await sendRequest('tools/call', {
      name: 'getEventStatistics',
      arguments: {}
    });
    stats = JSON.parse(statsResult.content[0].text);
    console.log('Final stats:', JSON.stringify(stats, null, 2));
    
    // Analysis
    console.log('\n📊 Test Analysis:');
    console.log(`✅ Total events: ${stats.eventEngine.statistics.totalEvents}`);
    console.log(`📁 File events: ${stats.eventEngine.statistics.eventsByCategory.file || 0}`);
    console.log(`📈 Queue size: ${stats.eventEngine.queueSize}`);
    console.log(`👥 Subscribers: ${stats.eventEngine.subscriberCount}`);
    
    // Verify integration
    const success = stats.eventEngine.statistics.totalEvents > 0 && 
                   stats.eventEngine.statistics.eventsByCategory.file > 0 &&
                   stats.eventEngine.subscriberCount > 0;
    
    if (success) {
      console.log('\n✅ Integration test PASSED!');
    } else {
      console.log('\n❌ Integration test FAILED!');
      console.log('Expected events to be captured by EventEngine');
    }
    
    await sleep(2000);
    
  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    cleanup();
  }
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