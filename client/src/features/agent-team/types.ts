export type AgentTeamStatus = "running" | "idle" | "error";

export type AgentTeamCard = {
  id: string;
  name: string;
  role: string;
  roleEn: string;
  status: AgentTeamStatus;
  avatar: { initials: string; color: string };
  executionsToday: number;
  taskCount: number;
  lastActiveAt: string | null;
  lastActiveLabel: string;
  description: string;
  departmentName: string | null;
  apiStatus: string;
};

export type AgentTeamExecutionRow = {
  id: string;
  time: string;
  task: string;
  result: "success" | "failed" | "timeout" | "running" | "pending";
};

export type AgentTeamTaskRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
};
