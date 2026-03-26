/**
 * 测试Redis配置和工具
 */

/**
 * 测试Redis配置
 */
export const testRedisConfig = {
  host: process.env.TEST_REDIS_HOST || 'localhost',
  port: parseInt(process.env.TEST_REDIS_PORT || '6379', 10),
  password: process.env.TEST_REDIS_PASSWORD,
  db: parseInt(process.env.TEST_REDIS_DB || '1', 10), // 使用不同的DB用于测试
};

/**
 * Redis客户端类型（简化版本，避免类型依赖问题）
 */
export interface TestRedisClient {
  isOpen: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  flushDb(): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
  quit(): Promise<void>;
}

/**
 * 创建测试Redis客户端（Mock版本，实际使用时需要真实Redis客户端）
 */
export async function createTestRedisClient(): Promise<TestRedisClient> {
  // 这是一个简化的Mock实现
  // 在实际测试中，应该使用真实的Redis客户端或Mock
  const mockClient: TestRedisClient = {
    isOpen: false,
    async connect() {
      this.isOpen = true;
    },
    async disconnect() {
      this.isOpen = false;
    },
    async flushDb() {
      // Mock实现
    },
    async get(key: string) {
      return null;
    },
    async set(key: string, value: string) {
      // Mock实现
    },
    async del(key: string) {
      // Mock实现
    },
    async quit() {
      this.isOpen = false;
    },
  };

  await mockClient.connect();
  return mockClient;
}

/**
 * 清理测试Redis数据
 */
export async function cleanupTestRedis(
  client: TestRedisClient,
): Promise<void> {
  if (client.isOpen) {
    await client.flushDb();
    await client.quit();
  }
}

/**
 * 重置测试Redis
 */
export async function resetTestRedis(client: TestRedisClient): Promise<void> {
  if (client.isOpen) {
    await client.flushDb();
  }
}

