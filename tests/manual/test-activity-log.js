#!/usr/bin/env node

/**
 * Test Activity Log with File Monitoring
 * This script tests if file changes are properly captured in activity log
 */

import { spawn } from 'child_process';
import { writeFileSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

const testFile = join(projectRoot, 'test-activity.ts');

console.log('🧪 Testing Activity Log with File Monitoring\n');

// Start the MCP server
const serverPath = join(projectRoot, 'dist', 'server', 'index.js');
const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env }
});

let serverReady = false;

// Capture server output
server.stderr.on('data', (data) => {
  const output = data.toString();
  if (output.includes('File monitoring ready')) {
    serverReady = true;
    console.log('✅ Server started with file monitoring\n');
    runTest();
  }
});

server.on('error', (error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

// Send JSON-RPC request
function sendRequest(method, params = {}) {
  const request = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params
  };
  
  server.stdin.write(JSON.stringify(request) + '\n');
}

// Parse server response
server.stdout.on('data', (data) => {
  try {
    const response = JSON.parse(data.toString());
    if (response.result && response.result.content) {
      const content = JSON.parse(response.result.content[0].text);
      console.log('📋 Activity Log Response:');
      console.log(`   Total activities: ${content.totalCount}`);
      if (content.activities.length > 0) {
        console.log('\n   Recent activities:');
        content.activities.forEach((activity, index) => {
          console.log(`   ${index + 1}. [${activity.stage}] ${activity.action}: ${activity.details}`);
          console.log(`      Time: ${activity.timestamp}`);
          console.log(`      Path: ${activity.metadata?.path || 'N/A'}\n`);
        });
      }
    }
  } catch (error) {
    // Ignore non-JSON output
  }
});

async function runTest() {
  try {
    // Wait for server to be fully ready
    await sleep(1000);
    
    console.log('1️⃣ Creating test file...');
    writeFileSync(testFile, 'console.log("test activity");');
    await sleep(1000);
    
    console.log('2️⃣ Modifying test file...');
    writeFileSync(testFile, 'console.log("modified activity");');
    await sleep(1000);
    
    console.log('3️⃣ Requesting activity log...\n');
    sendRequest('tools/call', {
      name: 'getActivityLog',
      arguments: { limit: 10 }
    });
    
    // Wait for response
    await sleep(2000);
    
    // Cleanup
    console.log('4️⃣ Cleaning up...');
    if (existsSync(testFile)) {
      rmSync(testFile);
    }
    
    await sleep(1000);
    server.kill();
    console.log('\n✅ Test completed!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Test error:', error);
    server.kill();
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}