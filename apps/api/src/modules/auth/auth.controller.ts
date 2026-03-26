import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { ValidateCredentialsDto } from './dto/validate-credentials.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { createLogger, LogLevel } from '@service/logging';
import type { Request } from 'express';

const logger = createLogger({
  service: 'api-auth-controller',
  environment: process.env.NODE_ENV || 'development',
  level: LogLevel.DEBUG,
});

/**
 * 认证控制器
 * 提供认证相关的API端点
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  /**
   * 验证用户凭证
   * Gateway服务调用此端点进行登录验证
   */
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @Public() // 公开接口，不需要认证
  @ApiOperation({ summary: '验证用户凭证', description: '验证用户邮箱和密码，供 Gateway 服务调用' })
  @ApiBody({ type: ValidateCredentialsDto })
  @ApiResponse({ status: 200, description: '验证成功，返回用户信息' })
  @ApiResponse({ status: 401, description: '凭证无效' })
  async validate(@Body() validateDto: ValidateCredentialsDto, @Req() req: Request) {
    try {
      const result = await this.authService.validateCredentials(
        validateDto.email,
        validateDto.password,
        req.ip,
        req.headers['user-agent'],
      );
      return result;
    } catch (error: any) {
      logger.error('AuthController.validate() - 捕获到异常', {
        email: validateDto.email,
        errorType: error?.constructor?.name,
        errorMessage: error?.message,
        errorStatus: error?.status,
        errorCode: error?.code,
        errorResponse: error?.response,
        stack: error?.stack,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }
}

