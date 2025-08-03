#!/usr/bin/env node

/**
 * Event System Test Script
 * Tests the EventEngine and event flow
 */

import { spawn } from 'child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

// Test directory
const TEST_DIR = join(projectRoot, 'test-event-system');

// Create test directory
if (!existsSync(TEST_DIR)) {
  mkdirSync(TEST_DIR, { recursive: true });
}

console.log('🧪 Starting Event System Test');
console.log('📂 Test directory:', TEST_DIR);

// Start the MCP server
const serverPath = join(projectRoot, 'dist', 'server', 'index.js');
const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: projectRoot,
  env: { ...process.env, EVENT_SYSTEM_TEST: 'true' }
});

let serverReady = false;
let eventsReceived = [];

// Handle server output
server.stderr.on('data', (data) => {
  const output = data.toString();
  console.log('🖥️  Server:', output.trim());
  
  if (output.includes('File monitoring ready')) {
    serverReady = true;
    runTests();
  }
  
  // Capture event system logs
  if (output.includes('[EventEngine]') || output.includes('File event:')) {
    eventsReceived.push(output.trim());
  }
});

server.on('error', (error) => {
  console.error('❌ Failed to start server:', error);
  cleanup();
  process.exit(1);
});

// Send JSON-RPC request to check activity log
async function checkActivityLog() {
  return new Promise((resolve) => {
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'getActivityLog',
        arguments: { limit: 20 }
      }
    };
    
    const responseHandler = (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.id === request.id) {
          server.stdout.off('data', responseHandler);
          
          if (response.result && response.result.content) {
            const content = JSON.parse(response.result.content[0].text);
            console.log('\n📋 Activity Log Summary:');
            console.log(`   Total activities: ${content.totalCount}`);
            console.log(`   Recent events: ${content.activities.length}`);
            
            // Show event types
            const eventTypes = new Set(content.activities.map(a => a.action));
            console.log(`   Event types: ${Array.from(eventTypes).join(', ')}`);
            
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

// Test scenarios
async function runTests() {
  console.log('\n📋 Running event system tests...\n');

  try {
    // Wait for server to be fully ready
    await sleep(1000);
    
    // Test 1: File creation event
    console.log('1️⃣ Testing file creation event...');
    writeFileSync(join(TEST_DIR, 'test-file.ts'), 'console.log("test");');
    await sleep(1000);
    
    // Test 2: File modification event
    console.log('2️⃣ Testing file modification event...');
    writeFileSync(join(TEST_DIR, 'test-file.ts'), 'console.log("modified");');
    await sleep(1000);
    
    // Test 3: Test file context detection
    console.log('3️⃣ Testing test file context detection...');
    writeFileSync(join(TEST_DIR, 'test.spec.ts'), 'describe("test", () => {});');
    await sleep(1000);
    
    // Test 4: Config file context detection
    console.log('4️⃣ Testing config file context detection...');
    writeFileSync(join(TEST_DIR, 'config.json'), '{"test": true}');
    await sleep(1000);
    
    // Test 5: Documentation context detection
    console.log('5️⃣ Testing documentation context detection...');
    mkdirSync(join(TEST_DIR, 'docs'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'docs', 'README.md'), '# Test Documentation');
    await sleep(1000);
    
    // Test 6: Directory creation
    console.log('6️⃣ Testing directory creation event...');
    mkdirSync(join(TEST_DIR, 'src', 'components'), { recursive: true });
    await sleep(1000);
    
    // Test 7: Multiple rapid file changes (test deduplication)
    console.log('7️⃣ Testing event deduplication...');
    for (let i = 0; i < 5; i++) {
      writeFileSync(join(TEST_DIR, 'rapid-test.js'), `console.log(${i});`);
      await sleep(100); // Rapid changes
    }
    await sleep(1000);
    
    // Test 8: File deletion
    console.log('8️⃣ Testing file deletion event...');
    rmSync(join(TEST_DIR, 'test-file.ts'));
    await sleep(1000);
    
    // Check activity log
    console.log('\n🔍 Checking activity log via MCP...');
    const activityLog = await checkActivityLog();
    
    // Display captured events
    console.log('\n📊 Event System Statistics:');
    console.log(`   Events captured: ${eventsReceived.length}`);
    
    if (eventsReceived.length > 0) {
      console.log('\n   Sample events:');
      eventsReceived.slice(0, 5).forEach((event, index) => {
        console.log(`   ${index + 1}. ${event}`);
      });
    }
    
    console.log('\n✅ All tests completed!');
    
    // Give some time to see the results
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