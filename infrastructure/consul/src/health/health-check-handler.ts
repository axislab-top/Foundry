/**
 * 健康检查处理器实现
 */

import { HealthCheckStatusType } from '../types/index.js';
import type { HealthCheckResult } from '../types/index.js';
import type { IHealthCheckHandler } from './health-check.interface.js';

/**
 * HTTP 健康检查处理器
 */
export class HttpHealthCheckHandler implements IHealthCheckHandler {
  readonly name: string;
  private url: string;
  private timeout: number;

  constructor(name: string, url: string, timeout: number = 5000) {
    this.name = name;
    this.url = url;
    this.timeout = timeout;
  }

  async check(): Promise<HealthCheckResult> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(this.url, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Node 的 fetch 类型在不同 tsconfig/lib 组合下可能不一致，这里以运行时字段为准
      const r: any = response as any;
      const healthy = !!r.ok;
      const status: HealthCheckStatusType = healthy
        ? HealthCheckStatusType.PASSING
        : HealthCheckStatusType.CRITICAL;

      return {
        healthy,
        status,
        message: `HTTP ${r.status} ${r.statusText}`,
        data: {
          statusCode: r.status,
          statusText: r.statusText,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        status: HealthCheckStatusType.CRITICAL,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * TCP 健康检查处理器
 */
export class TcpHealthCheckHandler implements IHealthCheckHandler {
  readonly name: string;
  private host: string;
  private port: number;
  private timeout: number;

  constructor(name: string, host: string, port: number, timeout: number = 5000) {
    this.name = name;
    this.host = host;
    this.port = port;
    this.timeout = timeout;
  }

  async check(): Promise<HealthCheckResult> {
    const net = await import('net');
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let resolved = false;

      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          resolve({
            healthy: false,
            status: 'critical' as HealthCheckStatusType,
            message: 'Connection timeout',
          });
        }
      }, this.timeout);

      socket.on('connect', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          socket.destroy();
          resolve({
            healthy: true,
            status: HealthCheckStatusType.PASSING,
            message: 'TCP connection successful',
          });
        }
      });

      socket.on('error', (error: Error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          resolve({
            healthy: false,
            status: HealthCheckStatusType.CRITICAL,
            message: error.message,
          });
        }
      });

      socket.connect(this.port, this.host);
    });
  }
}

/**
 * 自定义健康检查处理器
 */
export class CustomHealthCheckHandler implements IHealthCheckHandler {
  readonly name: string;
  private checkFn: () => Promise<HealthCheckResult>;

  constructor(name: string, checkFn: () => Promise<HealthCheckResult>) {
    this.name = name;
    this.checkFn = checkFn;
  }

  async check(): Promise<HealthCheckResult> {
    return this.checkFn();
  }
}

