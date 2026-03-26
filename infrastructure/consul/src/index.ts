/**
 * @service/consul - Consul 服务发现、配置管理和健康检查模块
 * 
 * 导出所有公共 API
 */

// 类型定义
export * from './types/index.js';

// 客户端
export * from './clients/index.js';

// 基础设施
export * from './infrastructure/index.js';

// 服务发现和注册
export * from './services/index.js';

// 健康检查
export * from './health/index.js';

// KV 存储
export * from './kv/index.js';

// 配置管理
export * from './config/index.js';

// 适配器
export * from './adapters/index.js';

// 工具函数
export * from './utils/index.js';

// 装饰器
export * from './decorators/index.js';

// 便捷导出
export { ConsulManager } from './infrastructure/consul-manager.js';
export { ConsulRegistry } from './infrastructure/consul-registry.js';
export { ServiceRegistry } from './services/service-registry.js';
export { ServiceDiscovery } from './services/service-discovery.js';
export { ServiceWatcher } from './services/service-watcher.js';
export { HealthCheckManager } from './health/health-check-manager.js';
export { KVStore } from './kv/kv-store.js';
export { KVWatcher } from './kv/kv-watcher.js';
export { ConsulConfigLoader } from './config/consul-config-loader.js';
export { ConsulConfigAdapter } from './adapters/consul-config-adapter.js';
export { createConsulClient, createConsulConfigFromEnv } from './clients/index.js';
export { createConsulConfigFromEnv as createConsulConfigFromEnvForConfig } from './config/consul-config.js';

