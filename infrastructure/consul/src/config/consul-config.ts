/**
 * Consul 配置
 */

import type { ConsulClientConfig } from '../types/index.js';

/**
 * Consul 配置选项
 */
export interface ConsulConfigOptions extends ConsulClientConfig {
  /**
   * 配置键前缀
   */
  configPrefix?: string;
  
  /**
   * 是否启用配置监听
   */
  watchConfig?: boolean;
  
  /**
   * 配置监听间隔（毫秒）
   */
  watchInterval?: number;
}

/**
 * 从环境变量创建配置
 */
export function createConsulConfigFromEnv(): ConsulConfigOptions {
  return {
    host: process.env.CONSUL_HOST || 'localhost',
    port: parseInt(process.env.CONSUL_PORT || '8500', 10),
    secure: process.env.CONSUL_SECURE === 'true',
    token: process.env.CONSUL_TOKEN,
    datacenter: process.env.CONSUL_DATACENTER,
    configPrefix: process.env.CONSUL_KV_PREFIX || 'config/',
    watchConfig: process.env.CONSUL_KV_WATCH_ENABLED === 'true',
    watchInterval: process.env.CONSUL_KV_WATCH_INTERVAL
      ? parseInt(process.env.CONSUL_KV_WATCH_INTERVAL, 10)
      : 5000,
  };
}






































