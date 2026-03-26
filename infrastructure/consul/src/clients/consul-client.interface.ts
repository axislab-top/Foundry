/**
 * Consul 客户端接口
 */

import type {
  ServiceRegistration,
  ServiceInfo,
  ServiceInstance,
  ServiceQueryOptions,
  KVEntry,
  KVOptions,
  KVGetOptions,
  KVSetOptions,
  HealthCheckConfig,
  HealthCheckStatus,
  ConsulResult,
} from '../types/index.js';

/**
 * Consul 客户端接口
 */
export interface IConsulClient {
  /**
   * 连接状态
   */
  readonly status: string;
  
  /**
   * 连接 Consul
   */
  connect(): Promise<void>;
  
  /**
   * 断开连接
   */
  disconnect(): Promise<void>;
  
  /**
   * 注册服务
   */
  registerService(registration: ServiceRegistration): Promise<ConsulResult<void>>;
  
  /**
   * 注销服务
   */
  deregisterService(serviceId: string): Promise<ConsulResult<void>>;
  
  /**
   * 获取服务信息
   */
  getService(serviceId: string): Promise<ConsulResult<ServiceInfo>>;
  
  /**
   * 查询服务实例
   */
  queryService(options: ServiceQueryOptions): Promise<ConsulResult<ServiceInstance[]>>;
  
  /**
   * 获取所有服务
   */
  listServices(): Promise<ConsulResult<Record<string, string[]>>>;
  
  /**
   * 设置 KV 值
   */
  setKV(options: KVOptions): Promise<ConsulResult<boolean>>;
  
  /**
   * 获取 KV 值
   */
  getKV(options: KVGetOptions): Promise<ConsulResult<KVEntry | KVEntry[] | null>>;
  
  /**
   * 删除 KV 值
   */
  deleteKV(key: string, options?: { recurse?: boolean; dc?: string }): Promise<ConsulResult<boolean>>;
  
  /**
   * 更新健康检查状态（TTL）
   */
  updateHealthCheck(checkId: string, status: string, output?: string): Promise<ConsulResult<void>>;
  
  /**
   * 获取节点健康检查
   */
  getNodeHealthChecks(node: string): Promise<ConsulResult<HealthCheckStatus[]>>;
  
  /**
   * 获取服务健康检查
   */
  getServiceHealthChecks(service: string, options?: { passing?: boolean; dc?: string }): Promise<ConsulResult<HealthCheckStatus[]>>;
}






































