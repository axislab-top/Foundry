import { useQuery } from "@tanstack/react-query";
import { useCompanyStore } from "@/shared/store/companyStore";
import { fetchHeartbeatDashboardRaw } from "./heartbeat-api";
import { mapHeartbeatDashboard } from "./heartbeatModel";
import { heartbeatKeys } from "./queryKeys";

export function useHeartbeatDashboard() {
  const companyId = useCompanyStore((s) => s.activeCompany?.id);

  return useQuery({
    queryKey: heartbeatKeys.dashboard(companyId),
    queryFn: async () => {
      const raw = await fetchHeartbeatDashboardRaw(companyId!);
      return mapHeartbeatDashboard(raw);
    },
    enabled: Boolean(companyId),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
