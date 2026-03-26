/**
 * 缓存装饰器
 * 
 * 提供方法级别的缓存装饰器
 */

import { CacheAdapter } from '../types/index.js';
import { CacheManager } from '../infrastructure/cache-manager.js';

/**
 * 缓存装饰器选项
 */
export interface CacheDecoratorOptions {
  /**
   * 缓存键前缀
   */
  keyPrefix?: string;

  /**
   * TTL（秒）
   */
  ttl?: number;

  /**
   * 缓存适配器类型（可选，使用默认适配器）
   */
  adapterType?: import('../types').CacheAdapterType;

  /**
   * 键生成函数
   */
  keyGenerator?: (...args: any[]) => string;
}

/**
 * 缓存方法结果装饰器
 * 
 * @example
 * ```typescript
 * class UserService {
 *   @Cache({ ttl: 3600, keyPrefix: 'user' })
 *   async getUserById(id: string): Promise<User> {
 *     // 方法实现
 *   }
 * }
 * ```
 */
export function Cache(options: CacheDecoratorOptions = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const { keyPrefix, ttl, adapterType, keyGenerator } = options;

    descriptor.value = async function (...args: any[]) {
      const cacheManager = CacheManager.getInstance();
      const adapter = cacheManager.getAdapter(adapterType);

      // 生成缓存键
      let cacheKey: string;
      if (keyGenerator) {
        cacheKey = keyGenerator(...args);
      } else {
        const keyParts = [keyPrefix || target.constructor.name, propertyKey, ...args.map(String)];
        cacheKey = keyParts.join(':');
      }

      // 尝试从缓存获取
      const cached = await adapter.get(cacheKey);
      if (cached !== null) {
        return cached;
      }

      // 执行原始方法
      const result = await originalMethod.apply(this, args);

      // 存储到缓存
      if (result !== null && result !== undefined) {
        await adapter.set(cacheKey, result, ttl);
      }

      return result;
    };

    return descriptor;
  };
}

/**
 * 缓存失效装饰器
 * 
 * 在方法执行后清除指定的缓存键
 * 
 * @example
 * ```typescript
 * class UserService {
 *   @CacheInvalidate({ keyPrefix: 'user', keyPattern: 'user:{0}' })
 *   async updateUser(id: string, data: UserData): Promise<User> {
 *     // 更新用户后，清除缓存
 *   }
 * }
 * ```
 */
export interface CacheInvalidateOptions {
  /**
   * 键模式，使用 {0}, {1} 等作为参数占位符
   */
  keyPattern: string;

  /**
   * 缓存适配器类型
   */
  adapterType?: import('../types').CacheAdapterType;
}

export function CacheInvalidate(options: CacheInvalidateOptions) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const { keyPattern, adapterType } = options;

    descriptor.value = async function (...args: any[]) {
      // 执行原始方法
      const result = await originalMethod.apply(this, args);

      // 生成缓存键
      let cacheKey = keyPattern;
      args.forEach((arg, index) => {
        cacheKey = cacheKey.replace(`{${index}}`, String(arg));
      });

      // 清除缓存
      const cacheManager = CacheManager.getInstance();
      const adapter = cacheManager.getAdapter(adapterType);
      await adapter.delete(cacheKey);

      return result;
    };

    return descriptor;
  };
}





