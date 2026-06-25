import { useQuery } from "@tanstack/react-query";
import { useCompanyStore } from "@/shared/store/companyStore";
import { fetchDailyBrief } from "./daily-brief-api";

export function useDailyBrief() {
  const companyId = useCompanyStore((s) => s.activeCompany?.id);

  return useQuery({
    queryKey: ["daily-brief", companyId],
    queryFn: () => fetchDailyBrief(),
    enabled: Boolean(companyId),
    staleTime: 30_000,
  });
}
