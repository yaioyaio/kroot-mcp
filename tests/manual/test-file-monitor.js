#!/usr/bin/env node

/**
 * File Monitor Test Script
 * Tests the file monitoring functionality
 */

import { spawn } from 'child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

// Test directory
const TEST_DIR = join(projectRoot, 'test-monitor-files');

// Create test directory
if (!existsSync(TEST_DIR)) {
  mkdirSync(TEST_DIR, { recursive: true });
}

console.log('🧪 Starting File Monitor Test');
console.log('📂 Test directory:', TEST_DIR);

// Start the MCP server
const serverPath = join(projectRoot, 'dist', 'server', 'index.js');
const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, FILE_MONITOR_TEST: 'true' }
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
  console.log('\n📋 Running file monitoring tests...\n');

  try {
    // Test 1: Create a TypeScript file
    console.log('1️⃣ Testing TypeScript file creation...');
    writeFileSync(join(TEST_DIR, 'test.ts'), 'console.log("test");');
    await sleep(500);

    // Test 2: Modify the file
    console.log('2️⃣ Testing file modification...');
    writeFileSync(join(TEST_DIR, 'test.ts'), 'console.log("modified");');
    await sleep(500);

    // Test 3: Create a config file
    console.log('3️⃣ Testing config file creation...');
    writeFileSync(join(TEST_DIR, 'config.json'), '{"test": true}');
    await sleep(500);

    // Test 4: Create a markdown file
    console.log('4️⃣ Testing documentation file creation...');
    writeFileSync(join(TEST_DIR, 'README.md'), '# Test Documentation');
    await sleep(500);

    // Test 5: Create a test file
    console.log('5️⃣ Testing test file creation...');
    writeFileSync(join(TEST_DIR, 'test.spec.ts'), 'describe("test", () => {});');
    await sleep(500);

    // Test 6: Create a file with ignored extension
    console.log('6️⃣ Testing ignored file (should not trigger event)...');
    writeFileSync(join(TEST_DIR, 'test.log'), 'log content');
    await sleep(500);

    // Test 7: Delete a file
    console.log('7️⃣ Testing file deletion...');
    rmSync(join(TEST_DIR, 'test.ts'));
    await sleep(500);

    // Test 8: Create a directory
    console.log('8️⃣ Testing directory creation...');
    mkdirSync(join(TEST_DIR, 'src'), { recursive: true });
    await sleep(500);

    // Test 9: Create nested file
    console.log('9️⃣ Testing nested file creation...');
    writeFileSync(join(TEST_DIR, 'src', 'index.ts'), 'export {};');
    await sleep(500);

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