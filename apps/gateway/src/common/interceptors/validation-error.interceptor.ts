/**
 * 此拦截器已废弃
 * 验证错误现在由异常过滤器统一处理（HttpExceptionFilter 和 AllExceptionsFilter）
 *
 * 这个文件保留仅用于参考，不应再使用。
 * 请从拦截器模块和 main.ts 中移除对 ValidationErrorInterceptor 的引用。
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ErrorCode } from '../exceptions/error-codes.js';

/**
 * 验证错误拦截器
 * 格式化验证错误，然后让异常过滤器统一处理
 *
 * 此拦截器已废弃，验证错误现在由异常过滤器直接处理
 */
@Injectable()
export class ValidationErrorInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ValidationErrorInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // 不再处理验证错误，直接传递异常给异常过滤器
    return next.handle();
  }

  /**
   * 格式化验证错误信息
   * 将字符串数组转换为按字段分组的对象
   *
   * 此方法已移动到 BaseExceptionFilter
   */
  private formatValidationErrors(messages: string[]): Record<string, string[]> {
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
}
