import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { ChatRoom, type ChatRoomType, type CollaborationMode } from '../entities/chat-room.entity.js';

export type ChatRoomWithUnread = ChatRoom & {
  unreadCount: number;
  lastMessage: string | null;
  lastMessageAt: string | null;
};

@Injectable()
export class ChatRoomService {
  constructor(
    @InjectRepository(ChatRoom)
    private readonly roomsRepo: Repository<ChatRoom>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findMainRoom(companyId: string): Promise<ChatRoom | null> {
    return this.roomsRepo.findOne({
      where: { companyId, roomType: 'main' },
    });
  }

  async findOneOrFail(companyId: string, roomId: string): Promise<ChatRoom> {
    const room = await this.roomsRepo.findOne({
      where: { id: roomId, companyId },
    });
    if (!room) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '聊天室不存在',
      });
    }
    return room;
  }

  async findOne(companyId: string, roomId: string): Promise<ChatRoom | null> {
    return this.roomsRepo.findOne({
      where: { id: roomId, companyId },
    });
  }

  async resolveRoomIdBySession(
    companyId: string,
    sessionId: string,
    options?: { bindMainFallback?: boolean },
  ): Promise<{ roomId: string | null; resolvedBy: 'room_id' | 'metadata' | 'main_fallback' | 'none' }> {
    const sid = String(sessionId ?? '').trim();
    if (!sid) return { roomId: null, resolvedBy: 'none' };
    const bindMainFallback = options?.bindMainFallback !== false;
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (uuidRe.test(sid)) {
      const byId = await this.findOne(companyId, sid);
      if (byId?.id) return { roomId: byId.id, resolvedBy: 'room_id' };
    }

    const byMeta = await this.roomsRepo
      .createQueryBuilder('room')
      .where('room.company_id = :companyId', { companyId })
      .andWhere(
        `(room.metadata ->> 'acpSessionId' = :sid OR room.metadata ->> 'sessionId' = :sid OR (room.metadata -> 'acpSessionAliases') ? :sid)`,
        { sid },
      )
      .orderBy('room.updated_at', 'DESC')
      .addOrderBy('room.created_at', 'ASC')
      .getOne();
    if (byMeta?.id) return { roomId: byMeta.id, resolvedBy: 'metadata' };

    if (!bindMainFallback) return { roomId: null, resolvedBy: 'none' };
    const main = await this.findMainRoom(companyId);
    if (!main?.id) return { roomId: null, resolvedBy: 'none' };

    const metadata = (main.metadata && typeof main.metadata === 'object' && !Array.isArray(main.metadata)
      ? { ...main.metadata }
      : {}) as Record<string, unknown>;
    const aliases = Array.isArray(metadata.acpSessionAliases)
      ? metadata.acpSessionAliases.map((x) => String(x ?? '').trim()).filter(Boolean)
      : [];
    if (!aliases.includes(sid)) aliases.push(sid);
    const patch: Record<string, unknown> = { acpSessionAliases: aliases.slice(0, 20) };
    if (typeof metadata.acpSessionId !== 'string' || !String(metadata.acpSessionId).trim()) {
      patch.acpSessionId = sid;
    }
    /** 原子合并 metadata，避免与 `updateCollaborationMode` 并发时整行 save 盖回旧 collaboration_mode */
    await this.mergeRoomMetadata(companyId, main.id, patch);
    return { roomId: main.id, resolvedBy: 'main_fallback' };
  }

  async listRooms(companyId: string): Promise<ChatRoom[]> {
    return this.roomsRepo.find({
      where: { companyId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * 列出公司全部房间并附带当前用户的未读条数。
   * 未读：seq > last_read_seq、非 stream_chunk、且非本人发送的人消息。
   */
  async listRoomsWithUnread(
    companyId: string,
    userId: string,
  ): Promise<ChatRoomWithUnread[]> {
    const rooms = await this.listRooms(companyId);
    if (rooms.length === 0) {
      return [];
    }
    const [unreadRows, lastMsgRows] = await Promise.all([
      this.dataSource.query(
        `
        SELECT m.room_id::text AS "roomId", COUNT(*)::int AS cnt
        FROM chat_messages m
        INNER JOIN room_members rm ON rm.room_id = m.room_id AND rm.company_id = m.company_id
        WHERE m.company_id = $1
          AND rm.company_id = $1
          AND rm.member_type = 'human'
          AND rm.member_id = $2
          AND rm.left_at IS NULL
          AND m.message_type <> 'stream_chunk'
          AND m.seq > rm.last_read_seq
          AND NOT (m.sender_type = 'human' AND m.sender_id = $2::uuid)
        GROUP BY m.room_id
        `,
        [companyId, userId],
      ) as Promise<Array<{ roomId: string; cnt: number }>>,
      this.dataSource.query(
        `
        SELECT DISTINCT ON (m.room_id)
          m.room_id::text AS "roomId",
          LEFT(m.content, 100) AS "lastMessage",
          m.created_at::text AS "lastMessageAt"
        FROM chat_messages m
        WHERE m.company_id = $1
          AND m.message_type <> 'stream_chunk'
          AND m.content <> ''
        ORDER BY m.room_id, m.seq DESC
        `,
        [companyId],
      ) as Promise<Array<{ roomId: string; lastMessage: string; lastMessageAt: string }>>,
    ]);
    const unreadMap = new Map(unreadRows.map((r) => [r.roomId, r.cnt]));
    const lastMsgMap = new Map(lastMsgRows.map((r) => [r.roomId, r]));
    return rooms.map((r) => ({
      ...r,
      unreadCount: unreadMap.get(r.id) ?? 0,
      lastMessage: lastMsgMap.get(r.id)?.lastMessage ?? null,
      lastMessageAt: lastMsgMap.get(r.id)?.lastMessageAt ?? null,
    }));
  }

  async createMainRoom(
    companyId: string,
    name: string,
    createdByUserId: string,
  ): Promise<ChatRoom> {
    const existing = await this.findMainRoom(companyId);
    if (existing) {
      return existing;
    }
    try {
      return await this.roomsRepo.save(
        this.roomsRepo.create({
          companyId,
          roomType: 'main',
          name: '公司主群',
          createdBy: createdByUserId,
          metadata: this.buildRoomMetadata('main', { bootstrap: true }),
        }),
      );
    } catch (e: any) {
      if (e?.code === '23505') {
        const again = await this.findMainRoom(companyId);
        if (again) return again;
      }
      throw new ConflictException({
        code: ErrorCode.RECORD_ALREADY_EXISTS,
        message: '主群已存在或创建冲突',
      });
    }
  }

  async createRoom(
    companyId: string,
    params: {
      roomType: ChatRoomType;
      name: string;
      createdBy?: string;
      organizationNodeId?: string | null;
      taskId?: string | null;
      metadata?: Record<string, unknown>;
      collaborationMode?: CollaborationMode;
    },
  ): Promise<ChatRoom> {
    const normalizedName =
      params.roomType === 'main' ? '公司主群' : params.name;
    const normalizedMetadata = this.buildRoomMetadata(
      params.roomType,
      params.metadata ?? null,
    );
    return this.roomsRepo.save(
      this.roomsRepo.create({
        companyId,
        roomType: params.roomType,
        name: normalizedName,
        createdBy: params.createdBy ?? null,
        organizationNodeId: params.organizationNodeId ?? null,
        taskId: params.taskId ?? null,
        metadata: normalizedMetadata,
        collaborationMode: params.collaborationMode ?? 'discussion',
      }),
    );
  }

  async findDirectRoom(
    companyId: string,
    userId: string,
    agentId: string,
  ): Promise<ChatRoom | null> {
    return this.roomsRepo
      .createQueryBuilder('room')
      .where('room.company_id = :companyId', { companyId })
      .andWhere('room.room_type = :roomType', { roomType: 'direct' })
      .andWhere('room.created_by = :userId', { userId })
      .andWhere(`room.metadata ->> 'directAgentId' = :agentId`, { agentId })
      .getOne();
  }

  /**
   * 批量查询公司内所有已存在的 direct 房间，返回 Set<"userId:agentId"> 键。
   * 用于 ensureDirectRoomsForCompany 等批量初始化场景，避免逐对查询。
   */
  async findExistingDirectRoomKeys(companyId: string): Promise<Set<string>> {
    const rows = await this.roomsRepo
      .createQueryBuilder('room')
      .select(['room.created_by AS "createdBy"', `room.metadata ->> 'directAgentId' AS "agentId"`])
      .where('room.company_id = :companyId', { companyId })
      .andWhere('room.room_type = :roomType', { roomType: 'direct' })
      .getRawMany<{ createdBy: string; agentId: string }>();
    const keys = new Set<string>();
    for (const r of rows) {
      if (r.createdBy && r.agentId) keys.add(`${r.createdBy}:${r.agentId}`);
    }
    return keys;
  }

  async findDepartmentRoomByOrganizationNodeId(
    companyId: string,
    organizationNodeId: string,
  ): Promise<ChatRoom | null> {
    const nodeId = organizationNodeId.trim();
    if (!nodeId) return null;
    return this.roomsRepo.findOne({
      where: { companyId, roomType: 'department', organizationNodeId: nodeId },
    });
  }

  async findDepartmentRoomBySlug(
    companyId: string,
    departmentSlug: string,
  ): Promise<ChatRoom | null> {
    const slug = departmentSlug.trim().toLowerCase();
    if (!slug) return null;
    return this.roomsRepo
      .createQueryBuilder('room')
      .where('room.company_id = :companyId', { companyId })
      .andWhere(`room.room_type = 'department'`)
      .andWhere(`room.metadata ->> 'departmentSlug' = :slug`, { slug })
      .getOne();
  }

  private buildRoomMetadata(
    roomType: ChatRoomType,
    metadata: Record<string, unknown> | null,
  ): Record<string, unknown> {
    const base = { ...(metadata ?? {}) };
    const existingPolicy =
      typeof base.groupPolicy === 'object' && base.groupPolicy
        ? (base.groupPolicy as Record<string, unknown>)
        : {};
    const defaultPolicy: Record<string, unknown> =
      roomType === 'main'
        ? {
            allowMemberAdd: false,
            upgradeTemplateRequired: false,
            maxDiscussionRounds: 6,
          }
        : roomType === 'department'
          ? {
              allowMemberAdd: false,
              upgradeTemplateRequired: true,
              maxDiscussionRounds: 6,
            }
          : {
              allowMemberAdd: true,
              upgradeTemplateRequired: false,
              maxDiscussionRounds: 8,
            };
    base.groupPolicy = { ...defaultPolicy, ...existingPolicy };
    return base;
  }

  async updateCollaborationMode(
    companyId: string,
    roomId: string,
    mode: CollaborationMode,
  ): Promise<ChatRoom> {
    /** 仅更新协作模式列，避免与 `mergeRoomMetadata` 等并发时 `save` 整行覆盖对方已提交字段 */
    const r = await this.roomsRepo
      .createQueryBuilder()
      .update(ChatRoom)
      .set({
        collaborationMode: mode,
        updatedAt: () => 'CURRENT_TIMESTAMP',
      })
      .where('id = :roomId', { roomId })
      .andWhere('company_id = :companyId', { companyId })
      .execute();
    if (!r.affected) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '聊天室不存在',
      });
    }
    return this.findOneOrFail(companyId, roomId);
  }

  async mergeRoomMetadata(
    companyId: string,
    roomId: string,
    patch: Record<string, unknown>,
  ): Promise<ChatRoom> {
    const patchJson = JSON.stringify(patch ?? {});
    const rows = (await this.dataSource.query(
      `
      UPDATE chat_rooms
      SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2::uuid AND company_id = $3::uuid
      RETURNING id
      `,
      [patchJson, roomId, companyId],
    )) as Array<{ id: string }>;
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '聊天室不存在',
      });
    }
    return this.findOneOrFail(companyId, roomId);
  }
}
