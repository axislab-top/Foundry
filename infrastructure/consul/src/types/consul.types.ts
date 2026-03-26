/**
 * Consul 基础类型定义
 */

/**
 * Consul 客户端配置
 */
export interface ConsulClientConfig {
  /**
   * Consul 服务器地址
   */
  host?: string;
  
  /**
   * Consul 服务器端口
   */
  port?: number;
  
  /**
   * 是否使用 HTTPS
   */
  secure?: boolean;
  
  /**
   * 访问令牌
   */
  token?: string;
  
  /**
   * 数据中心
   */
  datacenter?: string;
  
  /**
   * 默认配置键前缀
   */
  defaultKeyPrefix?: string;
  
  /**
   * 请求超时时间（毫秒）
   */
  timeout?: number;
  
  /**
   * 是否启用 Promise
   */
  promisify?: boolean;
}

/**
 * Consul 连接状态
 */
export enum ConsulConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

/**
 * Consul 操作结果
 */
export interface ConsulResult<T = any> {
  /**
   * 是否成功
   */
  success: boolean;
  
  /**
   * 数据
   */
  data?: T;
  
  /**
   * 错误信息
   */
  error?: string;
  
  /**
   * 响应时间（毫秒）
   */
  responseTime?: number;
}






































