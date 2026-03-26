/**
 * 发布事件装饰器
 */

import type { BaseEvent } from '@contracts/events';

/**
 * 发布事件选项
 */
export interface PublishEventOptions {
  routingKey?: string;
  exchange?: string;
  persistent?: boolean;
}

/**
 * 发布事件装饰器（用于类方法）
 * 
 * @example
 * ```typescript
 * @PublishEvent({ routingKey: 'user.created' })
 * async createUser(dto: CreateUserDto): Promise<User> {
 *   // 方法返回值会自动发布为事件
 * }
 * ```
 */
export function PublishEvent(options?: PublishEventOptions) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args);

      // 如果返回的是事件，自动发布
      if (result && typeof result === 'object' && 'eventType' in result) {
        const messagingService = (this as any).messagingService;
        if (messagingService) {
          await messagingService.publish(result as BaseEvent, options);
        }
      }

      return result;
    };

    return descriptor;
  };
}































