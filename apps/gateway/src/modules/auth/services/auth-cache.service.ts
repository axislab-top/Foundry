import { Injectable } from '@nestjs/common';
import { CacheService } from '../../../common/cache/cache.service.js';
import { AUTH_CONSTANTS } from '../constants/auth.constants.js';
import type { UserInfo } from '../interfaces/auth-result.interface.js';

/**
 * 认证缓存服务
 * 负责缓存用户信息、令牌等
 */
@Injectable()
export class AuthCacheService {
  constructor(private readonly cacheService: CacheService) {}

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
      AUTH_CONSTANTS.CACHE_TTL.REFRESH_TOKEN,
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
   * 将令牌加入黑名单
   */
  async blacklistToken(tokenId: string): Promise<void> {
    const key = `${AUTH_CONSTANTS.CACHE_PREFIX.BLACKLIST}${tokenId}`;
    await this.cacheService.set(key, true, AUTH_CONSTANTS.CACHE_TTL.BLACKLIST);
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
    // 注意：这里无法直接删除所有相关令牌，需要在登出时单独处理
  }
}


