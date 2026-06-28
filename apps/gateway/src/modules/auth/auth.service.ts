import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
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
        authType: 'user',
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

      // 下游服务不可达/超时应返回 503，而不是登录失败 401
      if (
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNABORTED'
      ) {
        throw new ServiceUnavailableException({
          code: ErrorCode.ROUTING_SERVICE_UNAVAILABLE,
          message: 'Service temporarily unavailable',
        });
      }

      // 其他 4xx 视为登录失败
      if (errorResponse?.status && typeof errorResponse.status === 'number' && errorResponse.status >= 400 && errorResponse.status < 500) {
        const exception = new UnauthorizedException({
          code: ErrorCode.AUTH_LOGIN_FAILED,
          message: errorMessage,
        });
        throw exception;
      }

      // 5xx 或未知错误按服务不可用处理，避免误导为凭证错误
      if (
        (typeof errorResponse?.status === 'number' && errorResponse.status >= 500) ||
        !errorResponse
      ) {
        throw new ServiceUnavailableException({
          code: ErrorCode.ROUTING_SERVICE_UNAVAILABLE,
          message: errorMessage || 'Service temporarily unavailable',
        });
      }

      throw error;
    }
  }

  /**
   * 管理员登录（独立管理员认证入口）。
   */
  async adminLogin(loginDto: LoginDto): Promise<AuthResult> {
    const servicesConfig = this.configService.getServicesConfig();
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${servicesConfig.apiServiceUrl}/api/auth/admin/validate`, {
          email: loginDto.email,
          password: loginDto.password
        })
      );

      const adminUser = response.data?.data || response.data;
      if (!adminUser || !adminUser.id) {
        throw new UnauthorizedException({
          code: ErrorCode.AUTH_LOGIN_FAILED,
          message: 'Invalid credentials',
        });
      }

      const tokenId = randomUUID();
      const jwtPayload: JwtPayload = {
        sub: adminUser.id,
        tokenId,
        authType: 'admin',
        email: adminUser.email,
        username: adminUser.username,
        roles: adminUser.roles || [],
        permissions: adminUser.permissions || []
      };

      const tokenPair = await this.tokenService.generateTokenPair(jwtPayload, tokenId);
      const userInfo: UserInfo = {
        id: adminUser.id,
        email: adminUser.email,
        username: adminUser.username,
        roles: adminUser.roles || [],
        permissions: adminUser.permissions || []
      };

      await Promise.all([
        this.authCacheService.cacheUser(adminUser.id, userInfo),
        this.authCacheService.cacheToken(tokenId, adminUser.id),
        this.authCacheService.cacheRefreshToken(tokenId, adminUser.id, tokenId)
      ]);

      return {
        user: userInfo,
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.expiresIn
      };
    } catch (error: any) {
      const errorResponse = error?.response;
      const errorData = errorResponse?.data;
      const errorStatus = errorResponse?.status ?? error?.status;

      let errorMessage = 'Invalid credentials';
      if (errorData) {
        if (typeof errorData === 'object') {
          if (
            errorData.error &&
            typeof errorData.error === 'object' &&
            errorData.error.message
          ) {
            errorMessage = errorData.error.message;
          } else if (errorData.message) {
            errorMessage =
              typeof errorData.message === 'string'
                ? errorData.message
                : 'Invalid credentials';
          }
        } else if (typeof errorData === 'string') {
          errorMessage = errorData;
        }
      } else if (error?.message) {
        errorMessage = error.message;
      }

      if (errorResponse?.status === 401 || errorStatus === 401) {
        throw new UnauthorizedException({
          code: ErrorCode.AUTH_LOGIN_FAILED,
          message: errorMessage,
        });
      }

      if (
        error?.code === 'ECONNREFUSED' ||
        error?.code === 'ETIMEDOUT' ||
        error?.code === 'ENOTFOUND' ||
        error?.code === 'ECONNABORTED'
      ) {
        throw new ServiceUnavailableException({
          code: ErrorCode.ROUTING_SERVICE_UNAVAILABLE,
          message: 'Service temporarily unavailable',
        });
      }

      if (
        errorResponse?.status &&
        typeof errorResponse.status === 'number' &&
        errorResponse.status >= 400 &&
        errorResponse.status < 500
      ) {
        throw new UnauthorizedException({
          code: ErrorCode.AUTH_LOGIN_FAILED,
          message: errorMessage,
        });
      }

      if (
        (typeof errorResponse?.status === 'number' && errorResponse.status >= 500) ||
        !errorResponse
      ) {
        throw new ServiceUnavailableException({
          code: ErrorCode.ROUTING_SERVICE_UNAVAILABLE,
          message: errorMessage || 'Service temporarily unavailable',
        });
      }

      throw error;
    }
  }

  async adminRegister(registerDto: RegisterDto): Promise<AuthResult> {
    const servicesConfig = this.configService.getServicesConfig();
    await firstValueFrom(
      this.httpService.post(`${servicesConfig.apiServiceUrl}/api/auth/admin/register`, {
        username: registerDto.username,
        email: registerDto.email,
        password: registerDto.password
      })
    );

    return this.adminLogin({ email: registerDto.email, password: registerDto.password });
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
            verificationCode: registerDto.verificationCode,
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
        authType: 'user',
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
      this.throwMappedDownstreamError(error, 'Registration failed');
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

      const graceResult = await this.authCacheService.getRefreshRotationGrace(
        payload.tokenId,
      );
      if (graceResult) {
        return graceResult;
      }

      // 从缓存获取刷新令牌信息（缓存丢失时可从有效 JWT 重建，避免 Gateway/Redis 重启误踢用户）
      let refreshTokenInfo = await this.authCacheService.getRefreshToken(
        payload.tokenId,
      );

      if (!refreshTokenInfo) {
        refreshTokenInfo = await this.rehydrateRefreshSession(payload);
        if (!refreshTokenInfo) {
          throw new UnauthorizedException({
            code: ErrorCode.AUTH_REFRESH_TOKEN_INVALID,
            message: 'Invalid refresh token',
          });
        }
      }

      // 如果旧访问令牌已被撤销，拒绝继续刷新（会话已失效）
      const isSessionRevoked = await this.authCacheService.isTokenBlacklisted(
        refreshTokenInfo.tokenId,
      );
      if (isSessionRevoked) {
        throw new UnauthorizedException({
          code: ErrorCode.AUTH_REFRESH_TOKEN_INVALID,
          message: 'Session has been revoked',
        });
      }

      // 获取用户信息
      let userInfo = await this.authCacheService.getUser(
        refreshTokenInfo.userId,
      );

      // 用户缓存可能早于 refresh token 过期，缓存未命中时回源 API 兜底拉取用户信息。
      if (!userInfo) {
        userInfo = await this.fetchUserInfoForRefresh(refreshTokenInfo.userId);
        if (userInfo) {
          await this.authCacheService.cacheUser(userInfo.id, userInfo);
        }
      }

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
        authType: Array.isArray(userInfo.roles) && userInfo.roles.includes('admin') ? 'admin' : 'user',
        email: userInfo.email,
        username: userInfo.username,
        roles: userInfo.roles || [],
        permissions: userInfo.permissions || [],
      };

      const tokenPair = await this.tokenService.generateTokenPair(
        jwtPayload,
        newTokenId,
      );

      const result: AuthResult = {
        user: userInfo,
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.expiresIn,
      };

      // 更新缓存：先写入新会话与轮换宽限期，再吊销旧 refresh（并发标签页可幂等重试）
      await Promise.all([
        this.authCacheService.cacheToken(newTokenId, userInfo.id),
        this.authCacheService.cacheRefreshToken(
          newTokenId,
          userInfo.id,
          newTokenId,
        ),
        this.authCacheService.setRefreshRotationGrace(payload.tokenId, result),
        this.authCacheService.blacklistToken(
          payload.tokenId,
          this.authCacheService.refreshTokenBlacklistTtlSeconds(),
        ),
        this.authCacheService.deleteRefreshToken(payload.tokenId),
      ]);

      return result;
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException({
          code: ErrorCode.AUTH_REFRESH_TOKEN_EXPIRED,
          message: 'Refresh token expired',
        });
      }
      if (error.name === 'JsonWebTokenError' || error.name === 'NotBeforeError') {
        throw new UnauthorizedException({
          code: ErrorCode.AUTH_REFRESH_TOKEN_INVALID,
          message: 'Invalid refresh token',
        });
      }
      throw error;
    }
  }

  /**
   * 缓存未命中但 JWT 仍有效：重建 refresh 会话（Gateway/Redis 重启场景）。
   * 已轮换或已登出的 tokenId 会在黑名单中，不会重建。
   */
  private async rehydrateRefreshSession(
    payload: { sub: string; tokenId: string },
  ): Promise<{ userId: string; tokenId: string } | null> {
    if (await this.authCacheService.isTokenBlacklisted(payload.tokenId)) {
      return null;
    }

    let userInfo = await this.authCacheService.getUser(payload.sub);
    if (!userInfo) {
      userInfo = await this.fetchUserInfoForRefresh(payload.sub);
      if (userInfo) {
        await this.authCacheService.cacheUser(userInfo.id, userInfo);
      }
    }
    if (!userInfo) {
      return null;
    }

    await Promise.all([
      this.authCacheService.cacheToken(payload.tokenId, payload.sub),
      this.authCacheService.cacheRefreshToken(
        payload.tokenId,
        payload.sub,
        payload.tokenId,
      ),
    ]);

    this.logger.log('Refresh session rehydrated after cache miss', {
      userId: payload.sub,
      tokenId: payload.tokenId,
    });

    return { userId: payload.sub, tokenId: payload.tokenId };
  }

  private async fetchUserInfoForRefresh(
    userId: string,
    authType?: 'user' | 'admin',
  ): Promise<UserInfo | null> {
    const servicesConfig = this.configService.getServicesConfig();
    const candidateUrls =
      authType === 'admin'
        ? [`${servicesConfig.apiServiceUrl}/api/auth/admin/users/${userId}`]
        : [
            `${servicesConfig.apiServiceUrl}/api/auth/users/${userId}`,
            `${servicesConfig.apiServiceUrl}/api/auth/admin/users/${userId}`,
          ];

    for (const url of candidateUrls) {
      try {
        const response = await firstValueFrom(this.httpService.get(url));
        const upstreamUser = response.data?.data || response.data;
        if (upstreamUser && upstreamUser.id) {
          return {
            id: upstreamUser.id,
            email: upstreamUser.email,
            username: upstreamUser.username,
            roles: upstreamUser.roles || [],
            permissions: upstreamUser.permissions || [],
          };
        }
      } catch {
        // try next candidate endpoint
      }
    }

    return null;
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
      await this.authCacheService.deleteRefreshToken(tokenId);
    }

    // 若前端传入 refresh token，同步使其失效
    if (refreshToken) {
      try {
        const payload = await this.tokenService.verifyRefreshToken(refreshToken);
        if (payload.sub === userId) {
          await this.authCacheService.deleteRefreshToken(payload.tokenId);
        }
      } catch {
        // 非法或过期的 refresh token 不阻塞登出流程
      }
    }

    // 清除用户缓存
    await this.authCacheService.clearUserCache(userId);
  }

  async isTokenBlacklisted(tokenId: string): Promise<boolean> {
    return this.authCacheService.isTokenBlacklisted(tokenId);
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
        authType: 'user',
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
   * 发送注册邮箱验证码 — 代理至 API 服务
   */
  async sendRegistrationVerificationCode(dto: { email: string }): Promise<{ message: string }> {
    const servicesConfig = this.configService.getServicesConfig();
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${servicesConfig.apiServiceUrl}/api/users/register/send-verification-code`,
          { email: dto.email },
        ),
      );
      return response.data?.data ?? response.data;
    } catch (error: any) {
      this.handlePasswordResetProxyError(error);
    }
  }

  /**
   * 忘记密码 — 代理至 API 服务
   */
  async forgotPassword(dto: { email: string }): Promise<{ message: string }> {
    const servicesConfig = this.configService.getServicesConfig();
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${servicesConfig.apiServiceUrl}/api/users/forgot-password`,
          { email: dto.email },
        ),
      );
      return response.data?.data ?? response.data;
    } catch (error: any) {
      this.handlePasswordResetProxyError(error);
    }
  }

  /**
   * 发送重置密码验证码 — 代理至 API 服务
   */
  async sendResetPasswordCode(dto: { email: string }): Promise<{ message: string }> {
    const servicesConfig = this.configService.getServicesConfig();
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${servicesConfig.apiServiceUrl}/api/users/forgot-password/send-code`,
          { email: dto.email },
        ),
      );
      return response.data?.data ?? response.data;
    } catch (error: any) {
      this.handlePasswordResetProxyError(error);
    }
  }

  /**
   * 使用验证码重置密码 — 代理至 API 服务
   */
  async resetPasswordWithCode(dto: { email: string; code: string; newPassword: string }): Promise<{ message: string }> {
    const servicesConfig = this.configService.getServicesConfig();
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${servicesConfig.apiServiceUrl}/api/users/reset-password-with-code`,
          dto,
        ),
      );
      return response.data?.data ?? response.data;
    } catch (error: any) {
      this.handlePasswordResetProxyError(error);
    }
  }

  /**
   * 重置密码 — 代理至 API 服务
   */
  async resetPassword(dto: { token: string; password: string }): Promise<{ message: string }> {
    const servicesConfig = this.configService.getServicesConfig();
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${servicesConfig.apiServiceUrl}/api/users/reset-password`,
          dto,
        ),
      );
      return response.data?.data ?? response.data;
    } catch (error: any) {
      this.handlePasswordResetProxyError(error);
    }
  }

  private extractDownstreamErrorMessage(error: any, fallback = 'Request failed'): string {
    const errorData = error?.response?.data;
    const nested = errorData?.error?.message;
    if (typeof nested === 'string' && nested.trim()) {
      return nested.trim();
    }
    if (typeof errorData?.message === 'string' && errorData.message.trim()) {
      return errorData.message.trim();
    }
    if (typeof error?.message === 'string' && error.message.trim()) {
      return error.message.trim();
    }
    return fallback;
  }

  /**
   * 将下游 API / Axios 错误映射为 Nest 异常，避免把含循环引用的原始 Axios 错误抛到拦截器链。
   */
  private throwMappedDownstreamError(error: any, fallback = 'Request failed'): never {
    const errorResponse = error?.response;
    const status = errorResponse?.status;
    const errorData = errorResponse?.data;
    const message = this.extractDownstreamErrorMessage(error, fallback);

    if (status === 409) {
      throw new ConflictException({
        code: ErrorCode.RECORD_ALREADY_EXISTS,
        message,
      });
    }

    if (status === 400) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message,
        ...(errorData?.error?.details ? { details: errorData.error.details } : {}),
      });
    }

    if (status === 429) {
      throw new HttpException(
        {
          code: ErrorCode.BAD_REQUEST,
          message,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (
      error?.code === 'ECONNREFUSED' ||
      error?.code === 'ETIMEDOUT' ||
      error?.code === 'ENOTFOUND' ||
      error?.code === 'ECONNABORTED'
    ) {
      throw new ServiceUnavailableException({
        code: ErrorCode.ROUTING_SERVICE_UNAVAILABLE,
        message: 'Service temporarily unavailable',
      });
    }

    if (typeof status === 'number' && status >= 500) {
      throw new ServiceUnavailableException({
        code: ErrorCode.ROUTING_SERVICE_UNAVAILABLE,
        message: message || 'Service temporarily unavailable',
      });
    }

    if (typeof status === 'number' && status >= 400 && status < 500) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message,
      });
    }

    throw new ServiceUnavailableException({
      code: ErrorCode.ROUTING_SERVICE_UNAVAILABLE,
      message: message || fallback,
    });
  }

  private handlePasswordResetProxyError(error: any): never {
    this.throwMappedDownstreamError(error, 'Request failed');
  }

  /**
   * 验证用户
   */
  async validateUser(userId: string, authType?: 'user' | 'admin'): Promise<UserInfo | null> {
    const cached = await this.authCacheService.getUser(userId);
    if (cached) {
      return cached;
    }

    const userInfo = await this.fetchUserInfoForRefresh(userId, authType);
    if (!userInfo) {
      return null;
    }

    await this.authCacheService.cacheUser(userId, userInfo);
    return userInfo;
  }
}


