export type PipelinePhaseStatus = "pending" | "running" | "done" | "failed" | "skipped";

export type PipelinePhaseSnapshot = {
  id: string;
  label: string;
  status: PipelinePhaseStatus;
};

export type SubGoalDispatchStats = {
  total: number;
  done: number;
  inProgress: number;
  blocked: number;
};

export function parsePhases(metadata: Record<string, unknown> | null | undefined): PipelinePhaseSnapshot[] {
  const raw = metadata?.phases;
  if (!Array.isArray(raw)) return [];
  const out: PipelinePhaseSnapshot[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const id = String(rec.id ?? "").trim();
    const label = String(rec.label ?? "").trim();
    const status = String(rec.status ?? "pending").trim() as PipelinePhaseStatus;
    if (!id || !label) continue;
    if (!["pending", "running", "done", "failed", "skipped"].includes(status)) continue;
    out.push({ id, label, status });
  }
  return out;
}

export function computeSubGoalDispatchStats(
  tasks: Array<{ status: string; children?: Array<{ status: string }> }>,
): SubGoalDispatchStats {
  const stats: SubGoalDispatchStats = { total: 0, done: 0, inProgress: 0, blocked: 0 };
  for (const root of tasks) {
    const children = root.children ?? [];
    for (const child of children) {
      stats.total += 1;
      const s = String(child.status ?? "").trim();
      if (s === "done") stats.done += 1;
      else if (s === "blocked") stats.blocked += 1;
      else if (s === "in_progress") stats.inProgress += 1;
    }
  }
  return stats;
}

export function hasRunningOrchestrationPhase(phases: PipelinePhaseSnapshot[]): boolean {
  return phases.some((p) => p.status === "running" || p.status === "pending");
}
