/**
 * 加密工具函数
 */

import { randomBytes, createHash, pbkdf2Sync } from 'crypto';

/**
 * 生成随机字符串
 */
export function generateRandomString(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * 生成随机字节
 */
export function generateRandomBytes(length: number = 32): Buffer {
  return randomBytes(length);
}

/**
 * SHA256 哈希
 */
export function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * SHA512 哈希
 */
export function sha512(data: string | Buffer): string {
  return createHash('sha512').update(data).digest('hex');
}

/**
 * HMAC 签名
 */
export function hmac(
  algorithm: string,
  data: string | Buffer,
  secret: string | Buffer,
): string {
  const crypto = require('crypto');
  return crypto.createHmac(algorithm, secret).update(data).digest('hex');
}

/**
 * 从密码派生密钥（PBKDF2）
 */
export function deriveKey(
  password: string,
  salt: string | Buffer,
  iterations: number = 100000,
  keyLength: number = 32,
): Buffer {
  return pbkdf2Sync(password, salt, iterations, keyLength, 'sha256');
}

/**
 * 生成安全的随机令牌
 */
export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString('base64url');
}

/**
 * 时间安全比较（防止时序攻击）
 */
export function timingSafeEqual(a: string | Buffer, b: string | Buffer): boolean {
  const crypto = require('crypto');
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.isBuffer(a) ? a : Buffer.from(a),
    Buffer.isBuffer(b) ? b : Buffer.from(b),
  );
}






































