export type RechargeOrderStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type CompanyOption = {
  id: string;
  name: string;
};

export type RechargeOrder = {
  id: string;
  companyId: string;
  amount: string;
  currency: string;
  status: RechargeOrderStatus;
  idempotencyKey: string | null;
  applyNote: string | null;
  rejectReason: string | null;
  requestedByUserId: string;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  companyName?: string | null;
};

export type ListRechargeOrdersFilters = {
  /** 未传则返回全部公司的订单 */
  companyId?: string;
  requestedByUserId?: string;
  reviewedByUserId?: string;
  status?: RechargeOrderStatus;
  limit?: number;
  offset?: number;
  createdAfter?: string;
  createdBefore?: string;
};

export type CreateRechargeOrderDto = {
  amount: number;
  applyNote?: string;
  idempotencyKey?: string;
  mode?: 'instant' | 'approval';
};
