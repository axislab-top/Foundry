import type { RunMainRoomPostIntentRouteWithPack } from '../../pipeline-v2/collaboration-pipeline-v2.types.js';
import type { CeoAlignmentMetadata } from '@foundry/contracts/types/ceo-alignment';
import type { MainRoomReplayRouterDeps } from './main-room-replay-router.types.js';
import type { MainRoomReplaySsotAuthorizationOutcome } from '../main-room-replay-ssot-mapper.util.js';
import { maybePublishReplaySsot } from './replay-ssot-side-effects.js';

export async function finalizeReplayUserFacingCopy(params: {
  deps: MainRoomReplayRouterDeps;
  runParams: RunMainRoomPostIntentRouteWithPack;
  traceId: string;
  authorizedHeavyExecution: boolean;
  finalText: string;
  fastReplySource: string;
  alignmentMeta: CeoAlignmentMetadata;
  draftGoalSummary?: string | null;
  ssotAuthorizationOutcome?: MainRoomReplaySsotAuthorizationOutcome;
}): Promise<import('../../pipeline-v2/collaboration-pipeline-v2.types.js').CollaborationPipelineV2RunResult> {
  const { deps, runParams, traceId, authorizedHeavyExecution } = params;
  const { input, roomContext, mergedMainRoom, intentDecision2026_1 } = runParams;
  const intentDecision2026 = mergedMainRoom.layerDecision;

  await deps.alignment.patchAlignment({
    companyId: input.companyId,
    messageId: input.messageId,
    alignment: params.alignmentMeta,
  });

  const savedSummary = params.draftGoalSummary?.trim();
  if (savedSummary) {
    await deps.replayExecution.setDraft({
      companyId: input.companyId,
      roomId: input.roomId,
      threadId: input.threadId,
      draftGoalSummary: savedSummary,
      sourceMessageId: input.messageId,
    });
    const uid = String(input.humanSenderId ?? '').trim();
    if (uid && deps.replayStrategyDraftPatchFromSummary) {
      try {
        await deps.replayStrategyDraftPatchFromSummary({
          companyId: input.companyId,
          roomId: input.roomId,
          threadId: input.threadId,
          humanUserId: uid,
          draftGoalSummary: savedSummary,
        });
      } catch {
        // best-effort
      }
    }
  }

  if (params.ssotAuthorizationOutcome) {
    const discussionMode = String(roomContext.collaborationMode ?? '').trim() === 'discussion';
    await maybePublishReplaySsot({
      deps,
      input,
      roomContext,
      traceId,
      authorizationOutcome: params.ssotAuthorizationOutcome,
      discussionMode,
      alignmentMeta: params.alignmentMeta,
      draftGoalSummary: params.draftGoalSummary,
    });
  }

  return deps.handlers.executeReplayUserFacingCopy({
    input,
    roomContext,
    intentDecision2026,
    intentDecision2026_1,
    traceId,
    authorizedHeavyExecution,
    finalText: params.finalText.slice(0, 8000),
    fastReplySource: params.fastReplySource,
    ceoAlignment: params.alignmentMeta,
  });
}
