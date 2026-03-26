/**
 * @service/cache - 统一的缓存抽象层
 * 
 * 导出所有公共 API
 */

// 类型定义
export * from './types/index.js';

// 适配器
export * from './adapters/index.js';

// 基础设施
export * from './infrastructure/index.js';

// 配置
export * from './config/index.js';

// 装饰器
export * from './decorators/index.js';

// 中间件
export * from './middleware/index.js';

// 便捷导出
export { CacheManager } from './infrastructure/cache-manager.js';
export { CacheAdapterType } from './types/index.js';





