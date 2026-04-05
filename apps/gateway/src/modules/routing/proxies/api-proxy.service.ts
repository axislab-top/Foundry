import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { BaseProxyService } from './base-proxy.service.js';
import { ConfigService } from '../../../common/config/config.service.js';
import { ServiceDiscoveryService } from '../../../common/service-discovery/service-discovery.service.js';
import { ProxyOptions } from '../interfaces/proxy-options.interface.js';
import { AxiosResponse } from 'axios';

/**
 * API 服务代理
 * 支持服务发现和负载均衡
 */
@Injectable()
export class ApiProxyService extends BaseProxyService {
  private readonly logger = new Logger(ApiProxyService.name);

  constructor(
    httpService: HttpService,
    configService: ConfigService,
    private readonly serviceDiscovery: ServiceDiscoveryService,
  ) {
    super(httpService, configService);
  }

  /**
   * 将网关路径映射到 API HTTP 全局前缀 `api` 下的实际路由。
   * 动态路由若未配置 rewrite_path，可能仍携带 `/v1/...`，直接拼到服务根会得到 `/v1/...` 而 Nest 只注册 `/api/...`，导致 404。
   */
  private normalizeHttpPathForApi(path: string): string {
    if (path.startsWith('/api/') || path === '/api') {
      return path;
    }
    if (path.startsWith('/v1/') || path === '/v1') {
      return path.replace(/^\/v1/, '/api');
    }
    return path.startsWith('/') ? `/api${path}` : `/api/${path}`;
  }

  /**
   * 代理到 API 服务
   */
  async proxyToApi(
    method: string,
    path: string,
    originalRequest?: any,
  ): Promise<AxiosResponse> {
    const normalizedPath = this.normalizeHttpPathForApi(path);
    this.logger.log('proxyToApi called', { method, path, normalizedPath });

    let targetUrl: string;

    // 如果启用了服务发现，使用服务发现获取服务 URL
    if (this.serviceDiscovery.isAvailable()) {
      this.logger.debug('Service discovery is available, trying to get service URL');
      const serviceUrl = await this.serviceDiscovery.getServiceUrl(
        'api-service',
        'api',
        'http',
      );
      if (serviceUrl) {
        targetUrl = serviceUrl;
        this.logger.debug('Service URL from service discovery', { targetUrl });
      } else {
        // 如果服务发现失败，回退到配置的服务 URL
        const servicesConfig = this.configService.getServicesConfig();
        targetUrl = servicesConfig.apiServiceUrl;
        this.logger.warn('Service discovery returned null, using configured URL', { targetUrl });
      }
    } else {
      // 如果未启用服务发现，使用配置的服务 URL
      const servicesConfig = this.configService.getServicesConfig();
      targetUrl = servicesConfig.apiServiceUrl;
      this.logger.debug('Service discovery not available, using configured URL', { targetUrl });
    }

    const options: ProxyOptions = {
      target: targetUrl,
      timeout: 30000,
    };

    this.logger.log('Calling base proxy', {
      method,
      path: normalizedPath,
      targetUrl,
      fullUrl: `${targetUrl}${normalizedPath}`,
    });

    return this.proxy(method, normalizedPath, options, originalRequest);
  }
}





