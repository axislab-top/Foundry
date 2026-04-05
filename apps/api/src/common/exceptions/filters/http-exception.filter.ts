import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';
import { BaseExceptionFilter } from './base-exception.filter.js';

/**
 * HTTP 异常过滤器
 * 处理 HTTP 异常
 */
@Catch(HttpException)
export class HttpExceptionFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  constructor() {
    super(HttpExceptionFilter.name);
  }

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();
    const status = exception.getStatus();

    // 记录日志
    this.logException(exception, request, status);

    // 处理 HttpException 响应
    const { message, details, code } =
      this.handleHttpExceptionResponse(exception);

    // 发送错误响应
    this.sendErrorResponse(response, request, status, code, message, details);
  }
}
