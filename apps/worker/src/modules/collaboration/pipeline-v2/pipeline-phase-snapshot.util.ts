export type PipelinePhaseStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export type PipelinePhaseId =
  | 'intent'
  | 'replay'
  | 'strategy'
  | 'orchestration'
  | 'dispatch'
  | 'dept_exec'
  | 'supervision'
  | 'dept_receive'
  | 'dept_delegate';

export type PipelinePhaseSnapshot = {
  id: PipelinePhaseId;
  label: string;
  status: PipelinePhaseStatus;
};

export type ExecutionStateStage =
  | 'proposed'
  | 'approved'
  | 'in_progress'
  | 'blocked'
  | 'done'
  | 'reviewed';

const MAIN_PHASE_DEFS: Array<{ id: PipelinePhaseId; label: string }> = [
  { id: 'intent', label: '理解需求' },
  { id: 'replay', label: '决策与是否执行' },
  { id: 'strategy', label: '战略目标' },
  { id: 'orchestration', label: '部门分工' },
  { id: 'dispatch', label: '派发部门' },
  { id: 'dept_exec', label: '部门执行' },
  { id: 'supervision', label: '监督收口' },
];

const DEPT_PHASE_DEFS: Array<{ id: PipelinePhaseId; label: string }> = [
  { id: 'dept_receive', label: '主管接单' },
  { id: 'dept_delegate', label: '拆解委派' },
  { id: 'dept_exec', label: '部门执行' },
  { id: 'supervision', label: '完成汇报' },
];

function cloneDefs(defs: Array<{ id: PipelinePhaseId; label: string }>): PipelinePhaseSnapshot[] {
  return defs.map((d) => ({ ...d, status: 'pending' as const }));
}

function markRunning(phases: PipelinePhaseSnapshot[], id: PipelinePhaseId): void {
  for (const p of phases) {
    if (p.id === id) {
      p.status = 'running';
      return;
    }
    if (p.status === 'pending') p.status = 'skipped';
  }
}

function markDoneThrough(phases: PipelinePhaseSnapshot[], throughId: PipelinePhaseId): void {
  let seen = false;
  for (const p of phases) {
    if (p.id === throughId) seen = true;
    if (!seen) {
      if (p.status !== 'failed') p.status = 'done';
    } else if (p.id === throughId) {
      p.status = 'running';
      break;
    }
  }
}

function inferActivePhaseFromStage(stage: string, routePath: string): PipelinePhaseId {
  const s = stage.toLowerCase();
  const r = routePath.toLowerCase();
  if (s.includes('before_runmainroomflow') || s.includes('intent')) return 'intent';
  if (s.includes('replay') || r === 'replay_delegate_error') return 'replay';
  if (s.includes('strategy') || r === 'strategy_goal_draft' || r === 'strategy_contract_failed') return 'strategy';
  if (s.includes('distribution') || s.includes('orchestrat') || r === 'orchestration') return 'orchestration';
  if (s.includes('dispatch') || s.includes('assign') || r === 'org_dispatch' || r === 'broadcast_dispatch')
    return 'dispatch';
  if (s.includes('supervision') || r === 'supervision' || s.includes('temporal')) return 'supervision';
  if (s.includes('direct') || r === 'direct_agent' || r === 'direct_group') return 'dept_exec';
  if (s.includes('director') || s.includes('dept_delegation') || s.includes('dept_delegate')) return 'dept_delegate';
  if (s.includes('dept_receive') || s.includes('department_direct')) return 'dept_receive';
  if (r === 'execution') return 'dispatch';
  return 'orchestration';
}

function applyExecutionStateStages(
  phases: PipelinePhaseSnapshot[],
  stages: ExecutionStateStage[],
): void {
  if (!stages.length) return;
  const last = stages[stages.length - 1]!;
  if (last === 'blocked') {
    const exec = phases.find((p) => p.id === 'dept_exec');
    if (exec) exec.status = 'failed';
    return;
  }
  if (last === 'done' || last === 'reviewed') {
    for (const p of phases) {
      if (p.status !== 'failed') p.status = 'done';
    }
    return;
  }
  if (last === 'in_progress' || last === 'approved') {
    markDoneThrough(phases, 'dept_exec');
  }
}

