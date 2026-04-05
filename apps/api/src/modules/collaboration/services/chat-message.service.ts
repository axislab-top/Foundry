import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { MessagingService } from '@service/messaging';
import type {
  CollaborationMemoryIndexRequestedEvent,
  CollaborationMentionRoutedEvent,
  CollaborationMessageReceivedEvent,
  CollaborationTaskExtractedEvent,
} from '@contracts/events';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { TenantContextService } from '@service/tenant';
import {
  ChatMessage,
  type ChatMemoryReference,
  type ChatMessageType,
  type ChatSenderType,
} from '../entities/chat-message.entity.js';
import { Agent } from '../../agents/entities/agent.entity.js';
import { SendChatMessageDto } from '../dto/send-message.dto.js';
import { ListChatMessagesDto } from '../dto/list-messages.dto.js';
import { SearchChatMessagesDto } from '../dto/search-messages.dto.js';
import { extractMentionedAgentIds, hasCeoAliasMention } from '../utils/collaboration-mention.util.js';
import { ChatRoomService } from './chat-room.service.js';
import { DiscussionThreadService } from './discussion-thread.service.js';
import { RoomMemberService } from './room-member.service.js';
import { CollaborationRealtimePublisher } from './collaboration-realtime-publisher.service.js';

interface ActorRef {
  id: string;
}

/**
 * TypeORM 0.3+ returns `[rows, rowCount]` for PostgreSQL UPDATE/DELETE raw queries,
 * not a flat row array. See `PostgresQueryRunner.query` (result.raw for UPDATE).
 */
function firstRowFromTypeOrmRawQuery(result: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(result) || result.length === 0) return undefined;
  const head = result[0];
  if (Array.isArray(head) && result.length >= 2 && typeof result[1] === 'number') {
    return head[0] as Record<string, unknown> | undefined;
  }
  return head as Record<string, unknown> | undefined;
}

@Injectable()
export class ChatMessageService {
  private readonly logger = new Logger(ChatMessageService.name);

  constructor(
    @InjectRepository(ChatMessage)
    private readonly messagesRepo: Repository<ChatMessage>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    private readonly rooms: ChatRoomService,
    private readonly threads: DiscussionThreadService,
    private readonly members: RoomMemberService,
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly collabRealtime: CollaborationRealtimePublisher,
  ) {}

  private async resolveMentionedAgentIds(
    companyId: string,
    roomId: string,
    content: string,
  ): Promise<string[]> {
    const ids = new Set<string>(extractMentionedAgentIds(content));
    if (hasCeoAliasMention(content)) {
      const ceo = await this.agentsRepo.findOne({
        where: { companyId, role: 'ceo', status: 'active' },
      });
      if (ceo?.id) {
        const activeInRoom = await this.members.isActiveMember(
          companyId,
          roomId,
          'agent',
          ceo.id,
        );
        if (!activeInRoom) {
          await this.members.addMembers(companyId, roomId, [
            { memberType: 'agent', memberId: ceo.id },
          ]);
        }
        ids.add(ceo.id);
      }
    }
    return [...ids];
  }

