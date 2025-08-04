/**
 * 대시보드 알림 전송기
 * 대시보드 내부에 알림을 표시합니다.
 */

import { EventEmitter } from 'eventemitter3';
import { NotificationMessage } from '../types.js';

export interface DashboardNotification {
  id: string;
  message: NotificationMessage;
  read: boolean;
  readAt?: Date;
  dismissedAt?: Date;
}

export class DashboardNotifier extends EventEmitter {
  private notifications: DashboardNotification[] = [];
  private maxNotifications = 100;

  /**
   * 대시보드에 알림 전송
   */
  async send(message: NotificationMessage, _config: any): Promise<any> {
    const notification: DashboardNotification = {
      id: message.id,
      message,
      read: false,
    };

    // 알림 추가
    this.notifications.unshift(notification);

    // 최대 개수 유지
    if (this.notifications.length > this.maxNotifications) {
      this.notifications = this.notifications.slice(0, this.maxNotifications);
    }

    // 이벤트 발행
    this.emit('notification', notification);

    return { success: true, notificationId: notification.id };
  }

  /**
   * 알림 읽음 처리
   */
  markAsRead(notificationId: string): boolean {
    const notification = this.notifications.find(n => n.id === notificationId);
    if (notification && !notification.read) {
      notification.read = true;
      notification.readAt = new Date();
      this.emit('notification-read', notification);
      return true;
    }
    return false;
  }

  /**
   * 알림 해제
   */
  dismiss(notificationId: string): boolean {
    const notification = this.notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.dismissedAt = new Date();
      this.emit('notification-dismissed', notification);
      return true;
    }
    return false;
  }

  /**
   * 모든 알림 읽음 처리
   */
  markAllAsRead(): number {
    let count = 0;
    const now = new Date();
    
    for (const notification of this.notifications) {
      if (!notification.read) {
        notification.read = true;
        notification.readAt = now;
        count++;
      }
    }

    if (count > 0) {
      this.emit('all-notifications-read', count);
    }

    return count;
  }

  /**
   * 알림 조회
   */
  getNotifications(options: {
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
  } = {}): DashboardNotification[] {
    let notifications = this.notifications;

    // 읽지 않은 것만 필터링
    if (options.unreadOnly) {
      notifications = notifications.filter(n => !n.read && !n.dismissedAt);
    } else {
      // 해제되지 않은 것만 표시
      notifications = notifications.filter(n => !n.dismissedAt);
    }

    // 페이지네이션
    const offset = options.offset || 0;
    const limit = options.limit || 20;
    
    return notifications.slice(offset, offset + limit);
  }

  /**
   * 읽지 않은 알림 개수
   */
  getUnreadCount(): number {
    return this.notifications.filter(n => !n.read && !n.dismissedAt).length;
  }

  /**
   * 알림 삭제
   */
  clearNotifications(olderThan?: Date): number {
    const before = this.notifications.length;
    
    if (olderThan) {
      this.notifications = this.notifications.filter(
        n => n.message.createdAt > olderThan
      );
    } else {
      this.notifications = [];
    }

    const cleared = before - this.notifications.length;
    if (cleared > 0) {
      this.emit('notifications-cleared', cleared);
    }

    return cleared;
  }

  /**
   * 연결 테스트 (항상 성공)
   */
  async testConnection(_config: any): Promise<boolean> {
    return true;
  }
}

// 싱글톤 인스턴스
export const dashboardNotifier = new DashboardNotifier();