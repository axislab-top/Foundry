import type { CeoAlignmentMetadata } from '@foundry/contracts/types/ceo-alignment';
import type { MainRoomReplayExecutionDelegateDecision } from '../main-room-replay-execution-delegate.service.js';
import type { MainRoomStrategyDraftPayload } from '../main-room-strategy-draft-session.service.js';
import type { MainRoomCeoAlignmentSessionPayload } from '../main-room-ceo-alignment-session.service.js';
import { isConfirmDistributionDispatchMessage } from '../main-room-distribution-dispatch.util.js';
import {
  hasRehydratedAuthorizationContext,
  isUserProceedWithoutMoreQuestions,
  rehydrateAuthorizationDraftFromMetadata,
} from './user-proceed-intent.util.js';
import type { MainRoomHeavyPipelineKind } from '../pipeline-v2/main-room-heavy-pipeline-entry.util.js';
import { ReplayExecutionDelegateError } from '../main-room-replay-delegate-errors.js';
/** @stub Local stub for deleted module – returns false (conservative: never filters out user text). */
function isProceedOnlyUserText(_text: string): boolean {
  return false;
}

export function hasHardExecutionConfirmSignal(params: {
  userText: string;
  confirmationIntent?: string | null;
  userConfirmedExecution?: boolean;
  userConfirmedDispatchFlush?: boolean;
}): boolean {
  if (isUserProceedWithoutMoreQuestions(params)) return true;
  const text = String(params.userText ?? '').trim();
  if (isConfirmDistributionDispatchMessage(text)) return true;
  return false;
}

export type ReplayAuthorizationOutcome =
  | {
      kind: 'authorized';
      heavyPipelineKind: MainRoomHeavyPipelineKind;
      alignmentMeta: CeoAlignmentMetadata;
      draftGoalSummary?: string | null;
    }
  | {
      kind: 'propose';
      heavyPipelineKind: MainRoomHeavyPipelineKind;
      draftGoalSummary: string;
      userSurfaceText: string;
      alignmentMeta: CeoAlignmentMetadata;
    }
  | {
      kind: 'light_reply';
      userSurfaceText: string;
      alignmentMeta: CeoAlignmentMetadata;
      clearSession?: boolean;
    };

function pickHeavyKind(
  preferred: MainRoomHeavyPipelineKind | undefined | null,
  allowed: Set<MainRoomHeavyPipelineKind>,
): MainRoomHeavyPipelineKind {
  const raw = (preferred ?? 'full') as MainRoomHeavyPipelineKind;
  if (allowed.has(raw)) return raw;
  if (
    raw === 'full' &&
    allowed.has('dispatch_plan_compile_and_flush')
  ) {
    return 'dispatch_plan_compile_and_flush';
  }
  if (allowed.has('full')) return 'full';
  const first = [...allowed][0];
  if (!first) {
    throw new ReplayExecutionDelegateError(
      'contract_violation',
      'replay authorization: no allowed heavy pipeline kind',
    );
  }
  return first;
}

function hasAuthorizationContext(params: {
  alignmentSession: MainRoomCeoAlignmentSessionPayload | null;
  existingDraft: MainRoomStrategyDraftPayload | null;
  messageMetadata?: Record<string, unknown> | null;
}): boolean {
  return hasRehydratedAuthorizationContext(params);
}

function buildAlignmentMeta(
  partial: Omit<CeoAlignmentMetadata, 'updatedAt'> & { updatedAt?: string },
): CeoAlignmentMetadata {
  return {
    ...partial,
    updatedAt: partial.updatedAt ?? new Date().toISOString(),
  };
}

const PROPOSE_SURFACE_FALLBACK =
  '目标已对齐。请确认是否启动部门编排（可回复「定稿」或「确认执行」）；如需调整请直接说明。';

function isDispatchPlanHeavyPipelineKind(
  kind: MainRoomHeavyPipelineKind,
): kind is 'dispatch_plan_compile_and_flush' | 'dispatch_plan_revise' {
  return kind === 'dispatch_plan_compile_and_flush' || kind === 'dispatch_plan_revise';
}

/**
 * 解析 Replay 授权结果（服务端 SSOT）。`delegateDecision` 为 null 时表示 delegate 前仅硬确认路径。
 */
