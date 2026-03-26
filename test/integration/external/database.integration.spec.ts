/**
 * 数据库集成测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { createTestDataSource, cleanupTestDatabase } from '../../setup/test-database.js';
import { User } from '../../../apps/api/src/modules/users/entities/user.entity.js';

describe('Database Integration', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await createTestDataSource([User]);
  });

  afterAll(async () => {
    await cleanupTestDatabase(dataSource);
  });

  describe('Connection', () => {
    it('should connect to database', () => {
      expect(dataSource.isInitialized).toBe(true);
    });

    it('should execute queries', async () => {
      const result = await dataSource.query('SELECT 1 as test');
      expect(result).toBeDefined();
      expect(result[0].test).toBe(1);
    });
  });

  describe('User Entity', () => {
    it('should create user table', async () => {
      const queryRunner = dataSource.createQueryRunner();
      const tables = await queryRunner.getTables();
      const userTable = tables.find((table) => table.name === 'user');

      expect(userTable).toBeDefined();
      await queryRunner.release();
    });
  });
});








