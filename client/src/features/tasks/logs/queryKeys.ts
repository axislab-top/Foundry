export const executionLogsKeys = {
  taskRuns: (companyId: string | undefined) => ["execution-logs", "task-runs", companyId] as const,
  taskRunsPage: (companyId: string | undefined, page: number, limit: number) =>
    ["execution-logs", "task-runs", companyId, "page", page, limit] as const,
  runLogs: (companyId: string | undefined, runId: string | undefined) =>
    ["execution-logs", "run-logs", companyId, runId] as const,
};
