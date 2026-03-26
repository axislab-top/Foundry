/**
 * 健康检查管理器
 */

import type { IConsulClient } from '../clients/consul-client.interface.js';
import type { HealthCheckStatus, HealthCheckStatusType } from '../types/index.js';
import type { IHealthCheckHandler } from './health-check.interface.js';

/**
 * 健康检查管理器
 */
export class HealthCheckManager {
  private client: IConsulClient;
  private handlers: Map<string, IHealthCheckHandler> = new Map();
  private ttlChecks: Map<string, NodeJS.Timeout> = new Map();

  constructor(client: IConsulClient) {
    this.client = client;
  }

  /**
   * 注册健康检查处理器
   */
  register(handler: IHealthCheckHandler): void {
    this.handlers.set(handler.name, handler);
  }

  /**
   * 注销健康检查处理器
   */
  unregister(name: string): void {
    this.handlers.delete(name);
    this.stopTTLCheck(name);
  }

  /**
   * 执行所有健康检查
   */
  async checkAll(): Promise<Map<string, HealthCheckStatus>> {
    const results = new Map<string, HealthCheckStatus>();
    
    for (const [name, handler] of this.handlers.entries()) {
      try {
        const result = await handler.check();
        results.set(name, {
          CheckID: name,
          Name: name,
          Status: result.status,
          Output: result.message || JSON.stringify(result.data),
        });
      } catch (error) {
        results.set(name, {
          CheckID: name,
          Name: name,
          Status: 'critical' as HealthCheckStatusType,
          Output: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    return results;
  }

  /**
   * 执行单个健康检查
   */
  async check(name: string): Promise<HealthCheckStatus | null> {
    const handler = this.handlers.get(name);
    if (!handler) {
      return null;
    }

    try {
      const result = await handler.check();
      return {
        CheckID: name,
        Name: name,
        Status: result.status,
        Output: result.message || JSON.stringify(result.data),
      };
    } catch (error) {
      return {
        CheckID: name,
        Name: name,
        Status: 'critical' as HealthCheckStatusType,
        Output: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 更新 TTL 健康检查状态
   */
  async updateTTLCheck(checkId: string, status: HealthCheckStatusType, output?: string): Promise<void> {
    const result = await this.client.updateHealthCheck(checkId, status, output);
    
    if (!result.success) {
      throw new Error(`Failed to update TTL check ${checkId}: ${result.error}`);
    }
  }

  /**
   * 启动 TTL 健康检查
   */
  startTTLCheck(checkId: string, ttl: number, handler: IHealthCheckHandler): void {
    this.stopTTLCheck(checkId);
    this.register(handler);

    const interval = Math.max(ttl / 2, 1000); // 至少每 TTL/2 检查一次
    
    const timer = setInterval(async () => {
      try {
        const result = await handler.check();
        await this.updateTTLCheck(checkId, result.status, result.message);
      } catch (error) {
        await this.updateTTLCheck(
          checkId,
          'critical' as HealthCheckStatusType,
          error instanceof Error ? error.message : String(error)
        );
      }
    }, interval);

    this.ttlChecks.set(checkId, timer);
  }

  /**
   * 停止 TTL 健康检查
   */
  stopTTLCheck(checkId: string): void {
    const timer = this.ttlChecks.get(checkId);
    if (timer) {
      clearInterval(timer);
      this.ttlChecks.delete(checkId);
    }
  }

  /**
   * 停止所有 TTL 健康检查
   */
  stopAllTTLChecks(): void {
    for (const [checkId, timer] of this.ttlChecks.entries()) {
      clearInterval(timer);
    }
    this.ttlChecks.clear();
  }

  /**
   * 获取节点健康检查
   */
  async getNodeHealthChecks(node: string): Promise<HealthCheckStatus[]> {
    const result = await this.client.getNodeHealthChecks(node);
    
    if (!result.success) {
      throw new Error(`Failed to get node health checks: ${result.error}`);
    }

    return result.data || [];
  }

  /**
   * 获取服务健康检查
   */
  async getServiceHealthChecks(service: string, passing?: boolean): Promise<HealthCheckStatus[]> {
    const result = await this.client.getServiceHealthChecks(service, { passing });
    
    if (!result.success) {
      throw new Error(`Failed to get service health checks: ${result.error}`);
    }

    return result.data || [];
  }
}






































