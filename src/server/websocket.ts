/**
 * WebSocket 서버 구현
 * 실시간 이벤트 스트리밍 및 클라이언트 연결 관리
 */

import { WebSocketServer, WebSocket, RawData } from 'ws';
import { eventEngine } from '../events/index.js';
import type { BaseEvent } from '../events/types/base.js';

/**
 * 클라이언트 연결 정보
 */
interface ClientConnection {
  id: string;
  ws: WebSocket;
  filters: {
    categories?: string[];
    severities?: string[];
    sources?: string[];
  };
  lastPing: number;
  isAlive: boolean;
}

/**
 * WebSocket 메시지 타입
 */
interface WSMessage {
  type: 'subscribe' | 'unsubscribe' | 'filter' | 'ping' | 'pong';
  payload?: any;
}

/**
 * 실시간 이벤트 스트리밍을 위한 WebSocket 서버
 */
export class DevFlowWebSocketServer {
  private wss?: WebSocketServer;
  private clients: Map<string, ClientConnection> = new Map();
  private heartbeatInterval?: NodeJS.Timeout;
  private eventSubscriptionId?: string;

  constructor() {
    this.setupEventListeners();
  }

  /**
   * WebSocket 서버 시작
   */
  start(port: number = 8081): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ 
          port,
          perMessageDeflate: false, // 압축 비활성화 (성능 개선)
        });

        this.wss.on('connection', this.handleConnection.bind(this));
        this.wss.on('error', (error) => {
          console.error('[WebSocket] Server error:', error);
          reject(error);
        });

        this.wss.on('listening', () => {
          console.log(`[WebSocket] Server listening on port ${port}`);
          this.startHeartbeat();
          resolve();
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * WebSocket 서버 중지
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = undefined as any;
      }

      if (this.eventSubscriptionId) {
        eventEngine.unsubscribe(this.eventSubscriptionId);
        this.eventSubscriptionId = undefined as any;
      }

      // 모든 클라이언트 연결 종료
      this.clients.forEach((client) => {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.close();
        }
      });
      this.clients.clear();

      if (this.wss) {
        this.wss.close(() => {
          console.log('[WebSocket] Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * 새 클라이언트 연결 처리
   */
  private handleConnection(ws: WebSocket): void {
    const clientId = this.generateClientId();
    const client: ClientConnection = {
      id: clientId,
      ws,
      filters: {},
      lastPing: Date.now(),
      isAlive: true,
    };

    this.clients.set(clientId, client);
    console.log(`[WebSocket] Client connected: ${clientId} (Total: ${this.clients.size})`);

    // 연결 확인 메시지 전송
    this.sendMessage(client, {
      type: 'connected',
      payload: {
        clientId,
        timestamp: new Date().toISOString(),
        message: 'Connected to DevFlow Monitor WebSocket Server',
      },
    });

    // 클라이언트 이벤트 리스너 설정
    ws.on('message', (data) => this.handleMessage(client, data));
    ws.on('close', () => this.handleDisconnection(client));
    ws.on('error', (error) => this.handleError(client, error));
    ws.on('pong', () => this.handlePong(client));
  }

  /**
   * 클라이언트 연결 해제 처리
   */
  private handleDisconnection(client: ClientConnection): void {
    this.clients.delete(client.id);
    console.log(`[WebSocket] Client disconnected: ${client.id} (Total: ${this.clients.size})`);
  }

  /**
   * 클라이언트 에러 처리
   */
  private handleError(client: ClientConnection, error: Error): void {
    console.error(`[WebSocket] Client error (${client.id}):`, error);
  }

  /**
   * 클라이언트 메시지 처리
   */
  private handleMessage(client: ClientConnection, data: RawData): void {
    try {
      const messageText = Array.isArray(data) ? 
        Buffer.concat(data).toString() : 
        data.toString();
      const message: WSMessage = JSON.parse(messageText);
      
      switch (message.type) {
        case 'filter':
          this.handleFilterUpdate(client, message.payload);
          break;
        case 'ping':
          this.handlePing(client);
          break;
        case 'subscribe':
          this.handleSubscribe(client, message.payload);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(client, message.payload);
          break;
        default:
          console.warn(`[WebSocket] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error(`[WebSocket] Failed to parse message from ${client.id}:`, error);
      this.sendMessage(client, {
        type: 'error',
        payload: { message: 'Invalid message format' },
      });
    }
  }

  /**
   * 필터 업데이트 처리
   */
  private handleFilterUpdate(client: ClientConnection, filters: any): void {
    client.filters = {
      categories: filters.categories || [],
      severities: filters.severities || [],
      sources: filters.sources || [],
    };

    console.log(`[WebSocket] Updated filters for ${client.id}:`, client.filters);
    
    this.sendMessage(client, {
      type: 'filter_updated',
      payload: {
        filters: client.filters,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * 구독 처리
   */
  private handleSubscribe(client: ClientConnection, payload: any): void {
    const { eventTypes } = payload || {};
    
    this.sendMessage(client, {
      type: 'subscribed',
      payload: {
        eventTypes: eventTypes || ['all'],
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * 구독 해제 처리
   */
  private handleUnsubscribe(client: ClientConnection, _payload: any): void {
    this.sendMessage(client, {
      type: 'unsubscribed',
      payload: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Ping 처리
   */
  private handlePing(client: ClientConnection): void {
    client.lastPing = Date.now();
    client.isAlive = true;
    this.sendMessage(client, { type: 'pong' });
  }

  /**
   * Pong 처리
   */
  private handlePong(client: ClientConnection): void {
    client.isAlive = true;
  }

  /**
   * 이벤트 엔진 리스너 설정
   */
  private setupEventListeners(): void {
    this.eventSubscriptionId = eventEngine.subscribe('*', (event: BaseEvent) => {
      this.broadcastEvent(event);
    });
  }

  /**
   * 이벤트 브로드캐스트
   */
  private broadcastEvent(event: BaseEvent): void {
    if (this.clients.size === 0) return;

    const eventMessage = {
      type: 'event',
      payload: {
        event,
        timestamp: new Date().toISOString(),
      },
    };

    this.clients.forEach((client) => {
      if (this.shouldSendEventToClient(client, event)) {
        this.sendMessage(client, eventMessage);
      }
    });
  }

  /**
   * 클라이언트 필터링 확인
   */
  private shouldSendEventToClient(client: ClientConnection, event: BaseEvent): boolean {
    const { filters } = client;

    // 카테고리 필터
    if (filters.categories && filters.categories.length > 0) {
      if (!filters.categories.includes(event.category)) {
        return false;
      }
    }

    // 심각도 필터
    if (filters.severities && filters.severities.length > 0) {
      if (!filters.severities.includes(event.severity)) {
        return false;
      }
    }

    // 소스 필터
    if (filters.sources && filters.sources.length > 0) {
      if (!filters.sources.includes(event.source)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 클라이언트에게 메시지 전송
   */
  private sendMessage(client: ClientConnection, message: any): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`[WebSocket] Failed to send message to ${client.id}:`, error);
      }
    }
  }

  /**
   * 모든 클라이언트에게 메시지 브로드캐스트
   */
  private broadcast(message: any): void {
    this.clients.forEach((client) => {
      this.sendMessage(client, message);
    });
  }

  /**
   * 하트비트 시작
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((client, clientId) => {
        if (!client.isAlive) {
          console.log(`[WebSocket] Terminating dead client: ${clientId}`);
          client.ws.terminate();
          this.clients.delete(clientId);
          return;
        }

        client.isAlive = false;
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
        }
      });
    }, 30000); // 30초마다 체크
  }

  /**
   * 클라이언트 ID 생성
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 서버 통계 조회
   */
  getStats() {
    return {
      connectedClients: this.clients.size,
      clients: Array.from(this.clients.values()).map(client => ({
        id: client.id,
        filters: client.filters,
        lastPing: client.lastPing,
        isAlive: client.isAlive,
      })),
      uptime: process.uptime(),
    };
  }

  /**
   * 특정 클라이언트에게 커스텀 메시지 전송
   */
  sendCustomMessage(clientId: string, message: any): boolean {
    const client = this.clients.get(clientId);
    if (client) {
      this.sendMessage(client, message);
      return true;
    }
    return false;
  }

  /**
   * 시스템 알림 브로드캐스트
   */
  broadcastSystemNotification(notification: {
    message: string;
    severity: 'info' | 'warning' | 'error';
    data?: any;
  }): void {
    this.broadcast({
      type: 'system_notification',
      payload: {
        ...notification,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

// 전역 WebSocket 서버 인스턴스
export const wsServer = new DevFlowWebSocketServer();