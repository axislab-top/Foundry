import type { CollaborationProgramPhase, CollaborationProgramRecord } from '@contracts/types';

/** @stub Local type for deleted work-intent.types module. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WorkCommand = any;

export type WorkCommandProgramSyncPlan = {
  toPhase?: CollaborationProgramPhase;
  timelineKind: 'work_command' | 'paused' | 'failed';
  summary: string;
  metadata?: Record<string, unknown>;
};

/** Work Intent Compiler 产出 → Program phase / timeline 映射（纯函数，可单测）。 */
export function planProgramSyncForWorkCommand(params: {
  command: WorkCommand;
  program: CollaborationProgramRecord | null;
  traceId?: string;
}): WorkCommandProgramSyncPlan | null {
  const { command } = params;
  switch (command.kind) {
    case 'dispatch_plan': {
      const goal = String(command.goalSummary ?? '').trim();
      return {
        toPhase: resolvePlanningPhase(params.program?.phase ?? null),
        timelineKind: 'work_command',
        summary: goal
          ? `已授权生成执行计划：${goal.slice(0, 120)}`
          : '已授权生成执行计划，正在编排部门分工。',
        metadata: {
          commandKind: command.kind,
          autoFlush: command.autoFlush,
          needsUserConfirm: command.needsUserConfirm,
          traceId: params.traceId ?? null,
        },
      };
    }
    case 'flush_pending':
      return {
        toPhase: resolveDispatchingPhase(params.program?.phase ?? null),
        timelineKind: 'work_command',
        summary: '已确认下发，正在向各部门主管派活。',
        metadata: { commandKind: command.kind, traceId: params.traceId ?? null },
      };
    case 'pause_orchestration':
      return {
        toPhase: 'cancelled',
        timelineKind: 'paused',
        summary: command.revoke ? '老板已撤回/暂停当前编排。' : '老板已暂停当前编排。',
        metadata: { commandKind: command.kind, revoke: command.revoke },
      };
    case 'aligning':
      return {
        toPhase: params.program ? undefined : 'aligning',
        timelineKind: 'work_command',
        summary: command.clarifyHint?.trim()
          ? `需要对齐：${command.clarifyHint.slice(0, 120)}`
          : '继续对齐任务目标与交付参数。',
        metadata: { commandKind: command.kind },
      };
    default:
      return null;
  }
}

function resolvePlanningPhase(from: CollaborationProgramPhase | null): CollaborationProgramPhase {
  if (!from || from === 'idle') return 'ready_to_plan';
  if (from === 'intake' || from === 'aligning') return 'ready_to_plan';
  if (from === 'pending_confirm') return 'planning';
  return 'planning';
}

function resolveDispatchingPhase(from: CollaborationProgramPhase | null): CollaborationProgramPhase {
  if (from === 'pending_confirm' || from === 'planning' || from === 'ready_to_plan') return 'dispatching';
  return 'dispatching';
}

export function planPhaseAfterPlanGenerated(params: {
  programPhase: CollaborationProgramPhase;
  pendingDistributionConfirm: boolean;
}): CollaborationProgramPhase | null {
  if (params.pendingDistributionConfirm) {
    if (params.programPhase === 'pending_confirm') return null;
    return 'pending_confirm';
  }
  if (params.programPhase === 'planning') return null;
  return 'planning';
}

export function planPhaseAfterDispatchFlush(programPhase: CollaborationProgramPhase): CollaborationProgramPhase | null {
  if (programPhase === 'dept_executing') return null;
  return 'dept_executing';
}
