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
import type { Response, Request } from '../../common/types/express.types.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { LogoutDto } from './dto/logout.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { ResetPasswordWithCodeDto } from './dto/reset-password-with-code.dto.js';
import { SendRegistrationCodeDto } from './dto/send-registration-code.dto.js';
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

  @Post('register/send-verification-code')
  @HttpCode(HttpStatus.OK)
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({
    ttl: 60,
    maxRequests: 5,
    skipSuccessfulRequests: false,
  })
  @ApiOperation({ summary: '发送注册验证码', description: '向邮箱发送 6 位注册验证码' })
  @ApiBody({ type: SendRegistrationCodeDto })
  async sendRegistrationVerificationCode(@Body() dto: SendRegistrationCodeDto) {
    return this.authService.sendRegistrationVerificationCode(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
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

  /**
   * 管理员登录（仅允许管理员角色）。
   */
  @Post('admin/login')
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({
    ttl: 60,
    maxRequests: 5,
    skipSuccessfulRequests: false,
  })
  @ApiOperation({ summary: '管理员登录', description: '使用邮箱和密码登录，返回 JWT 令牌。仅允许 admin/superadmin 账号登录。' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: '登录成功，返回访问令牌和刷新令牌' })
  @ApiResponse({ status: 401, description: '凭证无效或权限不足' })
  @ApiResponse({ status: 429, description: '请求过于频繁' })
  async adminLogin(@Body() loginDto: LoginDto) {
    return this.authService.adminLogin(loginDto);
  }

  @Post('admin/register')
  @HttpCode(HttpStatus.CREATED)
  @Public()
  @ApiOperation({ summary: '管理员注册', description: '管理后台专用注册，使用独立管理员账号体系' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: '管理员注册成功，返回访问令牌和刷新令牌' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 409, description: '邮箱或用户名已存在' })
  async adminRegister(@Body() registerDto: RegisterDto) {
    return this.authService.adminRegister(registerDto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Public()
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

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({
    ttl: 60,
    maxRequests: 3,
    skipSuccessfulRequests: false,
  })
  @ApiOperation({ summary: '忘记密码', description: '向注册邮箱发送密码重置链接' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({ status: 200, description: '请求已受理（无论邮箱是否存在）' })
  @ApiResponse({ status: 429, description: '请求过于频繁' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('forgot-password/send-code')
  @HttpCode(HttpStatus.OK)
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({
    ttl: 60,
    maxRequests: 3,
    skipSuccessfulRequests: false,
  })
  @ApiOperation({ summary: '发送重置密码验证码', description: '向邮箱发送 6 位重置密码验证码' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({ status: 200, description: '验证码已发送' })
  @ApiResponse({ status: 429, description: '请求过于频繁' })
  async sendResetPasswordCode(@Body() dto: ForgotPasswordDto) {
    return this.authService.sendResetPasswordCode(dto);
  }

  @Post('reset-password-with-code')
  @HttpCode(HttpStatus.OK)
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({
    ttl: 60,
    maxRequests: 5,
    skipSuccessfulRequests: false,
  })
  @ApiOperation({ summary: '使用验证码重置密码', description: '使用邮箱验证码设置新密码' })
  @ApiBody({ type: ResetPasswordWithCodeDto })
  @ApiResponse({ status: 200, description: '密码重置成功' })
  @ApiResponse({ status: 400, description: '验证码无效或已过期' })
  async resetPasswordWithCode(@Body() dto: ResetPasswordWithCodeDto) {
    return this.authService.resetPasswordWithCode(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({
    ttl: 60,
    maxRequests: 5,
    skipSuccessfulRequests: false,
  })
  @ApiOperation({ summary: '重置密码', description: '使用邮件中的令牌设置新密码' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, description: '密码重置成功' })
  @ApiResponse({ status: 400, description: '令牌无效或已过期' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
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

