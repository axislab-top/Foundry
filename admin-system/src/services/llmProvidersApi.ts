import { apiClient } from './apiClient';

export type LlmProviderKind = 'openai' | 'anthropic';

export interface LlmProviderInfo {
  code: string;
  displayName: string;
  kind: LlmProviderKind;
  requestUrl: string;
}

export interface ListLlmProvidersResult {
  items: LlmProviderInfo[];
}

export interface CreateLlmProviderInput {
  code: string;
  displayName?: string;
  kind: LlmProviderKind;
  requestUrl: string;
}

function unwrapResponse<T>(data: unknown): T {
  // 部分鉴权类接口可能会返回 `{ success, data }` 包裹
  if (
    data &&
    typeof data === 'object' &&
    'success' in data &&
    (data as { success: boolean }).success === true &&
    'data' in data
  ) {
    return (data as { data: T }).data;
  }
  return data as T;
}

export const llmProvidersApi = {
  async list(): Promise<ListLlmProvidersResult> {
    const { data } = await apiClient.get('/admin/llm-providers');
    return unwrapResponse<ListLlmProvidersResult>(data);
  },

  async create(input: CreateLlmProviderInput): Promise<LlmProviderInfo> {
    const { data } = await apiClient.post('/admin/llm-providers', input);
    return unwrapResponse<LlmProviderInfo>(data);
  },
};

