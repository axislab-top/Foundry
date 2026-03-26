import 'reflect-metadata';
/**
 * 认证装饰器
 */

// 注意：如果使用 NestJS，需要安装 @nestjs/common
// 这里提供一个兼容的实现
let SetMetadata: (key: string, value: any) => any;

try {
  const nestCommon = require('@nestjs/common');
  SetMetadata = nestCommon.SetMetadata;
} catch {
  // 如果不在 NestJS 环境中，提供一个简单的实现
  SetMetadata = (key: string, value: any) => {
    return (target: any, propertyKey?: string, descriptor?: PropertyDescriptor) => {
      if (descriptor) {
        Reflect.defineMetadata(key, value, descriptor.value);
      } else if (propertyKey) {
        Reflect.defineMetadata(key, value, target, propertyKey);
      } else {
        Reflect.defineMetadata(key, value, target);
      }
    };
  };
}

export const IS_PUBLIC_KEY = 'isPublic';
export const AUTH_STRATEGY_KEY = 'authStrategy';

/**
 * 标记路由为公开（不需要认证）
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * 指定认证策略
 */
export const Auth = (strategy?: string) => SetMetadata(AUTH_STRATEGY_KEY, strategy || 'jwt');

