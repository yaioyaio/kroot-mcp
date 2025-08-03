/**
 * Event repository implementation
 */

import { BaseRepository } from './base.js';
import { EventRecord, QueryOptions } from '../types.js';
import { DatabaseManager } from '../database.js';
import { BaseEvent } from '../../events/types/index.js';

/**
 * Event repository class
 */
export class EventRepository extends BaseRepository<EventRecord> {
  constructor(dbManager: DatabaseManager) {
    super(dbManager, 'events');
  }

  /**
   * Create event from BaseEvent
   */
  async createFromEvent(event: BaseEvent): Promise<EventRecord> {
    // Ensure timestamp is a Date object
    const timestamp =
      event.timestamp instanceof Date ? event.timestamp : new Date(event.timestamp || Date.now());

    const record: EventRecord = {
      type: event.type,
      timestamp,
      data: JSON.stringify(event),
      device_id: (event.metadata?.deviceId as string) ?? null,
      user_id: (event.metadata?.userId as string) ?? null,
    };

    return this.create(record);
  }

  /**
   * Find events by type
   */
  async findByType(type: string, options?: QueryOptions): Promise<EventRecord[]> {
    return this.findByCriteria({ type }, options);
  }

  /**
   * Find events by time range
   */
  async findByTimeRange(
    startTime: number,
    endTime: number,
    options?: QueryOptions,
  ): Promise<EventRecord[]> {
    let sql = `SELECT * FROM ${this.tableName} WHERE timestamp >= ? AND timestamp <= ?`;
    const params: any[] = [startTime, endTime];

    if (options?.orderBy) {
      const direction = options.orderDirection || 'ASC';
      sql += ` ORDER BY ${options.orderBy} ${direction}`;
    } else {
      sql += ` ORDER BY timestamp DESC`;
    }

    if (options?.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);

      if (options.offset) {
        sql += ` OFFSET ?`;
        params.push(options.offset);
      }
    }

    return this.executeQuery<EventRecord>(sql, params);
  }

  /**
   * Find unsynced events
   */
  async findUnsynced(limit?: number): Promise<EventRecord[]> {
    let sql = `SELECT * FROM ${this.tableName} WHERE sync_status = 'pending' ORDER BY timestamp ASC`;
    const params: any[] = [];

    if (limit) {
      sql += ` LIMIT ?`;
      params.push(limit);
    }

    return this.executeQuery<EventRecord>(sql, params);
  }

  /**
   * Mark events as synced
   */
  async markAsSynced(ids: number[], syncId: string): Promise<number> {
    const placeholders = ids.map(() => '?').join(', ');
    const sql = `UPDATE ${this.tableName} SET sync_status = 'synced', sync_id = ? WHERE id IN (${placeholders})`;
    const result = await this.executeCommand(sql, [syncId, ...ids]);

    return result.changes;
  }

  /**
   * Get event statistics
   */
  async getStatistics(): Promise<{
    total: number;
    byType: Record<string, number>;
    bySyncStatus: Record<string, number>;
    oldestEvent?: Date;
    newestEvent?: Date;
  }> {
    const total = await this.count();

    // Count by type
    const byTypeSql = `SELECT type, COUNT(*) as count FROM ${this.tableName} GROUP BY type`;
    const byTypeResults = await this.executeQuery<{ type: string; count: number }>(byTypeSql);
    const byType: Record<string, number> = {};
    for (const row of byTypeResults) {
      byType[row.type] = row.count;
    }

    // Count by sync status
    const bySyncStatusSql = `SELECT sync_status, COUNT(*) as count FROM ${this.tableName} GROUP BY sync_status`;
    const bySyncStatusResults = await this.executeQuery<{ sync_status: string; count: number }>(
      bySyncStatusSql,
    );
    const bySyncStatus: Record<string, number> = {};
    for (const row of bySyncStatusResults) {
      bySyncStatus[row.sync_status] = row.count;
    }

    // Get oldest and newest events
    const timeSql = `SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest FROM ${this.tableName}`;
    const timeResult = await this.executeQuery<{ oldest: number | null; newest: number | null }>(
      timeSql,
    );

    const firstResult = timeResult[0];
    return {
      total,
      byType,
      bySyncStatus,
      ...(firstResult?.oldest && { oldestEvent: new Date(firstResult.oldest) }),
      ...(firstResult?.newest && { newestEvent: new Date(firstResult.newest) }),
    };
  }

  /**
   * Clean old events
   */
  async cleanOldEvents(olderThanTimestamp: number): Promise<number> {
    const sql = `DELETE FROM ${this.tableName} WHERE timestamp < ? AND sync_status = 'synced'`;
    const result = await this.executeCommand(sql, [olderThanTimestamp]);

    return result.changes;
  }
}
