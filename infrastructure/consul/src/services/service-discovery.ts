/**
 * 服务发现
 */

import type { IConsulClient } from '../clients/consul-client.interface.js';
import type { ServiceInstance, ServiceQueryOptions } from '../types/index.js';

/**
 * 服务发现器
 */
export class ServiceDiscovery {
  private client: IConsulClient;

  constructor(client: IConsulClient) {
    this.client = client;
  }

  /**
   * 查询服务实例
   */
  async discover(options: ServiceQueryOptions): Promise<ServiceInstance[]> {
    const result = await this.client.queryService(options);
    
    if (!result.success) {
      throw new Error(`Failed to discover service ${options.service}: ${result.error}`);
    }

    return result.data || [];
  }

  /**
   * 获取健康的服务实例
   */
  async discoverHealthy(serviceName: string, tag?: string): Promise<ServiceInstance[]> {
    return this.discover({
      service: serviceName,
      tag,
      passing: true,
    });
  }

  /**
   * 获取所有服务实例（包括不健康的）
   */
  async discoverAll(serviceName: string, tag?: string): Promise<ServiceInstance[]> {
    return this.discover({
      service: serviceName,
      tag,
      passing: false,
    });
  }

  /**
   * 获取第一个健康的服务实例
   */
  async discoverOne(serviceName: string, tag?: string): Promise<ServiceInstance | null> {
    const instances = await this.discoverHealthy(serviceName, tag);
    return instances.length > 0 ? instances[0] : null;
  }

  /**
   * 获取服务 URL
   */
  async getServiceUrl(serviceName: string, tag?: string, protocol: string = 'http'): Promise<string | null> {
    const instance = await this.discoverOne(serviceName, tag);
    
    if (!instance) {
      return null;
    }

    return `${protocol}://${instance.address}:${instance.port}`;
  }

  /**
   * 列出所有服务
   */
  async listServices(): Promise<Record<string, string[]>> {
    const result = await this.client.listServices();
    
    if (!result.success) {
      throw new Error(`Failed to list services: ${result.error}`);
    }

    return result.data || {};
  }
}






































