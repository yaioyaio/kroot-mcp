/**
 * Git 활동 이벤트 타입 정의
 */

import { BaseEvent, EventCategory, EventSeverity, EventMetadata } from './base.js';

/**
 * Git 이벤트 타입
 */
export enum GitEventType {
  // 커밋 관련
  COMMIT_CREATED = 'git:commit:created',
  COMMIT_AMENDED = 'git:commit:amended',

  // 브랜치 관련
  BRANCH_CREATED = 'git:branch:created',
  BRANCH_DELETED = 'git:branch:deleted',
  BRANCH_SWITCHED = 'git:branch:switched',
  BRANCH_MERGED = 'git:branch:merged',
  BRANCH_REBASED = 'git:branch:rebased',

  // 태그 관련
  TAG_CREATED = 'git:tag:created',
  TAG_DELETED = 'git:tag:deleted',

  // 원격 저장소 관련
  PUSH = 'git:push',
  PULL = 'git:pull',
  FETCH = 'git:fetch',
  CLONE = 'git:clone',

  // 병합 관련
  MERGE_STARTED = 'git:merge:started',
  MERGE_COMPLETED = 'git:merge:completed',
  MERGE_CONFLICT = 'git:merge:conflict',
  MERGE_ABORTED = 'git:merge:aborted',

  // Stash 관련
  STASH_CREATED = 'git:stash:created',
  STASH_APPLIED = 'git:stash:applied',
  STASH_DROPPED = 'git:stash:dropped',

  // 리베이스 관련
  REBASE_STARTED = 'git:rebase:started',
  REBASE_COMPLETED = 'git:rebase:completed',
  REBASE_CONFLICT = 'git:rebase:conflict',
  REBASE_ABORTED = 'git:rebase:aborted',
}

/**
 * Git 커밋 정보
 */
export interface GitCommitInfo {
  /** 커밋 해시 */
  hash: string;

  /** 짧은 해시 */
  shortHash: string;

  /** 커밋 메시지 */
  message: string;

  /** 작성자 */
  author: {
    name: string;
    email: string;
    date: Date;
  };

  /** 커밋터 */
  committer?: {
    name: string;
    email: string;
    date: Date;
  };

  /** 부모 커밋 해시들 */
  parents: string[];

  /** 변경된 파일 수 */
  filesChanged?: number;

  /** 추가된 줄 수 */
  insertions?: number;

  /** 삭제된 줄 수 */
  deletions?: number;

  /** 커밋 타입 (Conventional Commits) */
  type?: string;

  /** 커밋 스코프 */
  scope?: string;

  /** Breaking change 여부 */
  breaking?: boolean;
}

/**
 * Git 브랜치 정보
 */
export interface GitBranchInfo {
  /** 브랜치 이름 */
  name: string;

  /** 원격 브랜치 여부 */
  isRemote: boolean;

  /** 현재 브랜치 여부 */
  isCurrent: boolean;

  /** 업스트림 브랜치 */
  upstream?: string;

  /** 마지막 커밋 해시 */
  lastCommitHash?: string;

  /** 마지막 커밋 메시지 */
  lastCommitMessage?: string;

  /** 마지막 커밋 날짜 */
  lastCommitDate?: Date;

  /** ahead/behind 정보 */
  tracking?: {
    ahead: number;
    behind: number;
  };
}

/**
 * Git 태그 정보
 */
export interface GitTagInfo {
  /** 태그 이름 */
  name: string;

  /** 태그 타입 (lightweight/annotated) */
  type: 'lightweight' | 'annotated';

  /** 태그가 가리키는 커밋 해시 */
  commitHash: string;

  /** 태그 메시지 (annotated 태그의 경우) */
  message?: string;

  /** 태거 정보 */
  tagger?: {
    name: string;
    email: string;
    date: Date;
  };
}

/**
 * Git 원격 저장소 정보
 */
export interface GitRemoteInfo {
  /** 원격 저장소 이름 */
  name: string;

  /** URL */
  url: string;

  /** 타입 (fetch/push) */
  type: 'fetch' | 'push';
}

/**
 * Git 충돌 정보
 */
export interface GitConflictInfo {
  /** 충돌 파일들 */
  files: string[];

  /** 충돌 타입 */
  type: 'merge' | 'rebase' | 'cherry-pick';

  /** 소스 브랜치 */
  sourceBranch?: string;

  /** 타겟 브랜치 */
  targetBranch?: string;

  /** 충돌 상세 정보 */
  details?: Array<{
    file: string;
    conflictType:
      | 'both-modified'
      | 'deleted-by-them'
      | 'deleted-by-us'
      | 'added-by-them'
      | 'added-by-us';
  }>;
}

/**
 * Git 커밋 이벤트 데이터
 */
export interface GitCommitEventData {
  /** 커밋 정보 */
  commit: GitCommitInfo;

  /** 브랜치 정보 */
  branch: GitBranchInfo;

  /** 변경된 파일들 */
  files?: Array<{
    path: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    additions: number;
    deletions: number;
  }>;

