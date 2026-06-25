export type DailyBriefPendingKind = "approval" | "task" | "message";
export type DailyBriefPriority = "high" | "medium" | "low";
export type DailyBriefSummarySource = "heartbeat" | "template" | "empty";

export type DailyBriefApiResponse = {
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

export type DailyBriefPendingSource = "审批" | "任务" | "消息";

export type DailyBriefPendingItem = {
  id: string;
  source: DailyBriefPendingSource;
  icon: "FileCheck" | "ListTodo" | "MessageSquare";
  title: string;
  tag: string;
  priority: "高" | "中" | "低";
  linkTo: string;
};

export type DailyBriefKeyMetric = {
  id: "tasks" | "success" | "approvals" | "time-saved";
  label: string;
  labelEn: string;
  value: number;
  suffix: "" | "%" | "h";
  iconKey: "CheckCircle2" | "TrendingUp" | "ShieldCheck" | "Clock";
};

export type DailyBriefViewModel = {
  userName: string;
  yesterdaySummary: {
    text: string;
    sourceLabel: string;
  };
  pendingItems: DailyBriefPendingItem[];
  keyMetrics: DailyBriefKeyMetric[];
};

const KIND_TO_SOURCE: Record<DailyBriefPendingKind, DailyBriefPendingSource> = {
  approval: "审批",
  task: "任务",
  message: "消息",
};

const KIND_TO_ICON: Record<DailyBriefPendingKind, DailyBriefPendingItem["icon"]> = {
  approval: "FileCheck",
  task: "ListTodo",
  message: "MessageSquare",
};

const PRIORITY_TO_ZH: Record<DailyBriefPriority, DailyBriefPendingItem["priority"]> = {
  high: "高",
  medium: "中",
  low: "低",
};

const SUMMARY_SOURCE_LABEL: Record<DailyBriefSummarySource, string> = {
  heartbeat: "AI Daily Summary · Heartbeat",
  template: "AI Daily Summary · 指标汇总",
  empty: "AI Daily Summary",
};

export function mapDailyBriefResponse(data: DailyBriefApiResponse): DailyBriefViewModel {
  return {
    userName: data.user.displayName,
    yesterdaySummary: {
      text: data.yesterdaySummary.text,
      sourceLabel: SUMMARY_SOURCE_LABEL[data.yesterdaySummary.source],
    },
    pendingItems: data.pendingItems.map((item) => ({
      id: item.id,
      source: KIND_TO_SOURCE[item.kind],
      icon: KIND_TO_ICON[item.kind],
      title: item.title,
      tag: item.tag,
      priority: PRIORITY_TO_ZH[item.priority],
      linkTo: item.href,
    })),
    keyMetrics: [
      {
        id: "tasks",
        label: "昨日执行任务",
        labelEn: "Tasks Executed",
        value: data.keyMetrics.tasksExecutedYesterday,
        suffix: "",
        iconKey: "CheckCircle2",
      },
      {
        id: "success",
        label: "成功率",
        labelEn: "Success Rate",
        value: data.keyMetrics.successRatePercent ?? 0,
        suffix: "%",
        iconKey: "TrendingUp",
      },
      {
        id: "approvals",
        label: "处理审批",
        labelEn: "Approvals Handled",
        value: data.keyMetrics.approvalsHandledYesterday,
        suffix: "",
        iconKey: "ShieldCheck",
      },
      {
        id: "time-saved",
        label: "节省估算时间",
        labelEn: "Est. Time Saved",
        value: data.keyMetrics.estimatedTimeSavedHours,
        suffix: "h",
        iconKey: "Clock",
      },
    ],
  };
}
