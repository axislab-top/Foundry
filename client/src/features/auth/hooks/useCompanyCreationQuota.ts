import { useQuery } from "@tanstack/react-query";
import { fetchCompanyCreationQuota, type CompanyCreationQuota } from "@/features/auth/api/companiesApi";

export function useCompanyCreationQuota(enabled = true) {
  return useQuery<CompanyCreationQuota>({
    queryKey: ["company-creation-quota"],
    queryFn: fetchCompanyCreationQuota,
    enabled,
    staleTime: 30_000,
  });
}

export function formatCompanyCreationQuotaHint(quota: CompanyCreationQuota | undefined): string | null {
  if (!quota) return null;
  if (!quota.canCreate) {
    return `您已达到创建上限（${quota.maxOwned} 家）。如需新建，请先删除或归档现有公司。`;
  }
  if (quota.ownedCount > 0) {
    return `已创建 ${quota.ownedCount}/${quota.maxOwned} 家公司`;
  }
  return null;
}
