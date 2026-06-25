import type { ProjectQueryParams } from "./projectsTypes";

export const projectKeys = {
  all: ["projects"] as const,
  list: (params: ProjectQueryParams) => [...projectKeys.all, "list", params] as const,
  detail: (id: string) => [...projectKeys.all, "detail", id] as const,
  tasks: (id: string) => [...projectKeys.all, "tasks", id] as const,
  agents: (id: string) => [...projectKeys.all, "agents", id] as const,
};
