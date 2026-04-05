import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { MessagingService } from '@service/messaging';
import type { CollaborationDiscussionConvergedEvent } from '@contracts/events';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import type { CollaborationMode } from '../entities/chat-room.entity.js';
import { DiscussionThread, type DiscussionThreadStatus } from '../entities/discussion-thread.entity.js';
import { ChatRoomService } from './chat-room.service.js';

@Injectable()
export class DiscussionThreadService {
  constructor(
    @InjectRepository(DiscussionThread)
    private readonly threadsRepo: Repository<DiscussionThread>,
    private readonly rooms: ChatRoomService,
    private readonly messaging: MessagingService,
  ) {}

  async create(
    companyId: string,
    roomId: string,
    params: { title?: string; collaborationMode?: CollaborationMode | null },
  ): Promise<DiscussionThread> {
    await this.rooms.findOneOrFail(companyId, roomId);
    return this.threadsRepo.save(
      this.threadsRepo.create({
        companyId,
        roomId,
        title: params.title?.trim() ? params.title.trim().slice(0, 512) : '讨论',
        status: 'open',
        collaborationMode: params.collaborationMode ?? null,
        roundCount: 0,
        metadata: null,
      }),
    );
  }

  async listByRoom(companyId: string, roomId: string): Promise<DiscussionThread[]> {
    await this.rooms.findOneOrFail(companyId, roomId);
    return this.threadsRepo.find({
      where: { companyId, roomId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOneOrFail(companyId: string, threadId: string): Promise<DiscussionThread> {
    const t = await this.threadsRepo.findOne({ where: { id: threadId, companyId } });
    if (!t) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '讨论线程不存在',
      });
    }
    return t;
  }

  async updateCollaborationMode(
    companyId: string,
    threadId: string,
    mode: CollaborationMode | null,
  ): Promise<DiscussionThread> {
    const t = await this.findOneOrFail(companyId, threadId);
    t.collaborationMode = mode;
    return this.threadsRepo.save(t);
  }

  async updateStatus(
    companyId: string,
    threadId: string,
    status: DiscussionThreadStatus,
    summary?: string,
  ): Promise<DiscussionThread> {
    const t = await this.findOneOrFail(companyId, threadId);
    const prev = t.status;
    t.status = status;
    const saved = await this.threadsRepo.save(t);
    if (status === 'converged' && prev !== 'converged') {
      const converged: CollaborationDiscussionConvergedEvent = {
        eventId: randomUUID(),
        eventType: 'collaboration.discussion.converged',
        aggregateId: threadId,
        aggregateType: 'discussion_thread',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          roomId: saved.roomId,
          threadId: saved.id,
          summary,
          convergedAt: new Date().toISOString(),
        },
      };
      try {
        await this.messaging.publish(converged, {
          routingKey: converged.eventType,
          persistent: true,
        });
      } catch {
        /* logged by messaging layer */
      }
    }
    return saved;
  }

  async incrementRound(companyId: string, threadId: string): Promise<DiscussionThread> {
    const t = await this.findOneOrFail(companyId, threadId);
    t.roundCount = (t.roundCount ?? 0) + 1;
    return this.threadsRepo.save(t);
  }

  async mergeMetadata(
    companyId: string,
    threadId: string,
    patch: Record<string, unknown>,
  ): Promise<DiscussionThread> {
    const t = await this.findOneOrFail(companyId, threadId);
    t.metadata = { ...(t.metadata ?? {}), ...patch };
    return this.threadsRepo.save(t);
  }
}