export function resolveReplayAuthorization(params: {
  confirmGateEnabled: boolean;
  defaultAuthorizeExecution?: boolean;
  programConfirmMode?: 'auto' | 'always';
  userText: string;
  confirmationIntent?: string | null;
  userConfirmedExecution?: boolean;
  userConfirmedDispatchFlush?: boolean;
  collaborationMode: string | null;
  alignmentSession: MainRoomCeoAlignmentSessionPayload | null;
  existingDraft: MainRoomStrategyDraftPayload | null;
  delegateDecision: MainRoomReplayExecutionDelegateDecision | null;
  allowedHeavyKinds: Set<MainRoomHeavyPipelineKind>;
  traceId: string;
  messageMetadata?: Record<string, unknown> | null;
}): ReplayAuthorizationOutcome | null {
  const hardConfirm = hasHardExecutionConfirmSignal({
    userText: params.userText,
    confirmationIntent: params.confirmationIntent,
    userConfirmedExecution: params.userConfirmedExecution,
    userConfirmedDispatchFlush: params.userConfirmedDispatchFlush,
  });
  const isDiscussion = String(params.collaborationMode ?? '').trim() === 'discussion';
  const rehydratedDraft = rehydrateAuthorizationDraftFromMetadata(params.messageMetadata);
  const draftSummary =
    params.delegateDecision?.draftGoalSummary?.trim() ||
    params.alignmentSession?.draftGoalSummary?.trim() ||
    params.existingDraft?.draftGoalSummary?.trim() ||
    rehydratedDraft ||
    '';

  if (params.delegateDecision?.clearDraftSession === true) {
    const surface = String(params.delegateDecision.userSurfaceText ?? '').trim() || '已清空当前目标对齐草稿。';
    return {
      kind: 'light_reply',
      userSurfaceText: surface.slice(0, 8000),
      alignmentMeta: buildAlignmentMeta({
        phase: 'aligning',
        draftGoalSummary: null,
        correlationId: params.traceId,
      }),
      clearSession: true,
    };
  }

  if (
    hardConfirm &&
    !draftSummary.trim() &&
    !(isDiscussion && params.delegateDecision?.suggestExecutionUpgrade === true)
  ) {
    return {
      kind: 'light_reply',
      userSurfaceText: '请用一句话描述你要达成的目标，我将据此启动部门编排。',
      alignmentMeta: buildAlignmentMeta({
        phase: 'aligning',
        draftGoalSummary: null,
        correlationId: params.traceId,
      }),
    };
  }

  // 结构化确认（卡片 metadata）：有对齐上下文即授权进重栈。
  if (hardConfirm && hasAuthorizationContext(params)) {
    const kind = pickHeavyKind(
      params.alignmentSession?.proposedHeavyPipelineKind ??
        params.delegateDecision?.heavyPipelineKind,
      params.allowedHeavyKinds,
    );
    return {
      kind: 'authorized',
      heavyPipelineKind: kind,
      draftGoalSummary: draftSummary || null,
      alignmentMeta: buildAlignmentMeta({
        phase: 'authorized',
        draftGoalSummary: draftSummary || null,
        proposedHeavyPipelineKind: kind,
        authorizationMessageId: params.traceId,
        authorizedAt: new Date().toISOString(),
        correlationId: params.traceId,
      }),
    };
  }

  if (!params.delegateDecision) {
    return null;
  }

  const d = params.delegateDecision;
  const surface = String(d.userSurfaceText ?? '').trim();

  if (!params.confirmGateEnabled && d.invokeExecutionLayers === true) {
    const kind = pickHeavyKind(d.heavyPipelineKind, params.allowedHeavyKinds);
    return {
      kind: 'authorized',
      heavyPipelineKind: kind,
      draftGoalSummary: draftSummary || d.draftGoalSummary?.trim() || null,
      alignmentMeta: buildAlignmentMeta({
        phase: 'executing',
        draftGoalSummary: draftSummary || d.draftGoalSummary?.trim() || null,
        proposedHeavyPipelineKind: kind,
        correlationId: params.traceId,
      }),
    };
  }

  if (d.invokeExecutionLayers === true) {
    const kind = pickHeavyKind(d.heavyPipelineKind, params.allowedHeavyKinds);
    const summary = (() => {
      const fromContext =
        d.draftGoalSummary?.trim() || draftSummary || rehydratedDraft?.trim() || '';
      if (fromContext) return fromContext.slice(0, 8000);
      const userLine = params.userText.trim();
      if (userLine && !isProceedOnlyUserText(userLine)) return userLine.slice(0, 8000);
      return '';
    })();

    // Dispatch Plan v2：下发确认由 dispatch confirm mode / pendingDistributionConfirm 承担，不经 Replay propose 门控。
    if (params.confirmGateEnabled && isDispatchPlanHeavyPipelineKind(kind)) {
      return {
        kind: 'authorized',
        heavyPipelineKind: kind,
        draftGoalSummary: summary || null,
        alignmentMeta: buildAlignmentMeta({
          phase: 'executing',
          draftGoalSummary: summary || null,
          proposedHeavyPipelineKind: kind,
          correlationId: params.traceId,
        }),
      };
    }

    const defaultAuthorize =
      params.defaultAuthorizeExecution !== false && params.programConfirmMode !== 'always';
    const needsExplicitConfirm =
      !summary.trim() || d.requireExecutionConfirm === true || !defaultAuthorize;

    if (!needsExplicitConfirm) {
      return {
        kind: 'authorized',
        heavyPipelineKind: kind,
        draftGoalSummary: summary || null,
        alignmentMeta: buildAlignmentMeta({
          phase: 'executing',
          draftGoalSummary: summary || null,
          proposedHeavyPipelineKind: kind,
          correlationId: params.traceId,
        }),
      };
    }

    const proposeText = (surface || PROPOSE_SURFACE_FALLBACK).slice(0, 8000);
    const suppressDuplicateSurface = Boolean(params.messageMetadata?.dispatchPlan || params.messageMetadata?.ceoAlignment);
    return {
      kind: 'propose',
      heavyPipelineKind: kind,
      draftGoalSummary: summary,
      userSurfaceText: suppressDuplicateSurface ? '' : proposeText,
      alignmentMeta: buildAlignmentMeta({
        phase: 'awaiting_execution_confirm',
        draftGoalSummary: summary,
        proposedHeavyPipelineKind: kind,
        correlationId: params.traceId,
      }),
    };
  }

  const suggestUpgrade = isDiscussion && d.suggestExecutionUpgrade === true;
  const upgradeReason = String(d.upgradeReason ?? '').trim().slice(0, 500) || null;
  const lightText = (surface || '收到，我们继续对齐。').slice(0, 8000);
  return {
    kind: 'light_reply',
    userSurfaceText: lightText,
    alignmentMeta: buildAlignmentMeta({
      phase: 'replied',
      draftGoalSummary: d.draftGoalSummary?.trim() || draftSummary || null,
      correlationId: params.traceId,
      ...(suggestUpgrade
        ? {
            executionIntentDetected: true,
            suggestedCollaborationMode: 'execution' as const,
            upgradeReason,
          }
        : {}),
    }),
  };
}

