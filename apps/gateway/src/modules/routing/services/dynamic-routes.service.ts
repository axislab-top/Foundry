import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like } from 'typeorm';
import { Route } from '../entities/route.entity.js';
import { CacheService } from '../../../common/cache/cache.service.js';
import type { Route as RouteConfig } from '../interfaces/route.interface.js';

/**
 * 动态路由服务
 * 管理动态路由配置（从数据库加载）
 */
@Injectable()
export class DynamicRoutesService implements OnModuleInit {
  private readonly CACHE_KEY = 'routes:all';
  private readonly CACHE_TTL = 3600; // 1小时
  private routes: RouteConfig[] = [];

  constructor(
    @InjectRepository(Route)
    private readonly routeRepository: Repository<Route>,
    private readonly cacheService: CacheService,
  ) {}

  async onModuleInit() {
    // 启动时加载路由
    await this.loadRoutes();
  }

  /**
   * 加载路由（从数据库）
   */
  async loadRoutes(): Promise<void> {
    // 先查缓存
    const cached = await this.cacheService.get<RouteConfig[]>(this.CACHE_KEY);

    if (cached) {
      this.routes = cached;
      return;
    }

    // 从数据库加载
    const dbRoutes = await this.routeRepository.find({
      where: { isActive: true } as FindOptionsWhere<Route>,
      order: { priority: 'DESC', path: 'ASC' },
    });

    // 转换为RouteConfig格式
    this.routes = dbRoutes.map((route) => ({
      path: route.path,
      service: route.service as 'api' | 'webhooks' | 'worker',
      rewritePath: route.rewritePath || undefined,
      authRequired: route.authRequired,
      transport: (route.transport || 'http') as 'http' | 'rpc',
      rpcClientName: route.rpcClientName
        ? (route.rpcClientName as 'api' | 'webhooks')
        : undefined,
      rpcPattern: route.rpcPattern || undefined,
      rpcTimeoutMs: route.rpcTimeoutMs || undefined,
    }));

    // 缓存路由
    await this.cacheService.set(this.CACHE_KEY, this.routes, this.CACHE_TTL);
  }

  /**
   * 获取所有路由
   */
  getAllRoutes(): RouteConfig[] {
    return [...this.routes];
  }

  /**
   * 根据路径查找路由
   */
  findRoute(path: string): { route: RouteConfig; params: Record<string, string> } | undefined {
    // 按优先级排序，找到第一个匹配的路由
    for (const route of this.routes) {
      const params = this.matchPath(route.path, path);
      if (params) {
        return { route, params };
      }
    }
    return undefined;
  }

  /**
   * 刷新路由缓存（热更新）
   */
  async refreshRoutes(): Promise<void> {
    // 清除缓存
    await this.cacheService.delete(this.CACHE_KEY);
    // 重新加载
    await this.loadRoutes();
  }

  /**
   * 路径匹配（支持通配符）
   */
  private matchPath(pattern: string, path: string): Record<string, string> | null {
    // 精确匹配
    if (pattern === path) {
      return {};
    }

    // 支持 :param 与 *
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const withGreedyParams = escaped.replace(
      /\\:([a-zA-Z0-9_]+)\\\(\\\*\\\)/g,
      (_m, p1) => `(?<${p1}>.*)`,
    );
    const withParams = withGreedyParams.replace(
      /\\:([a-zA-Z0-9_]+)/g,
      (_m, p1) => `(?<${p1}>[^/]+)`,
    );
    const withWildcard = withParams.replace(/\\\*/g, '(?<wildcard>.*)');
    const regex = new RegExp(`^${withWildcard}$`);
    const match = path.match(regex);
    if (!match) return null;
    return (match.groups || {}) as Record<string, string>;
  }
}











