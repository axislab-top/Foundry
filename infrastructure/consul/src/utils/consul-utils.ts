/**
 * Consul 工具函数
 */

import type { ServiceInstance } from '../types/index.js';

/**
 * 格式化服务 URL
 */
export function formatServiceUrl(
  instance: ServiceInstance,
  protocol: string = 'http',
  path: string = ''
): string {
  const baseUrl = `${protocol}://${instance.address}:${instance.port}`;
  return path ? `${baseUrl}${path.startsWith('/') ? path : `/${path}`}` : baseUrl;
}

/**
 * 选择服务实例（负载均衡）
 */
export function selectServiceInstance(
  instances: ServiceInstance[],
  strategy: 'random' | 'round-robin' | 'first' = 'random'
): ServiceInstance | null {
  if (instances.length === 0) {
    return null;
  }

  // 只选择健康的实例
  const healthyInstances = instances.filter(inst => inst.healthy !== false);

  if (healthyInstances.length === 0) {
    // 如果没有健康的实例，返回第一个（降级）
    return instances[0];
  }

  switch (strategy) {
    case 'random':
      return healthyInstances[Math.floor(Math.random() * healthyInstances.length)];
    
    case 'round-robin':
      // 简单的轮询（实际应用中可能需要更复杂的实现）
      return healthyInstances[0];
    
    case 'first':
    default:
      return healthyInstances[0];
  }
}

/**
 * 解析服务标签
 */
export function parseServiceTags(tags: string[] = []): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const tag of tags) {
    if (tag.includes('=')) {
      const [key, ...valueParts] = tag.split('=');
      parsed[key] = valueParts.join('=');
    } else {
      parsed[tag] = 'true';
    }
  }

  return parsed;
}

/**
 * 构建服务标签
 */
export function buildServiceTags(tags: Record<string, string | boolean>): string[] {
  return Object.entries(tags).map(([key, value]) => {
    if (typeof value === 'boolean') {
      return value ? key : `${key}=false`;
    }
    return `${key}=${value}`;
  });
}

/**
 * 验证服务实例
 */
export function validateServiceInstance(instance: ServiceInstance): boolean {
  return !!(
    instance.id &&
    instance.name &&
    instance.address &&
    instance.port &&
    instance.port > 0 &&
    instance.port < 65536
  );
}






































