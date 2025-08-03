/**
 * File monitor cache repository implementation
 */

import { BaseRepository } from './base.js';
import { FileMonitorCacheRecord, QueryOptions } from '../types.js';
import { DatabaseManager } from '../database.js';

/**
 * File monitor cache repository class
 */
export class FileMonitorCacheRepository extends BaseRepository<FileMonitorCacheRecord> {
  constructor(dbManager: DatabaseManager) {
    super(dbManager, 'file_monitor_cache');
  }

  /**
   * Find cache entry by file path
   */
  async findByPath(filePath: string): Promise<FileMonitorCacheRecord | null> {
    const results = await this.findByCriteria({ file_path: filePath });
    return results[0] ?? null;
  }

  /**
   * Find modified files since timestamp
   */
  async findModifiedSince(
    timestamp: number,
    options?: QueryOptions,
  ): Promise<FileMonitorCacheRecord[]> {
    let sql = `SELECT * FROM ${this.tableName} WHERE last_modified > ?`;
    const params: any[] = [timestamp];

    if (options?.orderBy) {
      const direction = options.orderDirection || 'ASC';
      sql += ` ORDER BY ${options.orderBy} ${direction}`;
    } else {
      sql += ` ORDER BY last_modified DESC`;
    }

    if (options?.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);

      if (options.offset) {
        sql += ` OFFSET ?`;
        params.push(options.offset);
      }
    }

    return this.executeQuery<FileMonitorCacheRecord>(sql, params);
  }

  /**
   * Find files by path pattern
   */
  async findByPathPattern(
    pattern: string,
    options?: QueryOptions,
  ): Promise<FileMonitorCacheRecord[]> {
    let sql = `SELECT * FROM ${this.tableName} WHERE file_path LIKE ?`;
    const params: any[] = [pattern];

    if (options?.orderBy) {
      const direction = options.orderDirection || 'ASC';
      sql += ` ORDER BY ${options.orderBy} ${direction}`;
    } else {
      sql += ` ORDER BY file_path ASC`;
    }

    if (options?.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);

      if (options.offset) {
        sql += ` OFFSET ?`;
        params.push(options.offset);
      }
    }

    return this.executeQuery<FileMonitorCacheRecord>(sql, params);
  }

  /**
   * Upsert cache entry
   */
  async upsert(data: FileMonitorCacheRecord): Promise<FileMonitorCacheRecord> {
    const existing = await this.findByPath(data.file_path);

    if (existing) {
      const updateData: Partial<FileMonitorCacheRecord> = {
        file_hash: data.file_hash,
        last_modified: data.last_modified,
        file_size: data.file_size,
        ...(data.metadata !== undefined && { metadata: data.metadata }),
      };

      return (await this.update(existing.id!, updateData)) as FileMonitorCacheRecord;
    } else {
      return await this.create(data);
    }
  }

  /**
   * Batch upsert cache entries
   */
  async batchUpsert(entries: FileMonitorCacheRecord[]): Promise<number> {
    const transaction = this.db.transaction(() => {
      let count = 0;

      for (const entry of entries) {
        const existing = this.db
          .prepare(`SELECT id FROM ${this.tableName} WHERE file_path = ?`)
          .get(entry.file_path) as { id: number } | undefined;

        if (existing) {
          const stmt = this.db.prepare(`
            UPDATE ${this.tableName} 
            SET file_hash = ?, last_modified = ?, file_size = ?, metadata = ?, updated_at = strftime('%s', 'now')
            WHERE id = ?
          `);

          stmt.run(
            entry.file_hash,
            entry.last_modified,
            entry.file_size,
            entry.metadata || null,
            existing.id,
          );
        } else {
          const stmt = this.db.prepare(`
            INSERT INTO ${this.tableName} (file_path, file_hash, last_modified, file_size, metadata)
            VALUES (?, ?, ?, ?, ?)
          `);

          stmt.run(
            entry.file_path,
            entry.file_hash,
            entry.last_modified,
            entry.file_size,
            entry.metadata || null,
          );
        }

        count++;
      }

      return count;
    });

    return transaction();
  }

  /**
   * Remove stale entries (files that no longer exist)
   */
  async removeStale(existingPaths: string[]): Promise<number> {
    if (existingPaths.length === 0) {
      // If no paths provided, delete all
      const sql = `DELETE FROM ${this.tableName}`;
      const result = await this.executeCommand(sql);
      return result.changes;
    }

    // Delete entries not in the existing paths list
    const placeholders = existingPaths.map(() => '?').join(', ');
    const sql = `DELETE FROM ${this.tableName} WHERE file_path NOT IN (${placeholders})`;
    const result = await this.executeCommand(sql, existingPaths);

    return result.changes;
  }

  /**
   * Get cache statistics
   */
  async getStatistics(): Promise<{
    totalFiles: number;
    totalSize: number;
    byExtension: Record<string, { count: number; size: number }>;
    oldestFile?: Date;
    newestFile?: Date;
  }> {
    const total = await this.count();

    // Get total size
    const sizeSql = `SELECT SUM(file_size) as total FROM ${this.tableName}`;
    const sizeResult = await this.executeQuery<{ total: number | null }>(sizeSql);
    const totalSize = sizeResult[0]?.total ?? 0;

    // Get statistics by extension
    const extSql = `
      SELECT 
        CASE 
          WHEN file_path LIKE '%.%' THEN LOWER(SUBSTR(file_path, INSTR(file_path, '.') + 1))
          ELSE 'no_extension'
        END as extension,
        COUNT(*) as count,
        SUM(file_size) as size
      FROM ${this.tableName}
      GROUP BY extension
    `;
    const extResults = await this.executeQuery<{ extension: string; count: number; size: number }>(
      extSql,
    );

    const byExtension: Record<string, { count: number; size: number }> = {};
    for (const row of extResults) {
      byExtension[row.extension] = {
        count: row.count,
        size: row.size,
      };
    }

    // Get oldest and newest files
    const timeSql = `SELECT MIN(last_modified) as oldest, MAX(last_modified) as newest FROM ${this.tableName}`;
    const timeResult = await this.executeQuery<{ oldest: number | null; newest: number | null }>(
      timeSql,
    );

    const firstResult = timeResult[0];
    return {
      totalFiles: total,
      totalSize,
      byExtension,
      ...(firstResult?.oldest && { oldestFile: new Date(firstResult.oldest) }),
      ...(firstResult?.newest && { newestFile: new Date(firstResult.newest) }),
    };
  }

  /**
   * Check if file has changed
   */
  async hasFileChanged(filePath: string, fileHash: string): Promise<boolean> {
    const cached = await this.findByPath(filePath);

    if (!cached) {
      return true; // New file
    }

    return cached.file_hash !== fileHash;
  }
}
