export type KeyStatus = 'active' | 'disabled';

export type ModelKey = {
  id: string;
  alias: string;
  status: KeyStatus;
  environment: 'prod' | 'staging' | 'dev';
  dailyQuotaTokens: number;
  usedTodayTokens: number;
  usedRate: number;
};

export type ProviderModel = {
  id: string;
  name: string;
  modelType: string;
  requestPathSuffix: string | null;
  embeddingDimensions?: number | null;
  isActive: boolean;
  capabilities: string[];
  keys: ModelKey[];
  catalogPricing?: {
    inputPricePerMillion: string;
    outputPricePerMillion: string;
    embeddingPricePerMillion: string;
    currency: string;
  } | null;
};

export type ProviderGroup = {
  id: string;
  name: string;
  region: string;
  models: ProviderModel[];
};

export type ApiLlmModel = {
  id: string;
  providerCode: string;
  modelName: string;
  modelType: string;
  requestPathSuffix: string | null;
  embeddingDimensions?: number | null;
  isActive: boolean;
  catalogPricing?: {
    inputPricePerMillion: string;
    outputPricePerMillion: string;
    embeddingPricePerMillion: string;
    currency: string;
  } | null;
};

export type ApiLlmKey = {
  id: string;
  keyAlias: string;
  isActive: boolean;
  dailyQuotaTokens: string;
  usedTodayTokens: string;
};

export type ApiLlmKeyPoolGroup = {
  provider: string;
  providerDisplayName: string;
  modelType?: string;
  modelName: string;
  keys: ApiLlmKey[];
};

export type ApiLlmProvider = {
  code: string;
  displayName: string;
  kind: 'openai' | 'anthropic';
  requestUrl: string;
};

export type PlatformEmbeddingSetting = {
  defaultEmbeddingModelId: string | null;
  effective: string | null;
};

export type ModelType = 'chat' | 'embedding' | 'rerank' | 'image' | 'audio' | 'moderation' | 'other';

export type CatalogStats = {
  providerCount: number;
  modelCount: number;
  keyCount: number;
  activeKeys: number;
};
