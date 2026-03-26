/**
 * 令牌相关类型定义
 */

export enum TokenAdapterType {
  JWT = 'jwt',
  OPAQUE = 'opaque',
}

export interface TokenOptions {
  expiresIn?: string | number;
  issuer?: string;
  audience?: string;
  subject?: string;
  [key: string]: any;
}

export interface TokenVerifyOptions {
  issuer?: string;
  audience?: string;
  clockTolerance?: number;
  [key: string]: any;
}

export interface TokenAdapterConfig {
  secret: string;
  algorithm?: string;
  expiresIn?: string | number;
  issuer?: string;
  audience?: string;
}

export interface BaseTokenPayload {
  sub: string;
  [key: string]: any;
}

export interface JwtPayload extends BaseTokenPayload {
  iat?: number;
  exp?: number;
  aud?: string | string[];
  iss?: string;
  jti?: string;
}

export interface RefreshTokenPayload extends BaseTokenPayload {
  tokenId?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
}









