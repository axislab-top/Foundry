import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCompanyAlerts, resolveCompanyAlert } from "../api/riskApi";
import { riskKeys } from "../queryKeys";
import type { RiskItem, RiskLevel, RiskStatus } from "../types";
import {
  buildRiskStats,
  buildTrendData,
  mapAlertToRiskItem,
} from "../utils/riskTransform";

export function useRiskMonitorPage(companyId: string) {
  const queryClient = useQueryClient();
  const [levelFilter, setLevelFilter] = useState<RiskLevel | "">("");
  const [statusFilter, setStatusFilter] = useState<RiskStatus | "">("");
  const [sortAsc, setSortAsc] = useState(false);
  const [processingRisk, setProcessingRisk] = useState<RiskItem | null>(null);
  const [processNote, setProcessNote] = useState("");

  const alertsQuery = useQuery({
    queryKey: riskKeys.list(companyId, {}),
    queryFn: () => fetchCompanyAlerts(companyId),
    staleTime: 30_000,
  });

  const resolveMutation = useMutation({
    mutationFn: ({ alertId, remark }: { alertId: string; remark?: string }) =>
      resolveCompanyAlert(alertId, remark),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: riskKeys.all });
      setProcessingRisk(null);
      setProcessNote("");
    },
  });

  const alerts = alertsQuery.data ?? [];
  const risks = useMemo(() => alerts.map(mapAlertToRiskItem), [alerts]);
  const stats = useMemo(() => buildRiskStats(alerts), [alerts]);
  const trendData = useMemo(() => buildTrendData(alerts), [alerts]);

  const filteredRisks = useMemo(() => {
    let result = risks;
    if (levelFilter) result = result.filter((r) => r.level === levelFilter);
    if (statusFilter) result = result.filter((r) => r.status === statusFilter);
    return [...result].sort((a, b) =>
      sortAsc ? a.triggeredAt.localeCompare(b.triggeredAt) : b.triggeredAt.localeCompare(a.triggeredAt),
    );
  }, [risks, levelFilter, statusFilter, sortAsc]);

  const handleResolve = () => {
    if (!processingRisk) return;
    resolveMutation.mutate({ alertId: processingRisk.id, remark: processNote });
  };

  return {
    loading: alertsQuery.isLoading,
    isFetching: alertsQuery.isFetching,
    hasError: alertsQuery.isError,
    resolveError: resolveMutation.isError,
    resolving: resolveMutation.isPending,
    refetch: () => void alertsQuery.refetch(),
    stats,
    trendData,
    filteredRisks,
    levelFilter,
    setLevelFilter,
    statusFilter,
    setStatusFilter,
    sortAsc,
    setSortAsc,
    processingRisk,
    setProcessingRisk,
    processNote,
    setProcessNote,
    handleResolve,
  };
}
