/**
 * 健康检查服务测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service.js';
import { DataSource } from 'typeorm';
import { TenantService } from '@service/tenant';

describe('HealthService', () => {
  let service: HealthService;
  let dataSource: jest.Mocked<DataSource>;
  let tenantService: { isMembershipBackendHealthy: jest.Mock };

  beforeEach(async () => {
    dataSource = {
      isInitialized: true,
      query: jest.fn().mockResolvedValue([{ version: '14.0' }]),
    } as any;
    tenantService = { isMembershipBackendHealthy: jest.fn().mockReturnValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: TenantService,
          useValue: tenantService,
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkHealth', () => {
    it('should return health status', async () => {
      const result = await service.checkHealth();

      expect(result).toEqual({
        status: 'ok',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        database: {
          status: 'connected',
          connected: true,
        },
        tenantMembership: {
          status: 'connected',
          healthy: true,
        },
      });
    });

    it('should handle database connection failure', async () => {
      dataSource.isInitialized = false;

      const result = await service.checkHealth();

      expect(result.database).toEqual({
        status: 'disconnected',
        connected: false,
      });
      expect(result.status).toBe('degraded');
    });

    it('should degrade when tenant membership backend is unhealthy', async () => {
      tenantService.isMembershipBackendHealthy.mockReturnValue(false);
      const result = await service.checkHealth();
      expect(result.status).toBe('degraded');
      expect(result.tenantMembership).toEqual({
        status: 'unavailable',
        healthy: false,
      });
    });
  });
});








