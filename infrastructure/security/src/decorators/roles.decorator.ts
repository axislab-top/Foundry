import 'reflect-metadata';
/**
 * 角色装饰器
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

export const ROLES_KEY = 'roles';

/**
 * 指定所需角色
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

