/**
 * 이벤트 검증 로직
 * 이벤트의 유효성을 검사하고 중복을 필터링합니다.
 */

import { z } from 'zod';
import {
  BaseEvent,
  EventCategory,
  EventSeverity,
  FileEvent,
  FileEventType,
  GitEvent,
  GitEventType,
} from './types/index.js';

/**
 * 기본 이벤트 스키마
 */
const BaseEventSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    category: z.nativeEnum(EventCategory),
    timestamp: z.date(),
    severity: z.nativeEnum(EventSeverity),
    source: z.string().min(1),
    data: z.record(z.string(), z.any()),
    metadata: z.record(z.string(), z.any()).optional(),
    correlationId: z.string().optional(),
    parentId: z.string().optional(),
  })
  .passthrough();

/**
 * 파일 이벤트 스키마
 */
const FileEventSchema = BaseEventSchema.extend({
  type: z.nativeEnum(FileEventType),
  category: z.literal(EventCategory.FILE),
  data: z
    .object({
      action: z.string(),
      oldFile: z
        .object({
          path: z.string(),
          relativePath: z.string(),
          name: z.string(),
          extension: z.string(),
          isDirectory: z.boolean(),
        })
        .optional(),
      newFile: z.object({
        path: z.string(),
        relativePath: z.string(),
        name: z.string(),
        extension: z.string(),
        isDirectory: z.boolean(),
      }),
      description: z.string().optional(),
      context: z
        .object({
          type: z.enum(['test', 'config', 'documentation', 'source', 'build', 'unknown']),
          confidence: z.number().min(0).max(1),
          patterns: z.array(z.string()),
          framework: z.string().optional(),
          language: z.string().optional(),
          metadata: z.record(z.string(), z.any()).optional(),
        })
        .optional(),
    })
    .passthrough(),
}).passthrough();

/**
 * Git 이벤트 스키마
 */
const GitEventSchema = BaseEventSchema.extend({
  type: z.nativeEnum(GitEventType),
  category: z.literal(EventCategory.GIT),
  data: z.any(),
}).passthrough();

/**
 * 이벤트 중복 검사기
 */
export class EventDeduplicator {
  private recentEvents: Map<string, { event: BaseEvent; timestamp: number }> = new Map();
  private readonly maxAge: number = 5000; // 5초
  private readonly maxSize: number = 1000; // 최대 1000개 이벤트 저장

  /**
   * 이벤트가 중복인지 확인
   */
  isDuplicate(event: BaseEvent): boolean {
    // 오래된 이벤트 정리
    this.cleanup();

    // 이벤트 해시 생성
    const hash = this.generateEventHash(event);

    // 중복 확인
    const existing = this.recentEvents.get(hash);
    if (existing) {
      const timeDiff = event.timestamp - existing.timestamp;
      return timeDiff < this.maxAge;
    }

    // 새 이벤트 저장
    this.recentEvents.set(hash, {
      event,
      timestamp: event.timestamp,
    });

    // 크기 제한 확인
    if (this.recentEvents.size > this.maxSize) {
      this.trimOldest();
    }

    return false;
  }

  /**
   * 이벤트 해시 생성
   */
  private generateEventHash(event: BaseEvent): string {
    // 파일 이벤트의 경우
    if (event.category === EventCategory.FILE) {
      const fileData = event.data as any;
      return `${event.type}-${fileData.newFile?.path || ''}-${fileData.action || ''}`;
    }

    // Git 이벤트의 경우
    if (event.category === EventCategory.GIT) {
      const gitData = event.data as any;
      if (gitData.commit) {
        return `${event.type}-${gitData.commit.hash}`;
      }
      if (gitData.branch) {
        return `${event.type}-${gitData.branch.name}`;
      }
    }

    // 기본 해시
    return `${event.type}-${event.source}-${JSON.stringify(event.data)}`;
  }

  /**
   * 오래된 이벤트 정리
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, value] of this.recentEvents.entries()) {
      if (now - value.timestamp > this.maxAge) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach((key) => this.recentEvents.delete(key));
  }

  /**
   * 가장 오래된 이벤트 제거
   */
  private trimOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, value] of this.recentEvents.entries()) {
      if (value.timestamp < oldestTime) {
        oldestTime = value.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.recentEvents.delete(oldestKey);
    }
  }

  /**
   * 중복 검사기 초기화
   */
  clear(): void {
    this.recentEvents.clear();
  }
}

/**
 * 이벤트 검증기
 */
export class EventValidator {
  private deduplicator = new EventDeduplicator();

  /**
   * 이벤트 검증
   */
  validate(event: BaseEvent): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    try {
      // 기본 스키마 검증
      BaseEventSchema.parse(event);

      // 카테고리별 상세 검증
      switch (event.category) {
        case EventCategory.FILE:
          this.validateFileEvent(event as any as FileEvent);
          break;
        case EventCategory.GIT:
          this.validateGitEvent(event as any as GitEvent);
          break;
        // 다른 카테고리는 기본 검증만 수행
      }

      // 중복 검사
      if (this.deduplicator.isDuplicate(event)) {
        errors.push('Duplicate event detected');
      }

      return { valid: errors.length === 0, errors };
    } catch (error) {
      if (error instanceof z.ZodError) {
        errors.push(...error.issues.map((e) => `${e.path.join('.')}: ${e.message}`));
      } else {
        errors.push(error instanceof Error ? error.message : 'Unknown validation error');
      }
      return { valid: false, errors };
    }
  }

  /**
   * 파일 이벤트 검증
   */
  private validateFileEvent(event: FileEvent): void {
    FileEventSchema.parse(event);

    // 추가 비즈니스 로직 검증
    const data = event.data;

    // 파일 경로 검증
    if (data.newFile.path.includes('..')) {
      throw new Error('Invalid file path: contains parent directory reference');
    }

    // 확장자 일관성 검증
    const expectedExt = data.newFile.name.split('.').pop() || '';
    if (data.newFile.extension && data.newFile.extension !== expectedExt) {
      throw new Error('File extension mismatch');
    }
  }

  /**
   * Git 이벤트 검증
   */
  private validateGitEvent(event: GitEvent): void {
    GitEventSchema.parse(event);

    // 추가 비즈니스 로직 검증
    const data = event.data as any;

    // 커밋 해시 검증
    if (data.commit && !/^[a-f0-9]{40}$/.test(data.commit.hash)) {
      throw new Error('Invalid commit hash format');
    }

    // 브랜치 이름 검증
    if (data.branch && /[^a-zA-Z0-9\-_\/]/.test(data.branch.name)) {
      throw new Error('Invalid branch name format');
    }
  }

  /**
   * 배치 이벤트 검증
   */
  validateBatch(events: BaseEvent[]): { valid: boolean; errors: Map<string, string[]> } {
    const errors = new Map<string, string[]>();
    let allValid = true;

    for (const event of events) {
      const result = this.validate(event);
      if (!result.valid) {
        allValid = false;
        if (result.errors) {
          errors.set(event.id, result.errors);
        }
      }
    }

    return { valid: allValid, errors };
  }

  /**
   * 중복 검사기 초기화
   */
  clearDeduplicator(): void {
    this.deduplicator.clear();
  }
}

// 싱글톤 인스턴스
export const eventValidator = new EventValidator();
