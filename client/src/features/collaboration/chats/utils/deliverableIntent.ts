/** 与 Worker `deliverable-brief.extractor.isDeliverableIntentText` 对齐（略放宽编排/下发措辞）。 */
export function isDeliverableIntentText(userText: string): boolean {
  const t = String(userText ?? "").trim();
  if (t.length < 6) return false;
  return (
    /(?:做|写|起草|生成|产出|完成|编排|下发|派给|分配|启动).{0,32}(?:报告|方案|计划|分析|任务|交付)/.test(t) ||
    /(?:请)?完成[「『"].{2,80}(?:报告|方案|计划|分析)[」』"]/.test(t) ||
    /分析报告|调研报告|商业计划|增长方案|营销方案/.test(t)
  );
}

export function isExecutionConfirmText(userText: string): boolean {
  const t = String(userText ?? "").trim().replace(/\s+/g, "");
  if (!t) return false;
  return /^(确认执行|按上述目标直接编排下发)$/.test(t) || /确认下发|确认部门分工/.test(t);
}

export type MainRoomSendMetadataInput = {
  text: string;
  collaborationMode?: string | null;
  programPhase?: string | null;
};

/** 主群发送时附带 Worker 可识别的执行信号。 */
export function buildMainRoomSendMetadata(input: MainRoomSendMetadataInput): Record<string, unknown> | undefined {
  const text = String(input.text ?? "").trim();
  const meta: Record<string, unknown> = {};

  if (isExecutionConfirmText(text)) {
    meta.confirmationIntent = "confirm_execution";
    meta.userConfirmedExecution = true;
  }

  if (isDeliverableIntentText(text) || String(input.collaborationMode ?? "") === "execution") {
    meta.messageCategory = "task_publish";
  }

  if (String(input.programPhase ?? "") === "pending_confirm" && isExecutionConfirmText(text)) {
    meta.confirmationIntent = "confirm_execution";
    meta.userConfirmedExecution = true;
  }

  return Object.keys(meta).length ? meta : undefined;
}
