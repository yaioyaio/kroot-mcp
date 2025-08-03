/**
 * Storage manager for coordinating database operations
 */

import { DatabaseManager, getDatabase } from './database.js';
import {
  EventRepository,
  ActivityRepository,
  MetricsRepository,
  StageTransitionRepository,
  FileMonitorCacheRepository
} from './repositories/index.js';
import { EventEngine } from '../events/engine.js';
import { BaseEvent, EventCategory } from '../events/types/index.js';
import { DatabaseConfig } from './types.js';

/**
 * Storage manager class
 */
export class StorageManager {
  private db: DatabaseManager;
  private eventRepo: EventRepository;
  private activityRepo: ActivityRepository;
  private metricsRepo: MetricsRepository;
  private stageTransitionRepo: StageTransitionRepository;
  private fileMonitorCacheRepo: FileMonitorCacheRepository;
  private eventEngine?: EventEngine;
  
  constructor(config?: Partial<DatabaseConfig>) {
    this.db = getDatabase(config);
    
    // Initialize repositories
    this.eventRepo = new EventRepository(this.db);
    this.activityRepo = new ActivityRepository(this.db);
    this.metricsRepo = new MetricsRepository(this.db);
    this.stageTransitionRepo = new StageTransitionRepository(this.db);
    this.fileMonitorCacheRepo = new FileMonitorCacheRepository(this.db);
  }
  
  /**
   * Connect to EventEngine for automatic event persistence
   */
  connectEventEngine(eventEngine: EventEngine): void {
    this.eventEngine = eventEngine;
    
    // Subscribe to all events for persistence
    this.eventEngine.subscribe(
      '*',
      async (event: BaseEvent) => {
        try {
          await this.persistEvent(event);
        } catch (error) {
          console.error('Failed to persist event:', error);
        }
      },
      {
        priority: 1 // Low priority, runs after other handlers
      }
    );
    
    console.log('StorageManager connected to EventEngine');
  }
  
  /**
   * Persist an event to storage
   */
  private async persistEvent(event: BaseEvent): Promise<void> {
    // Validate event has required fields
    if (!event || !event.type || !event.timestamp) {
      console.warn('Invalid event received:', JSON.stringify({
        hasEvent: !!event,
        type: event?.type,
        hasTimestamp: !!event?.timestamp,
        timestampType: event?.timestamp ? typeof event.timestamp : 'undefined',
        event: event
      }, null, 2));
      return;
    }
    
    // Save the raw event
    const eventRecord = await this.eventRepo.createFromEvent(event);
    
    // Process based on event category
    switch (event.category) {
      case EventCategory.ACTIVITY:
        await this.processActivityEvent(event, eventRecord.id!);
        break;
        
      case EventCategory.STAGE:
        await this.processStageEvent(event);
        break;
        
      case EventCategory.FILE:
        await this.processFileEvent(event);
        break;
        
      case EventCategory.GIT:
        // Git events might update activity logs
        if (event.data.action) {
          await this.processActivityEvent(event, eventRecord.id!);
        }
        break;
    }
  }
  
  /**
   * Process activity event
   */
  private async processActivityEvent(event: BaseEvent, eventId: number): Promise<void> {
    const { stage, action, details, actor } = event.data;
    
    if (stage && action && actor) {
      await this.activityRepo.create({
        stage,
        action,
        details: details || JSON.stringify(event.data),
        actor,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null,
        timestamp: event.timestamp instanceof Date ? event.timestamp.getTime() : Date.now(),
        event_id: eventId
      });
    }
  }
  
  /**
   * Process stage transition event
   */
  private async processStageEvent(event: BaseEvent): Promise<void> {
    const { fromStage, toStage, confidence } = event.data;
    
    if (toStage && typeof confidence === 'number') {
      await this.stageTransitionRepo.create({
        from_stage: fromStage || null,
        to_stage: toStage,
        timestamp: event.timestamp instanceof Date ? event.timestamp.getTime() : Date.now(),
        confidence,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null
      });
    }
  }
  
  /**
   * Process file event for cache updates
   */
  private async processFileEvent(event: BaseEvent): Promise<void> {
    const { filePath, fileHash, fileSize } = event.data;
    
    if (filePath && fileHash && typeof fileSize === 'number') {
      await this.fileMonitorCacheRepo.upsert({
        file_path: filePath,
        file_hash: fileHash,
        last_modified: event.timestamp instanceof Date ? event.timestamp.getTime() : Date.now(),
        file_size: fileSize,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null
      });
    }
  }
  
  /**
   * Get repository instances
   */
  get repositories() {
    return {
      events: this.eventRepo,
      activities: this.activityRepo,
      metrics: this.metricsRepo,
      stageTransitions: this.stageTransitionRepo,
      fileMonitorCache: this.fileMonitorCacheRepo
    };
  }
  
  /**
   * Get database statistics
   */
  async getStatistics() {
    const dbStats = this.db.getStats();
    const eventStats = await this.eventRepo.getStatistics();
    const activityStats = await this.activityRepo.getStatisticsByStage();
    const cacheStats = await this.fileMonitorCacheRepo.getStatistics();
    const transitionStats = await this.stageTransitionRepo.getStatistics();
    
    return {
      database: dbStats,
      events: eventStats,
      activities: activityStats,
      fileCache: cacheStats,
      stageTransitions: transitionStats
    };
  }
  
  /**
   * Clean old data
   */
  async cleanOldData(olderThanDays: number = 30): Promise<{
    events: number;
    activities: number;
    metrics: number;
    transitions: number;
  }> {
    const cutoffTimestamp = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    
    // Execute cleanup operations in a transaction
    const events = await this.eventRepo.cleanOldEvents(cutoffTimestamp);
    const activities = await this.activityRepo.cleanOldActivities(cutoffTimestamp);
    const metrics = await this.metricsRepo.cleanOldMetrics(cutoffTimestamp);
    const transitions = await this.stageTransitionRepo.cleanOldTransitions(cutoffTimestamp);
    
    // Vacuum to reclaim space
    this.db.vacuum();
    
    return {
      events,
      activities,
      metrics,
      transitions
    };
  }
  
  /**
   * Backup database
   */
  async backup(destinationPath: string): Promise<void> {
    return this.db.backup(destinationPath);
  }
  
  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

// Singleton instance
let instance: StorageManager | null = null;

/**
 * Get storage manager instance
 */
export function getStorageManager(config?: Partial<DatabaseConfig>): StorageManager {
  if (!instance) {
    instance = new StorageManager(config);
  }
  return instance;
}

/**
 * Close storage manager
 */
export function closeStorageManager(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}