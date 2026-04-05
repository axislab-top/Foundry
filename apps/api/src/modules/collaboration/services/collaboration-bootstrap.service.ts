import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Agent } from '../../agents/entities/agent.entity.js';
import { ChatRoomService } from './chat-room.service.js';
import { RoomMemberService } from './room-member.service.js';

/**
 * 主群初始化：公司负责人 + CEO（若已存在）。
 */
@Injectable()
export class CollaborationBootstrapService {
  private readonly logger = new Logger(CollaborationBootstrapService.name);

  constructor(
    private readonly rooms: ChatRoomService,
    private readonly members: RoomMemberService,
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
  ) {}

  async ensureMainRoomForCompany(
    companyId: string,
    ownerUserId: string,
    companyName?: string,
  ): Promise<void> {
    const main = await this.rooms.createMainRoom(
      companyId,
      companyName ? `${companyName} · 主群` : '主群',
      ownerUserId,
    );

    await this.members.addMembers(companyId, main.id, [
      { memberType: 'human', memberId: ownerUserId },
    ]);

    const ceo = await this.agentsRepo.findOne({
      where: { companyId, role: 'ceo', status: 'active' },
    });
    if (ceo) {
      await this.members.addMembers(companyId, main.id, [
        { memberType: 'agent', memberId: ceo.id },
      ]);
    }

    this.logger.log('Main collaboration room ready', {
      companyId,
      roomId: main.id,
      ceoJoined: !!ceo,
    });
  }
}
