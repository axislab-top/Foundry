/**
 * 主群编排程序生命周期 SSOT — Worker / API / Client 共用。
 * 用户可见文案由此文件的 label 函数统一产出，禁止 UI 直接展示 routePath / stage 原始字符串。
 */

/** 程序级 run 对用户的心智状态（写入 collaboration_orchestration_runs.status） */
export type OrchestrationRunLifecycle =
  | 'awaiting_confirm'
  | 'planning'
  | 'dispatching'
  | 'dept_executing'
  | 'supervising'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'paused';

/** E2E / 告警用的开放-闭合二元态（写入 metadata.machineStatus） */
export type OrchestrationMachineStatus = 'open' | 'closed';

/** 单次 pipeline 终态种类（写入 metadata.terminalKind） */
export type OrchestrationTerminalKind =
  | 'replay_propose'
  | 'replay_light'
  | 'replay_authorized'
  | 'strategy_goal_draft'
  | 'dispatch_plan'
  | 'dispatch_plan_flush'
  | 'orchestration'
  | 'supervision'
  | 'program_complete'
  | 'orchestration_distribute_failed'
  | 'strategy_contract_failed'
  | 'replay_delegate_error'
  | 'direct_conversation'
  | 'orchestration_paused'
  | 'unknown';

/** 部门 L2 子目标执行阶段（metadata.executionProgramStage） */
export type ExecutionProgramStage = 'receive' | 'delegate' | 'execute' | 'review';

export const ORCHESTRATION_RUN_LIFECYCLE_LABELS: Record<OrchestrationRunLifecycle, string> = {
  awaiting_confirm: '等待确认',
  planning: '编排规划中',
  dispatching: '正在派发',
  dept_executing: '部门执行中',
  supervising: '监督收口',
  completed: '已全部完成',
  failed: '失败',
  skipped: '已跳过',
  paused: '已暂停',
};

export const ORCHESTRATION_TERMINAL_KIND_LABELS: Record<OrchestrationTerminalKind, string> = {
  replay_propose: '等待你确认执行',
  replay_light: '已回复',
  replay_authorized: '已授权，编排启动中',
  strategy_goal_draft: '战略目标草稿',
  dispatch_plan: '执行计划已生成，待确认下发',
  dispatch_plan_flush: '计划已下发，部门执行中',
  orchestration: '部门编排',
  supervision: '执行监督',
  program_complete: '全案监督收口',
  orchestration_distribute_failed: '派发失败',
  strategy_contract_failed: '战略契约未满足',
  replay_delegate_error: '决策解析失败',
  direct_conversation: '对话已回复',
  orchestration_paused: '老板已暂停编排',
  unknown: '处理中',
};

export const EXECUTION_PROGRAM_STAGE_LABELS: Record<ExecutionProgramStage, string> = {
  receive: '主管接单',
  delegate: '方案拆解',
  execute: '执行推进',
  review: '复盘验收',
};

/** routePath + payload hints → terminalKind */
export function inferOrchestrationTerminalKind(params: {
  routePath: string;
  payload?: Record<string, unknown> | null;
}): OrchestrationTerminalKind {
  const route = String(params.routePath ?? '').trim().toLowerCase();
  const payload = params.payload ?? {};
  const replayOutcome = String(payload.replayAuthorizationOutcome ?? '').trim().toLowerCase();

  if (replayOutcome === 'propose') return 'replay_propose';
  if (replayOutcome === 'light_reply') return 'replay_light';
  if (replayOutcome === 'authorized') return 'replay_authorized';

  if (route === 'strategy_contract_failed') return 'strategy_contract_failed';
  if (route === 'orchestration_distribute_failed') return 'orchestration_distribute_failed';
  if (route === 'replay_delegate_error') return 'replay_delegate_error';
  if (route === 'direct_agent' || route === 'direct_group') return 'direct_conversation';
  if (route === 'dispatch_plan_flush') return 'dispatch_plan_flush';
  if (route === 'dispatch_plan') return 'dispatch_plan';
  if (route === 'strategy_goal_draft') return 'strategy_goal_draft';
  if (route === 'supervision') return 'supervision';
  if (route.includes('completion') || route === 'program_complete') return 'program_complete';
  if (route === 'orchestration_paused') return 'orchestration_paused';
  if (route === 'orchestration') return 'orchestration';
  return 'unknown';
}

