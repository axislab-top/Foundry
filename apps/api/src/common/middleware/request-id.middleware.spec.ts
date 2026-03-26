/**
 * 请求ID中间件测试
 */

import { Request, Response, NextFunction } from 'express';
import { RequestIdMiddleware } from './request-id.middleware.js';

describe('RequestIdMiddleware', () => {
  let middleware: RequestIdMiddleware;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    middleware = new RequestIdMiddleware();
    req = {
      headers: {},
    };
    res = {
      setHeader: jest.fn(),
    };
    next = jest.fn();
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  describe('use', () => {
    it('should generate request ID if not present', () => {
      middleware.use(req as Request, res as Response, next);

      expect(req.headers['x-request-id']).toBeDefined();
      expect(res.setHeader).toHaveBeenCalledWith(
        'X-Request-Id',
        req.headers['x-request-id'],
      );
      expect(next).toHaveBeenCalled();
    });

    it('should use existing request ID if present', () => {
      const existingId = 'existing-request-id';
      req.headers = { 'x-request-id': existingId };

      middleware.use(req as Request, res as Response, next);

      expect(req.headers['x-request-id']).toBe(existingId);
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', existingId);
      expect(next).toHaveBeenCalled();
    });
  });
});








