import { parseCredit, recordTypeLabel } from "@/features/costs/utils/formatCredit";
import type {
  BillItem,
  BillingRecordRow,
  ExpenseCategoryPoint,
  MonthlyRevenuePoint,
  RechargeOrderRow,
} from "../types";

const RECHARGE_CATEGORY = "购额充值";

export function rechargeOrderToBill(order: RechargeOrderRow): BillItem {
  const amount = parseCredit(order.amount);
  const settled = order.status === "approved";
  return {
    id: `recharge-${order.id}`,
    date: order.createdAt.slice(0, 10),
    type: "income",
    description: order.applyNote?.trim() || "购额充值",
    amount,
    category: RECHARGE_CATEGORY,
    status: settled ? "settled" : "pending",
  };
}

export function billingRecordToBill(record: BillingRecordRow): BillItem {
  const cost = parseCredit(record.cost);
  const label = recordTypeLabel(record.recordType);
  const modelPart = record.modelName ? ` · ${record.modelName}` : "";
  return {
    id: `usage-${record.id}`,
    date: record.usageDate ?? record.occurredAt.slice(0, 10),
    type: "expense",
    description: `${label}${modelPart}`,
    amount: -cost,
    category: label,
    status: "settled",
  };
}

export function mergeBills(orders: RechargeOrderRow[], records: BillingRecordRow[]): BillItem[] {
  const bills = [
    ...orders.map(rechargeOrderToBill),
    ...records.map(billingRecordToBill),
  ];
  bills.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return bills;
}

export function sumApprovedRechargeThisMonth(orders: RechargeOrderRow[]): number {
  const prefix = currentMonthKey();
  return orders
    .filter((o) => o.status === "approved" && o.createdAt.startsWith(prefix))
    .reduce((sum, o) => sum + parseCredit(o.amount), 0);
}

export function currentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function buildMonthFilterOptions(bills: BillItem[]): Array<{ key: string; label: string }> {
  const keys = new Set<string>();
  for (const bill of bills) {
    if (bill.date.length >= 7) keys.add(bill.date.slice(0, 7));
  }
  const sorted = [...keys].sort((a, b) => b.localeCompare(a));
  const options = [{ key: "", label: "全部" }];
  for (const key of sorted.slice(0, 6)) {
    const [, m] = key.split("-");
    options.push({ key, label: `${Number(m)}月` });
  }
  return options;
}

export function buildMonthlyRevenueChart(
  orders: RechargeOrderRow[],
  dailyTrend: Array<{ date: string; cost: string }>,
  months = 6,
): MonthlyRevenuePoint[] {
  const now = new Date();
  const points: MonthlyRevenuePoint[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const monthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const income = orders
      .filter((o) => o.status === "approved" && o.createdAt.startsWith(monthKey))
      .reduce((sum, o) => sum + parseCredit(o.amount), 0);
    const expense = dailyTrend
      .filter((row) => row.date.startsWith(monthKey))
      .reduce((sum, row) => sum + parseCredit(row.cost), 0);
    points.push({
      month: `${d.getUTCMonth() + 1}月`,
      monthKey,
      income,
      expense,
    });
  }

  return points;
}

export function buildExpenseCategoryChart(records: BillingRecordRow[]): ExpenseCategoryPoint[] {
  const byType = new Map<string, number>();
  const prefix = currentMonthKey();

  for (const record of records) {
    const date = record.usageDate ?? record.occurredAt.slice(0, 10);
    if (!date.startsWith(prefix)) continue;
    const label = recordTypeLabel(record.recordType);
    byType.set(label, (byType.get(label) ?? 0) + parseCredit(record.cost));
  }

  return [...byType.entries()]
    .map(([name, value]) => ({ name, value }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
}

export const CATEGORY_ICONS: Record<string, string> = {
  [RECHARGE_CATEGORY]: "💰",
  LLM: "🤖",
  Skill: "🔧",
  Embedding: "📊",
  Summary: "📋",
  "Agent 日": "👥",
  其他: "📦",
};
