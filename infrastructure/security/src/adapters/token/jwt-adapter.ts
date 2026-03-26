/**
 * JWT 令牌适配器
 */

import jwt from 'jsonwebtoken';
import type { TokenAdapter } from './token-adapter.interface.js';
import type {
  JwtPayload,
  RefreshTokenPayload,
  TokenAdapterConfig,
  TokenOptions,
  TokenVerifyOptions,
} from '../../types/token.types.js';

export class JwtAdapter implements TokenAdapter {
  private config: TokenAdapterConfig;

  constructor(config: TokenAdapterConfig) {
    // 过滤掉 undefined 值，避免传递给 JWT 库
    const cleanConfig: any = {
      algorithm: 'HS256',
      expiresIn: '15m',
      ...config,
    };
    
    // 移除 undefined 的 issuer 和 audience
    if (cleanConfig.issuer === undefined) {
      delete cleanConfig.issuer;
    }
    if (cleanConfig.audience === undefined) {
      delete cleanConfig.audience;
    }
    
    this.config = cleanConfig as TokenAdapterConfig;
  }

  async sign(
    payload: JwtPayload | RefreshTokenPayload,
    options?: TokenOptions,
  ): Promise<string> {
    // 确保不会读取到 undefined 值
    const issuer = (options?.issuer !== undefined && options.issuer !== null) 
      ? options.issuer 
      : (this.config.issuer !== undefined && this.config.issuer !== null) 
        ? this.config.issuer 
        : undefined;
    const audience = (options?.audience !== undefined && options.audience !== null)
      ? options.audience
      : (this.config.audience !== undefined && this.config.audience !== null)
        ? this.config.audience
        : undefined;
    // 构建 signOptions，只包含基本字段
    const signOptions: jwt.SignOptions = {
      algorithm: this.config.algorithm as jwt.Algorithm,
      expiresIn: (options?.expiresIn ?? this.config.expiresIn) as any,
    };

    // 只添加明确存在的字符串值（严格检查）
    if (issuer && typeof issuer === 'string' && issuer.length > 0) {
      signOptions.issuer = issuer;
    }
    if (audience && typeof audience === 'string' && audience.length > 0) {
      signOptions.audience = audience;
    }
    // 只有当 payload 中没有 'sub' 字段时，才在 options 中设置 'subject'
    // 因为 jsonwebtoken 库不允许同时存在 payload.sub 和 options.subject
    // 使用更严格的检查：直接检查 payload.sub 是否存在且有效
    const hasSubInPayload = payload && 
      typeof payload === 'object' && 
      payload !== null &&
      'sub' in payload && 
      (payload as any).sub !== undefined && 
      (payload as any).sub !== null &&
      String((payload as any).sub).length > 0;
    
    // 如果 payload 中有 sub，绝对不能设置 subject，即使 options 中有 subject
    if (!hasSubInPayload) {
      const subject = options?.subject;
      if (subject && typeof subject === 'string' && subject.length > 0) {
        signOptions.subject = subject;
      }
    }

    // 添加其他有效的 options（排除 issuer, audience, subject 避免覆盖，并过滤 undefined/null）
    if (options) {
      Object.keys(options).forEach((key) => {
        if (key !== 'issuer' && key !== 'audience' && key !== 'subject') {
          const value = (options as any)[key];
          if (value !== undefined && value !== null) {
            (signOptions as any)[key] = value;
          }
        }
      });
    }

    return new Promise((resolve, reject) => {
      jwt.sign(payload, this.config.secret, signOptions, (err, token) => {
        if (err) {
          reject(err);
        } else {
          resolve(token!);
        }
      });
    });
  }

  async verify<T = JwtPayload>(
    token: string,
    options?: TokenVerifyOptions,
  ): Promise<T> {
    // 确保不会读取到 undefined 值
    const issuer = (options?.issuer !== undefined && options.issuer !== null)
      ? options.issuer
      : (this.config.issuer !== undefined && this.config.issuer !== null)
        ? this.config.issuer
        : undefined;
    const audience = (options?.audience !== undefined && options.audience !== null)
      ? options.audience
      : (this.config.audience !== undefined && this.config.audience !== null)
        ? this.config.audience
        : undefined;

    // 构建 verifyOptions，只包含基本字段
    const verifyOptions: jwt.VerifyOptions = {
      algorithms: [this.config.algorithm as jwt.Algorithm],
    };

    // 只添加明确存在的字符串值（严格检查）
    if (issuer && typeof issuer === 'string' && issuer.length > 0) {
      verifyOptions.issuer = issuer;
    }
    if (audience && typeof audience === 'string' && audience.length > 0) {
      verifyOptions.audience = audience;
    }
    if (options?.clockTolerance !== undefined && options.clockTolerance !== null) {
      verifyOptions.clockTolerance = options.clockTolerance;
    }

    // 添加其他有效的 options（排除 issuer, audience, clockTolerance，并过滤 undefined）
    if (options) {
      Object.keys(options).forEach((key) => {
        if (key !== 'issuer' && key !== 'audience' && key !== 'clockTolerance') {
          const value = (options as any)[key];
          if (value !== undefined && value !== null) {
            (verifyOptions as any)[key] = value;
          }
        }
      });
    }

    return new Promise((resolve, reject) => {
      jwt.verify(token, this.config.secret, verifyOptions, (err, decoded) => {
        if (err) {
          reject(err);
        } else {
          resolve(decoded as T);
        }
      });
    });
  }

  decode<T = JwtPayload>(token: string): T | null {
    try {
      return jwt.decode(token) as T | null;
    } catch {
      return null;
    }
  }

  async refresh(token: string, options?: TokenOptions): Promise<string> {
    const decoded = this.decode<JwtPayload>(token);
    if (!decoded) {
      throw new Error('Invalid token');
    }

    // 移除过期时间相关字段
    const { iat, exp, ...payload } = decoded;
    return this.sign(payload, options);
  }
}