  async sendHumanMessage(
    companyId: string,
    actor: ActorRef,
    dto: SendChatMessageDto,
  ): Promise<ChatMessage> {
    await this.rooms.findOneOrFail(companyId, dto.roomId);
    const allowed = await this.members.isActiveMember(
      companyId,
      dto.roomId,
      'human',
      actor.id,
    );
    if (!allowed) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '无权在此房间发送消息',
      });
    }
    if (dto.threadId) {
      const th = await this.threads.findOneOrFail(companyId, dto.threadId);
      if (th.roomId !== dto.roomId) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: '线程不属于该房间',
        });
      }
    }
    const mentioned = await this.resolveMentionedAgentIds(companyId, dto.roomId, dto.content);
    const metadata: Record<string, unknown> = {
      ...(dto.metadata ?? {}),
      ...(mentioned.length ? { mentionedAgentIds: mentioned } : {}),
    };
    return this.appendMessage(companyId, dto.roomId, {
      senderType: 'human',
      senderId: actor.id,
      messageType: dto.messageType ?? 'text',
      content: dto.content,
      metadata: Object.keys(metadata).length ? metadata : undefined,
      threadId: dto.threadId ?? null,
    });
  }

  /**
   * Agent / 系统写入（内部调用，由 Worker 或后续 Agent 编排使用）
   */
  async appendAgentMessage(
    companyId: string,
    roomId: string,
    agentId: string,
    content: string,
    messageType: ChatMessageType = 'text',
    metadata?: Record<string, unknown>,
    threadId?: string | null,
    memoryReferences?: ChatMemoryReference[] | null,
  ): Promise<ChatMessage> {
    return this.appendMessage(companyId, roomId, {
      senderType: 'agent',
      senderId: agentId,
      messageType,
      content,
      metadata,
      threadId: threadId ?? null,
      memoryReferences: memoryReferences?.length ? memoryReferences : null,
    });
  }

  /**
   * 系统类消息（以操作者身份落库，便于审计；内容可为「某部门已加入」等）。
   * 调用方已做过授权校验。
   */
  async appendSystemMessageAsActor(
    companyId: string,
    roomId: string,
    actorUserId: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<ChatMessage> {
    return this.appendMessage(companyId, roomId, {
      senderType: 'human',
      senderId: actorUserId,
      messageType: 'system',
      content,
      metadata,
    });
  }

  async findMessageById(companyId: string, messageId: string): Promise<ChatMessage> {
    const row = await this.messagesRepo.findOne({
      where: { id: messageId, companyId },
    });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '消息不存在',
      });
    }
    return row;
  }

  async patchMessageMetadata(
    companyId: string,
    messageId: string,
    patch: Record<string, unknown>,
  ): Promise<ChatMessage> {
    const row = await this.findMessageById(companyId, messageId);
    row.metadata = { ...(row.metadata ?? {}), ...patch };
    return this.messagesRepo.save(row);
  }

  private async appendMessage(
    companyId: string,
    roomId: string,
    params: {
      senderType: ChatSenderType;
      senderId: string;
      messageType: ChatMessageType;
      content: string;
      metadata?: Record<string, unknown>;
      threadId?: string | null;
      memoryReferences?: ChatMemoryReference[] | null;
    },
  ): Promise<ChatMessage> {
    const messageId = randomUUID();
    const saved = await this.dataSource.transaction(async (manager) => {
      const upd = await manager.query(
        `
        UPDATE chat_rooms
        SET message_seq = COALESCE(message_seq, 0) + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND company_id = $2
        RETURNING message_seq
        `,
        [roomId, companyId],
      );
      const seqRow = firstRowFromTypeOrmRawQuery(upd);
      const nextSeq = seqRow?.message_seq;
      if (nextSeq == null) {
        throw new NotFoundException({
          code: ErrorCode.RECORD_NOT_FOUND,
          message: '房间不存在或无法分配序号',
        });
      }
      const row = manager.create(ChatMessage, {
        id: messageId,
        companyId,
        roomId,
        threadId: params.threadId ?? null,
        seq: String(nextSeq),
        senderType: params.senderType,
        senderId: params.senderId,
        messageType: params.messageType,
        content: params.content,
        metadata: params.metadata ?? null,
        memoryReferences: params.memoryReferences ?? null,
      });
      return manager.save(ChatMessage, row);
    });

    await this.publishPostMessageHooks(companyId, saved);
    return saved;
  }

  private async publishPostMessageHooks(
    companyId: string,
    message: ChatMessage,
  ): Promise<void> {
    await this.publishReceived(message);
    await this.publishTaskExtractedIfHeuristic(companyId, message);
    await this.publishMentionRouted(companyId, message);
    await this.publishMemoryIndexRequested(companyId, message);
    if (message.messageType === 'stream_chunk') {
      await this.collabRealtime.publishMessageChunk(companyId, message);
    } else {
      await this.collabRealtime.publishMessage(companyId, message);
    }
  }

  /** 轻量启发式：检测待办/任务用语并发布抽取事件，供 Memory / 未来 Tasks 落地 */
  private async publishTaskExtractedIfHeuristic(
    companyId: string,
    message: ChatMessage,
  ): Promise<void> {
    if (message.messageType === 'stream_chunk') return;
    if (message.messageType !== 'text' || message.senderType !== 'human') return;
    const text = message.content?.trim() ?? '';
    if (text.length < 6) return;
    const hit =
      /\bTODO\b/i.test(text) ||
      /待办|任务[:：]|\[任务\]|action items?/i.test(text);
    if (!hit) return;
    try {
      const event: CollaborationTaskExtractedEvent = {
        eventId: randomUUID(),
        eventType: 'collaboration.task.extracted',
        aggregateId: message.roomId,
        aggregateType: 'chat_room',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          roomId: message.roomId,
          sourceMessageId: message.id,
          title: text.split('\n')[0]!.slice(0, 500),
          description: text.slice(0, 4000),
          extractedAt: new Date().toISOString(),
        },
      };
      await this.messaging.publish(event, {
        routingKey: 'collaboration.task.extracted',
        persistent: true,
      });
    } catch (e: any) {
      this.logger.warn('publish collaboration.task.extracted failed', {
        error: e?.message,
      });
    }
  }

  private async publishReceived(message: ChatMessage): Promise<void> {
    const companyId =
      this.tenantContext.getCompanyId() ?? message.companyId;
    try {
      const meta = message.metadata ?? {};
      const mentionedRaw = meta.mentionedAgentIds;
      const mentionedAgentIds = Array.isArray(mentionedRaw)
        ? mentionedRaw.filter((x): x is string => typeof x === 'string')
        : undefined;
      const traceId =
        typeof meta.traceId === 'string' && meta.traceId.trim()
          ? meta.traceId.trim()
          : undefined;
      let collaborationMode: string | null | undefined;
      try {
        const room = await this.rooms.findOneOrFail(companyId, message.roomId);
        collaborationMode = room.collaborationMode ?? 'discussion';
      } catch {
        collaborationMode = undefined;
      }
      const event: CollaborationMessageReceivedEvent = {
        eventId: randomUUID(),
        eventType: 'collaboration.message.received',
        aggregateId: message.id,
        aggregateType: 'chat_message',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          messageId: message.id,
          roomId: message.roomId,
          seq: message.seq,
          senderType: message.senderType,
          senderId: message.senderId,
          messageType: message.messageType,
          contentPreview: message.content.slice(0, 2000),
          createdAt: message.createdAt.toISOString(),
          ...(mentionedAgentIds?.length ? { mentionedAgentIds } : {}),
          threadId: message.threadId ?? null,
          ...(traceId ? { traceId } : {}),
          ...(collaborationMode != null ? { collaborationMode } : {}),
        },
      };
      await this.messaging.publish(event, {
        routingKey: 'collaboration.message.received',
        persistent: true,
      });
    } catch (e: any) {
      this.logger.warn('Failed to publish collaboration.message.received', {
        error: e?.message,
      });
    }
  }

  private async publishMentionRouted(
    companyId: string,
    message: ChatMessage,
  ): Promise<void> {
    const ids = message.metadata?.mentionedAgentIds;
    if (!Array.isArray(ids) || ids.length === 0) return;
    const mentionedAgentIds = ids.filter((x) => typeof x === 'string') as string[];
    if (mentionedAgentIds.length === 0) return;
    try {
      const event: CollaborationMentionRoutedEvent = {
        eventId: randomUUID(),
        eventType: 'collaboration.mention.routed',
        aggregateId: message.id,
        aggregateType: 'chat_message',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          messageId: message.id,
          roomId: message.roomId,
          mentionedAgentIds,
          routedAt: new Date().toISOString(),
        },
      };
      await this.messaging.publish(event, {
        routingKey: 'collaboration.mention.routed',
        persistent: true,
      });
    } catch (e: any) {
      this.logger.warn('publish collaboration.mention.routed failed', {
        error: e?.message,
      });
    }
  }

  private async publishMemoryIndexRequested(
    companyId: string,
    message: ChatMessage,
  ): Promise<void> {
    try {
      const event: CollaborationMemoryIndexRequestedEvent = {
        eventId: randomUUID(),
        eventType: 'collaboration.memory.index.requested',
        aggregateId: message.id,
        aggregateType: 'chat_message',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          messageId: message.id,
          roomId: message.roomId,
          requestedAt: new Date().toISOString(),
        },
      };
      await this.messaging.publish(event, {
        routingKey: 'collaboration.memory.index.requested',
        persistent: true,
      });
    } catch (e: any) {
      this.logger.warn('publish collaboration.memory.index.requested failed', {
        error: e?.message,
      });
    }
  }

  async listMessages(
    companyId: string,
    dto: ListChatMessagesDto,
  ): Promise<{ items: ChatMessage[]; hasMore: boolean }> {
    await this.rooms.findOneOrFail(companyId, dto.roomId);
    const limit = Math.min(dto.limit ?? 50, 200);
    const qb = this.messagesRepo
      .createQueryBuilder('m')
      .where('m.company_id = :companyId', { companyId })
      .andWhere('m.room_id = :roomId', { roomId: dto.roomId })
      .orderBy('m.seq', 'DESC')
      .take(limit + 1);
    if (dto.beforeSeq != null) {
      qb.andWhere('m.seq < :beforeSeq', { beforeSeq: dto.beforeSeq });
    }
    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    items.reverse();
    return { items, hasMore };
  }

  /**
   * 关键词（全文检索 simple）+ 发送方 + 时间范围 + 分页。
   * 需已执行迁移 `CollaborationMessagesSearchAndIndexes`（content_tsv 列）。
   */
  async searchMessages(
    companyId: string,
    dto: SearchChatMessagesDto,
  ): Promise<{
    items: ChatMessage[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    await this.rooms.findOneOrFail(companyId, dto.roomId);
    const pageSize = Math.min(dto.limit ?? 30, 100);
    const page = dto.page ?? 1;
    const qb = this.messagesRepo
      .createQueryBuilder('m')
      .where('m.company_id = :companyId', { companyId })
      .andWhere('m.room_id = :roomId', { roomId: dto.roomId });
    if (dto.q?.trim()) {
      qb.andWhere(`m.content_tsv @@ plainto_tsquery('simple', :tsq)`, {
        tsq: dto.q.trim(),
      });
    }
    if (dto.senderType) {
      qb.andWhere('m.sender_type = :st', { st: dto.senderType });
    }
    if (dto.senderId) {
      qb.andWhere('m.sender_id = :sid', { sid: dto.senderId });
    }
    if (dto.from) {
      qb.andWhere('m.created_at >= :from', { from: new Date(dto.from) });
    }
    if (dto.to) {
      qb.andWhere('m.created_at <= :to', { to: new Date(dto.to) });
    }
    const total = await qb.getCount();
    const items = await qb
      .clone()
      .orderBy('m.seq', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();
    return { items, total, page, pageSize };
  }
}
