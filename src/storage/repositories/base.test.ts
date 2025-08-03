import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BaseRepository } from './base.js';
import { DatabaseManager } from '../database.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';

// Test repository implementation
class TestRepository extends BaseRepository<any> {
  constructor(db: DatabaseManager) {
    super(db, 'test_table');
  }

  async testExists(id: number): Promise<boolean> {
    const result = await this.findById(id);
    return result !== null;
  }

  async testQuery(sql: string, params: any[]): Promise<any[]> {
    return this.executeQuery(sql, params);
  }

  async testCommand(sql: string, params: any[]): Promise<any> {
    return this.executeCommand(sql, params);
  }

  async testFindByCriteria(criteria: any): Promise<any[]> {
    return this.findByCriteria(criteria);
  }
}

describe('BaseRepository', () => {
  let tempDir: string;
  let dbPath: string;
  let db: DatabaseManager;
  let repository: TestRepository;

  beforeEach(() => {
    // Create temporary directory for test database
    tempDir = mkdtempSync(join(tmpdir(), 'test-'));
    dbPath = join(tempDir, 'test.db');
    
    // Initialize database and create test table
    db = new DatabaseManager({ path: dbPath });
    const database = db.getDatabase();
    database.exec(`
      CREATE TABLE test_table (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        value INTEGER,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      )
    `);
    
    repository = new TestRepository(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('CRUD operations', () => {
    it('should create a record', async () => {
      const data = { name: 'test', value: 42 };
      const result = await repository.create(data);
      
      expect(result).toMatchObject({
        id: 1,
        name: 'test',
        value: 42,
      });
      expect(result.created_at).toBeDefined();
    });

    it('should find a record by id', async () => {
      const created = await repository.create({ name: 'test', value: 42 });
      const found = await repository.findById(created.id!);
      
      expect(found).toMatchObject({
        id: created.id,
        name: 'test',
        value: 42,
      });
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById(999);
      expect(found).toBeNull();
    });

    it('should find all records', async () => {
      await repository.create({ name: 'test1', value: 1 });
      await repository.create({ name: 'test2', value: 2 });
      await repository.create({ name: 'test3', value: 3 });
      
      const all = await repository.findAll();
      expect(all).toHaveLength(3);
      expect(all[0].name).toBe('test1');
      expect(all[2].value).toBe(3);
    });

    it('should find records by criteria', async () => {
      await repository.create({ name: 'apple', value: 10 });
      await repository.create({ name: 'banana', value: 20 });
      await repository.create({ name: 'apple', value: 30 });
      
      const results = await repository.testFindByCriteria({ name: 'apple' });
      expect(results).toHaveLength(2);
      expect(results.every(r => r.name === 'apple')).toBe(true);
    });

    it('should update a record', async () => {
      const created = await repository.create({ name: 'test', value: 42 });
      const updated = await repository.update(created.id!, { value: 100 });
      
      expect(updated).toMatchObject({
        id: created.id,
        name: 'test',
        value: 100,
      });
      expect(updated.updated_at).toBeGreaterThan(created.updated_at!);
    });

    it('should delete a record', async () => {
      const created = await repository.create({ name: 'test', value: 42 });
      const deleted = await repository.delete(created.id!);
      
      expect(deleted).toBe(true);
      
      const found = await repository.findById(created.id!);
      expect(found).toBeNull();
    });

    it('should return false when deleting non-existent record', async () => {
      const deleted = await repository.delete(999);
      expect(deleted).toBe(false);
    });
  });

  describe('Pagination', () => {
    beforeEach(async () => {
      // Create 10 test records
      for (let i = 1; i <= 10; i++) {
        await repository.create({ name: `test${i}`, value: i * 10 });
      }
    });

    it('should paginate results', async () => {
      const page1 = await repository.findAll({ limit: 3, offset: 0 });
      const page2 = await repository.findAll({ limit: 3, offset: 3 });
      
      expect(page1).toHaveLength(3);
      expect(page2).toHaveLength(3);
      expect(page1[0].name).toBe('test1');
      expect(page2[0].name).toBe('test4');
    });

    it('should order results', async () => {
      const ascending = await repository.findAll({
        orderBy: 'value',
        orderDirection: 'ASC',
        limit: 3,
      });
      
      const descending = await repository.findAll({
        orderBy: 'value',
        orderDirection: 'DESC',
        limit: 3,
      });
      
      expect(ascending[0].value).toBe(10);
      expect(ascending[2].value).toBe(30);
      expect(descending[0].value).toBe(100);
      expect(descending[2].value).toBe(80);
    });
  });

  describe('Utility methods', () => {
    it('should count records', async () => {
      expect(await repository.count()).toBe(0);
      
      await repository.create({ name: 'test1', value: 1 });
      await repository.create({ name: 'test2', value: 2 });
      
      expect(await repository.count()).toBe(2);
    });

    it('should check if record exists', async () => {
      const created = await repository.create({ name: 'test', value: 42 });
      
      expect(await repository.testExists(created.id!)).toBe(true);
      expect(await repository.testExists(999)).toBe(false);
    });

    it('should execute raw queries', async () => {
      await repository.create({ name: 'test1', value: 10 });
      await repository.create({ name: 'test2', value: 20 });
      
      const results = await repository.testQuery(
        'SELECT * FROM test_table WHERE value > ?',
        [15]
      );
      
      expect(results).toHaveLength(1);
      expect(results[0]?.name).toBe('test2');
    });

    it('should execute commands', async () => {
      const result = await repository.testCommand(
        'INSERT INTO test_table (name, value) VALUES (?, ?)',
        ['test', 42]
      );
      
      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBe(1);
    });
  });

  describe('Transaction support', () => {
    it('should handle transactions through DatabaseManager', async () => {
      await db.transaction(async () => {
        await repository.create({ name: 'tx1', value: 1 });
        await repository.create({ name: 'tx2', value: 2 });
      });
      
      const all = await repository.findAll();
      expect(all).toHaveLength(2);
    });

    it('should rollback on error', async () => {
      try {
        await db.transaction(async () => {
          await repository.create({ name: 'tx1', value: 1 });
          throw new Error('Rollback test');
        });
      } catch (error) {
        // Expected error
      }
      
      const all = await repository.findAll();
      expect(all).toHaveLength(0);
    });
  });
});