import { adminAuthedRequestJson } from '../../shared/api/client';
import type {
  CompanyOption,
  CreateRechargeOrderDto,
  ListRechargeOrdersFilters,
  RechargeOrder,
  RechargeOrderStatus,
} from './types';

type ApiRechargeOrderRow = {
  id: string;
  companyId: string;
  amount: string | number;
  currency?: string;
  status: RechargeOrderStatus;
  idempotencyKey?: string | null;
  applyNote?: string | null;
  rejectReason?: string | null;
  requestedByUserId: string;
  reviewedByUserId?: string | null;
  reviewedAt?: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  companyName?: string | null;
};

type ListRechargeOrdersResponse = {
  items: ApiRechargeOrderRow[];
  total: number;
};

type CompaniesListResponse = {
  items: Array<{ id: string; name: string }>;
  total: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
};

const COMPANIES_PAGE_SIZE_MAX = 100;

function toIso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function mapOrder(row: ApiRechargeOrderRow): RechargeOrder {
  return {
    id: row.id,
    companyId: row.companyId,
    amount: String(row.amount),
    currency: row.currency ?? 'CREDIT',
    status: row.status,
    idempotencyKey: row.idempotencyKey ?? null,
    applyNote: row.applyNote ?? null,
    rejectReason: row.rejectReason ?? null,
    requestedByUserId: row.requestedByUserId,
    reviewedByUserId: row.reviewedByUserId ?? null,
    reviewedAt: toIso(row.reviewedAt),
    createdAt: toIso(row.createdAt) ?? '',
    updatedAt: toIso(row.updatedAt) ?? '',
    companyName: row.companyName ?? null,
  };
}

function mapApiError(message: string): string {
  if (message.includes('recharge_order_not_found')) return '订单不存在';
  if (message.includes('recharge_order_not_pending')) return '订单状态不可审批';
  if (message.includes('Insufficient permissions') || message.includes('Forbidden')) {
    return '无审批权限';
  }
  if (message.includes('invalid_order_amount')) return '购额数量无效';
  return message;
}

function wrapError(e: unknown): Error {
  if (e instanceof Error) {
    return new Error(mapApiError(e.message));
  }
  return new Error('请求失败');
}

export async function listCompanies(): Promise<CompanyOption[]> {
  const items: CompanyOption[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const result = await adminAuthedRequestJson<CompaniesListResponse>(
      `/api/v1/companies?page=${page}&pageSize=${COMPANIES_PAGE_SIZE_MAX}&sortBy=createdAt&sortOrder=DESC`,
    );
    items.push(...(result.items ?? []).map((c) => ({ id: c.id, name: c.name })));
    totalPages =
      result.totalPages ??
      Math.max(1, Math.ceil((result.total || items.length) / COMPANIES_PAGE_SIZE_MAX));
    page += 1;
  } while (page <= totalPages);
  return items;
}

export async function listRechargeOrders(
  filters: ListRechargeOrdersFilters = {},
): Promise<{ items: RechargeOrder[]; total: number }> {
  const query = new URLSearchParams();
  if (filters.companyId) query.set('companyId', filters.companyId);
  if (filters.requestedByUserId) query.set('requestedByUserId', filters.requestedByUserId);
  if (filters.reviewedByUserId) query.set('reviewedByUserId', filters.reviewedByUserId);
  if (filters.status) query.set('status', filters.status);
  if (filters.createdAfter) query.set('createdAfter', filters.createdAfter);
  if (filters.createdBefore) query.set('createdBefore', filters.createdBefore);
  if (filters.limit != null) query.set('limit', String(filters.limit));
  if (filters.offset != null) query.set('offset', String(filters.offset));

  const suffix = query.toString();
  const path = suffix
    ? `/api/admin/platform-ops/recharge-orders?${suffix}`
    : '/api/admin/platform-ops/recharge-orders';

  try {
    const result = await adminAuthedRequestJson<ListRechargeOrdersResponse>(path);
    return {
      items: (result.items ?? []).map(mapOrder),
      total: result.total ?? 0,
    };
  } catch (e) {
    throw wrapError(e);
  }
}

export async function createRechargeOrder(
  companyId: string,
  dto: CreateRechargeOrderDto,
): Promise<RechargeOrder> {
  try {
    const result = await adminAuthedRequestJson<{ order: ApiRechargeOrderRow }>(
      `/api/v1/companies/${encodeURIComponent(companyId)}/billing/recharge-orders`,
      {
        method: 'POST',
        body: JSON.stringify({
          amount: dto.amount,
          currency: 'CREDIT',
          applyNote: dto.applyNote,
          idempotencyKey: dto.idempotencyKey,
          requireApproval: dto.mode === 'approval',
        }),
      },
    );
    return mapOrder(result.order);
  } catch (e) {
    throw wrapError(e);
  }
}

export async function approveRechargeOrder(
  companyId: string,
  orderId: string,
): Promise<RechargeOrder> {
  try {
    const result = await adminAuthedRequestJson<{ order: ApiRechargeOrderRow }>(
      `/api/v1/companies/${encodeURIComponent(companyId)}/billing/recharge-orders/${encodeURIComponent(orderId)}/approve`,
      { method: 'POST', body: JSON.stringify({}) },
    );
    return mapOrder(result.order);
  } catch (e) {
    throw wrapError(e);
  }
}

export async function rejectRechargeOrder(
  companyId: string,
  orderId: string,
  rejectReason?: string,
): Promise<RechargeOrder> {
  try {
    const result = await adminAuthedRequestJson<{ order: ApiRechargeOrderRow }>(
      `/api/v1/companies/${encodeURIComponent(companyId)}/billing/recharge-orders/${encodeURIComponent(orderId)}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({ rejectReason: rejectReason?.trim() || undefined }),
      },
    );
    return mapOrder(result.order);
  } catch (e) {
    throw wrapError(e);
  }
}
