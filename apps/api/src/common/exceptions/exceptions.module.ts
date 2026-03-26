import { Module, Global } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './filters/all-exceptions.filter.js';
import { HttpExceptionFilter } from './filters/http-exception.filter.js';

/**
 * 异常处理模块
 * 全局模块，注册全局异常过滤器
 * 
 * 异常过滤器执行顺序说明：
 * - NestJS 使用 @Catch() 装饰器来匹配异常类型
 * - 当异常发生时，NestJS 会按照 @Catch() 装饰器的具体程度匹配异常
 * - 匹配规则：更具体的 @Catch() 装饰器会优先匹配
 * - HttpExceptionFilter (@Catch(HttpException)) 更具体，会优先匹配所有 HttpException
 * - AllExceptionsFilter (@Catch()) 最通用，会匹配所有未匹配的异常
 * 
 * 注册顺序：按照从最具体到最通用的顺序注册，虽然 NestJS 会根据 @Catch() 装饰器匹配，
 * 但按这个顺序注册更符合逻辑，且有助于避免潜在的重复处理问题
 */
@Global()
@Module({
  providers: [
    AllExceptionsFilter,
    HttpExceptionFilter,
    // 注册顺序：从最具体到最通用（虽然 NestJS 会根据 @Catch() 装饰器匹配，
    // 但这样注册更清晰，且有助于避免潜在的重复处理问题）
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter, // 更具体的（@Catch(HttpException)），优先处理 HTTP 异常
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter, // 最通用的（@Catch()），作为后备
    },
  ],
  exports: [AllExceptionsFilter, HttpExceptionFilter],
})
export class ExceptionsModule {}



































