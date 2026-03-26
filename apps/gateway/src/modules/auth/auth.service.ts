import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';
import { TokenService } from './services/token.service.js';
import { AuthCacheService } from './services/auth-cache.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import type { AuthResult, UserInfo } from './interfaces/auth-result.interface.js';
import { JwtPayload } from './interfaces/jwt-payload.interface.js';
import { ErrorCode } from '../../common/exceptions/error-codes.js';
import { randomUUID } from 'crypto';
import { WechatOAuthService } from './services/wechat-oauth.service.js';

/**
 * 认证服务
 * 负责认证业务逻辑
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly tokenService: TokenService,
    private readonly authCacheService: AuthCacheService,
    private readonly wechatOAuthService: WechatOAuthService,
  ) {}

  /**
   * 用户登录
   */
  async login(loginDto: LoginDto): Promise<AuthResult> {
    const servicesConfig = this.configService.getServicesConfig();

    try {
      // 调用 API 服务验证用户凭证
      const response = await firstValueFrom(
        this.httpService.post(
          `${servicesConfig.apiServiceUrl}/api/auth/validate`,
          {
            email: loginDto.email,
            password: loginDto.password,
          },
        ),
      );

      // API 服务响应格式: { success: true, data: {...user info...}, timestamp: "..." }
      // 或者直接返回 user info (如果没有使用拦截器)
      const responseData = response.data;
      
      // 检查是否是错误响应格式
      if (responseData && typeof responseData === 'object' && 'success' in responseData && !responseData.success) {
        // 这是错误响应，不应该出现在成功的情况下，但为了安全起见处理它
        const errorMessage = responseData.error?.message || 'Invalid credentials';
        const exception = new UnauthorizedException({
          code: ErrorCode.AUTH_LOGIN_FAILED,
          message: errorMessage,
        });
        throw exception;
      }

      const user = responseData?.data || responseData;

      if (!user || !user.id) {
        const exception = new UnauthorizedException({
          code: ErrorCode.AUTH_LOGIN_FAILED,
          message: 'Invalid credentials',
        });
        throw exception;
      }

      // 生成令牌对
      const tokenId = randomUUID();
      const jwtPayload: JwtPayload = {
        sub: user.id,
        tokenId,
        email: user.email,
        username: user.username,
        roles: user.roles || [],
        permissions: user.permissions || [],
      };

      const tokenPair = await this.tokenService.generateTokenPair(
        jwtPayload,
        tokenId,
      );

      // 缓存用户信息和令牌
      const userInfo: UserInfo = {
        id: user.id,
        email: user.email,
        username: user.username,
        roles: user.roles || [],
        permissions: user.permissions || [],
      };

      await Promise.all([
        this.authCacheService.cacheUser(user.id, userInfo),
        this.authCacheService.cacheToken(tokenId, user.id),
        this.authCacheService.cacheRefreshToken(
          tokenId,
          user.id,
          tokenId,
        ),
      ]);

      const result = {
        user: userInfo,
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.expiresIn,
      };

      return result;
    } catch (error: any) {
      // 记录登录失败
      // Axios 错误对象结构：error.response.status, error.response.data
      const errorResponse = error.response;
      const errorData = errorResponse?.data;
      // 正确获取 HTTP 状态码：Axios 错误中，状态码在 error.response.status
      const errorStatus = errorResponse?.status ?? error.status;
      
      // 提取错误消息：优先使用 API 服务返回的错误消息
      let errorMessage = 'Invalid credentials';
      if (errorData) {
        if (typeof errorData === 'object') {
          // 检查是否是标准错误响应格式 { success: false, error: { message: ... } }
          if (errorData.error && typeof errorData.error === 'object' && errorData.error.message) {
            errorMessage = errorData.error.message;
          } else if (errorData.message) {
            errorMessage = typeof errorData.message === 'string' ? errorData.message : 'Invalid credentials';
          }
        } else if (typeof errorData === 'string') {
          errorMessage = errorData;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      // 处理 401 未授权错误（最常见的登录失败情况）
      // 明确检查 errorResponse.status，因为这是 Axios 错误的标准结构
      if (errorResponse?.status === 401 || errorStatus === 401) {
        const exception = new UnauthorizedException({
          code: ErrorCode.AUTH_LOGIN_FAILED,
          message: errorMessage,
        });
        throw exception;
      }

      // 处理网络错误或其他连接错误
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
        const exception = new UnauthorizedException({
          code: ErrorCode.AUTH_LOGIN_FAILED,
          message: 'Service temporarily unavailable',
        });
        throw exception;
      }

      // 如果是其他 HTTP 错误（4xx），转换为 UnauthorizedException（因为这是登录失败）
      if (errorResponse?.status && typeof errorResponse.status === 'number' && errorResponse.status >= 400 && errorResponse.status < 500) {
        const exception = new UnauthorizedException({
          code: ErrorCode.AUTH_LOGIN_FAILED,
          message: errorMessage,
        });
        throw exception;
      }

      // 如果无法确定错误类型，默认抛出 UnauthorizedException（登录失败）
      // 重新抛出其他未预期的错误（会被 AllExceptionsFilter 捕获）
      const exception = new UnauthorizedException({
        code: ErrorCode.AUTH_LOGIN_FAILED,
        message: errorMessage || 'Login failed',
      });
      throw exception;
    }
  }

  /**
   * 用户注册
   * 注册成功后自动登录并返回JWT令牌
   */
  async register(registerDto: RegisterDto): Promise<AuthResult> {
    const servicesConfig = this.configService.getServicesConfig();

    try {
      // 调用 API 服务创建用户
      const response = await firstValueFrom(
        this.httpService.post(
          `${servicesConfig.apiServiceUrl}/api/users/register`,
          {
            username: registerDto.username,
            email: registerDto.email,
            password: registerDto.password,
          },
        ),
      );

      // API 服务响应格式: { success: true, data: {...user info...}, timestamp: "..." }
      // 或者直接返回 user info (如果没有使用拦截器)
      const user = response.data?.data || response.data;

      if (!user || !user.id) {
        throw new UnauthorizedException({
          code: ErrorCode.AUTH_LOGIN_FAILED,
          message: 'Registration failed',
        });
      }

      // 生成令牌对
      const tokenId = randomUUID();
      const jwtPayload: JwtPayload = {
        sub: user.id,
        tokenId,
        email: user.email,
        username: user.username,
        roles: user.roles || [],
        permissions: user.permissions || [],
      };

      const tokenPair = await this.tokenService.generateTokenPair(
        jwtPayload,
        tokenId,
      );

      // 缓存用户信息和令牌
      const userInfo: UserInfo = {
        id: user.id,
        email: user.email,
        username: user.username,
        roles: user.roles || [],
        permissions: user.permissions || [],
      };

      await Promise.all([
        this.authCacheService.cacheUser(user.id, userInfo),
        this.authCacheService.cacheToken(tokenId, user.id),
        this.authCacheService.cacheRefreshToken(
          tokenId,
          user.id,
          tokenId,
        ),
      ]);

      return {
        user: userInfo,
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.expiresIn,
      };
    } catch (error: any) {
      // 处理各种错误情况
      if (error.response?.status === 409) {
        // 邮箱或用户名已存在
        throw error;
      }
      if (error.response?.status === 400) {
        // 参数验证错误
        throw error;
      }
      throw error;
    }
  }

  /**
   * 刷新令牌
   */
  async refreshToken(refreshTokenDto: RefreshTokenDto): Promise<AuthResult> {
    try {
      // 验证刷新令牌
      const payload = await this.tokenService.verifyRefreshToken(
        refreshTokenDto.refreshToken,
      );

      // 从缓存获取刷新令牌信息
      const refreshTokenInfo = await this.authCacheService.getRefreshToken(
        payload.tokenId,
      );

      if (!refreshTokenInfo) {
        throw new UnauthorizedException({
          code: ErrorCode.AUTH_REFRESH_TOKEN_INVALID,
          message: 'Invalid refresh token',
        });
      }

      // 获取用户信息
      const userInfo = await this.authCacheService.getUser(
        refreshTokenInfo.userId,
      );

      if (!userInfo) {
        throw new UnauthorizedException({
          code: ErrorCode.AUTH_USER_NOT_FOUND,
          message: 'User not found',
        });
      }

      // 生成新的令牌对
      const newTokenId = randomUUID();
      const jwtPayload: JwtPayload = {
        sub: userInfo.id,
        tokenId: newTokenId,
        email: userInfo.email,
        username: userInfo.username,
        roles: userInfo.roles || [],
        permissions: userInfo.permissions || [],
      };

      const tokenPair = await this.tokenService.generateTokenPair(
        jwtPayload,
        newTokenId,
      );

      // 更新缓存
      await Promise.all([
        this.authCacheService.cacheToken(newTokenId, userInfo.id),
        this.authCacheService.cacheRefreshToken(
          newTokenId,
          userInfo.id,
          newTokenId,
        ),
        // 删除旧的刷新令牌
        this.authCacheService.deleteRefreshToken(payload.tokenId),
      ]);

      return {
        user: userInfo,
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.expiresIn,
      };
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException({
          code: ErrorCode.AUTH_REFRESH_TOKEN_EXPIRED,
          message: 'Refresh token expired',
        });
      }
      throw error;
    }
  }

  /**
   * 用户登出
   */
  async logout(
    userId: string,
    tokenId?: string,
    refreshToken?: string,
  ): Promise<void> {
    // 将令牌加入黑名单
    if (tokenId) {
      await this.authCacheService.blacklistToken(tokenId);
      await this.authCacheService.deleteToken(tokenId);
    }

    // 若前端传入 refresh token，同步使其失效
    if (refreshToken) {
      try {
        const payload = await this.tokenService.verifyRefreshToken(refreshToken);
        await this.authCacheService.deleteRefreshToken(payload.tokenId);
      } catch {
        // 非法或过期的 refresh token 不阻塞登出流程
      }
    }

    // 清除用户缓存
    await this.authCacheService.clearUserCache(userId);
  }

  /**
   * 微信登录
   */
  async wechatLogin(code: string): Promise<AuthResult> {
    const servicesConfig = this.configService.getServicesConfig();

    try {
      // 1. 使用 code 换取 access_token
      const tokenResponse = await this.wechatOAuthService.getAccessToken(code);

      // 2. 获取微信用户信息
      const wechatUserInfo = await this.wechatOAuthService.getUserInfo(
        tokenResponse.access_token,
        tokenResponse.openid,
      );

      // 3. 调用 API 服务查找或创建用户
      const response = await firstValueFrom(
        this.httpService.post(
          `${servicesConfig.apiServiceUrl}/api/oauth/find-or-create`,
          {
            provider: 'wechat',
            providerUserId: wechatUserInfo.openid,
            providerUsername: wechatUserInfo.nickname,
            profileData: {
              nickname: wechatUserInfo.nickname,
              sex: wechatUserInfo.sex,
              province: wechatUserInfo.province,
              city: wechatUserInfo.city,
              country: wechatUserInfo.country,
              headimgurl: wechatUserInfo.headimgurl,
              unionid: wechatUserInfo.unionid,
            },
          },
        ),
      );

      const user = response.data.data || response.data;

      if (!user || !user.id) {
        throw new UnauthorizedException({
          code: ErrorCode.AUTH_LOGIN_FAILED,
          message: '微信登录失败',
        });
      }

      // 4. 生成令牌对
      const tokenId = randomUUID();
      const jwtPayload: JwtPayload = {
        sub: user.id,
        tokenId,
        email: user.email,
        username: user.username,
        roles: user.roles || [],
        permissions: user.permissions || [],
      };

      const tokenPair = await this.tokenService.generateTokenPair(
        jwtPayload,
        tokenId,
      );

      // 5. 缓存用户信息和令牌
      const userInfo: UserInfo = {
        id: user.id,
        email: user.email,
        username: user.username,
        roles: user.roles || [],
        permissions: user.permissions || [],
      };

      await Promise.all([
        this.authCacheService.cacheUser(user.id, userInfo),
        this.authCacheService.cacheToken(tokenId, user.id),
        this.authCacheService.cacheRefreshToken(
          tokenId,
          user.id,
          tokenId,
        ),
      ]);

      return {
        user: userInfo,
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.expiresIn,
      };
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new UnauthorizedException({
          code: ErrorCode.AUTH_LOGIN_FAILED,
          message: '微信登录失败',
        });
      }
      throw error;
    }
  }

  /**
   * 获取微信授权 URL
   */
  getWechatAuthorizationUrl(state?: string): string {
    return this.wechatOAuthService.getAuthorizationUrl(state);
  }

  /**
   * 验证用户
   */
  async validateUser(userId: string): Promise<UserInfo | null> {
    // 先从缓存获取
    let userInfo = await this.authCacheService.getUser(userId);

    if (!userInfo) {
      // 如果缓存中没有，从 API 服务获取
      const servicesConfig = this.configService.getServicesConfig();
      try {
        const response = await firstValueFrom(
          this.httpService.get(
            `${servicesConfig.apiServiceUrl}/api/users/${userId}`,
          ),
        );
        userInfo = {
          id: response.data.id,
          email: response.data.email,
          username: response.data.username,
          roles: response.data.roles || [],
          permissions: response.data.permissions || [],
        };
        // 缓存用户信息
        await this.authCacheService.cacheUser(userId, userInfo);
      } catch (error) {
        return null;
      }
    }

    return userInfo;
  }
}


