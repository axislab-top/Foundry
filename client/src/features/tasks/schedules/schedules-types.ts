export type ScheduleKind = "daily" | "weekly" | "cron";
export type DeliveryChannel = "none" | "main_room";
export type LastRunStatus = "succeeded" | "failed" | "skipped" | "enqueued";

export type ScheduledPlaybookApi = {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  scheduleKind: ScheduleKind;
  timeOfDay: string | null;
  daysOfWeek: number[] | null;
  cronExpression: string | null;
  timezone: string;
  assigneeAgentId: string;
  assigneeAgentName?: string | null;
  skillName: string;
  playbookArgs: Record<string, unknown>;
  deliveryChannel: DeliveryChannel;
  requiresHumanApproval: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  lastTaskId: string | null;
  lastRunStatus: LastRunStatus | null;
  createdByUserId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ScheduledPlaybookViewModel = ScheduledPlaybookApi;

export type CreateScheduledPlaybookPayload = {
  name: string;
  description?: string;
  enabled?: boolean;
  scheduleKind: ScheduleKind;
  timeOfDay?: string;
  daysOfWeek?: number[];
  cronExpression?: string;
  timezone?: string;
  assigneeAgentId: string;
  skillName?: string;
  playbookArgs?: Record<string, unknown>;
  deliveryChannel?: DeliveryChannel;
  requiresHumanApproval?: boolean;
};

export type UpdateScheduledPlaybookPayload = Partial<CreateScheduledPlaybookPayload>;

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

export function formatScheduleSummary(item: ScheduledPlaybookViewModel): string {
  if (item.scheduleKind === "cron") {
    return `Cron · ${item.cronExpression ?? "—"}`;
  }
  const time = item.timeOfDay ?? "—";
  if (item.scheduleKind === "weekly") {
    const days = (item.daysOfWeek ?? [])
      .slice()
      .sort((a, b) => a - b)
      .map((d) => `周${WEEKDAY_LABELS[d] ?? d}`)
      .join("、");
    return `每周 ${days || "—"} · ${time}`;
  }
  return `每天 · ${time}`;
}

export function formatNextRunLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function unwrapPayload<T>(raw: unknown): T {
  if (raw && typeof raw === "object" && "success" in raw && (raw as { success: boolean }).success) {
    const envelope = raw as { data?: unknown };
    if (envelope.data !== undefined) {
      return unwrapPayload<T>(envelope.data);
    }
  }
  if (raw && typeof raw === "object" && "data" in raw) {
    return unwrapPayload<T>((raw as { data: unknown }).data);
  }
  return raw as T;
}

export function mapScheduledPlaybook(raw: Record<string, unknown>): ScheduledPlaybookViewModel {
  return {
    id: String(raw.id ?? ""),
    companyId: String(raw.companyId ?? raw.company_id ?? ""),
    name: String(raw.name ?? ""),
    description: (raw.description ?? null) as string | null,
    enabled: Boolean(raw.enabled ?? true),
    scheduleKind: (raw.scheduleKind ?? raw.schedule_kind ?? "daily") as ScheduleKind,
    timeOfDay: (raw.timeOfDay ?? raw.time_of_day ?? null) as string | null,
    daysOfWeek: (raw.daysOfWeek ?? raw.days_of_week ?? null) as number[] | null,
    cronExpression: (raw.cronExpression ?? raw.cron_expression ?? null) as string | null,
    timezone: String(raw.timezone ?? "Asia/Shanghai"),
    assigneeAgentId: String(raw.assigneeAgentId ?? raw.assignee_agent_id ?? ""),
    assigneeAgentName: (raw.assigneeAgentName ?? raw.assignee_agent_name ?? null) as string | null,
    skillName: String(raw.skillName ?? raw.skill_name ?? "ops-playbook"),
    playbookArgs: (raw.playbookArgs ?? raw.playbook_args ?? {}) as Record<string, unknown>,
    deliveryChannel: (raw.deliveryChannel ?? raw.delivery_channel ?? "none") as DeliveryChannel,
    requiresHumanApproval: Boolean(raw.requiresHumanApproval ?? raw.requires_human_approval ?? false),
    nextRunAt: String(raw.nextRunAt ?? raw.next_run_at ?? ""),
    lastRunAt: (raw.lastRunAt ?? raw.last_run_at ?? null) as string | null,
    lastTaskId: (raw.lastTaskId ?? raw.last_task_id ?? null) as string | null,
    lastRunStatus: (raw.lastRunStatus ?? raw.last_run_status ?? null) as LastRunStatus | null,
    createdByUserId: (raw.createdByUserId ?? raw.created_by_user_id ?? null) as string | null,
    metadata: (raw.metadata ?? {}) as Record<string, unknown>,
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? ""),
  };
}

export { unwrapPayload };
