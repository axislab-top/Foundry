/**
 * CSRF 服务
 */

import { randomBytes, createHmac } from 'crypto';
import type { CsrfConfig } from '../config/security-config.js';

export class CsrfService {
  private config: CsrfConfig;

  constructor(config: CsrfConfig) {
    this.config = config;
  }

  /**
   * 生成 CSRF 令牌
   */
  generateToken(): string {
    const secret = this.config.secret;
    const random = randomBytes(32).toString('hex');
    const timestamp = Date.now().toString();
    const data = `${random}:${timestamp}`;

    const hmac = createHmac('sha256', secret);
    hmac.update(data);
    const signature = hmac.digest('hex');

    return `${random}:${timestamp}:${signature}`;
  }

  /**
   * 验证 CSRF 令牌
   */
  verifyToken(token: string): boolean {
    try {
      const parts = token.split(':');
      if (parts.length !== 3) {
        return false;
      }

      const [random, timestamp, signature] = parts;

      // 检查时间戳（可选：防止重放攻击）
      const tokenAge = Date.now() - parseInt(timestamp, 10);
      const maxAge = this.config.cookieOptions?.maxAge || 86400 * 1000; // 默认24小时
      if (tokenAge > maxAge) {
        return false;
      }

      // 验证签名
      const data = `${random}:${timestamp}`;
      const hmac = createHmac('sha256', this.config.secret);
      hmac.update(data);
      const expectedSignature = hmac.digest('hex');

      return signature === expectedSignature;
    } catch {
      return false;
    }
  }
}






