export function buildMainRoomPipelinePhases(params: {
  orchestrationStatus: string;
  /** 新生命周期 SSOT；优先于 orchestrationStatus 推导 phase */
  lifecycle?: string | null;
  stage?: string | null;
  routePath?: string | null;
  terminalKind?: string | null;
  executionStateStages?: ExecutionStateStage[];
  distributionTaskCount?: number;
  subGoalCount?: number;
  lifecycleStages?: ExecutionStateStage[];
}): PipelinePhaseSnapshot[] {
  const phases = cloneDefs(MAIN_PHASE_DEFS);
  const lifecycle = String(params.lifecycle ?? '').trim().toLowerCase();
  const status = String(params.orchestrationStatus ?? '').trim().toLowerCase();
  const stage = String(params.stage ?? '').trim();
  const routePath = String(params.routePath ?? '').trim();
  const terminalKind = String(params.terminalKind ?? '').trim().toLowerCase();
  const active = inferActivePhaseFromStage(stage, routePath);

  const applyLifecyclePartial = (): boolean => {
    if (!lifecycle) return false;
    if (lifecycle === 'failed') {
      markDoneThrough(phases, active);
      const cur = phases.find((p) => p.id === active);
      if (cur) cur.status = 'failed';
      return true;
    }
    if (lifecycle === 'completed') {
      for (const p of phases) p.status = 'done';
      return true;
    }
    if (lifecycle === 'awaiting_confirm') {
      markDoneThrough(phases, 'replay');
      const replay = phases.find((p) => p.id === 'replay');
      if (replay) replay.status = 'running';
      return true;
    }
    if (lifecycle === 'planning') {
      markDoneThrough(phases, 'orchestration');
      const orch = phases.find((p) => p.id === 'orchestration');
      if (orch && orch.status !== 'done') orch.status = 'running';
      return true;
    }
    if (lifecycle === 'dispatching') {
      markDoneThrough(phases, 'dispatch');
      const dispatch = phases.find((p) => p.id === 'dispatch');
      if (dispatch) dispatch.status = 'running';
      return true;
    }
    if (lifecycle === 'dept_executing') {
      markDoneThrough(phases, 'dispatch');
      const dispatch = phases.find((p) => p.id === 'dispatch');
      if (dispatch) dispatch.status = 'done';
      const deptExec = phases.find((p) => p.id === 'dept_exec');
      if (deptExec) deptExec.status = 'running';
      const supervision = phases.find((p) => p.id === 'supervision');
      if (supervision && supervision.status === 'pending') supervision.status = 'pending';
      return true;
    }
    if (lifecycle === 'supervising') {
      markDoneThrough(phases, 'dept_exec');
      const deptExec = phases.find((p) => p.id === 'dept_exec');
      if (deptExec) deptExec.status = 'done';
      const supervision = phases.find((p) => p.id === 'supervision');
      if (supervision) supervision.status = 'running';
      return true;
    }
    return false;
  };

  if (applyLifecyclePartial()) {
    applyExecutionStateStages(phases, params.executionStateStages ?? []);
    if (params.lifecycleStages?.length) {
      applyExecutionStateStages(phases, params.lifecycleStages);
    }
    return phases;
  }

  if (status === 'failed') {
    markDoneThrough(phases, active);
    const cur = phases.find((p) => p.id === active);
    if (cur) cur.status = 'failed';
    applyExecutionStateStages(phases, params.executionStateStages ?? []);
    return phases;
  }

  // dispatch_plan_flush 等：仅派发完成，部门执行进行中
  if (
    terminalKind === 'dispatch_plan_flush' ||
    routePath === 'dispatch_plan_flush' ||
    lifecycle === 'dept_executing'
  ) {
    markDoneThrough(phases, 'dispatch');
    const dispatch = phases.find((p) => p.id === 'dispatch');
    if (dispatch) dispatch.status = 'done';
    const deptExec = phases.find((p) => p.id === 'dept_exec');
    if (deptExec) deptExec.status = 'running';
    applyExecutionStateStages(phases, params.executionStateStages ?? []);
    return phases;
  }

  if (status === 'succeeded') {
    // replay propose/light：不应全绿
    if (terminalKind === 'replay_propose' || terminalKind === 'replay_light') {
      markDoneThrough(phases, 'replay');
      const replay = phases.find((p) => p.id === 'replay');
      if (replay) replay.status = 'running';
      return phases;
    }
    if (terminalKind === 'replay_authorized' || routePath === 'orchestration') {
      markDoneThrough(phases, 'orchestration');
      const orch = phases.find((p) => p.id === 'orchestration');
      if (orch) orch.status = 'running';
      return phases;
    }
    for (const p of phases) p.status = 'done';
    return phases;
  }

  markDoneThrough(phases, active);
  const cur = phases.find((p) => p.id === active);
  if (cur && cur.status !== 'done') cur.status = 'running';

  const distCount = params.distributionTaskCount ?? 0;
  const subCount = params.subGoalCount ?? 0;
  if (subCount > 0 || distCount > 0) {
    const dispatch = phases.find((p) => p.id === 'dispatch');
    const orch = phases.find((p) => p.id === 'orchestration');
    if (orch && orch.status === 'running') orch.status = 'done';
    if (dispatch && dispatch.status === 'pending') dispatch.status = subCount > 0 ? 'done' : 'running';
  }

  applyExecutionStateStages(phases, params.executionStateStages ?? []);
  if (params.lifecycleStages?.length) {
    applyExecutionStateStages(phases, params.lifecycleStages);
  }
  return phases;
}

