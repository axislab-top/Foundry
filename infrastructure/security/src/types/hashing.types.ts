/**
 * 哈希相关类型定义
 */

export enum HashingAdapterType {
  BCRYPT = 'bcrypt',
  ARGON2 = 'argon2',
}

export interface HashingOptions {
  saltRounds?: number;
  memoryCost?: number;
  timeCost?: number;
  parallelism?: number;
}

export interface HashingAdapterConfig {
  saltRounds?: number;
  memoryCost?: number;
  timeCost?: number;
  parallelism?: number;
}






































