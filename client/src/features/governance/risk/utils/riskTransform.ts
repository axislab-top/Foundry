import type {
  AdminAlertRow,
  AlertSeverity,
  AlertStatus,
  RiskItem,
  RiskStats,
  RiskStatus,
  RiskTrendPoint,
} from "../types";

const ALERT_TYPE_LABELS: Record<string, string> = {
  "budget.exceeded": "预算超支",
  "budget.warning": "预算预警",
  "budget.critical_low": "预算临界",
  "task.blocked": "任务阻塞",
  "task.progress.low": "任务进度停滞",
  "skill.prompt_injection": "提示注入风险",
  "skill.sensitive_risk": "敏感操作风险",
  "phase3.budget_critical.autonomous_active": "高自主 + 低预算",
  "phase3.slo.latency_p95": "P95 延迟超标",
  "phase3.slo.memory_graph_degraded": "Memory Graph 退化",
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatTriggeredAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatAlertTypeLabel(type: string): string {
  if (ALERT_TYPE_LABELS[type]) return ALERT_TYPE_LABELS[type];
  return type.replace(/\./g, " · ");
}

function formatAlertTitle(type: string, message: string): string {
  const label = ALERT_TYPE_LABELS[type];
  if (label) return label;
  const trimmed = message.trim();
  if (trimmed.length <= 64) return trimmed || type;
  return `${trimmed.slice(0, 64)}…`;
}

function mapAlertStatus(status: AlertStatus): RiskStatus {
  return status === "resolved" ? "resolved" : "pending";
}

export function mapUiStatusToApi(status: RiskStatus | ""): AlertStatus | undefined {
  if (!status) return undefined;
  return status === "resolved" ? "resolved" : "open";
}

export function normalizeAdminAlert(raw: Record<string, unknown>): AdminAlertRow {
  return {
    id: String(raw.id ?? ""),
    companyId: (raw.companyId ?? raw.company_id ?? null) as string | null,
    agentId: (raw.agentId ?? raw.agent_id ?? null) as string | null,
    severity: String(raw.severity ?? "low") as AlertSeverity,
    type: String(raw.type ?? "unknown"),
    message: String(raw.message ?? ""),
    metadata: (raw.metadata ?? null) as Record<string, unknown> | null,
    status: String(raw.status ?? "open") as AlertStatus,
    handledAt: (raw.handledAt ?? raw.handled_at ?? null) as string | null,
    handledBy: (raw.handledBy ?? raw.handled_by ?? null) as string | null,
    remark: (raw.remark ?? null) as string | null,
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? ""),
  };
}

export function mapAlertToRiskItem(alert: AdminAlertRow): RiskItem {
  const typeLabel = formatAlertTypeLabel(alert.type);
  const source = alert.agentId ? `${typeLabel} · Agent` : `${typeLabel} · 系统监控`;
  return {
    id: alert.id,
    level: alert.severity,
    title: formatAlertTitle(alert.type, alert.message),
    source,
    triggeredAt: formatTriggeredAt(alert.createdAt),
    description: alert.message,
    status: mapAlertStatus(alert.status),
    alertType: alert.type,
  };
}

export function buildTrendData(alerts: AdminAlertRow[], days = 14): RiskTrendPoint[] {
  const buckets: RiskTrendPoint[] = [];
  const now = new Date();
  const keyToIndex = new Map<string, number>();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    keyToIndex.set(key, buckets.length);
    buckets.push({
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      high: 0,
      medium: 0,
    });
  }

  for (const alert of alerts) {
    const key = alert.createdAt.slice(0, 10);
    const idx = keyToIndex.get(key);
    if (idx == null) continue;
    if (alert.severity === "high") buckets[idx].high += 1;
    else if (alert.severity === "medium") buckets[idx].medium += 1;
  }

  return buckets;
}

export function buildRiskStats(alerts: AdminAlertRow[]): RiskStats {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const activeCount = alerts.filter((a) => a.status !== "resolved").length;
  const highCount = alerts.filter((a) => a.severity === "high" && a.status !== "resolved").length;
  const resolvedThisWeek = alerts.filter((a) => {
    if (a.status !== "resolved") return false;
    const ts = Date.parse(a.handledAt ?? a.updatedAt ?? a.createdAt);
    return Number.isFinite(ts) && ts >= weekAgo;
  }).length;
  const resolvedTotal = alerts.filter((a) => a.status === "resolved").length;
  const resolveRate = alerts.length > 0 ? Math.round((resolvedTotal / alerts.length) * 100) : 0;

  return { activeCount, highCount, resolvedThisWeek, resolveRate };
}
