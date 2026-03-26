import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Redirect,
  Res,
  Req,
  HttpException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Response, Request } from '../../common/types/express.types.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { LogoutDto } from './dto/logout.dto.js';
import { WechatCallbackDto } from './dto/wechat-login.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RateLimitGuard } from '../rate-limiting/guards/rate-limit.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { RateLimit } from '../../common/decorators/rate-limit.decorator.js';
import type { UserInfo } from './interfaces/auth-result.interface.js';
import { createLogger, LogLevel } from '@service/logging';

const logger = createLogger({
  service: 'gateway-auth-controller',
  environment: process.env.NODE_ENV || 'development',
  level: LogLevel.DEBUG,
});

/**
 * 认证控制器
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Public()
  @ApiOperation({ summary: '用户注册', description: '用户自主注册，注册成功后自动登录并返回 JWT 令牌' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: '注册成功，返回用户信息和访问令牌、刷新令牌' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 409, description: '邮箱或用户名已存在' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  // 注意：不使用 @HttpCode 装饰器，让 TransformInterceptor 和异常过滤器来处理状态码
  // 这样在异常情况下，异常过滤器可以正确设置状态码
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({
    ttl: 60, // 60秒时间窗口
    maxRequests: 5, // 每个IP最多5次请求
    skipSuccessfulRequests: false, // 失败的请求也计入限流
  })
  @ApiOperation({ summary: '用户登录', description: '使用邮箱和密码登录，返回 JWT 令牌。每个IP地址在60秒内最多允许5次登录尝试' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: '登录成功，返回访问令牌和刷新令牌' })
  @ApiResponse({ status: 401, description: '凭证无效' })
  @ApiResponse({ status: 429, description: '请求过于频繁，每个IP地址在60秒内最多允许5次登录尝试' })
  async login(@Body() loginDto: LoginDto, @Req() req: Request) {
    try {
      const result = await this.authService.login(loginDto);
      return result;
    } catch (error: any) {
      throw error;
    }
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Public()
  @UseGuards(AuthGuard('refresh'))
  @ApiOperation({ summary: '刷新令牌', description: '使用刷新令牌获取新的访问令牌' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 200, description: '令牌刷新成功' })
  @ApiResponse({ status: 401, description: '刷新令牌无效' })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenDto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '用户登出', description: '登出当前用户，使令牌失效' })
  @ApiBody({ type: LogoutDto })
  @ApiResponse({ status: 200, description: '登出成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  async logout(
    @CurrentUser() user: UserInfo,
    @Body() logoutDto: LogoutDto,
  ) {
    await this.authService.logout(user.id, user.tokenId, logoutDto.refreshToken);
    return { message: 'Logout successful' };
  }

  /**
   * 获取微信授权 URL
   */
  @Get('wechat/authorize')
  @Public()
  @HttpCode(HttpStatus.OK)
  async getWechatAuthorizeUrl(@Query('state') state?: string) {
    const url = this.authService.getWechatAuthorizationUrl(state);
    return {
      success: true,
      data: {
        url,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 微信登录回调
   */
  @Get('wechat/callback')
  @Public()
  async wechatCallback(
    @Query() callbackDto: WechatCallbackDto,
    @Res() res: Response,
  ) {
    try {
      const result = await this.authService.wechatLogin(callbackDto.code);

      // 重定向到前端页面，携带 token
      // 注意：实际使用时应该重定向到前端页面，这里只是示例
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const redirectUrl = new URL('/auth/callback', frontendUrl);
      redirectUrl.searchParams.set('access_token', result.accessToken);
      redirectUrl.searchParams.set('refresh_token', result.refreshToken);

      res.redirect(redirectUrl.toString());
    } catch (error) {
      // 登录失败，重定向到错误页面
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const redirectUrl = new URL('/auth/error', frontendUrl);
      redirectUrl.searchParams.set('error', 'wechat_login_failed');
      res.redirect(redirectUrl.toString());
    }
  }
}

