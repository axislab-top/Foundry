import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '../config/config.service.js';

/**
 * 创建数据库配置
 */
export function createDatabaseConfig(
  configService: ConfigService,
): TypeOrmModuleOptions {
  const dbConfig = configService.getDatabaseConfig();
  const appConfig = configService.getAppConfig();

  // 生产环境安全检查：禁止使用 synchronize
  if (appConfig.nodeEnv === 'production' && dbConfig.synchronize) {
    throw new Error(
      'DB_SYNCHRONIZE cannot be true in production environment. Use migrations instead.',
    );
  }

  // 构建 SSL 配置
  const sslConfig = dbConfig.ssl
    ? {
        rejectUnauthorized: dbConfig.sslRejectUnauthorized ?? true,
      }
    : false;

  // 构建连接池配置
  const poolConfig = {
    max: dbConfig.maxConnections ?? 20,
    min: dbConfig.minConnections ?? 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: dbConfig.connectionTimeout ?? 2000,
    acquireTimeoutMillis: 60000,
  };

  return {
    type: 'postgres',
    host: dbConfig.host,
    port: dbConfig.port,
    username: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.database,
    synchronize: dbConfig.synchronize,
    logging: dbConfig.logging,
    autoLoadEntities: true,
    ssl: sslConfig,
    extra: {
      ...poolConfig,
      statement_timeout: dbConfig.queryTimeout ?? 30000,
    },
  };
}





