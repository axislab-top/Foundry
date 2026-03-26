/**
 * 应用配置接口
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  version?: string;
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
  maxConnections?: number;
  minConnections?: number;
  connectionTimeout?: number;
  queryTimeout?: number;
}

/**
 * HTTP 配置接口
 */
export interface HttpConfig {
  timeout: number;
}

/**
 * 完整配置接口
 */
export interface WebhooksConfig {
  app: AppConfig;
  database: DatabaseConfig;
  http: HttpConfig;
}









