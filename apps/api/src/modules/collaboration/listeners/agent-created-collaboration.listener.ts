import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { AgentCreatedEvent } from '@contracts/events';
import { ChatRoomService } from '../services/chat-room.service.js';
import { RoomMemberService } from '../services/room-member.service.js';

/**
 * Agent 创建后同步主协作群成员：
 * - 当新增 active CEO 时，自动加入主群（幂等）。
 */
@Injectable()
export class AgentCreatedCollaborationListener implements OnModuleInit {
  private readonly logger = new Logger(AgentCreatedCollaborationListener.name);

  constructor(
    private readonly messagingService: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly rooms: ChatRoomService,
    private readonly members: RoomMemberService,
  ) {}

  onModuleInit() {
    this.messagingService.subscribeWithBackoff<AgentCreatedEvent>(
      'agent.created',
      this.handle.bind(this),
      {
        queue: 'collaboration-agent-created-queue',
        durable: true,
        prefetchCount: 5,
      },
    );
  }

  private async handle(event: AgentCreatedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.data.companyId;
    if (!companyId) return;
    if (event.data.role !== 'ceo' || event.data.status !== 'active') return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      const mainRoom = await this.rooms.findMainRoom(companyId);
      if (!mainRoom) {
        this.logger.warn('Main room missing, skip CEO auto-join', {
          companyId,
          agentId: event.data.agentId,
          eventId: event.eventId,
        });
        return;
      }

      await this.members.addMembers(companyId, mainRoom.id, [
        { memberType: 'agent', memberId: event.data.agentId },
      ]);
      this.logger.log('CEO auto-joined collaboration main room', {
        companyId,
        roomId: mainRoom.id,
        agentId: event.data.agentId,
        eventId: event.eventId,
      });
    });
  }
}
