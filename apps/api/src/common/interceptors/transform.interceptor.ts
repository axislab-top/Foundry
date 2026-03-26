import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SuccessResponse } from '../exceptions/interfaces/error-response.interface.js';
import { createLogger, LogLevel } from '@service/logging';

const debugLogger = createLogger({
  service: 'api-transform-interceptor',
  environment: process.env.NODE_ENV || 'development',
  level: LogLevel.DEBUG,
});

/**
 * 响应转换拦截器
 * 统一响应格式
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, SuccessResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<SuccessResponse<T>> {
    const response = context.switchToHttp().getResponse();
    const request = context.switchToHttp().getRequest();
    
    const requestId = request.headers['x-request-id'] as string;
    const traceId = request.headers['x-trace-id'] as string;

    debugLogger.debug('=== API TransformInterceptor.intercept() - 开始处理响应 ===', {
      method: request.method,
      url: request.url,
      requestId,
      traceId,
      headersSent: response.headersSent,
      writableEnded: response.writableEnded,
      statusCode: response.statusCode,
      timestamp: new Date().toISOString(),
    });

    return next.handle().pipe(
      map((data) => {
        debugLogger.debug('API TransformInterceptor.intercept() - map() 处理响应数据', {
          method: request.method,
          url: request.url,
          requestId,
          traceId,
          dataType: typeof data,
          dataIsNull: data === null,
          dataIsUndefined: data === undefined,
          isObject: data && typeof data === 'object',
          hasSuccessField: data && typeof data === 'object' && 'success' in data,
          dataKeys: data && typeof data === 'object' ? Object.keys(data) : [],
          dataString: data ? JSON.stringify(data).substring(0, 200) : String(data),
          headersSent: response.headersSent,
          writableEnded: response.writableEnded,
        });

        // 如果已经是标准格式，直接返回
        if (data && typeof data === 'object' && 'success' in data) {
          debugLogger.debug('API TransformInterceptor.intercept() - 响应已经是标准格式，直接返回', {
            method: request.method,
            url: request.url,
            requestId,
            traceId,
            success: data.success,
          });
          return data;
        }

        // 转换为标准格式
        const transformedResponse = {
          success: true,
          data,
          timestamp: new Date().toISOString(),
        };

        debugLogger.debug('API TransformInterceptor.intercept() - 响应已转换为标准格式', {
          method: request.method,
          url: request.url,
          requestId,
          traceId,
          success: transformedResponse.success,
          hasData: !!transformedResponse.data,
          dataType: typeof transformedResponse.data,
          responseKeys: Object.keys(transformedResponse),
        });

        return transformedResponse;
      }),
    );
  }
}






































