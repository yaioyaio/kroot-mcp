import { EventEngine } from '../events/engine.js';
import { BaseEvent, EventCategory, EventSeverity } from '../events/types/base.js';
import { BaseAPIClient } from './base.js';
import { JiraClient, type JiraConfig } from './jira.js';
import { NotionClient, type NotionConfig } from './notion.js';
import { FigmaClient, type FigmaConfig } from './figma.js';

export interface IntegrationConfig {
  jira?: JiraConfig;
  notion?: NotionConfig;
  figma?: FigmaConfig;
}

export interface IntegrationStatus {
  name: string;
  enabled: boolean;
  healthy: boolean;
  connected: boolean;
  lastCheck: number;
  stats?: any;
}

export class APIIntegrationManager {
  private eventEngine: EventEngine;
  private clients: Map<string, BaseAPIClient> = new Map();
  private config: IntegrationConfig;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private healthCheckIntervalMs: number = 300000; // 5 minutes

  constructor(config: IntegrationConfig, eventEngine: EventEngine) {
    this.config = config;
    this.eventEngine = eventEngine;
    this.initializeClients();
  }

  private initializeClients(): void {
    if (this.config.jira) {
      try {
        const jiraClient = new JiraClient(this.config.jira, this.eventEngine);
        this.clients.set('jira', jiraClient);

        this.emitEvent({
          type: 'integration:client_initialized',
          category: EventCategory.API,
          severity: EventSeverity.INFO,
          data: {
            clientName: 'jira',
            domain: this.config.jira.domain,
          },
          timestamp: Date.now(),
          source: 'APIIntegrationManager',
        });
      } catch (error) {
        this.emitEvent({
          type: 'integration:client_initialization_failed',
          category: EventCategory.API,
          severity: EventSeverity.ERROR,
          data: {
            clientName: 'jira',
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          timestamp: Date.now(),
          source: 'APIIntegrationManager',
        });
      }
    }

    if (this.config.notion) {
      try {
        const notionClient = new NotionClient(this.config.notion, this.eventEngine);
        this.clients.set('notion', notionClient);

        this.emitEvent({
          type: 'integration:client_initialized',
          category: EventCategory.API,
          severity: EventSeverity.INFO,
          data: {
            clientName: 'notion',
          },
          timestamp: Date.now(),
          source: 'APIIntegrationManager',
        });
      } catch (error) {
        this.emitEvent({
          type: 'integration:client_initialization_failed',
          category: EventCategory.API,
          severity: EventSeverity.ERROR,
          data: {
            clientName: 'notion',
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          timestamp: Date.now(),
          source: 'APIIntegrationManager',
        });
      }
    }

    if (this.config.figma) {
      try {
        const figmaClient = new FigmaClient(this.config.figma, this.eventEngine);
        this.clients.set('figma', figmaClient);

        this.emitEvent({
          type: 'integration:client_initialized',
          category: EventCategory.API,
          severity: EventSeverity.INFO,
          data: {
            clientName: 'figma',
          },
          timestamp: Date.now(),
          source: 'APIIntegrationManager',
        });
      } catch (error) {
        this.emitEvent({
          type: 'integration:client_initialization_failed',
          category: EventCategory.API,
          severity: EventSeverity.ERROR,
          data: {
            clientName: 'figma',
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          timestamp: Date.now(),
          source: 'APIIntegrationManager',
        });
      }
    }

    this.emitEvent({
      type: 'integration:manager_initialized',
      category: EventCategory.API,
      severity: EventSeverity.INFO,
      data: {
        totalClients: this.clients.size,
        enabledClients: Array.from(this.clients.keys()),
      },
      timestamp: Date.now(),
      source: 'APIIntegrationManager',
    });
  }

  public async start(): Promise<void> {
    await this.validateAllConnections();
    this.startHealthChecks();

    this.emitEvent({
      type: 'integration:manager_started',
      category: EventCategory.API,
      severity: EventSeverity.INFO,
      data: {
        clientCount: this.clients.size,
        healthCheckInterval: this.healthCheckIntervalMs,
      },
      timestamp: Date.now(),
      source: 'APIIntegrationManager',
    });
  }

  public async stop(): Promise<void> {
    this.stopHealthChecks();

    this.emitEvent({
      type: 'integration:manager_stopped',
      category: EventCategory.API,
      severity: EventSeverity.INFO,
      data: {
        clientCount: this.clients.size,
      },
      timestamp: Date.now(),
      source: 'APIIntegrationManager',
    });
  }

  private startHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.healthCheckIntervalMs);
  }

  private stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  private async performHealthChecks(): Promise<void> {
    const results: { [key: string]: boolean } = {};

    for (const [name, client] of this.clients) {
      try {
        const isHealthy = await client.isHealthy();
        results[name] = isHealthy;

        if (!isHealthy) {
          this.emitEvent({
            type: 'integration:health_check_failed',
            category: EventCategory.API,
            severity: EventSeverity.WARNING,
            data: {
              clientName: name,
            },
            timestamp: Date.now(),
            source: 'APIIntegrationManager',
          });
        }
      } catch (error) {
        results[name] = false;
        this.emitEvent({
          type: 'integration:health_check_error',
          category: EventCategory.API,
          severity: EventSeverity.ERROR,
          data: {
            clientName: name,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          timestamp: Date.now(),
          source: 'APIIntegrationManager',
        });
      }
    }

    this.emitEvent({
      type: 'integration:health_check_completed',
      category: EventCategory.API,
      severity: EventSeverity.DEBUG,
      data: {
        results,
        healthyCount: Object.values(results).filter(Boolean).length,
        totalCount: Object.keys(results).length,
      },
      timestamp: Date.now(),
      source: 'APIIntegrationManager',
    });
  }

  private async validateAllConnections(): Promise<void> {
    const results: { [key: string]: boolean } = {};

    for (const [name, client] of this.clients) {
      try {
        const isValid = await client.validateConnection();
        results[name] = isValid;

        if (isValid) {
          this.emitEvent({
            type: 'integration:connection_validated',
            category: EventCategory.API,
            severity: EventSeverity.INFO,
            data: {
              clientName: name,
            },
            timestamp: Date.now(),
            source: 'APIIntegrationManager',
          });
        } else {
          this.emitEvent({
            type: 'integration:connection_validation_failed',
            category: EventCategory.API,
            severity: EventSeverity.ERROR,
            data: {
              clientName: name,
            },
            timestamp: Date.now(),
            source: 'APIIntegrationManager',
          });
        }
      } catch (error) {
        results[name] = false;
        this.emitEvent({
          type: 'integration:connection_validation_error',
          category: EventCategory.API,
          severity: EventSeverity.ERROR,
          data: {
            clientName: name,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          timestamp: Date.now(),
          source: 'APIIntegrationManager',
        });
      }
    }

    this.emitEvent({
      type: 'integration:connections_validated',
      category: EventCategory.API,
      severity: EventSeverity.INFO,
      data: {
        results,
        validCount: Object.values(results).filter(Boolean).length,
        totalCount: Object.keys(results).length,
      },
      timestamp: Date.now(),
      source: 'APIIntegrationManager',
    });
  }

  public getClient<T extends BaseAPIClient>(name: string): T | undefined {
    return this.clients.get(name) as T | undefined;
  }

  public getJiraClient(): JiraClient | undefined {
    return this.getClient<JiraClient>('jira');
  }

  public getNotionClient(): NotionClient | undefined {
    return this.getClient<NotionClient>('notion');
  }

  public getFigmaClient(): FigmaClient | undefined {
    return this.getClient<FigmaClient>('figma');
  }

  public async getStatus(): Promise<IntegrationStatus[]> {
    const statuses: IntegrationStatus[] = [];

    for (const [name, client] of this.clients) {
      try {
        const healthy = await client.isHealthy();
        const connected = await client.validateConnection();

        statuses.push({
          name,
          enabled: true,
          healthy,
          connected,
          lastCheck: Date.now(),
          stats: client.getStats(),
        });
      } catch (error) {
        statuses.push({
          name,
          enabled: true,
          healthy: false,
          connected: false,
          lastCheck: Date.now(),
          stats: null,
        });
      }
    }

    this.emitEvent({
      type: 'integration:status_retrieved',
      category: EventCategory.API,
      severity: EventSeverity.DEBUG,
      data: {
        statusCount: statuses.length,
        healthyCount: statuses.filter((s) => s.healthy).length,
        connectedCount: statuses.filter((s) => s.connected).length,
      },
      timestamp: Date.now(),
      source: 'APIIntegrationManager',
    });

    return statuses;
  }

  public async syncAll(): Promise<void> {
    this.emitEvent({
      type: 'integration:sync_started',
      category: EventCategory.API,
      severity: EventSeverity.INFO,
      data: {
        clientCount: this.clients.size,
      },
      timestamp: Date.now(),
      source: 'APIIntegrationManager',
    });

    const syncPromises: Promise<void>[] = [];

    if (this.clients.has('jira')) {
      syncPromises.push(this.syncJira());
    }

    if (this.clients.has('notion')) {
      syncPromises.push(this.syncNotion());
    }

    if (this.clients.has('figma')) {
      syncPromises.push(this.syncFigma());
    }

    try {
      await Promise.allSettled(syncPromises);

      this.emitEvent({
        type: 'integration:sync_completed',
        category: EventCategory.API,
        severity: EventSeverity.INFO,
        data: {
          clientCount: this.clients.size,
        },
        timestamp: Date.now(),
        source: 'APIIntegrationManager',
      });
    } catch (error) {
      this.emitEvent({
        type: 'integration:sync_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: 'APIIntegrationManager',
      });
    }
  }

  private async syncJira(): Promise<void> {
    const jiraClient = this.getJiraClient();
    if (!jiraClient) return;

    try {
      await jiraClient.getRecentActivity();
    } catch (error) {
      this.emitEvent({
        type: 'integration:jira_sync_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: 'APIIntegrationManager',
      });
    }
  }

  private async syncNotion(): Promise<void> {
    const notionClient = this.getNotionClient();
    if (!notionClient) return;

    try {
      await notionClient.getRecentlyEdited();
    } catch (error) {
      this.emitEvent({
        type: 'integration:notion_sync_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: 'APIIntegrationManager',
      });
    }
  }

  private async syncFigma(): Promise<void> {
    const figmaClient = this.getFigmaClient();
    if (!figmaClient) return;

    try {
      await figmaClient.getRecentActivity();
    } catch (error) {
      this.emitEvent({
        type: 'integration:figma_sync_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: 'APIIntegrationManager',
      });
    }
  }

  private emitEvent(event: Partial<BaseEvent>): void {
    const fullEvent = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...event,
      timestamp: event.timestamp || Date.now(),
    } as BaseEvent;

    this.eventEngine.publish(fullEvent);
  }

  public setHealthCheckInterval(intervalMs: number): void {
    this.healthCheckIntervalMs = intervalMs;

    if (this.healthCheckInterval) {
      this.stopHealthChecks();
      this.startHealthChecks();
    }
  }

  public getConfiguration(): IntegrationConfig {
    const result: IntegrationConfig = {};

    if (this.config.jira) {
      result.jira = {
        ...this.config.jira,
        apiToken: this.config.jira.apiToken ? '[HIDDEN]' : undefined,
      } as JiraConfig;
    }

    if (this.config.notion) {
      result.notion = {
        ...this.config.notion,
        apiToken: '[HIDDEN]',
      } as NotionConfig;
    }

    if (this.config.figma) {
      result.figma = {
        ...this.config.figma,
        accessToken: '[HIDDEN]',
      } as FigmaConfig;
    }

    return result;
  }
}
