import { JwtPayload } from './jwt-payload.interface.js';

/**
 * 认证结果接口
 */
export interface AuthResult {
  user: {
    id: string;
    email?: string;
    username?: string;
    roles?: string[];
    permissions?: string[];
  };
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // 过期时间（秒）
}

/**
 * 令牌对接口
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * 用户信息接口
 */
export interface UserInfo {
  id: string;
  tokenId?: string;
  email?: string;
  username?: string;
  roles?: string[];
  permissions?: string[];
}









































