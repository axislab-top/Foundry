import { ServicesConfig } from '../../../common/config/interfaces/config.interface.js';

/**
 * 服务配置
 */
export interface ServiceConfig {
  name: string;
  baseUrl: string;
  timeout?: number;
}

/**
 * 创建服务配置映射
 */
export function createServiceConfigMap(
  servicesConfig: ServicesConfig,
): Map<string, ServiceConfig> {
  const map = new Map<string, ServiceConfig>();

  map.set('api', {
    name: 'api',
    baseUrl: servicesConfig.apiServiceUrl,
    timeout: 30000,
  });

  map.set('webhooks', {
    name: 'webhooks',
    baseUrl: servicesConfig.webhooksServiceUrl,
    timeout: 30000,
  });

  map.set('worker', {
    name: 'worker',
    baseUrl: servicesConfig.workerServiceUrl,
    timeout: 30000,
  });

  map.set('logging', {
    name: 'logging',
    baseUrl: servicesConfig.loggingServiceUrl,
    timeout: 30000,
  });

  return map;
}


















