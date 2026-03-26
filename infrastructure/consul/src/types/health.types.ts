/**
 * 健康检查相关类型定义
 */

/**
 * 健康检查配置
 */
export interface HealthCheckConfig {
  /**
   * 检查 ID（可选）
   */
  id?: string;
  
  /**
   * 检查名称
   */
  name?: string;
  
  /**
   * 检查类型
   */
  type: HealthCheckType;
  
  /**
   * 检查间隔（如 "10s"）
   */
  interval?: string;
  
  /**
   * 检查超时（如 "3s"）
   */
  timeout?: string;
  
  /**
   * 失败后注销时间（如 "30s"）
   */
  deregisterCriticalServiceAfter?: string;
  
  /**
   * HTTP 检查配置（当 type 为 HTTP 时）
   */
  http?: string;
  
  /**
   * TCP 检查配置（当 type 为 TCP 时）
   */
  tcp?: string;
  
  /**
   * 脚本检查配置（当 type 为 Script 时）
   */
  script?: string;
  
  /**
   * TTL 检查配置（当 type 为 TTL 时）
   */
  ttl?: string;
  
  /**
   * 检查状态（当 type 为 TTL 时）
   */
  status?: HealthCheckStatusType;
  
  /**
   * 检查参数
   */
  args?: string[];
  
  /**
   * HTTP 方法（当 type 为 HTTP 时）
   */
  method?: string;
  
  /**
   * HTTP 头（当 type 为 HTTP 时）
   */
  header?: Record<string, string | string[]>;
  
  /**
   * 是否启用 TLS 跳过验证
   */
  tlsSkipVerify?: boolean;
}

/**
 * 健康检查类型
 */
export enum HealthCheckType {
  /**
   * HTTP 检查
   */
  HTTP = 'http',
  
  /**
   * TCP 检查
   */
  TCP = 'tcp',
  
  /**
   * 脚本检查
   */
  SCRIPT = 'script',
  
  /**
   * Docker 检查
   */
  DOCKER = 'docker',
  
  /**
   * TTL 检查
   */
  TTL = 'ttl',
  
  /**
   * gRPC 检查
   */
  GRPC = 'grpc',
}

/**
 * 健康检查状态类型
 */
export enum HealthCheckStatusType {
  /**
   * 通过
   */
  PASSING = 'passing',
  
  /**
   * 警告
   */
  WARNING = 'warning',
  
  /**
   * 失败
   */
  CRITICAL = 'critical',
}

/**
 * 健康检查状态
 */
export interface HealthCheckStatus {
  /**
   * 检查 ID
   */
  CheckID: string;
  
  /**
   * 检查名称
   */
  Name?: string;
  
  /**
   * 状态
   */
  Status: HealthCheckStatusType;
  
  /**
   * 输出
   */
  Output?: string;
  
  /**
   * 服务 ID
   */
  ServiceID?: string;
  
  /**
   * 服务名称
   */
  ServiceName?: string;
  
  /**
   * 节点
   */
  Node?: string;
}

/**
 * 健康检查处理器接口
 */
export interface HealthCheckHandler {
  /**
   * 检查名称
   */
  name: string;
  
  /**
   * 执行健康检查
   */
  check(): Promise<HealthCheckResult>;
}

/**
 * 健康检查结果
 */
export interface HealthCheckResult {
  /**
   * 是否健康
   */
  healthy: boolean;
  
  /**
   * 状态
   */
  status: HealthCheckStatusType;
  
  /**
   * 消息
   */
  message?: string;
  
  /**
   * 数据
   */
  data?: Record<string, any>;
}






































