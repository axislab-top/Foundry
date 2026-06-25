export type AgentStatus = "running" | "idle";
export type HireVariant = "employee" | "director";

export interface FounderNode {
  id: string;
  name: string;
  title: string;
}

export interface DepartmentNode {
  id: string;
  slug: string;
  name: string;
  nameEn: string;
  color: string;
  colorBg: string;
  colorBorder: string;
  colorLight: string;
  directorId: string | null;
}

export interface DirectorNode {
  id: string;
  name: string;
  role: string;
  roleEn: string;
  status: AgentStatus;
  departmentId: string;
  todayTasks: number;
  completedTasks: number;
  templateId?: string;
}

export interface AgentNode {
  id: string;
  name: string;
  role: string;
  roleEn: string;
  status: AgentStatus;
  todayTasks: number;
  completedTasks: number;
  departmentId: string;
  templateId?: string;
}

export interface PlatformDepartmentTemplate {
  slug: string;
  displayName: string;
  nameEn: string;
  category: string;
  responsibilitySummary: string;
  color: string;
  colorBg: string;
  colorBorder: string;
  colorLight: string;
  sortOrder: number;
}

export interface OrgChartData {
  founder: FounderNode;
  departments: DepartmentNode[];
  directors: DirectorNode[];
  agents: AgentNode[];
}

export type ToastState = { message: string; kind?: "success" | "info" } | null;
