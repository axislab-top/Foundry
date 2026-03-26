/**
 * 令牌服务
 */

import { TokenManager } from '../infrastructure/token-manager.js';
import type {
  TokenAdapterType,
  JwtPayload,
  RefreshTokenPayload,
  TokenOptions,
  TokenVerifyOptions,
  TokenPair,
} from '../types/token.types.js';

export class TokenService {
  private tokenManager: TokenManager;

  constructor(tokenManager: TokenManager) {
    this.tokenManager = tokenManager;
  }

  /**
   * 生成访问令牌
   */
  async generateAccessToken(
    payload: JwtPayload,
    options?: TokenOptions,
    adapter?: TokenAdapterType,
  ): Promise<string> {
    return this.tokenManager.generateAccessToken(payload, options, adapter);
  }

  /**
   * 生成刷新令牌
   */
  async generateRefreshToken(
    payload: RefreshTokenPayload,
    options?: TokenOptions,
    adapter?: TokenAdapterType,
  ): Promise<string> {
    return this.tokenManager.generateRefreshToken(payload, options, adapter);
  }

  /**
   * 生成令牌对
   */
  async generateTokenPair(
    payload: JwtPayload,
    tokenId: string,
    accessTokenOptions?: TokenOptions,
    refreshTokenOptions?: TokenOptions,
    adapter?: TokenAdapterType,
  ): Promise<TokenPair> {
    return this.tokenManager.generateTokenPair(
      payload,
      tokenId,
      accessTokenOptions,
      refreshTokenOptions,
      adapter,
    );
  }

  /**
   * 验证令牌
   */
  async verifyToken<T = JwtPayload>(
    token: string,
    options?: TokenVerifyOptions,
    adapter?: TokenAdapterType,
  ): Promise<T> {
    return this.tokenManager.verifyToken<T>(token, options, adapter);
  }

  /**
   * 解码令牌（不验证）
   */
  decodeToken<T = JwtPayload>(
    token: string,
    adapter?: TokenAdapterType,
  ): T | null {
    return this.tokenManager.decodeToken<T>(token, adapter);
  }

  /**
   * 刷新令牌
   */
  async refreshToken(
    token: string,
    options?: TokenOptions,
    adapter?: TokenAdapterType,
  ): Promise<string> {
    return this.tokenManager.refreshToken(token, options, adapter);
  }
}






































