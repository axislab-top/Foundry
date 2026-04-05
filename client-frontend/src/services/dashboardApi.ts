import { apiClient } from './apiClient';
import { unwrapResponse } from './apiTypes';
import type { BillingDashboardSummary, CompanyDashboardSummary } from './dashboardTypes';

export async function getCompanySummary(): Promise<CompanyDashboardSummary> {
  const { data } = await apiClient.get<unknown>('/v1/dashboard');
  return unwrapResponse<CompanyDashboardSummary>(data);
}

export async function getBillingSummary(): Promise<BillingDashboardSummary> {
  const { data } = await apiClient.get<unknown>('/v1/dashboard/billing');
  return unwrapResponse<BillingDashboardSummary>(data);
}
