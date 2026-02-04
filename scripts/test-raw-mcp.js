#!/usr/bin/env node
// Raw MCP test - capture all output

import { spawn } from 'child_process';
import { writeFileSync } from 'fs';

const server = spawn('node', ['dist/server/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';

server.stdout.on('data', (data) => {
  stdout += data.toString();
});

server.stderr.on('data', (data) => {
  stderr += data.toString();
});

server.on('close', () => {
  writeFileSync('mcp-stdout.log', stdout);
  writeFileSync('mcp-stderr.log', stderr);
  
  console.log('Logs saved to mcp-stdout.log and mcp-stderr.log');
  
  // Parse stdout for JSON responses
  const lines = stdout.split('\n');
  let jsonCount = 0;
  
  lines.forEach((line, idx) => {
    if (line.trim() && line.startsWith('{')) {
      try {
        const json = JSON.parse(line);
        console.log(`\nJSON Response ${++jsonCount}:`);
        console.log(JSON.stringify(json, null, 2));
      } catch (e) {
        // Not JSON
      }
    }
  });
});

// Send requests
setTimeout(() => {
  console.log('Sending initialize...');
  server.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "raw-test", version: "1.0.0" }
    }
  }) + '\n');
}, 100);

setTimeout(() => {
  console.log('Sending tools/list...');
  server.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list"
  }) + '\n');
}, 1500);

setTimeout(() => {
  console.log('Killing server...');
  server.kill();
}, 3000);