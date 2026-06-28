import type { LlmModelType } from '../entities/llm-model.entity.js';

/** 平台 `model_pricing` 目录中与 {@link LlmModel.modelName} 对齐的当前有效价（company_id IS NULL） */
export interface LlmModelCatalogPricing {
  inputPricePerMillion: string;
  outputPricePerMillion: string;
  embeddingPricePerMillion: string;
  currency: string;
}

export interface LlmModelInfo {
  id: string;
  providerCode: string;
  modelName: string;
  modelType: LlmModelType;
  requestPathSuffix: string | null;
  /** model_type=embedding 时向量维度；未配置时 Memory 侧可结合环境变量与模型名推断 */
  embeddingDimensions: number | null;
  isActive: boolean;
  /** 无行时表示尚未写入目录价（LLM 入账可能 unpriced）；与 Admin「添加模型」时写入的定价一致 */
  catalogPricing: LlmModelCatalogPricing | null;
}

