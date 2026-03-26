import { Injectable } from '@nestjs/common';
import { SecurityService } from '../../../common/security/security.service.js';
import { JwtPayload, RefreshTokenPayload } from '../interfaces/jwt-payload.interface.js';
import { TokenPair } from '../interfaces/token-pair.interface.js';

/**
 * 令牌服务
 * 负责 JWT 令牌的生成和验证
 * 使用 @service/security 的 TokenManager
 */
@Injectable()
export class TokenService {
  constructor(private readonly securityService: SecurityService) {}

  /**
   * 生成访问令牌
   */
  async generateAccessToken(payload: JwtPayload): Promise<string> {
    const tokenManager = this.securityService.getTokenManager();
    return tokenManager.generateAccessToken(payload);
  }

  /**
   * 生成刷新令牌
   */
  async generateRefreshToken(
    userId: string,
    tokenId: string,
  ): Promise<string> {
    const tokenManager = this.securityService.getTokenManager();
    const payload: RefreshTokenPayload = {
      sub: userId,
      tokenId,
    };
    return tokenManager.generateRefreshToken(payload, {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    });
  }

  /**
   * 生成令牌对
   */
  async generateTokenPair(
    payload: JwtPayload,
    tokenId: string,
  ): Promise<TokenPair> {
    const tokenManager = this.securityService.getTokenManager();
    const tokenPair = await tokenManager.generateTokenPair(
      payload as any,
      tokenId,
      { expiresIn: process.env.JWT_EXPIRES_IN || '15m' },
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' },
    );

    // 解析过期时间
    const expiresIn = this.parseExpiresIn(
      process.env.JWT_EXPIRES_IN || '15m',
    );

    return {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      expiresIn,
    };
  }

  /**
   * 验证访问令牌
   */
  async verifyAccessToken(token: string): Promise<JwtPayload> {
    const tokenManager = this.securityService.getTokenManager();
    const payload = await tokenManager.verifyToken(token);
    return payload as JwtPayload;
  }

  /**
   * 验证刷新令牌
   */
  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    const tokenManager = this.securityService.getTokenManager();
    const payload = await tokenManager.verifyToken(token);
    return payload as RefreshTokenPayload;
  }

  /**
   * 从令牌中提取载荷（不验证）
   */
  decodeToken<T = any>(token: string): T {
    const tokenManager = this.securityService.getTokenManager();
    // TokenManager 可能没有 decode 方法，使用 verifyToken 但捕获错误
    // 或者直接解析 JWT
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid token format');
      }
      const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
      return JSON.parse(payload) as T;
    } catch (error) {
      throw new Error('Failed to decode token');
    }
  }

  /**
   * 解析过期时间字符串为秒数
   */
  private parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 900; // 默认15分钟
    }

    const value = parseInt(match[1], 10);
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
        return 900;
    }
  }
}




