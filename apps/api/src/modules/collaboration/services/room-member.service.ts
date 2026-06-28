import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import type {
  CollaborationRoomMemberJoinedEvent,
  CollaborationRoomMemberLeftEvent,
} from '@contracts/events';
import { RoomMember, type RoomMemberType } from '../entities/room-member.entity.js';

@Injectable()
export class RoomMemberService {
  private readonly logger = new Logger(RoomMemberService.name);

  constructor(
    @InjectRepository(RoomMember)
    private readonly membersRepo: Repository<RoomMember>,
    private readonly messaging: MessagingService,
  ) {}

  async listActiveMembers(
    companyId: string,
    roomId: string,
  ): Promise<RoomMember[]> {
    return this.membersRepo.find({
      where: { companyId, roomId, leftAt: IsNull() },
      order: { joinedAt: 'ASC' },
    });
  }

  async isActiveMember(
    companyId: string,
    roomId: string,
    memberType: RoomMemberType,
    memberId: string,
  ): Promise<boolean> {
    const row = await this.membersRepo.findOne({
      where: {
        companyId,
        roomId,
        memberType,
        memberId,
        leftAt: IsNull(),
      },
    });
    return !!row;
  }

  async addMembers(
    companyId: string,
    roomId: string,
    members: Array<{ memberType: RoomMemberType; memberId: string }>,
  ): Promise<RoomMember[]> {
    const saved: RoomMember[] = [];
    for (const m of members) {
      const existing = await this.membersRepo.findOne({
        where: {
          companyId,
          roomId,
          memberType: m.memberType,
          memberId: m.memberId,
        },
      });
      if (existing) {
        if (existing.leftAt) {
          existing.leftAt = null;
          const row = await this.membersRepo.save(existing);
          saved.push(row);
          await this.publishJoined(companyId, roomId, m.memberType, m.memberId);
        } else {
          saved.push(existing);
        }
      } else {
        const row = await this.membersRepo.save(
          this.membersRepo.create({
            companyId,
            roomId,
            memberType: m.memberType,
            memberId: m.memberId,
          }),
        );
        saved.push(row);
        await this.publishJoined(companyId, roomId, m.memberType, m.memberId);
      }
    }
    return saved;
  }

  /**
   * Add members and return insertion stats.
   * - inserted: newly created rows + re-joined (leftAt cleared)
   * - skipped: already-active members that required no change
   */
  async addMembersWithStats(
    companyId: string,
    roomId: string,
    members: Array<{ memberType: RoomMemberType; memberId: string }>,
  ): Promise<{ inserted: number; skipped: number }> {
    let inserted = 0;
    let skipped = 0;
    for (const m of members) {
      const existing = await this.membersRepo.findOne({
        where: {
          companyId,
          roomId,
          memberType: m.memberType,
          memberId: m.memberId,
        },
      });
      if (existing) {
        if (existing.leftAt) {
          existing.leftAt = null;
          await this.membersRepo.save(existing);
          inserted += 1;
          await this.publishJoined(companyId, roomId, m.memberType, m.memberId);
        } else {
          skipped += 1;
        }
      } else {
        await this.membersRepo.save(
          this.membersRepo.create({
            companyId,
            roomId,
            memberType: m.memberType,
            memberId: m.memberId,
          }),
        );
        inserted += 1;
        await this.publishJoined(companyId, roomId, m.memberType, m.memberId);
      }
    }
    return { inserted, skipped };
  }

  /**
   * 将当前用户在该房间的已读游标更新为房间的 message_seq（清除未读）。
   */
  async markHumanRoomRead(
    companyId: string,
    roomId: string,
    userId: string,
    messageSeq: string,
  ): Promise<void> {
    const res = await this.membersRepo.update(
      {
        companyId,
        roomId,
        memberType: 'human',
        memberId: userId,
        leftAt: IsNull(),
      },
      { lastReadSeq: messageSeq },
    );
    if ((res.affected ?? 0) === 0) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: '不在该协作房间或无法更新已读状态',
      });
    }
  }

  async removeMember(
    companyId: string,
    roomId: string,
    memberType: RoomMemberType,
    memberId: string,
  ): Promise<{ affected: number }> {
    const res = await this.membersRepo.update(
      { companyId, roomId, memberType, memberId, leftAt: IsNull() },
      { leftAt: new Date() },
    );
    const affected = res.affected ?? 0;
    if (affected > 0) {
      await this.publishLeft(companyId, roomId, memberType, memberId);
    }
    return { affected };
  }

  private async publishJoined(
    companyId: string,
    roomId: string,
    memberType: RoomMemberType,
    memberId: string,
  ): Promise<void> {
    try {
      const event: CollaborationRoomMemberJoinedEvent = {
        eventId: randomUUID(),
        eventType: 'collaboration.room.member.joined',
        aggregateId: roomId,
        aggregateType: 'room_member',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          roomId,
          memberType,
          memberId,
          joinedAt: new Date().toISOString(),
        },
      };
      await this.messaging.publish(event, {
        routingKey: 'collaboration.room.member.joined',
        persistent: true,
      });
    } catch (e: any) {
      this.logger.warn('publish room.member.joined failed', { error: e?.message });
    }
  }

  private async publishLeft(
    companyId: string,
    roomId: string,
    memberType: RoomMemberType,
    memberId: string,
  ): Promise<void> {
    try {
      const event: CollaborationRoomMemberLeftEvent = {
        eventId: randomUUID(),
        eventType: 'collaboration.room.member.left',
        aggregateId: roomId,
        aggregateType: 'room_member',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          roomId,
          memberType,
          memberId,
          leftAt: new Date().toISOString(),
        },
      };
      await this.messaging.publish(event, {
        routingKey: 'collaboration.room.member.left',
        persistent: true,
      });
    } catch (e: any) {
      this.logger.warn('publish room.member.left failed', { error: e?.message });
    }
  }
}
