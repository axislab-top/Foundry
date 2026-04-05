import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from '../types/express.types.js';
import { randomUUID } from 'crypto';

/**
 * 请求ID中间件
 * 为每个请求生成唯一ID
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId = req.headers['x-request-id'] as string || randomUUID();
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-Id', requestId);

    const runIdHeader = req.headers['x-run-id'] as string | undefined;
    const runId =
      typeof runIdHeader === 'string' && runIdHeader.trim().length > 0
        ? runIdHeader.trim()
        : randomUUID();
    req.headers['x-run-id'] = runId;
    res.setHeader('X-Run-Id', runId);

    next();
  }
}
















