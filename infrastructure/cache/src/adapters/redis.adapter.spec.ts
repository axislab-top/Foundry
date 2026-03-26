/**
 * Redis缓存适配器测试
 */

import { RedisCacheAdapter } from './redis-cache-adapter.js';
import { RedisClientType } from 'redis';

describe('RedisCacheAdapter', () => {
  let adapter: RedisCacheAdapter;
  let mockClient: Partial<RedisClientType>;
  let mockConnect: jest.Mock;
  let mockGet: jest.Mock;
  let mockSet: jest.Mock;
  let mockSetEx: jest.Mock;
  let mockDel: jest.Mock;
  let mockExists: jest.Mock;
  let mockKeys: jest.Mock;
  let mockFlushDb: jest.Mock;

  beforeEach(() => {
    mockConnect = jest.fn().mockResolvedValue(undefined);
    mockGet = jest.fn();
    mockSet = jest.fn().mockResolvedValue('OK');
    mockSetEx = jest.fn().mockResolvedValue('OK');
    mockDel = jest.fn().mockResolvedValue(1);
    mockExists = jest.fn().mockResolvedValue(1);
    mockKeys = jest.fn().mockResolvedValue([]);
    mockFlushDb = jest.fn().mockResolvedValue('OK');

    mockClient = {
      connect: mockConnect,
      get: mockGet,
      set: mockSet,
      setEx: mockSetEx,
      del: mockDel,
      exists: mockExists,
      keys: mockKeys,
      flushDb: mockFlushDb,
      on: jest.fn(),
      quit: jest.fn().mockResolvedValue('OK'),
    } as any;

    // Create adapter and inject mock client
    adapter = new RedisCacheAdapter({});
    (adapter as any).client = mockClient;
    (adapter as any).isConnected = true; // Simulate connected state
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  describe('get', () => {
    it('should get value from cache', async () => {
      const key = 'test-key';
      const value = JSON.stringify('test-value');

      mockGet.mockResolvedValue(value);

      const result = await adapter.get(key);

      expect(result).toBe('test-value');
      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining(key));
    });

    it('should return null if key does not exist', async () => {
      const key = 'non-existent';

      mockGet.mockResolvedValue(null);

      const result = await adapter.get(key);

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set value in cache without TTL', async () => {
      const key = 'test-key';
      const value = 'test-value';

      const result = await adapter.set(key, value);

      expect(result).toBe(true);
      expect(mockSet).toHaveBeenCalledWith(
        expect.stringContaining(key),
        value
      );
    });

    it('should set value in cache with TTL', async () => {
      const key = 'test-key';
      const value = 'test-value';
      const ttl = 3600;

      const result = await adapter.set(key, value, ttl);

      expect(result).toBe(true);
      expect(mockSetEx).toHaveBeenCalledWith(
        expect.stringContaining(key),
        ttl,
        value
      );
    });
  });

  describe('delete', () => {
    it('should delete key from cache', async () => {
      const key = 'test-key';

      mockDel.mockResolvedValue(1);

      const result = await adapter.delete(key);

      expect(result).toBe(true);
      expect(mockDel).toHaveBeenCalledWith(expect.stringContaining(key));
    });
  });
});



