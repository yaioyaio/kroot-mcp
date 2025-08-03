import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { EventEngine } from '../events/engine.js';
import { BaseEvent, EventCategory, EventSeverity } from '../events/types/base.js';

export interface APIClientConfig {
  baseURL: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
  auth?: {
    type: 'bearer' | 'basic' | 'apikey';
    token?: string;
    username?: string;
    password?: string;
    keyName?: string;
    keyValue?: string;
  };
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  exponentialBase: number;
  retryCondition?: (error: any) => boolean;
}

export abstract class BaseAPIClient {
  protected client: AxiosInstance;
  protected config: APIClientConfig;
  protected retryConfig: RetryConfig;
  protected eventEngine: EventEngine | undefined;

  constructor(config: APIClientConfig, eventEngine?: EventEngine) {
    this.config = config;
    this.eventEngine = eventEngine;

    this.retryConfig = {
      maxRetries: config.maxRetries || 3,
      baseDelay: config.retryDelay || 1000,
      maxDelay: 30000,
      exponentialBase: 2,
      retryCondition: this.defaultRetryCondition,
    };

    this.client = this.createAxiosInstance();
    this.setupInterceptors();
  }

  private createAxiosInstance(): AxiosInstance {
    const axiosConfig: AxiosRequestConfig = {
      baseURL: this.config.baseURL,
      timeout: this.config.timeout || 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'DevFlow-Monitor-MCP/0.1.0',
        ...this.config.headers,
      },
    };

    if (this.config.auth) {
      this.setupAuthentication(axiosConfig);
    }

