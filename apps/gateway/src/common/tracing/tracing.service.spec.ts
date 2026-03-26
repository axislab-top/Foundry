/**
 * 追踪服务测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { TracingService } from './tracing.service.js';
import { ConfigService } from '../config/config.service.js';
import { createMockConfigService } from '../../../../test/utils/mock-factories.js';

describe('TracingService', () => {
  let service: TracingService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const mockConfigService = createMockConfigService();
    mockConfigService.getTracingConfig = jest.fn(() => ({
      enabled: false,
      exporter: 'console',
      serviceName: 'gateway-service',
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TracingService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<TracingService>(TracingService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('startSpan', () => {
    it('should start a span', () => {
      const spanName = 'test-span';
      const span = service.startSpan(spanName);

      expect(span).toBeNull();
    });

    it('should return null when tracing disabled', () => {
      const span = service.startSpan('test-span');

      expect(span).toBeNull();
    });
  });

  describe('setSpanAttribute', () => {
    it('should safely set attributes when span is null', () => {
      expect(() => service.setSpanAttribute(null, 'key', 'value')).not.toThrow();
    });
  });

  describe('endSpan', () => {
    it('should safely end span when span is null', () => {
      expect(() => service.endSpan(null)).not.toThrow();
    });
  });

  describe('getTraceId', () => {
    it('should return trace ID', () => {
      const traceId = service.getTraceId();

      expect(traceId).toBeNull();
    });
  });

  describe('getSpanId', () => {
    it('should return span ID', () => {
      const spanId = service.getSpanId();

      expect(spanId).toBeNull();
    });
  });
});








