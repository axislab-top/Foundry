import type { CollaborationPipelineV2RunResult } from './collaboration-pipeline-v2.types.js';
import {
  buildMainRoomPipelinePhases,
  mergeOrchestrationMetadata,
  type ExecutionStateStage,
} from './pipeline-phase-snapshot.util.js';
import {
  inferOrchestrationTerminalKind,
  lifecycleFromTerminalKind,
  machineStatusFromOrchestration,
  type OrchestrationRunLifecycle,
  type OrchestrationTerminalKind,
} from '@foundry/contracts/types/orchestration-lifecycle';

export type MainRoomOrchestrationTerminalWrite = {
  /** DB status：兼容 running/succeeded/failed/skipped + 新 lifecycle 字符串 */
  status: string;
  stage: string;
  errorCode: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
};

/** 从管道 payload 提取监督/员工产出可观测字段（供 E2E 与排障）。 */
export function extractSupervisionObservabilityFromPayload(
  payload: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!payload) return {};
  const heavy =
    (payload.heavyExecutionOutputLegacy as Record<string, unknown> | undefined) ??
    (payload.heavyExecutionOutput as Record<string, unknown> | undefined) ??
    null;
  const heavyMeta =
    heavy?.metadata && typeof heavy.metadata === 'object' && !Array.isArray(heavy.metadata)
      ? (heavy.metadata as Record<string, unknown>)
      : undefined;
  const out: Record<string, unknown> = {};
  const types = new Set<string>();
  const src =
    heavyMeta?.supervisionResultSource ??
    (payload.supervisionResultSource as string | undefined);
  if (typeof src === 'string' && src.trim()) {
    out.supervisionResultSource = src.trim().slice(0, 64);
  }
  const metaArtifactTypes = heavyMeta?.employeeArtifactTypes;
  if (Array.isArray(metaArtifactTypes) && metaArtifactTypes.length) {
    for (const t of metaArtifactTypes) {
      if (typeof t === 'string' && t.trim()) types.add(t.trim().slice(0, 64));
    }
  }
  const digest = heavyMeta?.employeeExecutionDigest;
  if (Array.isArray(digest)) {
    const skillIds: string[] = [];
    for (const row of digest) {
      if (!row || typeof row !== 'object') continue;
      const rec = row as Record<string, unknown>;
      const at = rec.artifactTypes;
      if (Array.isArray(at)) {
        for (const t of at) {
          if (typeof t === 'string' && t.trim()) types.add(t.trim().slice(0, 64));
        }
      }
      const sid = rec.skillExecutionId;
      if (typeof sid === 'string' && sid.trim()) skillIds.push(sid.trim().slice(0, 64));
    }
    if (skillIds.length) out.sampleSkillExecutionIds = skillIds.slice(0, 8);
  }
  const stats = heavyMeta?.employeeExecutionStats;
  if (stats && typeof stats === 'object' && !Array.isArray(stats)) {
    out.employeeExecutionStats = stats;
  }
  const empResults = payload.employeeResults;
  if (Array.isArray(empResults)) {
    for (const row of empResults) {
      if (!row || typeof row !== 'object') continue;
      const arts = (row as Record<string, unknown>).artifacts;
      if (!Array.isArray(arts)) continue;
      for (const a of arts) {
        if (a && typeof a === 'object' && typeof (a as Record<string, unknown>).type === 'string') {
          const t = String((a as Record<string, unknown>).type).trim();
          if (t) types.add(t.slice(0, 64));
        }
      }
    }
  }
  const finalText = String(heavy?.finalText ?? payload.fastFinalText ?? '');
  if (finalText.includes('employee_v2_placeholder')) {
    out.employeePlaceholderDetected = true;
  }
  if (types.size > 0) {
    out.employeeArtifactTypes = [...types];
  } else if (out.employeePlaceholderDetected) {
    out.employeeArtifactTypes = ['runner_output'];
  }
  return out;
}

function legacyDbStatusFromLifecycle(lifecycle: OrchestrationRunLifecycle): string {
  switch (lifecycle) {
    case 'failed':
      return 'failed';
    case 'skipped':
      return 'skipped';
    case 'paused':
      return 'skipped';
    case 'completed':
      return 'succeeded';
    case 'awaiting_confirm':
      return 'running';
    default:
      return 'running';
  }
}

