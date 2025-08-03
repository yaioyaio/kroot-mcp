/**
 * Base repository implementation
 */

import Database from 'better-sqlite3';
import { Repository, QueryOptions } from '../types.js';
import { DatabaseManager } from '../database.js';

/**
 * Base repository class
 */
export abstract class BaseRepository<T> implements Repository<T> {
  protected db: Database.Database;
  protected tableName: string;
  
  constructor(dbManager: DatabaseManager, tableName: string) {
    this.db = dbManager.getDatabase();
    this.tableName = tableName;
  }
  
  /**
   * Create a new record
   */
  async create(data: T): Promise<T> {
    const keys = Object.keys(data as any).filter(k => k !== 'id');
    const values = keys.map(k => (data as any)[k]);
    const placeholders = keys.map(() => '?').join(', ');
    
    const sql = `INSERT INTO ${this.tableName} (${keys.join(', ')}) VALUES (${placeholders})`;
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...values);
    
    return this.findById(result.lastInsertRowid as number) as Promise<T>;
  }
  
  /**
   * Find record by ID
   */
  async findById(id: number): Promise<T | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    const result = stmt.get(id) as T | undefined;
    
    return result || null;
  }
  
  /**
   * Find all records with optional query options
   */
  async findAll(options?: QueryOptions): Promise<T[]> {
    let sql = `SELECT * FROM ${this.tableName}`;
    const params: any[] = [];
    
    // Add ORDER BY clause
    if (options?.orderBy) {
      const direction = options.orderDirection || 'ASC';
      sql += ` ORDER BY ${options.orderBy} ${direction}`;
    }
    
    // Add LIMIT and OFFSET
    if (options?.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
      
      if (options.offset) {
        sql += ` OFFSET ?`;
        params.push(options.offset);
      }
    }
    
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }
  
  /**
   * Update a record
   */
  async update(id: number, data: Partial<T>): Promise<T | null> {
    const keys = Object.keys(data).filter(k => k !== 'id');
    if (keys.length === 0) {
      return this.findById(id);
    }
    
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => (data as any)[k]);
    values.push(id);
    
    const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...values);
    
    if (result.changes > 0) {
      return this.findById(id);
    }
    
    return null;
  }
  
  /**
   * Delete a record
   */
  async delete(id: number): Promise<boolean> {
    const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    const result = stmt.run(id);
    
    return result.changes > 0;
  }
  
  /**
   * Count total records
   */
  async count(): Promise<number> {
    const sql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    const stmt = this.db.prepare(sql);
    const result = stmt.get() as { count: number };
    
    return result.count;
  }
  
  /**
   * Find records by criteria
   */
  protected async findByCriteria(criteria: Partial<T>, options?: QueryOptions): Promise<T[]> {
    const keys = Object.keys(criteria);
    const whereClause = keys.map(k => `${k} = ?`).join(' AND ');
    const values = keys.map(k => (criteria as any)[k]);
    
    let sql = `SELECT * FROM ${this.tableName}`;
    if (keys.length > 0) {
      sql += ` WHERE ${whereClause}`;
    }
    
    // Add ORDER BY clause
    if (options?.orderBy) {
      const direction = options.orderDirection || 'ASC';
      sql += ` ORDER BY ${options.orderBy} ${direction}`;
    }
    
    // Add LIMIT and OFFSET
    if (options?.limit) {
      sql += ` LIMIT ?`;
      values.push(options.limit);
      
      if (options.offset) {
        sql += ` OFFSET ?`;
        values.push(options.offset);
      }
    }
    
    const stmt = this.db.prepare(sql);
    return stmt.all(...values) as T[];
  }
  
  /**
   * Execute raw SQL query
   */
  protected async executeQuery<R>(sql: string, params: any[] = []): Promise<R[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as R[];
  }
  
  /**
   * Execute raw SQL command (INSERT, UPDATE, DELETE)
   */
  protected async executeCommand(sql: string, params: any[] = []): Promise<Database.RunResult> {
    const stmt = this.db.prepare(sql);
    return stmt.run(...params);
  }
}