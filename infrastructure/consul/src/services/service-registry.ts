/**
 * 服务注册
 */

import type { IConsulClient } from '../clients/consul-client.interface.js';
import type { ServiceRegistration } from '../types/index.js';

/**
 * 服务注册器
 */
export class ServiceRegistry {
  private client: IConsulClient;
  private registeredServices: Set<string> = new Set();

  constructor(client: IConsulClient) {
    this.client = client;
  }

  /**
   * 注册服务
   */
  async register(registration: ServiceRegistration): Promise<void> {
    const serviceId = registration.id || registration.name;
    
    const result = await this.client.registerService(registration);
    
    if (!result.success) {
      throw new Error(`Failed to register service ${serviceId}: ${result.error}`);
    }

    this.registeredServices.add(serviceId);
  }

  /**
   * 注销服务
   */
  async deregister(serviceId: string): Promise<void> {
    const result = await this.client.deregisterService(serviceId);
    
    if (!result.success) {
      throw new Error(`Failed to deregister service ${serviceId}: ${result.error}`);
    }

    this.registeredServices.delete(serviceId);
  }

  /**
   * 注销所有服务
   */
  async deregisterAll(): Promise<void> {
    const serviceIds = Array.from(this.registeredServices);
    
    await Promise.allSettled(
      serviceIds.map(serviceId => this.deregister(serviceId))
    );
    
    this.registeredServices.clear();
  }

  /**
   * 检查服务是否已注册
   */
  isRegistered(serviceId: string): boolean {
    return this.registeredServices.has(serviceId);
  }

  /**
   * 获取已注册的服务 ID 列表
   */
  getRegisteredServiceIds(): string[] {
    return Array.from(this.registeredServices);
  }
}






