function withMainRoomPhases(
  lifecycle: OrchestrationRunLifecycle,
  terminalKind: OrchestrationTerminalKind,
  stage: string,
  routePath: string,
  baseMeta: Record<string, unknown>,
  executionStateStages?: ExecutionStateStage[],
): Record<string, unknown> {
  const legacyStatus = legacyDbStatusFromLifecycle(lifecycle);
  const phases = buildMainRoomPipelinePhases({
    orchestrationStatus: legacyStatus,
    lifecycle,
    terminalKind,
    stage,
    routePath,
    executionStateStages,
    distributionTaskCount:
      typeof baseMeta.distributionCount === 'number' ? baseMeta.distributionCount : undefined,
  });
  return mergeOrchestrationMetadata(baseMeta, {
    phases,
    routePath,
    terminalKind,
    lifecycle,
    machineStatus: machineStatusFromOrchestration({ lifecycle, terminalKind }),
    ...(executionStateStages?.length ? { executionStateStages, lifecycleStages: executionStateStages } : {}),
  });
}

function buildTerminalWrite(params: {
  lifecycle: OrchestrationRunLifecycle;
  terminalKind: OrchestrationTerminalKind;
  stage: string;
  routePath: string;
  baseMeta: Record<string, unknown>;
  errorCode?: string | null;
  errorMessage?: string | null;
  executionStateStages?: ExecutionStateStage[];
}): MainRoomOrchestrationTerminalWrite {
  return {
    status: params.lifecycle,
    stage: params.stage,
    errorCode: params.errorCode ?? null,
    errorMessage: params.errorMessage ?? null,
    metadata: withMainRoomPhases(
      params.lifecycle,
      params.terminalKind,
      params.stage,
      params.routePath,
      params.baseMeta,
      params.executionStateStages,
    ),
  };
}

/**
 * 将主群 `runMainRoomFlow` 结果映射为 `collaboration_orchestration_runs` 终态语义。
 * status 字段写入 OrchestrationRunLifecycle；metadata.terminalKind 供 UI 展示。
 */
