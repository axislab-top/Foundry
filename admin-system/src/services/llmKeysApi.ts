import { apiClient } from './apiClient';

export interface LlmKeyInfo {
  id: string;
  provider: string;
  modelName: string;
  keyAlias: string;
  isActive: boolean;
  dailyQuotaTokens: string;
  usedTodayTokens: string;
  remainingTokens: string;
  assignedCompanyCount: string;
  lastUsedAt: string | null;
}

export interface ListLlmKeysParams {
  provider?: string;
  modelName?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ListLlmKeysResult {
  items: LlmKeyInfo[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateLlmKeyInput {
  provider: string;
  modelName: string;
  keyAlias: string;
  secret: string;
  dailyQuotaTokens: number;
  isActive?: boolean;
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

export const llmKeysApi = {
  async list(params: ListLlmKeysParams): Promise<ListLlmKeysResult> {
    const { data } = await apiClient.get('/admin/llm-keys', { params });
    return unwrapResponse<ListLlmKeysResult>(data);
  },

  async create(input: CreateLlmKeyInput): Promise<LlmKeyInfo> {
    const { data } = await apiClient.post('/admin/llm-keys', input);
    return unwrapResponse<LlmKeyInfo>(data);
  },

  async disable(id: string): Promise<{ ok: true }> {
    const { data } = await apiClient.post(`/admin/llm-keys/${id}/disable`);
    return unwrapResponse<{ ok: true }>(data);
  },

  async enable(id: string): Promise<{ ok: true }> {
    const { data } = await apiClient.post(`/admin/llm-keys/${id}/enable`);
    return unwrapResponse<{ ok: true }>(data);
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/admin/llm-keys/${id}`);
  },
};

