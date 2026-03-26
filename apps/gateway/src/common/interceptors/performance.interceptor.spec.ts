/**
 * 性能拦截器测试
 */

import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { PerformanceInterceptor } from './performance.interceptor.js';
import { createMockExecutionContext } from '../../../../test/utils/test-helpers.js';

describe('PerformanceInterceptor', () => {
  let interceptor: PerformanceInterceptor;
  let context: ExecutionContext;
  let handler: CallHandler;

  beforeEach(() => {
    interceptor = new PerformanceInterceptor();
    context = createMockExecutionContext() as ExecutionContext;
    handler = {
      handle: jest.fn(),
    } as any;
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('intercept', () => {
    it('should measure request duration', (done) => {
      const data = { result: 'success' };
      handler.handle = jest.fn(() => of(data));

      interceptor.intercept(context, handler).subscribe((result) => {
        expect(result).toEqual(data);
        done();
      });
    });

    it('should handle errors', (done) => {
      const error = new Error('Test error');
      handler.handle = jest.fn(() => {
        throw error;
      });

      try {
        interceptor.intercept(context, handler).subscribe({
          error: (err) => {
            expect(err).toBe(error);
            done();
          },
        });
      } catch (e) {
        expect(e).toBe(error);
        done();
      }
    });
  });
});








