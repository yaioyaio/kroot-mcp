/**
 * Stage transition repository implementation
 */

import { BaseRepository } from './base.js';
import { StageTransitionRecord, QueryOptions } from '../types.js';
import { DatabaseManager } from '../database.js';

/**
 * Stage transition repository class
 */
export class StageTransitionRepository extends BaseRepository<StageTransitionRecord> {
  constructor(dbManager: DatabaseManager) {
    super(dbManager, 'stage_transitions');
  }
  
  /**
   * Find transitions by stage
   */
  async findByStage(stage: string, direction: 'from' | 'to', options?: QueryOptions): Promise<StageTransitionRecord[]> {
    const field = direction === 'from' ? 'from_stage' : 'to_stage';
    return this.findByCriteria({ [field]: stage }, options);
  }
  
  /**
   * Find transitions by stage pair
   */
  async findByStages(fromStage: string | null, toStage: string, options?: QueryOptions): Promise<StageTransitionRecord[]> {
    const criteria: any = { to_stage: toStage };
    if (fromStage !== null) {
      criteria.from_stage = fromStage;
    }
    
    return this.findByCriteria(criteria, options);
  }
  
  /**
   * Find transitions by time range
   */
  async findByTimeRange(startTime: number, endTime: number, options?: QueryOptions): Promise<StageTransitionRecord[]> {
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
    
    return this.executeQuery<StageTransitionRecord>(sql, params);
  }
  
  /**
   * Find transitions by confidence threshold
   */
  async findByConfidence(minConfidence: number, options?: QueryOptions): Promise<StageTransitionRecord[]> {
    let sql = `SELECT * FROM ${this.tableName} WHERE confidence >= ?`;
    const params: any[] = [minConfidence];
    
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
    
    return this.executeQuery<StageTransitionRecord>(sql, params);
  }
  
  /**
   * Get latest transition
   */
  async getLatest(): Promise<StageTransitionRecord | null> {
    const sql = `SELECT * FROM ${this.tableName} ORDER BY timestamp DESC LIMIT 1`;
    const results = await this.executeQuery<StageTransitionRecord>(sql);
    
    return results[0] ?? null;
  }
  
  /**
   * Get transition statistics
   */
  async getStatistics(): Promise<{
    totalTransitions: number;
    byStage: Record<string, { incoming: number; outgoing: number }>;
    averageConfidence: number;
    transitions: Array<{ from: string | null; to: string; count: number; avgConfidence: number }>;
  }> {
    const total = await this.count();
    
    // Get average confidence
    const avgConfidenceSql = `SELECT AVG(confidence) as avg FROM ${this.tableName}`;
    const avgResult = await this.executeQuery<{ avg: number | null }>(avgConfidenceSql);
    const averageConfidence = avgResult[0]?.avg ?? 0;
    
    // Get transitions count and average confidence
    const transitionsSql = `
      SELECT from_stage, to_stage, COUNT(*) as count, AVG(confidence) as avg_confidence 
      FROM ${this.tableName} 
      GROUP BY from_stage, to_stage 
      ORDER BY count DESC
    `;
    const transitionResults = await this.executeQuery<{
      from_stage: string | null;
      to_stage: string;
      count: number;
      avg_confidence: number;
    }>(transitionsSql);
    
    // Calculate by stage statistics
    const byStage: Record<string, { incoming: number; outgoing: number }> = {};
    
    for (const row of transitionResults) {
      // Outgoing transitions
      if (row.from_stage) {
        const fromStageKey = row.from_stage;
        if (!byStage[fromStageKey]) {
          byStage[fromStageKey] = { incoming: 0, outgoing: 0 };
        }
        byStage[fromStageKey].outgoing += row.count;
      }
      
      // Incoming transitions
      const toStageKey = row.to_stage;
      if (!byStage[toStageKey]) {
        byStage[toStageKey] = { incoming: 0, outgoing: 0 };
      }
      byStage[toStageKey].incoming += row.count;
    }
    
    return {
      totalTransitions: total,
      byStage,
      averageConfidence,
      transitions: transitionResults.map(row => ({
        from: row.from_stage,
        to: row.to_stage,
        count: row.count,
        avgConfidence: row.avg_confidence
      }))
    };
  }
  
  /**
   * Get stage sequence for a time period
   */
  async getStageSequence(startTime: number, endTime: number): Promise<Array<{
    timestamp: number;
    from: string | null;
    to: string;
    confidence: number;
  }>> {
    const sql = `
      SELECT timestamp, from_stage, to_stage, confidence 
      FROM ${this.tableName} 
      WHERE timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `;
    
    const results = await this.executeQuery<{
      timestamp: number;
      from_stage: string | null;
      to_stage: string;
      confidence: number;
    }>(sql, [startTime, endTime]);
    
    return results.map(row => ({
      timestamp: row.timestamp,
      from: row.from_stage,
      to: row.to_stage,
      confidence: row.confidence
    }));
  }
  
  /**
   * Clean old transitions
   */
  async cleanOldTransitions(olderThanTimestamp: number): Promise<number> {
    const sql = `DELETE FROM ${this.tableName} WHERE timestamp < ?`;
    const result = await this.executeCommand(sql, [olderThanTimestamp]);
    
    return result.changes;
  }
}