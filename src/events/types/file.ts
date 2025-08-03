/**
 * 파일 시스템 이벤트 타입 정의
 */

import { BaseEvent, EventCategory, EventSeverity, EventMetadata } from './base.js';

/**
 * 파일 이벤트 타입
 */
export enum FileEventType {
  // 파일 변경 이벤트
  FILE_CREATED = 'file:created',
  FILE_CHANGED = 'file:changed',
  FILE_DELETED = 'file:deleted',
  FILE_RENAMED = 'file:renamed',

  // 디렉토리 이벤트
  DIR_CREATED = 'dir:created',
  DIR_DELETED = 'dir:deleted',
  DIR_RENAMED = 'dir:renamed',

  // 컨텍스트 이벤트
  CONTEXT_TEST = 'context:test',
  CONTEXT_CONFIG = 'context:config',
  CONTEXT_DOCUMENTATION = 'context:documentation',
  CONTEXT_SOURCE = 'context:source',
  CONTEXT_BUILD = 'context:build',
}

/**
 * 파일 변경 액션
 */
export enum FileChangeAction {
  ADD = 'add',
  CHANGE = 'change',
  UNLINK = 'unlink',
  ADD_DIR = 'addDir',
  UNLINK_DIR = 'unlinkDir',
}

/**
 * 파일 정보
 */
export interface FileInfo {
  /** 파일 경로 (절대 경로) */
  path: string;

  /** 상대 경로 */
  relativePath: string;

  /** 파일명 */
  name: string;

  /** 확장자 */
  extension: string;

  /** 파일 크기 (bytes) */
  size?: number;

  /** 파일 권한 */
  permissions?: string;

  /** 수정 시간 */
  modifiedAt?: Date;

  /** 생성 시간 */
  createdAt?: Date;

  /** 디렉토리 여부 */
  isDirectory: boolean;

  /** 심볼릭 링크 여부 */
  isSymbolicLink?: boolean;
}

/**
 * 파일 변경 정보
 */
export interface FileChangeInfo {
  /** 변경 타입 */
  action: FileChangeAction;

  /** 변경 전 정보 (rename의 경우) */
  oldFile?: FileInfo;

  /** 변경 후 정보 */
  newFile: FileInfo;

  /** 변경 내용 요약 */
  description?: string;

  /** 변경 크기 (추가/삭제된 바이트) */
  changeSize?: number;

  /** 변경된 라인 수 */
  changedLines?: {
    added: number;
    removed: number;
  };
}

/**
 * 파일 컨텍스트 정보
 */
export interface FileContext {
  /** 컨텍스트 타입 */
  type: 'test' | 'config' | 'documentation' | 'source' | 'build' | 'unknown';

  /** 신뢰도 (0-1) */
  confidence: number;

  /** 감지된 패턴 */
  patterns: string[];

  /** 프레임워크/도구 정보 */
  framework?: string;

  /** 언어 정보 */
  language?: string;

  /** 추가 메타데이터 */
  metadata?: Record<string, any>;
}

/**
 * 파일 이벤트 데이터
 */
export interface FileEventData extends FileChangeInfo {
  /** 파일 컨텍스트 */
  context?: FileContext;

  /** 관련 파일들 */
  relatedFiles?: string[];

  /** 영향받는 모듈/패키지 */
  affectedModules?: string[];

  /** Git 상태 */
  gitStatus?: {
    tracked: boolean;
    staged: boolean;
    branch?: string;
  };
}

/**
 * 파일 이벤트
 */
export interface FileEvent extends BaseEvent {
  type: FileEventType;
  category: EventCategory.FILE;
  data: FileEventData;
}

/**
 * 파일 배치 이벤트 데이터
 */
export interface FileBatchEventData {
  /** 배치 작업 설명 */
  description: string;

  /** 변경된 파일들 */
  files: FileChangeInfo[];

  /** 총 변경 사항 */
  summary: {
    totalFiles: number;
    added: number;
    modified: number;
    deleted: number;
    renamed: number;
  };

  /** 배치 컨텍스트 */
  context?: {
    /** 리팩토링 여부 */
    isRefactoring?: boolean;

    /** 대량 이름 변경 여부 */
    isBulkRename?: boolean;

    /** 프로젝트 구조 변경 여부 */
    isStructuralChange?: boolean;
  };
}

/**
 * 파일 배치 이벤트
 */
export interface FileBatchEvent extends BaseEvent {
  type: 'file:batch';
  category: EventCategory.FILE;
  data: FileBatchEventData;
}

/**
 * 파일 이벤트 생성 헬퍼
 */
export class FileEventBuilder {
  static createFileEvent(
    type: FileEventType,
    data: FileEventData,
    options?: {
      severity?: EventSeverity;
      correlationId?: string;
      metadata?: Record<string, any>;
    },
  ): FileEvent {
    return {
      id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type,
      category: EventCategory.FILE,
      timestamp: new Date(),
      severity: options?.severity || EventSeverity.INFO,
      source: 'FileMonitor',
      data,
      ...(options?.correlationId && { correlationId: options.correlationId }),
      ...(options?.metadata && { metadata: options.metadata as EventMetadata }),
    };
  }

  static createBatchEvent(
    data: FileBatchEventData,
    options?: {
      severity?: EventSeverity;
      correlationId?: string;
      metadata?: Record<string, any>;
    },
  ): FileBatchEvent {
    return {
      id: `file-batch-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type: 'file:batch',
      category: EventCategory.FILE,
      timestamp: new Date(),
      severity: options?.severity || EventSeverity.INFO,
      source: 'FileMonitor',
      data,
      ...(options?.correlationId && { correlationId: options.correlationId }),
      ...(options?.metadata && { metadata: options.metadata as EventMetadata }),
    };
  }
}

/**
 * 파일 이벤트 타입 가드
 */
export function isFileEvent(event: BaseEvent): event is FileEvent {
  return event.category === EventCategory.FILE && event.type !== 'file:batch';
}

export function isFileBatchEvent(event: BaseEvent): event is FileBatchEvent {
  return event.category === EventCategory.FILE && event.type === 'file:batch';
}