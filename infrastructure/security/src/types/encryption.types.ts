/**
 * 加密相关类型定义
 */

export enum EncryptionAdapterType {
  AES = 'aes',
  RSA = 'rsa',
}

export interface EncryptionOptions {
  algorithm?: string;
  iv?: Buffer;
  keyLength?: number;
}

export interface EncryptionResult {
  encrypted: string | Buffer;
  iv?: Buffer;
  tag?: Buffer;
}

export interface DecryptionOptions {
  iv?: Buffer;
  tag?: Buffer;
}

export interface EncryptionAdapterConfig {
  key?: string | Buffer;
  algorithm?: string;
  keyLength?: number;
  publicKey?: string;
  privateKey?: string;
}









