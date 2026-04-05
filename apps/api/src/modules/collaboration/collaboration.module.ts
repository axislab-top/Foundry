import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '../../common/cache/cache.module.js';
import { AgentsModule } from '../agents/agents.module.js';
import { CompanyMembership } from '../companies/entities/company-membership.entity.js';
import { OrganizationModule } from '../organization/organization.module.js';
import { OrganizationNode } from '../organization/entities/organization-node.entity.js';
import { Agent } from '../agents/entities/agent.entity.js';
import { Task } from '../tasks/entities/task.entity.js';
import { CollaborationRpcController } from './collaboration.rpc.controller.js';
import { ChatMessage } from './entities/chat-message.entity.js';
import { ChatRoom } from './entities/chat-room.entity.js';
import { DiscussionThread } from './entities/discussion-thread.entity.js';
import { RoomMember } from './entities/room-member.entity.js';
import { CompanyCreatedCollaborationListener } from './listeners/company-created-collaboration.listener.js';
import { AgentCreatedCollaborationListener } from './listeners/agent-created-collaboration.listener.js';
import { ChatMessageService } from './services/chat-message.service.js';
import { ChatRoomService } from './services/chat-room.service.js';
import { CollaborationApprovalNotifier } from './services/collaboration-approval-notifier.service.js';
import { CollaborationBootstrapService } from './services/collaboration-bootstrap.service.js';
import { CollaborationDynamicsService } from './services/collaboration-dynamics.service.js';
import { CollaborationRealtimePublisher } from './services/collaboration-realtime-publisher.service.js';
import { CollaborationSummaryService } from './services/collaboration-summary.service.js';
import { RoomMemberService } from './services/room-member.service.js';
import { DiscussionThreadService } from './services/discussion-thread.service.js';
import { MemoryModule } from '../memory/memory.module.js';
import { CollaborationRoomSummaryProcessorListener } from './listeners/collaboration-room-summary.processor.listener.js';
import { AutonomousCeoApprovalListener } from './listeners/autonomous-ceo-approval.listener.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatRoom,
      ChatMessage,
      DiscussionThread,
      RoomMember,
      Agent,
      CompanyMembership,
      OrganizationNode,
      Task,
    ]),
    CacheModule,
    AgentsModule,
    forwardRef(() => OrganizationModule),
    MemoryModule,
  ],
  controllers: [CollaborationRpcController],
  providers: [
    ChatRoomService,
    DiscussionThreadService,
    RoomMemberService,
    ChatMessageService,
    CollaborationBootstrapService,
    CollaborationRealtimePublisher,
    CollaborationDynamicsService,
    CollaborationSummaryService,
    CollaborationApprovalNotifier,
    CompanyCreatedCollaborationListener,
    AgentCreatedCollaborationListener,
    CollaborationRoomSummaryProcessorListener,
    AutonomousCeoApprovalListener,
  ],
  exports: [
    ChatRoomService,
    DiscussionThreadService,
    RoomMemberService,
    ChatMessageService,
    CollaborationBootstrapService,
    CollaborationDynamicsService,
    CollaborationSummaryService,
    CollaborationApprovalNotifier,
    CollaborationRealtimePublisher,
  ],
})
export class CollaborationModule {}
