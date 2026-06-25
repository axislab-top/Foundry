export type BillType = "income" | "expense";

export type BillStatus = "settled" | "pending";

export type RechargeOrderStatus = "pending" | "approved" | "rejected" | "cancelled";

export type BillingRecordType = "llm" | "embedding" | "skill" | "summary" | "agent_day" | "other";

export type BillItem = {
  id: string;
  date: string;
  type: BillType;
  description: string;
  amount: number;
  category: string;
  status: BillStatus;
};

export type RechargeOrderRow = {
  id: string;
  companyId: string;
  amount: string;
  currency: string;
  status: RechargeOrderStatus;
  applyNote: string | null;
  rejectReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export type BillingRecordRow = {
  id: string;
  recordType: BillingRecordType;
  modelName: string | null;
  cost: string;
  currency: string;
  occurredAt: string;
  usageDate: string | null;
};

export type MonthlyRevenuePoint = {
  month: string;
  monthKey: string;
  income: number;
  expense: number;
};

export type ExpenseCategoryPoint = {
  name: string;
  value: number;
};

export type UpsertBudgetPayload = {
  scope: "company";
  period: "monthly";
  totalAmount: number;
};