/** terminalKind → orchestration run lifecycle */
export function lifecycleFromTerminalKind(
  terminalKind: OrchestrationTerminalKind,
  legacyStatus?: string,
): OrchestrationRunLifecycle {
  if (legacyStatus === 'failed') return 'failed';
  if (legacyStatus === 'skipped') return 'skipped';

  switch (terminalKind) {
    case 'replay_propose':
    case 'replay_light':
    case 'dispatch_plan':
      return 'awaiting_confirm';
    case 'replay_authorized':
    case 'strategy_goal_draft':
    case 'orchestration':
      return 'planning';
    case 'dispatch_plan_flush':
      return 'dept_executing';
    case 'supervision':
      return 'supervising';
    case 'program_complete':
      return 'completed';
    case 'strategy_contract_failed':
    case 'orchestration_distribute_failed':
    case 'replay_delegate_error':
      return 'failed';
    case 'direct_conversation':
      return 'skipped';
    case 'orchestration_paused':
      return 'paused';
    default:
      return 'planning';
  }
}

/** lifecycle + terminalKind → machineStatus（阶段成功 closure，非 failure） */
export function machineStatusFromOrchestration(params: {
  lifecycle: OrchestrationRunLifecycle;
  terminalKind?: OrchestrationTerminalKind | string | null;
}): OrchestrationMachineStatus {
  const lifecycle = params.lifecycle;
  const tk = String(params.terminalKind ?? '').trim() as OrchestrationTerminalKind;
  if (
    lifecycle === 'failed' ||
    lifecycle === 'skipped' ||
    lifecycle === 'completed' ||
    lifecycle === 'paused'
  ) {
    return 'closed';
  }
  if (lifecycle === 'dept_executing' && tk === 'dispatch_plan_flush') {
    return 'closed';
  }
  if (tk === 'supervision' && lifecycle === 'supervising') {
    return 'closed';
  }
  return 'open';
}

/** 用户可见 chip 主文案 */
export function orchestrationLifecycleLabel(
  lifecycle: OrchestrationRunLifecycle | string | null | undefined,
  terminalKind?: OrchestrationTerminalKind | string | null,
): string {
  const lc = String(lifecycle ?? '').trim() as OrchestrationRunLifecycle;
  if (lc && lc in ORCHESTRATION_RUN_LIFECYCLE_LABELS) {
    const base = ORCHESTRATION_RUN_LIFECYCLE_LABELS[lc];
    if (lc === 'awaiting_confirm' && terminalKind) {
      const tk = String(terminalKind).trim() as OrchestrationTerminalKind;
      if (tk in ORCHESTRATION_TERMINAL_KIND_LABELS) {
        return ORCHESTRATION_TERMINAL_KIND_LABELS[tk];
      }
    }
    return base;
  }
  const tk = String(terminalKind ?? '').trim() as OrchestrationTerminalKind;
  if (tk && tk in ORCHESTRATION_TERMINAL_KIND_LABELS) {
    return ORCHESTRATION_TERMINAL_KIND_LABELS[tk];
  }
  return '处理中';
}

/** legacy succeeded/failed/running → lifecycle（客户端读旧数据兼容） */
export function coerceOrchestrationLifecycle(
  status: string | null | undefined,
  metadata?: Record<string, unknown> | null,
): OrchestrationRunLifecycle {
  const metaLifecycle = String(metadata?.lifecycle ?? '').trim() as OrchestrationRunLifecycle;
  if (metaLifecycle && metaLifecycle in ORCHESTRATION_RUN_LIFECYCLE_LABELS) {
    return metaLifecycle;
  }
  const terminalKind = String(metadata?.terminalKind ?? '').trim() as OrchestrationTerminalKind;
  if (terminalKind && terminalKind in ORCHESTRATION_TERMINAL_KIND_LABELS) {
    return lifecycleFromTerminalKind(terminalKind, status ?? undefined);
  }
  const s = String(status ?? '').trim().toLowerCase();
  if (s === 'failed') return 'failed';
  if (s === 'skipped') return 'skipped';
  if (s === 'succeeded') {
    const stage = String(metadata?.routePath ?? metadata?.stage ?? '').trim().toLowerCase();
    if (stage === 'dispatch_plan_flush') return 'dept_executing';
    return 'completed';
  }
  if (s === 'running' || s === 'pending') return 'planning';
  return 'planning';
}
