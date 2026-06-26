import type { CollaborationProgramPhase } from '@contracts/types';

const PRE_DISPATCH_PHASES: ReadonlySet<CollaborationProgramPhase> = new Set([
  'idle',
  'intake',
  'aligning',
  'ready_to_plan',
  'planning',
  'pending_confirm',
]);

const FORBIDDEN_PRE_DISPATCH =
  /已下发|各部门已开始|任务已创建|已在执行|已经派单|报告已交付|正在各部门执行/u;

/** 在派发前禁止 CEO/Agent 做出无 side effect 的执行承诺。 */
export function applyCommitmentGuard(params: {
  phase: CollaborationProgramPhase;
  proposedText: string;
  briefSummary?: string | null;
}): string {
  const text = String(params.proposedText ?? '').trim();
  if (!text) return text;
  if (!PRE_DISPATCH_PHASES.has(params.phase)) {
    return text;
  }
  if (!FORBIDDEN_PRE_DISPATCH.test(text)) {
    return text;
  }
  const summary = String(params.briefSummary ?? '').trim();
  if (summary) {
    return `目标已对齐：${summary.slice(0, 200)}。参数齐备后系统将自动生成执行计划并派发部门，请稍候。`;
  }
  return '收到。我会在参数对齐完成后自动生成执行计划并派发，请稍候。';
}
