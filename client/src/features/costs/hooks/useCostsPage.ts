import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAgents } from "@/features/organization/api/organizationApi";
import {
  fetchAgentDailyUsage,
  fetchBillingDashboard,
  fetchDailyCostTrend,
  timeRangeToDays,
  timeRangeToIsoDates,
} from "../api/costsApi";
import { PAGE_SIZE } from "../components/CostsDetailTable";
import type { AgentDailyDetailTarget, AgentDailyRow, TimeRange } from "../types";

export function useCostsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("month");
  const [agentFilter, setAgentFilter] = useState("");
  const [page, setPage] = useState(1);
  const [detailTarget, setDetailTarget] = useState<AgentDailyDetailTarget | null>(null);

  const dateRange = useMemo(() => timeRangeToIsoDates(timeRange), [timeRange]);
  const trendDays = timeRangeToDays(timeRange);

  const dashboardQuery = useQuery({
    queryKey: ["costs-dashboard"],
    queryFn: fetchBillingDashboard,
    staleTime: 60_000,
  });

  const trendQuery = useQuery({
    queryKey: ["costs-daily-trend", trendDays],
    queryFn: () => fetchDailyCostTrend(trendDays),
    staleTime: 60_000,
  });

  const agentsQuery = useQuery({
    queryKey: ["costs-agents"],
    queryFn: fetchAgents,
    staleTime: 120_000,
  });

  const tableQuery = useQuery({
    queryKey: ["costs-agent-daily", dateRange.from, dateRange.to, agentFilter, page],
    queryFn: () =>
      fetchAgentDailyUsage({
        from: dateRange.from,
        to: dateRange.to,
        agentId: agentFilter || undefined,
        activeOnly: true,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
    staleTime: 30_000,
  });

  const chartRowsQuery = useQuery({
    queryKey: ["costs-agent-daily-chart", dateRange.from, dateRange.to],
    queryFn: () =>
      fetchAgentDailyUsage({
        from: dateRange.from,
        to: dateRange.to,
        activeOnly: true,
        limit: 200,
        offset: 0,
      }),
    staleTime: 60_000,
  });

  const handleTimeRangeChange = (range: TimeRange) => {
    setTimeRange(range);
    setPage(1);
  };

  const handleAgentFilterChange = (agentId: string) => {
    setAgentFilter(agentId);
    setPage(1);
  };

  const handleViewDetail = (row: AgentDailyRow) => {
    setDetailTarget({
      agentId: row.agentId,
      agentName: row.agentName,
      usageDate: row.usageDate,
    });
  };

  return {
    timeRange,
    setTimeRange: handleTimeRangeChange,
    agentFilter,
    setAgentFilter: handleAgentFilterChange,
    page,
    setPage,
    detailTarget,
    closeDetail: () => setDetailTarget(null),
    handleViewDetail,
    dashboard: dashboardQuery.data,
    dashboardLoading: dashboardQuery.isLoading,
    trend: trendQuery.data ?? [],
    trendLoading: trendQuery.isLoading,
    tableRows: tableQuery.data?.items ?? [],
    tableTotal: tableQuery.data?.total ?? 0,
    tableLoading: tableQuery.isLoading,
    chartRows: chartRowsQuery.data?.items ?? [],
    chartLoading: chartRowsQuery.isLoading,
    agents: agentsQuery.data ?? [],
    chartsLoading: trendQuery.isLoading || chartRowsQuery.isLoading,
  };
}
