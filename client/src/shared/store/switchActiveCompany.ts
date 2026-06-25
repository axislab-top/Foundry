import type { QueryClient } from "@tanstack/react-query";
import { invalidateCompanyScopedQueries } from "@/shared/queries/invalidateCompanyScopedQueries";
import { useCompanyStore } from "@/shared/store/companyStore";

type CompanyRef = { id: string; name: string };

/**
 * 切换当前公司并清理租户级前端缓存（记忆/组织/任务等），防止 React Query 跨公司命中。
 */
export async function switchActiveCompany(
  queryClient: QueryClient,
  company: CompanyRef,
): Promise<void> {
  useCompanyStore.getState().setActiveCompany(company);
  await invalidateCompanyScopedQueries(queryClient);
}
