import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompanyStore } from "@/shared/store/companyStore";
import { updateHeartbeatConfig } from "./heartbeat-api";
import type { UpdateHeartbeatConfigPayload } from "./heartbeat-types";
import { heartbeatKeys } from "./queryKeys";

/** 仅负责配置 PATCH；读取由 useHeartbeatDashboard 统一完成，避免重复请求 */
export function useHeartbeatConfig() {
  const companyId = useCompanyStore((s) => s.activeCompany?.id);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: UpdateHeartbeatConfigPayload) =>
      updateHeartbeatConfig(companyId!, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: heartbeatKeys.dashboard(companyId) });
    },
  });

  return { updateConfig: mutation.mutateAsync, isUpdating: mutation.isPending };
}
