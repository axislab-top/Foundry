/**
 * JWT 载荷接口
 */
export interface JwtPayload {
  sub: string; // 用户ID
  tokenId?: string; // 访问令牌ID（用于登出黑名单）
  authType?: 'user' | 'admin';
  email?: string;
  username?: string;
  roles?: string[];
  permissions?: string[];
  iat?: number; // 签发时间
  exp?: number; // 过期时间
}

/**
 * 刷新令牌载荷接口
 */
export interface RefreshTokenPayload {
  sub: string; // 用户ID
  tokenId: string; // 令牌ID
  iat?: number;
  exp?: number;
}









































