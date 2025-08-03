import { BaseAPIClient, APIClientConfig } from './base.js';
import { EventEngine } from '../events/engine.js';
import { EventCategory, EventSeverity } from '../events/types/base.js';

export interface NotionConfig extends APIClientConfig {
  apiToken: string;
  version?: string;
}

export interface NotionPage {
  id: string;
  object: 'page';
  created_time: string;
  last_edited_time: string;
  created_by: {
    id: string;
    object: 'user';
  };
  last_edited_by: {
    id: string;
    object: 'user';
  };
  cover?: {
    type: string;
    url?: string;
  };
  icon?: {
    type: string;
    emoji?: string;
    url?: string;
  };
  parent: {
    type: string;
    database_id?: string;
    page_id?: string;
    workspace?: boolean;
  };
  archived: boolean;
  properties: Record<string, any>;
  url: string;
  public_url?: string;
}

export interface NotionDatabase {
  id: string;
  object: 'database';
  created_time: string;
  last_edited_time: string;
  created_by: {
    id: string;
    object: 'user';
  };
  last_edited_by: {
    id: string;
    object: 'user';
  };
  title: Array<{
    type: string;
    text: {
      content: string;
    };
  }>;
  description: Array<{
    type: string;
    text: {
      content: string;
    };
  }>;
  icon?: {
    type: string;
    emoji?: string;
    url?: string;
  };
  cover?: {
    type: string;
    url?: string;
  };
  properties: Record<string, any>;
  parent: {
    type: string;
    page_id?: string;
    workspace?: boolean;
  };
  url: string;
  archived: boolean;
}

export interface NotionBlock {
  id: string;
  object: 'block';
  type: string;
  created_time: string;
  last_edited_time: string;
  created_by: {
    id: string;
    object: 'user';
  };
  last_edited_by: {
    id: string;
    object: 'user';
  };
  has_children: boolean;
  archived: boolean;
  [key: string]: any;
}

export class NotionClient extends BaseAPIClient {
  constructor(config: NotionConfig, eventEngine?: EventEngine) {
    const notionConfig: APIClientConfig = {
      baseURL: 'https://api.notion.com/v1',
      timeout: config.timeout || 15000,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 2000,
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        'Notion-Version': config.version || '2022-06-28',
        'Content-Type': 'application/json',
        ...config.headers,
      },
    };

