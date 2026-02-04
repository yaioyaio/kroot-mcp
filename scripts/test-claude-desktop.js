#!/usr/bin/env node
// Test script simulating Claude Desktop environment

import { spawn } from 'child_process';

console.log('🧪 Testing MCP Server in Claude Desktop-like environment...\n');

// Simulate Claude Desktop environment with CWD = /
const absolutePath = '/Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/dist/server/index.js';
const server = spawn('node', [absolutePath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: '/', // Simulate Claude Desktop environment
  env: { ...process.env, NODE_ENV: 'production' }
});

let initSuccess = false;
let toolsSuccess = false;

server.stdout.on('data', (data) => {
  const lines = data.toString().split('\n');
  lines.forEach(line => {
    if (line.trim() && line.startsWith('{')) {
      try {
        const response = JSON.parse(line);
        if (response.result && response.result.protocolVersion) {
          initSuccess = true;
          console.log('✅ Initialization successful');
        }
        if (response.result && response.result.tools) {
          toolsSuccess = true;
          console.log(`✅ Tools list successful: ${response.result.tools.length} tools`);
        }
      } catch (e) {
        // Ignore non-JSON
      }
    }
  });
});

server.stderr.on('data', (data) => {
  const text = data.toString();
  if (text.includes('Error') || text.includes('ENOENT')) {
    console.error('❌ ERROR:', text.trim());
  }
});

server.on('close', (code) => {
  if (code !== 0) {
    console.log(`\n❌ Server exited with code ${code}`);
  }
  
  console.log('\n📊 Test Results:');
  console.log(`   Initialization: ${initSuccess ? '✅' : '❌'}`);
  console.log(`   Tools List: ${toolsSuccess ? '✅' : '❌'}`);
  
  process.exit(code === 0 && initSuccess ? 0 : 1);
});

// Send test requests
setTimeout(() => {
  console.log('Sending initialize request...');
  server.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "claude-ai", version: "0.1.0" }
    }
  }) + '\n');
}, 500);

setTimeout(() => {
  console.log('Sending tools/list request...');
  server.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list"
  }) + '\n');
}, 1500);

setTimeout(() => {
  server.kill();
}, 3000);