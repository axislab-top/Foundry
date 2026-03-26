import {
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from '../../types/express.types.js';
import { ErrorResponse } from '../interfaces/error-response.interface.js';
import { ErrorCode, ErrorMessages } from '../error-codes.js';

/**
 * 异常过滤器基类
 * 提供公共的异常处理逻辑
 */
export abstract class BaseExceptionFilter implements ExceptionFilter {
  protected readonly logger: Logger;

  constructor(loggerContext: string) {
    this.logger = new Logger(loggerContext);
  }

  /**
   * 格式化验证错误信息
   * 将字符串数组转换为按字段分组的对象
   */
  protected formatValidationErrors(
    messages: string[],
  ): Record<string, string[]> {
    const errors: Record<string, string[]> = {};

    messages.forEach((msg) => {
      let field: string | null = null;

      // 处理不同格式的错误消息：
      // 1. "property username should not exist" -> 提取 "username"
      const propertyMatch = msg.match(/property\s+(\w+)\s+should/);
      if (propertyMatch) {
        field = propertyMatch[1];
      } else {
        // 2. "email must be an email" -> 提取 "email"
        // 3. "email should not be empty" -> 提取 "email"
        // 4. "password must be longer than or equal to 6 characters" -> 提取 "password"
        const fieldMatch = msg.match(/^(\w+)\s+(must|should)/);
        if (fieldMatch) {
          field = fieldMatch[1];
        }
      }

      if (field) {
        if (!errors[field]) {
          errors[field] = [];
        }
        errors[field].push(msg);
      } else {
        // 如果无法提取字段名，使用 "general" 作为键
        if (!errors['general']) {
          errors['general'] = [];
        }
        errors['general'].push(msg);
      }
    });

    return errors;
  }

  /**
   * 根据 HTTP 状态码获取错误码
   * 支持从异常响应中读取自定义错误码
   */
  protected getErrorCode(
    status: number,
    exceptionResponse?: any,
    hasValidationErrors: boolean = false,
  ): ErrorCode {
    // 如果有验证错误，即使状态码是 400，也返回 VALIDATION_ERROR
    if (hasValidationErrors && status === HttpStatus.BAD_REQUEST) {
      return ErrorCode.VALIDATION_ERROR;
    }

    // 优先使用异常响应中的错误码
    if (
      exceptionResponse &&
      typeof exceptionResponse === 'object' &&
      exceptionResponse.code &&
      typeof exceptionResponse.code === 'number'
    ) {
      return exceptionResponse.code as ErrorCode;
    }

    // 根据 HTTP 状态码映射错误码
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.BAD_REQUEST;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.RECORD_ALREADY_EXISTS;
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return ErrorCode.VALIDATION_ERROR;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMIT_EXCEEDED;
      case HttpStatus.SERVICE_UNAVAILABLE:
        return ErrorCode.ROUTING_SERVICE_UNAVAILABLE;
      case HttpStatus.GATEWAY_TIMEOUT:
        return ErrorCode.ROUTING_SERVICE_TIMEOUT;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }

  /**
   * 处理 HttpException 响应
   * 提取消息、详情和错误码
   */
  protected handleHttpExceptionResponse(
    exception: HttpException,
  ): {
    message: string;
    details?: any;
    code: ErrorCode;
    hasValidationErrors: boolean;
  } {
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    let message: string;
    let details: any;
    let hasValidationErrors = false;

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null
    ) {
      const responseObj = exceptionResponse as {
        message?: string | string[];
        details?: any;
        code?: ErrorCode;
        [key: string]: any;
      };

      // 检查是否是验证错误（message 是数组）
      if (Array.isArray(responseObj.message)) {
        // 这是 ValidationPipe 的验证错误
        hasValidationErrors = true;
        message = 'Validation failed';
        details = this.formatValidationErrors(responseObj.message);
      } else {
        // 普通错误消息
        message =
          (typeof responseObj.message === 'string'
            ? responseObj.message
            : exception.message) || exception.message;

        // 检查是否有 details 字段
        if (responseObj.details !== undefined) {
          details = responseObj.details;
        }
      }
    } else {
      message = exception.message;
    }

    const code = this.getErrorCode(status, exceptionResponse, hasValidationErrors);

    const result = { message, details, code, hasValidationErrors };

    return result;
  }

  /**
   * 检查响应是否已经发送
   */
  protected isResponseSent(response: Response): boolean {
    return response.headersSent || response.writableEnded;
  }

  /**
   * 发送错误响应
   */
  protected sendErrorResponse(
    response: Response,
    request: any,
    status: number,
    code: ErrorCode,
    message: string,
    details?: any,
  ): void {
    // 检查响应是否已经被发送
    if (this.isResponseSent(response)) {
      this.logger.warn('Response already sent, cannot send error response', {
        status,
        code,
        message,
        path: request.url,
      });
      return;
    }

    // 构建错误响应对象，只有当 details 不是 undefined 时才包含它
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
      // 确保即使状态码已经被设置，也能正确设置新的状态码
      // 使用 status() 方法会覆盖之前的状态码
      response.status(status);
      
      // 然后发送 JSON 响应
      response.json(errorResponse);
    } catch (error) {
      // 如果发送响应时出错，记录错误但不抛出异常（避免无限循环）
      this.logger.error('Failed to send error response', {
        error: error instanceof Error ? error.message : String(error),
        status,
        code,
        message,
        path: request.url,
      });
    }
  }

  /**
   * 记录异常日志
   * 根据异常类型选择合适的日志级别
   */
  protected logException(
    exception: unknown,
    request: any,
    status: number,
  ): void {
    const exceptionType =
      exception instanceof Error ? exception.constructor.name : typeof exception;
    const exceptionMessage =
      exception instanceof Error ? exception.message : String(exception);

    // HttpException (4xx) 使用 warn 级别，其他使用 error 级别
    const isHttpException = exception instanceof HttpException;
    const isClientError = isHttpException && status >= 400 && status < 500;

    const logData = {
      exceptionType,
      status,
      message: exceptionMessage,
      path: request.url,
      method: request.method,
    };

    if (isClientError) {
      this.logger.warn('Client error', logData);
    } else {
      this.logger.error('Server error', {
        ...logData,
        stack: exception instanceof Error ? exception.stack : undefined,
      });
    }
  }

  /**
   * 子类需要实现的具体异常处理逻辑
   */
  abstract catch(exception: unknown, host: ArgumentsHost): void;
}

