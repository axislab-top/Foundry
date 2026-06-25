import type { ScheduledPlaybookViewModel } from "./schedules-types";

export type SchedulePageStats = {
  enabledCount: number;
  todayRuns: number;
  failedCount: number;
  nextRunLabel: string;
};

export function computeScheduleStats(items: ScheduledPlaybookViewModel[]): SchedulePageStats {
  const enabled = items.filter((i) => i.enabled);
  const failedCount = items.filter((i) => i.lastRunStatus === "failed").length;
  const today = new Date().toDateString();
  const todayRuns = items.filter((i) => i.lastRunAt && new Date(i.lastRunAt).toDateString() === today).length;
  const next = enabled
    .map((i) => i.nextRunAt)
    .filter(Boolean)
    .sort()[0];
  return {
    enabledCount: enabled.length,
    todayRuns,
    failedCount,
    nextRunLabel: next ? new Date(next).toLocaleString("zh-CN") : "—",
  };
}
