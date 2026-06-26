import {
  hasHardExecutionConfirmSignal,
  resolvePreDelegateHardAuthorization,
  resolveReplayAuthorization,
} from './main-room-replay-authorization.util.js';

describe('main-room-replay-authorization.util', () => {
  const allowed = new Set(['full', 'dispatch_plan_compile_and_flush'] as const);

  it('hasHardExecutionConfirmSignal detects structured signals only', () => {
    // Structured metadata signal: userConfirmedExecution
    expect(hasHardExecutionConfirmSignal({ userText: '定稿', confirmationIntent: null, userConfirmedExecution: true })).toBe(true);
    // Structured metadata signal: confirmationIntent
    expect(
      hasHardExecutionConfirmSignal({
        userText: '继续聊',
        confirmationIntent: 'confirm_execution',
        userConfirmedExecution: false,
      }),
    ).toBe(true);
    // Structured metadata signal: dispatch flush
    expect(
      hasHardExecutionConfirmSignal({
        userText: '确认下发',
        confirmationIntent: 'dispatch_plan_confirm_flush',
        userConfirmedDispatchFlush: true,
      }),
    ).toBe(true);
    // Plain text without structured signal is NOT a hard confirm (LLM handles intent)
    expect(hasHardExecutionConfirmSignal({ userText: '定稿', confirmationIntent: null, userConfirmedExecution: false })).toBe(false);
  });

  it('authorizes when defaultAuthorizeExecution enabled and goal summary is clear', () => {
    const outcome = resolveReplayAuthorization({
      confirmGateEnabled: true,
      defaultAuthorizeExecution: true,
      programConfirmMode: 'auto',
      userText: '帮我做市场调研',
      collaborationMode: 'execution',
      alignmentSession: null,
      existingDraft: null,

      delegateDecision: {
        invokeExecutionLayers: true,
        userSurfaceText: '收到，开始编排',
        draftGoalSummary: '完成市场调研报告',
        clearDraftSession: false,
        heavyPipelineKind: 'full',
      },
      allowedHeavyKinds: allowed,
      traceId: 'trace-1',
    });
    expect(outcome?.kind).toBe('authorized');
    if (outcome?.kind === 'authorized') {
      expect(outcome.heavyPipelineKind).toBe('full');
      expect(outcome.draftGoalSummary).toContain('市场调研');
    }
  });

  it('proposes when defaultAuthorizeExecution disabled', () => {
    const outcome = resolveReplayAuthorization({
      confirmGateEnabled: true,
      defaultAuthorizeExecution: false,
      programConfirmMode: 'auto',
      userText: '帮我做市场调研',
      collaborationMode: 'execution',
      alignmentSession: null,
      existingDraft: null,

      delegateDecision: {
        invokeExecutionLayers: true,
        userSurfaceText: '收到，开始编排',
        draftGoalSummary: '完成市场调研报告',
        clearDraftSession: false,
        heavyPipelineKind: 'full',
      },
      allowedHeavyKinds: allowed,
      traceId: 'trace-1b',
    });
    expect(outcome?.kind).toBe('propose');
  });

  it('proposes when delegate requires explicit confirm', () => {
    const outcome = resolveReplayAuthorization({
      confirmGateEnabled: true,
      defaultAuthorizeExecution: true,
      programConfirmMode: 'auto',
      userText: '做一个高风险项目',
      collaborationMode: 'execution',
      alignmentSession: null,
      existingDraft: null,

      delegateDecision: {
        invokeExecutionLayers: true,
        userSurfaceText: '需确认',
        draftGoalSummary: '高风险探索',
        clearDraftSession: false,
        heavyPipelineKind: 'full',
        requireExecutionConfirm: true,
      },
      allowedHeavyKinds: allowed,
      traceId: 'trace-1c',
    });
    expect(outcome?.kind).toBe('propose');
  });

  it('authorizes dispatch_plan heavy kinds when confirm gate enabled (flush confirm is separate)', () => {
    const dispatchAllowed = new Set([
      'dispatch_plan_compile_and_flush',
      'dispatch_plan_revise',
    ] as const);
    const outcome = resolveReplayAuthorization({
      confirmGateEnabled: true,
      defaultAuthorizeExecution: true,
      programConfirmMode: 'auto',
      userText: '@CEO 请制定执行计划',
      collaborationMode: 'execution',
      alignmentSession: null,
      existingDraft: null,

      delegateDecision: {
        invokeExecutionLayers: true,
        userSurfaceText: '收到，正在生成执行计划',
        draftGoalSummary: 'E2E 全链路探针',
        clearDraftSession: false,
        heavyPipelineKind: 'dispatch_plan_compile_and_flush',
      },
      allowedHeavyKinds: dispatchAllowed,
      traceId: 'trace-dp',
    });
    expect(outcome?.kind).toBe('authorized');
    if (outcome?.kind === 'authorized') {
      expect(outcome.heavyPipelineKind).toBe('dispatch_plan_compile_and_flush');
    }
  });

  it('authorizes on structured confirm signal when alignment session awaiting', () => {
    const outcome = resolvePreDelegateHardAuthorization({
      confirmGateEnabled: true,
      defaultAuthorizeExecution: true,
      programConfirmMode: 'auto',
      userText: '定稿',
      userConfirmedExecution: true,
      alignmentSession: {
        phase: 'awaiting_execution_confirm',
        draftGoalSummary: '目标A',
        proposedHeavyPipelineKind: 'full',
        proposedAt: new Date().toISOString(),
      },
      existingDraft: null,

      allowedHeavyKinds: allowed,
      traceId: 'trace-2',
    });
    expect(outcome?.kind).toBe('authorized');
  });

  it('legacy path: authorize when confirm gate disabled and LLM invoke=true', () => {
    const outcome = resolveReplayAuthorization({
      confirmGateEnabled: false,
      userText: '帮我做',
      collaborationMode: 'execution',
      alignmentSession: null,
      existingDraft: null,

      delegateDecision: {
        invokeExecutionLayers: true,
        userSurfaceText: '好',
        draftGoalSummary: null,
        clearDraftSession: false,
        heavyPipelineKind: 'full',
      },
      allowedHeavyKinds: allowed,
      traceId: 'trace-3',
    });
    expect(outcome?.kind).toBe('authorized');
  });

  it('authorizes delegate invoke=true in discussion mode (LLM SSOT)', () => {
    const dispatchAllowed = new Set(['dispatch_plan_compile_and_flush'] as const);
    const outcome = resolveReplayAuthorization({
      confirmGateEnabled: true,
      defaultAuthorizeExecution: true,
      programConfirmMode: 'auto',
      userText: '帮我做一个计算器微信小程序的开发计划文档',
      collaborationMode: 'discussion',
      alignmentSession: null,
      existingDraft: null,

      delegateDecision: {
        invokeExecutionLayers: true,
        userSurfaceText: '收到',
        draftGoalSummary: '计算器微信小程序开发计划',
        clearDraftSession: false,
        heavyPipelineKind: 'dispatch_plan_compile_and_flush',
      },
      allowedHeavyKinds: dispatchAllowed,
      traceId: 'trace-discussion-invoke',
    });
    expect(outcome?.kind).toBe('authorized');
  });

  it('discussion mode flags execution upgrade when delegate suggests upgrade', () => {
    const outcome = resolveReplayAuthorization({
      confirmGateEnabled: true,
      userText: '请安排各部门开始执行',
      collaborationMode: 'discussion',
      alignmentSession: null,
      existingDraft: null,

      delegateDecision: {
        invokeExecutionLayers: false,
        suggestExecutionUpgrade: true,
        upgradeReason: '目标已清晰，建议进入正式编排',
        userSurfaceText: '我们先对齐一下',
        draftGoalSummary: null,
        clearDraftSession: false,
      },
      allowedHeavyKinds: allowed,
      traceId: 'trace-4',
    });
    expect(outcome?.kind).toBe('light_reply');
    if (outcome?.kind === 'light_reply') {
      expect(outcome.alignmentMeta.executionIntentDetected).toBe(true);
      expect(outcome.alignmentMeta.suggestedCollaborationMode).toBe('execution');
      expect(outcome.alignmentMeta.upgradeReason).toContain('正式编排');
    }
  });
});
