import { beforeAll, afterAll, beforeEach } from 'vitest';
import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.MCP_TEST_MODE = 'true';
process.env.MCP_SKIP_AUTH = 'true';
process.env.LOG_LEVEL = 'error'; // Reduce noise in tests

// Mock timers for consistent test execution
beforeAll(() => {
  // Ensure consistent timezone for tests
  process.env.TZ = 'UTC';
});

// Clean up after each test
beforeEach(() => {
  // Clear all module mocks
  vi.clearAllMocks();
  
  // Reset any global state
  if (global.gc) {
    global.gc(); // Force garbage collection between tests
  }
});

// Global test helpers
(global as any).testHelpers = {
  // Helper to wait for async operations
  waitFor: async (condition: () => boolean, timeout = 5000): Promise<void> => {
    const start = Date.now();
    while (!condition() && Date.now() - start < timeout) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    if (!condition()) {
      throw new Error('Timeout waiting for condition');
    }
  },
  
  // Helper to create test events
  createTestEvent: (type: string, data: any = {}) => ({
    id: `test-${Date.now()}-${Math.random()}`,
    type,
    timestamp: new Date(),
    category: 'test',
    severity: 'info' as const,
    source: 'test',
    data
  }),
  
  // Helper to suppress console output in tests
  suppressConsole: () => {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    
    beforeEach(() => {
      console.log = vi.fn();
      console.error = vi.fn();
      console.warn = vi.fn();
    });
    
    afterAll(() => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    });
  }
};

// Increase test timeout for CI environments
if (process.env.CI) {
  beforeAll(() => {
    vi.setConfig({ testTimeout: 60000 });
  });
}

// Clean up any hanging processes
afterAll(async () => {
  // Give async operations time to complete
  await new Promise(resolve => setTimeout(resolve, 100));
});