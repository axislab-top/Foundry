/**
 * 健康检查服务测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service.js';
import { DataSource } from 'typeorm';

describe('HealthService', () => {
  let service: HealthService;
  let dataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    dataSource = {
      isInitialized: true,
      query: jest.fn().mockResolvedValue([{ version: '14.0' }]),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: DataSource,
          useValue: dataSource,
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
      });
    });

    it('should handle database connection failure', async () => {
      dataSource.isInitialized = false;

      const result = await service.checkHealth();

      expect(result.database).toEqual({
        status: 'disconnected',
        connected: false,
      });
    });
  });
});








