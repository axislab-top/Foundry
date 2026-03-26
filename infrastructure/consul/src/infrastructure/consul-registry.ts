/**
 * Consul 注册表
 */

import type { IConsulClient } from '../clients/consul-client.interface.js';
import type { ServiceRegistration } from '../types/index.js';

/**
 * 已注册的服务信息
 */
interface RegisteredService {
  registration: ServiceRegistration;
  registeredAt: Date;
}

/**
 * Consul 注册表
 */
export class ConsulRegistry {
  private client: IConsulClient;
  private registeredServices: Map<string, RegisteredService> = new Map();

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
      throw new Error(`Failed to register service: ${result.error}`);
    }

    this.registeredServices.set(serviceId, {
      registration,
      registeredAt: new Date(),
    });
  }

  /**
   * 注销服务
   */
  async deregister(serviceId: string): Promise<void> {
    const result = await this.client.deregisterService(serviceId);
    
    if (!result.success) {
      throw new Error(`Failed to deregister service: ${result.error}`);
    }

    this.registeredServices.delete(serviceId);
  }

  /**
   * 注销所有服务
   */
  async deregisterAll(): Promise<void> {
    const serviceIds = Array.from(this.registeredServices.keys());
    
    await Promise.all(
      serviceIds.map(serviceId => this.deregister(serviceId))
    );
  }

  /**
   * 获取已注册的服务列表
   */
  getRegisteredServices(): ServiceRegistration[] {
    return Array.from(this.registeredServices.values()).map(
      item => item.registration
    );
  }

  /**
   * 检查服务是否已注册
   */
  isRegistered(serviceId: string): boolean {
    return this.registeredServices.has(serviceId);
  }

  /**
   * 获取服务注册信息
   */
  getService(serviceId: string): ServiceRegistration | undefined {
    return this.registeredServices.get(serviceId)?.registration;
  }
}






































