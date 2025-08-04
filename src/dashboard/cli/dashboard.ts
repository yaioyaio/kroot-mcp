/**
 * CLI 대시보드 클래스
 */

import { EventEmitter } from 'eventemitter3';
import chalk from 'chalk';
import Table from 'cli-table3';
import { eventEngine } from '../../events/engine.js';
import { BaseEvent, EventCategory, EventSeverity } from '../../events/types/base.js';

export interface CLIDashboardOptions {
  refreshInterval?: number;
  maxEvents?: number;
  compact?: boolean;
}

export class CLIDashboard extends EventEmitter {
  private refreshInterval?: NodeJS.Timeout | undefined;
  private eventSubscriptionId?: string | undefined;
  private events: BaseEvent[] = [];
  private isRunning = false;
  private startTime = Date.now();

  constructor(private options: CLIDashboardOptions = {}) {
    super();
  }

  /**
   * Start the CLI dashboard
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    
    // Clear screen and show header
    console.clear();
    this.showHeader();
    
    // Subscribe to events
    this.eventSubscriptionId = eventEngine.subscribe('*', (event) => {
      this.handleEvent(event);
    });

    // Start refresh timer
    this.refreshInterval = setInterval(() => {
      this.refresh();
    }, this.options.refreshInterval || 5000);

    // Initial refresh
    this.refresh();
    
    // Setup exit handlers
    this.setupExitHandlers();
    
    console.log(chalk.green('\n✓ CLI Dashboard started'));
    console.log(chalk.gray('Press Ctrl+C to exit\n'));
  }

  /**
   * Stop the dashboard
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    // Clear refresh timer
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }

    // Unsubscribe from events
    if (this.eventSubscriptionId) {
      eventEngine.unsubscribe(this.eventSubscriptionId);
      this.eventSubscriptionId = undefined;
    }

    console.log(chalk.yellow('\n👋 CLI Dashboard stopped'));
  }

  /**
   * Handle incoming events
   */
  private handleEvent(event: BaseEvent): void {
    // Add to events list
    this.events.unshift(event);
    
    // Keep only recent events
    if (this.events.length > (this.options.maxEvents || 50)) {
      this.events = this.events.slice(0, this.options.maxEvents || 50);
    }

    // Show real-time event if not in compact mode
    if (!this.options.compact) {
      this.showRealtimeEvent(event);
    }
  }

  /**
   * Show header
   */
  private showHeader(): void {
    const title = chalk.bold.cyan('📊 DevFlow Monitor CLI Dashboard');
    const separator = chalk.gray('─'.repeat(60));
    
    console.log(separator);
    console.log(title);
    console.log(chalk.gray(`Started: ${new Date().toLocaleString()}`));
    console.log(separator);
  }

  /**
   * Show real-time event
   */
  private showRealtimeEvent(event: BaseEvent): void {
    const time = chalk.gray(new Date(event.timestamp).toLocaleTimeString());
    const category = this.formatCategory(event.category);
    const severity = this.formatSeverity(event.severity);
    const type = chalk.white(event.type);
    
    console.log(` ${time} ${category} ${severity} ${type}`);
  }

  /**
   * Refresh dashboard display
   */
  private refresh(): void {
    if (!this.isRunning) {
      return;
    }

    // Clear screen and redraw
    console.clear();
    this.showHeader();
    
    // Show system status
    this.showSystemStatus();
    
    // Show recent activity
    this.showRecentActivity();
    
    // Show metrics
    this.showMetrics();
    
    console.log(chalk.gray('\n' + '─'.repeat(60)));
    console.log(chalk.gray('Last updated:'), new Date().toLocaleTimeString());
  }

  /**
   * Show system status
   */
  private showSystemStatus(): void {
    const stats = eventEngine.getStats();
    const uptime = this.getUptime();
    
    console.log(chalk.bold.blue('\n🔧 System Status'));
    
    const statusTable = new Table({
      chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
      colWidths: [20, 15, 20, 15]
    });
    
    statusTable.push(
      ['Total Events', chalk.cyan(stats.totalEvents.toString()), 'Subscribers', chalk.cyan(stats.subscriberCount.toString())],
      ['Events/Hour', chalk.yellow(stats.eventsPerHour.toString()), 'Uptime', chalk.green(uptime)]
    );
    
    console.log(statusTable.toString());
  }

