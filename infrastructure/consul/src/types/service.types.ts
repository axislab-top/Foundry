import type { HealthCheckConfig, HealthCheckStatus } from './health.types.js';

/**
 * 服务相关类型定义
 */

/**
 * 服务注册信息
 */
export interface ServiceRegistration {
  /**
   * 服务名称（必需）
   */
  name: string;
  
  /**
   * 服务 ID（可选，默认使用 name）
   */
  id?: string;
  
  /**
   * 服务标签
   */
  tags?: string[];
  
  /**
   * 服务地址
   */
  address?: string;
  
  /**
   * 服务端口
   */
  port?: number;
  
  /**
   * 服务元数据
   */
  meta?: Record<string, string>;
  
  /**
   * 健康检查配置
   */
  check?: HealthCheckConfig;
  
  /**
   * 健康检查列表
   */
  checks?: HealthCheckConfig[];
}

/**
 * 服务信息
 */
export interface ServiceInfo {
  /**
   * 服务 ID
   */
  ID: string;
  
  /**
   * 服务名称
   */
  Service: string;
  
  /**
   * 服务标签
   */
  Tags?: string[];
  
  /**
   * 服务地址
   */
  Address?: string;
  
  /**
   * 服务端口
   */
  Port?: number;
  
  /**
   * 服务元数据
   */
  Meta?: Record<string, string>;
  
  /**
   * 健康检查状态
   */
  Checks?: HealthCheckStatus[];
}

/**
 * 服务节点
 */
export interface ServiceNode {
  /**
   * 节点 ID
   */
  ID: string;
  
  /**
   * 节点地址
   */
  Address: string;
  
  /**
   * 节点元数据
   */
  Meta?: Record<string, string>;
}

/**
 * 服务实例
 */
export interface ServiceInstance {
  /**
   * 服务 ID
   */
  id: string;
  
  /**
   * 服务名称
   */
  name: string;
  
  /**
   * 服务地址
   */
  address: string;
  
  /**
   * 服务端口
   */
  port: number;
  
  /**
   * 服务标签
   */
  tags?: string[];
  
  /**
   * 服务元数据
   */
  meta?: Record<string, string>;
  
  /**
   * 健康状态
   */
  healthy?: boolean;
  
  /**
   * 节点信息
   */
  node?: ServiceNode;
}

/**
 * 服务查询选项
 */
export interface ServiceQueryOptions {
  /**
   * 服务名称
   */
  service: string;
  
  /**
   * 标签过滤
   */
  tag?: string;
  
  /**
   * 是否只返回健康的服务
   */
  passing?: boolean;
  
  /**
   * 数据中心
   */
  dc?: string;
  
  /**
   * 附近节点
   */
  near?: string;
}

/**
 * 服务监听选项
 */
export interface ServiceWatchOptions extends ServiceQueryOptions {
  /**
   * 监听间隔（毫秒）
   */
  interval?: number;
  
  /**
   * 变更回调
   */
  onUpdate?: (instances: ServiceInstance[]) => void;
  
  /**
   * 错误回调
   */
  onError?: (error: Error) => void;
}









