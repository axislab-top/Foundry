import { Injectable, NestMiddleware, Optional } from '@nestjs/common';
import type { Request, Response, NextFunction } from '../../types/express.types.js';
import { randomUUID } from 'crypto';
import { TracingService } from '../tracing.service.js';

/**
 * 追踪中间件
 * 扩展 RequestIdMiddleware，添加 TraceID 和 SpanID 支持
 * 
 * 请求头:
 * - X-Request-ID: 请求ID（向后兼容）
 * - X-Trace-ID: 追踪ID（分布式追踪）
 * - X-Span-ID: Span ID（当前操作）
 */
@Injectable()
export class TracingMiddleware implements NestMiddleware {
  constructor(@Optional() private readonly tracingService?: TracingService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // 提取或生成 TraceID
    const traceIdHeader = req.headers['x-trace-id'];
    const traceparentHeader = req.headers['traceparent'];
    let traceId: string = Array.isArray(traceIdHeader) 
      ? traceIdHeader[0] 
      : (traceIdHeader || (Array.isArray(traceparentHeader) ? traceparentHeader[0] : traceparentHeader) || '');
    
    // 如果没有 TraceID，生成新的
    if (!traceId && this.tracingService?.isEnabled()) {
      traceId = this.tracingService.getTraceId() || randomUUID();
    } else if (!traceId) {
      traceId = randomUUID();
    }

    // 提取或生成 SpanID
    const spanIdHeader = req.headers['x-span-id'];
    let spanId: string = Array.isArray(spanIdHeader) ? spanIdHeader[0] : (spanIdHeader || '');
    if (!spanId && this.tracingService?.isEnabled()) {
      spanId = this.tracingService.getSpanId() || randomUUID();
    } else if (!spanId) {
      spanId = randomUUID();
    }

    // 提取或生成 RequestID（向后兼容）
    const requestIdHeader = req.headers['x-request-id'];
    let requestId: string = Array.isArray(requestIdHeader) ? requestIdHeader[0] : (requestIdHeader || '');
    if (!requestId) {
      requestId = traceId; // 使用 TraceID 作为 RequestID
    }

    // 设置请求头
    req.headers['x-trace-id'] = traceId;
    req.headers['x-span-id'] = spanId;
    req.headers['x-request-id'] = requestId;

    // 设置响应头
    res.setHeader('X-Trace-ID', traceId);
    res.setHeader('X-Span-ID', spanId);
    res.setHeader('X-Request-Id', requestId);

    // 将 TraceID 和 SpanID 添加到请求对象，方便后续使用
    (req as any).traceId = traceId;
    (req as any).spanId = spanId;
    (req as any).requestId = requestId;

    next();
  }
}








