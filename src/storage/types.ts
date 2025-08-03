/**
 * Storage types and interfaces
 */

/**
 * Event storage record
 */
export interface EventRecord {
  id?: number;
  type: string;
  timestamp: number;
  data: string;
  sync_id?: string | null;
  sync_status?: string;
  device_id?: string | null;
  user_id?: string | null;
  created_at?: number;
  updated_at?: number;
}

/**
 * Activity log storage record
 */
export interface ActivityRecord {
  id?: number;
  stage: string;
  action: string;
  details: string;
  actor: string;
  metadata?: string | null;
  timestamp: number;
  event_id?: number | null;
  created_at?: number;
}

/**
 * Metrics storage record
 */
export interface MetricsRecord {
  id?: number;
  metric_type: string;
  metric_name: string;
  value: number;
  timestamp: number;
  timeframe: string;
  metadata?: string | null;
  created_at?: number;
}

/**
 * Stage transitions storage record
 */
export interface StageTransitionRecord {
  id?: number;
  from_stage: string | null;
  to_stage: string;
  timestamp: number;
  confidence: number;
  metadata?: string | null;
  created_at?: number;
}

/**
 * File monitor cache record
 */
export interface FileMonitorCacheRecord {
  id?: number;
  file_path: string;
  file_hash: string;
  last_modified: number;
  file_size: number;
  metadata?: string | null;
  created_at?: number;
  updated_at?: number;
}

/**
 * Database configuration
 */
export interface DatabaseConfig {
  path: string;
  verbose?: boolean;
  readonly?: boolean;
  fileMustExist?: boolean;
  timeout?: number;
  memory?: boolean;
}

/**
 * Query options
 */
export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}

/**
 * Migration record
 */
export interface MigrationRecord {
  id?: number;
  version: number;
  name: string;
  applied_at: number;
}

/**
 * Repository interface
 */
export interface Repository<T> {
  create(data: T): Promise<T>;
  findById(id: number): Promise<T | null>;
  findAll(options?: QueryOptions): Promise<T[]>;
  update(id: number, data: Partial<T>): Promise<T | null>;
  delete(id: number): Promise<boolean>;
  count(): Promise<number>;
}