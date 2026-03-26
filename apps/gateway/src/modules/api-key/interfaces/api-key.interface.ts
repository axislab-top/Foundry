import { ApiKey } from '../entities/api-key.entity.js';

/**
 * API密钥信息（不包含敏感信息）
 */
export interface ApiKeyInfo {
  id: string;
  keyId: string;
  name: string;
  description: string | null;
  permissions: string[] | null;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * API密钥创建结果（包含密钥secret，仅创建时返回一次）
 */
export interface ApiKeyCreateResult {
  apiKey: ApiKeyInfo;
  secret: string; // 密钥secret，仅创建时返回一次
}


































