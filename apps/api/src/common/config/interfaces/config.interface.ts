/**
 * 应用配置接口
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
}

/**
 * 数据库配置接口
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  synchronize: boolean;
  logging: boolean;
  ssl?: boolean;
  sslRejectUnauthorized?: boolean;
  connectionTimeout?: number;
  queryTimeout?: number;
  maxConnections?: number;
  minConnections?: number;
  transactionIsolation?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
}

/**
 * Redis 配置接口
 */
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  url?: string;
}

/**
 * 监控配置接口
 */
export interface MonitoringConfig {
  adapter: string;
  enabled: boolean;
  prometheus: {
    collectDefaultMetrics: boolean;
    prefix: string;
  };
}

/**
 * HTTP 配置接口
 */
export interface HttpConfig {
  timeout: number;
}

/**
 * CORS 配置接口
 */
export interface CorsConfig {
  origin: string | string[];
  credentials: boolean;
}

/**
 * 存储类型
 */
export type StorageType = 'minio' | 's3' | 'oss' | 'local';

/**
 * 存储配置接口
 */
export interface StorageConfig {
  type: StorageType;
  local: {
    basePath: string;
    baseUrl: string;
  };
  minio: {
    endpoint: string;
    port: number;
    useSSL: boolean;
    accessKey: string;
    secretKey: string;
    bucketName: string;
    baseUrl?: string;
  };
  s3: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    bucketName: string;
    endpoint?: string;
  };
  oss: {
    accessKeyId: string;
    accessKeySecret: string;
    region: string;
    bucketName: string;
    endpoint?: string;
  };
}

/**
 * 完整配置接口
 */
export interface ApiConfig {
  app: AppConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  monitoring: MonitoringConfig;
  http: HttpConfig;
  cors: CorsConfig;
  storage: StorageConfig;
}








