import { Module, Global, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import {
  ConsulManager,
  ServiceRegistry,
  ServiceDiscovery,
  createConsulConfigFromEnv,
  HealthCheckType,
} from '@service/consul';
import { ServiceDiscoveryService } from './service-discovery.service.js';
import { ConfigService } from '../config/config.service.js';

/**
 * 服务发现模块
 * 使用 Consul 进行服务注册和发现
 */
@Global()
@Module({
  providers: [
    {
      provide: 'CONSUL_MANAGER',
      useFactory: async () => {
        // 如果未启用 Consul，返回 null
        if (process.env.CONSUL_ENABLED !== 'true') {
          return null;
        }
        const config = createConsulConfigFromEnv();
        return await ConsulManager.create(config);
      },
    },
    ServiceDiscoveryService,
  ],
  exports: [ServiceDiscoveryService],
})
export class ServiceDiscoveryModule
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ServiceDiscoveryModule.name);
  private consulManager: ConsulManager | null = null;
  private serviceRegistry: ServiceRegistry | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    // 如果未启用 Consul，跳过初始化
    if (process.env.CONSUL_ENABLED !== 'true') {
      return;
    }

    try {
      this.consulManager = ConsulManager.getInstance();
      if (!this.consulManager) {
        this.logger.warn('Consul not available, service discovery disabled');
        return;
      }

      const client = this.consulManager.getClient();
      this.serviceRegistry = new ServiceRegistry(client);

      // 注册 Gateway 服务
      const appConfig = this.configService.getAppConfig();
      const serviceName = process.env.SERVICE_NAME || 'gateway-service';
      const serviceId = `${serviceName}-${process.pid}`;

      await this.serviceRegistry.register({
        name: serviceName,
        id: serviceId,
        address: process.env.SERVICE_ADDRESS || 'localhost',
        port: appConfig.port,
        tags: ['gateway', 'http', 'api'],
        meta: {
          version: process.env.SERVICE_VERSION || '1.0.0',
          environment: appConfig.nodeEnv,
        },
        check: {
          type: HealthCheckType.HTTP,
          http: `http://${process.env.SERVICE_ADDRESS || 'localhost'}:${appConfig.port}/health`,
          interval: '10s',
          timeout: '3s',
          deregisterCriticalServiceAfter: '30s',
        },
      });

      this.logger.log(`Service ${serviceName} registered to Consul`);
    } catch (error) {
      this.logger.error('Failed to register service to Consul:', error);
      // 不阻止应用启动，服务发现是可选的
    }
  }

  async onModuleDestroy() {
    if (this.serviceRegistry) {
      try {
        await this.serviceRegistry.deregisterAll();
        this.logger.log('All services deregistered from Consul');
      } catch (error) {
        this.logger.error('Failed to deregister services from Consul:', error);
      }
    }

    if (this.consulManager) {
      try {
        await this.consulManager.disconnect();
      } catch (error) {
        this.logger.error('Failed to disconnect from Consul:', error);
      }
    }
  }
}










