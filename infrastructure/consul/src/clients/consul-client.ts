/**
 * Consul 客户端实现
 */

import { createRequire } from 'module';
import type { IConsulClient } from './consul-client.interface.js';

// 使用 createRequire 在 ESM 中导入 CommonJS 包
const require = createRequire(import.meta.url);
const consul = require('consul');
import {
  ConsulClientConfig,
  ConsulConnectionStatus,
  ConsulResult,
  ServiceRegistration,
  ServiceInfo,
  ServiceInstance,
  ServiceQueryOptions,
  KVEntry,
  KVOptions,
  KVGetOptions,
  KVSetOptions,
  HealthCheckStatus,
} from '../types/index.js';

/**
 * Consul 客户端实现
 */
export class ConsulClient implements IConsulClient {
  private consulInstance: any | null = null;
  private config: ConsulClientConfig;
  private _status: ConsulConnectionStatus = ConsulConnectionStatus.DISCONNECTED;

  constructor(config: ConsulClientConfig) {
    this.config = {
      host: 'localhost',
      port: 8500,
      secure: false,
      promisify: true,
      ...config,
    };
  }

  /**
   * 获取连接状态
   */
  get status(): string {
    return this._status;
  }

  /**
   * 连接 Consul
   */
  async connect(): Promise<void> {
    if (this._status === ConsulConnectionStatus.CONNECTED) {
      return;
    }

    try {
      this._status = ConsulConnectionStatus.CONNECTING;
      
      this.consulInstance = new consul({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        defaults: {
          token: this.config.token,
          dc: this.config.datacenter,
        },
        promisify: this.config.promisify,
      });

      // 测试连接
      await this.consulInstance.agent.self();
      
      this._status = ConsulConnectionStatus.CONNECTED;
    } catch (error) {
      this._status = ConsulConnectionStatus.ERROR;
      throw new Error(`Failed to connect to Consul: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    this._status = ConsulConnectionStatus.DISCONNECTED;
    this.consulInstance = null;
  }

  /**
   * 确保已连接
   */
  private ensureConnected(): void {
    if (!this.consulInstance || this._status !== ConsulConnectionStatus.CONNECTED) {
      throw new Error('Consul client is not connected. Call connect() first.');
    }
  }

  /**
   * 执行操作并返回结果
   */
  private async executeOperation<T>(
    operation: () => Promise<T>
  ): Promise<ConsulResult<T>> {
    const startTime = Date.now();
    
    try {
      this.ensureConnected();
      const data = await operation();
      const responseTime = Date.now() - startTime;
      
      return {
        success: true,
        data,
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        responseTime,
      };
    }
  }

  /**
   * 注册服务
   */
  async registerService(registration: ServiceRegistration): Promise<ConsulResult<void>> {
    return this.executeOperation(async () => {
      if (!this.consulInstance) throw new Error('Not connected');
      
      const serviceDef: any = {
        name: registration.name,
        id: registration.id || registration.name,
        tags: registration.tags || [],
        address: registration.address,
        port: registration.port,
        meta: registration.meta || {},
      };

      // 处理健康检查
      if (registration.check) {
        serviceDef.check = this.formatHealthCheck(registration.check);
      } else if (registration.checks && registration.checks.length > 0) {
        serviceDef.checks = registration.checks.map(check => this.formatHealthCheck(check));
      }

      await this.consulInstance.agent.service.register(serviceDef);
    });
  }

  /**
   * 格式化健康检查配置
   */
  private formatHealthCheck(check: any): any {
    const formatted: any = {
      interval: check.interval || '10s',
      timeout: check.timeout || '3s',
    };

    if (check.deregisterCriticalServiceAfter) {
      formatted.deregister_critical_service_after = check.deregisterCriticalServiceAfter;
    }

    switch (check.type) {
      case 'http':
        formatted.http = check.http;
        if (check.method) formatted.method = check.method;
        if (check.header) formatted.header = check.header;
        if (check.tlsSkipVerify !== undefined) formatted.tls_skip_verify = check.tlsSkipVerify;
        break;
      case 'tcp':
        formatted.tcp = check.tcp;
        break;
      case 'script':
        formatted.args = check.args || [check.script];
        break;
      case 'ttl':
        formatted.ttl = check.ttl;
        if (check.status) formatted.status = check.status;
        break;
      case 'grpc':
        formatted.grpc = check.http; // gRPC 使用 http 字段
        if (check.tlsSkipVerify !== undefined) formatted.tls_skip_verify = check.tlsSkipVerify;
        break;
    }

    if (check.id) formatted.id = check.id;
    if (check.name) formatted.name = check.name;

    return formatted;
  }

  /**
   * 注销服务
   */
  async deregisterService(serviceId: string): Promise<ConsulResult<void>> {
    return this.executeOperation(async () => {
      if (!this.consulInstance) throw new Error('Not connected');
      await this.consulInstance.agent.service.deregister(serviceId);
    });
  }

  /**
   * 获取服务信息
   */
  async getService(serviceId: string): Promise<ConsulResult<ServiceInfo>> {
    return this.executeOperation(async () => {
      if (!this.consulInstance) throw new Error('Not connected');
      const services = await this.consulInstance.agent.service.list();
      const service = services[serviceId];
      
      if (!service) {
        throw new Error(`Service ${serviceId} not found`);
      }
      
      return service as ServiceInfo;
    });
  }

  /**
   * 查询服务实例
   */
  async queryService(options: ServiceQueryOptions): Promise<ConsulResult<ServiceInstance[]>> {
    return this.executeOperation(async () => {
      if (!this.consulInstance) throw new Error('Not connected');
      
      const queryOptions: any = {
        service: options.service,
        passing: options.passing !== false,
      };
      
      if (options.tag) queryOptions.tag = options.tag;
      if (options.dc) queryOptions.dc = options.dc;
      if (options.near) queryOptions.near = options.near;

      const result = await this.consulInstance.health.service(queryOptions);
      
      return result.map((item: any) => ({
        id: item.Service?.ID || '',
        name: item.Service?.Service || '',
        address: item.Service?.Address || item.Node?.Address || '',
        port: item.Service?.Port || 0,
        tags: item.Service?.Tags || [],
        meta: item.Service?.Meta || {},
        healthy: item.Checks?.every((check: any) => check.Status === 'passing') || false,
        node: item.Node ? {
          ID: item.Node.ID,
          Address: item.Node.Address,
          Meta: item.Node.Meta,
        } : undefined,
      })) as ServiceInstance[];
    });
  }

  /**
   * 获取所有服务
   */
  async listServices(): Promise<ConsulResult<Record<string, string[]>>> {
    return this.executeOperation(async () => {
      if (!this.consulInstance) throw new Error('Not connected');
      return await this.consulInstance.agent.service.list();
    });
  }

  /**
   * 设置 KV 值
   */
  async setKV(options: KVOptions): Promise<ConsulResult<boolean>> {
    return this.executeOperation(async () => {
      if (!this.consulInstance) throw new Error('Not connected');
      
      let value: string;
      if (typeof options.value === 'string') {
        value = options.value;
      } else if (Buffer.isBuffer(options.value)) {
        value = options.value.toString('utf8');
      } else if (typeof options.value === 'object') {
        value = JSON.stringify(options.value);
      } else {
        value = String(options.value);
      }

      const setOptions: any = {
        key: options.key,
        value,
      };

      if (options.setOptions) {
        if (options.setOptions.flags !== undefined) setOptions.flags = options.setOptions.flags;
        if (options.setOptions.cas !== undefined) setOptions.cas = options.setOptions.cas;
        if (options.setOptions.acquire !== undefined) setOptions.acquire = options.setOptions.acquire;
        if (options.setOptions.release !== undefined) setOptions.release = options.setOptions.release;
        if (options.setOptions.dc) setOptions.dc = options.setOptions.dc;
      }

      return await this.consulInstance.kv.set(setOptions);
    });
  }

  /**
   * 获取 KV 值
   */
  async getKV(options: KVGetOptions): Promise<ConsulResult<KVEntry | KVEntry[] | null>> {
    return this.executeOperation(async () => {
      if (!this.consulInstance) throw new Error('Not connected');
      
      const getOptions: any = {};
      if (options.recurse !== undefined) getOptions.recurse = options.recurse;
      if (options.dc) getOptions.dc = options.dc;
      if (options.raw !== undefined) getOptions.raw = options.raw;
      if (options.key) getOptions.key = options.key;

      const result = await this.consulInstance.kv.get(getOptions);
      return result as KVEntry | KVEntry[] | null;
    });
  }

  /**
   * 删除 KV 值
   */
  async deleteKV(key: string, options?: { recurse?: boolean; dc?: string }): Promise<ConsulResult<boolean>> {
    return this.executeOperation(async () => {
      if (!this.consulInstance) throw new Error('Not connected');
      
      const deleteOptions: any = { key };
      if (options?.recurse) deleteOptions.recurse = true;
      if (options?.dc) deleteOptions.dc = options.dc;

      return await this.consulInstance.kv.del(deleteOptions);
    });
  }

  /**
   * 更新健康检查状态（TTL）
   */
  async updateHealthCheck(checkId: string, status: string, output?: string): Promise<ConsulResult<void>> {
    return this.executeOperation(async () => {
      if (!this.consulInstance) throw new Error('Not connected');
      await this.consulInstance.agent.check.update({
        id: checkId,
        status,
        output: output || '',
      });
    });
  }

  /**
   * 获取节点健康检查
   */
  async getNodeHealthChecks(node: string): Promise<ConsulResult<HealthCheckStatus[]>> {
    return this.executeOperation(async () => {
      if (!this.consulInstance) throw new Error('Not connected');
      const checks = await this.consulInstance.health.node({ node });
      return checks.map((check: any) => ({
        CheckID: check.CheckID,
        Name: check.Name,
        Status: check.Status as any,
        Output: check.Output,
        ServiceID: check.ServiceID,
        ServiceName: check.ServiceName,
        Node: check.Node,
      })) as HealthCheckStatus[];
    });
  }

  /**
   * 获取服务健康检查
   */
  async getServiceHealthChecks(
    service: string,
    options?: { passing?: boolean; dc?: string }
  ): Promise<ConsulResult<HealthCheckStatus[]>> {
    return this.executeOperation(async () => {
      if (!this.consulInstance) throw new Error('Not connected');
      
      const queryOptions: any = { service };
      if (options?.passing !== undefined) queryOptions.passing = options.passing;
      if (options?.dc) queryOptions.dc = options.dc;

      const result = await this.consulInstance.health.service(queryOptions);
      
      const checks: HealthCheckStatus[] = [];
      result.forEach((item: any) => {
        if (item.Checks) {
          item.Checks.forEach((check: any) => {
            checks.push({
              CheckID: check.CheckID,
              Name: check.Name,
              Status: check.Status as any,
              Output: check.Output,
              ServiceID: check.ServiceID,
              ServiceName: check.ServiceName,
              Node: check.Node,
            });
          });
        }
      });

      return checks;
    });
  }
}









