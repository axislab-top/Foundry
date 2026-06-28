import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantService } from '@service/tenant';

/**
 * 健康检查服务
 */
@Injectable()
export class HealthService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly tenantService: TenantService,
  ) {}

  /**
   * 检查服务健康状态
   */
  async checkHealth(): Promise<{
    status: string;
    timestamp: string;
    uptime: number;
    database: {
      status: string;
      connected: boolean;
    };
    tenantMembership: {
      status: string;
      healthy: boolean;
    };
  }> {
    let dbStatus = 'disconnected';
    let dbConnected = false;

    try {
      if (this.dataSource.isInitialized) {
        await this.dataSource.query('SELECT 1');
        dbStatus = 'connected';
        dbConnected = true;
      }
    } catch (error) {
      dbStatus = 'error';
      dbConnected = false;
    }

    const tenantHealthy = this.tenantService.isMembershipBackendHealthy();

    return {
      status: dbConnected && tenantHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        status: dbStatus,
        connected: dbConnected,
      },
      tenantMembership: {
        status: tenantHealthy ? 'connected' : 'unavailable',
        healthy: tenantHealthy,
      },
    };
  }
}

