/**
 * 令牌工具函数
 */

import type { JwtPayload } from '../types/token.types.js';

/**
 * 从 Authorization header 提取令牌
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * 检查令牌是否即将过期
 */
export function isTokenExpiringSoon(
  payload: JwtPayload,
  thresholdSeconds: number = 300,
): boolean {
  if (!payload.exp) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = payload.exp;
  const timeUntilExpiry = expiresAt - now;

  return timeUntilExpiry > 0 && timeUntilExpiry <= thresholdSeconds;
}

/**
 * 解析过期时间字符串为秒数
 */
export function parseExpiresIn(expiresIn: string | number): number {
  if (typeof expiresIn === 'number') {
    return expiresIn;
  }

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

/**
 * 格式化过期时间为秒数
 */
export function formatExpiresIn(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m`;
  } else if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h`;
  } else {
    return `${Math.floor(seconds / 86400)}d`;
  }
}










