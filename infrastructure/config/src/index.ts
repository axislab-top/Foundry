/**
 * @service/config - 统一的配置管理模块
 * 
 * 导出所有公共 API
 */

// 类型定义
export * from './types/index.js';

// 适配器
export * from './adapters/index.js';

// 验证器
export * from './validators/index.js';

// 基础设施
export * from './infrastructure/index.js';

// 工具函数
export * from './utils/index.js';

// 装饰器
export * from './decorators/index.js';

// 便捷导出
export { ConfigManager } from './infrastructure/config-manager.js';
export { ConfigAdapterType, ConfigPriority } from './types/index.js';







































