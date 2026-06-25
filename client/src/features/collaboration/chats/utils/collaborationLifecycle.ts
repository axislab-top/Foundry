import type { CeoAlignmentMetadata } from "@contracts/types/ceo-alignment";
import {
  coerceOrchestrationLifecycle,
  orchestrationLifecycleLabel,
  type OrchestrationRunLifecycle,
  type OrchestrationTerminalKind,
} from "@contracts/types/orchestration-lifecycle";
import { parseCeoAlignment } from "./replayMetadata";

export type OrchestrationRunView = {
  status: string;
  stage?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** 从 orchestration run 解析 lifecycle（兼容旧 succeeded/failed） */
export function resolveOrchestrationLifecycle(run: OrchestrationRunView | null | undefined): OrchestrationRunLifecycle {
  if (!run) return "planning";
  return coerceOrchestrationLifecycle(run.status, run.metadata ?? null);
}

export function resolveTerminalKind(run: OrchestrationRunView | null | undefined): OrchestrationTerminalKind | null {
  if (!run?.metadata) return null;
  const tk = String(run.metadata.terminalKind ?? "").trim();
  return tk ? (tk as OrchestrationTerminalKind) : null;
}

/** 消息旁 chip 主文案 */
export function resolveMessageStatusChipLabel(params: {
  run?: OrchestrationRunView | null;
  alignment?: CeoAlignmentMetadata | null;
}): { label: string; tone: "neutral" | "progress" | "success" | "error" | "waiting" } {
  const lifecycle = resolveOrchestrationLifecycle(params.run);
  const terminalKind = resolveTerminalKind(params.run);
  const label = orchestrationLifecycleLabel(lifecycle, terminalKind);

  if (lifecycle === "failed") return { label, tone: "error" };
  if (lifecycle === "completed") return { label, tone: "success" };
  if (lifecycle === "awaiting_confirm") return { label, tone: "waiting" };
  if (lifecycle === "dept_executing" || lifecycle === "planning" || lifecycle === "dispatching" || lifecycle === "supervising") {
    return { label, tone: "progress" };
  }
  return { label, tone: "neutral" };
}

export function isOrchestrationProgramComplete(run: OrchestrationRunView | null | undefined): boolean {
  return resolveOrchestrationLifecycle(run) === "completed";
}

export function isOrchestrationAwaitingConfirm(run: OrchestrationRunView | null | undefined): boolean {
  return resolveOrchestrationLifecycle(run) === "awaiting_confirm";
}

/** 主群输入框 hint */
export function resolveMainRoomInputHint(params: {
  alignment?: CeoAlignmentMetadata | null;
  run?: OrchestrationRunView | null;
}): string | null {
  const alignment = params.alignment ?? null;
  const lifecycle = resolveOrchestrationLifecycle(params.run);

  if (lifecycle === "dept_executing") {
    return "部门正在执行，可直接补充要求或查看右侧流水线进展";
  }
  if (lifecycle === "awaiting_confirm" || alignment?.phase === "awaiting_execution_confirm") {
    return "可点消息下方卡片确认，或回复「确认执行 / 直接开始 / 你来定」";
  }
  if (alignment?.phase === "aligning" && alignment.draftGoalSummary?.trim()) {
    return "确认框架后可回复「直接开始」，或继续补充细节";
  }
  return null;
}

export function parseAlignmentFromMetadata(metadata: Record<string, unknown> | null | undefined): CeoAlignmentMetadata | null {
  return parseCeoAlignment(metadata);
}

export { orchestrationLifecycleLabel, coerceOrchestrationLifecycle };
