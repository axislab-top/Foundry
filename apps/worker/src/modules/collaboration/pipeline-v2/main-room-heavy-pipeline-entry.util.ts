import type { MainRoomDispatchPlanSessionPayload } from '@contracts/types';
import { ReplayExecutionDelegateError } from '../main-room-replay-delegate-errors.js';
import { isConfirmDistributionDispatchMessage } from '../main-room-distribution-dispatch.util.js';
import {
  isDispatchPlanConfirmFlushSignal,
  isDispatchPlanReviseSignal,
} from '../replay/user-proceed-intent.util.js';

/** Replay 委托通过后进入主群重链的入口类型。 */
export type MainRoomHeavyPipelineKind =
  | 'full'
  | 'dispatch_plan_compile_and_flush'
  | 'dispatch_plan_revise';

/**
 * Dispatch Plan v2 会话 pending 确认时，「确认下发」类短句应确定性进入 flush 重栈。
 */
export function resolveDispatchPlanDeterministicHeavyPipeline(params: {
  dispatchPlanV2Enabled: boolean;
  session: MainRoomDispatchPlanSessionPayload | null;
  userText: string;
  confirmationIntent?: string | null;
  userConfirmedDispatchFlush?: boolean;
}): 'dispatch_plan_compile_and_flush' | 'dispatch_plan_revise' | null {
  if (!params.dispatchPlanV2Enabled || !params.session) return null;
  const text = String(params.userText ?? '').trim();
  if (!text && !isDispatchPlanConfirmFlushSignal(params)) return null;

  const sess = params.session;
  const dist = sess.pendingDistributionLegacy;
  const hasDist =
    sess.pendingDistributionConfirm === true &&
    dist != null &&
    typeof dist === 'object' &&
    Array.isArray((dist as { tasks?: unknown[] }).tasks) &&
    ((dist as { tasks: unknown[] }).tasks?.length ?? 0) > 0;

  if (isDispatchPlanReviseSignal(params)) {
    return 'dispatch_plan_revise';
  }
  if (hasDist && (isDispatchPlanConfirmFlushSignal(params) || isConfirmDistributionDispatchMessage(text))) {
    return 'dispatch_plan_compile_and_flush';
  }
  return null;
}

export function computeAllowedHeavyPipelineKinds(params: {
  dispatchPlanV2Enabled?: boolean;
  dispatchPlanSession?: MainRoomDispatchPlanSessionPayload | null;
}): Set<MainRoomHeavyPipelineKind> {
  const allowed = new Set<MainRoomHeavyPipelineKind>(['full']);
  if (params.dispatchPlanV2Enabled === true) {
    allowed.add('dispatch_plan_compile_and_flush');
    allowed.add('dispatch_plan_revise');
    const dp = params.dispatchPlanSession;
    const dpDist = dp?.pendingDistributionLegacy;
    const dpHasDist =
      dp?.pendingDistributionConfirm === true &&
      dpDist != null &&
      typeof dpDist === 'object' &&
      Array.isArray((dpDist as { tasks?: unknown[] }).tasks) &&
      ((dpDist as { tasks: unknown[] }).tasks?.length ?? 0) > 0;
    if (dpHasDist) {
      // confirm 模式：仅允许确认 flush 或修订
      allowed.delete('full');
    }
  }
  return allowed;
}

export function resolveHeavyPipelineKindOrThrow(params: {
  invokeExecutionLayers: boolean;
  decisionKind: MainRoomHeavyPipelineKind | undefined | null;
  allowed: Set<MainRoomHeavyPipelineKind>;
}): MainRoomHeavyPipelineKind {
  if (!params.invokeExecutionLayers) {
    return 'full';
  }
  const kind = (params.decisionKind ?? 'full') as MainRoomHeavyPipelineKind;
  if (!params.allowed.has(kind)) {
    throw new ReplayExecutionDelegateError(
      'contract_violation',
      `replay delegate: heavyPipelineKind=${kind} is not allowed (allowed=${[...params.allowed].join(',')})`,
    );
  }
  return kind;
}