    return axios.create(axiosConfig);
  }

  private setupAuthentication(axiosConfig: AxiosRequestConfig): void {
    const { auth } = this.config;

    if (!auth) return;

    switch (auth.type) {
      case 'bearer':
        if (auth.token) {
          axiosConfig.headers = {
            ...axiosConfig.headers,
            Authorization: `Bearer ${auth.token}`,
          };
        }
        break;

      case 'basic':
        if (auth.username && auth.password) {
          const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
          axiosConfig.headers = {
            ...axiosConfig.headers,
            Authorization: `Basic ${credentials}`,
          };
        }
        break;

      case 'apikey':
        if (auth.keyName && auth.keyValue) {
          axiosConfig.headers = {
            ...axiosConfig.headers,
            [auth.keyName]: auth.keyValue,
          };
        }
        break;
    }
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      (config) => {
        this.emitEvent({
          type: 'api:request_start',
          category: EventCategory.API,
          severity: EventSeverity.DEBUG,
          data: {
            url: config.url,
            method: config.method?.toUpperCase(),
            baseURL: config.baseURL,
          },
          timestamp: Date.now(),
          source: this.constructor.name,
        });
        return config;
      },
      (error) => {
        this.emitEvent({
          type: 'api:request_error',
          category: EventCategory.API,
          severity: EventSeverity.ERROR,
          data: {
            error: error.message,
            config: error.config,
          },
          timestamp: Date.now(),
          source: this.constructor.name,
        });
        return Promise.reject(error);
      },
    );

    this.client.interceptors.response.use(
      (response) => {
        this.emitEvent({
          type: 'api:response_success',
          category: EventCategory.API,
          severity: EventSeverity.DEBUG,
          data: {
            url: response.config.url,
            status: response.status,
            statusText: response.statusText,
            responseTime: this.calculateResponseTime(response),
          },
          timestamp: Date.now(),
          source: this.constructor.name,
        });
        return response;
      },
      (error) => {
        this.emitEvent({
          type: 'api:response_error',
          category: EventCategory.API,
          severity: EventSeverity.ERROR,
          data: {
            url: error.config?.url,
            status: error.response?.status,
            statusText: error.response?.statusText,
            message: error.message,
          },
          timestamp: Date.now(),
          source: this.constructor.name,
        });
        return Promise.reject(error);
      },
    );
  }

  private calculateResponseTime(response: AxiosResponse): number | undefined {
    const config = response.config as any;
    if (config.metadata?.startTime) {
      return Date.now() - config.metadata.startTime;
    }
    return undefined;
  }

  private defaultRetryCondition(error: any): boolean {
    if (!error.response) {
      return true;
    }

    const status = error.response.status;
    return status >= 500 || status === 429 || status === 408;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private calculateDelay(attempt: number): number {
    const delay = Math.min(
      this.retryConfig.baseDelay * Math.pow(this.retryConfig.exponentialBase, attempt),
      this.retryConfig.maxDelay,
    );

    const jitter = delay * 0.1 * Math.random();
    return Math.floor(delay + jitter);
  }

  protected async makeRequest<T = any>(
    config: AxiosRequestConfig,
    customRetryConfig?: Partial<RetryConfig>,
  ): Promise<AxiosResponse<T>> {
    const retryConfig = { ...this.retryConfig, ...customRetryConfig };
    let lastError: any;

    (config as any).metadata = { startTime: Date.now() };

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        const response = await this.client.request<T>(config);

        if (attempt > 0) {
          this.emitEvent({
            type: 'api:retry_success',
            category: EventCategory.API,
            severity: EventSeverity.INFO,
            data: {
              url: config.url,
              attempt,
              totalAttempts: attempt + 1,
            },
            timestamp: Date.now(),
            source: this.constructor.name,
          });
        }

        return response;
      } catch (error) {
        lastError = error;

        const shouldRetry =
          retryConfig.retryCondition?.(error) ?? this.defaultRetryCondition(error);

        if (attempt < retryConfig.maxRetries && shouldRetry) {
          const delayMs = this.calculateDelay(attempt);

          this.emitEvent({
            type: 'api:retry_attempt',
            category: EventCategory.API,
            severity: EventSeverity.WARNING,
            data: {
              url: config.url,
              attempt: attempt + 1,
              maxRetries: retryConfig.maxRetries,
              delayMs,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            timestamp: Date.now(),
            source: this.constructor.name,
          });

          await this.delay(delayMs);
        } else {
          break;
        }
      }
    }

    this.emitEvent({
      type: 'api:max_retries_exceeded',
      category: EventCategory.API,
      severity: EventSeverity.ERROR,
      data: {
        url: config.url,
        maxRetries: retryConfig.maxRetries,
        finalError: lastError instanceof Error ? lastError.message : 'Unknown error',
      },
      timestamp: Date.now(),
      source: this.constructor.name,
    });

    throw lastError;
  }

  protected emitEvent(event: Partial<BaseEvent>): void {
    if (this.eventEngine) {
      const fullEvent = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...event,
        timestamp: event.timestamp || Date.now(),
      } as BaseEvent;

      this.eventEngine.publish(fullEvent);
    }
  }

  public async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.makeRequest<T>({ ...config, method: 'GET', url });
  }

  public async post<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.makeRequest<T>({ ...config, method: 'POST', url, data });
  }

  public async put<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.makeRequest<T>({ ...config, method: 'PUT', url, data });
  }

  public async patch<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.makeRequest<T>({ ...config, method: 'PATCH', url, data });
  }

  public async delete<T = any>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.makeRequest<T>({ ...config, method: 'DELETE', url });
  }

  public updateAuth(auth: APIClientConfig['auth']): void {
    this.config = { ...this.config, auth };

    if (auth) {
      const axiosConfig: AxiosRequestConfig = { headers: {} };
      this.setupAuthentication(axiosConfig);

      if (axiosConfig.headers) {
        Object.assign(this.client.defaults.headers, axiosConfig.headers);
      }
    }

    this.emitEvent({
      type: 'api:auth_updated',
      category: EventCategory.API,
      severity: EventSeverity.INFO,
      data: {
        authType: auth?.type,
        hasToken: !!auth?.token,
        hasCredentials: !!(auth?.username && auth?.password),
        hasApiKey: !!(auth?.keyName && auth?.keyValue),
      },
      timestamp: Date.now(),
      source: this.constructor.name,
    });
  }

  public getStats() {
    return {
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      maxRetries: this.retryConfig.maxRetries,
      authType: this.config.auth?.type,
      hasAuth: !!this.config.auth,
    };
  }

  abstract getName(): string;
  abstract isHealthy(): Promise<boolean>;
  abstract validateConnection(): Promise<boolean>;
}
