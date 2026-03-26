/**
 * Consul 服务注册装饰器
 */

import type { ServiceRegistration } from '../types/index.js';
import { ConsulManager } from '../infrastructure/consul-manager.js';
import { ServiceRegistry } from '../services/service-registry.js';

/**
 * 服务注册装饰器选项
 */
export interface ConsulServiceOptions {
  /**
   * 服务名称
   */
  name: string;
  
  /**
   * 服务 ID
   */
  id?: string;
  
  /**
   * 服务标签
   */
  tags?: string[];
  
  /**
   * 服务地址
   */
  address?: string;
  
  /**
   * 服务端口
   */
  port?: number;
  
  /**
   * 服务元数据
   */
  meta?: Record<string, string>;
  
  /**
   * 是否自动注销（在进程退出时）
   */
  autoDeregister?: boolean;
}

/**
 * Consul 服务注册装饰器
 * 
 * 使用示例：
 * ```typescript
 * @ConsulService({
 *   name: 'my-service',
 *   port: 3000,
 *   tags: ['api', 'http']
 * })
 * class MyService {
 *   // ...
 * }
 * ```
 */
export function ConsulService(options: ConsulServiceOptions) {
  return function (target: any) {
    const originalOnInit = target.prototype.onModuleInit;
    const originalOnDestroy = target.prototype.onModuleDestroy;

    target.prototype.onModuleInit = async function () {
      // 调用原始的 onModuleInit
      if (originalOnInit) {
        await originalOnInit.call(this);
      }

      // 注册服务到 Consul
      try {
        const manager = ConsulManager.getInstance();
        const client = manager.getClient();
        const registry = new ServiceRegistry(client);

        const registration: ServiceRegistration = {
          name: options.name,
          id: options.id || options.name,
          tags: options.tags,
          address: options.address,
          port: options.port,
          meta: options.meta,
        };

        await registry.register(registration);
        
        // 保存注册信息以便注销
        this._consulServiceId = registration.id || registration.name;
        this._consulRegistry = registry;
      } catch (error) {
        console.error(`Failed to register service to Consul: ${error}`);
      }
    };

    if (options.autoDeregister !== false) {
      target.prototype.onModuleDestroy = async function () {
        // 注销服务
        if (this._consulServiceId && this._consulRegistry) {
          try {
            await this._consulRegistry.deregister(this._consulServiceId);
          } catch (error) {
            console.error(`Failed to deregister service from Consul: ${error}`);
          }
        }

        // 调用原始的 onModuleDestroy
        if (originalOnDestroy) {
          await originalOnDestroy.call(this);
        }
      };
    }
  };
}






































