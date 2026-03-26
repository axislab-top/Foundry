/**
 * 服务工具函数
 */

import type { ServiceRegistration, ServiceInstance } from '../types/index.js';

/**
 * 从环境变量创建服务注册信息
 */
export function createServiceRegistrationFromEnv(): ServiceRegistration {
  return {
    name: process.env.CONSUL_SERVICE_NAME || 'my-service',
    id: process.env.CONSUL_SERVICE_ID,
    tags: process.env.CONSUL_SERVICE_TAGS?.split(',').map(t => t.trim()) || [],
    address: process.env.CONSUL_SERVICE_ADDRESS,
    port: process.env.CONSUL_SERVICE_PORT ? parseInt(process.env.CONSUL_SERVICE_PORT, 10) : undefined,
  };
}

/**
 * 创建默认健康检查配置
 */
export function createDefaultHealthCheck(
  type: 'http' | 'tcp' | 'ttl',
  target: string,
  options?: {
    interval?: string;
    timeout?: string;
    deregisterAfter?: string;
  }
) {
  const baseCheck = {
    interval: options?.interval || process.env.CONSUL_HEALTH_CHECK_INTERVAL || '10s',
    timeout: options?.timeout || process.env.CONSUL_HEALTH_CHECK_TIMEOUT || '3s',
    deregisterCriticalServiceAfter: options?.deregisterAfter || process.env.CONSUL_HEALTH_CHECK_DEREGISTER_AFTER || '30s',
  };

  switch (type) {
    case 'http':
      return {
        ...baseCheck,
        type: 'http' as const,
        http: target,
      };
    case 'tcp':
      return {
        ...baseCheck,
        type: 'tcp' as const,
        tcp: target,
      };
    case 'ttl':
      return {
        ...baseCheck,
        type: 'ttl' as const,
        ttl: target,
      };
  }
}

/**
 * 比较服务实例
 */
export function compareServiceInstances(a: ServiceInstance, b: ServiceInstance): number {
  // 优先返回健康的实例
  if (a.healthy && !b.healthy) return -1;
  if (!a.healthy && b.healthy) return 1;

  // 按 ID 排序
  return a.id.localeCompare(b.id);
}

/**
 * 过滤服务实例
 */
export function filterServiceInstances(
  instances: ServiceInstance[],
  filters: {
    tags?: string[];
    healthy?: boolean;
    meta?: Record<string, string>;
  }
): ServiceInstance[] {
  return instances.filter(instance => {
    // 健康状态过滤
    if (filters.healthy !== undefined && instance.healthy !== filters.healthy) {
      return false;
    }

    // 标签过滤
    if (filters.tags && filters.tags.length > 0) {
      const instanceTags = instance.tags || [];
      const hasAllTags = filters.tags.every(tag => instanceTags.includes(tag));
      if (!hasAllTags) {
        return false;
      }
    }

    // 元数据过滤
    if (filters.meta) {
      const instanceMeta = instance.meta || {};
      for (const [key, value] of Object.entries(filters.meta)) {
        if (instanceMeta[key] !== value) {
          return false;
        }
      }
    }

    return true;
  });
}






































