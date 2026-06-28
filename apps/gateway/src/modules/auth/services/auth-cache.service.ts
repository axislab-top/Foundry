import { Injectable } from '@nestjs/common';
import { CacheService } from '../../../common/cache/cache.service.js';
import { ConfigService } from '../../../common/config/config.service.js';
import { AUTH_CONSTANTS } from '../constants/auth.constants.js';
import type { AuthResult } from '../interfaces/auth-result.interface.js';
import type { UserInfo } from '../interfaces/auth-result.interface.js';

function parseExpiresInToSeconds(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) {
    return AUTH_CONSTANTS.CACHE_TTL.REFRESH_TOKEN;
  }
  const value = Number.parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 60 * 60;
    case 'd':
      return value * 24 * 60 * 60;
    default:
      return AUTH_CONSTANTS.CACHE_TTL.REFRESH_TOKEN;
  }
}

/**
 * 认证缓存服务
 * 负责缓存用户信息、令牌等
 */
@Injectable()
export class AuthCacheService {
  constructor(
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
  ) {}

  private refreshTokenTtlSeconds(): number {
    const jwt = this.configService.getJwtConfig();
    return parseExpiresInToSeconds(jwt.refreshExpiresIn || '7d');
  }

  /**
   * 缓存用户信息
   */
  async cacheUser(userId: string, userInfo: UserInfo): Promise<void> {
    const key = `${AUTH_CONSTANTS.CACHE_PREFIX.USER}${userId}`;
    await this.cacheService.set(key, userInfo, AUTH_CONSTANTS.CACHE_TTL.USER);
  }

  /**
   * 获取用户信息
   */
  async getUser(userId: string): Promise<UserInfo | null> {
    const key = `${AUTH_CONSTANTS.CACHE_PREFIX.USER}${userId}`;
    return this.cacheService.get<UserInfo>(key);
  }

  /**
   * 删除用户缓存
   */
  async deleteUser(userId: string): Promise<void> {
    const key = `${AUTH_CONSTANTS.CACHE_PREFIX.USER}${userId}`;
    await this.cacheService.delete(key);
  }

  /**
   * 缓存访问令牌
   */
  async cacheToken(tokenId: string, userId: string): Promise<void> {
    const key = `${AUTH_CONSTANTS.CACHE_PREFIX.TOKEN}${tokenId}`;
    await this.cacheService.set(key, userId, AUTH_CONSTANTS.CACHE_TTL.TOKEN);
  }

  /**
   * 获取令牌对应的用户ID
   */
  async getTokenUser(tokenId: string): Promise<string | null> {
    const key = `${AUTH_CONSTANTS.CACHE_PREFIX.TOKEN}${tokenId}`;
    return this.cacheService.get<string>(key);
  }

  /**
   * 删除令牌缓存
   */
  async deleteToken(tokenId: string): Promise<void> {
    const key = `${AUTH_CONSTANTS.CACHE_PREFIX.TOKEN}${tokenId}`;
    await this.cacheService.delete(key);
  }

  /**
   * 缓存刷新令牌
   */
  async cacheRefreshToken(
    refreshTokenId: string,
    userId: string,
    tokenId: string,
  ): Promise<void> {
    const key = `${AUTH_CONSTANTS.CACHE_PREFIX.REFRESH_TOKEN}${refreshTokenId}`;
    await this.cacheService.set(
      key,
      { userId, tokenId },
      this.refreshTokenTtlSeconds(),
    );
  }

  /**
   * 获取刷新令牌信息
   */
  async getRefreshToken(
    refreshTokenId: string,
  ): Promise<{ userId: string; tokenId: string } | null> {
    const key = `${AUTH_CONSTANTS.CACHE_PREFIX.REFRESH_TOKEN}${refreshTokenId}`;
    return this.cacheService.get<{ userId: string; tokenId: string }>(key);
  }

  /**
   * 删除刷新令牌缓存
   */
  async deleteRefreshToken(refreshTokenId: string): Promise<void> {
    const key = `${AUTH_CONSTANTS.CACHE_PREFIX.REFRESH_TOKEN}${refreshTokenId}`;
    await this.cacheService.delete(key);
  }

  /**
   * 轮换宽限期：同一旧 refresh 在宽限期内重复刷新返回相同结果（幂等）
   */
  async getRefreshRotationGrace(refreshTokenId: string): Promise<AuthResult | null> {
    const key = `${AUTH_CONSTANTS.CACHE_PREFIX_GRACE}${refreshTokenId}`;
    return this.cacheService.get<AuthResult>(key);
  }

  async setRefreshRotationGrace(
    refreshTokenId: string,
    result: AuthResult,
  ): Promise<void> {
    const key = `${AUTH_CONSTANTS.CACHE_PREFIX_GRACE}${refreshTokenId}`;
    await this.cacheService.set(
      key,
      result,
      AUTH_CONSTANTS.CACHE_TTL.REFRESH_ROTATION_GRACE,
    );
  }

  /** refresh token 轮换后，旧会话 ID 黑名单 TTL 与 refresh JWT 一致 */
  refreshTokenBlacklistTtlSeconds(): number {
    return this.refreshTokenTtlSeconds();
  }

  /**
   * 将令牌加入黑名单
   */
  async blacklistToken(tokenId: string, ttlSeconds?: number): Promise<void> {
    const key = `${AUTH_CONSTANTS.CACHE_PREFIX.BLACKLIST}${tokenId}`;
    await this.cacheService.set(
      key,
      true,
      ttlSeconds ?? AUTH_CONSTANTS.CACHE_TTL.BLACKLIST,
    );
  }

  /**
   * 检查令牌是否在黑名单中
   */
  async isTokenBlacklisted(tokenId: string): Promise<boolean> {
    const key = `${AUTH_CONSTANTS.CACHE_PREFIX.BLACKLIST}${tokenId}`;
    return this.cacheService.exists(key);
  }

  /**
   * 清除用户所有缓存
   */
  async clearUserCache(userId: string): Promise<void> {
    await this.deleteUser(userId);
  }
}
