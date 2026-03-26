/**
 * 测试数据库配置和工具
 */

import { DataSource, DataSourceOptions } from 'typeorm';

/**
 * 测试数据库配置
 */
export const testDatabaseConfig: DataSourceOptions = {
  type: 'postgres',
  host: process.env.TEST_DB_HOST || 'localhost',
  port: parseInt(process.env.TEST_DB_PORT || '5432', 10),
  username: process.env.TEST_DB_USERNAME || 'postgres',
  password: process.env.TEST_DB_PASSWORD || 'postgres',
  database: process.env.TEST_DB_DATABASE || 'service_test_db',
  synchronize: true, // 测试环境允许同步
  dropSchema: true, // 每次测试前删除schema
  logging: false,
  entities: [],
};

/**
 * 创建测试数据库连接
 */
export async function createTestDataSource(
  entities: any[],
): Promise<DataSource> {
  const config = {
    ...testDatabaseConfig,
    entities,
  };
  const dataSource = new DataSource(config);
  await dataSource.initialize();
  return dataSource;
}

/**
 * 清理测试数据库
 */
export async function cleanupTestDatabase(
  dataSource: DataSource,
): Promise<void> {
  if (dataSource.isInitialized) {
    await dataSource.dropDatabase();
    await dataSource.destroy();
  }
}

/**
 * 重置测试数据库
 */
export async function resetTestDatabase(dataSource: DataSource): Promise<void> {
  if (dataSource.isInitialized) {
    const entities = dataSource.entityMetadatas;
    for (const entity of entities) {
      // 使用 entity.target (实体类) 而不是 entity.name (字符串)
      const repository = dataSource.getRepository(entity.target as any);
      await repository.clear();
    }
  }
}


