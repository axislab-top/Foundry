import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import type { Response } from '../../types/express.types.js';
import { ErrorCode, ErrorMessages } from '../error-codes.js';
import { BaseExceptionFilter } from './base-exception.filter.js';

/**
 * 网关特定异常
 */
export class GatewayException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    public readonly message: string,
    public readonly statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR,
    public readonly details?: any,
  ) {
    super(
      {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
      },
      statusCode,
    );
    this.name = 'GatewayException';
  }
}

/**
 * 网关异常过滤器
 * 处理网关特定的异常
 */
@Catch(GatewayException)
export class GatewayExceptionFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  constructor() {
    super(GatewayExceptionFilter.name);
  }

  catch(exception: GatewayException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    // 检查响应是否已经被发送
    if (this.isResponseSent(response)) {
      // 如果响应已经发送，只记录日志，不发送错误响应
      this.logException(exception, request, exception.statusCode);
      return;
    }

    // 记录日志
    this.logException(exception, request, exception.statusCode);

    // 发送错误响应
    this.sendErrorResponse(
      response,
      request,
      exception.statusCode,
      exception.code,
      exception.message || ErrorMessages[exception.code],
      exception.details,
    );
  }
}
