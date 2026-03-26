/**
 * 缓存集成测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from '@service/cache';
import { createTestRedisClient, cleanupTestRedis } from '../../setup/test-redis.js';

describe('Cache Integration', () => {
  let cacheService: CacheService;
  let redisClient: any;

  beforeAll(async () => {
    redisClient = await createTestRedisClient();
    // 注意：createTestRedisClient() 返回的是 Mock 实现
    // 如果需要真实的 Redis 集成测试，应该使用真实的 Redis 客户端
    // 并在测试环境中启动 Redis 服务
  });

  afterAll(async () => {
    await cleanupTestRedis(redisClient);
  });

  describe('Redis Operations', () => {
    it('should set and get value', async () => {
      const key = 'test-key';
      const value = 'test-value';

      await redisClient.set(key, value);
      const result = await redisClient.get(key);

      expect(result).toBe(value);
    });

    it('should delete key', async () => {
      const key = 'delete-test';
      const value = 'test-value';

      await redisClient.set(key, value);
      await redisClient.del(key);
      const result = await redisClient.get(key);

      expect(result).toBeNull();
    });

    it('should handle expiration', async () => {
      const key = 'expire-test';
      const value = 'test-value';

      await redisClient.set(key, value, { EX: 1 });
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const result = await redisClient.get(key);

      expect(result).toBeNull();
    });
  });
});


