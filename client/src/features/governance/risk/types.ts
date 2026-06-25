export type AlertSeverity = "low" | "medium" | "high";
export type AlertStatus = "open" | "resolved";

/** UI 展示用状态（open 映射为 pending） */
export type RiskStatus = "pending" | "resolved";

export type RiskLevel = AlertSeverity;

export interface AdminAlertRow {
  id: string;
  companyId: string | null;
  agentId: string | null;
  severity: AlertSeverity;
  type: string;
  message: string;
  metadata: Record<string, unknown> | null;
  status: AlertStatus;
  handledAt: string | null;
  handledBy: string | null;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlertListResponse {
  items: AdminAlertRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface RiskItem {
  id: string;
  level: RiskLevel;
  title: string;
  source: string;
  triggeredAt: string;
  description: string;
  status: RiskStatus;
  alertType: string;
}

export interface RiskTrendPoint {
  date: string;
  high: number;
  medium: number;
}

export interface RiskStats {
  activeCount: number;
  highCount: number;
  resolvedThisWeek: number;
  resolveRate: number;
}

export interface AlertListFilters {
  severity?: AlertSeverity;
  status?: AlertStatus;
  type?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}
