/**
 * Consul 管理器（单例）
 */

import type { IConsulClient } from '../clients/consul-client.interface.js';
import { createConsulClient, createConsulConfigFromEnv } from '../clients/index.js';
import type { ConsulClientConfig } from '../types/index.js';

/**
 * Consul 管理器
 */
export class ConsulManager {
  private static instance: ConsulManager | null = null;
  private client: IConsulClient | null = null;
  private config: ConsulClientConfig | null = null;

  private constructor() {
    // 私有构造函数，防止外部实例化
  }

  /**
   * 获取单例实例
   */
  static getInstance(): ConsulManager {
    if (!ConsulManager.instance) {
      ConsulManager.instance = new ConsulManager();
    }
    return ConsulManager.instance;
  }

  /**
   * 创建并初始化管理器
   */
  static async create(config?: ConsulClientConfig): Promise<ConsulManager> {
    const manager = ConsulManager.getInstance();
    await manager.initialize(config);
    return manager;
  }

  /**
   * 初始化管理器
   */
  async initialize(config?: ConsulClientConfig): Promise<void> {
    if (this.client) {
      await this.disconnect();
    }

    this.config = config || createConsulConfigFromEnv();
    this.client = createConsulClient(this.config);
    await this.client.connect();
  }

  /**
   * 获取客户端
   */
  getClient(): IConsulClient {
    if (!this.client) {
      throw new Error('ConsulManager is not initialized. Call initialize() or create() first.');
    }
    return this.client;
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.client !== null && this.client.status === 'connected';
  }

  /**
   * 获取连接状态
   */
  getStatus(): string {
    return this.client?.status || 'disconnected';
  }
}






































