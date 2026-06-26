import type { CollaborationProgramRecord, ProgramTurnKind } from '@contracts/types';
import { isDeliverableIntentText } from './deliverable-brief.extractor.js';
import { isDispatchPlanConfirmFlushSignal } from '../replay/user-proceed-intent.util.js';
import { isUserProceedWithoutMoreQuestions } from '../replay/user-proceed-intent.util.js';

export function classifyProgramTurn(params: {
  userText: string;
  confirmationIntent?: string | null;
  userConfirmedExecution?: boolean;
  userConfirmedDispatchFlush?: boolean;
  activeProgram: CollaborationProgramRecord | null;
  mentionedAgentIds?: string[];
}): ProgramTurnKind {
  const text = String(params.userText ?? '').trim();
  const program = params.activeProgram;

  if (/^(取消|放弃|不用了|停止)/.test(text)) {
    return 'cancel';
  }

  if (
    isUserProceedWithoutMoreQuestions({
      userText: text,
      confirmationIntent: params.confirmationIntent,
      userConfirmedExecution: params.userConfirmedExecution,
      userConfirmedDispatchFlush: params.userConfirmedDispatchFlush,
    }) ||
    isDispatchPlanConfirmFlushSignal({
      confirmationIntent: params.confirmationIntent,
      userConfirmedDispatchFlush: params.userConfirmedDispatchFlush,
    })
  ) {
    return 'confirm';
  }

  if (
    /为什么没有|怎么还没有|报告呢|结果呢|交付|进度如何|还没给|没给我/.test(text) &&
    program &&
    program.phase !== 'delivered'
  ) {
    return 'complaint_gap';
  }

  if (
    (params.mentionedAgentIds?.length ?? 0) > 0 &&
    !isDeliverableIntentText(text) &&
    program?.phase !== 'dept_executing'
  ) {
    return 'consult_director';
  }

  if (program && ['aligning', 'intake', 'ready_to_plan', 'pending_confirm'].includes(program.phase)) {
    if (/改|调整|修订|换/.test(text) && /范围|受众|目的|画像|目标/.test(text)) {
      return 'revise_scope';
    }
    return 'fill_brief';
  }

  if (!program && isDeliverableIntentText(text)) {
    return 'deliverable_intake';
  }

  if (program && isDeliverableIntentText(text)) {
    return 'fill_brief';
  }

  return 'chat_only';
}

export function shouldBlockExplicitDirectedForProgramTurn(turn: ProgramTurnKind): boolean {
  return turn === 'complaint_gap' || turn === 'fill_brief' || turn === 'deliverable_intake' || turn === 'confirm';
}
