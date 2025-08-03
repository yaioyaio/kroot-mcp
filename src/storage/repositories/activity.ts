/**
 * Activity repository implementation
 */

import { BaseRepository } from './base.js';
import { ActivityRecord, QueryOptions } from '../types.js';
import { DatabaseManager } from '../database.js';

/**
 * Activity repository class
 */
export class ActivityRepository extends BaseRepository<ActivityRecord> {
  constructor(dbManager: DatabaseManager) {
    super(dbManager, 'activities');
  }

  /**
   * Find activities by stage
   */
  async findByStage(stage: string, options?: QueryOptions): Promise<ActivityRecord[]> {
    return this.findByCriteria({ stage }, options);
  }

  /**
   * Find activities by actor
   */
  async findByActor(actor: string, options?: QueryOptions): Promise<ActivityRecord[]> {
    return this.findByCriteria({ actor }, options);
  }

  /**
   * Find activities by time range
   */
  async findByTimeRange(
    startTime: number,
    endTime: number,
    options?: QueryOptions,
  ): Promise<ActivityRecord[]> {
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

    return this.executeQuery<ActivityRecord>(sql, params);
  }

  /**
   * Find activities by stage and action
   */
  async findByStageAndAction(
    stage: string,
    action: string,
    options?: QueryOptions,
  ): Promise<ActivityRecord[]> {
    return this.findByCriteria({ stage, action }, options);
  }

  /**
   * Get activity statistics by stage
   */
  async getStatisticsByStage(): Promise<
    Record<string, { count: number; actions: Record<string, number> }>
  > {
    // Get count by stage
    const stageSql = `SELECT stage, COUNT(*) as count FROM ${this.tableName} GROUP BY stage`;
    const stageResults = await this.executeQuery<{ stage: string; count: number }>(stageSql);

    // Get count by stage and action
    const actionSql = `SELECT stage, action, COUNT(*) as count FROM ${this.tableName} GROUP BY stage, action`;
    const actionResults = await this.executeQuery<{ stage: string; action: string; count: number }>(
      actionSql,
    );

    // Build statistics object
    const stats: Record<string, { count: number; actions: Record<string, number> }> = {};

    // Initialize stages
    for (const row of stageResults) {
      stats[row.stage] = {
        count: row.count,
        actions: {},
      };
    }

    // Add action counts
    for (const row of actionResults) {
      const stageStat = stats[row.stage];
      if (stageStat) {
        stageStat.actions[row.action] = row.count;
      }
    }

    return stats;
  }

  /**
   * Get recent activities
   */
  async getRecent(limit: number = 10): Promise<ActivityRecord[]> {
    const sql = `SELECT * FROM ${this.tableName} ORDER BY timestamp DESC LIMIT ?`;
    return this.executeQuery<ActivityRecord>(sql, [limit]);
  }

  /**
   * Clean old activities
   */
  async cleanOldActivities(olderThanTimestamp: number): Promise<number> {
    const sql = `DELETE FROM ${this.tableName} WHERE timestamp < ?`;
    const result = await this.executeCommand(sql, [olderThanTimestamp]);

    return result.changes;
  }
}
