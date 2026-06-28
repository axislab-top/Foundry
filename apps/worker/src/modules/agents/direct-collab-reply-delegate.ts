import type { CollaborationIntentDecisionV20261, IntentDecision } from '@contracts/types';
import type { CollaborationExecutionContext } from '../collaboration/context/collaboration-execution-context.js';
import type {
  DirectCollabGeneratedReply,
  DirectReplyRoomType,
} from '../collaboration/direct-reply/direct-reply-output.types.js';

/** Nest DI token：由 Collaboration 模块提供具体实现 */
export const DIRECT_COLLAB_REPLY_DELEGATE = Symbol('DIRECT_COLLAB_REPLY_DELEGATE');

export type ExecuteDirectCollabHandoverParams = {
  companyId: string;
  roomId: string;
  messageId: string;
  agentId: string;
  contentText: string;
  intentDecision: IntentDecision;
  threadId?: string | null;
  humanSenderId?: string | null;
  mentionedAgentIds?: string[];
  ceoAgentId?: string | null;
  traceId?: string;
  intentDecision2026_1?: CollaborationIntentDecisionV20261;
  fastSingleAgentHandover?: boolean;
  collaborationExecutionContext?: CollaborationExecutionContext;
  /** 场景化 token / 流式策略 */
  roomType?: DirectReplyRoomType;
};

export interface DirectCollabReplyDelegate {
  executeDirect(params: ExecuteDirectCollabHandoverParams): Promise<DirectCollabGeneratedReply | null>;
}

export type { DirectCollabGeneratedReply, DirectReplyRoomType };
