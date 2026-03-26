/**
 * Consul 客户端工厂
 */

import type { ConsulClientConfig } from '../types/index.js';
import { ConsulClient } from './consul-client.js';
import type { IConsulClient } from './consul-client.interface.js';

/**
 * 从环境变量创建配置
 */
export function createConsulConfigFromEnv(): ConsulClientConfig {
  return {
    host: process.env.CONSUL_HOST || 'localhost',
    port: parseInt(process.env.CONSUL_PORT || '8500', 10),
    secure: process.env.CONSUL_SECURE === 'true',
    token: process.env.CONSUL_TOKEN,
    datacenter: process.env.CONSUL_DATACENTER,
    defaultKeyPrefix: process.env.CONSUL_KV_PREFIX || 'config/',
    timeout: process.env.CONSUL_TIMEOUT ? parseInt(process.env.CONSUL_TIMEOUT, 10) : undefined,
    promisify: true,
  };
}

/**
 * 创建 Consul 客户端
 */
export function createConsulClient(config?: ConsulClientConfig): IConsulClient {
  const finalConfig = config || createConsulConfigFromEnv();
  return new ConsulClient(finalConfig);
}






































