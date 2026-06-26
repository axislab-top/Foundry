

/**

 * 用户「免追问确认」：仅认结构化信号（卡片 / metadata），不做自然语言关键词匹配。

 * 语义型「你来定 / 要产出」由 replay 委托 LLM 在本拍 invokeExecutionLayers 判定。

 */

export function isUserProceedWithoutMoreQuestions(params: {

  userText: string;

  confirmationIntent?: string | null;

  userConfirmedExecution?: boolean;

  userConfirmedDispatchFlush?: boolean;

}): boolean {

  if (params.userConfirmedExecution === true) return true;

  if (isDispatchPlanConfirmFlushSignal(params)) return true;

  if (String(params.confirmationIntent ?? '').trim() === 'confirm_execution') return true;

  return false;

}



/** Dispatch Plan confirm 模式：结构化 metadata 确认下发（优先于纯文本匹配）。 */

export function isDispatchPlanConfirmFlushSignal(params: {

  confirmationIntent?: string | null;

  userConfirmedDispatchFlush?: boolean;

}): boolean {

  if (params.userConfirmedDispatchFlush === true) return true;

  return String(params.confirmationIntent ?? '').trim() === 'dispatch_plan_confirm_flush';

}



/** Dispatch Plan 修订意图（结构化 metadata）。 */

export function isDispatchPlanReviseSignal(params: {

  confirmationIntent?: string | null;

}): boolean {

  return String(params.confirmationIntent ?? '').trim() === 'dispatch_plan_revise';

}



/** 老板暂停/撤回进行中编排（结构化 metadata 优先）。 */

export function isOrchestrationPauseSignal(params: {

  confirmationIntent?: string | null;

  userText?: string | null;

}): boolean {

  const intent = String(params.confirmationIntent ?? '').trim();

  return intent === 'orchestration_pause' || intent === 'orchestration_revoke';

}



export function isOrchestrationRevokeSignal(params: {

  confirmationIntent?: string | null;

  userText?: string | null;

}): boolean {

  return String(params.confirmationIntent ?? '').trim() === 'orchestration_revoke';

}



/** 从消息 metadata 恢复授权上下文（Redis 缺失时）。 */

export function rehydrateAuthorizationDraftFromMetadata(

  metadata: Record<string, unknown> | null | undefined,

): string | null {

  if (!metadata || typeof metadata !== 'object') return null;

  const alignment = metadata.ceoAlignment;

  if (alignment && typeof alignment === 'object' && !Array.isArray(alignment)) {

    const phase = String((alignment as Record<string, unknown>).phase ?? '').trim();

    const draft = String((alignment as Record<string, unknown>).draftGoalSummary ?? '').trim();

    if (draft && (phase === 'awaiting_execution_confirm' || phase === 'authorized' || phase === 'aligning' || phase === 'executing')) {

      return draft.slice(0, 8000);

    }

  }

  const dispatchPlan = metadata.dispatchPlan;

  if (dispatchPlan && typeof dispatchPlan === 'object' && !Array.isArray(dispatchPlan)) {

    const goal = String((dispatchPlan as Record<string, unknown>).goalSummary ?? '').trim();

    if (goal) return goal.slice(0, 8000);

    const assignments = (dispatchPlan as Record<string, unknown>).assignments;

    if (Array.isArray(assignments) && assignments.length > 0) {

      const titles = assignments

        .slice(0, 8)

        .map((a) => {

          if (!a || typeof a !== 'object') return '';

          return String((a as Record<string, unknown>).title ?? '').trim();

        })

        .filter(Boolean);

      if (titles.length) return titles.join('；').slice(0, 8000);

    }

  }

  return null;

}



export function hasRehydratedAuthorizationContext(params: {

  alignmentSession: { phase?: string; draftGoalSummary?: string | null } | null;

  existingDraft: { draftGoalSummary?: string | null } | null;

  messageMetadata?: Record<string, unknown> | null;

}): boolean {

  if (params.existingDraft?.draftGoalSummary?.trim()) return true;

  if (params.alignmentSession?.phase === 'awaiting_execution_confirm') return true;
  if (params.alignmentSession?.phase === 'authorized') return true;

  if (params.alignmentSession?.draftGoalSummary?.trim()) return true;

  const rehydrated = rehydrateAuthorizationDraftFromMetadata(params.messageMetadata);

  return Boolean(rehydrated?.trim());

}


