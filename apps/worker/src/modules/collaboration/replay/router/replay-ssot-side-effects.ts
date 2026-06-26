import type { CollaborationPipelineV2RunInput } from '../../pipeline-v2/collaboration-pipeline-v2.types.js';
import type { RoomContext } from '../../contracts/collaboration-2026.contracts.js';
import type { CeoAlignmentMetadata } from '@foundry/contracts/types/ceo-alignment';
import type {
  MainRoomReplaySsotAuthorizationOutcome,
  MainRoomReplaySsotRouteBypass,
} from '../main-room-replay-ssot-mapper.util.js';
import type { MainRoomReplayRouterDeps } from './main-room-replay-router.types.js';

export async function maybePublishReplaySsot(params: {
  deps: MainRoomReplayRouterDeps;
  input: CollaborationPipelineV2RunInput;
  roomContext: RoomContext;
  traceId: string;
  authorizationOutcome: MainRoomReplaySsotAuthorizationOutcome;
  discussionMode: boolean;
  alignmentMeta?: CeoAlignmentMetadata;
  draftGoalSummary?: string | null;
  routeBypass?: MainRoomReplaySsotRouteBypass;
}): Promise<void> {
  const publisher = params.deps.ssotPublisher;
  if (!publisher?.isEnabled()) return;
  await publisher.publishDelegateCompleted({
    companyId: params.input.companyId,
    roomId: params.input.roomId,
    messageId: params.input.messageId,
    traceId: params.traceId,
    authorizationOutcome: params.authorizationOutcome,
    discussionMode: params.discussionMode,
    messageMetadata: params.input.messageMetadata ?? {},
    draftGoalSummary: params.draftGoalSummary,
    ceoAlignment: params.alignmentMeta,
    routeBypass: params.routeBypass ?? null,
  });
}
