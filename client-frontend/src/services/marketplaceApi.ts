import { apiClient } from './apiClient';
import { unwrapResponse } from './apiTypes';
import type { Paginated } from './companiesApi';

/** 商城 Agent 上架条目（与后端 MarketplaceAgent 对齐字段） */
export interface MarketplaceAgentItem {
  id: string;
  name: string;
  slug?: string;
  description?: string | null;
  expertise?: string | null;
  boundModelName?: string | null;
  usageCount?: number;
  pricingModel?: string;
  [key: string]: unknown;
}

export async function listMarketplaceAgents(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  /** 逗号分隔或单标签，与后端 skill_tags 重叠过滤 */
  skillTags?: string;
}): Promise<Paginated<MarketplaceAgentItem>> {
  const { data } = await apiClient.get<unknown>('/v1/marketplace/agents', { params });
  return unwrapResponse<Paginated<MarketplaceAgentItem>>(data);
}
