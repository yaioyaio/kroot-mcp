/**
 * 알림 엔진
 * 알림 규칙을 관리하고 조건에 따라 알림을 발송합니다.
 */

import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import { eventEngine } from '../events/engine.js';
import { BaseEvent, EventSeverity } from '../events/types/base.js';
import { metricsCollector } from '../analyzers/metrics-collector.js';
import { bottleneckDetector } from '../analyzers/bottleneck-detector.js';
import {
  NotificationChannel,
  NotificationPriority,
  NotificationStatus,
  NotificationRule,
  NotificationMessage,
  NotificationResult,
  ChannelConfig,
  RuleCondition,
  RuleConditionType,
  NotificationStats,
} from './types.js';

export interface NotificationEngineOptions {
  maxRetries?: number;
  retryDelay?: number;
  queueSize?: number;
  batchSize?: number;
  defaultPriority?: NotificationPriority;
}

interface NotificationQueueItem {
  _message: NotificationMessage;
  attempts: number;
  nextRetry?: Date;
}

export class NotificationEngine extends EventEmitter {
  private isRunning = false;
  private rules = new Map<string, NotificationRule>();
  private channels = new Map<NotificationChannel, ChannelConfig>();
  private notifiers = new Map<NotificationChannel, any>();
  private queue: NotificationQueueItem[] = [];
  private processTimer?: NodeJS.Timeout | undefined;
  private eventSubscriptionId?: string | undefined;
  private throttleMap = new Map<string, number[]>();
  private _stats: NotificationStats = {
    total: 0,
    sent: 0,
    failed: 0,
    pending: 0,
    byChannel: {} as Record<NotificationChannel, number>,
    byPriority: {} as Record<NotificationPriority, number>,
    bySeverity: {} as Record<EventSeverity, number>,
    lastHour: 0,
    last24Hours: 0,
  };

  constructor(private options: NotificationEngineOptions = {}) {
    super();
    this.initializeDefaultRules();
  }

  /**
   * 알림 엔진 시작
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // 이벤트 구독
    this.eventSubscriptionId = eventEngine.subscribe('*', (event) => {
      this.handleEvent(event);
    });

    // 메트릭 이벤트 구독
    metricsCollector.on('metrics-updated', (metrics) => {
      this.handleMetricsUpdate(metrics);
    });

    // 병목 현상 감지 구독
    bottleneckDetector.on('bottleneck-detected', (bottleneck) => {
      this.handleBottleneckDetected(bottleneck);
    });

    // 큐 처리 시작
    this.processTimer = setInterval(() => {
      this.processQueue();
    }, 5000); // 5초마다

    // console.log('🔔 NotificationEngine started');
  }

  /**
   * 알림 엔진 중지
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.eventSubscriptionId) {
      eventEngine.unsubscribe(this.eventSubscriptionId);
      this.eventSubscriptionId = undefined;
    }

    if (this.processTimer) {
      clearInterval(this.processTimer);
      this.processTimer = undefined;
    }

    // console.log('🔔 NotificationEngine stopped');
  }

  /**
   * 알림 규칙 추가
   */
  addRule(rule: Omit<NotificationRule, 'id' | 'createdAt' | 'updatedAt'>): NotificationRule {
    const newRule: NotificationRule = {
      ...rule,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.rules.set(newRule.id, newRule);
    this.emit('rule-added', newRule);

    return newRule;
  }

  /**
   * 알림 규칙 업데이트
   */
  updateRule(id: string, updates: Partial<NotificationRule>): NotificationRule | undefined {
    const rule = this.rules.get(id);
    if (!rule) {
      return undefined;
    }

    const updatedRule = {
      ...rule,
      ...updates,
      id: rule.id,
      createdAt: rule.createdAt,
      updatedAt: new Date(),
    };

    this.rules.set(id, updatedRule);
    this.emit('rule-updated', updatedRule);

    return updatedRule;
  }

  /**
   * 알림 규칙 삭제
   */
  deleteRule(id: string): boolean {
    const deleted = this.rules.delete(id);
    if (deleted) {
      this.emit('rule-deleted', id);
    }
    return deleted;
  }

  /**
   * 채널 설정
   */
  configureChannel(config: ChannelConfig): void {
    this.channels.set(config.channel, config);
    
    // 채널별 notifier 초기화는 각 채널 구현 후 수행
    this.emit('channel-configured', config);
  }

  /**
   * 알림 전송
   */
  async sendNotification(
    title: string,
    content: string,
    options: {
      severity?: EventSeverity;
      priority?: NotificationPriority;
      channels?: NotificationChannel[];
      data?: Record<string, any>;
      ruleId?: string;
    } = {}
  ): Promise<NotificationMessage> {
    const _message: NotificationMessage = {
      id: uuidv4(),
      ...(options.ruleId && { ruleId: options.ruleId }),
      title,
      content,
      severity: options.severity || EventSeverity.INFO,
      priority: options.priority || this.options.defaultPriority || NotificationPriority.MEDIUM,
      channels: options.channels || this.getEnabledChannels(),
      ...(options.data && { _data: options.data }),
      createdAt: new Date(),
    };

    // 통계 업데이트
    this._stats.total++;
    this._stats.pending++;
    this.updatePriorityStats(_message.priority);
    this.updateSeverityStats(_message.severity);

    // 큐에 추가
    this.queue.push({
      _message,
      attempts: 0,
    });

    // 우선순위가 높으면 즉시 처리
    if (_message.priority === NotificationPriority.URGENT) {
      setImmediate(() => this.processQueue());
    }

    this.emit('notification-queued', _message);
    return _message;
  }

  /**
   * 이벤트 처리
   */
  private handleEvent(event: BaseEvent): void {
    // 활성화된 규칙 확인
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      if (this.checkRuleConditions(rule, event)) {
        // 스로틀링 확인
        if (this.isThrottled(rule)) {
          continue;
        }

        // 알림 생성
        const title = this.generateTitle(rule, event);
        const content = this.generateContent(rule, event);

        this.sendNotification(title, content, {
          severity: event.severity,
          priority: rule.priority,
          channels: rule.channels,
          data: { event },
          ruleId: rule.id,
        });

        // 스로틀링 기록
        this.recordThrottle(rule);
      }
    }
  }

