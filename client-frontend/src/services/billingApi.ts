import { apiClient } from './apiClient';
import { unwrapResponse } from './apiTypes';
import type { BillingDashboardSummary } from './dashboardTypes';

export interface BillingRecord {
  id: string;
  companyId: string;
  agentId?: string | null;
  taskId?: string | null;
  skillId?: string | null;
  modelName?: string | null;
  recordType?: string;
  cost: string;
  currency?: string;
  occurredAt: string;
}

export interface BudgetItem {
  id: string;
  companyId: string;
  scope: 'company' | 'department' | 'agent';
  period: 'none' | 'monthly' | 'quarterly';
  totalAmount: string;
  usedAmount: string;
  warningThreshold: string;
  currency: string;
  departmentId?: string | null;
  agentId?: string | null;
}

export interface QueryBillingRecordsParams {
  limit?: number;
  offset?: number;
  modelName?: string;
  recordType?: string;
  agentId?: string;
}

export interface BillingRecordsResult {
  items: BillingRecord[];
  total: number;
}

export interface UpsertBudgetPayload {
  scope: 'company' | 'department' | 'agent';
  period: 'none' | 'monthly' | 'quarterly';
  totalAmount: number;
  warningThreshold?: number;
  departmentId?: string;
  agentId?: string;
}

export async function getBillingSummary(): Promise<BillingDashboardSummary> {
  const { data } = await apiClient.get<unknown>('/v1/dashboard/billing');
  return unwrapResponse<BillingDashboardSummary>(data);
}

export async function listBillingBudgets(): Promise<BudgetItem[]> {
  const { data } = await apiClient.get<unknown>('/v1/billing/budgets');
  return unwrapResponse<BudgetItem[]>(data);
}

export async function listBillingRecords(
  params?: QueryBillingRecordsParams,
): Promise<BillingRecordsResult> {
  const { data } = await apiClient.get<unknown>('/v1/billing/records', { params });
  return unwrapResponse<BillingRecordsResult>(data);
}

export async function upsertBillingBudget(payload: UpsertBudgetPayload): Promise<BudgetItem> {
  const { data } = await apiClient.put<unknown>('/v1/billing/budgets', payload);
  return unwrapResponse<BudgetItem>(data);
}
