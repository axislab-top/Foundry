import { isDeliverableIntentText } from '../program/deliverable-brief.extractor.js';
import { resolveAuthorizedHeavyExecution } from '../replay/main-room-replay-authorization.util.js';

/** 主群 Turn 之前是否应优先走 Program SSOT（交付 intake / 确认执行 / task_publish）。 */
export function shouldPreferProgramOrchestrationBeforeTurn(params: {
  contentText?: string | null;
  messageCategory?: string | null;
  confirmationIntent?: string | null;
  userConfirmedExecution?: boolean;
  userConfirmedDispatchFlush?: boolean;
  collaborationMode?: string | null;
}): boolean {
  if (
    resolveAuthorizedHeavyExecution({
      contentText: params.contentText,
      messageCategory: params.messageCategory,
      confirmationIntent: params.confirmationIntent,
      userConfirmedExecution: params.userConfirmedExecution,
      userConfirmedDispatchFlush: params.userConfirmedDispatchFlush,
    })
  ) {
    return true;
  }
  const text = String(params.contentText ?? '').trim();
  if (isDeliverableIntentText(text)) return true;
  if (String(params.messageCategory ?? '').trim() === 'task_publish') return true;
  if (String(params.collaborationMode ?? '').trim() === 'execution') {
    return text.length >= 8;
  }
  return false;
}
