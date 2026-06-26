import type {
  CollaborationPipelineV2RunResult,
  RunMainRoomPostIntentRouteWithPack,
} from '../../pipeline-v2/collaboration-pipeline-v2.types.js';
import { computeAllowedHeavyPipelineKinds } from '../../pipeline-v2/main-room-heavy-pipeline-entry.util.js';
import {
  resolvePreDelegateHardAuthorization,
  resolveReplayAuthorization,
  type ReplayAuthorizationOutcome,
} from '../main-room-replay-authorization.util.js';
import type { MainRoomReplayRouterDeps, IntentReplayLogger } from './main-room-replay-router.types.js';
import { maybePublishReplaySsot } from './replay-ssot-side-effects.js';
import { recordReplayDelegatePhaseMs } from '../replay-delegate-telemetry.js';

/* ── Local stubs for deleted modules (temporary) ────────────────────────── */
type WorkCommand = any;
function handleReplayAuthorizationOutcome(_params: any): any {
  return null;
}
function resolveAuthorizedDispatchPlanShortCircuit(_params: any): any {
  return null;
}
function compileWorkIntent(_input: any): WorkCommand {
  return {} as WorkCommand;
}
function extractWorkIntentCompileSignals(_input: any): Record<string, unknown> {
  return {};
}
function workCommandToReplayAuthorizationOutcome(_params: any): ReplayAuthorizationOutcome {
  return {
    kind: 'light_reply',
    userSurfaceText: '',
    alignmentMeta: { phase: 'replied', draftGoalSummary: null, correlationId: '', updatedAt: new Date().toISOString() },
  };
}

/**
 * **CEO 线**：单次 replay 执行委托（不含 Intent 指向主管直连、不含召唤未解析代发文案）。
 */
