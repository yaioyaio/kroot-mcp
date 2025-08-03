/**
 * File system monitor implementation
 * Monitors file changes and emits events through the central event system
 */

import { FSWatcher, watch } from 'chokidar';
import { relative, extname, basename } from 'path';
import { BaseMonitor } from './base.js';
import { config } from '../server/config.js';
import {
  eventEngine,
  FileEventBuilder,
  FileEventType,
  FileChangeAction,
  EventSeverity,
} from '../events/index.js';

export interface FileChangeEvent {
  action: FileChangeAction;
  path: string;
  relativePath: string;
  extension: string;
  timestamp: number;
  stats?: {
    size: number;
    modified: Date;
  };
}

export interface FileMonitorOptions {
  paths?: string[];
  ignorePatterns?: string[];
  extensions?: string[];
  debounceMs?: number;
}

export class FileMonitor extends BaseMonitor {
  private watcher?: FSWatcher;
  private readonly paths: string[];
  private readonly ignorePatterns: string[];
  private readonly extensions: string[];
  private readonly debounceMs: number;
  private changeBuffer: Map<string, NodeJS.Timeout> = new Map();

  constructor(options?: FileMonitorOptions) {
    super({ name: 'FileMonitor' });

    // Initialize from config or use defaults
    const monitoringConfig = config.monitoring.fileWatch;

    this.paths = options?.paths || [process.cwd()];
    this.ignorePatterns = options?.ignorePatterns || monitoringConfig.ignorePatterns;
    this.extensions = options?.extensions || monitoringConfig.extensions;
    this.debounceMs = options?.debounceMs || monitoringConfig.debounceMs;
  }

  protected async onStart(): Promise<void> {
    this.watcher = watch(this.paths, {
      ignored: this.ignorePatterns,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
    });

    // File events
    this.watcher
      .on('add', (path) => this.handleFileEvent(FileChangeAction.ADD, path))
      .on('change', (path) => this.handleFileEvent(FileChangeAction.CHANGE, path))
      .on('unlink', (path) => this.handleFileEvent(FileChangeAction.UNLINK, path))
      .on('addDir', (path) => this.handleFileEvent(FileChangeAction.ADD_DIR, path))
      .on('unlinkDir', (path) => this.handleFileEvent(FileChangeAction.UNLINK_DIR, path))
      .on('error', (error) => this.logError('Watcher error:', error))
      .on('ready', () => this.logInfo('File monitoring ready'));
  }

  protected async onStop(): Promise<void> {
    // Clear all pending debounced events
    for (const timeout of this.changeBuffer.values()) {
      clearTimeout(timeout);
    }
    this.changeBuffer.clear();

    // Close the watcher
    if (this.watcher) {
      await this.watcher.close();
      delete (this as any).watcher;
    }
  }

  private handleFileEvent(action: FileChangeAction, filePath: string): void {
    const extension = extname(filePath);

    // Filter by extension if configured
    if (this.extensions.length > 0 && !this.extensions.includes(extension)) {
      this.logDebug(`Ignoring file with extension: ${extension}`);
      return;
    }

    // Debounce file changes
    const key = `${action}:${filePath}`;
    const existingTimeout = this.changeBuffer.get(key);

    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(() => {
      this.changeBuffer.delete(key);
      this.processFileEvent(action, filePath);
    }, this.debounceMs);

    this.changeBuffer.set(key, timeout);
  }

  private async processFileEvent(action: FileChangeAction, filePath: string): Promise<void> {
    const relativePath = relative(process.cwd(), filePath);
    const extension = extname(filePath);

    const event: FileChangeEvent = {
      action,
      path: filePath,
      relativePath,
      extension,
      timestamp: Date.now(),
    };

    // Add file stats for certain events
    if (action === FileChangeAction.ADD || action === FileChangeAction.CHANGE) {
      try {
        // Use dynamic import for fs module in ESM
        const { statSync } = await import('fs');
        const stats = statSync(filePath);
        event.stats = {
          size: stats.size,
          modified: stats.mtime,
        };
      } catch (error) {
        this.logDebug(`Could not get stats for ${filePath}:`, error);
      }
    }

    // Emit through both legacy system and new event engine
    this.emitEvent('file:change', event);
    await this.analyzeContext(event);

    // Publish to event engine
    await this.publishFileEvent(event);
  }

