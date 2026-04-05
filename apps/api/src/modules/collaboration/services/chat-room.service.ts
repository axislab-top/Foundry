import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { ChatRoom, type ChatRoomType, type CollaborationMode } from '../entities/chat-room.entity.js';

@Injectable()
export class ChatRoomService {
  constructor(
    @InjectRepository(ChatRoom)
    private readonly roomsRepo: Repository<ChatRoom>,
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

  async listRooms(companyId: string): Promise<ChatRoom[]> {
    return this.roomsRepo.find({
      where: { companyId },
      order: { createdAt: 'ASC' },
    });
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
          name,
          createdBy: createdByUserId,
          metadata: { bootstrap: true },
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
    return this.roomsRepo.save(
      this.roomsRepo.create({
        companyId,
        roomType: params.roomType,
        name: params.name,
        createdBy: params.createdBy ?? null,
        organizationNodeId: params.organizationNodeId ?? null,
        taskId: params.taskId ?? null,
        metadata: params.metadata ?? null,
        collaborationMode: params.collaborationMode ?? 'discussion',
      }),
    );
  }

  async updateCollaborationMode(
    companyId: string,
    roomId: string,
    mode: CollaborationMode,
  ): Promise<ChatRoom> {
    const room = await this.findOneOrFail(companyId, roomId);
    room.collaborationMode = mode;
    return this.roomsRepo.save(room);
  }

  async mergeRoomMetadata(
    companyId: string,
    roomId: string,
    patch: Record<string, unknown>,
  ): Promise<ChatRoom> {
    const room = await this.findOneOrFail(companyId, roomId);
    room.metadata = { ...(room.metadata ?? {}), ...patch };
    return this.roomsRepo.save(room);
  }
}
