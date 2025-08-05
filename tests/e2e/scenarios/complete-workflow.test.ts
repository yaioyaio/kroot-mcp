import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import WebSocket from 'ws';
import { join } from 'path';
import { rm } from 'fs/promises';

/**
 * E2E Test: Complete DevFlow Monitor Workflow
 * 
 * This test simulates a complete development workflow:
 * 1. Starting the MCP server
 * 2. File system monitoring
 * 3. Git operations tracking
 * 4. WebSocket real-time streaming
 * 5. MCP tool invocations
 * 6. Dashboard functionality
 */
describe('DevFlow Monitor E2E - Complete Workflow', () => {
  let mcpProcess: ChildProcess;
  let ws: WebSocket;
  const testDir = join(__dirname, '../../../test-workspace');
  const serverPort = 9999;

  beforeAll(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
    
    // Start MCP server using ts-node to run TypeScript directly
    mcpProcess = spawn('npx', [
      'ts-node',
      '--esm',
      join(__dirname, '../../../src/server/index.ts')
    ], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        MCP_TEST_MODE: 'true',
        WEBSOCKET_PORT: String(serverPort)
      },
      cwd: join(__dirname, '../../..')
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    // Cleanup
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    if (mcpProcess) {
      mcpProcess.kill();
    }
    await rm(testDir, { recursive: true, force: true });
  });

  describe('MCP Server Operations', () => {
    it('should start the MCP server successfully', async () => {
      const response = await fetch('http://localhost:3000/health', {
        method: 'GET'
      });
      
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.status).toBe('healthy');
    });

    it('should handle MCP tool invocations', async () => {
      const toolRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'getProjectStatus',
          arguments: {}
        }
      };

      const response = await fetch('http://localhost:3000/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toolRequest)
      });

      const result = await response.json();
      expect(result.result).toBeDefined();
      expect(result.result.currentStage).toBeDefined();
      expect(result.result.milestones).toBeDefined();
    });
  });

  describe('WebSocket Real-time Streaming', () => {
    it('should establish WebSocket connection', (done) => {
      ws = new WebSocket(`ws://localhost:${serverPort}`);
      
      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        done();
      });

      ws.on('error', (err) => {
        done(err);
      });
    });

    it('should receive real-time events', (done) => {
      const receivedEvents: any[] = [];
      
      ws.on('message', (data) => {
        const event = JSON.parse(data.toString());
        receivedEvents.push(event);
        
        if (receivedEvents.length >= 1) {
          expect(receivedEvents[0]).toHaveProperty('type');
          expect(receivedEvents[0]).toHaveProperty('timestamp');
          done();
        }
      });

      // Trigger an event
      setTimeout(() => {
        fetch('http://localhost:3000/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
              name: 'broadcastSystemNotification',
              arguments: {
                message: 'Test notification',
                severity: 'info'
              }
            }
          })
        });
      }, 100);
    });
  });

  describe('File System Monitoring', () => {
    it('should detect file creation events', async () => {
      const eventsPromise = new Promise((resolve) => {
        const events: any[] = [];
        
        ws.on('message', (data) => {
          const event = JSON.parse(data.toString());
          if (event.category === 'file') {
            events.push(event);
            if (events.length >= 1) {
              resolve(events);
            }
          }
        });
      });

      // Create a test file
      const fs = await import('fs/promises');
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(join(testDir, 'test.ts'), 'console.log("test");');

      const events = await eventsPromise;
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('file.created');
    });
  });

  describe('Metrics and Analysis', () => {
    it('should calculate development metrics', async () => {
      const response = await fetch('http://localhost:3000/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'getMetrics',
            arguments: { timeRange: '1h' }
          }
        })
      });

      const result = await response.json();
      expect(result.result).toBeDefined();
      expect(result.result.productivity).toBeDefined();
      expect(result.result.codeQuality).toBeDefined();
    });

    it('should detect bottlenecks', async () => {
      const response = await fetch('http://localhost:3000/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'analyzeBottlenecks',
            arguments: {}
          }
        })
      });

      const result = await response.json();
      expect(result.result).toBeDefined();
      expect(result.result.bottlenecks).toBeInstanceOf(Array);
    });
  });

  describe('Security Features', () => {
    it('should enforce authentication for sensitive tools', async () => {
      const response = await fetch('http://localhost:3000/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: {
            name: 'generateAPIKey',
            arguments: { userId: 'test-user' }
          }
        })
      });

      const result = await response.json();
      // Should fail without auth token
      expect(result.error).toBeDefined();
    });

    it('should allow authenticated access', async () => {
      // First login
      const loginResponse = await fetch('http://localhost:3000/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 6,
          method: 'tools/call',
          params: {
            name: 'login',
            arguments: {
              username: 'admin',
              password: 'admin123'
            }
          }
        })
      });

      const loginResult = await loginResponse.json();
      const token = loginResult.result?.accessToken;
      expect(token).toBeDefined();

      // Now try with token
      const authResponse = await fetch('http://localhost:3000/rpc', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 7,
          method: 'tools/call',
          params: {
            name: 'getSecurityStats',
            arguments: {}
          }
        })
      });

      const authResult = await authResponse.json();
      expect(authResult.result).toBeDefined();
    });
  });
});