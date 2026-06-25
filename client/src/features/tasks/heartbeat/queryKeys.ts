export const heartbeatKeys = {
  all: ["heartbeat"] as const,
  config: (companyId: string | undefined) => [...heartbeatKeys.all, "config", companyId] as const,
  dashboard: (companyId: string | undefined) => [...heartbeatKeys.all, "dashboard", companyId] as const,
  runLogs: (runId: string | undefined) => [...heartbeatKeys.all, "run-logs", runId] as const,
};
