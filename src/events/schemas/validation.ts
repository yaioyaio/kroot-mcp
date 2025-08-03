/**
 * Event validation schemas and helper functions
 */

import { z } from 'zod';
import { EventCategory, EventSeverity } from '../types/index.js';

// Base event schema
export const BaseEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  category: z.nativeEnum(EventCategory),
  timestamp: z.date(),
  severity: z.nativeEnum(EventSeverity),
  source: z.string(),
  data: z.record(z.string(), z.any()),
  metadata: z.record(z.string(), z.any()).optional(),
  tags: z.array(z.string()).optional(),
});

// File event data schema
export const FileEventDataSchema = z.object({
  action: z.string(),
  path: z.string().optional(),
  relativePath: z.string().optional(),
  extension: z.string().optional(),
  oldFile: z
    .object({
      path: z.string(),
      relativePath: z.string(),
      name: z.string(),
      extension: z.string(),
      size: z.number(),
      modifiedAt: z.date(),
      isDirectory: z.boolean(),
    })
    .optional(),
  newFile: z
    .object({
      path: z.string(),
      relativePath: z.string(),
      name: z.string(),
      extension: z.string(),
      size: z.number(),
      modifiedAt: z.date(),
      isDirectory: z.boolean(),
    })
    .optional(),
  stats: z
    .object({
      size: z.number(),
      modified: z.date(),
    })
    .optional(),
  description: z.string().optional(),
  context: z.string().optional(),
});

// Git event data schema
export const GitEventDataSchema = z.object({
  action: z.string(),
  repository: z.string(),
  branch: z.string(),
  fromBranch: z.string().optional(),
  toBranch: z.string().optional(),
  commit: z
    .object({
      hash: z.string(),
      message: z.string(),
      author: z.string(),
      timestamp: z.date(),
    })
    .optional(),
  files: z.array(z.string()).optional(),
});

// Activity event data schema
export const ActivityEventDataSchema = z.object({
  stage: z.string(),
  action: z.string(),
  details: z.string(),
  actor: z.string(),
  timestamp: z.date(),
  metadata: z.record(z.string(), z.any()).optional(),
});

// Stage event data schema
export const StageEventDataSchema = z.object({
  fromStage: z.string().optional(),
  toStage: z.string(),
  confidence: z.number().min(0).max(1),
  timestamp: z.date(),
  metadata: z.record(z.string(), z.any()).optional(),
});

// System event data schema
export const SystemEventDataSchema = z.object({
  component: z.string(),
  message: z.string(),
  error: z.string().optional(),
  metrics: z.record(z.string(), z.any()).optional(),
  timestamp: z.date(),
});

/**
 * Validate an event against the base schema
 */
export function validateEvent(event: unknown) {
  return BaseEventSchema.safeParse(event);
}

/**
 * Create a validated file event
 */
export function createFileEvent(type: 'created' | 'changed' | 'deleted', data: any) {
  const event = {
    id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    type: `file:${type}`,
    category: EventCategory.FILE,
    timestamp: Date.now(),
    severity: EventSeverity.INFO,
    source: 'FileMonitor',
    data,
  };

  return BaseEventSchema.safeParse(event);
}

/**
 * Create a validated git event
 */
export function createGitEvent(
  type: 'committed' | 'branched' | 'merged' | 'pushed' | 'pulled',
  data: any,
) {
  const event = {
    id: `git-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    type: `git:${type}`,
    category: EventCategory.GIT,
    timestamp: Date.now(),
    severity: EventSeverity.INFO,
    source: 'GitMonitor',
    data,
  };

  return BaseEventSchema.safeParse(event);
}

/**
 * Create a validated activity event
 */
export function createActivityEvent(data: any) {
  const event = {
    id: `activity-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    type: 'activity:tracked',
    category: EventCategory.ACTIVITY,
    timestamp: Date.now(),
    severity: EventSeverity.INFO,
    source: 'ActivityTracker',
    data: {
      stage: data.stage,
      action: data.action,
      details: data.details,
      actor: data.actor,
      timestamp: data.timestamp,
    },
    metadata: data.metadata,
  };

  return BaseEventSchema.safeParse(event);
}

/**
 * Create a validated stage transition event
 */
export function createStageEvent(data: any) {
  const event = {
    id: `stage-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    type: 'stage:transitioned',
    category: EventCategory.STAGE,
    timestamp: Date.now(),
    severity: EventSeverity.INFO,
    source: 'StageAnalyzer',
    data,
  };

  return BaseEventSchema.safeParse(event);
}

/**
 * Create a validated system event
 */
export function createSystemEvent(
  type: 'started' | 'stopped' | 'error' | 'warning' | 'metrics',
  data: any,
) {
  const severity =
    type === 'error'
      ? EventSeverity.ERROR
      : type === 'warning'
        ? EventSeverity.WARNING
        : EventSeverity.INFO;

  const eventData: any = {
    component: data.component,
    message: data.message,
    timestamp: data.timestamp,
  };

  if (data.error instanceof Error) {
    eventData.error = data.error.message;
  } else if (data.error) {
    eventData.error = data.error;
  }

  if (data.metrics) {
    eventData.metrics = data.metrics;
  }

  const event = {
    id: `system-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    type: `system:${type}`,
    category: EventCategory.SYSTEM,
    timestamp: Date.now(),
    severity,
    source: 'System',
    data: eventData,
  };

  return BaseEventSchema.safeParse(event);
}