  /**
   * 메트릭 업데이트 처리
   */
  private handleMetricsUpdate(metrics: any): void {
    // 메트릭 기반 규칙 확인
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      const hasMetricCondition = rule.conditions.some(
        c => c.type === RuleConditionType.METRIC_THRESHOLD
      );

      if (hasMetricCondition && this.checkRuleConditions(rule, metrics)) {
        if (this.isThrottled(rule)) {
          continue;
        }

        const title = `Metric Alert: ${rule.name}`;
        const content = this.generateMetricAlertContent(rule, metrics);

        this.sendNotification(title, content, {
          severity: EventSeverity.WARNING,
          priority: rule.priority,
          channels: rule.channels,
          data: { metrics },
          ruleId: rule.id,
        });

        this.recordThrottle(rule);
      }
    }
  }

  /**
   * 병목 현상 감지 처리
   */
  private handleBottleneckDetected(bottleneck: any): void {
    // 병목 현상 관련 규칙 확인
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      const hasBottleneckCondition = rule.conditions.some(
        c => c.type === RuleConditionType.BOTTLENECK_DETECTED
      );

      if (hasBottleneckCondition && this.checkRuleConditions(rule, bottleneck)) {
        if (this.isThrottled(rule)) {
          continue;
        }

        const title = `Bottleneck Detected: ${bottleneck.title}`;
        const content = `${bottleneck.description}\n\nSuggested Actions:\n${bottleneck.suggestedActions.join('\n')}`;

        this.sendNotification(title, content, {
          severity: bottleneck.severity,
          priority: this.mapBottleneckPriority(bottleneck),
          channels: rule.channels,
          data: { bottleneck },
          ruleId: rule.id,
        });

        this.recordThrottle(rule);
      }
    }
  }

  /**
   * 규칙 조건 확인
   */
  private checkRuleConditions(rule: NotificationRule, _context: any): boolean {
    let result = true;
    let combineWith: 'AND' | 'OR' = 'AND';

    for (let i = 0; i < rule.conditions.length; i++) {
      const condition = rule.conditions[i];
      if (!condition) continue;
      
      const conditionResult = this.evaluateCondition(condition, _context);

      if (i === 0) {
        result = conditionResult;
      } else {
        if (combineWith === 'AND') {
          result = result && conditionResult;
        } else {
          result = result || conditionResult;
        }
      }

      combineWith = condition.combineWith || 'AND';
    }

    return result;
  }

  /**
   * 조건 평가
   */
  private evaluateCondition(condition: RuleCondition, _context: any): boolean {
    const value = this.getValueFromContext(condition.field, _context);
    const targetValue = condition.value;

    switch (condition.operator) {
      case 'eq':
        return value === targetValue;
      case 'ne':
        return value !== targetValue;
      case 'gt':
        return value > targetValue;
      case 'gte':
        return value >= targetValue;
      case 'lt':
        return value < targetValue;
      case 'lte':
        return value <= targetValue;
      case 'contains':
        return String(value).includes(String(targetValue));
      case 'matches':
        return new RegExp(targetValue).test(String(value));
      default:
        return false;
    }
  }

  /**
   * 컨텍스트에서 값 추출
   */
  private getValueFromContext(field: string, _context: any): any {
    // 직접 필드 접근 시도
    if (_context[field] !== undefined) {
      return _context[field];
    }

    // 점 표기법으로 중첩된 경로 접근
    const parts = field.split('.');
    let value = _context;

    for (const part of parts) {
      value = value?.[part];
      if (value === undefined) break;
    }

    return value;
  }

  /**
   * 스로틀링 확인
   */
  private isThrottled(rule: NotificationRule): boolean {
    if (!rule.throttle) return false;

    const key = rule.id;
    const now = Date.now();
    const history = this.throttleMap.get(key) || [];
    
    // 시간 창 내의 기록만 유지
    const recentHistory = history.filter(
      timestamp => now - timestamp < rule.throttle!.window
    );

    this.throttleMap.set(key, recentHistory);
    return recentHistory.length >= rule.throttle.limit;
  }

  /**
   * 스로틀링 기록
   */
  private recordThrottle(rule: NotificationRule): void {
    if (!rule.throttle) return;

    const key = rule.id;
    const history = this.throttleMap.get(key) || [];
    history.push(Date.now());
    this.throttleMap.set(key, history);
  }

  /**
   * 큐 처리
   */
  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) return;

    // 우선순위 정렬
    this.queue.sort((a, b) => {
      const priorityOrder = {
        [NotificationPriority.URGENT]: 0,
        [NotificationPriority.HIGH]: 1,
        [NotificationPriority.MEDIUM]: 2,
        [NotificationPriority.LOW]: 3,
      };
      return priorityOrder[a._message.priority as keyof typeof priorityOrder] - priorityOrder[b._message.priority as keyof typeof priorityOrder];
    });

    // 배치 처리
    const batch = this.queue.splice(0, this.options.batchSize || 10);

    for (const item of batch) {
      // 재시도 대기 확인
      if (item.nextRetry && item.nextRetry > new Date()) {
        this.queue.push(item);
        continue;
      }

      try {
        await this.deliverNotification(item._message);
        this._stats.sent++;
        this._stats.pending--;
        this.emit('notification-sent', item._message);
      } catch (error) {
        item.attempts++;
        
        if (item.attempts < (this.options.maxRetries || 3)) {
          // 재시도 스케줄
          item.nextRetry = new Date(
            Date.now() + (this.options.retryDelay || 60000) * item.attempts
          );
          this.queue.push(item);
          this.emit('notification-retry', item._message, error);
        } else {
          // 최종 실패
          this._stats.failed++;
          this._stats.pending--;
          this.emit('notification-failed', item._message, error);
        }
      }
    }
  }

  /**
   * 알림 전달
   */
  private async deliverNotification(_message: NotificationMessage): Promise<void> {
    const results: NotificationResult[] = [];

    for (const channel of _message.channels) {
      const channelConfig = this.channels.get(channel);
      if (!channelConfig?.enabled) continue;

      const notifier = this.notifiers.get(channel);
      if (!notifier) {
        console.warn(`No notifier configured for channel: ${channel}`);
        continue;
      }

      try {
        const result = await notifier.send(_message, channelConfig.config);
        results.push({
          messageId: _message.id,
          channel,
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          response: result,
        });
        this.updateChannelStats(channel);
      } catch (error) {
        results.push({
          messageId: _message.id,
          channel,
          status: NotificationStatus.FAILED,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error; // 재시도를 위해 에러 전파
      }
    }

    // 결과 저장 (추후 구현)
    this.emit('notification-results', _message, results);
  }

  /**
   * 기본 규칙 초기화
   */
  private initializeDefaultRules(): void {
    // 심각한 오류 알림
    this.addRule({
      name: 'Critical Errors',
      description: 'Alert on critical errors',
      enabled: true,
      conditions: [
        {
          type: RuleConditionType.EVENT_SEVERITY,
          field: 'severity',
          operator: 'eq',
          value: EventSeverity.ERROR,
        },
      ],
      channels: [NotificationChannel.SLACK, NotificationChannel.DASHBOARD],
      priority: NotificationPriority.HIGH,
    });

    // 병목 현상 알림
    this.addRule({
      name: 'Bottleneck Detection',
      description: 'Alert when bottlenecks are detected',
      enabled: true,
      conditions: [
        {
          type: RuleConditionType.BOTTLENECK_DETECTED,
          field: 'impact',
          operator: 'gte',
          value: 70,
        },
      ],
      channels: [NotificationChannel.SLACK, NotificationChannel.DASHBOARD],
      priority: NotificationPriority.HIGH,
      throttle: {
        limit: 3,
        window: 3600000, // 1시간
      },
    });

    // 생산성 저하 알림
    this.addRule({
      name: 'Low Productivity',
      description: 'Alert when productivity drops',
      enabled: true,
      conditions: [
        {
          type: RuleConditionType.METRIC_THRESHOLD,
          field: 'productivity.score',
          operator: 'lt',
          value: 30,
        },
      ],
      channels: [NotificationChannel.DASHBOARD],
      priority: NotificationPriority.MEDIUM,
      throttle: {
        limit: 1,
        window: 86400000, // 24시간
      },
    });
  }

  /**
   * 제목 생성
   */
  private generateTitle(rule: NotificationRule, event: BaseEvent): string {
    if (rule.template) {
      return this.interpolateTemplate(rule.template, { rule, event });
    }
    return `${rule.name}: ${event.type}`;
  }

  /**
   * 내용 생성
   */
  private generateContent(_rule: NotificationRule, event: BaseEvent): string {
    const description = (event as any).description || 'N/A';
    return `Event: ${event.type}\nCategory: ${event.category}\nSeverity: ${event.severity}\nDescription: ${description}`;
  }

  /**
   * 메트릭 알림 내용 생성
   */
  private generateMetricAlertContent(rule: NotificationRule, metrics: any): string {
    const lines = ['Metric threshold alert triggered.'];
    
    for (const condition of rule.conditions) {
      if (condition.type === RuleConditionType.METRIC_THRESHOLD) {
        const value = this.getValueFromContext(condition.field, metrics);
        lines.push(`${condition.field}: ${value} ${condition.operator} ${condition.value}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 템플릿 보간
   */
  private interpolateTemplate(template: string, _context: any): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const value = this.getValueFromContext(path.trim(), _context);
      return value !== undefined ? String(value) : match;
    });
  }

  /**
   * 병목 우선순위 매핑
   */
  private mapBottleneckPriority(bottleneck: any): NotificationPriority {
    if (bottleneck.impact >= 80) return NotificationPriority.URGENT;
    if (bottleneck.impact >= 60) return NotificationPriority.HIGH;
    if (bottleneck.impact >= 40) return NotificationPriority.MEDIUM;
    return NotificationPriority.LOW;
  }

  /**
   * 활성화된 채널 목록
   */
  private getEnabledChannels(): NotificationChannel[] {
    return Array.from(this.channels.values())
      .filter(config => config.enabled)
      .map(config => config.channel);
  }

  /**
   * 통계 업데이트
   */
  private updatePriorityStats(priority: NotificationPriority): void {
    this._stats.byPriority[priority] = (this._stats.byPriority[priority] || 0) + 1;
  }

  private updateSeverityStats(severity: EventSeverity): void {
    this._stats.bySeverity[severity] = (this._stats.bySeverity[severity] || 0) + 1;
  }

  private updateChannelStats(channel: NotificationChannel): void {
    this._stats.byChannel[channel] = (this._stats.byChannel[channel] || 0) + 1;
  }

  /**
   * Notifier 등록
   */
  registerNotifier(channel: NotificationChannel, notifier: any): void {
    this.notifiers.set(channel, notifier);
  }

  /**
   * 통계 조회
   */
  getStats(): NotificationStats {
    // 시간 기반 통계 계산
    // 실제 구현에서는 타임스탬프 기반으로 계산
    this._stats.lastHour = Math.floor(this._stats.total * 0.1);
    this._stats.last24Hours = Math.floor(this._stats.total * 0.5);

    return { ...this._stats };
  }

  /**
   * 규칙 조회
   */
  getRule(id: string): NotificationRule | undefined {
    return this.rules.get(id);
  }

  /**
   * 모든 규칙 조회
   */
  getAllRules(): NotificationRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * 채널 설정 조회
   */
  getChannelConfig(channel: NotificationChannel): ChannelConfig | undefined {
    return this.channels.get(channel);
  }
}

// 싱글톤 인스턴스
export const notificationEngine = new NotificationEngine();