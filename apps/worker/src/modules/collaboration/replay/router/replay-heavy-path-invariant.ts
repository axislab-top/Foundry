import type { CollaborationIntentDecisionV20261 } from '@contracts/types';
import type {
  CollaborationPipelineV2RunInput,
  CollaborationPipelineV2RunResult,
} from '../../pipeline-v2/collaboration-pipeline-v2.types.js';
import type {
  IntentDecision as CollaborationIntentDecision2026,
  RoomContext,
} from '../../contracts/collaboration-2026.contracts.js';
import type { MainRoomReplayRouterDeps } from './main-room-replay-router.types.js';

const MISSING_CEO_SURFACE =
  '主群尚未配置 CEO Agent，无法启动战略编排与执行栈。请联系管理员为主协作群绑定 CEO Agent 后重试。';

export function isMissingCeoAgentForHeavyPath(ceoAgentId?: string | null): boolean {
  return !String(ceoAgentId ?? '').trim();
}

export async function failFastMissingCeoAgentHeavyPath(params: {
  deps: MainRoomReplayRouterDeps;
  input: CollaborationPipelineV2RunInput;
  roomContext: RoomContext;
  intentDecision2026: CollaborationIntentDecision2026;
  intentDecision2026_1: CollaborationIntentDecisionV20261;
  traceId: string;
  authorizedHeavyExecution: boolean;
}): Promise<CollaborationPipelineV2RunResult> {
  return params.deps.handlers.executeReplayUserFacingCopy({
    input: params.input,
    roomContext: params.roomContext,
    intentDecision2026: params.intentDecision2026,
    intentDecision2026_1: params.intentDecision2026_1,
    traceId: params.traceId,
    authorizedHeavyExecution: params.authorizedHeavyExecution,
    finalText: MISSING_CEO_SURFACE,
    fastReplySource: 'main_room_replay_missing_ceo_agent',
  });
}
