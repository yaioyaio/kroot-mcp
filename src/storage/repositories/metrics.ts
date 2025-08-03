/**
 * Metrics repository implementation
 */

import { BaseRepository } from './base.js';
import { MetricsRecord, QueryOptions } from '../types.js';
import { DatabaseManager } from '../database.js';

/**
 * Metrics repository class
 */
export class MetricsRepository extends BaseRepository<MetricsRecord> {
  constructor(dbManager: DatabaseManager) {
    super(dbManager, 'metrics');
  }

  /**
   * Find metrics by type
   */
  async findByType(metricType: string, options?: QueryOptions): Promise<MetricsRecord[]> {
    return this.findByCriteria({ metric_type: metricType }, options);
  }

  /**
   * Find metrics by type and name
   */
  async findByTypeAndName(
    metricType: string,
    metricName: string,
    options?: QueryOptions,
  ): Promise<MetricsRecord[]> {
    return this.findByCriteria({ metric_type: metricType, metric_name: metricName }, options);
  }

  /**
   * Find metrics by time range
   */
  async findByTimeRange(
    startTime: number,
    endTime: number,
    options?: QueryOptions,
  ): Promise<MetricsRecord[]> {
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

    return this.executeQuery<MetricsRecord>(sql, params);
  }

  /**
   * Find metrics by timeframe
   */
  async findByTimeframe(timeframe: string, options?: QueryOptions): Promise<MetricsRecord[]> {
    return this.findByCriteria({ timeframe }, options);
  }

  /**
   * Get latest metric value
   */
  async getLatestValue(metricType: string, metricName: string): Promise<number | null> {
    const sql = `SELECT value FROM ${this.tableName} 
                 WHERE metric_type = ? AND metric_name = ? 
                 ORDER BY timestamp DESC LIMIT 1`;

    const result = await this.executeQuery<{ value: number }>(sql, [metricType, metricName]);
    return result[0]?.value ?? null;
  }

  /**
   * Get aggregated metrics
   */
  async getAggregated(
    metricType: string,
    metricName: string,
    startTime: number,
    endTime: number,
    aggregation: 'avg' | 'sum' | 'min' | 'max' | 'count' = 'avg',
  ): Promise<number | null> {
    const sql = `SELECT ${aggregation}(value) as result FROM ${this.tableName} 
                 WHERE metric_type = ? AND metric_name = ? 
                 AND timestamp >= ? AND timestamp <= ?`;

    const result = await this.executeQuery<{ result: number | null }>(sql, [
      metricType,
      metricName,
      startTime,
      endTime,
    ]);

    return result[0]?.result ?? null;
  }

  /**
   * Get metric trends
   */
  async getTrends(
    metricType: string,
    metricName: string,
    timeframe: string,
    limit: number = 100,
  ): Promise<Array<{ timestamp: number; value: number }>> {
    const sql = `SELECT timestamp, value FROM ${this.tableName} 
                 WHERE metric_type = ? AND metric_name = ? AND timeframe = ?
                 ORDER BY timestamp DESC LIMIT ?`;

    const results = await this.executeQuery<{ timestamp: number; value: number }>(sql, [
      metricType,
      metricName,
      timeframe,
      limit,
    ]);

    return results.reverse(); // Return in chronological order
  }

  /**
   * Get all metric types
   */
  async getMetricTypes(): Promise<string[]> {
    const sql = `SELECT DISTINCT metric_type FROM ${this.tableName} ORDER BY metric_type`;
    const results = await this.executeQuery<{ metric_type: string }>(sql);

    return results.map((row) => row.metric_type);
  }

  /**
   * Get metric names by type
   */
  async getMetricNamesByType(metricType: string): Promise<string[]> {
    const sql = `SELECT DISTINCT metric_name FROM ${this.tableName} 
                 WHERE metric_type = ? ORDER BY metric_name`;
    const results = await this.executeQuery<{ metric_name: string }>(sql, [metricType]);

    return results.map((row) => row.metric_name);
  }

  /**
   * Clean old metrics
   */
  async cleanOldMetrics(olderThanTimestamp: number): Promise<number> {
    const sql = `DELETE FROM ${this.tableName} WHERE timestamp < ?`;
    const result = await this.executeCommand(sql, [olderThanTimestamp]);

    return result.changes;
  }

  /**
   * Upsert metric (update if exists for same timestamp and timeframe)
   */
  async upsert(data: MetricsRecord): Promise<MetricsRecord> {
    const existing = await this.findByCriteria({
      metric_type: data.metric_type,
      metric_name: data.metric_name,
      timestamp: data.timestamp,
      timeframe: data.timeframe,
    });

    const firstExisting = existing[0];
    if (firstExisting?.id) {
      return (await this.update(firstExisting.id, { value: data.value })) as MetricsRecord;
    } else {
      return await this.create(data);
    }
  }
}
