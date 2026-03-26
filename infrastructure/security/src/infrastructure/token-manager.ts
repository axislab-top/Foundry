/**
 * 令牌管理器
 */

import type { TokenAdapter } from '../adapters/token/token-adapter.interface.js';
import { JwtAdapter } from '../adapters/token/jwt-adapter.js';
import { OpaqueTokenAdapter } from '../adapters/token/opaque-token-adapter.js';
import {
  TokenAdapterType,
  TokenAdapterConfig,
  JwtPayload,
  RefreshTokenPayload,
  TokenOptions,
  TokenVerifyOptions,
  TokenPair,
} from '../types/token.types.js';
import { parseExpiresIn } from '../utils/token.utils.js';

export interface TokenManagerConfig {
  defaultAdapter: TokenAdapterType;
  adapters: Array<{
    adapter: TokenAdapterType;
    options: TokenAdapterConfig;
  }>;
}

export class TokenManager {
  private static instance: TokenManager | null = null;
  private adapters: Map<TokenAdapterType, TokenAdapter> = new Map();
  private defaultAdapter: TokenAdapterType;

  private constructor(config: TokenManagerConfig) {
    this.defaultAdapter = config.defaultAdapter;

    for (const { adapter, options } of config.adapters) {
      let tokenAdapter: TokenAdapter;

      switch (adapter) {
        case TokenAdapterType.JWT:
          tokenAdapter = new JwtAdapter(options);
          break;
        case TokenAdapterType.OPAQUE:
          tokenAdapter = new OpaqueTokenAdapter(options);
          break;
        default:
          throw new Error(`Unsupported token adapter: ${adapter}`);
      }

      this.adapters.set(adapter, tokenAdapter);
    }
  }

  static create(config: TokenManagerConfig): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager(config);
    }
    return TokenManager.instance;
  }

  static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      throw new Error('TokenManager not initialized. Call create() first.');
    }
    return TokenManager.instance;
  }

  static reset(): void {
    TokenManager.instance = null;
  }

  /**
   * 生成访问令牌
   */
  async generateAccessToken(
    payload: JwtPayload,
    options?: TokenOptions,
    adapter?: TokenAdapterType,
  ): Promise<string> {
    const tokenAdapter = this.getAdapter(adapter);
    return tokenAdapter.sign(payload, options);
  }

  /**
   * 生成刷新令牌
   */
  async generateRefreshToken(
    payload: RefreshTokenPayload,
    options?: TokenOptions,
    adapter?: TokenAdapterType,
  ): Promise<string> {
    const tokenAdapter = this.getAdapter(adapter);
    return tokenAdapter.sign(payload, options);
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
    const refreshPayload: RefreshTokenPayload = {
      sub: payload.sub,
      tokenId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.generateAccessToken(payload, accessTokenOptions, adapter),
      this.generateRefreshToken(refreshPayload, refreshTokenOptions, adapter),
    ]);

    const expiresIn = accessTokenOptions?.expiresIn
      ? parseExpiresIn(
          typeof accessTokenOptions.expiresIn === 'string'
            ? accessTokenOptions.expiresIn
            : `${accessTokenOptions.expiresIn}s`,
        )
      : 900; // 默认15分钟

    return {
      accessToken,
      refreshToken,
      expiresIn,
    };
  }

  /**
   * 验证令牌
   */
  async verifyToken<T = JwtPayload>(
    token: string,
    options?: TokenVerifyOptions,
    adapter?: TokenAdapterType,
  ): Promise<T> {
    const tokenAdapter = this.getAdapter(adapter);
    return tokenAdapter.verify<T>(token, options);
  }

  /**
   * 解码令牌（不验证）
   */
  decodeToken<T = JwtPayload>(
    token: string,
    adapter?: TokenAdapterType,
  ): T | null {
    const tokenAdapter = this.getAdapter(adapter);
    return tokenAdapter.decode<T>(token);
  }

  /**
   * 刷新令牌
   */
  async refreshToken(
    token: string,
    options?: TokenOptions,
    adapter?: TokenAdapterType,
  ): Promise<string> {
    const tokenAdapter = this.getAdapter(adapter);
    if (!tokenAdapter.refresh) {
      throw new Error('Token adapter does not support refresh');
    }
    return tokenAdapter.refresh(token, options);
  }

  private getAdapter(adapter?: TokenAdapterType): TokenAdapter {
    const adapterType = adapter || this.defaultAdapter;
    const tokenAdapter = this.adapters.get(adapterType);

    if (!tokenAdapter) {
      throw new Error(`Token adapter not found: ${adapterType}`);
    }

    return tokenAdapter;
  }
}









