/**
 * TUI 대시보드 메인 클래스
 */

import blessed from 'blessed';
import { EventEmitter } from 'eventemitter3';
import { eventEngine } from '../../events/engine.js';
import { BaseEvent, EventCategory, EventSeverity } from '../../events/types/base.js';

export interface DashboardOptions {
  title?: string;
  refreshInterval?: number;
  maxEvents?: number;
}

export class TUIDashboard extends EventEmitter {
  private screen: blessed.Widgets.Screen;
  private refreshInterval?: NodeJS.Timeout | undefined;
  private eventSubscriptionId?: string | undefined;
  private events: BaseEvent[] = [];
  private isRunning = false;

  // UI Components
  private headerBox!: blessed.Widgets.BoxElement;
  private statusBox!: blessed.Widgets.BoxElement;
  private activityBox!: blessed.Widgets.ListElement;
  private metricsBox!: blessed.Widgets.BoxElement;
  private stageBox!: blessed.Widgets.BoxElement;
  private methodologyBox!: blessed.Widgets.BoxElement;
  private aiBox!: blessed.Widgets.BoxElement;
  private helpBox!: blessed.Widgets.BoxElement;

  constructor(private options: DashboardOptions = {}) {
    super();
    
    // Create screen
    this.screen = blessed.screen({
      smartCSR: true,
      title: options.title || 'DevFlow Monitor Dashboard',
    });

    // Initialize UI components
    this.initializeComponents();
    this.setupEventHandlers();
    this.setupKeyboardHandlers();
  }