/** Chat-first：授权进重栈的硬信号（不依赖客户端 task_publish Tab）。 */
export function resolveAuthorizedHeavyExecution(input: {
  contentText?: string | null;
  confirmationIntent?: string | null;
  userConfirmedExecution?: boolean;
  userConfirmedDispatchFlush?: boolean;
  messageCategory?: string | null;
}): boolean {
  if (
    hasHardExecutionConfirmSignal({
      userText: String(input.contentText ?? ''),
      confirmationIntent: input.confirmationIntent,
      userConfirmedExecution: input.userConfirmedExecution,
      userConfirmedDispatchFlush: input.userConfirmedDispatchFlush,
    })
  ) {
    return true;
  }
  // 服务端内部标记（非客户端 Chat-first 路径）
  return String(input.messageCategory ?? '').trim() === 'task_publish';
}

/** delegate 前：仅硬确认 + 上下文 → 授权，否则继续走 LLM。 */
export function resolvePreDelegateHardAuthorization(params: {
  confirmGateEnabled: boolean;
  defaultAuthorizeExecution?: boolean;
  programConfirmMode?: 'auto' | 'always';
  userText: string;
  confirmationIntent?: string | null;
  userConfirmedExecution?: boolean;
  userConfirmedDispatchFlush?: boolean;
  alignmentSession: MainRoomCeoAlignmentSessionPayload | null;
  existingDraft: MainRoomStrategyDraftPayload | null;
  allowedHeavyKinds: Set<MainRoomHeavyPipelineKind>;
  traceId: string;
}): ReplayAuthorizationOutcome | null {
  if (!params.confirmGateEnabled) return null;
  return resolveReplayAuthorization({
    ...params,
    collaborationMode: 'execution',
    delegateDecision: null,
  });
}
