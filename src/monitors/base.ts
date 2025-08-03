/**
 * Base monitor abstract class
 * All monitors should extend this class
 */

import { EventEmitter } from 'events';
import { config } from '../server/config.js';

export interface MonitorEvent {
  type: string;
  timestamp: number;
  data: unknown;
  source: string;
  metadata?: Record<string, unknown>;
}

export interface MonitorOptions {
  name: string;
  enabled?: boolean;
  debug?: boolean;
}

export abstract class BaseMonitor extends EventEmitter {
  protected readonly name: string;
  protected enabled: boolean;
  protected debug: boolean;
  private started: boolean = false;

  constructor(options: MonitorOptions) {
    super();
    this.name = options.name;
    this.enabled = options.enabled ?? true;
    this.debug = options.debug ?? config.development.debug;
  }

  /**
   * Start monitoring
   */
  async start(): Promise<void> {
    if (this.started) {
      this.logWarn('Monitor already started');
      return;
    }

    if (!this.enabled) {
      this.logInfo('Monitor is disabled');
      return;
    }

    try {
      await this.onStart();
      this.started = true;
      this.logInfo('Monitor started');
    } catch (error) {
      this.logError('Failed to start monitor:', error);
      throw error;
    }
  }

  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    if (!this.started) {
      this.logWarn('Monitor not started');
      return;
    }

    try {
      await this.onStop();
      this.started = false;
      this.logInfo('Monitor stopped');
    } catch (error) {
      this.logError('Failed to stop monitor:', error);
      throw error;
    }
  }

  /**
   * Check if monitor is running
   */
  isRunning(): boolean {
    return this.started;
  }

  /**
   * Enable the monitor
   */
  enable(): void {
    this.enabled = true;
    this.logInfo('Monitor enabled');
  }

  /**
   * Disable the monitor
   */
  disable(): void {
    this.enabled = false;
    this.logInfo('Monitor disabled');
  }

  /**
   * Emit a monitor event
   */
  protected emitEvent(type: string, data: unknown, metadata?: Record<string, unknown>): void {
    const event: MonitorEvent = {
      type,
      timestamp: Date.now(),
      data,
      source: this.name,
      ...(metadata && { metadata }),
    };

    this.emit('event', event);
    this.logDebug('Event emitted:', type, data);
  }

  /**
   * Logging utilities
   */
  protected logDebug(message: string, ...args: unknown[]): void {
    if (this.debug) {
      console.error(`[DEBUG][${this.name}] ${message}`, ...args);
    }
  }

  protected logInfo(message: string, ...args: unknown[]): void {
    console.error(`[INFO][${this.name}] ${message}`, ...args);
  }

  protected logWarn(message: string, ...args: unknown[]): void {
    console.error(`[WARN][${this.name}] ${message}`, ...args);
  }

  protected logError(message: string, ...args: unknown[]): void {
    console.error(`[ERROR][${this.name}] ${message}`, ...args);
  }

  /**
   * Abstract methods to be implemented by subclasses
   */
  protected abstract onStart(): Promise<void>;
  protected abstract onStop(): Promise<void>;
}
