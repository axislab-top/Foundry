/**
 * 配置装饰器
 * 用于在 NestJS 中注入配置值
 */

import { ConfigManager } from '../infrastructure/config-manager.js';
import { ConfigValue } from '../types/index.js';

/**
 * 配置装饰器工厂
 * 用于在 NestJS 中注入配置值
 * 
 * @example
 * ```typescript
 * class MyService {
 *   constructor(
 *     @Config('database.host') private dbHost: string,
 *     @Config('database.port', 5432) private dbPort: number,
 *   ) {}
 * }
 * ```
 */
export function Config(key: string, defaultValue?: ConfigValue): ParameterDecorator {
  return (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) => {
    // 注意：这个装饰器主要用于文档和类型提示
    // 实际注入需要在 NestJS 模块中配置
    // 可以通过 ConfigModule 提供 ConfigService 来实现
  };
}

/**
 * 获取配置值的辅助函数
 * 可以在非依赖注入场景中使用
 */
export function getConfig<T = ConfigValue>(key: string, defaultValue?: T): T {
  const manager = ConfigManager.getInstance();
  return manager.get<T>(key, defaultValue);
}







































