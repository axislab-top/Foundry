import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '../../common/config/config.service.js';
import { findRoute } from './config/routes.config.js';
import { DynamicRoutesService } from './services/dynamic-routes.service.js';
import { ApiProxyService } from './proxies/api-proxy.service.js';
import { ApiRpcProxyService } from './proxies/api-rpc-proxy.service.js';
import { WebhooksProxyService } from './proxies/webhooks-proxy.service.js';
import { WebhooksRpcProxyService } from './proxies/webhooks-rpc-proxy.service.js';
import { WorkerProxyService } from './proxies/worker-proxy.service.js';
import { Route } from './interfaces/route.interface.js';
import { AxiosResponse } from 'axios';
import { ErrorCode } from '../../common/exceptions/error-codes.js';
import { GatewayException } from '../../common/exceptions/filters/gateway-exception.filter.js';

/**
 * 路由服务
 * 负责请求路由和转发
 */
@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly dynamicRoutesService: DynamicRoutesService,
    private readonly apiProxyService: ApiProxyService,
    private readonly apiRpcProxyService: ApiRpcProxyService,
    private readonly webhooksProxyService: WebhooksProxyService,
    private readonly webhooksRpcProxyService: WebhooksRpcProxyService,
    private readonly workerProxyService: WorkerProxyService,
  ) {}

  /**
   * 路由请求
   */
  async route(
    method: string,
    path: string,
    originalRequest?: any,
  ): Promise<AxiosResponse> {
    this.logger.log('Routing request', { method, path });
    
    // 先查找动态路由
    const dyn = this.dynamicRoutesService.findRoute(path);
    let route: Route | undefined = dyn?.route;
    let routeParams: Record<string, string> = dyn?.params || {};
    
    // 如果动态路由没找到，使用静态配置
    if (!route) {
      const stat = findRoute(path);
      route = stat?.route;
      routeParams = stat?.params || {};
    }

    if (!route) {
      this.logger.warn('Route not found', { path });
      throw new GatewayException(
        ErrorCode.ROUTING_ROUTE_NOT_FOUND,
        `Route not found: ${path}`,
        404,
      );
    }

    this.logger.debug('Route found', { 
      path, 
      route: route.path, 
      service: route.service,
      authRequired: route.authRequired,
    });

    // 方法约束（最佳实践：避免同一路径不同 method 混淆）
    if (route.methods?.length) {
      const allowed = route.methods.map((m) => m.toUpperCase());
      if (!allowed.includes(method.toUpperCase())) {
        throw new GatewayException(
          ErrorCode.BAD_REQUEST,
          `Method not allowed for route: ${method} ${path}`,
          405,
        );
      }
    }

    // 检查是否需要认证
    if (route.authRequired && !originalRequest?.user) {
      this.logger.warn('Authentication required but no user found', { path });
      throw new GatewayException(
        ErrorCode.UNAUTHORIZED,
        'Authentication required',
        401,
      );
    }

    // 重写路径
    const rewrittenPath = this.rewritePath(path, route, routeParams);
    this.logger.log('Path rewritten', { original: path, rewritten: rewrittenPath });

    // 根据服务类型选择代理
    try {
      const timeoutMs = route.rpcTimeoutMs ?? route.timeout ?? 5000;
      const actor = originalRequest?.user
        ? {
            id: originalRequest.user.id,
            roles: originalRequest.user.roles,
            permissions: originalRequest.user.permissions,
            email: originalRequest.user.email,
            username: originalRequest.user.username,
          }
        : undefined;
      const rpcPayload =
        method.toUpperCase() === 'GET'
          ? {
              ...(originalRequest?.query || {}),
              ...routeParams,
              actor,
              traceparent: originalRequest?.headers?.['traceparent'],
              tracestate: originalRequest?.headers?.['tracestate'],
            }
          : {
              ...(originalRequest?.body || {}),
              ...(originalRequest?.query || {}),
              ...routeParams,
              actor,
              ip: originalRequest?.ip,
              userAgent: originalRequest?.headers?.['user-agent'],
              traceparent: originalRequest?.headers?.['traceparent'],
              tracestate: originalRequest?.headers?.['tracestate'],
            };

      switch (route.service) {
        case 'api':
          if (route.transport === 'rpc') {
            if (!route.rpcPattern) {
              throw new GatewayException(
                ErrorCode.ROUTING_SERVICE_ERROR,
                `RPC route missing rpcPattern: ${route.path}`,
                500,
              );
            }

            const data = await this.apiRpcProxyService.send<any, any>(
              route.rpcPattern,
              rpcPayload,
              timeoutMs,
            );

            // 统一返回 AxiosResponse shape 给 ProxyController
            return {
              status: 200,
              statusText: 'OK',
              headers: {},
              config: {},
              data,
            } as AxiosResponse;
          }

          this.logger.log('Proxying to API service', { method, rewrittenPath });
          return this.apiProxyService.proxyToApi(method, rewrittenPath, originalRequest);
        case 'webhooks':
          if (route.transport === 'rpc') {
            if (!route.rpcPattern) {
              throw new GatewayException(
                ErrorCode.ROUTING_SERVICE_ERROR,
                `RPC route missing rpcPattern: ${route.path}`,
                500,
              );
            }
            const data = await this.webhooksRpcProxyService.send<any, any>(
              route.rpcPattern,
              rpcPayload,
              timeoutMs,
            );
            return {
              status: 200,
              statusText: 'OK',
              headers: {},
              config: {},
              data,
            } as AxiosResponse;
          }
          return this.webhooksProxyService.proxyToWebhooks(
            method,
            this.rewritePath(path, route, routeParams),
            originalRequest,
          );
        case 'worker':
          return this.workerProxyService.proxyToWorker(
            method,
            this.rewritePath(path, route, routeParams),
            originalRequest,
          );
        default:
          throw new GatewayException(
            ErrorCode.ROUTING_SERVICE_ERROR,
            `Unknown service: ${route.service}`,
            500,
          );
      }
    } catch (error: any) {
      if (error.code === 'ECONNABORTED' || error.message === 'Request timeout') {
        throw new GatewayException(
          ErrorCode.ROUTING_SERVICE_TIMEOUT,
          'Service timeout',
          504,
        );
      }
      if (error.response?.status === 503) {
        throw new GatewayException(
          ErrorCode.ROUTING_SERVICE_UNAVAILABLE,
          'Service unavailable',
          503,
        );
      }
      throw error;
    }
  }

  /**
   * 重写路径
   */
  private rewritePath(
    path: string,
    route: Route,
    params: Record<string, string>,
  ): string {
    // 如果路由有rewritePath，使用它
    if (route.rewritePath) {
      if (route.rewritePath !== '/') {
        // 支持 * 的后缀拼接
        const wildcard = params?.wildcard;
        if (wildcard) {
          const suffix = wildcard.startsWith('/') ? wildcard : `/${wildcard}`;
          return `${route.rewritePath}${suffix}`;
        }
        return route.rewritePath;
      }
    }

    // 如果有target，使用target（兼容旧配置）
    if ((route as any).target && (route as any).target !== '/') {
      // 移除路由前缀，添加目标前缀
      const wildcard = params?.wildcard;
      if (wildcard) {
        const suffix = wildcard.startsWith('/') ? wildcard : `/${wildcard}`;
        const rewritten = `${(route as any).target}${suffix}`;
        this.logger.debug('Path rewritten using target', { 
          original: path, 
          rewritten,
          matchedSuffix: wildcard,
        });
        return rewritten;
      }
      
      // 如果没有匹配到通配符部分，直接返回target
      const rewritten = (route as any).target;
      this.logger.debug('Path rewritten to target (no suffix match)', { 
        original: path, 
        rewritten,
      });
      return rewritten;
    }

    this.logger.debug('Path not rewritten', { path });
    return path;
  }
}








