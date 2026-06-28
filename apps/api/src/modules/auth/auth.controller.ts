import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  ParseUUIDPipe,
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
import { RegisterAdminDto } from '../admin-users/dto/register-admin.dto.js';
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

  @Post('admin/validate')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiOperation({ summary: '验证管理员凭证', description: '验证管理员邮箱和密码，供 Gateway 管理后台登录调用' })
  @ApiBody({ type: ValidateCredentialsDto })
  @ApiResponse({ status: 200, description: '验证成功，返回管理员信息' })
  @ApiResponse({ status: 401, description: '凭证无效' })
  async validateAdmin(@Body() validateDto: ValidateCredentialsDto) {
    return this.authService.validateAdminCredentials(validateDto.email, validateDto.password);
  }

  @Post('admin/register')
  @HttpCode(HttpStatus.CREATED)
  @Public()
  @ApiOperation({ summary: '管理员注册', description: '创建管理员账号，使用独立管理员数据表' })
  @ApiBody({ type: RegisterAdminDto })
  @ApiResponse({ status: 201, description: '注册成功，返回管理员信息' })
  async registerAdmin(@Body() registerDto: RegisterAdminDto) {
    const adminUser = await this.authService.registerAdmin(registerDto);
    const { passwordHash, ...result } = adminUser;
    return result;
  }

  @Get('users/:id')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiOperation({ summary: '查询用户信息', description: '供 Gateway refresh / JWT 校验时回源普通用户账号信息' })
  @ApiResponse({ status: 200, description: '查询成功' })
  @ApiResponse({ status: 404, description: '用户不存在' })
  async getUserById(@Param('id', ParseUUIDPipe) id: string) {
    return this.authService.findUserByIdForGateway(id);
  }

  @Get('admin/users/:id')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiOperation({ summary: '查询管理员信息', description: '供 Gateway JWT 校验时回源管理员账号信息' })
  @ApiResponse({ status: 200, description: '查询成功' })
  @ApiResponse({ status: 404, description: '管理员不存在' })
  async getAdminById(@Param('id', ParseUUIDPipe) id: string) {
    const adminUser = await this.authService.findAdminById(id);
    if (!adminUser) {
      return null;
    }
    return adminUser;
  }
}

