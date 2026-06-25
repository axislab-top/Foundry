import type { CollaborationProgramPhase } from "@contracts/types";
import { programPhaseLabel } from "@contracts/types";

export type CollaborationProgramView = {
  id: string;
  phase: CollaborationProgramPhase | string;
  goalUnderstanding?: {
    summary?: string;
    readiness?: 'ready' | 'needs_clarification';
    clarifyQuestion?: string | null;
    aspects?: Record<string, string>;
  } | null;
  brief?: {
    deliverableType?: string;
    title?: string | null;
    audience?: string | null;
    timeframe?: string | null;
    persona?: string | null;
    purpose?: string | null;
    completeness?: number;
    missingFields?: string[];
  };
  lifecycle?: string;
  updatedAt?: string;
};

export function resolveProgramInputHint(program: CollaborationProgramView | null | undefined): string | null {
  if (!program) return null;
  const phase = String(program.phase ?? "").trim() as CollaborationProgramPhase;
  const goalSummary = String(program.goalUnderstanding?.summary ?? "").trim();
  if (program.goalUnderstanding?.readiness === "needs_clarification") {
    const q = String(program.goalUnderstanding.clarifyQuestion ?? "").trim();
    return q || "还需补充任务目标，请说明具体交付诉求";
  }
  const missing = program.brief?.missingFields ?? [];
  if (phase === "dept_executing" || phase === "dispatching") {
    return "部门正在执行，可在右侧 Program 面板查看进展";
  }
  if (phase === "pending_confirm") {
    return goalSummary
      ? "目标已理解，请点「确认执行」或回复「按上述目标直接编排下发」"
      : "请点 Program 面板「确认执行」或回复「确认执行」";
  }
  if (phase === "aligning" || phase === "intake") {
    if (goalSummary) return `当前理解：${goalSummary.slice(0, 120)}`;
    if (missing.length > 0) {
      return `还需补充：${missing.join("、")}`;
    }
    return "说明交付诉求后，CEO 将理解目标并编排下发";
  }
  if (phase === "planning") {
    return "正在生成跨部门执行计划…";
  }
  return null;
}

export function shouldShowExecutionPipelineForProgram(
  program: CollaborationProgramView | null | undefined,
): boolean {
  if (!program) return false;
  const phase = String(program.phase ?? "").trim();
  return ["dispatching", "dept_executing", "supervising", "delivered"].includes(phase);
}

export function programPhaseDisplayLabel(program: CollaborationProgramView | null | undefined): string {
  if (!program) return "对齐中";
  return programPhaseLabel(program.phase as CollaborationProgramPhase);
}

export function goalUnderstandingAspectRows(program: CollaborationProgramView | null | undefined) {
  const aspects = program?.goalUnderstanding?.aspects;
  if (!aspects || typeof aspects !== "object") return [];
  return Object.entries(aspects)
    .map(([key, value]) => ({ key, value: String(value ?? "").trim() }))
    .filter((row) => row.value);
}

export function briefFieldRows(program: CollaborationProgramView | null | undefined) {
  const b = program?.brief;
  if (!b) return [];
  return [
    { key: "受众", value: b.audience },
    { key: "时间范围", value: b.timeframe },
    { key: "用户画像", value: b.persona },
    { key: "核心目的", value: b.purpose },
  ].filter((row) => String(row.value ?? "").trim());
}
