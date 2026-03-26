import 'reflect-metadata';
/**
 * 作用域装饰器（OAuth2）
 */

// 注意：如果使用 NestJS，需要安装 @nestjs/common
let SetMetadata: (key: string, value: any) => any;

try {
  const nestCommon = require('@nestjs/common');
  SetMetadata = nestCommon.SetMetadata;
} catch {
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

export const SCOPES_KEY = 'scopes';

/**
 * 指定所需作用域
 */
export const RequireScope = (...scopes: string[]) => SetMetadata(SCOPES_KEY, scopes);

