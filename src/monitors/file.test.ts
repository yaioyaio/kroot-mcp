import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileMonitor } from './file.js';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock the EventEngine module
const mockPublish = vi.fn();
vi.mock('../events/engine.js', () => ({
  eventEngine: {
    publish: mockPublish,
  },
}));

describe('FileMonitor', () => {
  let monitor: FileMonitor;
  let testDir: string;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = mkdtempSync(join(tmpdir(), 'file-monitor-test-'));

    // Clear mocks
    vi.clearAllMocks();

    // Create monitor instance
    monitor = new FileMonitor();
  });

  afterEach(async () => {
    // Stop monitor
    await monitor.stop();

    // Clean up test directory
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      const config = monitor.getConfig();
      expect(config.name).toBe('FileMonitor');
      expect(config.enabled).toBe(true);
      expect(config.paths).toEqual(['./']);
      expect(config.ignore).toContain('**/node_modules/**');
    });

    it('should accept custom configuration', () => {
      const customMonitor = new FileMonitor({
        paths: ['/custom/path'],
      });

      const config = customMonitor.getConfig();
      expect(config.paths).toEqual(['/custom/path']);
    });
  });

  describe('file monitoring', () => {
    it('should detect file creation', async () => {
      await monitor.start();

      // Create a test file
      const testFile = join(testDir, 'test.ts');
      writeFileSync(testFile, 'console.log("test");');

      // Wait for event to be processed
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check if event was published
      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'file:created',
          category: 'file',
          data: expect.objectContaining({
            action: 'add',
            newFile: expect.objectContaining({
              path: testFile,
              name: 'test.ts',
              extension: '.ts',
            }),
          }),
        }),
      );
    });

    it('should detect file changes', async () => {
      // Create initial file
      const testFile = join(testDir, 'test.js');
      writeFileSync(testFile, 'const a = 1;');

      await monitor.start();

      // Wait for initial events
      await new Promise((resolve) => setTimeout(resolve, 200));
      vi.clearAllMocks();

      // Modify the file
      writeFileSync(testFile, 'const a = 2;');

      // Wait for change event
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'file:changed',
          category: 'file',
          data: expect.objectContaining({
            action: 'change',
            oldFile: expect.objectContaining({
              path: testFile,
            }),
            newFile: expect.objectContaining({
              path: testFile,
            }),
          }),
        }),
      );
    });

    it('should detect file deletion', async () => {
      // Create initial file
      const testFile = join(testDir, 'test.md');
      writeFileSync(testFile, '# Test');

      await monitor.start();

      // Wait for initial events
      await new Promise((resolve) => setTimeout(resolve, 200));
      vi.clearAllMocks();

      // Delete the file
      rmSync(testFile);

      // Wait for delete event
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'file:deleted',
          category: 'file',
          data: expect.objectContaining({
            action: 'unlink',
            oldFile: expect.objectContaining({
              path: testFile,
              name: 'test.md',
            }),
          }),
        }),
      );
    });

    it('should ignore files matching ignore patterns', async () => {
      await monitor.start();

      // Create files that should be ignored
      writeFileSync(join(testDir, 'debug.log'), 'log data');
      mkdirSync(join(testDir, 'temp'));
      writeFileSync(join(testDir, 'temp', 'cache.txt'), 'temp data');

      // Create file that should be monitored
      writeFileSync(join(testDir, 'important.ts'), 'const x = 1;');

      // Wait for events
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should only have one event for important.ts
      const calls = mockPublish.mock.calls;
      const fileEvents = calls.filter(
        (call) =>
          call[0].type === 'file:created' &&
          !call[0].data.newFile.path.includes('debug.log') &&
          !call[0].data.newFile.path.includes('temp'),
      );

      expect(fileEvents).toHaveLength(1);
      expect(fileEvents[0][0].data.newFile.name).toBe('important.ts');
    });
  });

  describe('context detection', () => {
    it('should detect test file context', async () => {
      await monitor.start();

      // Create test files
      writeFileSync(join(testDir, 'app.test.ts'), 'test("example", () => {});');
      writeFileSync(join(testDir, 'utils.spec.js'), 'describe("utils", () => {});');

      // Wait for events
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check for context events
      const contextEvents = mockPublish.mock.calls.filter(
        (call) => call[0].type === 'context:test',
      );

      expect(contextEvents).toHaveLength(2);
      expect(contextEvents[0]?.[0]?.data?.context).toBe('test');
    });

    it('should detect configuration file context', async () => {
      await monitor.start();

      // Create config files
      writeFileSync(join(testDir, 'tsconfig.json'), '{}');
      writeFileSync(join(testDir, '.env'), 'KEY=value');

      // Wait for events
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check for context events
      const contextEvents = mockPublish.mock.calls.filter(
        (call) => call[0].type === 'context:config',
      );

      expect(contextEvents).toHaveLength(2);
      expect(contextEvents[0]?.[0]?.data?.context).toBe('configuration');
    });

    it('should detect documentation context', async () => {
      await monitor.start();

      // Create doc files
      writeFileSync(join(testDir, 'README.md'), '# Project');
      mkdirSync(join(testDir, 'docs'));
      writeFileSync(join(testDir, 'docs', 'guide.md'), '# Guide');

      // Wait for events
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check for context events
      const contextEvents = mockPublish.mock.calls.filter(
        (call) => call[0].type === 'context:documentation',
      );

      expect(contextEvents).toHaveLength(2);
    });
  });

  describe('lifecycle', () => {
    it('should start and stop properly', async () => {
      expect(monitor.isRunning()).toBe(false);

      await monitor.start();
      expect(monitor.isRunning()).toBe(true);

      await monitor.stop();
      expect(monitor.isRunning()).toBe(false);
    });

    it('should handle multiple start calls', async () => {
      await monitor.start();
      await monitor.start(); // Should not throw

      expect(monitor.isRunning()).toBe(true);
    });

    it('should clean up watchers on stop', async () => {
      await monitor.start();

      // Create a file before stopping
      writeFileSync(join(testDir, 'before.txt'), 'test');
      await new Promise((resolve) => setTimeout(resolve, 200));

      const callsBefore = mockPublish.mock.calls.length;

      await monitor.stop();

      // Create a file after stopping - should not trigger events
      writeFileSync(join(testDir, 'after.txt'), 'test');
      await new Promise((resolve) => setTimeout(resolve, 200));

      const callsAfter = mockPublish.mock.calls.length;
      expect(callsAfter).toBe(callsBefore);
    });
  });

  describe('error handling', () => {
    it('should handle watcher errors gracefully', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Start monitoring a non-existent path
      await monitor.start();

      // Should log error but not crash
      expect(errorSpy).toHaveBeenCalled();
      expect(monitor.isRunning()).toBe(true);

      errorSpy.mockRestore();
    });
  });
});
