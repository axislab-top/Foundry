/**
 * 应用配置接口
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  hostname?: string;
}

/**
 * Loki 配置接口
 */
export interface LokiConfig {
  url?: string;
  labels?: {
    job?: string;
    [key: string]: string | undefined;
  };
}

/**
 * Elasticsearch 配置接口
 */
export interface ElasticsearchConfig {
  url?: string;
  indexPrefix?: string;
  indexSuffixPattern?: string;
}

/**
 * 日志存储配置接口
 */
export interface LogStorageConfig {
  logDir?: string;
  loki?: LokiConfig;
  elasticsearch?: ElasticsearchConfig;
}

/**
 * 完整配置接口
 */
export interface LoggingConfig {
  app: AppConfig;
  storage: LogStorageConfig;
}