  /** 커밋 패턴 분석 */
  analysis?: {
    /** 커밋 타입 분포 */
    isFeature?: boolean;
    isBugfix?: boolean;
    isRefactor?: boolean;
    isChore?: boolean;
    isDocs?: boolean;
    isTest?: boolean;
  };
}

/**
 * Git 브랜치 이벤트 데이터
 */
export interface GitBranchEventData {
  /** 브랜치 정보 */
  branch: GitBranchInfo;

  /** 이전 브랜치 (switch의 경우) */
  previousBranch?: string;

  /** 소스 브랜치 (생성/머지의 경우) */
  sourceBranch?: string;

  /** 병합 정보 (머지의 경우) */
  mergeInfo?: {
    commits: number;
    files: number;
    strategy: 'fast-forward' | 'recursive' | 'octopus' | 'ours' | 'subtree';
  };
}

/**
 * Git 푸시/풀 이벤트 데이터
 */
export interface GitSyncEventData {
  /** 원격 저장소 */
  remote: GitRemoteInfo;

  /** 브랜치 */
  branch: string;

  /** 동기화된 커밋 수 */
  commits?: number;

  /** 전송된 바이트 */
  bytes?: number;

  /** 동기화 방향 */
  direction: 'push' | 'pull' | 'fetch';

  /** 성공 여부 */
  success: boolean;

  /** 에러 메시지 */
  error?: string;
}

/**
 * Git 이벤트
 */
export interface GitEvent extends BaseEvent {
  type: GitEventType;
  category: EventCategory.GIT;
  data: GitCommitEventData | GitBranchEventData | GitSyncEventData | GitConflictInfo;
}

/**
 * Git 이벤트 생성 헬퍼
 */
export class GitEventBuilder {
  static createCommitEvent(
    type: GitEventType,
    data: GitCommitEventData,
    options?: {
      severity?: EventSeverity;
      correlationId?: string;
      metadata?: Record<string, any>;
    },
  ): GitEvent {
    return {
      id: `git-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type,
      category: EventCategory.GIT,
      timestamp: Date.now(),
      severity: options?.severity || EventSeverity.INFO,
      source: 'GitMonitor',
      data,
      ...(options?.correlationId && { correlationId: options.correlationId }),
      ...(options?.metadata && { metadata: options.metadata as EventMetadata }),
    };
  }

  static createBranchEvent(
    type: GitEventType,
    data: GitBranchEventData,
    options?: {
      severity?: EventSeverity;
      correlationId?: string;
      metadata?: Record<string, any>;
    },
  ): GitEvent {
    return {
      id: `git-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type,
      category: EventCategory.GIT,
      timestamp: Date.now(),
      severity: options?.severity || EventSeverity.INFO,
      source: 'GitMonitor',
      data,
      ...(options?.correlationId && { correlationId: options.correlationId }),
      ...(options?.metadata && { metadata: options.metadata as EventMetadata }),
    };
  }

  static createSyncEvent(
    type: GitEventType,
    data: GitSyncEventData,
    options?: {
      severity?: EventSeverity;
      correlationId?: string;
      metadata?: Record<string, any>;
    },
  ): GitEvent {
    return {
      id: `git-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type,
      category: EventCategory.GIT,
      timestamp: Date.now(),
      severity: data.success ? EventSeverity.INFO : EventSeverity.ERROR,
      source: 'GitMonitor',
      data,
      ...(options?.correlationId && { correlationId: options.correlationId }),
      ...(options?.metadata && { metadata: options.metadata as EventMetadata }),
    };
  }

  static createConflictEvent(
    type: GitEventType,
    data: GitConflictInfo,
    options?: {
      correlationId?: string;
      metadata?: Record<string, any>;
    },
  ): GitEvent {
    return {
      id: `git-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type,
      category: EventCategory.GIT,
      timestamp: Date.now(),
      severity: EventSeverity.WARNING,
      source: 'GitMonitor',
      data,
      ...(options?.correlationId && { correlationId: options.correlationId }),
      ...(options?.metadata && { metadata: options.metadata as EventMetadata }),
    };
  }
}

/**
 * Git 이벤트 타입 가드
 */
export function isGitEvent(event: BaseEvent): event is GitEvent {
  return event.category === EventCategory.GIT;
}

export function isGitCommitEvent(event: BaseEvent): event is GitEvent {
  return (
    event.category === EventCategory.GIT &&
    (event.type === GitEventType.COMMIT_CREATED || event.type === GitEventType.COMMIT_AMENDED)
  );
}

export function isGitBranchEvent(event: BaseEvent): event is GitEvent {
  return event.category === EventCategory.GIT && event.type.startsWith('git:branch:');
}

export function isGitSyncEvent(event: BaseEvent): event is GitEvent {
  return (
    event.category === EventCategory.GIT &&
    (event.type === GitEventType.PUSH ||
      event.type === GitEventType.PULL ||
      event.type === GitEventType.FETCH ||
      event.type === GitEventType.CLONE)
  );
}
