/**
 * Consul 健康检查装饰器
 */

import { HealthCheckStatusType } from '../types/index.js';
import type { HealthCheckResult } from '../types/index.js';
import { ConsulManager } from '../infrastructure/consul-manager.js';
import { HealthCheckManager } from '../health/health-check-manager.js';
import { CustomHealthCheckHandler } from '../health/health-check-handler.js';

/**
 * 健康检查装饰器选项
 */
export interface ConsulHealthOptions {
  /**
   * 检查名称
   */
  name?: string;
  
  /**
   * 检查间隔（毫秒）
   */
  interval?: number;
}

/**
 * Consul 健康检查装饰器
 * 
 * 使用示例：
 * ```typescript
 * class MyService {
 *   @ConsulHealth({ name: 'database', interval: 5000 })
 *   async checkDatabase() {
 *     // 执行健康检查
 *     return { healthy: true, status: 'passing' };
 *   }
 * }
 * ```
 */
export function ConsulHealth(options: ConsulHealthOptions = {}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const checkName = options.name || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      // 执行原始方法
      const result = await originalMethod.apply(this, args);

      // 注册健康检查处理器
      try {
        const manager = ConsulManager.getInstance();
        const client = manager.getClient();
        const healthManager = new HealthCheckManager(client);

        const handler = new CustomHealthCheckHandler(checkName, async () => {
          if (typeof result === 'object' && result !== null && 'healthy' in result) {
            return result as HealthCheckResult;
          }
          
          // 如果返回值是布尔值，转换为 HealthCheckResult
          if (typeof result === 'boolean') {
            return {
              healthy: result,
              status: result ? HealthCheckStatusType.PASSING : HealthCheckStatusType.CRITICAL,
            };
          }

          // 默认认为健康
          return {
            healthy: true,
            status: HealthCheckStatusType.PASSING,
          };
        });

        healthManager.register(handler);

        // 如果设置了间隔，启动 TTL 检查
        if (options.interval) {
          healthManager.startTTLCheck(checkName, options.interval, handler);
        }
      } catch (error) {
        console.error(`Failed to register health check: ${error}`);
      }

      return result;
    };

    return descriptor;
  };
}









