import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseCredit } from "@/features/costs/utils/formatCredit";
import {
  fetchGovernanceBillingDashboard,
  fetchGovernanceBillingRecords,
  fetchGovernanceCostTrend,
  fetchRechargeOrders,
} from "../api/billingApi";
import { billingKeys } from "../queryKeys";
import type { BillType } from "../types";
import {
  buildExpenseCategoryChart,
  buildMonthFilterOptions,
  buildMonthlyRevenueChart,
  mergeBills,
  sumApprovedRechargeThisMonth,
} from "../utils/billingTransform";

const RECORDS_LOOKBACK_MONTHS = 6;
const TREND_DAYS = 180;

function recordsFromDate(): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - RECORDS_LOOKBACK_MONTHS);
  d.setUTCDate(1);
  return d.toISOString().slice(0, 10);
}

export function useBillingPage(companyId: string) {
  const recordsFrom = recordsFromDate();

  const [typeFilter, setTypeFilter] = useState<BillType | "">("");
  const [monthFilter, setMonthFilter] = useState("");

  const dashboardQuery = useQuery({
    queryKey: billingKeys.dashboard(companyId),
    queryFn: fetchGovernanceBillingDashboard,
    staleTime: 60_000,
  });

  const trendQuery = useQuery({
    queryKey: billingKeys.trend(companyId, TREND_DAYS),
    queryFn: () => fetchGovernanceCostTrend(TREND_DAYS),
    staleTime: 60_000,
  });

  const ordersQuery = useQuery({
    queryKey: billingKeys.rechargeOrders(companyId),
    queryFn: () => fetchRechargeOrders(companyId),
    staleTime: 30_000,
  });

  const recordsQuery = useQuery({
    queryKey: billingKeys.records(companyId, recordsFrom),
    queryFn: () => fetchGovernanceBillingRecords({ from: recordsFrom }),
    staleTime: 30_000,
  });

  const dashboard = dashboardQuery.data;
  const orders = ordersQuery.data?.items ?? [];
  const records = recordsQuery.data?.items ?? [];
  const dailyTrend = trendQuery.data ?? [];

  const bills = useMemo(() => mergeBills(orders, records), [orders, records]);

  const filteredBills = useMemo(() => {
    let result = bills;
    if (typeFilter) result = result.filter((b) => b.type === typeFilter);
    if (monthFilter) result = result.filter((b) => b.date.startsWith(monthFilter));
    return result;
  }, [bills, typeFilter, monthFilter]);

  const monthOptions = useMemo(() => buildMonthFilterOptions(bills), [bills]);
  const monthlyChart = useMemo(
    () => buildMonthlyRevenueChart(orders, dailyTrend),
    [orders, dailyTrend],
  );
  const expenseCategories = useMemo(() => buildExpenseCategoryChart(records), [records]);

  const totalIncome = sumApprovedRechargeThisMonth(orders);
  const totalExpense = parseCredit(dashboard?.aggregates.monthCost);
  const netChange = totalIncome - totalExpense;

  const budgetTotal = parseCredit(dashboard?.budget?.totalAmount);
  const budgetUsed = parseCredit(dashboard?.budget?.usedAmount);
  const budgetRemaining = budgetTotal - budgetUsed;
  const budgetPercent = budgetTotal > 0 ? Math.min(100, Math.round((budgetUsed / budgetTotal) * 100)) : 0;
  const isOverBudget = budgetTotal > 0 && budgetUsed > budgetTotal;

  const loading =
    dashboardQuery.isLoading ||
    trendQuery.isLoading ||
    ordersQuery.isLoading ||
    recordsQuery.isLoading;

  return {
    loading,
    typeFilter,
    setTypeFilter,
    monthFilter,
    setMonthFilter,
    monthOptions,
    totalIncome,
    totalExpense,
    netChange,
    budgetPercent,
    budgetRemaining,
    isOverBudget,
    monthlyChart,
    expenseCategories,
    filteredBills,
    hasError: dashboardQuery.isError || ordersQuery.isError || recordsQuery.isError,
    refetch: () => {
      void dashboardQuery.refetch();
      void trendQuery.refetch();
      void ordersQuery.refetch();
      void recordsQuery.refetch();
    },
  };
}