  /**
   * Publish file event to the event engine
   */
  private async publishFileEvent(event: FileChangeEvent): Promise<void> {
    // Map action to FileEventType
    let eventType: FileEventType;
    const isDirectory =
      event.action === FileChangeAction.ADD_DIR || event.action === FileChangeAction.UNLINK_DIR;

    switch (event.action) {
      case FileChangeAction.ADD:
      case FileChangeAction.ADD_DIR:
        eventType = isDirectory ? FileEventType.DIR_CREATED : FileEventType.FILE_CREATED;
        break;
      case FileChangeAction.CHANGE:
        eventType = FileEventType.FILE_CHANGED;
        break;
      case FileChangeAction.UNLINK:
      case FileChangeAction.UNLINK_DIR:
        eventType = isDirectory ? FileEventType.DIR_DELETED : FileEventType.FILE_DELETED;
        break;
      default:
        eventType = FileEventType.FILE_CHANGED;
    }

    // Create file event
    const fileEvent = FileEventBuilder.createFileEvent(
      eventType,
      {
        action: event.action,
        newFile: {
          path: event.path,
          relativePath: event.relativePath,
          name: basename(event.path),
          extension: event.extension,
          ...(event.stats?.size !== undefined && { size: event.stats.size }),
          ...(event.stats?.modified !== undefined && { modifiedAt: event.stats.modified }),
          isDirectory,
        },
        description: `File ${event.action}: ${event.relativePath}`,
      },
      {
        severity: EventSeverity.INFO,
      },
    );

    // Publish to event engine
    await eventEngine.publish(fileEvent);
  }

  /**
   * Analyze the context of file changes
   */
  private async analyzeContext(event: FileChangeEvent): Promise<void> {
    const { relativePath, extension, action } = event;

    // Detect test file changes
    if (relativePath.includes('test') || relativePath.includes('spec')) {
      this.emitEvent('context:test', {
        ...event,
        context: 'test',
        description: `Test file ${action}: ${relativePath}`,
      });
    }

    // Detect configuration changes
    if (
      extension === '.json' ||
      extension === '.yaml' ||
      extension === '.yml' ||
      relativePath.includes('config')
    ) {
      this.emitEvent('context:config', {
        ...event,
        context: 'configuration',
        description: `Configuration ${action}: ${relativePath}`,
      });
    }

    // Detect source code changes
    if (
      ['.ts', '.tsx', '.js', '.jsx'].includes(extension) &&
      !relativePath.includes('test') &&
      !relativePath.includes('spec')
    ) {
      this.emitEvent('context:source', {
        ...event,
        context: 'source',
        description: `Source code ${action}: ${relativePath}`,
      });
    }

    // Detect documentation changes
    if (extension === '.md' || relativePath.includes('docs')) {
      this.emitEvent('context:documentation', {
        ...event,
        context: 'documentation',
        description: `Documentation ${action}: ${relativePath}`,
      });
    }

    // Detect build output changes
    if (relativePath.startsWith('dist/') || relativePath.startsWith('build/')) {
      this.emitEvent('context:build', {
        ...event,
        context: 'build',
        description: `Build output ${action}: ${relativePath}`,
      });
    }
  }

  /**
   * Get monitor configuration
   */
  getConfig() {
    return {
      name: 'FileMonitor',
      enabled: true,
      paths: this.paths,
      ignore: this.ignorePatterns,
    };
  }

  /**
   * Get current monitoring statistics
   */
  getStats(): { paths: string[]; patterns: string[]; extensions: string[]; active: boolean } {
    return {
      paths: this.paths,
      patterns: this.ignorePatterns,
      extensions: this.extensions,
      active: this.isRunning(),
    };
  }

  /**
   * Add a path to monitor
   */
  addPath(path: string): void {
    if (this.watcher && this.isRunning()) {
      this.watcher.add(path);
      this.paths.push(path);
      this.logInfo(`Added monitoring path: ${path}`);
    }
  }

  /**
   * Remove a path from monitoring
   */
  removePath(path: string): void {
    if (this.watcher && this.isRunning()) {
      this.watcher.unwatch(path);
      const index = this.paths.indexOf(path);
      if (index > -1) {
        this.paths.splice(index, 1);
        this.logInfo(`Removed monitoring path: ${path}`);
      }
    }
  }
}
