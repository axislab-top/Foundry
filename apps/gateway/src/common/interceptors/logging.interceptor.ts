import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { createLogger, LogLevel } from '@service/logging';
import { DataMaskingService } from '../security/services/data-masking.service.js';

const logger = createLogger({
  service: 'gateway-service',
  environment: process.env.NODE_ENV || 'development',
  level: LogLevel.INFO,
});

/**
 * 日志拦截器
 * 记录所有请求和响应（包含脱敏后的请求体和响应体）
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly dataMaskingService: DataMaskingService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const { method, url, ip, headers, body, query, params } = request;
    const requestId = request.headers['x-request-id'] as string;
    const traceId = request.headers['x-trace-id'] as string;
    const spanId = request.headers['x-span-id'] as string;
    const companyId =
      request.companyId ||
      request.headers['x-company-id'] ||
      request.user?.companyId;
    const startTime = Date.now();

    // 记录请求信息（脱敏）
    const maskedHeaders = this.dataMaskingService.maskHeaders(headers);
    const maskedBody = this.maskRequestBody(body);
    const maskedQuery = this.dataMaskingService.maskObject(query || {});
    const maskedParams = this.dataMaskingService.maskObject(params || {});

    logger.info('Incoming request', {
      method,
      url,
      ip,
      requestId,
      traceId,
      spanId,
      companyId,
      headers: maskedHeaders,
      body: maskedBody,
      query: maskedQuery,
      params: maskedParams,
      timestamp: new Date().toISOString(),
    });

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;
          
          // 脱敏响应体
          const maskedResponseBody = this.maskResponseBody(data, statusCode);

          logger.info('Request completed', {
            method,
            url,
            ip,
            requestId,
            traceId,
            spanId,
            companyId,
            statusCode,
            duration,
            responseBody: maskedResponseBody,
            timestamp: new Date().toISOString(),
          });
        },
      }),
      // 使用 catchError 确保异常能够正确传播到异常过滤器
      // 根据 NestJS 文档，如果拦截器链中的某个拦截器使用了 tap 的 error 回调，
      // 异常可能无法正确传播到异常过滤器。我们需要使用 catchError 来确保异常能够传播。
      catchError((error) => {
        const duration = Date.now() - startTime;
        const statusCode = error.status || (error instanceof HttpException ? error.getStatus() : 500);
        
        // 检查响应状态
        const response = context.switchToHttp().getResponse();
        
        // 错误响应也需要脱敏
        const errorResponse = {
          message: error.message,
          statusCode,
          ...(error.response && typeof error.response === 'object'
            ? this.dataMaskingService.maskObject(error.response)
            : {}),
        };
        const errorMessage =
          typeof errorResponse.message === 'string'
            ? errorResponse.message
            : this.safeStringify(errorResponse.message);

        const errorDetails =
          typeof errorResponse === 'string'
            ? errorResponse
            : this.safeStringify(errorResponse);

        logger.error('Request failed', {
          method,
          url,
          ip,
          requestId,
          traceId,
          spanId,
          companyId,
          statusCode,
          duration,
          error: errorMessage,
          errorDetails,
          errorType: error?.constructor?.name,
          isHttpException: error instanceof HttpException,
          headersSent: response.headersSent,
          writableEnded: response.writableEnded,
          currentStatusCode: response.statusCode,
          timestamp: new Date().toISOString(),
        });
        
        // 重新抛出异常，确保异常过滤器能够正确处理
        return throwError(() => error);
      }),
    );
  }

  /**
   * Safe stringify for logging (avoid `[object Object]` in transports).
   */
  private safeStringify(value: unknown): string {
    try {
      if (typeof value === 'string') return value;
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  /**
   * 脱敏请求体
   */
  private maskRequestBody(body: any): any {
    if (!body) {
      return null;
    }

    // 如果body是字符串，尝试解析
    if (typeof body === 'string') {
      try {
        const parsed = JSON.parse(body);
        return this.dataMaskingService.maskObject(parsed);
      } catch {
        // 如果不是JSON，使用字符串脱敏
        return this.dataMaskingService.maskString(body);
      }
    }

    // 如果body是对象，直接脱敏
    return this.dataMaskingService.maskObject(body);
  }

  /**
   * 脱敏响应体
   */
  private maskResponseBody(data: any, statusCode: number): any {
    if (!data) {
      return null;
    }

    // 对于成功的响应（2xx），可能需要部分脱敏
    // 对于错误响应（4xx, 5xx），完全脱敏敏感信息
    if (statusCode >= 400) {
      // 错误响应需要完全脱敏
      return this.dataMaskingService.maskObject(data);
    }

    // 成功响应也脱敏敏感字段
    return this.dataMaskingService.maskObject(data);
  }
}
