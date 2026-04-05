import { apiClient } from './apiClient';

export type MarketplaceStatusFilter = 'all' | 'published' | 'draft';

export interface MarketplaceAdminListItem {
  id: string;
  name: string;
  slug: string;
  boundModelName: string | null;
  keyCount: number;
  priceCents: number;
  pricingModel: string;
  isPublished: boolean;
  updatedAt: string;
}

export interface MarketplaceAdminListResult {
  items: MarketplaceAdminListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface MarketplaceKeyBindingView {
  id: string;
  llmKeyId: string;
  sortOrder: number;
  keyAlias?: string;
  isActive?: boolean;
  usedTodayTokens?: string;
  remainingTokens?: string;
  modelName?: string;
  provider?: string;
}

export interface MarketplaceAdminAgentDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  expertise: string | null;
  systemPrompt: string | null;
  boundModelName: string | null;
  recommendedSkills: string[];
  skillTags: string[];
  pricingModel: string;
  priceCents: number;
  isPublished: boolean;
  keyBindings: MarketplaceKeyBindingView[];
}

export interface MarketplaceAdminUpdateInput {
  name?: string;
  description?: string | null;
  expertise?: string | null;
  systemPrompt?: string | null;
  boundModelName?: string | null;
  recommendedSkills?: string[];
  skillTags?: string[];
  pricingModel?: string;
  priceCents?: number;
  isPublished?: boolean;
  keyBindings?: Array<{ llmKeyId: string; sortOrder: number }>;
}

export interface MarketplaceAdminCreateInput {
  name: string;
  slug?: string;
  description?: string | null;
  expertise?: string | null;
  systemPrompt?: string | null;
  boundModelName?: string | null;
  recommendedSkills?: string[];
  skillTags?: string[];
  pricingModel?: string;
  priceCents?: number;
  isPublished?: boolean;
}

function unwrapResponse<T>(data: unknown): T {
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

export const marketplaceApi = {
  async list(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: MarketplaceStatusFilter;
  }): Promise<MarketplaceAdminListResult> {
    const { data } = await apiClient.get('/admin/marketplace/agents', { params });
    return unwrapResponse<MarketplaceAdminListResult>(data);
  },

  async findOne(id: string): Promise<MarketplaceAdminAgentDetail> {
    const { data } = await apiClient.get(`/admin/marketplace/agents/${id}`);
    return unwrapResponse<MarketplaceAdminAgentDetail>(data);
  },

  async create(input: MarketplaceAdminCreateInput): Promise<{ id: string; slug: string }> {
    const { data } = await apiClient.post('/admin/marketplace/agents', input);
    return unwrapResponse<{ id: string; slug: string }>(data);
  },

  async update(id: string, patch: MarketplaceAdminUpdateInput): Promise<{ ok: true }> {
    const { data } = await apiClient.put(`/admin/marketplace/agents/${id}`, patch);
    return unwrapResponse<{ ok: true }>(data);
  },
};

