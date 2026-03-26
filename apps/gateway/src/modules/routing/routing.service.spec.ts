/**
 * 路由服务测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { RoutingService } from './routing.service.js';
import { ConfigService } from '../../common/config/config.service.js';
import { DynamicRoutesService } from './services/dynamic-routes.service.js';
import { ApiProxyService } from './proxies/api-proxy.service.js';
import { ApiRpcProxyService } from './proxies/api-rpc-proxy.service.js';
import { WebhooksProxyService } from './proxies/webhooks-proxy.service.js';
import { WebhooksRpcProxyService } from './proxies/webhooks-rpc-proxy.service.js';
import { WorkerProxyService } from './proxies/worker-proxy.service.js';
import { createMockConfigService } from '../../../../test/utils/mock-factories.js';
import { AxiosResponse } from 'axios';

describe('RoutingService', () => {
  let service: RoutingService;
  let httpService: jest.Mocked<HttpService>;
  let configService: jest.Mocked<ConfigService>;
  let dynamicRoutesService: jest.Mocked<DynamicRoutesService>;
  let apiProxyService: jest.Mocked<ApiProxyService>;
  let apiRpcProxyService: jest.Mocked<ApiRpcProxyService>;
  let webhooksProxyService: jest.Mocked<WebhooksProxyService>;
  let webhooksRpcProxyService: jest.Mocked<WebhooksRpcProxyService>;
  let workerProxyService: jest.Mocked<WorkerProxyService>;

  beforeEach(async () => {
    const mockHttpService = {
      request: jest.fn(),
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    };

    const mockDynamicRoutesService = {
      findRoute: jest.fn(),
      addRoute: jest.fn(),
      removeRoute: jest.fn(),
    };

    const mockApiProxyService = {
      proxyToApi: jest.fn(),
    };

    const mockApiRpcProxyService = {
      send: jest.fn(),
    };

    const mockWebhooksProxyService = {
      proxyToWebhooks: jest.fn(),
    };

    const mockWebhooksRpcProxyService = {
      send: jest.fn(),
    };

    const mockWorkerProxyService = {
      proxy: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoutingService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: createMockConfigService(),
        },
        {
          provide: DynamicRoutesService,
          useValue: mockDynamicRoutesService,
        },
        {
          provide: ApiProxyService,
          useValue: mockApiProxyService,
        },
        {
          provide: ApiRpcProxyService,
          useValue: mockApiRpcProxyService,
        },
        {
          provide: WebhooksProxyService,
          useValue: mockWebhooksProxyService,
        },
        {
          provide: WebhooksRpcProxyService,
          useValue: mockWebhooksRpcProxyService,
        },
        {
          provide: WorkerProxyService,
          useValue: mockWorkerProxyService,
        },
      ],
    }).compile();

    service = module.get<RoutingService>(RoutingService);
    httpService = module.get(HttpService);
    configService = module.get(ConfigService);
    dynamicRoutesService = module.get(DynamicRoutesService);
    apiProxyService = module.get(ApiProxyService);
    apiRpcProxyService = module.get(ApiRpcProxyService);
    webhooksProxyService = module.get(WebhooksProxyService);
    webhooksRpcProxyService = module.get(WebhooksRpcProxyService);
    workerProxyService = module.get(WorkerProxyService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('route', () => {
    it('should route request to API service', async () => {
      const method = 'GET';
      const path = '/v1/users';
      const mockResponse: AxiosResponse = {
        data: { id: '123' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      dynamicRoutesService.findRoute.mockReturnValue(null as any);
      apiRpcProxyService.send.mockResolvedValue(mockResponse.data);

      const result = await service.route(method, path, {
        user: { id: 'user-1', roles: ['admin'], permissions: [] },
        query: {},
        headers: {},
      });

      expect(result.data).toEqual(mockResponse.data);
      expect(apiRpcProxyService.send).toHaveBeenCalled();
    });

    it('should use dynamic route if found', async () => {
      const method = 'GET';
      const path = '/api/custom';
      const mockRoute = {
        path: '/api/custom',
        target: 'api',
        service: 'api',
      };
      const mockResponse: AxiosResponse = {
        data: { custom: 'data' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      dynamicRoutesService.findRoute.mockReturnValue({
        route: mockRoute as any,
        params: {},
      });
      apiProxyService.proxyToApi.mockResolvedValue(mockResponse);

      const result = await service.route(method, path);

      expect(dynamicRoutesService.findRoute).toHaveBeenCalledWith(path);
      expect(result).toEqual(mockResponse);
    });

    it('should throw error if route not found', async () => {
      const method = 'GET';
      const path = '/unknown/path';

      dynamicRoutesService.findRoute.mockReturnValue(null);

      await expect(service.route(method, path)).rejects.toThrow();
    });
  });
});








