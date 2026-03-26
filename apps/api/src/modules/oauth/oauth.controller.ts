import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { OAuthService } from './oauth.service.js';
import { BindOAuthAccountDto, FindOrCreateUserDto } from './dto/bind-oauth-account.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { OAUTH_PERMISSIONS } from './constants/permissions.constants.js';

/**
 * OAuth 控制器
 * 处理第三方账号绑定相关请求
 * 供 Gateway 服务内部调用
 */
@Controller('oauth')
export class OAuthController {
  constructor(private readonly oauthService: OAuthService) {}

  /**
   * 绑定第三方账号（需要用户已登录）
   * 注意：此接口应该通过 Gateway 调用，并且需要认证
   */
  @Post('bind/:userId')
  @HttpCode(HttpStatus.CREATED)
  @Permissions(OAUTH_PERMISSIONS.BIND, OAUTH_PERMISSIONS.WRITE)
  async bindAccount(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() bindDto: BindOAuthAccountDto,
  ) {
    return this.oauthService.bindAccount(userId, bindDto);
  }

  /**
   * 查找或创建用户（用于登录）
   * 公开接口，供 Gateway 在微信登录回调时调用
   */
  @Post('find-or-create')
  @Public()
  @HttpCode(HttpStatus.OK)
  async findOrCreateUser(@Body() findOrCreateDto: FindOrCreateUserDto) {
    return this.oauthService.findOrCreateUser(findOrCreateDto);
  }

  /**
   * 获取用户的第三方账号列表
   */
  @Get('accounts/:userId')
  @Permissions(OAUTH_PERMISSIONS.READ)
  async getUserAccounts(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.oauthService.getUserAccounts(userId);
  }
}



































