import { BaseAPIClient, APIClientConfig } from './base.js';
import { EventEngine } from '../events/engine.js';
import { EventCategory, EventSeverity } from '../events/types/base.js';

export interface FigmaConfig extends APIClientConfig {
  accessToken: string;
}

export interface FigmaFile {
  key: string;
  name: string;
  thumbnail_url: string;
  last_modified: string;
  version: string;
  role: string;
  editor_type: string;
  link_access: string;
}

export interface FigmaProject {
  id: string;
  name: string;
  files: FigmaFile[];
}

export interface FigmaTeam {
  id: string;
  name: string;
  projects: FigmaProject[];
}

export interface FigmaComment {
  id: string;
  file_key: string;
  parent_id?: string;
  user: {
    id: string;
    handle: string;
    img_url: string;
  };
  created_at: string;
  resolved_at?: string;
  message: string;
  client_meta: {
    x: number;
    y: number;
    node_id?: string;
    node_offset?: {
      x: number;
      y: number;
    };
  };
  order_id: string;
}

export interface FigmaFileVersion {
  id: string;
  created_at: string;
  label: string;
  description: string;
  user: {
    id: string;
    handle: string;
    img_url: string;
  };
  thumbnail_url: string;
}

export class FigmaClient extends BaseAPIClient {
  constructor(config: FigmaConfig, eventEngine?: EventEngine) {
    const figmaConfig: APIClientConfig = {
      baseURL: 'https://api.figma.com/v1',
      timeout: config.timeout || 15000,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 2000,
      headers: {
        'X-Figma-Token': config.accessToken,
        'Content-Type': 'application/json',
        ...config.headers,
      },
    };

    super(figmaConfig, eventEngine);
  }

