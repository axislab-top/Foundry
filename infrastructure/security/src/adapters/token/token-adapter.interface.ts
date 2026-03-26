/**
 * 令牌适配器接口
 */

import type { JwtPayload, RefreshTokenPayload, TokenOptions, TokenVerifyOptions } from '../../types/token.types.js';

export interface TokenAdapter {
  /**
   * 生成令牌
   */
  sign(payload: JwtPayload | RefreshTokenPayload, options?: TokenOptions): Promise<string>;

  /**
   * 验证令牌
   */
  verify<T = JwtPayload>(token: string, options?: TokenVerifyOptions): Promise<T>;

  /**
   * 解码令牌（不验证）
   */
  decode<T = JwtPayload>(token: string): T | null;

  /**
   * 刷新令牌
   */
  refresh?(token: string, options?: TokenOptions): Promise<string>;
}






































