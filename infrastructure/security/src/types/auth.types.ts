/**
 * 认证相关类型定义
 */

export interface UserInfo {
  id: string;
  email?: string;
  username?: string;
  roles?: string[];
  permissions?: string[];
  [key: string]: any;
}

export interface AuthResult {
  user: UserInfo;
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

export interface LoginCredentials {
  email?: string;
  username?: string;
  password: string;
}

export interface ApiKeyCredentials {
  apiKey: string;
  apiSecret?: string;
}

export enum AuthStrategy {
  JWT = 'jwt',
  LOCAL = 'local',
  API_KEY = 'api-key',
  OAUTH2 = 'oauth2',
}










