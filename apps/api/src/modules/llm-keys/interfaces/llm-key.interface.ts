import type { LlmKeyProvider } from '../entities/llm-key.entity.js';

export interface LlmKeyInfo {
  id: string;
  provider: LlmKeyProvider;
  modelName: string;
  keyAlias: string;
  isActive: boolean;
  dailyQuotaTokens: string; // bigint -> string
  usedTodayTokens: string; // bigint -> string
  remainingTokens: string; // bigint -> string
  assignedCompanyCount: string; // int -> string（统一前端接口类型）
  lastUsedAt: Date | null;
}

export interface LlmKeysAcquireResult {
  llmKeyId: string;
  apiKey: string; // decrypted secret only for worker
  provider: LlmKeyProvider;
  providerKind: 'openai' | 'anthropic';
  requestUrl: string;
  modelName: string;
}

