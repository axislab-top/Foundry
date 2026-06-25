/**
 * 解析群聊消息中与 CEO v2 公司化执行相关的 metadata（与 Worker `CeoV2ChatMessageMetadata` 对齐）。
 */

export type CeoV2ExecutionRibbonModel = {
  show: boolean;
  executionSemantics?: string;
  semanticsLabel?: string;
  ceoExecutionPlanSummary?: string;
  workflowId?: string;
  traceId?: string;
  planningSummary?: string;
  distributionCount?: number;
  /** stream_chunk 等中间态 */
  provisional?: boolean;
};

export function humanizeExecutionSemantics(raw: string | undefined): string {
  const v = String(raw ?? "").trim();
  if (v === "sequential_waves") return "顺序推进";
  if (v === "parallel_waves") return "并行波次";
  return v || "";
}

export function describeExecutionSemanticsForUser(raw: string | undefined): string {
  const v = String(raw ?? "").trim();
  if (v === "sequential_waves")
    return "主群默认顺序推进：每条部门任务对应战略里的一个阶段，前置阶段闭环后再启动下一阶段。";
  if (v === "parallel_waves") return "无互相依赖的任务可在上限内同批推进。";
  return humanizeExecutionSemantics(raw) || "—";
}

export function parseCeoV2ExecutionRibbon(
  metadata: Record<string, unknown> | null | undefined,
  messageType?: string,
): CeoV2ExecutionRibbonModel {
  if (!metadata || typeof metadata !== "object") return { show: false };
  if (String(metadata.source ?? "") !== "ceo_v2") return { show: false };

  const executionSemantics =
    typeof metadata.executionSemantics === "string" ? metadata.executionSemantics.trim() : undefined;
  const ceoExecutionPlanSummary =
    typeof metadata.ceoExecutionPlanSummary === "string" ? metadata.ceoExecutionPlanSummary.trim() : undefined;
  const workflowId = typeof metadata.workflowId === "string" ? metadata.workflowId.trim() : undefined;
  const traceId = typeof metadata.traceId === "string" ? metadata.traceId.trim() : undefined;
  const planningSummary =
    typeof metadata.planningSummary === "string" ? metadata.planningSummary.trim() : undefined;
  const distributionCount =
    typeof metadata.distributionCount === "number" && Number.isFinite(metadata.distributionCount)
      ? metadata.distributionCount
      : undefined;

  const hasSignal =
    Boolean(executionSemantics) ||
    Boolean(ceoExecutionPlanSummary) ||
    Boolean(workflowId) ||
    typeof distributionCount === "number";

  return {
    show: hasSignal,
    ...(executionSemantics ? { executionSemantics } : {}),
    ...(executionSemantics ? { semanticsLabel: humanizeExecutionSemantics(executionSemantics) } : {}),
    ...(ceoExecutionPlanSummary ? { ceoExecutionPlanSummary } : {}),
    ...(workflowId ? { workflowId } : {}),
    ...(traceId ? { traceId } : {}),
    ...(planningSummary ? { planningSummary } : {}),
    ...(typeof distributionCount === "number" ? { distributionCount } : {}),
    provisional: messageType === "stream_chunk" || Boolean(metadata.provisional),
  };
}

/** 从消息列表找最近一条 CEO v2 执行态消息（用于侧栏 / 顶栏）。 */
export function findLatestCeoV2ExecutionRibbon(
  messages: Array<{ senderType: string; metadata?: Record<string, unknown> | null; messageType?: string }>,
): CeoV2ExecutionRibbonModel {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.senderType !== "agent") continue;
    const ribbon = parseCeoV2ExecutionRibbon(m.metadata ?? null, m.messageType);
    if (ribbon.show) return ribbon;
  }
  return { show: false };
}
