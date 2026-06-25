export {
  BILLING_CREDIT_RATE_HINT,
  CREDITS_PER_RMB,
  creditFromRmb,
  formatCredit,
  formatRmbFromCredit,
  rmbFromCredit,
} from "@contracts/types";

export function parseCredit(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

export function formatTokens(input: number, output: number): string {
  return `${input.toLocaleString()} / ${output.toLocaleString()}`;
}

export function formatUsageDate(dateStr: string): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${y}/${m}/${d}`;
}

export function formatRelativeAggregatedAt(iso: string | null | undefined): string {
  if (!iso) return "暂无聚合记录";
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 60_000) return "刚刚更新";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins} 分钟前更新`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前更新`;
  return `${Math.floor(hours / 24)} 天前更新`;
}

const RECORD_TYPE_LABELS: Record<string, string> = {
  llm: "LLM",
  skill: "Skill",
  embedding: "Embedding",
  summary: "Summary",
  agent_day: "Agent 日",
  other: "其他",
};

export function recordTypeLabel(type: string): string {
  return RECORD_TYPE_LABELS[type] ?? type;
}
