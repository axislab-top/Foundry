import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import {
  ConsulManager,
  ServiceDiscovery,
  ServiceWatcher,
} from '@service/consul';
import type { ServiceInstance } from '@service/consul';

/**
 * 服务发现服务
 * 提供服务发现和负载均衡功能
 */
@Injectable()
export class ServiceDiscoveryService implements OnModuleInit {
  private readonly logger = new Logger(ServiceDiscoveryService.name);
  private consulManager: ConsulManager | null = null;
  private serviceDiscovery: ServiceDiscovery | null = null;
  private serviceWatchers: Map<string, () => void> = new Map();
  private serviceCache: Map<string, ServiceInstance[]> = new Map();

  constructor(@Inject('CONSUL_MANAGER') consulManager: ConsulManager | null) {
    this.consulManager = consulManager;
  }

  async onModuleInit() {
    if (!this.consulManager) {
      return;
    }

    this.serviceDiscovery = new ServiceDiscovery(this.consulManager.getClient());
  }

  /**
   * 发现服务实例
   */
  async discoverService(
    serviceName: string,
    tag?: string,
  ): Promise<ServiceInstance[]> {
    if (!this.serviceDiscovery) {
      // 如果 Consul 未启用，返回空数组
      return [];
    }

    try {
      const instances = tag
        ? await this.serviceDiscovery.discoverHealthy(serviceName, tag)
        : await this.serviceDiscovery.discoverHealthy(serviceName);

      // 更新缓存
      this.serviceCache.set(serviceName, instances);
      return instances;
  } catch (error) {
      this.logger.error(`Failed to discover service ${serviceName}:`, error);
      // 返回缓存的服务实例（如果有）
      return this.serviceCache.get(serviceName) || [];
    }
  }

  /**
   * 获取服务 URL（负载均衡）
   */
  async getServiceUrl(
    serviceName: string,
    tag?: string,
    protocol: 'http' | 'https' = 'http',
  ): Promise<string | null> {
    const instances = await this.discoverService(serviceName, tag);

    if (instances.length === 0) {
      return null;
    }

    // 简单的轮询负载均衡
    const instance = instances[Math.floor(Math.random() * instances.length)];
    return `${protocol}://${instance.address}:${instance.port}`;
  }

  /**
   * 监听服务变化
   */
  watchService(
    serviceName: string,
    tag: string | undefined,
    onUpdate: (instances: ServiceInstance[]) => void,
  ): () => void {
    if (!this.serviceDiscovery || !this.consulManager) {
      // 如果 Consul 未启用，返回空函数
      return () => {};
    }

    const watcher = new ServiceWatcher(this.consulManager.getClient());
    const watchKey = `${serviceName}:${tag || 'default'}`;

    // 如果已经在监听，先停止
    if (this.serviceWatchers.has(watchKey)) {
      this.serviceWatchers.get(watchKey)!();
    }

    const stopWatch = watcher.watch({
      service: serviceName,
      tag,
      interval: 5000, // 5 秒检查一次
        onUpdate: (instances) => {
        this.serviceCache.set(serviceName, instances);
        onUpdate(instances);
      },
      onError: (error) => {
        this.logger.error(`Service watch error for ${serviceName}:`, error);
      },
    });

    this.serviceWatchers.set(watchKey, stopWatch);
    return stopWatch;
  }

  /**
   * 停止监听所有服务
   */
  stopAllWatchers(): void {
    this.serviceWatchers.forEach((stopWatch) => stopWatch());
    this.serviceWatchers.clear();
  }

  /**
   * 检查服务发现是否可用
   */
  isAvailable(): boolean {
    return this.consulManager !== null && this.serviceDiscovery !== null;
  }
}














