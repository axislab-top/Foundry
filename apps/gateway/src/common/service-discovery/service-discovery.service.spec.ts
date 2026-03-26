/**
 * 服务发现服务测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ServiceDiscoveryService } from './service-discovery.service.js';
import { ConsulManager, ServiceDiscovery } from '@service/consul';
import type { ServiceInstance } from '@service/consul';

describe('ServiceDiscoveryService', () => {
  let service: ServiceDiscoveryService;
  let consulManager: jest.Mocked<ConsulManager>;
  let serviceDiscovery: jest.Mocked<ServiceDiscovery>;

  beforeEach(async () => {
    const mockServiceDiscovery = {
      discoverHealthy: jest.fn(),
      watch: jest.fn(),
    };

    const mockConsulManager = {
      getClient: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceDiscoveryService,
        {
          provide: 'CONSUL_MANAGER',
          useValue: mockConsulManager,
        },
      ],
    }).compile();

    service = module.get<ServiceDiscoveryService>(ServiceDiscoveryService);
    consulManager = module.get('CONSUL_MANAGER');

    // Mock ServiceDiscovery instance used internally
    serviceDiscovery = mockServiceDiscovery as any;
    (ServiceDiscovery as any) = jest.fn(() => mockServiceDiscovery);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('discoverService', () => {
    it('should discover service instances', async () => {
      const serviceName = 'api-service';
      const instances: ServiceInstance[] = [
        {
          id: 'instance-1',
          name: serviceName,
          address: 'localhost',
          port: 3000,
          tags: [],
          meta: {},
        },
      ];

      // 需要在onModuleInit后调用
      await service.onModuleInit();
      (service as any).serviceDiscovery = serviceDiscovery;
      serviceDiscovery.discoverHealthy.mockResolvedValue(instances);

      const result = await service.discoverService(serviceName);

      expect(result).toEqual(instances);
    });

    it('should return empty array when Consul is not enabled', async () => {
      const moduleWithoutConsul = await Test.createTestingModule({
        providers: [
          ServiceDiscoveryService,
          {
            provide: 'CONSUL_MANAGER',
            useValue: null,
          },
        ],
      }).compile();

      const serviceWithoutConsul = moduleWithoutConsul.get<ServiceDiscoveryService>(
        ServiceDiscoveryService,
      );

      await serviceWithoutConsul.onModuleInit();

      const result = await serviceWithoutConsul.discoverService('test-service');

      expect(result).toEqual([]);
    });

    it('should return cached instances on error', async () => {
      const serviceName = 'api-service';
      const cachedInstances: ServiceInstance[] = [
        {
          id: 'cached-instance',
          name: serviceName,
          address: 'localhost',
          port: 3000,
          tags: [],
          meta: {},
        },
      ];

      await service.onModuleInit();
      (service as any).serviceDiscovery = serviceDiscovery;
      (service as any).serviceCache.set(serviceName, cachedInstances);
      serviceDiscovery.discoverHealthy.mockRejectedValue(new Error('Discovery failed'));

      const result = await service.discoverService(serviceName);

      expect(result).toEqual(cachedInstances);
    });
  });

  describe('watchService', () => {
    it('should watch service for changes', async () => {
      const serviceName = 'api-service';
      const callback = jest.fn();

      await service.onModuleInit();
      (service as any).serviceDiscovery = serviceDiscovery;
      serviceDiscovery.watch.mockReturnValue(() => {});

      await service.watchService(serviceName, undefined, callback);

      expect(typeof (service as any).serviceWatchers.get(`${serviceName}:default`)).toBe('function');
    });
  });

  describe('stopAllWatchers', () => {
    it('should stop watching all services', async () => {
      const serviceName = 'api-service';
      const stopWatcher = jest.fn();

      (service as any).serviceWatchers.set(`${serviceName}:default`, stopWatcher);

      service.stopAllWatchers();

      expect(stopWatcher).toHaveBeenCalled();
      expect((service as any).serviceWatchers.size).toBe(0);
    });
  });
});








