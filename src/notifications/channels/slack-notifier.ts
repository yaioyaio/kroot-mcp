/**
 * Slack 알림 전송기
 * Slack 웹훅을 통해 알림을 전송합니다.
 */

import axios from 'axios';
import {
  NotificationMessage,
  NotificationAttachment,
  NotificationAction,
  SlackConfig,
  NotificationPriority,
} from '../types.js';
import { EventSeverity } from '../../events/types/base.js';

export class SlackNotifier {
  private axios = axios.create({
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  /**
   * Slack 메시지 전송
   */
  async send(message: NotificationMessage, config: SlackConfig): Promise<any> {
    const slackMessage = this.formatMessage(message, config);
    
    try {
      const response = await this.axios.post(config.webhookUrl, slackMessage);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Slack notification failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 메시지 포맷팅
   */
  private formatMessage(message: NotificationMessage, config: SlackConfig): any {
    const color = this.getColorBySeverity(message.severity);
    const emoji = this.getEmojiByPriority(message.priority);
    
    const slackMessage: any = {
      channel: config.channel,
      username: config.username || 'DevFlow Monitor',
      icon_emoji: config.iconEmoji || ':robot_face:',
      text: `${emoji} ${message.title}`,
      attachments: [],
    };

    // 기본 첨부 파일
    const mainAttachment: any = {
      color,
      text: message.content,
      ts: Math.floor(message.createdAt.getTime() / 1000),
      footer: 'DevFlow Monitor MCP',
      footer_icon: 'https://platform.slack-edge.com/img/default_application_icon.png',
    };

    // 메타데이터 필드
    if (message.data) {
      mainAttachment.fields = this.formatFields(message.data);
    }

    slackMessage.attachments.push(mainAttachment);

    // 추가 첨부 파일
    if (message.attachments) {
      slackMessage.attachments.push(...this.formatAttachments(message.attachments));
    }

    // 액션 버튼
    if (message.actions && message.actions.length > 0) {
      const actionAttachment: any = {
        fallback: 'Actions are not supported',
        callback_id: message.id,
        color,
        attachment_type: 'default',
        actions: this.formatActions(message.actions),
      };
      slackMessage.attachments.push(actionAttachment);
    }

    return slackMessage;
  }

  /**
   * 심각도별 색상
   */
  private getColorBySeverity(severity: EventSeverity): string {
    switch (severity) {
      case EventSeverity.DEBUG:
        return '#808080'; // 회색
      case EventSeverity.INFO:
        return '#36a64f'; // 초록색
      case EventSeverity.WARNING:
        return '#ff9800'; // 주황색
      case EventSeverity.ERROR:
        return '#f44336'; // 빨간색
      case EventSeverity.CRITICAL:
        return '#9c27b0'; // 보라색
      default:
        return '#2196f3'; // 파란색
    }
  }

  /**
   * 우선순위별 이모지
   */
  private getEmojiByPriority(priority: NotificationPriority): string {
    switch (priority) {
      case NotificationPriority.LOW:
        return '🔵';
      case NotificationPriority.MEDIUM:
        return '🟡';
      case NotificationPriority.HIGH:
        return '🟠';
      case NotificationPriority.URGENT:
        return '🔴';
      default:
        return '⚪';
    }
  }

  /**
   * 데이터 필드 포맷팅
   */
  private formatFields(data: Record<string, any>): any[] {
    const fields: any[] = [];
    
    // 주요 필드만 표시 (최대 10개)
    const entries = Object.entries(data).slice(0, 10);
    
    for (const [key, value] of entries) {
      if (value === null || value === undefined) continue;
      
      let displayValue: string;
      if (typeof value === 'object') {
        displayValue = JSON.stringify(value, null, 2);
        if (displayValue.length > 100) {
          displayValue = displayValue.substring(0, 97) + '...';
        }
      } else {
        displayValue = String(value);
      }

      fields.push({
        title: this.formatFieldTitle(key),
        value: displayValue,
        short: displayValue.length < 40,
      });
    }

    return fields;
  }

  /**
   * 필드 제목 포맷팅
   */
  private formatFieldTitle(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * 첨부 파일 포맷팅
   */
  private formatAttachments(attachments: NotificationAttachment[]): any[] {
    return attachments.map(attachment => ({
      ...attachment,
      fallback: attachment.text || attachment.title || 'Attachment',
    }));
  }

  /**
   * 액션 포맷팅
   */
  private formatActions(actions: NotificationAction[]): any[] {
    return actions.map((action, index) => {
      const slackAction: any = {
        name: `action_${index}`,
        text: action.text,
        type: action.type === 'link' ? 'button' : 'button',
      };

      if (action.url) {
        slackAction.url = action.url;
      }

      if (action.action) {
        slackAction.value = action.action;
      }

      if (action.style) {
        slackAction.style = action.style;
      }

      return slackAction;
    });
  }

  /**
   * 연결 테스트
   */
  async testConnection(config: SlackConfig): Promise<boolean> {
    try {
      const testMessage: NotificationMessage = {
        id: 'test',
        title: 'DevFlow Monitor Connection Test',
        content: 'This is a test message to verify Slack integration.',
        severity: EventSeverity.INFO,
        priority: NotificationPriority.LOW,
        channels: [],
        createdAt: new Date(),
      };

      await this.send(testMessage, config);
      return true;
    } catch (error) {
      console.error('Slack connection test failed:', error);
      return false;
    }
  }
}

// 싱글톤 인스턴스
export const slackNotifier = new SlackNotifier();