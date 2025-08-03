/**
 * Database migrations
 */

import { DatabaseManager } from '../database.js';

export interface Migration {
  version: number;
  name: string;
  up: (db: DatabaseManager) => void;
  down?: (db: DatabaseManager) => void;
}

/**
 * Migration definitions
 */
export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: (_db: DatabaseManager) => {
      // Initial schema is handled by schema.sql
      console.log('Migration 1: Initial schema applied');
    }
  },
  {
    version: 2,
    name: 'add_indexes_for_performance',
    up: (db: DatabaseManager) => {
      const dbInstance = db.getDatabase();
      
      // Add composite indexes for better query performance
      dbInstance.exec(`
        -- Composite index for event queries
        CREATE INDEX IF NOT EXISTS idx_events_type_timestamp ON events(type, timestamp);
        
        -- Composite index for activity queries
        CREATE INDEX IF NOT EXISTS idx_activities_stage_action ON activities(stage, action);
        CREATE INDEX IF NOT EXISTS idx_activities_actor_timestamp ON activities(actor, timestamp);
        
        -- Composite index for metrics queries
        CREATE INDEX IF NOT EXISTS idx_metrics_full ON metrics(metric_type, metric_name, timeframe, timestamp);
        
        -- Index for file monitor cache updates
        CREATE INDEX IF NOT EXISTS idx_file_monitor_cache_hash ON file_monitor_cache(file_hash);
      `);
      
      console.log('Migration 2: Performance indexes added');
    }
  },
  {
    version: 3,
    name: 'add_event_correlation',
    up: (db: DatabaseManager) => {
      const dbInstance = db.getDatabase();
      
      // Add correlation fields to events table
      dbInstance.exec(`
        -- Add correlation fields if they don't exist
        ALTER TABLE events ADD COLUMN correlation_id TEXT;
        ALTER TABLE events ADD COLUMN parent_event_id INTEGER REFERENCES events(id);
        
        -- Add index for correlation queries
        CREATE INDEX IF NOT EXISTS idx_events_correlation_id ON events(correlation_id);
        CREATE INDEX IF NOT EXISTS idx_events_parent_event_id ON events(parent_event_id);
      `);
      
      console.log('Migration 3: Event correlation fields added');
    }
  }
];

/**
 * Run all pending migrations
 */
export async function runMigrations(db: DatabaseManager): Promise<void> {
  const dbInstance = db.getDatabase();
  
  // Get current version
  let currentVersion = 0;
  try {
    const result = dbInstance.prepare(
      'SELECT MAX(version) as version FROM migrations'
    ).get() as { version: number | null };
    currentVersion = result.version || 0;
  } catch (error) {
    // Migrations table doesn't exist yet
    console.log('Migrations table not found, will be created');
  }
  
  // Run pending migrations in a transaction
  const pendingMigrations = migrations.filter(m => m.version > currentVersion);
  
  if (pendingMigrations.length === 0) {
    console.log('Database is up to date');
    return;
  }
  
  console.log(`Running ${pendingMigrations.length} pending migrations...`);
  
  for (const migration of pendingMigrations) {
    console.log(`Running migration ${migration.version}: ${migration.name}`);
    
    const transaction = dbInstance.transaction(() => {
      migration.up(db);
      
      // Record migration
      dbInstance.prepare(
        'INSERT INTO migrations (version, name) VALUES (?, ?)'
      ).run(migration.version, migration.name);
    });
    
    try {
      transaction();
      console.log(`Migration ${migration.version} completed successfully`);
    } catch (error) {
      console.error(`Migration ${migration.version} failed:`, error);
      throw error;
    }
  }
  
  console.log('All migrations completed successfully');
}

/**
 * Rollback to a specific version
 */
export async function rollbackTo(db: DatabaseManager, targetVersion: number): Promise<void> {
  const dbInstance = db.getDatabase();
  
  // Get current version
  const result = dbInstance.prepare(
    'SELECT MAX(version) as version FROM migrations'
  ).get() as { version: number | null };
  const currentVersion = result.version || 0;
  
  if (targetVersion >= currentVersion) {
    console.log('Target version is not lower than current version');
    return;
  }
  
  // Get migrations to rollback
  const migrationsToRollback = migrations
    .filter(m => m.version > targetVersion && m.version <= currentVersion)
    .reverse(); // Rollback in reverse order
  
  console.log(`Rolling back ${migrationsToRollback.length} migrations...`);
  
  for (const migration of migrationsToRollback) {
    if (!migration.down) {
      console.warn(`Migration ${migration.version} does not have a down method, skipping`);
      continue;
    }
    
    console.log(`Rolling back migration ${migration.version}: ${migration.name}`);
    
    const transaction = dbInstance.transaction(() => {
      migration.down!(db);
      
      // Remove migration record
      dbInstance.prepare(
        'DELETE FROM migrations WHERE version = ?'
      ).run(migration.version);
    });
    
    try {
      transaction();
      console.log(`Migration ${migration.version} rolled back successfully`);
    } catch (error) {
      console.error(`Rollback of migration ${migration.version} failed:`, error);
      throw error;
    }
  }
  
  console.log('Rollback completed successfully');
}