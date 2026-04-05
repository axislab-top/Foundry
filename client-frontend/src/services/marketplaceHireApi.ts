import { apiClient } from './apiClient';
import { unwrapResponse } from './apiTypes';
import type { Paginated } from './companiesApi';

export type MarketplaceHireStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'failed';

export interface MarketplaceHireRequest {
  id: string;
  companyId: string;
  marketplaceAgentId: string;
  organizationNodeId: string;
  status: MarketplaceHireStatus;
  requestedByUserId: string;
  requestedReason: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  purchaseEventId: string | null;
  errorMessage: string | null;
  resultAgentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function createMarketplaceHireRequest(
  companyId: string,
  body: {
    marketplaceAgentId: string;
    organizationNodeId: string;
    requestedReason?: string;
  },
): Promise<MarketplaceHireRequest> {
  const { data } = await apiClient.post<unknown>(
    `/companies/${companyId}/marketplace/hire-requests`,
    body,
  );
  return unwrapResponse<MarketplaceHireRequest>(data);
}

export async function listMarketplaceHireRequests(
  companyId: string,
  params?: { page?: number; pageSize?: number; status?: MarketplaceHireStatus },
): Promise<Paginated<MarketplaceHireRequest>> {
  const { data } = await apiClient.get<unknown>(`/companies/${companyId}/marketplace/hire-requests`, {
    params,
  });
  return unwrapResponse<Paginated<MarketplaceHireRequest>>(data);
}

export async function getMarketplaceHireRequest(
  companyId: string,
  id: string,
): Promise<MarketplaceHireRequest> {
  const { data } = await apiClient.get<unknown>(`/companies/${companyId}/marketplace/hire-requests/${id}`);
  return unwrapResponse<MarketplaceHireRequest>(data);
}

export async function approveMarketplaceHireRequest(
  companyId: string,
  id: string,
): Promise<MarketplaceHireRequest> {
  const { data } = await apiClient.post<unknown>(
    `/companies/${companyId}/marketplace/hire-requests/${id}/approve`,
    {},
  );
  return unwrapResponse<MarketplaceHireRequest>(data);
}

export async function rejectMarketplaceHireRequest(
  companyId: string,
  id: string,
  body?: { rejectReason?: string },
): Promise<MarketplaceHireRequest> {
  const { data } = await apiClient.post<unknown>(
    `/companies/${companyId}/marketplace/hire-requests/${id}/reject`,
    body ?? {},
  );
  return unwrapResponse<MarketplaceHireRequest>(data);
}
