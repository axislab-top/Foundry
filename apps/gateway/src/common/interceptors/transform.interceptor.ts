import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { Observable, throwError, of } from 'rxjs';
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
    const response = context.switchToHttp().getResponse();
    const request = context.switchToHttp().getRequest();
    
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
      // 关键修复：添加 catchError 确保异常能够正确传播到异常过滤器
      // 如果响应还没有发送，直接重新抛出异常让异常过滤器处理
      // 如果响应已经部分发送（比如状态码被设置），需要确保异常能够传播
      catchError((error) => {
        
        // 关键修复：如果响应还没有发送，直接发送错误响应
        // 这样可以确保前端能够收到响应，即使异常过滤器没有被调用
        if (!response.headersSent && !response.writableEnded) {
          let status = HttpStatus.INTERNAL_SERVER_ERROR;
          let code = ErrorCode.INTERNAL_ERROR;
          let message = 'Internal server error';
          let details: any = undefined;

          // 处理 GatewayException
          if (error instanceof GatewayException) {
            status = error.statusCode;
            code = error.code;
            message = error.message;
            details = error.details;
          } else if (error instanceof HttpException) {
            status = error.getStatus();
            const exceptionResponse = error.getResponse();
            
            if (typeof exceptionResponse === 'string') {
              message = exceptionResponse;
            } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
              const responseObj = exceptionResponse as any;
              // 优先使用异常响应中的错误码和消息
              if (responseObj.code !== undefined) {
                code = responseObj.code;
              }
              message = responseObj.message || error.message || message;
              details = responseObj.details;
              
              // 如果响应对象有 error 字段（嵌套的错误对象），也检查它
              if (responseObj.error && typeof responseObj.error === 'object') {
                if (responseObj.error.code !== undefined) {
                  code = responseObj.error.code;
                }
                if (responseObj.error.message) {
                  message = responseObj.error.message;
                }
                if (responseObj.error.details !== undefined) {
                  details = responseObj.error.details;
                }
              }
            } else {
              message = error.message || message;
            }
          } else if (error instanceof Error) {
            message = error.message || message;
          }

          // 如果还没有设置错误码，根据状态码确定错误码
          if (code === ErrorCode.INTERNAL_ERROR) {
            if (status === HttpStatus.UNAUTHORIZED) {
              code = ErrorCode.UNAUTHORIZED;
            } else if (status === HttpStatus.BAD_REQUEST) {
              code = ErrorCode.BAD_REQUEST;
            } else if (status === HttpStatus.FORBIDDEN) {
              code = ErrorCode.FORBIDDEN;
            } else if (status === HttpStatus.NOT_FOUND) {
              code = ErrorCode.NOT_FOUND;
            }
          }

          const errorResponse: ErrorResponse = {
            success: false,
            error: {
              code,
              message,
              ...(details !== undefined ? { details } : {}),
              timestamp: new Date().toISOString(),
              path: request.url,
            },
          };

          try {
            response.status(status).json(errorResponse);
            // 响应已成功发送，返回一个发出值的 Observable，避免 EmptyError
            // 注意：不能返回空 Observable，否则会导致 EmptyError
            return of(null);
          } catch (sendError) {
            // 如果发送失败，重新抛出原始异常
            return throwError(() => error);
          }
        } else {
          // 响应已发送，返回一个发出值的 Observable
          return of(null);
        }
      }),
    );
  }
}




































