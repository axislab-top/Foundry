import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { env } from "@/shared/config/env";
import { useAuthStore } from "@/shared/store/authStore";
import { useCompanyStore } from "@/shared/store/companyStore";
import { isHeartbeatRun } from "./heartbeat-api";
import { heartbeatKeys } from "./queryKeys";

function extractRunFromPayload(payload: unknown): { metadata?: Record<string, unknown> | null } | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const run = (p.run ?? p) as Record<string, unknown>;
  if (!run || typeof run !== "object") return null;
  return { metadata: (run.metadata as Record<string, unknown> | null) ?? null };
}

export function useHeartbeatRealtime() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const companyId = useCompanyStore((s) => s.activeCompany?.id);
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // [MOCK] 跳过 WebSocket 连接（无后端 WS 服务）。恢复时删除下面这行 return
    return;
    // [MOCK] 结束
    if (!companyId || !accessToken) return;

    const wsBase = env.wsUrl
      .replace(/\/ws\/?$/, "")
      .replace(/^ws:\/\//i, "http://")
      .replace(/^wss:\/\//i, "https://");
    const socket = io(`${wsBase}/collaboration`, {
      transports: ["polling", "websocket"],
      auth: { token: accessToken, companyId },
    });
    socketRef.current = socket;

    const invalidateIfHeartbeat = (payload: unknown) => {
      const run = extractRunFromPayload(payload);
      if (run && isHeartbeatRun(run)) {
        void queryClient.invalidateQueries({ queryKey: heartbeatKeys.dashboard(companyId) });
      }
    };

    socket.on("connect", () => {
      socket.emit("join_company_tasks");
    });
    socket.on("run:succeeded", invalidateIfHeartbeat);
    socket.on("run:failed", invalidateIfHeartbeat);
    socket.on("run:updated", invalidateIfHeartbeat);

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, companyId, queryClient]);
}
