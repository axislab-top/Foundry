import { createHash } from 'node:crypto';
import type {
  CollaborationPipelineV2RunResult,
  MainRoomReplayLlmContextPack,
  RunMainRoomPostIntentRouteParams,
  RunMainRoomPostIntentRouteWithPack,
} from './collaboration-pipeline-v2.types.js';
import type { IntentDecision as CollaborationIntentDecision2026 } from '../contracts/collaboration-2026.contracts.js';
import { resolveMainRoomRoute, type MainRoomRoute } from './resolve-main-room-route.util.js';
import { ensureCollaborationExecutionContext } from './ensure-collaboration-execution-context.util.js';
import { shouldSkipTranscriptSnapshotReuse } from './main-room-transcript-snapshot.util.js';
import type { MainRoomDispatchPlanSessionPayload } from '@contracts/types';

export type MainRoomPostIntentRoutePorts = {
  dispatchPlanV2Enabled: () => boolean;
  getDispatchPlanSession: (params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    messageId?: string | null;
  }) => Promise<MainRoomDispatchPlanSessionPayload | null>;
  getMaxDirectTargets: () => number;
  isCeoReplayCollaborationEffective: () => Promise<boolean>;
  onReplayDisabled: (params: {
    intentDecision2026: CollaborationIntentDecision2026;
  }) => Promise<CollaborationPipelineV2RunResult>;
  assembleReplayLlmContextPack: () => Promise<MainRoomReplayLlmContextPack>;
  routeMainRoomAfterIntent: (
    paramsWithPack: RunMainRoomPostIntentRouteWithPack,
    postIntentRouteStartedAt: number,
    precomputedRoute: MainRoomRoute,
  ) => Promise<CollaborationPipelineV2RunResult | null>;
};

/**
 * 主群 post-intent 导向 SSOT：路由解析 →（按需）context pack → 统一 `routeMainRoomAfterIntent`。
 */
export async function runMainRoomPostIntentRouteCore(
  ports: MainRoomPostIntentRoutePorts,
  params: RunMainRoomPostIntentRouteParams,
): Promise<{
  route: MainRoomRoute;
  assemblePackCalled: boolean;
  routedViaRouter: boolean;
  result: CollaborationPipelineV2RunResult | null;
}> {
  const postIntentRouteStartedAt = Date.now();
  const intentDecision2026 = params.mergedMainRoom.layerDecision;
  const dispatchPlanV2Enabled = ports.dispatchPlanV2Enabled();
  const dispatchPlanSession = dispatchPlanV2Enabled
    ? await ports.getDispatchPlanSession({
        companyId: params.input.companyId,
        roomId: params.input.roomId,
        threadId: params.input.threadId,
        messageId: params.input.messageId,
      })
    : null;

  const route = resolveMainRoomRoute({
    dispatchPlanV2Enabled,
    dispatchPlanSession,
    userText: params.input.contentText,
    layerDecision: intentDecision2026,
    intentDecision2026_1: params.intentDecision2026_1,
    ceoAgentId: params.input.ceoAgentId,
    mentionedAgentIds: params.input.mentionedAgentIds,
    collaborationMode: params.roomContext.collaborationMode ?? null,
    confirmationIntent: params.input.confirmationIntent,
    userConfirmedDispatchFlush: params.input.userConfirmedDispatchFlush,
    maxDirect: ports.getMaxDirectTargets(),
  });

  if (route.kind === 'ceo_replay_delegate') {
    const replayEffective = await ports.isCeoReplayCollaborationEffective();
    if (!replayEffective) {
      return {
        route,
        assemblePackCalled: false,
        routedViaRouter: false,
        result: await ports.onReplayDisabled({ intentDecision2026 }),
      };
    }
  }

  let replayLlmContextPack: MainRoomReplayLlmContextPack = {
    memoryBlock: '',
    transcriptBlock: '',
    factsBlock: '',
  };
  let assemblePackCalled = false;

  if (route.kind === 'ceo_replay_delegate') {
    ensureCollaborationExecutionContext(params.input, params.traceId);
    replayLlmContextPack = await ports.assembleReplayLlmContextPack();
    assemblePackCalled = true;
    const ecx = params.input.collaborationExecutionContext!;
    const tb = replayLlmContextPack.transcriptBlock.trim();
    if (tb && !shouldSkipTranscriptSnapshotReuse(tb)) {
      ecx.transcriptSnapshotForTurn = tb.length > 4500 ? tb.slice(0, 4500) : tb;
    }
    const orgSnap = params.roomContext.orgSnapshot;
    const slugPart = orgSnap.departments
      .map((d) => String(d.slug ?? '').trim())
      .filter(Boolean)
      .sort()
      .join('|');
    const slugFp = slugPart ? createHash('sha256').update(slugPart).digest('hex').slice(0, 16) : 'empty';
    ecx.orgSnapshotRevision = `${orgSnap.updatedAt}:${slugFp}`;
  }

  const paramsWithPack: RunMainRoomPostIntentRouteWithPack = { ...params, replayLlmContextPack };
  const result = await ports.routeMainRoomAfterIntent(paramsWithPack, postIntentRouteStartedAt, route);

  return {
    route,
    assemblePackCalled,
    routedViaRouter: true,
    result,
  };
}
