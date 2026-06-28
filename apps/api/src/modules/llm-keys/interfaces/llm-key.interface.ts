import type { LlmKeyProvider } from '../entities/llm-key.entity.js';

export interface LlmKeyInfo {
  id: string;
  /** 新版：绑定的模型条目 id（可能为空：历史数据/迁移中） */
  llmModelId?: string | null;
  provider: LlmKeyProvider;
  modelName: string;
  keyAlias: string;
  isActive: boolean;
  dailyQuotaTokens: string; // bigint -> string
  usedTodayTokens: string; // bigint -> string
  remainingTokens: string; // bigint -> string
  assignedCompanyCount: string; // int -> string（统一前端接口类型）
  lastUsedAt: Date | null;
  /** 是否已被 Marketplace 绑定（即“已配置”）。后向兼容：旧客户端可忽略。 */
  isBound?: boolean;
}

export interface LlmKeysAcquireResult {
  llmKeyId: string;
  apiKey: string; // decrypted secret only for worker
  provider: LlmKeyProvider;
  providerKind: 'openai' | 'anthropic';
  requestUrl: string;
  /** 模型级请求后缀（来自 llm_models.request_path_suffix，可选） */
  requestPathSuffix?: string | null;
  modelName: string;
  /** 当日配额剩余比例 0–100（配置了 dailyQuotaTokens 时） */
  remainingQuotaPercent?: number;
  /** 剩余比例低于 15% 时软预警，不阻断 acquire */
  warning?: string;
}

/** 管理端按「提供商 + 模型」分组的 key 池视图 */
export interface LlmKeyPoolGroup {
  provider: string;
  providerDisplayName: string;
  /** 新版：模型类型（用于 UI 按类型分组） */
  modelType?: 'chat' | 'embedding' | 'rerank' | 'image' | 'audio' | 'moderation' | 'other';
  modelName: string;
  keyCount: number;
  activeKeyCount: number;
  keys: LlmKeyInfo[];
}

