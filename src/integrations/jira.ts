import { BaseAPIClient, APIClientConfig } from './base.js';
import { EventEngine } from '../events/engine.js';
import { EventCategory, EventSeverity } from '../events/types/base.js';

export interface JiraConfig extends APIClientConfig {
  domain: string;
  project?: string;
  email?: string;
  apiToken?: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  description?: string;
  status: {
    name: string;
    category: string;
  };
  assignee?: {
    accountId: string;
    displayName: string;
    emailAddress: string;
  };
  reporter: {
    accountId: string;
    displayName: string;
    emailAddress: string;
  };
  issueType: {
    name: string;
    iconUrl: string;
  };
  priority: {
    name: string;
    iconUrl: string;
  };
  created: string;
  updated: string;
  labels: string[];
  components: Array<{
    name: string;
  }>;
  customFields?: Record<string, any>;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  description?: string;
  lead: {
    accountId: string;
    displayName: string;
  };
  projectTypeKey: string;
  style: string;
}

export class JiraClient extends BaseAPIClient {
  private domain: string;
  private project?: string;

  constructor(config: JiraConfig, eventEngine?: EventEngine) {
    const jiraConfig: APIClientConfig = {
      baseURL: `https://${config.domain}/rest/api/3`,
      timeout: config.timeout || 15000,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 2000,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...config.headers,
      },
      ...(config.auth
        ? { auth: config.auth }
        : config.email && config.apiToken
          ? {
              auth: {
                type: 'basic' as const,
                username: config.email,
                password: config.apiToken,
              },
            }
          : {}),
    };

