import {
  extractSupervisionObservabilityFromPayload,
  mapMainRoomFlowToOrchestrationTerminal,
} from './map-main-room-orchestration-terminal.util.js';
import type { CollaborationPipelineV2RunResult } from './collaboration-pipeline-v2.types.js';

describe('mapMainRoomFlowToOrchestrationTerminal', () => {
  it('maps strategy_contract_failed to failed with PlanningContractFailure.code', () => {
    const out = {
      intentContract: 'unified_intent_v2026_1',
      routePath: 'strategy_contract_failed',
      intentDecision: {} as any,
      intentDecision2026_1: {} as any,
      handledByV2: true,
      output: {
        status: 'ok',
        message: 'Strategy planning contract could not be satisfied.',
        payload: {
          planningContractFailure: {
            code: 'schema_validation_failed',
            reason: 'bad_json',
            detail: 'missing strategicPhases',
          },
          fastFinalText: '请补充可量化指标。',
        },
      },
    } satisfies CollaborationPipelineV2RunResult;

    const t = mapMainRoomFlowToOrchestrationTerminal(out);
    expect(t.status).toBe('failed');
    expect(t.errorCode).toBe('schema_validation_failed');
    expect(t.errorMessage).toContain('请补充');
    expect(t.stage).toBe('strategy_contract_failed');
  });

  it('maps replay_delegate_error to failed with replayDelegateErrorCode and fastFinalText', () => {
    const out = {
      intentContract: 'unified_intent_v2026_1',
      routePath: 'replay_delegate_error',
      intentDecision: {} as any,
      intentDecision2026_1: {} as any,
      handledByV2: true,
      output: {
        status: 'ok',
        message: 'Replay delegate contract or upstream error.',
        payload: {
          fastFinalText: 'Replay 委托返回无法解析，已自动重试仍失败。',
          replayDelegateErrorCode: 'parse_failed',
        },
      },
    } satisfies CollaborationPipelineV2RunResult;

    const t = mapMainRoomFlowToOrchestrationTerminal(out);
    expect(t.status).toBe('failed');
    expect(t.errorCode).toBe('parse_failed');
    expect(t.errorMessage).toBe('Replay 委托返回无法解析，已自动重试仍失败。');
    expect((t.metadata as Record<string, unknown>).replayDelegateErrorCode).toBe('parse_failed');
  });

  it('maps replay_delegate_error upstream detail into orchestration metadata', () => {
    const out = {
      intentContract: 'unified_intent_v2026_1',
      routePath: 'replay_delegate_error',
      intentDecision: {} as any,
      intentDecision2026_1: {} as any,
      handledByV2: true,
      output: {
        status: 'ok',
        message: 'Replay delegate contract or upstream error.',
        payload: {
          fastFinalText: 'Replay 委托上游异常：no_active_llm_key',
          replayDelegateErrorCode: 'upstream',
          replayDelegateUpstreamMessage: 'no_active_llm_key',
        },
      },
    } satisfies CollaborationPipelineV2RunResult;

    const t = mapMainRoomFlowToOrchestrationTerminal(out);
    expect(t.errorCode).toBe('upstream');
    expect((t.metadata as Record<string, unknown>).replayDelegateUpstreamMessage).toBe('no_active_llm_key');
  });

  it('maps orchestration_distribute_failed to failed with failure.code', () => {
    const out = {
      intentContract: 'legacy_intent_v1',
      routePath: 'orchestration_distribute_failed',
      intentDecision: {} as any,
      handledByV2: true,
      output: {
        status: 'ok',
        message: 'Orchestration distribute could not be satisfied.',
        payload: {
          orchestrationDistributeFailure: { code: 'empty_strategic_phases', message: 'empty' },
          fastFinalText: '无阶段',
        },
      },
    } satisfies CollaborationPipelineV2RunResult;

    const t = mapMainRoomFlowToOrchestrationTerminal(out);
    expect(t.status).toBe('failed');
    expect(t.errorCode).toBe('empty_strategic_phases');
    expect(t.errorMessage).toBe('无阶段');
  });

  it('maps orchestration routePath to planning lifecycle', () => {
    const out = {
      intentContract: 'unified_intent_v2026_1',
      routePath: 'orchestration',
      intentDecision: {} as any,
      intentDecision2026_1: {} as any,
      handledByV2: true,
      output: { status: 'ok', message: 'ok', payload: {} },
    } satisfies CollaborationPipelineV2RunResult;

    const t = mapMainRoomFlowToOrchestrationTerminal(out);
    expect(t.status).toBe('planning');
    expect(t.metadata.lifecycle).toBe('planning');
    expect(t.metadata.terminalKind).toBe('orchestration');
    expect(t.errorCode).toBeNull();
  });

  it('maps dispatch_plan_flush to dept_executing lifecycle', () => {
    const out = {
      intentContract: 'legacy_intent_v1',
      routePath: 'dispatch_plan_flush',
      intentDecision: {} as any,
      handledByV2: true,
      output: { status: 'ok', message: 'ok', payload: {} },
    } satisfies CollaborationPipelineV2RunResult;

    const t = mapMainRoomFlowToOrchestrationTerminal(out);
    expect(t.status).toBe('dept_executing');
    expect(t.metadata.terminalKind).toBe('dispatch_plan_flush');
    const phases = t.metadata.phases as Array<{ id: string; status: string }>;
    expect(phases.find((p) => p.id === 'dept_exec')?.status).toBe('running');
  });

  it('merges supervision observability into succeeded metadata', () => {
    const out = {
      intentContract: 'unified_intent_v2026_1',
      routePath: 'orchestration',
      intentDecision: {} as any,
      intentDecision2026_1: {} as any,
      handledByV2: true,
      output: {
        status: 'ok',
        message: 'ok',
        payload: {
          heavyExecutionOutputLegacy: {
            finalText: 'done employee_v2_placeholder',
            metadata: { supervisionResultSource: 'skill_execution' },
          },
          employeeResults: [{ artifacts: [{ type: 'runner_output', content: 'x' }] }],
        },
      },
    } satisfies CollaborationPipelineV2RunResult;

    const t = mapMainRoomFlowToOrchestrationTerminal(out);
    expect(t.metadata.supervisionResultSource).toBe('skill_execution');
    expect(t.metadata.employeeArtifactTypes).toEqual(['runner_output']);
    expect(t.metadata.employeePlaceholderDetected).toBe(true);
  });
});

