/**
 * 响应转换拦截器测试
 */

import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor.js';
import { createMockExecutionContext } from '../../../../test/utils/test-helpers.js';

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<any>;
  let context: ExecutionContext;
  let handler: CallHandler;

  beforeEach(() => {
    interceptor = new TransformInterceptor();
    context = createMockExecutionContext() as ExecutionContext;
    handler = {
      handle: jest.fn(),
    } as any;
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('intercept', () => {
    it('should transform response to standard format', (done) => {
      const data = { id: '123', name: 'test' };
      handler.handle = jest.fn(() => of(data));

      interceptor.intercept(context, handler).subscribe((result) => {
        expect(result).toEqual({
          success: true,
          data,
          timestamp: expect.any(String),
        });
        done();
      });
    });

    it('should return data as-is if already in standard format', (done) => {
      const data = {
        success: true,
        data: { id: '123' },
        timestamp: '2024-01-01T00:00:00.000Z',
      };
      handler.handle = jest.fn(() => of(data));

      interceptor.intercept(context, handler).subscribe((result) => {
        expect(result).toEqual(data);
        done();
      });
    });

    it('should handle null data', (done) => {
      handler.handle = jest.fn(() => of(null));

      interceptor.intercept(context, handler).subscribe((result) => {
        expect(result).toEqual({
          success: true,
          data: null,
          timestamp: expect.any(String),
        });
        done();
      });
    });
  });
});








