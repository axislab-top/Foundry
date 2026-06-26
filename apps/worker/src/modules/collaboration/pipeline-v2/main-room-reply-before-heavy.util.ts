import type { CollaborationIntentDecisionV20261, IntentDecision } from '@contracts/types';
import type { MainRoomHeavyPipelineKind } from './main-room-heavy-pipeline-entry.util.js';
import type { CollaborationPipelineV2RunResult } from './collaboration-pipeline-v2.types.js';

/** 阶段 2.1：即时接话 fastReplySource */
export const MAIN_ROOM_REPLY_BEFORE_HEAVY_FAST_REPLY_SOURCE = 'main_room_reply_before_heavy';

/** 无 LLM 产出时的保底接话（仅表态，不承诺编排细节）。 */
export const DEFAULT_MAIN_ROOM_REPLY_BEFORE_HEAVY_TEXT =
  '收到，我先统筹安排。各部门的具体分工计划稍后发给你，请稍等。';

/** Human 块：约束即时接话仅表态、不展开计划细节（与后续编排解耦）。 */
export const MAIN_ROOM_REPLY_BEFORE_HEAVY_MODE_CONTEXT =
  '【接话约束】这是用户对公司的即时诉求。请用 1–3 句自然中文先接话：表示收到并会安排团队推进。不要展开部门分工、时间表或交付细节（这些由后续编排异步生成）。';

export function buildDeferHeavyPipelineRunResult(params: {
  legacyIntent: IntentDecision;
  intentDecision2026_1: CollaborationIntentDecisionV20261;
  heavyKind: MainRoomHeavyPipelineKind;
  traceId: string;
  ackText?: string | null;
  fastReplySource?: string;
}): CollaborationPipelineV2RunResult {
  return {
    intentContract: 'unified_intent_v2026_1',
    routePath: 'orchestration',
    intentDecision: params.legacyIntent,
    intentDecision2026_1: params.intentDecision2026_1,
    handledByV2: true,
    output: {
      status: 'ok',
      message: 'Main room instant reply sent; heavy pipeline deferred.',
      payload: {
        inlineReplyHandled: true,
        roomWriteHandled: true,
        deferHeavyPipeline: true,
        replayHeavyPipelineKind: params.heavyKind,
        replayHeavyPipelineAckText: params.ackText ?? null,
        fastReplySource: params.fastReplySource ?? MAIN_ROOM_REPLY_BEFORE_HEAVY_FAST_REPLY_SOURCE,
        traceId: params.traceId,
      },
    },
  };
}