  getName(): string {
    return 'FigmaClient';
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.get('/me');
      return response.status === 200;
    } catch (error) {
      this.emitEvent({
        type: 'figma:health_check_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
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
      const response = await this.get('/me');

      this.emitEvent({
        type: 'figma:connection_validated',
        category: EventCategory.API,
        severity: EventSeverity.INFO,
        data: {
          user: response.data.handle,
          userId: response.data.id,
          email: response.data.email,
        },
        timestamp: Date.now(),
        source: this.getName(),
      });

      return response.status === 200;
    } catch (error) {
      this.emitEvent({
        type: 'figma:connection_validation_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: this.getName(),
      });
      return false;
    }
  }

  async getTeams(): Promise<FigmaTeam[]> {
    try {
      const response = await this.get('/teams');

      const teams = response.data.teams.map((team: any) => ({
        id: team.id,
        name: team.name,
        projects: [],
      }));

      this.emitEvent({
        type: 'figma:teams_fetched',
        category: EventCategory.API,
        severity: EventSeverity.INFO,
        data: {
          teamCount: teams.length,
        },
        timestamp: Date.now(),
        source: this.getName(),
      });

      return teams;
    } catch (error) {
      this.emitEvent({
        type: 'figma:teams_fetch_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: this.getName(),
      });
      throw error;
    }
  }

  async getTeamProjects(teamId: string): Promise<FigmaProject[]> {
    try {
      const response = await this.get(`/teams/${teamId}/projects`);

      const projects = response.data.projects.map((project: any) => ({
        id: project.id,
        name: project.name,
        files: [],
      }));

      this.emitEvent({
        type: 'figma:team_projects_fetched',
        category: EventCategory.API,
        severity: EventSeverity.INFO,
        data: {
          teamId,
          projectCount: projects.length,
        },
        timestamp: Date.now(),
        source: this.getName(),
      });

      return projects;
    } catch (error) {
      this.emitEvent({
        type: 'figma:team_projects_fetch_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          teamId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: this.getName(),
      });
      throw error;
    }
  }

  async getProjectFiles(projectId: string): Promise<FigmaFile[]> {
    try {
      const response = await this.get(`/projects/${projectId}/files`);

      const files = response.data.files.map((file: any) => ({
        key: file.key,
        name: file.name,
        thumbnail_url: file.thumbnail_url,
        last_modified: file.last_modified,
        version: file.version,
        role: file.role,
        editor_type: file.editor_type,
        link_access: file.link_access,
      }));

      this.emitEvent({
        type: 'figma:project_files_fetched',
        category: EventCategory.API,
        severity: EventSeverity.INFO,
        data: {
          projectId,
          fileCount: files.length,
        },
        timestamp: Date.now(),
        source: this.getName(),
      });

      return files;
    } catch (error) {
      this.emitEvent({
        type: 'figma:project_files_fetch_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          projectId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: this.getName(),
      });
      throw error;
    }
  }

  async getFile(fileKey: string): Promise<any> {
    try {
      const response = await this.get(`/files/${fileKey}`);

      this.emitEvent({
        type: 'figma:file_fetched',
        category: EventCategory.API,
        severity: EventSeverity.DEBUG,
        data: {
          fileKey,
          name: response.data.name,
          lastModified: response.data.lastModified,
          version: response.data.version,
        },
        timestamp: Date.now(),
        source: this.getName(),
      });

      return response.data;
    } catch (error) {
      this.emitEvent({
        type: 'figma:file_fetch_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          fileKey,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: this.getName(),
      });
      throw error;
    }
  }

  async getFileVersions(fileKey: string): Promise<FigmaFileVersion[]> {
    try {
      const response = await this.get(`/files/${fileKey}/versions`);

      const versions = response.data.versions.map((version: any) => ({
        id: version.id,
        created_at: version.created_at,
        label: version.label,
        description: version.description,
        user: {
          id: version.user.id,
          handle: version.user.handle,
          img_url: version.user.img_url,
        },
        thumbnail_url: version.thumbnail_url,
      }));

      this.emitEvent({
        type: 'figma:file_versions_fetched',
        category: EventCategory.API,
        severity: EventSeverity.INFO,
        data: {
          fileKey,
          versionCount: versions.length,
        },
        timestamp: Date.now(),
        source: this.getName(),
      });

      return versions;
    } catch (error) {
      this.emitEvent({
        type: 'figma:file_versions_fetch_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          fileKey,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: this.getName(),
      });
      throw error;
    }
  }

  async getFileComments(fileKey: string): Promise<FigmaComment[]> {
    try {
      const response = await this.get(`/files/${fileKey}/comments`);

      const comments = response.data.comments.map((comment: any) => ({
        id: comment.id,
        file_key: comment.file_key,
        parent_id: comment.parent_id,
        user: {
          id: comment.user.id,
          handle: comment.user.handle,
          img_url: comment.user.img_url,
        },
        created_at: comment.created_at,
        resolved_at: comment.resolved_at,
        message: comment.message,
        client_meta: comment.client_meta,
        order_id: comment.order_id,
      }));

      this.emitEvent({
        type: 'figma:file_comments_fetched',
        category: EventCategory.API,
        severity: EventSeverity.INFO,
        data: {
          fileKey,
          commentCount: comments.length,
          unresolvedCount: comments.filter((c: FigmaComment) => !c.resolved_at).length,
        },
        timestamp: Date.now(),
        source: this.getName(),
      });

      return comments;
    } catch (error) {
      this.emitEvent({
        type: 'figma:file_comments_fetch_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          fileKey,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: this.getName(),
      });
      throw error;
    }
  }

  async postComment(
    fileKey: string,
    message: string,
    clientMeta: { x: number; y: number; node_id?: string },
  ): Promise<FigmaComment> {
    try {
      const response = await this.post(`/files/${fileKey}/comments`, {
        message,
        client_meta: clientMeta,
      });

      this.emitEvent({
        type: 'figma:comment_posted',
        category: EventCategory.API,
        severity: EventSeverity.INFO,
        data: {
          fileKey,
          commentId: response.data.id,
          message: message.substring(0, 100),
        },
        timestamp: Date.now(),
        source: this.getName(),
      });

      return response.data;
    } catch (error) {
      this.emitEvent({
        type: 'figma:comment_post_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          fileKey,
          message: message.substring(0, 100),
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: this.getName(),
      });
      throw error;
    }
  }

  async getRecentActivity(days: number = 7): Promise<any[]> {
    try {
      const teams = await this.getTeams();
      const activities: any[] = [];

      for (const team of teams) {
        const projects = await this.getTeamProjects(team.id);

        for (const project of projects) {
          const files = await this.getProjectFiles(project.id);

          const recentFiles = files.filter((file) => {
            const lastModified = new Date(file.last_modified);
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - days);
            return lastModified >= cutoff;
          });

          activities.push(
            ...recentFiles.map((file) => ({
              type: 'file_modified',
              team: team.name,
              project: project.name,
              file: file.name,
              fileKey: file.key,
              lastModified: file.last_modified,
              version: file.version,
            })),
          );
        }
      }

      this.emitEvent({
        type: 'figma:recent_activity_fetched',
        category: EventCategory.API,
        severity: EventSeverity.INFO,
        data: {
          days,
          activityCount: activities.length,
          teamCount: teams.length,
        },
        timestamp: Date.now(),
        source: this.getName(),
      });

      return activities.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
    } catch (error) {
      this.emitEvent({
        type: 'figma:recent_activity_fetch_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
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
