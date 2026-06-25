import { mockCompanies, MOCK_ADMIN_USER_ID, seedRechargeOrders } from './mock-data';
import type {
  CompanyOption,
  CreateRechargeOrderDto,
  ListRechargeOrdersFilters,
  RechargeOrder,
} from './types';

let orders: RechargeOrder[] = seedRechargeOrders.map((o) => ({ ...o }));

function delay(ms = 300): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function newId(): string {
  return `o${crypto.randomUUID().slice(1)}`;
}

export async function listCompanies(): Promise<CompanyOption[]> {
  await delay(150);
  return [...mockCompanies];
}

export async function listRechargeOrders(
  filters: ListRechargeOrdersFilters = {},
): Promise<{ items: RechargeOrder[]; total: number }> {
  await delay(300);
  let items = [...orders];
  if (filters.companyId) {
    items = items.filter((o) => o.companyId === filters.companyId);
  }
  if (filters.status) {
    items = items.filter((o) => o.status === filters.status);
  }
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const total = items.length;
  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? 50;
  items = items.slice(offset, offset + limit);
  return { items, total };
}

export async function createRechargeOrder(
  companyId: string,
  dto: CreateRechargeOrderDto,
): Promise<RechargeOrder> {
  await delay(400);
  const now = new Date().toISOString();
  const instant = dto.mode !== 'approval';
  const order: RechargeOrder = {
    id: newId(),
    companyId,
    amount: String(dto.amount),
    currency: 'CREDIT',
    status: instant ? 'approved' : 'pending',
    idempotencyKey: dto.idempotencyKey?.trim() || null,
    applyNote: dto.applyNote?.trim() || null,
    rejectReason: null,
    requestedByUserId: MOCK_ADMIN_USER_ID,
    reviewedByUserId: instant ? MOCK_ADMIN_USER_ID : null,
    reviewedAt: instant ? now : null,
    createdAt: now,
    updatedAt: now,
  };
  orders = [order, ...orders];
  return order;
}

export async function approveRechargeOrder(
  companyId: string,
  orderId: string,
): Promise<RechargeOrder> {
  await delay(350);
  const idx = orders.findIndex((o) => o.id === orderId && o.companyId === companyId);
  if (idx < 0) {
    throw new Error('recharge_order_not_found');
  }
  const locked = orders[idx];
  if (locked.status !== 'pending') {
    throw new Error(`recharge_order_not_pending:${locked.status}`);
  }
  const now = new Date().toISOString();
  const updated: RechargeOrder = {
    ...locked,
    status: 'approved',
    reviewedByUserId: MOCK_ADMIN_USER_ID,
    reviewedAt: now,
    updatedAt: now,
  };
  orders = orders.map((o, i) => (i === idx ? updated : o));
  return updated;
}

export async function rejectRechargeOrder(
  companyId: string,
  orderId: string,
  rejectReason?: string,
): Promise<RechargeOrder> {
  await delay(350);
  const idx = orders.findIndex((o) => o.id === orderId && o.companyId === companyId);
  if (idx < 0) {
    throw new Error('recharge_order_not_found');
  }
  const locked = orders[idx];
  if (locked.status !== 'pending') {
    throw new Error(`recharge_order_not_pending:${locked.status}`);
  }
  const now = new Date().toISOString();
  const updated: RechargeOrder = {
    ...locked,
    status: 'rejected',
    rejectReason: rejectReason?.trim() || null,
    reviewedByUserId: MOCK_ADMIN_USER_ID,
    reviewedAt: now,
    updatedAt: now,
  };
  orders = orders.map((o, i) => (i === idx ? updated : o));
  return updated;
}

/** 测试或重置演示数据 */
export function resetMockOrders(): void {
  orders = seedRechargeOrders.map((o) => ({ ...o }));
}