  /**
   * Show recent activity
   */
  private showRecentActivity(): void {
    console.log(chalk.bold.yellow('\n📋 Recent Activity'));
    
    if (this.events.length === 0) {
      console.log(chalk.gray('  No recent events'));
      return;
    }

    const activityTable = new Table({
      head: ['Time', 'Category', 'Severity', 'Event Type'],
      colWidths: [12, 12, 12, 30],
      style: {
        head: ['cyan']
      }
    });
    
    this.events.slice(0, 10).forEach(event => {
      activityTable.push([
        new Date(event.timestamp).toLocaleTimeString(),
        this.getCategoryName(event.category),
        this.getSeverityName(event.severity),
        event.type
      ]);
    });
    
    console.log(activityTable.toString());
  }

  /**
   * Show metrics
   */
  private showMetrics(): void {
    console.log(chalk.bold.green('\n📈 Metrics'));
    
    const stats = eventEngine.getStats();
    
    // Category breakdown
    const categoryTable = new Table({
      head: ['Category', 'Count', 'Percentage'],
      colWidths: [15, 10, 12],
      style: {
        head: ['green']
      }
    });
    
    const total = stats.totalEvents || 1;
    Object.entries(stats.eventsByCategory).forEach(([category, count]) => {
      const percentage = ((count / total) * 100).toFixed(1);
      categoryTable.push([
        this.getCategoryName(category as EventCategory),
        count.toString(),
        `${percentage}%`
      ]);
    });
    
    console.log(categoryTable.toString());
    
    // Severity breakdown
    const severityTable = new Table({
      head: ['Severity', 'Count', 'Percentage'],
      colWidths: [15, 10, 12],
      style: {
        head: ['magenta']
      }
    });
    
    Object.entries(stats.eventsBySeverity).forEach(([severity, count]) => {
      const percentage = ((count / total) * 100).toFixed(1);
      severityTable.push([
        this.getSeverityName(severity as EventSeverity),
        count.toString(),
        `${percentage}%`
      ]);
    });
    
    console.log(severityTable.toString());
  }

  /**
   * Format category for display
   */
  private formatCategory(category: EventCategory): string {
    const icons = {
      [EventCategory.FILE]: '📁',
      [EventCategory.GIT]: '🔄',
      [EventCategory.PROCESS]: '⚙️',
      [EventCategory.API]: '🔌',
      [EventCategory.STAGE]: '🎯',
      [EventCategory.METHOD]: '🏗️',
      [EventCategory.AI]: '🤖',
    };
    
    return icons[category as keyof typeof icons] || '•';
  }

  /**
   * Format severity for display
   */
  private formatSeverity(severity: EventSeverity): string {
    switch (severity) {
      case EventSeverity.CRITICAL:
        return chalk.red.bold('CRIT');
      case EventSeverity.ERROR:
        return chalk.red('ERR');
      case EventSeverity.WARNING:
        return chalk.yellow('WARN');
      case EventSeverity.INFO:
        return chalk.blue('INFO');
      case EventSeverity.DEBUG:
        return chalk.gray('DBG');
      default:
        return chalk.white('UNK');
    }
  }

  /**
   * Get category name
   */
  private getCategoryName(category: EventCategory | string): string {
    return typeof category === 'string' ? category : String(category);
  }

  /**
   * Get severity name
   */
  private getSeverityName(severity: EventSeverity | string): string {
    return typeof severity === 'string' ? severity : String(severity);
  }

  /**
   * Get uptime string
   */
  private getUptime(): string {
    const uptime = (Date.now() - this.startTime) / 1000;
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Setup exit handlers
   */
  private setupExitHandlers(): void {
    process.on('SIGINT', () => {
      this.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      this.stop();
      process.exit(0);
    });
  }

  /**
   * Show summary report
   */
  showSummary(): void {
    console.log(chalk.bold.cyan('\n📊 Dashboard Summary'));
    console.log(chalk.gray('─'.repeat(40)));
    
    const stats = eventEngine.getStats();
    
    console.log(chalk.white('Events Processed:'), chalk.cyan(stats.totalEvents));
    console.log(chalk.white('Active Subscribers:'), chalk.cyan(stats.subscriberCount));
    console.log(chalk.white('Events per Hour:'), chalk.yellow(stats.eventsPerHour));
    console.log(chalk.white('Categories:'), chalk.green(Object.keys(stats.eventsByCategory).length));
    console.log(chalk.white('Uptime:'), chalk.green(this.getUptime()));
    
    if (this.events.length > 0) {
      const lastEvent = this.events[0];
      if (lastEvent) {
        console.log(chalk.white('Last Event:'), chalk.gray(new Date(lastEvent.timestamp).toLocaleString()));
        console.log(chalk.white('Event Type:'), chalk.white(lastEvent.type));
      }
    }
    
    console.log(chalk.gray('─'.repeat(40)));
  }
}