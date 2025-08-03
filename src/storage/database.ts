/**
 * Database connection and initialization
 */

import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { DatabaseConfig } from './types.js';
import { SCHEMA_SQL } from './schemas/index.js';

/**
 * Database manager class
 */
export class DatabaseManager {
  private db: Database.Database;
  private readonly config: DatabaseConfig;
  
  constructor(config?: Partial<DatabaseConfig>) {
    this.config = {
      path: config?.path || join(process.cwd(), 'data', 'devflow.db'),
      verbose: config?.verbose || false,
      readonly: config?.readonly || false,
      fileMustExist: config?.fileMustExist || false,
      timeout: config?.timeout || 5000,
      memory: config?.memory || false,
    };
    
    this.db = this.createConnection();
    this.initialize();
  }
  
  /**
   * Create database connection
   */
  private createConnection(): Database.Database {
    const options: Database.Options = {
      verbose: this.config.verbose ? console.log : undefined,
      readonly: this.config.readonly,
      fileMustExist: this.config.fileMustExist,
      timeout: this.config.timeout,
    };
    
    if (this.config.memory) {
      return new Database(':memory:', options);
    }
    
    // Ensure data directory exists
    const dataDir = dirname(this.config.path);
    if (!this.config.fileMustExist) {
      import('fs').then(({ mkdirSync }) => {
        mkdirSync(dataDir, { recursive: true });
      });
    }
    
    return new Database(this.config.path, options);
  }
  
  /**
   * Initialize database with schema
   */
  private initialize(): void {
    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');
    
    // Set WAL mode for better concurrency
    if (!this.config.memory) {
      this.db.pragma('journal_mode = WAL');
    }
    
    // Load and execute schema
    try {
      this.db.exec(SCHEMA_SQL);
      
      // Run migrations
      this.runMigrations();
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }
  
  /**
   * Run database migrations
   */
  private runMigrations(): void {
    // Get current migration version
    const currentVersion = this.getCurrentMigrationVersion();
    
    // Define migrations
    const migrations = [
      {
        version: 1,
        name: 'initial_schema',
        up: () => {
          // Initial schema is handled by schema.sql
          console.log('Migration 1: Initial schema applied');
        },
      },
      // Add future migrations here
    ];
    
    // Apply pending migrations
    for (const migration of migrations) {
      if (migration.version > currentVersion) {
        console.log(`Running migration ${migration.version}: ${migration.name}`);
        
        const transaction = this.db.transaction(() => {
          migration.up();
          this.recordMigration(migration.version, migration.name);
        });
        
        transaction();
      }
    }
  }
  
  /**
   * Get current migration version
   */
  private getCurrentMigrationVersion(): number {
    try {
      const stmt = this.db.prepare(
        'SELECT MAX(version) as version FROM migrations'
      );
      const result = stmt.get() as { version: number | null };
      return result.version || 0;
    } catch {
      // Table doesn't exist yet
      return 0;
    }
  }
  
  /**
   * Record a migration
   */
  private recordMigration(version: number, name: string): void {
    const stmt = this.db.prepare(
      'INSERT INTO migrations (version, name) VALUES (?, ?)'
    );
    stmt.run(version, name);
  }
  
  /**
   * Get database instance
   */
  getDatabase(): Database.Database {
    return this.db;
  }
  
  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
  
  /**
   * Execute a transaction
   */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
  
  /**
   * Prepare a statement
   */
  prepare(sql: string): Database.Statement {
    return this.db.prepare(sql);
  }
  
  /**
   * Get database statistics
   */
  getStats(): {
    tables: number;
    totalRows: number;
    fileSize?: number;
  } {
    const tables = this.db.prepare(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).get() as { count: number };
    
    const totalRows = this.db.prepare(`
      SELECT SUM(cnt) as total FROM (
        SELECT COUNT(*) as cnt FROM events
        UNION ALL
        SELECT COUNT(*) as cnt FROM activities
        UNION ALL
        SELECT COUNT(*) as cnt FROM metrics
        UNION ALL
        SELECT COUNT(*) as cnt FROM stage_transitions
        UNION ALL
        SELECT COUNT(*) as cnt FROM file_monitor_cache
      )
    `).get() as { total: number };
    
    let fileSize: number | undefined;
    if (!this.config.memory) {
      try {
        const { statSync } = require('fs');
        const stats = statSync(this.config.path);
        fileSize = stats.size;
      } catch {
        // File doesn't exist or can't be accessed
      }
    }
    
    return {
      tables: tables.count,
      totalRows: totalRows.total || 0,
      ...(fileSize !== undefined && { fileSize }),
    };
  }
  
  /**
   * Vacuum database (optimize)
   */
  vacuum(): void {
    if (!this.config.memory) {
      this.db.exec('VACUUM');
    }
  }
  
  /**
   * Backup database
   */
  async backup(destinationPath: string): Promise<void> {
    if (this.config.memory) {
      throw new Error('Cannot backup in-memory database');
    }
    
    return new Promise((resolve, reject) => {
      this.db.backup(destinationPath)
        .then(() => resolve())
        .catch(reject);
    });
  }
}

// Singleton instance
let instance: DatabaseManager | null = null;

/**
 * Get database instance
 */
export function getDatabase(config?: Partial<DatabaseConfig>): DatabaseManager {
  if (!instance) {
    instance = new DatabaseManager(config);
  }
  return instance;
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}