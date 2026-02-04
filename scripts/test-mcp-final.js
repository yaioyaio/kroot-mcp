#!/usr/bin/env node
// Final MCP test script with proper error handling

import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🧪 Testing MCP Server...\n');

// Start the server
const server = spawn('node', ['dist/server/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'test' }
});

let testResults = {
  initialization: false,
  toolsList: false,
  toolExecution: false,
  toolCount: 0
};

// Collect all stdout data
let stdoutBuffer = '';
let stderrBuffer = '';

server.stdout.on('data', (data) => {
  const text = data.toString();
  stdoutBuffer += text;
  
  // Parse JSON-RPC responses
  const lines = text.split('\n').filter(line => line.trim());
  lines.forEach(line => {
    try {
      const response = JSON.parse(line);
      
      // Check initialization response
      if (response.id === 1 && response.result && response.result.protocolVersion) {
        testResults.initialization = true;
        console.log('✅ Initialization successful');
        console.log(`   Protocol: ${response.result.protocolVersion}`);
        console.log(`   Server: ${response.result.serverInfo?.name || 'Unknown'} v${response.result.serverInfo?.version || 'Unknown'}`);
      }
      
      // Check tools list response
      if (response.id === 2 && response.result && response.result.tools) {
        testResults.toolsList = true;
        testResults.toolCount = response.result.tools.length;
        console.log(`\n✅ Tools list successful`);
        console.log(`   Found ${testResults.toolCount} tools`);
        
        // List first 5 tools
        const toolNames = response.result.tools.slice(0, 5).map(t => t.name);
        console.log(`   First 5 tools: ${toolNames.join(', ')}...`);
      }
      
      // Check tool execution response
      if (response.id === 3 && response.result) {
        testResults.toolExecution = true;
        console.log(`\n✅ Tool execution successful`);
        console.log(`   Response length: ${JSON.stringify(response.result).length} characters`);
      }
      
    } catch (e) {
      // Ignore non-JSON lines
    }
  });
});

server.stderr.on('data', (data) => {
  stderrBuffer += data.toString();
});

server.on('close', (code) => {
  console.log(`\n📊 Test Results:`);
  console.log(`   Initialization: ${testResults.initialization ? '✅' : '❌'}`);
  console.log(`   Tools List: ${testResults.toolsList ? '✅' : '❌'}`);
  console.log(`   Tool Execution: ${testResults.toolExecution ? '✅' : '❌'}`);
  
  if (testResults.initialization && testResults.toolsList && testResults.toolExecution) {
    console.log(`\n✨ All tests passed! (${testResults.toolCount} tools available)`);
    process.exit(0);
  } else {
    console.log(`\n❌ Some tests failed`);
    if (stderrBuffer.length > 0) {
      console.log('\nError output (first 500 chars):');
      console.log(stderrBuffer.substring(0, 500));
    }
    process.exit(1);
  }
});

// Send test requests
async function runTests() {
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // 1. Initialize
  console.log('1. Testing initialization...');
  server.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" }
    }
  }) + '\n');
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // 2. List tools
  console.log('\n2. Testing tools list...');
  server.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list"
  }) + '\n');
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // 3. Execute a tool
  console.log('\n3. Testing tool execution (getProjectStatus)...');
  server.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "getProjectStatus",
      arguments: {}
    }
  }) + '\n');
  
  // Wait for responses
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Kill server
  server.kill();
}

// Run tests with timeout
const timeout = setTimeout(() => {
  console.log('\n❌ Test timed out after 10 seconds');
  server.kill();
  process.exit(1);
}, 10000);

runTests().catch(err => {
  console.error('Test error:', err);
  server.kill();
  process.exit(1);
});