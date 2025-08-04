/**
 * 알림 시스템 타입 정의
 */

import { EventSeverity } from '../events/types/base.js';

/**
 * 알림 채널 타입
 */
export enum NotificationChannel {
  SLACK = 'slack',
  EMAIL = 'email',
  DASHBOARD = 'dashboard',
  SYSTEM = 'system', // 시스템 트레이
  WEBHOOK = 'webhook',
}

/**
 * 알림 우선순위
 */
export enum NotificationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

/**
 * 알림 상태
 */
export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  RETRY = 'retry',
}

/**
 * 알림 규칙 조건 타입
 */
export enum RuleConditionType {
  EVENT_TYPE = 'event_type',
  EVENT_SEVERITY = 'event_severity',
  METRIC_THRESHOLD = 'metric_threshold',
  BOTTLENECK_DETECTED = 'bottleneck_detected',
  STAGE_TRANSITION = 'stage_transition',
  AI_USAGE = 'ai_usage',
  TIME_BASED = 'time_based',
}

/**
 * 알림 규칙 조건
 */
export interface RuleCondition {
  type: RuleConditionType;
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'matches';
  value: any;
  combineWith?: 'AND' | 'OR';
}

/**
 * 알림 규칙
 */
export interface NotificationRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  conditions: RuleCondition[];
  channels: NotificationChannel[];
  priority: NotificationPriority;
  template?: string;
  throttle?: {
    limit: number;
    window: number; // 시간 창 (밀리초)
  };
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 알림 메시지
 */
export interface NotificationMessage {
  id: string;
  ruleId?: string;
  title: string;
  content: string;
  severity: EventSeverity;
  priority: NotificationPriority;
  channels: NotificationChannel[];
  data?: Record<string, any>;
  attachments?: NotificationAttachment[];
  actions?: NotificationAction[];
  createdAt: Date;
}

/**
 * 알림 첨부 파일
 */
export interface NotificationAttachment {
  title?: string;
  text?: string;
  color?: string;
  fields?: Array<{
    title: string;
    value: string;
    short?: boolean;
  }>;
  imageUrl?: string;
  thumbUrl?: string;
}

/**
 * 알림 액션
 */
export interface NotificationAction {
  type: 'button' | 'link';
  text: string;
  url?: string;
  action?: string;
  style?: 'primary' | 'danger' | 'default';
}

/**
 * 알림 전송 결과
 */
export interface NotificationResult {
  messageId: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  sentAt?: Date;
  error?: string;
  response?: any;
}

/**
 * 채널 설정
 */
export interface ChannelConfig {
  channel: NotificationChannel;
  enabled: boolean;
  config: Record<string, any>;
}

/**
 * Slack 설정
 */
export interface SlackConfig {
  webhookUrl: string;
  channel?: string;
  username?: string;
  iconEmoji?: string;
  iconUrl?: string;
}

/**
 * 이메일 설정
 */
export interface EmailConfig {
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  from: string;
  to: string[];
}

/**
 * 알림 통계
 */
export interface NotificationStats {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  byChannel: Record<NotificationChannel, number>;
  byPriority: Record<NotificationPriority, number>;
  bySeverity: Record<EventSeverity, number>;
  lastHour: number;
  last24Hours: number;
}