import { Injectable, Inject } from '@nestjs/common';
import { ConfigManager } from '@service/config';
import {
  AppConfig,
  DatabaseConfig,
  RedisConfig,
  MonitoringConfig,
  HttpConfig,
  CorsConfig,
  StorageConfig,
  StorageType,
  ApiConfig,
} from './interfaces/config.interface.js';

/**
 * 配置服务
 * 提供类型安全的配置访问
 * 使用 @service/config 进行配置管理
 */
@Injectable()
export class ConfigService {
  private configManager: ConfigManager;

  constructor(@Inject('CONFIG_MANAGER') configManager: ConfigManager) {
    this.configManager = configManager;
  }

  /**
   * 获取应用配置
   */
  getAppConfig(): AppConfig {
    return {
      nodeEnv: this.configManager.get<string>('NODE_ENV', 'development'),
      port: this.configManager.get<number>('PORT', 3000),
    };
  }

  /**
   * 获取数据库配置
   */
  getDatabaseConfig(): DatabaseConfig {
    return {
      host: this.configManager.get<string>('DB_HOST', 'localhost'),
      port: this.configManager.get<number>('DB_PORT', 5432),
      username: this.configManager.get<string>('DB_USERNAME', 'postgres'),
      password: this.configManager.get<string>('DB_PASSWORD', 'postgres'),
      database: this.configManager.get<string>('DB_DATABASE', 'service_db'),
      synchronize: this.configManager.get<boolean>('DB_SYNCHRONIZE', false),
      logging: this.configManager.get<boolean>('DB_LOGGING', false),
      ssl: this.configManager.get<boolean>('DB_SSL', false),
      sslRejectUnauthorized: this.configManager.get<boolean>('DB_SSL_REJECT_UNAUTHORIZED', true),
      connectionTimeout: this.configManager.get<number>('DB_CONNECTION_TIMEOUT', 2000),
      queryTimeout: this.configManager.get<number>('DB_QUERY_TIMEOUT', 30000),
      maxConnections: this.configManager.get<number>('DB_MAX_CONNECTIONS', 20),
      minConnections: this.configManager.get<number>('DB_MIN_CONNECTIONS', 5),
      transactionIsolation: this.configManager.get<'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE'>(
        'DB_TRANSACTION_ISOLATION',
        'READ COMMITTED',
      ),
    };
  }

  /**
   * 获取 Redis 配置
   */
  getRedisConfig(): RedisConfig {
    return {
      host: this.configManager.get<string>('REDIS_HOST', 'localhost'),
      port: this.configManager.get<number>('REDIS_PORT', 6379),
      password: this.configManager.get<string>('REDIS_PASSWORD'),
      db: this.configManager.get<number>('REDIS_DB', 0),
      url: this.configManager.get<string>('REDIS_URL'),
    };
  }

  /**
   * 获取监控配置
   */
  getMonitoringConfig(): MonitoringConfig {
    return {
      adapter: this.configManager.get<string>('METRICS_ADAPTER', 'prometheus'),
      enabled: this.configManager.get<boolean>('METRICS_ENABLED', true),
      prometheus: {
        collectDefaultMetrics: this.configManager.get<boolean>(
          'PROMETHEUS_COLLECT_DEFAULT_METRICS',
          true,
        ),
        prefix: this.configManager.get<string>(
          'PROMETHEUS_PREFIX',
          'api_service',
        ),
      },
    };
  }

  /**
   * 获取 HTTP 配置
   */
  getHttpConfig(): HttpConfig {
    return {
      timeout: this.configManager.get<number>('HTTP_TIMEOUT', 30000),
    };
  }

  /**
   * 获取 CORS 配置
   */
  getCorsConfig(): CorsConfig {
    const origin = this.configManager.get<string>('CORS_ORIGIN', '*');
    return {
      origin: origin === '*' ? '*' : origin.split(','),
      credentials: this.configManager.get<boolean>('CORS_CREDENTIALS', true),
    };
  }

  /**
   * 获取存储配置
   */
  getStorageConfig(): StorageConfig {
    const type = this.configManager.get<StorageType>('STORAGE_TYPE', 'local');

    return {
      type,
      local: {
        basePath: this.configManager.get<string>(
          'STORAGE_LOCAL_BASE_PATH',
          './storage',
        ),
        baseUrl: this.configManager.get<string>(
          'STORAGE_LOCAL_BASE_URL',
          '/api/files',
        ),
      },
      minio: {
        endpoint: this.configManager.get<string>(
          'STORAGE_MINIO_ENDPOINT',
          'localhost',
        ),
        port: this.configManager.get<number>('STORAGE_MINIO_PORT', 9000),
        useSSL: this.configManager.get<boolean>('STORAGE_MINIO_USE_SSL', false),
        accessKey: this.configManager.get<string>(
          'STORAGE_MINIO_ACCESS_KEY',
          'minioadmin',
        ),
        secretKey: this.configManager.get<string>(
          'STORAGE_MINIO_SECRET_KEY',
          'minioadmin',
        ),
        bucketName: this.configManager.get<string>(
          'STORAGE_MINIO_BUCKET_NAME',
          'files',
        ),
        baseUrl: this.configManager.get<string>('STORAGE_MINIO_BASE_URL'),
      },
      s3: {
        accessKeyId: this.configManager.get<string>('STORAGE_S3_ACCESS_KEY_ID')!,
        secretAccessKey: this.configManager.get<string>(
          'STORAGE_S3_SECRET_ACCESS_KEY',
        )!,
        region: this.configManager.get<string>('STORAGE_S3_REGION', 'us-east-1'),
        bucketName: this.configManager.get<string>('STORAGE_S3_BUCKET_NAME')!,
        endpoint: this.configManager.get<string>('STORAGE_S3_ENDPOINT'),
      },
      oss: {
        accessKeyId: this.configManager.get<string>('STORAGE_OSS_ACCESS_KEY_ID')!,
        accessKeySecret: this.configManager.get<string>(
          'STORAGE_OSS_ACCESS_KEY_SECRET',
        )!,
        region: this.configManager.get<string>('STORAGE_OSS_REGION')!,
        bucketName: this.configManager.get<string>('STORAGE_OSS_BUCKET_NAME')!,
        endpoint: this.configManager.get<string>('STORAGE_OSS_ENDPOINT'),
      },
    };
  }

  /**
   * 获取完整配置
   */
  getConfig(): ApiConfig {
    return {
      app: this.getAppConfig(),
      database: this.getDatabaseConfig(),
      redis: this.getRedisConfig(),
      monitoring: this.getMonitoringConfig(),
      http: this.getHttpConfig(),
      cors: this.getCorsConfig(),
      storage: this.getStorageConfig(),
    };
  }
}

