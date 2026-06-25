import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAgents, fetchOrganizationTree } from "@/features/organization/api/organizationApi";
import { organizationKeys } from "@/features/organization/api/queryKeys";
import { listAllTasks } from "@/features/tasks/api/tasksApi";
import { useCompanyStore } from "@/shared/store/companyStore";
import { buildAgentTeamCards } from "../utils/agentTeamViewModel";

export function useAgentTeamPage() {
  const companyId = useCompanyStore((s) => s.activeCompany?.id);

  const treeQuery = useQuery({
    queryKey: organizationKeys.tree(companyId),
    queryFn: fetchOrganizationTree,
    enabled: Boolean(companyId),
    staleTime: 15_000,
  });

  const agentsQuery = useQuery({
    queryKey: organizationKeys.agents(companyId),
    queryFn: fetchAgents,
    enabled: Boolean(companyId),
    staleTime: 15_000,
  });

  const tasksQuery = useQuery({
    queryKey: organizationKeys.tasks(companyId),
    queryFn: () => listAllTasks({ assigneeType: "agent" }),
    enabled: Boolean(companyId),
    staleTime: 10_000,
  });

  const agents = useMemo(
    () =>
      buildAgentTeamCards(
        agentsQuery.data ?? [],
        treeQuery.data ?? [],
        tasksQuery.data ?? [],
      ),
    [agentsQuery.data, tasksQuery.data, treeQuery.data],
  );

  const isLoading = Boolean(companyId) && (agentsQuery.isLoading || treeQuery.isLoading || tasksQuery.isLoading);
  const isError = agentsQuery.isError || treeQuery.isError || tasksQuery.isError;
  const errorMessage =
    (agentsQuery.error instanceof Error ? agentsQuery.error.message : null) ??
    (treeQuery.error instanceof Error ? treeQuery.error.message : null) ??
    (tasksQuery.error instanceof Error ? tasksQuery.error.message : null) ??
    "加载 Agent 团队失败";

  return {
    companyId,
    agents,
    tasks: tasksQuery.data ?? [],
    isLoading,
    isError,
    errorMessage,
    refetch: () => {
      void agentsQuery.refetch();
      void treeQuery.refetch();
      void tasksQuery.refetch();
    },
  };
}
