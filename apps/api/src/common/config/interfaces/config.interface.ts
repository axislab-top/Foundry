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
export interface MemoryConfig {
  openaiApiKey?: string;
  openaiBaseUrl: string;
  embeddingModel: string;
  embeddingDimensions: number;
  /** 上游向量维（多模态常见 2048）；仅 EMBEDDING_PROJECTION_ENABLED 时使用 */
  embeddingModelOutputDim: number;
  /** 入库与 GraphRAG 余弦检索目标维；投影开启时与 embeddingDimensions 一致 */
  embeddingTargetDim: number;
  embeddingProjectionEnabled: boolean;
  /** RAG SQL 执行超时（毫秒） */
  ragQueryTimeoutMs: number;
  /** Embedding HTTP 请求超时（毫秒） */
  embeddingFetchTimeoutMs: number;
  /** 混合检索：向量得分权重（余弦），其余为关键词匹配权重 */
  hybridVectorWeight: number;
  /**
   * 未显式传 keyword 时，用查询串走 PostgreSQL 全文 tsvector（与向量加权混合）。
   * 依赖迁移 `content_search` GIN 索引。
   */
  hybridFullTextSearch: boolean;
  /** 检索后按综合得分过滤（0=关闭） */
  ragMinScore: number;
  /** 单日总结类 LLM 调用上限（0=不限制） */
  summaryDailyCap: number;

  /** Hybrid search: enable external BM25 backend (Elastic/OpenSearch) */
  elasticEnabled?: boolean;
  elasticUrl?: string;
  elasticApiKey?: string;
  elasticIndexPrefix?: string;
  elasticTimeoutMs?: number;
}

export interface ApiConfig {
  app: AppConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  monitoring: MonitoringConfig;
  http: HttpConfig;
  cors: CorsConfig;
  storage: StorageConfig;
  memory: MemoryConfig;
}








