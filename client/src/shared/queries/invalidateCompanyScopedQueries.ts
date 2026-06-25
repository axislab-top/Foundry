import type { QueryClient } from "@tanstack/react-query";
import { memoryKeys } from "@/features/memory/shared/queryKeys";
import { organizationKeys } from "@/features/organization/api/queryKeys";
import { heartbeatKeys } from "@/features/tasks/heartbeat/queryKeys";
import { marketplaceKeys } from "@/features/marketplace/api/queryKeys";
import { scheduleKeys } from "@/features/tasks/schedules/queryKeys";
import { fileAssetKeys } from "@/features/memory/files/api/queryKeys";
import { projectKeys } from "@/features/projects/api/queryKeys";
import { billingKeys } from "@/features/governance/billing/queryKeys";

/** 切换 activeCompany 后失效所有租户相关 React Query 缓存，避免跨公司展示陈旧数据。 */
export async function invalidateCompanyScopedQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: memoryKeys.all }),
    queryClient.invalidateQueries({ queryKey: organizationKeys.all }),
    queryClient.invalidateQueries({ queryKey: heartbeatKeys.all }),
    queryClient.invalidateQueries({ queryKey: marketplaceKeys.all }),
    queryClient.invalidateQueries({ queryKey: scheduleKeys.all }),
    queryClient.invalidateQueries({ queryKey: fileAssetKeys.all }),
    queryClient.invalidateQueries({ queryKey: projectKeys.all }),
    queryClient.invalidateQueries({ queryKey: billingKeys.all }),
    queryClient.invalidateQueries({ queryKey: ["tasks-board"] }),
    queryClient.invalidateQueries({ queryKey: ["tasks-center"] }),
    queryClient.invalidateQueries({ queryKey: ["daily-brief"] }),
    queryClient.invalidateQueries({ queryKey: ["company-membership-me"] }),
    queryClient.invalidateQueries({ queryKey: ["collaboration"] }),
  ]);
}
