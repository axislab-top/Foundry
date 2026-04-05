import type { LlmProviderKind } from '../entities/llm-provider.entity.js';

export interface LlmProviderInfo {
  code: string;
  displayName: string;
  kind: LlmProviderKind;
  requestUrl: string;
}

