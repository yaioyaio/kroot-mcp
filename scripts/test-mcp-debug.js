#!/usr/bin/env node
// MCP Debug test - tools/list issue

import { spawn } from 'child_process';

console.log('🔍 Debugging MCP tools/list issue...\n');

const server = spawn('node', ['dist/server/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'test', DEBUG: '*' }
});

// Collect all output
let allOutput = '';

server.stdout.on('data', (data) => {
  const text = data.toString();
  allOutput += text;
  
  // Parse JSON-RPC responses only
  const lines = text.split('\n');
  lines.forEach(line => {
    if (line.trim() && line.startsWith('{')) {
      try {
        const msg = JSON.parse(line);
        console.log('📥 STDOUT JSON:', JSON.stringify(msg, null, 2));
      } catch (e) {
        // Not JSON
      }
    }
  });
});

server.stderr.on('data', (data) => {
  const text = data.toString();
  // Filter out noise
  if (!text.includes('[DEBUG]') && !text.includes('[INFO]') && 
      !text.includes('FileMonitor') && !text.includes('Database')) {
    console.error('⚠️  STDERR:', text);
  }
});

server.on('error', (err) => {
  console.error('❌ Server process error:', err);
});

// Test sequence
async function runDebugTest() {
  console.log('1️⃣  Sending initialize...');
  server.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "debug-test", version: "1.0.0" }
    }
  }) + '\n');
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('\n2️⃣  Sending tools/list...');
  server.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  }) + '\n');
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('\n3️⃣  Trying different variations...');
  
  // Try without params
  server.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/list"
  }) + '\n');
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Try with empty string method
  server.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 4,
    method: "list_tools"
  }) + '\n');
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('\n📊 Test complete. Killing server...');
  server.kill();
}

runDebugTest().catch(err => {
  console.error('Test error:', err);
  server.kill();
});