/**
 * 安全配置
 */

export interface SecurityConfig {
  jwt?: JwtConfig;
  encryption?: EncryptionConfig;
  hashing?: HashingConfig;
  authorization?: AuthorizationConfig;
  csrf?: CsrfConfig;
  cors?: CorsConfig;
}

export interface AuthorizationConfig {
  enabled?: boolean;
  policies?: any[];
}

export interface JwtConfig {
  secret: string;
  refreshSecret?: string;
  expiresIn?: string | number;
  refreshExpiresIn?: string | number;
  issuer?: string;
  audience?: string;
  algorithm?: string;
}

export interface EncryptionConfig {
  defaultAdapter: 'aes' | 'rsa';
  aes?: {
    key: string;
    algorithm?: string;
    keyLength?: number;
  };
  rsa?: {
    publicKey: string;
    privateKey: string;
    algorithm?: string;
  };
}

export interface HashingConfig {
  defaultAdapter: 'bcrypt' | 'argon2';
  bcrypt?: {
    saltRounds?: number;
  };
  argon2?: {
    memoryCost?: number;
    timeCost?: number;
    parallelism?: number;
  };
}

export interface CsrfConfig {
  enabled: boolean;
  secret: string;
  cookieName?: string;
  headerName?: string;
  cookieOptions?: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    maxAge?: number;
  };
}

export interface CorsConfig {
  enabled: boolean;
  origin?: string | string[] | ((origin: string) => boolean);
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

/**
 * 从环境变量创建安全配置
 */
export function createSecurityConfigFromEnv(): SecurityConfig {
  return {
    jwt: {
      secret: process.env.JWT_SECRET || 'your-secret-key',
      refreshSecret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN || '15m',
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE,
      algorithm: process.env.JWT_ALGORITHM || 'HS256',
    },
    // 只有在提供了加密密钥时才配置加密
    ...(process.env.AES_KEY || (process.env.RSA_PUBLIC_KEY && process.env.RSA_PRIVATE_KEY)
      ? {
          encryption: {
            defaultAdapter: (process.env.ENCRYPTION_ADAPTER as 'aes' | 'rsa') || 
              (process.env.AES_KEY ? 'aes' : 'rsa'),
            aes: process.env.AES_KEY
              ? {
                  key: process.env.AES_KEY,
                  algorithm: process.env.AES_ALGORITHM || 'aes-256-gcm',
                  keyLength: parseInt(process.env.AES_KEY_LENGTH || '32', 10),
                }
              : undefined,
            rsa: process.env.RSA_PUBLIC_KEY && process.env.RSA_PRIVATE_KEY
              ? {
                  publicKey: process.env.RSA_PUBLIC_KEY,
                  privateKey: process.env.RSA_PRIVATE_KEY,
                  algorithm: process.env.RSA_ALGORITHM || 'rsa-oaep',
                }
              : undefined,
          },
        }
      : {}),
    hashing: {
      defaultAdapter: (process.env.HASHING_ADAPTER as 'bcrypt' | 'argon2') || 'bcrypt',
      bcrypt: {
        saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10),
      },
      argon2: {
        memoryCost: parseInt(process.env.ARGON2_MEMORY_COST || '65536', 10),
        timeCost: parseInt(process.env.ARGON2_TIME_COST || '3', 10),
        parallelism: parseInt(process.env.ARGON2_PARALLELISM || '4', 10),
      },
    },
    csrf: {
      enabled: process.env.CSRF_ENABLED !== 'false',
      secret: process.env.CSRF_SECRET || process.env.JWT_SECRET || 'csrf-secret',
      cookieName: process.env.CSRF_COOKIE_NAME || '_csrf',
      headerName: process.env.CSRF_HEADER_NAME || 'x-csrf-token',
      cookieOptions: {
        httpOnly: process.env.CSRF_HTTP_ONLY !== 'false',
        secure: process.env.CSRF_SECURE === 'true',
        sameSite: (process.env.CSRF_SAME_SITE as 'strict' | 'lax' | 'none') || 'strict',
        maxAge: parseInt(process.env.CSRF_MAX_AGE || '86400', 10),
      },
    },
    cors: {
      enabled: process.env.CORS_ENABLED !== 'false',
      origin: process.env.CORS_ORIGIN || '*',
      methods: process.env.CORS_METHODS?.split(',') || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: process.env.CORS_ALLOWED_HEADERS?.split(',') || ['Content-Type', 'Authorization'],
      exposedHeaders: process.env.CORS_EXPOSED_HEADERS?.split(','),
      credentials: process.env.CORS_CREDENTIALS === 'true',
      maxAge: parseInt(process.env.CORS_MAX_AGE || '86400', 10),
    },
    // 默认启用授权管理器
    authorization: {
      enabled: process.env.AUTHORIZATION_ENABLED !== 'false',
    },
  };
}











