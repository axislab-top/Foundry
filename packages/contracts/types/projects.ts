export type ProjectStatus = 'active' | 'paused' | 'completed';

export interface ProjectDto {
  id: string;
  companyId: string;
  name: string;
  client: string;
  status: ProjectStatus;
  deadline: string | null;
  progress: number;
  notes: string | null;
  taskCount?: number;
  agentCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectTaskSummary {
  id: string;
  title: string;
  status: string;
  assignee: string;
}

export interface ProjectAgentSummary {
  id: string;
  name: string;
  role: string;
  status: string;
}
