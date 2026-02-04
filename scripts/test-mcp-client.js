// Node.js 기반 MCP 클라이언트 테스트
import { spawn } from 'child_process';

class MCPTestClient {
  constructor() {
    this.server = null;
    this.requestId = 0;
  }

  start() {
    this.server = spawn('node', ['dist/server/index.js']);
    
    this.server.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      lines.forEach(line => {
        try {
          const response = JSON.parse(line);
          console.log('📥 Response:', JSON.stringify(response, null, 2));
        } catch (e) {
          // Ignore non-JSON output
        }
      });
    });

    this.server.stderr.on('data', (data) => {
      console.error('❌ Error:', data.toString());
    });

    this.server.on('close', (code) => {
      console.log(`Server exited with code ${code}`);
    });
  }

  sendRequest(method, params = {}) {
    const request = {
      jsonrpc: "2.0",
      id: ++this.requestId,
      method: method,
      params: params
    };
    
    console.log('📤 Request:', JSON.stringify(request, null, 2));
    this.server.stdin.write(JSON.stringify(request) + '\n');
  }

  async test() {
    this.start();
    
    // Initialize
    this.sendRequest('initialize', {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" }
    });

    // Wait and get tools
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.sendRequest('tools/list');

    // Test a tool
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.sendRequest('tools/call', {
      name: 'getProjectStatus',
      arguments: {}
    });

    // Cleanup
    setTimeout(() => {
      this.server.kill();
    }, 5000);
  }
}

// Run test
const client = new MCPTestClient();
client.test();