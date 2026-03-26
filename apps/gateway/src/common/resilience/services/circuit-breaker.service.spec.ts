/**
 * 断路器服务测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { CircuitBreakerService, CircuitBreakerState } from './circuit-breaker.service.js';
import { CacheService } from '../../../common/cache/cache.service.js';
import { ConfigService } from '../../../common/config/config.service.js';
import { createMockCacheService, createMockConfigService } from '../../../../../test/utils/mock-factories.js';

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;
  let cacheService: jest.Mocked<CacheService>;

  beforeEach(async () => {
    const mockCacheService = createMockCacheService();
    const mockConfigService = createMockConfigService();
    (mockConfigService as any).getCircuitBreakerConfig = jest.fn(() => ({
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000,
      resetTimeout: 30000,
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CircuitBreakerService,
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<CircuitBreakerService>(CircuitBreakerService);
    cacheService = module.get(CacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getState', () => {
    it('should return CLOSED state by default', async () => {
      cacheService.get.mockResolvedValue(null);

      const state = await service.getState('test-service');

      expect(state).toBe(CircuitBreakerState.CLOSED);
    });

    it('should return cached state', async () => {
      const stats = {
        state: CircuitBreakerState.OPEN,
        failures: 5,
        successes: 0,
        lastFailureTime: Date.now(),
        nextAttemptTime: Date.now() + 60000,
      };

      cacheService.get.mockResolvedValue(stats);
      cacheService.set.mockResolvedValue(undefined);

      const state = await service.getState('test-service');

      expect(state).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe('recordSuccess', () => {
    it('should record success and reset failures', async () => {
      const stats = {
        state: CircuitBreakerState.CLOSED,
        failures: 2,
        successes: 0,
        lastFailureTime: Date.now(),
        nextAttemptTime: null,
      };

      cacheService.get.mockResolvedValue(stats);
      cacheService.set.mockResolvedValue(undefined);

      await service.recordSuccess('test-service');

      expect(cacheService.set).toHaveBeenCalled();
    });

    it('should transition from HALF_OPEN to CLOSED on success threshold', async () => {
      const stats = {
        state: CircuitBreakerState.HALF_OPEN,
        failures: 0,
        successes: 4, // 接近成功阈值
        lastFailureTime: null,
        nextAttemptTime: null,
      };

      cacheService.get.mockResolvedValue(stats);
      cacheService.set.mockResolvedValue(undefined);

      await service.recordSuccess('test-service');

      expect(cacheService.set).toHaveBeenCalled();
    });
  });

  describe('recordFailure', () => {
    it('should record failure and increment failure count', async () => {
      const stats = {
        state: CircuitBreakerState.CLOSED,
        failures: 0,
        successes: 0,
        lastFailureTime: null,
        nextAttemptTime: null,
      };

      cacheService.get.mockResolvedValue(stats);
      cacheService.set.mockResolvedValue(undefined);

      await service.recordFailure('test-service');

      expect(cacheService.set).toHaveBeenCalled();
    });

    it('should transition to OPEN state when failure threshold exceeded', async () => {
      const stats = {
        state: CircuitBreakerState.CLOSED,
        failures: 4, // 接近失败阈值（默认5）
        successes: 0,
        lastFailureTime: Date.now(),
        nextAttemptTime: null,
      };

      cacheService.get.mockResolvedValue(stats);
      cacheService.set.mockResolvedValue(undefined);

      await service.recordFailure('test-service');

      expect(cacheService.set).toHaveBeenCalled();
    });
  });

  describe('canExecute', () => {
    it('should allow execution when circuit is CLOSED', async () => {
      const stats = {
        state: CircuitBreakerState.CLOSED,
        failures: 0,
        successes: 0,
        lastFailureTime: null,
        nextAttemptTime: null,
      };

      cacheService.get.mockResolvedValue(stats);

      const canExecute = await service.canExecute('test-service');

      expect(canExecute).toBe(true);
    });

    it('should block execution when circuit is OPEN', async () => {
      const stats = {
        state: CircuitBreakerState.OPEN,
        failures: 5,
        successes: 0,
        lastFailureTime: Date.now(),
        nextAttemptTime: Date.now() + 60000,
      };

      cacheService.get.mockResolvedValue(stats);

      const canExecute = await service.canExecute('test-service');

      expect(canExecute).toBe(false);
    });

    it('should allow execution when circuit is HALF_OPEN', async () => {
      const stats = {
        state: CircuitBreakerState.HALF_OPEN,
        failures: 0,
        successes: 0,
        lastFailureTime: Date.now() - 60000,
        nextAttemptTime: Date.now() - 1000,
      };

      cacheService.get.mockResolvedValue(stats);
      cacheService.set.mockResolvedValue(undefined);

      const canExecute = await service.canExecute('test-service');

      expect(canExecute).toBe(true);
    });
  });
});