describe('extractSupervisionObservabilityFromPayload', () => {
  it('returns empty object for null payload', () => {
    expect(extractSupervisionObservabilityFromPayload(null)).toEqual({});
  });

  it('reads employeeExecutionDigest from supervision metadata', () => {
    const obs = extractSupervisionObservabilityFromPayload({
      heavyExecutionOutputLegacy: {
        finalText: 'ok',
        metadata: {
          supervisionResultSource: 'skill_execution',
          employeeExecutionDigest: [
            {
              taskId: 't1',
              status: 'ok',
              skillExecutionId: 'sk-exec-1',
              artifactTypes: ['skill'],
            },
          ],
          employeeExecutionStats: { total: 1, ok: 1, failed: 0, noSkillBound: 0 },
        },
      },
    });
    expect(obs.supervisionResultSource).toBe('skill_execution');
    expect(obs.employeeArtifactTypes).toEqual(['skill']);
    expect(obs.sampleSkillExecutionIds).toEqual(['sk-exec-1']);
    expect(obs.employeeExecutionStats).toEqual({ total: 1, ok: 1, failed: 0, noSkillBound: 0 });
  });

  it('reads temporal_department from payload when async supervision started', () => {
    const obs = extractSupervisionObservabilityFromPayload({
      supervisionResultSource: 'temporal_department',
      supervisionMode: 'async',
    });
    expect(obs.supervisionResultSource).toBe('temporal_department');
  });
});

describe('mapMainRoomFlowToOrchestrationTerminal temporal pending', () => {
  it('includes executionMode async and supervisionResultSource on temporal start payload', () => {
    const out = {
      intentContract: 'legacy_intent_v1',
      routePath: 'supervision',
      intentDecision: {} as any,
      handledByV2: true,
      output: {
        status: 'ok',
        message: 'Supervisor execution started via Temporal.',
        payload: {
          temporal: { workflowId: 'wf-1' },
          supervisionResultSource: 'temporal_department',
          supervisionMode: 'async',
          supervisionDeferred: true,
        },
      },
    } satisfies CollaborationPipelineV2RunResult;

    const t = mapMainRoomFlowToOrchestrationTerminal(out);
    expect(t.status).toBe('supervising');
    expect(t.metadata.supervisionResultSource).toBe('temporal_department');
    expect(t.metadata.executionMode).toBe('async');
    expect(t.metadata.supervisionDeferred).toBe(true);
  });

  it('maps inline replay delegate reply to skipped (no false planning chip)', () => {
    const out = {
      intentContract: 'unified_intent_v2026_1',
      routePath: 'orchestration',
      intentDecision: {} as any,
      intentDecision2026_1: {} as any,
      handledByV2: true,
      output: {
        status: 'ok',
        message: 'CEO posted replay or policy user-facing copy.',
        payload: {
          inlineReplyHandled: true,
          userFacingReplySource: 'replay_delegate',
          fastReplySource: 'main_room_replay_delegate_refine',
          ceoAlignment: { phase: 'replied', draftGoalSummary: null },
        },
      },
    } satisfies CollaborationPipelineV2RunResult;

    const t = mapMainRoomFlowToOrchestrationTerminal(out);
    expect(t.status).toBe('skipped');
    expect(t.metadata.terminalKind).toBe('direct_conversation');
  });
});
