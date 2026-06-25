export type DailyBriefPendingKind = 'approval' | 'task' | 'message';
export type DailyBriefPriority = 'high' | 'medium' | 'low';
export type DailyBriefSummarySource = 'heartbeat' | 'template' | 'empty';

export type DailyBriefResponse = {
  companyId: string;
  user: { displayName: string };
  timezone: string;
  briefDate: string;
  yesterdaySummary: {
    text: string;
    source: DailyBriefSummarySource;
    briefDate: string;
    generatedAt: string | null;
  };
  pendingItems: Array<{
    id: string;
    kind: DailyBriefPendingKind;
    title: string;
    tag: string;
    priority: DailyBriefPriority;
    href: string;
  }>;
  keyMetrics: {
    tasksExecutedYesterday: number;
    successRatePercent: number | null;
    approvalsHandledYesterday: number;
    estimatedTimeSavedHours: number;
  };
  generatedAt: string;
};