export function buildDepartmentPipelinePhases(params: {
  orchestrationStatus: string;
  stage?: string | null;
  delegationsPublished?: number;
  subGoalCount?: number;
}): PipelinePhaseSnapshot[] {
  const phases = cloneDefs(DEPT_PHASE_DEFS);
  const status = String(params.orchestrationStatus ?? '').trim().toLowerCase();
  const stage = String(params.stage ?? '').trim().toLowerCase();
  const delegations = params.delegationsPublished ?? 0;
  const subCount = params.subGoalCount ?? 0;

  if (status === 'failed') {
    if (stage.includes('delegate')) {
      markDoneThrough(phases, 'dept_delegate');
      const d = phases.find((p) => p.id === 'dept_delegate');
      if (d) d.status = 'failed';
    } else {
      const r = phases.find((p) => p.id === 'dept_receive');
      if (r) r.status = 'failed';
    }
    return phases;
  }

  if (status === 'succeeded') {
    for (const p of phases) p.status = 'done';
    return phases;
  }

  markDoneThrough(phases, 'dept_receive');
  const receive = phases.find((p) => p.id === 'dept_receive');
  if (receive) receive.status = 'done';

  if (delegations > 0 || stage.includes('delegat')) {
    markDoneThrough(phases, 'dept_delegate');
    const del = phases.find((p) => p.id === 'dept_delegate');
    if (del) del.status = 'done';
    const exec = phases.find((p) => p.id === 'dept_exec');
    if (exec) exec.status = subCount > 0 ? 'running' : 'running';
  } else if (stage.includes('director') || stage.includes('autonomous')) {
    const del = phases.find((p) => p.id === 'dept_delegate');
    if (del) del.status = 'running';
  } else if (stage.includes('department_director_reply') || stage.includes('employee_direct')) {
    for (const p of phases) p.status = 'done';
  } else {
    const recv = phases.find((p) => p.id === 'dept_receive');
    if (recv) recv.status = 'running';
  }

  if (subCount > 0) {
    const exec = phases.find((p) => p.id === 'dept_exec');
    if (exec && exec.status === 'pending') exec.status = 'running';
  }

  return phases;
}

export function mergeOrchestrationMetadata(
  base: Record<string, unknown> | null | undefined,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return { ...(base ?? {}), ...extra };
}
