import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ServiceUnavailableException,
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
   * 管理员登录（仅允许 admin/superadmin 角色账号登录）。
   * 该入口用于 admin-system，不影响通用用户登录（/auth/login）。
   */
  async adminLogin(loginDto: LoginDto): Promise<AuthResult> {
    const result = await this.login(loginDto);
    const userRoles = Array.isArray(result.user?.roles) ? result.user.roles : [];

    const allowedAdminRoles = ['admin', 'superadmin'];
    const hasAllowedRole = allowedAdminRoles.some((r) =>
      userRoles.includes(r),
    );

    if (!hasAllowedRole) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
        message: 'Only admin accounts can login',
      });
    }

    return result;
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
      const status = error?.response?.status;
      const errorData = error?.response?.data;
      const message =
        errorData?.error?.message ||
        errorData?.message ||
        error?.message ||
        'Registration failed';

      // 下游 API 返回业务冲突（邮箱/用户名重复）
      if (status === 409) {
        throw new ConflictException({
          code: ErrorCode.RECORD_ALREADY_EXISTS,
          message,
        });
      }

      // 参数校验错误
      if (status === 400) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message,
          ...(errorData?.error?.details ? { details: errorData.error.details } : {}),
        });
      }

      // 下游服务不可达/超时
      if (
        error?.code === 'ECONNREFUSED' ||
        error?.code === 'ETIMEDOUT' ||
        error?.code === 'ENOTFOUND'
      ) {
        throw new ServiceUnavailableException({
          code: ErrorCode.ROUTING_SERVICE_UNAVAILABLE,
          message: 'Registration service temporarily unavailable',
        });
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