    super(notionConfig, eventEngine);
  }

  getName(): string {
    return 'NotionClient';
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.get('/users/me');
      return response.status === 200;
    } catch (error) {
      this.emitEvent({
        type: 'notion:health_check_failed',
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
      const response = await this.get('/users/me');

      this.emitEvent({
        type: 'notion:connection_validated',
        category: EventCategory.API,
        severity: EventSeverity.INFO,
        data: {
          user: response.data.name,
          userId: response.data.id,
          type: response.data.type,
        },
        timestamp: Date.now(),
        source: this.getName(),
      });

      return response.status === 200;
    } catch (error) {
      this.emitEvent({
        type: 'notion:connection_validation_failed',
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

  async searchPages(query?: string, filter?: any): Promise<NotionPage[]> {
    try {
      const payload: any = {
        page_size: 100,
      };

      if (query) {
        payload.query = query;
      }

      if (filter) {
        payload.filter = filter;
      }

      const response = await this.post('/search', payload);

      const pages = response.data.results.filter((item: any) => item.object === 'page');

      this.emitEvent({
        type: 'notion:pages_searched',
        category: EventCategory.API,
        severity: EventSeverity.INFO,
        data: {
          query,
          pageCount: pages.length,
          totalResults: response.data.results.length,
        },
        timestamp: Date.now(),
        source: this.getName(),
      });

      return pages;
    } catch (error) {
      this.emitEvent({
        type: 'notion:pages_search_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          query,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: this.getName(),
      });
      throw error;
    }
  }

  async searchDatabases(query?: string): Promise<NotionDatabase[]> {
    try {
      const payload: any = {
        filter: {
          value: 'database',
          property: 'object',
        },
        page_size: 100,
      };

      if (query) {
        payload.query = query;
      }

      const response = await this.post('/search', payload);

      const databases = response.data.results.filter((item: any) => item.object === 'database');

      this.emitEvent({
        type: 'notion:databases_searched',
        category: EventCategory.API,
        severity: EventSeverity.INFO,
        data: {
          query,
          databaseCount: databases.length,
        },
        timestamp: Date.now(),
        source: this.getName(),
      });

      return databases;
    } catch (error) {
      this.emitEvent({
        type: 'notion:databases_search_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          query,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: this.getName(),
      });
      throw error;
    }
  }

  async getPage(pageId: string): Promise<NotionPage> {
    try {
      const response = await this.get(`/pages/${pageId}`);

      this.emitEvent({
        type: 'notion:page_fetched',
        category: EventCategory.API,
        severity: EventSeverity.DEBUG,
        data: {
          pageId,
          title: this.extractPageTitle(response.data),
          lastEdited: response.data.last_edited_time,
        },
        timestamp: Date.now(),
        source: this.getName(),
      });

      return response.data;
    } catch (error) {
      this.emitEvent({
        type: 'notion:page_fetch_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          pageId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: this.getName(),
      });
      throw error;
    }
  }

  async getDatabase(databaseId: string): Promise<NotionDatabase> {
    try {
      const response = await this.get(`/databases/${databaseId}`);

      this.emitEvent({
        type: 'notion:database_fetched',
        category: EventCategory.API,
        severity: EventSeverity.DEBUG,
        data: {
          databaseId,
          title: this.extractDatabaseTitle(response.data),
          lastEdited: response.data.last_edited_time,
        },
        timestamp: Date.now(),
        source: this.getName(),
      });

      return response.data;
    } catch (error) {
      this.emitEvent({
        type: 'notion:database_fetch_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          databaseId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: this.getName(),
      });
      throw error;
    }
  }

  async queryDatabase(databaseId: string, filter?: any, sorts?: any[]): Promise<NotionPage[]> {
    try {
      const payload: any = {
        page_size: 100,
      };

      if (filter) {
        payload.filter = filter;
      }

      if (sorts) {
        payload.sorts = sorts;
      }

      const response = await this.post(`/databases/${databaseId}/query`, payload);

      this.emitEvent({
        type: 'notion:database_queried',
        category: EventCategory.API,
        severity: EventSeverity.INFO,
        data: {
          databaseId,
          resultCount: response.data.results.length,
          hasFilter: !!filter,
          hasSorts: !!sorts,
        },
        timestamp: Date.now(),
        source: this.getName(),
      });

      return response.data.results;
    } catch (error) {
      this.emitEvent({
        type: 'notion:database_query_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          databaseId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: this.getName(),
      });
      throw error;
    }
  }

  async getPageBlocks(pageId: string): Promise<NotionBlock[]> {
    try {
      const response = await this.get(`/blocks/${pageId}/children`, {
        params: {
          page_size: 100,
        },
      });

      this.emitEvent({
        type: 'notion:page_blocks_fetched',
        category: EventCategory.API,
        severity: EventSeverity.DEBUG,
        data: {
          pageId,
          blockCount: response.data.results.length,
        },
        timestamp: Date.now(),
        source: this.getName(),
      });

      return response.data.results;
    } catch (error) {
      this.emitEvent({
        type: 'notion:page_blocks_fetch_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          pageId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: this.getName(),
      });
      throw error;
    }
  }

  async createPage(
    parent: { database_id?: string; page_id?: string },
    properties: any,
    children?: any[],
  ): Promise<NotionPage> {
    try {
      const payload: any = {
        parent,
        properties,
      };

      if (children) {
        payload.children = children;
      }

      const response = await this.post('/pages', payload);

      this.emitEvent({
        type: 'notion:page_created',
        category: EventCategory.API,
        severity: EventSeverity.INFO,
        data: {
          pageId: response.data.id,
          parentType: parent.database_id ? 'database' : 'page',
          parentId: parent.database_id || parent.page_id,
          title: this.extractPageTitle(response.data),
        },
        timestamp: Date.now(),
        source: this.getName(),
      });

      return response.data;
    } catch (error) {
      this.emitEvent({
        type: 'notion:page_creation_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          parentType: parent.database_id ? 'database' : 'page',
          parentId: parent.database_id || parent.page_id,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: this.getName(),
      });
      throw error;
    }
  }

  async updatePage(pageId: string, properties: any): Promise<NotionPage> {
    try {
      const response = await this.patch(`/pages/${pageId}`, { properties });

      this.emitEvent({
        type: 'notion:page_updated',
        category: EventCategory.API,
        severity: EventSeverity.INFO,
        data: {
          pageId,
          title: this.extractPageTitle(response.data),
          lastEdited: response.data.last_edited_time,
        },
        timestamp: Date.now(),
        source: this.getName(),
      });

      return response.data;
    } catch (error) {
      this.emitEvent({
        type: 'notion:page_update_failed',
        category: EventCategory.API,
        severity: EventSeverity.ERROR,
        data: {
          pageId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
        source: this.getName(),
      });
      throw error;
    }
  }

  async getRecentlyEdited(days: number = 7): Promise<NotionPage[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    try {
      const filter = {
        property: 'object',
        value: 'page',
      };

      const sorts = [
        {
          property: 'last_edited_time',
          direction: 'descending',
        },
      ];

      const response = await this.post('/search', {
        filter,
        sorts,
        page_size: 100,
      });

      const recentPages = response.data.results.filter((page: any) => {
        const lastEdited = new Date(page.last_edited_time);
        return lastEdited >= since;
      });

      this.emitEvent({
        type: 'notion:recent_pages_fetched',
        category: EventCategory.API,
        severity: EventSeverity.INFO,
        data: {
          days,
          recentPageCount: recentPages.length,
          totalPages: response.data.results.length,
        },
        timestamp: Date.now(),
        source: this.getName(),
      });

      return recentPages;
    } catch (error) {
      this.emitEvent({
        type: 'notion:recent_pages_fetch_failed',
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

  private extractPageTitle(page: any): string {
    const titleProperty = Object.values(page.properties).find(
      (prop: any) => prop.type === 'title',
    ) as any;

    if (titleProperty && titleProperty.title && titleProperty.title.length > 0) {
      return titleProperty.title[0].plain_text;
    }

    return 'Untitled';
  }

  private extractDatabaseTitle(database: any): string {
    if (database.title && database.title.length > 0) {
      return database.title[0].text.content;
    }
    return 'Untitled Database';
  }
}
