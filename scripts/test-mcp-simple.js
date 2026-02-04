// Simple MCP test script
import { spawn } from 'child_process';

console.log('🧪 Testing MCP Server...\n');

// Test 1: Basic initialization
console.log('1. Testing initialization...');
const init = spawn('node', ['dist/server/index.js']);

// Send initialization request
const initRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test", version: "1.0.0" }
  }
};

let responseCount = 0;
let initSuccess = false;
let toolsFound = 0;

init.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(line => line.trim());
  
  lines.forEach(line => {
    try {
      const response = JSON.parse(line);
      responseCount++;
      
      if (response.result && response.result.protocolVersion) {
        console.log('✅ Initialization successful');
        initSuccess = true;
        
        // Send tools/list request
        const toolsRequest = {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list"
        };
        init.stdin.write(JSON.stringify(toolsRequest) + '\n');
      }
      
      if (response.result && response.result.tools) {
        toolsFound = response.result.tools.length;
        console.log(`✅ Tools list successful - Found ${toolsFound} tools`);
        
        // Send tool call request
        const toolCallRequest = {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "getProjectStatus",
            arguments: {}
          }
        };
        init.stdin.write(JSON.stringify(toolCallRequest) + '\n');
      }
      
      if (response.id === 3 && response.result) {
        console.log('✅ Tool execution successful');
        console.log('\n✨ All tests passed!');
        init.kill();
        process.exit(0);
      }
      
    } catch (e) {
      // Ignore non-JSON output
    }
  });
});

init.stderr.on('data', (data) => {
  console.error('❌ Error:', data.toString());
});

init.on('close', (code) => {
  if (!initSuccess) {
    console.log('❌ Server failed to initialize properly');
    process.exit(1);
  }
});

// Send initial request
setTimeout(() => {
  init.stdin.write(JSON.stringify(initRequest) + '\n');
}, 100);

// Timeout after 5 seconds
setTimeout(() => {
  console.log('\n❌ Test timed out after 5 seconds');
  init.kill();
  process.exit(1);
}, 5000);