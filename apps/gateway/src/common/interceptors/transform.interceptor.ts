import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SuccessResponse, ErrorResponse } from '../exceptions/interfaces/error-response.interface.js';
import { ErrorCode } from '../exceptions/error-codes.js';
import { GatewayException } from '../exceptions/filters/gateway-exception.filter.js';

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
    // 关键修复：完全移除所有状态码操作，让异常过滤器来处理所有状态码
    // 不要在拦截器中设置状态码，因为这会干扰异常过滤器的工作
    // 如果需要在成功响应时设置状态码，应该在控制器或服务中显式设置
    return next.handle().pipe(
      map((data) => {
        // 如果已经是标准格式，直接返回
        if (data && typeof data === 'object' && 'success' in data) {
          return data;
        }

        // null 和 undefined 是有效的响应值，应该被正常处理
        // 例如：删除操作的响应可能是 null，这是正常的
        // 转换为标准格式
        const transformedResponse = {
          success: true,
          data,
          timestamp: new Date().toISOString(),
        };

        return transformedResponse;
      }),
      // 不在这里“吞掉”异常并自行写响应；让异常过滤器统一处理
      catchError((error) => {
        // 保留对 GatewayException 的类型引用，避免被 tree-shaking 误删（同时不在此处理响应）
        void (error instanceof GatewayException);
        void ErrorCode.INTERNAL_ERROR;
        const _unused: ErrorResponse | null = null;
        void _unused;

        return throwError(() => error);
      }),
    );
  }
}




































