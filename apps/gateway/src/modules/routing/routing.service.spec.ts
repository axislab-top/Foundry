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
      const call = apiRpcProxyService.send.mock.calls[0];
      expect(call[1]).toEqual(
        expect.objectContaining({
          actor: expect.objectContaining({
            id: 'user-1',
            companyId: undefined,
          }),
        }),
      );
      expect(call[1]).not.toHaveProperty('companyId');
    });

    it('should forward organizationNodeId for marketplace agent purchase', async () => {
      const agentId = '550e8400-e29b-41d4-a716-446655440000';
      const orgNodeId = '660e8400-e29b-41d4-a716-446655440001';
      const companyId = '361723a5-26d7-4d86-80ee-567b5d0ca882';

      dynamicRoutesService.findRoute.mockReturnValue(null as any);
      apiRpcProxyService.send.mockResolvedValue({ ok: true });

      await service.route('POST', `/v1/marketplace/agents/${agentId}/purchase`, {
        user: { id: 'admin-1', roles: ['admin'], permissions: [] },
        query: { companyId, organizationNodeId: orgNodeId },
        headers: { 'x-company-id': companyId },
        body: {},
      });

      const call = apiRpcProxyService.send.mock.calls[0];
      expect(call[0]).toBe('marketplace.agents.purchase');
      expect(call[1]).toEqual(
        expect.objectContaining({
          id: agentId,
          companyId,
          organizationNodeId: orgNodeId,
        }),
      );
    });

    it('should include companyId in rpc payload when header is present', async () => {
      const method = 'GET';
      const path = '/v1/users';
      dynamicRoutesService.findRoute.mockReturnValue(null as any);
      apiRpcProxyService.send.mockResolvedValue({ items: [] });

      await service.route(method, path, {
        user: { id: 'user-1', roles: ['admin'], permissions: [] },
        query: {},
        headers: { 'x-company-id': 'company-rpc' },
      });

      const call = apiRpcProxyService.send.mock.calls[0];
      expect(call[1]).toEqual(
        expect.objectContaining({
          companyId: 'company-rpc',
          actor: expect.objectContaining({
            id: 'user-1',
            companyId: 'company-rpc',
          }),
        }),
      );
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

  describe('buildRpcPayload (organization department from platform)', () => {
    it('wraps HTTP body under data for organization.department.addFromPlatform', () => {
      const companyId = '11111111-2222-4333-8444-555555555555';
      const userId = '22222222-3333-4444-8555-666666666666';
      const payload = (service as any).buildRpcPayload({
        method: 'POST',
        rpcPattern: 'organization.department.addFromPlatform',
        originalRequest: {
          body: { platformDepartmentSlug: 'engineering' },
          query: {},
        },
        routeParams: {},
        actor: { id: userId, roles: ['admin'] },
        companyId,
      });
      expect(payload).toEqual({
        actor: { id: userId, roles: ['admin'] },
        companyId,
        data: { platformDepartmentSlug: 'engineering' },
      });
    });
  });

  /** PATCH 协作模式：与 `routes.config` 中 `collaboration.rooms.updateCollaborationMode` 契约一致 */
  describe('buildRpcPayload (tasks.create)', () => {
    it('wraps HTTP body under data for tasks.create', () => {
      const companyId = '11111111-2222-4333-8444-555555555555';
      const userId = '22222222-3333-4444-8555-666666666666';
      const payload = (service as any).buildRpcPayload({
        method: 'POST',
        rpcPattern: 'tasks.create',
        originalRequest: {
          body: {
            title: '子目标任务',
            assigneeType: 'agent',
            assigneeId: '33333333-4444-4555-8666-777777777777',
            metadata: { goalLevel: 'sub' },
          },
          query: {},
        },
        routeParams: {},
        actor: { id: userId, roles: ['admin'] },
        companyId,
      });
      expect(payload).toEqual({
        actor: { id: userId, roles: ['admin'] },
        companyId,
        data: {
          title: '子目标任务',
          assigneeType: 'agent',
          assigneeId: '33333333-4444-4555-8666-777777777777',
          metadata: { goalLevel: 'sub' },
        },
      });
    });
  });

  describe('buildRpcPayload (collaboration mode PATCH)', () => {
    it('merges body.collaborationMode with route roomId, actor, companyId', () => {
      const roomId = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee';
      const companyId = '11111111-2222-4333-8444-555555555555';
      const userId = '22222222-3333-4444-8555-666666666666';
      const payload = (service as any).buildRpcPayload({
        method: 'PATCH',
        rpcPattern: 'collaboration.rooms.updateCollaborationMode',
        originalRequest: {
          body: { collaborationMode: 'execution' },
          query: {},
        },
        routeParams: { roomId },
        actor: { id: userId, roles: ['member'] },
        companyId,
      });
      expect(payload).toEqual(
        expect.objectContaining({
          companyId,
          roomId,
          collaborationMode: 'execution',
          actor: expect.objectContaining({ id: userId }),
        }),
      );
    });
  });
});








