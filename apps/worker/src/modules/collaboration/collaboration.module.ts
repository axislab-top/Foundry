import { Module } from '@nestjs/common';
import { CollaborationDepartmentJoinedListener } from './listeners/collaboration-department-joined.listener.js';
import { CollaborationRoomMemberListener } from './listeners/collaboration-room-member.listener.js';
import { CollaborationCoordinatorListener } from './collaboration-coordinator.listener.js';
import { CeoDecisionService } from './ceo-decision.service.js';
import { CollaborationCeoBreakdownService } from './collaboration-ceo-breakdown.service.js';
import { CollaborationRoomPipelineService } from './collaboration-room-pipeline.service.js';
import { CollaborationLlmBridgeService } from './collaboration-llm-bridge.service.js';
import { DirectCollabReplyService } from './direct-collab-reply.service.js';
import { DiscussionCollabService } from './discussion-collab.service.js';
import { GroupChatContextService } from './group-chat-context.service.js';
import { CollaborationModeProposalService } from './collaboration-mode-proposal.service.js';
import { AutonomousModule } from '../autonomous/autonomous.module.js';

@Module({
  imports: [AutonomousModule],
  providers: [
    CollaborationLlmBridgeService,
    CeoDecisionService,
    CollaborationCeoBreakdownService,
    CollaborationRoomPipelineService,
    GroupChatContextService,
    DirectCollabReplyService,
    DiscussionCollabService,
    CollaborationModeProposalService,
    CollaborationCoordinatorListener,
    CollaborationDepartmentJoinedListener,
    CollaborationRoomMemberListener,
  ],
})
export class CollaborationModule {}
