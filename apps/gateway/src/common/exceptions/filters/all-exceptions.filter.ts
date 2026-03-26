import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from '../../types/express.types.js';
import { ErrorCode, ErrorMessages } from '../error-codes.js';
import { BaseExceptionFilter } from './base-exception.filter.js';
import { GatewayException } from './gateway-exception.filter.js';

/**
 * 全局异常过滤器
 * 捕获所有未处理的异常
 * 
 * 注意：这个过滤器应该最后执行（作为后备），
 * 因为 NestJS 会按照 @Catch() 装饰器的具体程度匹配异常
 */
@Catch()
export class AllExceptionsFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  constructor() {
    super(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    // 检查响应是否已经被发送
    if (this.isResponseSent(response)) {
      // 如果响应已经发送，只记录日志，不发送错误响应
      this.logException(exception, request, HttpStatus.INTERNAL_SERVER_ERROR);
      return;
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = ErrorMessages[ErrorCode.INTERNAL_ERROR];
    let code = ErrorCode.INTERNAL_ERROR;
    let details: any = undefined;

    if (exception instanceof GatewayException) {
      status = exception.statusCode;
      message = exception.message || ErrorMessages[exception.code];
      code = exception.code;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      // HttpException 应该由 HttpExceptionFilter 处理
      // 如果执行到这里，说明 HttpExceptionFilter 可能没有被调用，需要处理它

      // 处理 HttpException
      status = exception.getStatus();
      const { message: msg, details: det, code: c } =
        this.handleHttpExceptionResponse(exception);
      message = msg;
      details = det;
      code = c;
    } else if (exception instanceof Error) {
      message = exception.message;
      // 在生产环境中，不暴露内部错误详情
      if (process.env.NODE_ENV === 'development') {
        details = {
          stack: exception.stack,
          name: exception.name,
        };
      }
    }

    // 记录日志（使用 error 级别，因为这是未处理的异常）
    this.logException(exception, request, status);

    // 发送错误响应
    this.sendErrorResponse(response, request, status, code, message, details);
  }
}