  /**
   * Initialize all UI components
   */
  private initializeComponents(): void {
    // Header
    this.headerBox = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: this.getHeaderContent(),
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        bg: 'blue',
        border: {
          fg: 'blue'
        }
      }
    });

    // Project Status
    this.statusBox = blessed.box({
      top: 3,
      left: 0,
      width: '50%',
      height: 8,
      label: ' Project Status ',
      content: 'Loading...',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'cyan'
        }
      }
    });

    // Current Stage
    this.stageBox = blessed.box({
      top: 3,
      left: '50%',
      width: '50%',
      height: 8,
      label: ' Current Stage ',
      content: 'Analyzing...',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'green'
        }
      }
    });

    // Activity Feed
    this.activityBox = blessed.list({
      top: 11,
      left: 0,
      width: '50%',
      height: '50%-11',
      label: ' Activity Feed ',
      items: ['Starting activity feed...'],
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'yellow'
        },
        selected: {
          bg: 'blue'
        }
      },
      keys: false,
      vi: false
    });

    // Metrics
    this.metricsBox = blessed.box({
      top: 11,
      left: '50%',
      width: '50%',
      height: 10,
      label: ' Metrics ',
      content: 'Loading metrics...',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'magenta'
        }
      }
    });

    // Methodology Status
    this.methodologyBox = blessed.box({
      top: 21,
      left: '50%',
      width: '25%',
      height: '50%-21',
      label: ' Methodology ',
      content: 'Loading...',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'red'
        }
      }
    });

    // AI Collaboration
    this.aiBox = blessed.box({
      top: 21,
      left: '75%',
      width: '25%',
      height: '50%-21',
      label: ' AI Usage ',
      content: 'Loading...',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'cyan'
        }
      }
    });

    // Help
    this.helpBox = blessed.box({
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: this.getHelpContent(),
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'white'
        }
      }
    });

    // Append all components to screen
    this.screen.append(this.headerBox);
    this.screen.append(this.statusBox);
    this.screen.append(this.stageBox);
    this.screen.append(this.activityBox);
    this.screen.append(this.metricsBox);
    this.screen.append(this.methodologyBox);
    this.screen.append(this.aiBox);
    this.screen.append(this.helpBox);
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Subscribe to all events
    this.eventSubscriptionId = eventEngine.subscribe('*', (event) => {
      this.handleEvent(event);
    });
  }

  /**
   * Setup keyboard handlers
   */
  private setupKeyboardHandlers(): void {
    // Quit on Escape, q, or Control-C
    this.screen.key(['escape', 'q', 'C-c'], () => {
      this.stop();
      process.exit(0);
    });

    // Refresh on r
    this.screen.key(['r'], () => {
      this.refresh();
    });

    // Clear activity on c
    this.screen.key(['c'], () => {
      this.clearActivity();
    });

    // Toggle help on h
    this.screen.key(['h'], () => {
      this.toggleHelp();
    });
  }

  /**
   * Handle incoming events
   */
  private handleEvent(event: BaseEvent): void {
    // Add to events list
    this.events.unshift(event);
    
    // Keep only recent events
    if (this.events.length > (this.options.maxEvents || 100)) {
      this.events = this.events.slice(0, this.options.maxEvents || 100);
    }

    // Update activity feed
    this.updateActivityFeed();
    
    // Render changes
    this.screen.render();
  }

  /**
   * Update activity feed
   */
  private updateActivityFeed(): void {
    const items = this.events.slice(0, 20).map(event => {
      const time = new Date(event.timestamp).toLocaleTimeString();
      const severityColor = this.getSeverityColor(event.severity);
      const categoryIcon = this.getCategoryIcon(event.category);
      
      return `{${severityColor}-fg}[${time}] ${categoryIcon} ${event.type}{/}`;
    });

    this.activityBox.setItems(items);
  }

  /**
   * Get severity color
   */
  private getSeverityColor(severity: EventSeverity): string {
    switch (severity) {
      case EventSeverity.CRITICAL:
        return 'red';
      case EventSeverity.ERROR:
        return 'red';
      case EventSeverity.WARNING:
        return 'yellow';
      case EventSeverity.INFO:
        return 'white';
      case EventSeverity.DEBUG:
        return 'gray';
      default:
        return 'white';
    }
  }

  /**
   * Get category icon
   */
  private getCategoryIcon(category: EventCategory): string {
    switch (category) {
      case EventCategory.FILE:
        return '📁';
      case EventCategory.GIT:
        return '🔄';
      case EventCategory.PROCESS:
        return '⚙️';
      case EventCategory.API:
        return '🔌';
      case EventCategory.STAGE:
        return '🎯';
      case EventCategory.METHOD:
        return '🏗️';
      case EventCategory.AI:
        return '🤖';
      default:
        return '•';
    }
  }

  /**
   * Get header content
   */
  private getHeaderContent(): string {
    const now = new Date().toLocaleString();
    return `{center}{bold}DevFlow Monitor Dashboard{/bold} - ${now} - Events: ${this.events.length}{/center}`;
  }

  /**
   * Get help content
   */
  private getHelpContent(): string {
    return ' {bold}Controls:{/bold} [r] Refresh | [c] Clear | [h] Help | [q/ESC] Quit ';
  }

  /**
   * Start the dashboard
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    
    // Start refresh timer
    this.refreshInterval = setInterval(() => {
      this.refresh();
    }, this.options.refreshInterval || 1000);

    // Initial refresh
    this.refresh();
    
    // Render screen
    this.screen.render();
    
    console.log('TUI Dashboard started. Press q or ESC to quit.');
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

    // Destroy screen
    this.screen.destroy();
  }

  /**
   * Refresh dashboard data
   */
  private async refresh(): Promise<void> {
    try {
      // Update header
      this.headerBox.setContent(this.getHeaderContent());
      
      // Update project status
      await this.updateProjectStatus();
      
      // Update current stage
      await this.updateCurrentStage();
      
      // Update metrics
      await this.updateMetrics();
      
      // Update methodology status
      await this.updateMethodologyStatus();
      
      // Update AI usage
      await this.updateAIUsage();
      
      // Render changes
      this.screen.render();
    } catch (error) {
      // Handle refresh errors silently
    }
  }

  /**
   * Update project status
   */
  private async updateProjectStatus(): Promise<void> {
    const engineStats = eventEngine.getStats();
    const queueStats = eventEngine.getQueueStats();
    
    let content = `{bold}System Status{/bold}\n`;
    content += `Events: ${engineStats.totalEvents}\n`;
    content += `Subscribers: ${engineStats.subscriberCount}\n`;
    content += `Categories: ${Object.keys(engineStats.eventsByCategory).length}\n`;
    
    if (queueStats) {
      const defaultQueue = queueStats.get('default');
      if (defaultQueue) {
        content += `Queue Size: ${defaultQueue.totalEvents}\n`;
      }
    }
    
    content += `Uptime: ${this.getUptime()}`;
    
    this.statusBox.setContent(content);
  }

  /**
   * Update current stage
   */
  private async updateCurrentStage(): Promise<void> {
    // This would integrate with StageAnalyzer
    const content = `{bold}Development Stage{/bold}\n` +
                   `Current: {green-fg}Coding{/green-fg}\n` +
                   `Progress: 75%\n` +
                   `Confidence: 85%\n` +
                   `Duration: 2h 15m`;
    
    this.stageBox.setContent(content);
  }

  /**
   * Update metrics
   */
  private async updateMetrics(): Promise<void> {
    const stats = eventEngine.getStats();
    
    let content = `{bold}Activity Metrics{/bold}\n`;
    content += `Events/Hour: ${stats.eventsPerHour}\n`;
    
    // Category breakdown
    const categories = Object.entries(stats.eventsByCategory);
    if (categories.length > 0) {
      content += `\n{bold}By Category:{/bold}\n`;
      categories.slice(0, 4).forEach(([cat, count]) => {
        const icon = this.getCategoryIcon(cat as EventCategory);
        content += `${icon} ${cat}: ${count}\n`;
      });
    }
    
    this.metricsBox.setContent(content);
  }

  /**
   * Update methodology status
   */
  private async updateMethodologyStatus(): Promise<void> {
    // This would integrate with MethodologyAnalyzer
    const content = `{bold}Methodology{/bold}\n` +
                   `DDD: {green-fg}85%{/green-fg}\n` +
                   `TDD: {yellow-fg}60%{/yellow-fg}\n` +
                   `BDD: {red-fg}40%{/red-fg}\n` +
                   `EDA: {green-fg}90%{/green-fg}`;
    
    this.methodologyBox.setContent(content);
  }

  /**
   * Update AI usage
   */
  private async updateAIUsage(): Promise<void> {
    // This would integrate with AIMonitor
    const content = `{bold}AI Tools{/bold}\n` +
                   `🤖 Claude: Active\n` +
                   `✨ Copilot: 85%\n` +
                   `💬 ChatGPT: Idle\n` +
                   `⚡ Productivity: +45%`;
    
    this.aiBox.setContent(content);
  }

  /**
   * Clear activity feed
   */
  private clearActivity(): void {
    this.events = [];
    this.activityBox.setItems(['Activity cleared']);
    this.screen.render();
  }

  /**
   * Toggle help visibility
   */
  private toggleHelp(): void {
    // Simple help toggle - could be expanded
    const helpText = `
{bold}DevFlow Monitor Dashboard Help{/bold}

{bold}Keyboard Shortcuts:{/bold}
• r - Refresh all data
• c - Clear activity feed  
• h - Toggle this help
• q/ESC - Quit dashboard

{bold}Panels:{/bold}
• Project Status - System metrics and uptime
• Current Stage - Development stage detection
• Activity Feed - Real-time event stream
• Metrics - Event statistics and trends
• Methodology - DDD/TDD/BDD/EDA compliance
• AI Usage - AI tool usage and effectiveness

Press any key to close this help...
    `;
    
    const helpPopup = blessed.box({
      top: 'center',
      left: 'center',
      width: '80%',
      height: '80%',
      content: helpText,
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'yellow'
        }
      }
    });
    
    this.screen.append(helpPopup);
    helpPopup.focus();
    
    helpPopup.key(['escape', 'enter', 'space'], () => {
      this.screen.remove(helpPopup);
      this.screen.render();
    });
    
    this.screen.render();
  }

  /**
   * Get uptime string
   */
  private getUptime(): string {
    const uptime = process.uptime();
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
}