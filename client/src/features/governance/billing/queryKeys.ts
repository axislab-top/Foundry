export const billingKeys = {
  all: ["governance-billing"] as const,
  dashboard: (companyId: string | undefined) => [...billingKeys.all, "dashboard", companyId] as const,
  trend: (companyId: string | undefined, days: number) =>
    [...billingKeys.all, "trend", companyId, days] as const,
  rechargeOrders: (companyId: string | undefined) =>
    [...billingKeys.all, "recharge-orders", companyId] as const,
  records: (companyId: string | undefined, from: string) =>
    [...billingKeys.all, "records", companyId, from] as const,
};
