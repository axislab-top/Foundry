// 待办摘要数据
export const summaryCards = [
  {
    id: "pending-approvals",
    title: "待审批",
    titleEn: "Pending Approvals",
    value: 5,
    icon: "FileCheck",
    linkTo: "/collaboration/pending-approvals",
  },
  {
    id: "abnormal-tasks",
    title: "异常任务",
    titleEn: "Abnormal Tasks",
    value: 2,
    icon: "AlertTriangle",
    linkTo: "/tasks/center",
  },
  {
    id: "unread-messages",
    title: "未读消息",
    titleEn: "Unread Messages",
    value: 12,
    icon: "MessageSquare",
    linkTo: "/collaboration/chats",
  },
];

// 最近 7 天任务完成趋势（折线图）
export const taskTrendData = [
  { date: "05-06", completed: 8, failed: 1 },
  { date: "05-07", completed: 12, failed: 0 },
  { date: "05-08", completed: 6, failed: 2 },
  { date: "05-09", completed: 15, failed: 1 },
  { date: "05-10", completed: 10, failed: 0 },
  { date: "05-11", completed: 18, failed: 1 },
  { date: "05-12", completed: 14, failed: 0 },
];

// Agent 本周执行任务数量（柱状图）
export const agentTaskData = [
  { name: "CEO Agent", tasks: 24 },
  { name: "CTO Agent", tasks: 18 },
  { name: "CFO Agent", tasks: 12 },
  { name: "Marketing", tasks: 31 },
  { name: "HR Agent", tasks: 9 },
  { name: "Dev Agent", tasks: 27 },
];

// Agent 运行状态
export type AgentStatus = "running" | "idle" | "error";

export interface AgentStatusItem {
  id: string;
  name: string;
  status: AgentStatus;
  todayExecutions: number;
}

export const agentStatusData: AgentStatusItem[] = [
  { id: "agent-ceo", name: "CEO Agent", status: "running", todayExecutions: 14 },
  { id: "agent-cto", name: "CTO Agent", status: "running", todayExecutions: 8 },
  { id: "agent-cfo", name: "CFO Agent", status: "idle", todayExecutions: 3 },
  { id: "agent-marketing", name: "Marketing Agent", status: "running", todayExecutions: 21 },
  { id: "agent-hr", name: "HR Agent", status: "error", todayExecutions: 0 },
  { id: "agent-dev", name: "Dev Agent", status: "running", todayExecutions: 15 },
];
