export type ProjectStatus = "active" | "paused" | "completed";

export type ProjectItem = {
  id: string;
  companyId: string;
  name: string;
  client: string;
  status: ProjectStatus;
  deadline: string | null;
  progress: number;
  notes: string | null;
  taskCount: number;
  agentCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectListResponse = {
  items: ProjectItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages?: number;
};

export type ProjectQueryParams = {
  page?: number;
  pageSize?: number;
  status?: ProjectStatus;
  client?: string;
  q?: string;
};

export type CreateProjectPayload = {
  name: string;
  client: string;
  status?: ProjectStatus;
  deadline?: string | null;
  progress?: number;
  notes?: string | null;
};

export type UpdateProjectPayload = Partial<CreateProjectPayload>;

export type ProjectTaskSummary = {
  id: string;
  title: string;
  status: string;
  assignee: string;
};

export type ProjectAgentSummary = {
  id: string;
  name: string;
  role: string;
  status: string;
};

export type ProjectFormData = {
  name: string;
  client: string;
  status: ProjectStatus;
  deadline: string;
  notes: string;
  progress: number;
};
