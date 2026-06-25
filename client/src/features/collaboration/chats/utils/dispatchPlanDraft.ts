import type { DispatchPlanDraftCardModel, DispatchPlanAssignmentRow } from "../components/DispatchPlanDraftCard";

const DISPATCH_PLAN_ROUTE_KINDS = new Set([
  "dispatch_plan",
  "dispatch_plan_flush",
]);

export function normalizeDispatchPlanAssignment(
  a: Record<string, unknown> | {
    departmentSlug?: string;
    title?: string;
    objective?: string;
    acceptanceCriteria?: unknown;
    dependsOnSlugs?: unknown;
  },
): DispatchPlanAssignmentRow | null {
  const departmentSlug = String(a.departmentSlug ?? "").trim();
  const title = String(a.title ?? "").trim();
  const objective = String(a.objective ?? "").trim();
  if (!departmentSlug || !title) return null;
  const acceptanceCriteria = Array.isArray(a.acceptanceCriteria)
    ? (a.acceptanceCriteria as unknown[]).map((x) => String(x ?? "").trim()).filter(Boolean)
    : undefined;
  const dependsOnSlugs = Array.isArray(a.dependsOnSlugs)
    ? (a.dependsOnSlugs as unknown[]).map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 8)
    : undefined;
  return {
    departmentSlug,
    title,
    objective,
    acceptanceCriteria: acceptanceCriteria?.length ? acceptanceCriteria : undefined,
    dependsOnSlugs: dependsOnSlugs?.length ? dependsOnSlugs : undefined,
  };
}

function parseAssignmentsFromMarkdown(content: string): DispatchPlanAssignmentRow[] {
  const lines = String(content ?? "").split(/\r?\n/);
  const rows: DispatchPlanAssignmentRow[] = [];
  let current: DispatchPlanAssignmentRow | null = null;
  for (const line of lines) {
    const dept = line.match(/^##\s+.+\(([^)]+)\)\s*$/);
    if (dept) {
      if (current) rows.push(current);
      current = { departmentSlug: dept[1].trim(), title: "", objective: "" };
      continue;
    }
    if (!current) continue;
    const task = line.match(/^\*\*任务\*\*[：:]\s*(.+)$/);
    if (task) {
      current.title = task[1].trim();
      continue;
    }
    const obj = line.match(/^\*\*说明\*\*[：:]\s*(.+)$/);
    if (obj) {
      current.objective = obj[1].trim();
      continue;
    }
    const crit = line.match(/^-\s+(.+)$/);
    if (crit && current.title) {
      current.acceptanceCriteria = [...(current.acceptanceCriteria ?? []), crit[1].trim()];
    }
  }
  if (current && current.departmentSlug && current.title) rows.push(current);
  return rows.slice(0, 24);
}

export function extractDispatchPlanDraftFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): DispatchPlanDraftCardModel | null {
  if (!metadata || typeof metadata !== "object") return null;
  const kind = String(metadata.kind ?? metadata.routePath ?? "").trim();
  if (!DISPATCH_PLAN_ROUTE_KINDS.has(kind)) return null;

  const dp = metadata.dispatchPlan;
  if (dp && typeof dp === "object" && !Array.isArray(dp)) {
    const d = dp as Record<string, unknown>;
    const goal = String(d.goal ?? "").trim();
    const assignments = Array.isArray(d.assignments)
      ? (d.assignments as Array<Record<string, unknown>>)
          .map((a) => normalizeDispatchPlanAssignment(a))
          .filter((a): a is DispatchPlanAssignmentRow => a !== null)
      : [];
    if (goal && assignments.length) {
      return {
        goal,
        planId: typeof d.planId === "string" ? d.planId : undefined,
        planRevision: typeof d.planRevision === "number" ? d.planRevision : undefined,
        executionOrder: typeof d.executionOrder === "string" ? d.executionOrder : undefined,
        assignments,
        pendingConfirm: metadata.pendingDistributionConfirm === true,
        dispatched: kind === "dispatch_plan_flush" || metadata.dispatched === true,
      };
    }
  }
  return null;
}

export function parseDispatchPlanDraftFromMessageContent(content: string): DispatchPlanDraftCardModel | null {
  const text = String(content ?? "").trim();
  if (!text) return null;
  const goalMatch = text.match(/#\s*目标\s*\n+([^\n#]+)/);
  const goal = goalMatch ? goalMatch[1].trim() : text.split("\n")[0]?.trim() ?? "";
  const assignments = parseAssignmentsFromMarkdown(text);
  if (!goal || assignments.length === 0) return null;
  return { goal: goal.slice(0, 800), assignments };
}