export function mapMainRoomFlowToOrchestrationTerminal(
  out: CollaborationPipelineV2RunResult,
  options?: { executionStateStages?: ExecutionStateStage[] },
): MainRoomOrchestrationTerminalWrite {
  const routePath = String(out.routePath ?? '').trim() || 'unknown';
  const payload =
    out.output?.payload && typeof out.output.payload === 'object'
      ? (out.output.payload as Record<string, unknown>)
      : null;

  const baseMeta: Record<string, unknown> = {
    routePath,
    intentContract: out.intentContract,
    pipelineOutputStatus: out.output?.status ?? null,
    ...(payload?.supervisionMode === 'async' ? { executionMode: 'async' as const } : {}),
    ...(payload?.supervisionDeferred === true ? { supervisionDeferred: true } : {}),
  };

  const terminalKind = inferOrchestrationTerminalKind({ routePath, payload });

  if (routePath === 'strategy_contract_failed') {
    const failure = payload?.planningContractFailure as Record<string, unknown> | undefined;
    const codeRaw = failure && typeof failure.code === 'string' ? failure.code.trim() : '';
    const code = codeRaw ? codeRaw.slice(0, 64) : 'STRATEGY_CONTRACT_UNKNOWN';
    const fast =
      typeof payload?.fastFinalText === 'string' && payload.fastFinalText.trim()
        ? String(payload.fastFinalText).trim()
        : typeof out.output?.message === 'string'
          ? out.output.message.trim()
          : 'Strategy planning contract could not be satisfied.';
    return buildTerminalWrite({
      lifecycle: 'failed',
      terminalKind: 'strategy_contract_failed',
      stage: routePath,
      routePath,
      baseMeta: {
        ...baseMeta,
        planningContractFailure: failure
          ? {
              code: failure.code,
              reason: failure.reason,
              detail: failure.detail,
              retryable: failure.retryable,
              repairRounds: failure.repairRounds,
            }
          : null,
      },
      errorCode: code,
      errorMessage: fast.slice(0, 8000),
      executionStateStages: options?.executionStateStages,
    });
  }

  if (routePath === 'orchestration_distribute_failed') {
    const failure = payload?.orchestrationDistributeFailure as Record<string, unknown> | undefined;
    const codeRaw = failure && typeof failure.code === 'string' ? failure.code.trim() : '';
    const code = codeRaw ? codeRaw.slice(0, 64) : 'ORCHESTRATION_DISTRIBUTE_UNKNOWN';
    const fast =
      typeof payload?.fastFinalText === 'string' && payload.fastFinalText.trim()
        ? String(payload.fastFinalText).trim()
        : typeof out.output?.message === 'string'
          ? out.output.message.trim()
          : 'Orchestration distribute could not be satisfied.';
    return buildTerminalWrite({
      lifecycle: 'failed',
      terminalKind: 'orchestration_distribute_failed',
      stage: routePath,
      routePath,
      baseMeta: {
        ...baseMeta,
        orchestrationDistributeFailure: failure
          ? { code: failure.code, message: failure.message, detail: failure.detail }
          : null,
      },
      errorCode: code,
      errorMessage: fast.slice(0, 8000),
      executionStateStages: options?.executionStateStages,
    });
  }

  if (routePath === 'replay_delegate_error') {
    const codeRaw =
      typeof payload?.replayDelegateErrorCode === 'string'
        ? String(payload.replayDelegateErrorCode).trim()
        : '';
    const upstreamRaw =
      typeof payload?.replayDelegateUpstreamMessage === 'string'
        ? String(payload.replayDelegateUpstreamMessage).trim()
        : '';
    const fast =
      typeof payload?.fastFinalText === 'string' && payload.fastFinalText.trim()
        ? String(payload.fastFinalText).trim()
        : typeof out.output?.message === 'string'
          ? out.output.message.trim()
          : 'Replay delegate contract or parse failed.';
    return buildTerminalWrite({
      lifecycle: 'failed',
      terminalKind: 'replay_delegate_error',
      stage: routePath,
      routePath,
      baseMeta: {
        ...baseMeta,
        ...(codeRaw ? { replayDelegateErrorCode: codeRaw } : {}),
        ...(upstreamRaw ? { replayDelegateUpstreamMessage: upstreamRaw.slice(0, 2000) } : {}),
      },
      errorCode: codeRaw ? codeRaw.slice(0, 64) : 'replay_delegate_error',
      errorMessage: fast.slice(0, 8000),
      executionStateStages: options?.executionStateStages,
    });
  }

  const lifecycle = lifecycleFromTerminalKind(terminalKind);

  // 主群即时接话（replay delegate / policy copy）：不应展示「编排规划中」
  if (
    routePath === 'orchestration' &&
    payload?.inlineReplyHandled === true &&
    payload?.deferHeavyPipeline !== true
  ) {
    const src = String(payload.userFacingReplySource ?? payload.fastReplySource ?? '').trim();
    const alignmentPhase = String(
      (payload.ceoAlignment as Record<string, unknown> | undefined)?.phase ??
        (payload.alignmentMeta as Record<string, unknown> | undefined)?.phase ??
        '',
    ).trim();
    const isLightConversation =
      src === 'replay_delegate' ||
      src.startsWith('main_room_replay_delegate') ||
      alignmentPhase === 'replied' ||
      terminalKind === 'replay_light' ||
      terminalKind === 'direct_conversation';
    if (isLightConversation) {
      return buildTerminalWrite({
        lifecycle: 'skipped',
        terminalKind: 'direct_conversation',
        stage: routePath,
        routePath,
        baseMeta: { ...baseMeta, inlineReplyHandled: true, userFacingReplySource: src || null },
        executionStateStages: options?.executionStateStages,
      });
    }
  }

  return buildTerminalWrite({
    lifecycle,
    terminalKind,
    stage: routePath,
    routePath,
    baseMeta: { ...baseMeta, ...extractSupervisionObservabilityFromPayload(payload) },
    executionStateStages: options?.executionStateStages,
  });
}

/** 增量更新 lifecycle（子目标完成 / 波次推进 / 全案结案） */
export function buildOrchestrationLifecyclePatch(params: {
  lifecycle: OrchestrationRunLifecycle;
  terminalKind?: OrchestrationTerminalKind;
  stage?: string;
  metadataPatch?: Record<string, unknown>;
}): { status: string; stage: string; metadata: Record<string, unknown> } {
  const terminalKind = params.terminalKind ?? 'unknown';
  const stage = String(params.stage ?? params.lifecycle).trim();
  const metadata = {
    ...(params.metadataPatch ?? {}),
    lifecycle: params.lifecycle,
    terminalKind,
    machineStatus: machineStatusFromOrchestration({
      lifecycle: params.lifecycle,
      terminalKind,
    }),
  };
  const phases = buildMainRoomPipelinePhases({
    orchestrationStatus: legacyDbStatusFromLifecycle(params.lifecycle),
    lifecycle: params.lifecycle,
    terminalKind,
    stage,
    routePath: stage,
  });
  return {
    status: params.lifecycle,
    stage,
    metadata: { ...metadata, phases },
  };
}