export async function runMainRoomCeoReplayDelegatePhase(
  deps: MainRoomReplayRouterDeps,
  params: RunMainRoomPostIntentRouteWithPack,
  logger: IntentReplayLogger,
  postIntentRouteStartedAt: number,
): Promise<CollaborationPipelineV2RunResult | null> {
  const {
    input,
    roomContext,
    traceId,
    mergedMainRoom,
    intentDecision2026_1,
    replayLlmContextPack,
  } = params;
  const intentDecision2026 = mergedMainRoom.layerDecision;
  const { authorizedHeavyExecution } = mergedMainRoom;

  logger.log('foundry.collaboration.intent_replay.phase_enter', {
    companyId: input.companyId,
    roomId: input.roomId,
    messageId: input.messageId,
    traceId,
    phase: 'ceo_replay_delegate',
  });

  const existingDraft = await deps.replayExecution.getDraft({
    companyId: input.companyId,
    roomId: input.roomId,
    threadId: input.threadId,
  });
  const alignmentSession = await deps.alignment.getSession({
    companyId: input.companyId,
    roomId: input.roomId,
    threadId: input.threadId,
  });
  const confirmGateEnabled = deps.alignment.confirmGateEnabled();
  const defaultAuthorizeExecution = deps.alignment.defaultAuthorizeExecution();
  const programConfirmMode = deps.alignment.programConfirmMode();
  const discussionMode = String(roomContext.collaborationMode ?? '').trim() === 'discussion';
  const dispatchPlanSession = deps.dispatchPlan
    ? await deps.dispatchPlan.getSession({
        companyId: input.companyId,
        roomId: input.roomId,
        threadId: input.threadId,
      })
    : null;
  const authorizedShortCircuit = resolveAuthorizedDispatchPlanShortCircuit({
    authorizedHeavyExecution,
    dispatchPlanV2Enabled: deps.config.shouldUseCeoDispatchPlanPath?.() ?? false,
    discussionMode,
    dispatchPlanSession,
    traceId,
  });
  if (authorizedShortCircuit?.kind === 'authorized') {
    return handleReplayAuthorizationOutcome({
      deps,
      runParams: params,
      traceId,
      authorizedHeavyExecution,
      outcome: authorizedShortCircuit,
      postIntentRouteStartedAt,
      logger,
      discussionMode,
    });
  }
  const allowedHeavyKinds = computeAllowedHeavyPipelineKinds({
    dispatchPlanV2Enabled: deps.config.shouldUseCeoDispatchPlanPath?.() ?? false,
    dispatchPlanSession,
  });

  const preAuth = resolvePreDelegateHardAuthorization({
    confirmGateEnabled,
    defaultAuthorizeExecution,
    programConfirmMode,
    userText: input.contentText,
    confirmationIntent: input.confirmationIntent,
    userConfirmedExecution: input.userConfirmedExecution,
    userConfirmedDispatchFlush: input.userConfirmedDispatchFlush,
    alignmentSession,
    existingDraft,
    allowedHeavyKinds,
    traceId,
  });
  if (preAuth?.kind === 'authorized') {
    return handleReplayAuthorizationOutcome({
      deps,
      runParams: params,
      traceId,
      authorizedHeavyExecution,
      outcome: preAuth,
      postIntentRouteStartedAt,
      logger,
      discussionMode,
    });
  }

  const factStartedAt = Date.now();
  const { serialized: replayFactLayerSerialized, diagnostics: replayFactLayerDiagnostics } =
    await deps.grounding.buildReplayDelegateFactLayer({
      companyId: input.companyId,
      roomContext,
      ceoAgentId: input.ceoAgentId ?? null,
      userText: input.contentText,
      traceId,
      threadId: input.threadId,
      pack: replayLlmContextPack,
      factLayerMode: replayLlmContextPack.factLayerMode,
    });
  recordReplayDelegatePhaseMs('fact', factStartedAt);

  const layer = intentDecision2026;
  const unified = intentDecision2026_1;
  const routingHints = unified?.routingHints ?? layer?.routingHints;

  const decisionRaw = await deps.replayExecution.evaluateDelegate({
    companyId: input.companyId,
    roomId: input.roomId,
    messageId: input.messageId,
    traceId,
    threadId: input.threadId,
    userText: input.contentText,
    ceoAgentId: input.ceoAgentId,
    humanSenderId: input.humanSenderId ?? null,
    messageCategory: input.messageCategory,
    existingDraft,
    replayFactLayerSerialized,
    replayFactLayerDiagnostics,
    collaborationMode: roomContext.collaborationMode ?? null,
    toolPolicy: input.collaborationExecutionContext?.contextGroundingPlan?.toolPolicy ?? null,
    groundingPlan: input.collaborationExecutionContext?.contextGroundingPlan ?? null,
    intentType: String(unified?.intentType ?? layer?.intentType ?? ''),
    intentShouldExecute: routingHints?.shouldExecute === true,
  });

  const compilerEnabled = deps.config.isCollabWorkIntentCompilerEnabled?.() ?? false;
  let authOutcome: ReplayAuthorizationOutcome;

  if (compilerEnabled) {
    const shouldExecute = routingHints?.shouldExecute === true;
    const suggestedSlugsRaw = routingHints as { suggestedDepartmentSlugs?: string[] } | undefined;
    const suggestedDepartmentSlugs = (suggestedSlugsRaw?.suggestedDepartmentSlugs ?? []).map(String);
    const peerIntroSessionActive = await deps.replayExecution.isPeerIntroSessionActive({
      companyId: input.companyId,
      roomId: input.roomId,
    });
    const program = deps.program
      ? await deps.program.getActive({
          companyId: input.companyId,
          roomId: input.roomId,
          threadId: input.threadId,
        })
      : null;

    const compileInput = {
      traceId,
      userText: input.contentText,
      collaborationMode: roomContext.collaborationMode ?? null,
      intentType: String(unified?.intentType ?? layer?.intentType ?? ''),
      intentConfidence: Number(unified?.confidence ?? layer?.confidence ?? 0),
      shouldExecute,
      suggestedDepartmentSlugs,
      explicitDirectTargets: routingHints?.explicitDirectTargets === true,
      delegate: decisionRaw,
      existingDraftGoalSummary: existingDraft?.draftGoalSummary ?? null,
      alignmentSession,
      dispatchPlanSession,
      program,
      authorizedHeavyExecution,
      confirmationIntent: input.confirmationIntent,
      userConfirmedExecution: input.userConfirmedExecution,
      userConfirmedDispatchFlush: input.userConfirmedDispatchFlush,
      dispatchPlanV2Enabled: deps.config.shouldUseCeoDispatchPlanPath?.() ?? false,
      defaultAuthorizeExecution: defaultAuthorizeExecution,
      programConfirmMode,
      dispatchConfirmMode: deps.config.getCollabDispatchConfirmMode?.() ?? 'auto',
      peerIntroSessionActive,
    };

    const command: WorkCommand = compileWorkIntent(compileInput);
    logger.log('foundry.collaboration.work_intent.compiled', {
      companyId: input.companyId,
      roomId: input.roomId,
      messageId: input.messageId,
      traceId,
      commandKind: command.kind,
      reason: 'reason' in command ? command.reason : null,
      signals: extractWorkIntentCompileSignals(compileInput),
    });

    if (command.kind === 'pause_orchestration' && deps.orchestrationPause?.pauseActiveOrchestration) {
      await deps.orchestrationPause.pauseActiveOrchestration({
        companyId: input.companyId,
        roomId: input.roomId,
        threadId: input.threadId,
        messageId: input.messageId,
        traceId,
        userText: input.contentText,
        confirmationIntent: input.confirmationIntent,
      });
    }

    if (deps.programLifecycle?.isEnabled()) {
      await deps.programLifecycle.syncWorkCommand({
        companyId: input.companyId,
        roomId: input.roomId,
        threadId: input.threadId,
        sourceMessageId: input.messageId,
        traceId,
        command,
        existingProgram: program,
      });
    }

    authOutcome = workCommandToReplayAuthorizationOutcome({
      command,
      traceId,
      delegate: decisionRaw,
      allowedHeavyKinds,
    });
  } else {
    authOutcome = resolveReplayAuthorization({
      confirmGateEnabled,
      defaultAuthorizeExecution,
      programConfirmMode,
      userText: input.contentText,
      confirmationIntent: input.confirmationIntent,
      userConfirmedExecution: input.userConfirmedExecution,
      userConfirmedDispatchFlush: input.userConfirmedDispatchFlush,
      collaborationMode: roomContext.collaborationMode ?? null,
      alignmentSession,
      existingDraft,
      delegateDecision: decisionRaw,
      allowedHeavyKinds,
      traceId,
      messageMetadata:
        input.messageMetadata && typeof input.messageMetadata === 'object'
          ? (input.messageMetadata as Record<string, unknown>)
          : null,
    });
  }

  if (!authOutcome) {
    throw new Error('replay_authorization_unresolved');
  }

  logger.log('foundry.replay.execution_delegate.authorization', {
    companyId: input.companyId,
    roomId: input.roomId,
    messageId: input.messageId,
    traceId,
    replayAuthorizationOutcome: authOutcome.kind,
    confirmGateEnabled,
  });

  if (authOutcome.kind === 'authorized') {
    return handleReplayAuthorizationOutcome({
      deps,
      runParams: params,
      traceId,
      authorizedHeavyExecution,
      outcome: authOutcome,
      postIntentRouteStartedAt,
      logger,
      discussionMode,
      delegateDraftSummary: decisionRaw.draftGoalSummary,
      authorizedAckText: decisionRaw.userSurfaceText.trim() || null,
    });
  }

  return handleReplayAuthorizationOutcome({
    deps,
    runParams: params,
    traceId,
    authorizedHeavyExecution,
    outcome: authOutcome,
    postIntentRouteStartedAt,
    logger,
    discussionMode,
    delegateDraftSummary: decisionRaw.draftGoalSummary,
  });
}