    super(jiraConfig, eventEngine);
    this.domain = config.domain;
    this.project = config.project || undefined;
  }

  getName(): string {
    return 'JiraClient';
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.get('/serverInfo');
      return response.status === 200;
    } catch (error) {
      this.emitEvent({
        type: 'jira:health_check_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          domain: this.domain,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: this.getName(),
      });
      return false;
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      const response = await this.get('/myself');

      this.emitEvent({
        type: 'jira:connection_validated',
        category: EventCategory.API,
        severity: EventSeverity.INFO,
        data: {
          domain: this.domain,
          user: response.data.displayName,
          accountId: response.data.accountId,
        },
        timestamp: Date.now(),
        source: this.getName(),
      });

      return response.status === 200;
    } catch (error) {
      this.emitEvent({
        type: 'jira:connection_validation_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          domain: this.domain,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: this.getName(),
      });
      return false;
    }
  }

  async getProjects(): Promise<JiraProject[]> {
    try {
      const response = await this.get('/project/search', {
        params: {
          expand: 'description,lead,projectKeys',
        },
      });

      const projects = response.data.values.map((project: any) => ({
        id: project.id,
        key: project.key,
        name: project.name,
        description: project.description,
        lead: {
          accountId: project.lead.accountId,
          displayName: project.lead.displayName,
        },
        projectTypeKey: project.projectTypeKey,
        style: project.style,
      }));

      this.emitEvent({
        type: 'jira:projects_fetched',
        category: EventCategory.API,
        severity: EventSeverity.INFO,
        data: {
          domain: this.domain,
          projectCount: projects.length,
        },
        timestamp: Date.now(),
        source: this.getName(),
      });

      return projects;
    } catch (error) {
      this.emitEvent({
        type: 'jira:projects_fetch_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          domain: this.domain,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: this.getName(),
      });
      throw error;
    }
  }

  async getIssues(projectKey?: string, jql?: string): Promise<JiraIssue[]> {
    const targetProject = projectKey || this.project;

    let searchJql = jql;
    if (!searchJql && targetProject) {
      searchJql = `project = ${targetProject} ORDER BY updated DESC`;
    } else if (!searchJql) {
      searchJql = 'updated >= -7d ORDER BY updated DESC';
    }

    try {
      const response = await this.get('/search', {
        params: {
          jql: searchJql,
          fields: [
            'summary',
            'description',
            'status',
            'assignee',
            'reporter',
            'issuetype',
            'priority',
            'created',
            'updated',
            'labels',
            'components',
          ].join(','),
          maxResults: 100,
        },
      });

      const issues = response.data.issues.map((issue: any) => ({
        id: issue.id,
        key: issue.key,
        summary: issue.fields.summary,
        description: issue.fields.description,
        status: {
          name: issue.fields.status.name,
          category: issue.fields.status.statusCategory.name,
        },
        assignee: issue.fields.assignee
          ? {
              accountId: issue.fields.assignee.accountId,
              displayName: issue.fields.assignee.displayName,
              emailAddress: issue.fields.assignee.emailAddress,
            }
          : undefined,
        reporter: {
          accountId: issue.fields.reporter.accountId,
          displayName: issue.fields.reporter.displayName,
          emailAddress: issue.fields.reporter.emailAddress,
        },
        issueType: {
          name: issue.fields.issuetype.name,
          iconUrl: issue.fields.issuetype.iconUrl,
        },
        priority: {
          name: issue.fields.priority.name,
          iconUrl: issue.fields.priority.iconUrl,
        },
        created: issue.fields.created,
        updated: issue.fields.updated,
        labels: issue.fields.labels || [],
        components: (issue.fields.components || []).map((comp: any) => ({
          name: comp.name,
        })),
      }));

      this.emitEvent({
        type: 'jira:issues_fetched',
        category: EventCategory.API,
        severity: EventSeverity.INFO,
        data: {
          domain: this.domain,
          project: targetProject,
          issueCount: issues.length,
          jql: searchJql,
        },
        timestamp: Date.now(),
        source: this.getName(),
      });

      return issues;
    } catch (error) {
      this.emitEvent({
        type: 'jira:issues_fetch_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          domain: this.domain,
          project: targetProject,
          jql: searchJql,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: this.getName(),
      });
      throw error;
    }
  }

  async getIssue(issueKey: string): Promise<JiraIssue> {
    try {
      const response = await this.get(`/issue/${issueKey}`, {
        params: {
          fields: [
            'summary',
            'description',
            'status',
            'assignee',
            'reporter',
            'issuetype',
            'priority',
            'created',
            'updated',
            'labels',
            'components',
          ].join(','),
        },
      });

      const issue = response.data;
      const mappedIssue: JiraIssue = {
        id: issue.id,
        key: issue.key,
        summary: issue.fields.summary,
        description: issue.fields.description,
        status: {
          name: issue.fields.status.name,
          category: issue.fields.status.statusCategory.name,
        },
        assignee: issue.fields.assignee
          ? {
              accountId: issue.fields.assignee.accountId,
              displayName: issue.fields.assignee.displayName,
              emailAddress: issue.fields.assignee.emailAddress,
            }
          : undefined,
        reporter: {
          accountId: issue.fields.reporter.accountId,
          displayName: issue.fields.reporter.displayName,
          emailAddress: issue.fields.reporter.emailAddress,
        },
        issueType: {
          name: issue.fields.issuetype.name,
          iconUrl: issue.fields.issuetype.iconUrl,
        },
        priority: {
          name: issue.fields.priority.name,
          iconUrl: issue.fields.priority.iconUrl,
        },
        created: issue.fields.created,
        updated: issue.fields.updated,
        labels: issue.fields.labels || [],
        components: (issue.fields.components || []).map((comp: any) => ({
          name: comp.name,
        })),
      };

      this.emitEvent({
        type: 'jira:issue_fetched',
        category: EventCategory.API,
        severity: EventSeverity.DEBUG,
        data: {
          domain: this.domain,
          issueKey,
          status: mappedIssue.status.name,
          issueType: mappedIssue.issueType.name,
        },
        timestamp: Date.now(),
        source: this.getName(),
      });

      return mappedIssue;
    } catch (error) {
      this.emitEvent({
        type: 'jira:issue_fetch_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          domain: this.domain,
          issueKey,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: this.getName(),
      });
      throw error;
    }
  }

  async createIssue(issueData: {
    summary: string;
    description?: string;
    issueType: string;
    priority?: string;
    assignee?: string;
    labels?: string[];
    components?: string[];
  }): Promise<JiraIssue> {
    const targetProject = this.project;
    if (!targetProject) {
      throw new Error('Project key is required for creating issues');
    }

    try {
      const payload = {
        fields: {
          project: { key: targetProject },
          summary: issueData.summary,
          description: issueData.description,
          issuetype: { name: issueData.issueType },
          ...(issueData.priority && { priority: { name: issueData.priority } }),
          ...(issueData.assignee && { assignee: { accountId: issueData.assignee } }),
          ...(issueData.labels && { labels: issueData.labels }),
          ...(issueData.components && {
            components: issueData.components.map((name) => ({ name })),
          }),
        },
      };

      const response = await this.post('/issue', payload);

      this.emitEvent({
        type: 'jira:issue_created',
        category: EventCategory.API,
        severity: EventSeverity.INFO,
        data: {
          domain: this.domain,
          project: targetProject,
          issueKey: response.data.key,
          issueId: response.data.id,
          summary: issueData.summary,
        },
        timestamp: Date.now(),
        source: this.getName(),
      });

      return await this.getIssue(response.data.key);
    } catch (error) {
      this.emitEvent({
        type: 'jira:issue_creation_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          domain: this.domain,
          project: targetProject,
          summary: issueData.summary,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: this.getName(),
      });
      throw error;
    }
  }

  async updateIssueStatus(issueKey: string, transitionId: string): Promise<void> {
    try {
      await this.post(`/issue/${issueKey}/transitions`, {
        transition: { id: transitionId },
      });

      this.emitEvent({
        type: 'jira:issue_status_updated',
        category: EventCategory.API,
        severity: EventSeverity.INFO,
        data: {
          domain: this.domain,
          issueKey,
          transitionId,
        },
        timestamp: Date.now(),
        source: this.getName(),
      });
    } catch (error) {
      this.emitEvent({
        type: 'jira:issue_status_update_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          domain: this.domain,
          issueKey,
          transitionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: this.getName(),
      });
      throw error;
    }
  }

  async getRecentActivity(projectKey?: string, days: number = 7): Promise<any[]> {
    const targetProject = projectKey || this.project;
    const jql = targetProject
      ? `project = ${targetProject} AND updated >= -${days}d ORDER BY updated DESC`
      : `updated >= -${days}d ORDER BY updated DESC`;

    try {
      const issues = await this.getIssues(targetProject, jql);

      this.emitEvent({
        type: 'jira:activity_fetched',
        category: EventCategory.API,
        severity: EventSeverity.INFO,
        data: {
          domain: this.domain,
          project: targetProject,
          days,
          activityCount: issues.length,
        },
        timestamp: Date.now(),
        source: this.getName(),
      });

      return issues;
    } catch (error) {
      this.emitEvent({
        type: 'jira:activity_fetch_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          domain: this.domain,
          project: targetProject,
          days,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: this.getName(),
      });
      throw error;
    }
  }
}
