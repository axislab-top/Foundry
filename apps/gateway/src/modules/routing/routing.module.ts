import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '../../common/config/config.module.js';
import { ServiceDiscoveryModule } from '../../common/service-discovery/service-discovery.module.js';
import { CacheModule } from '../../common/cache/cache.module.js';
import { ResilienceModule } from '../../common/resilience/resilience.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { Route } from './entities/route.entity.js';
import { RoutingService } from './routing.service.js';
import { DynamicRoutesService } from './services/dynamic-routes.service.js';
import { BaseProxyService } from './proxies/base-proxy.service.js';
import { ApiProxyService } from './proxies/api-proxy.service.js';
import { ApiRpcProxyService } from './proxies/api-rpc-proxy.service.js';
import { WebhooksProxyService } from './proxies/webhooks-proxy.service.js';
import { WebhooksRpcProxyService } from './proxies/webhooks-rpc-proxy.service.js';
import { WorkerProxyService } from './proxies/worker-proxy.service.js';
import { RoutesController } from './routes.controller.js';
import { ProxyController } from './proxy.controller.js';
import { RoutesInitializerService } from './services/routes-initializer.service.js';

/**
 * 路由模块
 * 支持服务发现和负载均衡
 */
@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([Route]),
    ConfigModule,
    ServiceDiscoveryModule,
    CacheModule,
    ResilienceModule,
    AuthModule,
  ],
  controllers: [RoutesController, ProxyController],
  providers: [
    RoutingService,
    DynamicRoutesService,
    BaseProxyService,
    ApiProxyService,
    ApiRpcProxyService,
    WebhooksProxyService,
    WebhooksRpcProxyService,
    WorkerProxyService,
    RoutesInitializerService,
  ],
  exports: [RoutingService, DynamicRoutesService],
})
export class RoutingModule {}





