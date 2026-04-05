import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Route } from '../entities/route.entity.js';
import { DynamicRoutesService } from './dynamic-routes.service.js';

/**
 * 路由初始化服务
 * 在应用启动时自动创建默认路由（如果不存在）
 */
@Injectable()
export class RoutesInitializerService implements OnModuleInit {
  private readonly logger = new Logger(RoutesInitializerService.name);

  constructor(
    @InjectRepository(Route)
    private readonly routeRepository: Repository<Route>,
    private readonly dynamicRoutesService: DynamicRoutesService,
  ) {}

  async onModuleInit() {
    await this.initializeDefaultRoutes();
  }

  /**
   * 初始化默认路由
   */
  async initializeDefaultRoutes(): Promise<void> {
    try {
      // 检查是否已有路由
      const existingRoutesCount = await this.routeRepository.count();
      
      if (existingRoutesCount > 0) {
        this.logger.log(
          `数据库已有 ${existingRoutesCount} 条路由，跳过初始化`,
        );
        return;
      }

      this.logger.log('开始初始化默认路由...');

      // 定义默认路由配置
      const defaultRoutes = [
        {
          path: '/v1/*',
          service: 'api' as const,
          rewritePath: '/api',
          authRequired: true,
          transport: 'http' as const,
          priority: 100,
          description: 'API 服务路由 - 转发到 API Service',
        },
        {
          path: '/auth/*',
          service: 'api' as const,
          rewritePath: '/api/auth',
          authRequired: false,
          transport: 'http' as const,
          priority: 100,
          description: '认证服务路由 - 转发到 API Service 的认证端点',
        },
        {
          path: '/webhooks/*',
          service: 'webhooks' as const,
          rewritePath: '/webhooks',
          authRequired: false,
          transport: 'http' as const,
          priority: 90,
          description: 'Webhooks 接收端点 - 转发到 Webhooks Service',
        },
        {
          path: '/v1/webhooks/*',
          service: 'webhooks' as const,
          rewritePath: '/api/webhooks',
          authRequired: true,
          transport: 'http' as const,
          priority: 90,
          description: 'Webhooks 管理API - 转发到 Webhooks Service 的管理端点',
        },
        {
          path: '/worker/*',
          service: 'worker' as const,
          rewritePath: '/worker',
          authRequired: true,
          transport: 'http' as const,
          priority: 80,
          description: 'Worker 服务路由 - 转发到 Worker Service',
        },
      ];

      // 批量插入默认路由
      const routes = this.routeRepository.create(defaultRoutes);
      await this.routeRepository.save(routes);

      this.logger.log(
        `成功初始化 ${defaultRoutes.length} 条默认路由`,
      );

      // 刷新动态路由缓存，使新创建的路由立即生效
      try {
        await this.dynamicRoutesService.refreshRoutes();
        this.logger.log('路由缓存已刷新');
      } catch (refreshError) {
        this.logger.warn('刷新路由缓存失败，但不影响路由初始化', refreshError.message);
      }
    } catch (error) {
      this.logger.error('初始化默认路由失败', error.stack);
      // 不抛出错误，避免影响应用启动
      // 管理员可以通过 API 手动创建路由
    }
  }
}
