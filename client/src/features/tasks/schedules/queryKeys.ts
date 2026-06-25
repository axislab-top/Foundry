export const scheduleKeys = {
  all: ["playbook-schedules"] as const,
  list: (companyId: string | undefined) => [...scheduleKeys.all, "list", companyId] as const,
  detail: (companyId: string | undefined, scheduleId: string | undefined) =>
    [...scheduleKeys.all, "detail", companyId, scheduleId] as const,
};
