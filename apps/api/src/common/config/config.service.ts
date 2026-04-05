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
  MemoryConfig,
} from './interfaces/config.interface.js';
import fs from 'node:fs/promises';

type DepartmentZhMap = Record<string, string>;

/**
 * 配置服务
 * 提供类型安全的配置访问
 * 使用 @service/config 进行配置管理
 */
@Injectable()
export class ConfigService {
  private configManager: ConfigManager;
  private cachedDeptZhMap: DepartmentZhMap | null = null;
  private cachedDeptZhMapLoadedAt = 0;

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

  /** Gateway/API 经 Redis Pub/Sub 推送协作消息（需与 Gateway 使用同一 Redis） */
  isCollaborationRedisNotifyEnabled(): boolean {
    return this.configManager.get<boolean>('COLLAB_REDIS_NOTIFY', true);
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
   * Memory / RAG 嵌入配置
   */
  getMemoryConfig(): MemoryConfig {
    return {
      openaiApiKey: this.configManager.get<string>('OPENAI_API_KEY'),
      openaiBaseUrl: this.configManager.get<string>(
        'OPENAI_BASE_URL',
        'https://api.openai.com/v1',
      ),
      embeddingModel: this.configManager.get<string>(
        'MEMORY_EMBEDDING_MODEL',
        'text-embedding-3-small',
      ),
      embeddingDimensions: this.configManager.get<number>(
        'MEMORY_EMBEDDING_DIMENSIONS',
        1536,
      ),
      ragQueryTimeoutMs: this.configManager.get<number>(
        'MEMORY_RAG_QUERY_TIMEOUT_MS',
        280,
      ),
      hybridVectorWeight: this.configManager.get<number>(
        'MEMORY_HYBRID_VECTOR_WEIGHT',
        0.72,
      ),
      hybridFullTextSearch: this.configManager.get<boolean>(
        'MEMORY_HYBRID_FULLTEXT',
        true,
      ),
      ragMinScore: this.configManager.get<number>('MEMORY_RAG_MIN_SCORE', 0),
      embeddingDailyCap: this.configManager.get<number>(
        'MEMORY_EMBEDDING_DAILY_CAP',
        0,
      ),
      summaryDailyCap: this.configManager.get<number>(
        'MEMORY_SUMMARY_DAILY_CAP',
        0,
      ),
    };
  }

  isSessionMemoryEnabled(): boolean {
    return this.configManager.get<boolean>('ENABLE_SESSION_MEMORY', true);
  }

  isMemoryConsolidationEnabled(): boolean {
    return this.configManager.get<boolean>('ENABLE_MEMORY_CONSOLIDATION', false);
  }

  getMemoryConsolidationWindowMessages(): number {
    return this.configManager.get<number>('MEMORY_CONSOLIDATION_WINDOW_MESSAGES', 50);
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
      memory: this.getMemoryConfig(),
    };
  }

  /**
   * 部门英文/别名 -> 中文展示名映射
   * - 优先 DEPARTMENT_ZH_MAP_JSON（JSON 字符串）
   * - 其次 DEPARTMENT_ZH_MAP_PATH（JSON 文件路径）
   * - 否则返回空对象（由业务层使用默认映射/兜底）
   *
   * 为避免频繁 IO，带短缓存（默认 30s）。
   */
  async getDepartmentZhMap(): Promise<DepartmentZhMap> {
    const now = Date.now();
    if (this.cachedDeptZhMap && now - this.cachedDeptZhMapLoadedAt < 30_000) {
      return this.cachedDeptZhMap;
    }

    const rawJson = this.configManager.get<string>('DEPARTMENT_ZH_MAP_JSON', '').trim();
    if (rawJson) {
      const parsed = JSON.parse(rawJson) as DepartmentZhMap;
      this.cachedDeptZhMap = parsed ?? {};
      this.cachedDeptZhMapLoadedAt = now;
      return this.cachedDeptZhMap;
    }

    const path = this.configManager.get<string>('DEPARTMENT_ZH_MAP_PATH', '').trim();
    if (path) {
      const file = await fs.readFile(path, 'utf8');
      const parsed = JSON.parse(file) as DepartmentZhMap;
      this.cachedDeptZhMap = parsed ?? {};
      this.cachedDeptZhMapLoadedAt = now;
      return this.cachedDeptZhMap;
    }

    this.cachedDeptZhMap = {};
    this.cachedDeptZhMapLoadedAt = now;
    return this.cachedDeptZhMap;
  }
}

