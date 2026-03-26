import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { BaseProxyService } from './base-proxy.service.js';
import { ConfigService } from '../../../common/config/config.service.js';
import { ProxyOptions } from '../interfaces/proxy-options.interface.js';
import { AxiosResponse } from 'axios';

/**
 * Worker 服务代理
 */
@Injectable()
export class WorkerProxyService extends BaseProxyService {
  constructor(
    httpService: HttpService,
    configService: ConfigService,
  ) {
    super(httpService, configService);
  }

  /**
   * 代理到 Worker 服务
   */
  async proxyToWorker(
    method: string,
    path: string,
    originalRequest?: any,
  ): Promise<AxiosResponse> {
    const servicesConfig = this.configService.getServicesConfig();
    const options: ProxyOptions = {
      target: servicesConfig.workerServiceUrl,
      timeout: 30000,
    };

    return this.proxy(method, path, options, originalRequest);
  }
}


















