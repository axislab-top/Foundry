import { BadRequestException, Controller, ForbiddenException } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { randomUUID } from 'crypto';
import { Type } from 'class-transformer';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Repository } from 'typeorm';
import { MessagingService } from '@service/messaging';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { TenantContextService } from '@service/tenant';
import { RoomMemberRefDto } from './dto/add-members.dto.js';
import { CollaborationDynamicsService } from './services/collaboration-dynamics.service.js';
import { CollaborationSummaryService } from './services/collaboration-summary.service.js';
import { ChatMessageService } from './services/chat-message.service.js';
import { ChatRoomService } from './services/chat-room.service.js';
import { DiscussionThreadService } from './services/discussion-thread.service.js';
import { RoomMemberService } from './services/room-member.service.js';
import type { CollaborationMode } from './entities/chat-room.entity.js';
import type { DiscussionThreadStatus } from './entities/discussion-thread.entity.js';
import { ErrorCode } from '../../common/exceptions/error-codes.js';
import { Task } from '../tasks/entities/task.entity.js';
import { CompanyMembership } from '../companies/entities/company-membership.entity.js';
import type {
  AutonomousCeoApprovalApprovedEvent,
  AutonomousCeoApprovalRejectedEvent,
  AutonomousCeoApprovalResolvedEvent,
  AutonomousCeoApprovalDecision,
  CollaborationModeChangedEvent,
} from '@contracts/events';

class ActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString({ each: true })
  roles?: string[];
}

class CollaborationCompanyRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;
}

class CollaborationRoomsListDto extends CollaborationCompanyRpcDto {}

class CollaborationRoomIdDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;
}

class CollaborationMessagesSendDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;

  @IsOptional()
  @IsUUID()
  threadId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(65535)
  content: string;

  @IsOptional()
  @IsIn(['text', 'system', 'tool_call', 'stream_chunk'])
  messageType?: 'text' | 'system' | 'tool_call' | 'stream_chunk';

  @IsOptional()
  metadata?: Record<string, unknown>;
}

class MemoryReferenceItemDto {
  @IsUUID()
  memoryEntryId!: string;

  @IsOptional()
  @IsNumber()
  score?: number;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  namespace?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  sourceType?: string;
}

class CollaborationMessagesAppendAgentDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;

  @IsOptional()
  @IsUUID()
  threadId?: string;

  @IsUUID()
  agentId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(65535)
  content: string;

  @IsOptional()
  @IsIn(['text', 'system', 'tool_call', 'stream_chunk'])
  messageType?: 'text' | 'system' | 'tool_call' | 'stream_chunk';

  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(48)
  @ValidateNested({ each: true })
  @Type(() => MemoryReferenceItemDto)
  memoryReferences?: MemoryReferenceItemDto[];
}

class CollaborationMessagesListDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  beforeSeq?: number;
}

class CollaborationMessagesGetDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  messageId: string;
}

class CollaborationMembersAddDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RoomMemberRefDto)
  members: RoomMemberRefDto[];
}

class CollaborationMembersFromOrganizationNodeDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;

  @IsUUID()
  organizationNodeId: string;

  @IsOptional()
  @IsIn(['subtree', 'node_only'])
  scope?: 'subtree' | 'node_only';
}

class CollaborationCreateDepartmentRoomDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  organizationNodeId: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;
}

class CollaborationOrgNodesSearchDto extends CollaborationCompanyRpcDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  q: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

class CollaborationMessagesSearchRpcDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  q?: string;

  @IsOptional()
  @IsIn(['human', 'agent'])
  senderType?: 'human' | 'agent';

  @IsOptional()
  @IsUUID()
  senderId?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

class CollaborationMembersRemoveRpcDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;

  @IsIn(['human', 'agent'])
  memberType: 'human' | 'agent';

  @IsUUID()
  memberId: string;
}

class CollaborationRoomSummaryRequestRpcDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;

  @IsOptional()
  @IsIn(['manual', 'scheduled'])
  mode?: 'manual' | 'scheduled';
}

class CollaborationCeoApprovalResolveRpcDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  approvalId: string;

  @IsIn(['approved', 'rejected', 'modified'])
  decision: AutonomousCeoApprovalDecision;

  @IsOptional()
  @IsString()
  note?: string;
}

const COLLABORATION_MODE_VALUES: CollaborationMode[] = [
  'discussion',
  'direct',
  'execution',
  'approval_wait',
];

class CollaborationRoomUpdateModeDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;

  @IsIn(COLLABORATION_MODE_VALUES)
  collaborationMode: CollaborationMode;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  changeReason?: string;
}

class CollaborationRoomMergeMetadataDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;

  metadata!: Record<string, unknown>;
}

class CollaborationThreadsListDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;
}

class CollaborationThreadCreateDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  roomId: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  title?: string;

  @IsOptional()
  @IsIn(COLLABORATION_MODE_VALUES)
  collaborationMode?: CollaborationMode;
}

class CollaborationThreadUpdateDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  threadId: string;

  @IsOptional()
  @IsIn(['open', 'converged', 'archived'])
  status?: DiscussionThreadStatus;

  @IsOptional()
  @IsIn(COLLABORATION_MODE_VALUES)
  collaborationMode?: CollaborationMode | null;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  summary?: string;
}

class CollaborationThreadIncrementRoundDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  threadId: string;
}

class CollaborationThreadMergeMetadataDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  threadId: string;

  @IsObject()
  metadata!: Record<string, unknown>;
}

class CollaborationMessagesPatchMetadataDto extends CollaborationCompanyRpcDto {
  @IsUUID()
  messageId: string;

  metadata!: Record<string, unknown>;
}

@Controller()
export class CollaborationRpcController {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly rooms: ChatRoomService,
    private readonly threads: DiscussionThreadService,
    private readonly messages: ChatMessageService,
    private readonly members: RoomMemberService,
    private readonly dynamics: CollaborationDynamicsService,
    private readonly summary: CollaborationSummaryService,
    private readonly messaging: MessagingService,
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepo: Repository<CompanyMembership>,
    @InjectRepository(Task)
    private readonly tasksRepo: Repository<Task>,
  ) {}

  @MessagePattern('collaboration.rooms.list')
  async roomsList(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationRoomsListDto, payload);
      return await this.runWithCompany(dto, () =>
        this.rooms.listRooms(dto.companyId),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.rooms.findMain')
  async roomsFindMain(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationRoomsListDto, payload);
      return await this.runWithCompany(dto, () => this.rooms.findMainRoom(dto.companyId));
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.rooms.findOne')
  async roomsFindOne(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationRoomIdDto, payload);
      return await this.runWithCompany(dto, () =>
        this.rooms.findOneOrFail(dto.companyId, dto.roomId),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.rooms.updateCollaborationMode')
  async roomsUpdateCollaborationMode(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationRoomUpdateModeDto, payload);
      return await this.runWithCompany(dto, async () => {
        const admin = dto.actor?.roles?.includes('admin');
        const member =
          admin ||
          (await this.members.isActiveMember(
            dto.companyId,
            dto.roomId,
            'human',
            dto.actor.id,
          ));
        if (!member) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: '无权更新该房间协作模式',
          });
        }
        const prev = await this.rooms.findOneOrFail(dto.companyId, dto.roomId);
        const prevMode = prev.collaborationMode;
        const updated = await this.rooms.updateCollaborationMode(
          dto.companyId,
          dto.roomId,
          dto.collaborationMode,
        );
        const changed: CollaborationModeChangedEvent = {
          eventId: randomUUID(),
          eventType: 'collaboration.mode.changed',
          aggregateId: dto.roomId,
          aggregateType: 'chat_room',
          occurredAt: new Date().toISOString(),
          version: 1,
          companyId: dto.companyId,
          data: {
            roomId: dto.roomId,
            previousMode: prevMode ?? null,
            newMode: dto.collaborationMode,
            reason: dto.changeReason ?? 'user_manual',
            changedAt: new Date().toISOString(),
          },
        };
        await this.messaging.publish(changed, {
          routingKey: changed.eventType,
          persistent: true,
        });
        return updated;
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.rooms.mergeMetadata')
  async roomsMergeMetadata(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationRoomMergeMetadataDto, payload);
      return await this.runWithCompany(dto, async () => {
        if (!dto.actor?.roles?.includes('admin')) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: '需要管理员上下文',
          });
        }
        return this.rooms.mergeRoomMetadata(dto.companyId, dto.roomId, dto.metadata);
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.threads.list')
  async threadsList(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationThreadsListDto, payload);
      return await this.runWithCompany(dto, async () => {
        const admin = dto.actor?.roles?.includes('admin');
        const member =
          admin ||
          (await this.members.isActiveMember(
            dto.companyId,
            dto.roomId,
            'human',
            dto.actor.id,
          ));
        if (!member) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: '无权查看该房间线程',
          });
        }
        return this.threads.listByRoom(dto.companyId, dto.roomId);
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.threads.create')
  async threadsCreate(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationThreadCreateDto, payload);
      return await this.runWithCompany(dto, async () => {
        const admin = dto.actor?.roles?.includes('admin');
        const member =
          admin ||
          (await this.members.isActiveMember(
            dto.companyId,
            dto.roomId,
            'human',
            dto.actor.id,
          ));
        if (!member) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: '无权在该房间创建线程',
          });
        }
        return this.threads.create(dto.companyId, dto.roomId, {
          title: dto.title,
          collaborationMode: dto.collaborationMode,
        });
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.threads.update')
  async threadsUpdate(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationThreadUpdateDto, payload);
      return await this.runWithCompany(dto, async () => {
        const t = await this.threads.findOneOrFail(dto.companyId, dto.threadId);
        const admin = dto.actor?.roles?.includes('admin');
        const member =
          admin ||
          (await this.members.isActiveMember(
            dto.companyId,
            t.roomId,
            'human',
            dto.actor.id,
          ));
        if (!member) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: '无权更新该线程',
          });
        }
        if (dto.collaborationMode !== undefined) {
          await this.threads.updateCollaborationMode(
            dto.companyId,
            dto.threadId,
            dto.collaborationMode,
          );
        }
        if (dto.status) {
          await this.threads.updateStatus(
            dto.companyId,
            dto.threadId,
            dto.status,
            dto.summary,
          );
        }
        return this.threads.findOneOrFail(dto.companyId, dto.threadId);
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.threads.incrementRound')
  async threadsIncrementRound(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationThreadIncrementRoundDto, payload);
      return await this.runWithCompany(dto, async () => {
        if (!dto.actor?.roles?.includes('admin')) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: '需要管理员上下文',
          });
        }
        return this.threads.incrementRound(dto.companyId, dto.threadId);
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.threads.mergeMetadata')
  async threadsMergeMetadata(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationThreadMergeMetadataDto, payload);
      return await this.runWithCompany(dto, async () => {
        if (!dto.actor?.roles?.includes('admin')) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: '需要管理员上下文',
          });
        }
        return this.threads.mergeMetadata(dto.companyId, dto.threadId, dto.metadata);
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.messages.patchMetadata')
  async messagesPatchMetadata(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationMessagesPatchMetadataDto, payload);
      return await this.runWithCompany(dto, async () => {
        if (!dto.actor?.roles?.includes('admin')) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: '需要管理员上下文',
          });
        }
        return this.messages.patchMessageMetadata(
          dto.companyId,
          dto.messageId,
          dto.metadata,
        );
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.messages.send')
  async messagesSend(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationMessagesSendDto, payload);
      return await this.runWithCompany(dto, () =>
        this.messages.sendHumanMessage(dto.companyId, dto.actor, {
          roomId: dto.roomId,
          threadId: dto.threadId,
          content: dto.content,
          messageType: dto.messageType,
          metadata: dto.metadata,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.messages.list')
  async messagesList(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationMessagesListDto, payload);
      return await this.runWithCompany(dto, () =>
        this.messages.listMessages(dto.companyId, {
          roomId: dto.roomId,
          limit: dto.limit,
          beforeSeq: dto.beforeSeq,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.messages.get')
  async messagesGet(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationMessagesGetDto, payload);
      return await this.runWithCompany(dto, () =>
        this.messages.findMessageById(dto.companyId, dto.messageId),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.messages.appendAgent')
  async messagesAppendAgent(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationMessagesAppendAgentDto, payload);
      return await this.runWithCompany(dto, () =>
        this.messages.appendAgentMessage(
          dto.companyId,
          dto.roomId,
          dto.agentId,
          dto.content,
          dto.messageType ?? 'text',
          dto.metadata,
          dto.threadId ?? null,
          dto.memoryReferences ?? null,
        ),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.messages.search')
  async messagesSearch(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationMessagesSearchRpcDto, payload);
      return await this.runWithCompany(dto, () =>
        this.messages.searchMessages(dto.companyId, {
          roomId: dto.roomId,
          q: dto.q,
          senderType: dto.senderType,
          senderId: dto.senderId,
          from: dto.from,
          to: dto.to,
          limit: dto.limit,
          page: dto.page,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.members.list')
  async membersList(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationRoomIdDto, payload);
      return await this.runWithCompany(dto, () =>
        this.members.listActiveMembers(dto.companyId, dto.roomId),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.members.add')
  async membersAdd(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationMembersAddDto, payload);
      return await this.runWithCompany(dto, () =>
        this.members.addMembers(dto.companyId, dto.roomId, dto.members),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.members.remove')
  async membersRemove(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationMembersRemoveRpcDto, payload);
      return await this.runWithCompany(dto, () =>
        this.dynamics.removeRoomMember(dto.companyId, dto.actor, {
          roomId: dto.roomId,
          memberType: dto.memberType,
          memberId: dto.memberId,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.room.summary.request')
  async roomSummaryRequest(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationRoomSummaryRequestRpcDto, payload);
      return await this.runWithCompany(dto, () =>
        this.summary.requestRoomSummary({
          companyId: dto.companyId,
          roomId: dto.roomId,
          requestedByUserId: dto.actor.id,
          mode: dto.mode,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.members.addFromOrganizationNode')
  async membersAddFromOrganizationNode(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationMembersFromOrganizationNodeDto, payload);
      return await this.runWithCompany(dto, () =>
        this.dynamics.addMembersFromOrganizationNode(dto.companyId, dto.actor, {
          roomId: dto.roomId,
          organizationNodeId: dto.organizationNodeId,
          scope: dto.scope,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.rooms.createDepartment')
  async roomsCreateDepartment(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationCreateDepartmentRoomDto, payload);
      return await this.runWithCompany(dto, () =>
        this.dynamics.createDepartmentRoom(dto.companyId, dto.actor, {
          organizationNodeId: dto.organizationNodeId,
          name: dto.name,
        }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.organizationNodes.search')
  async organizationNodesSearch(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationOrgNodesSearchDto, payload);
      return await this.runWithCompany(dto, () =>
        this.dynamics.searchOrganizationNodes(
          dto.companyId,
          dto.q,
          dto.limit,
        ),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('collaboration.ceoApprovals.resolve')
  async ceoApprovalResolve(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(CollaborationCeoApprovalResolveRpcDto, payload);
      return await this.runWithCompany(dto, async () => {
        // HITL 安全红线：禁止非 Owner/Admin 绕过用户审批流程直接放行
        if (!dto.actor?.id) {
          throw new ForbiddenException({
            code: ErrorCode.FORBIDDEN,
            message: '需要登录',
          });
        }

        // admin 角色默认信任（与 tasks.progress 逻辑保持一致）
        if (!dto.actor.roles?.includes('admin')) {
          const membership = await this.membershipsRepo.findOne({
            where: { companyId: dto.companyId, userId: dto.actor.id, isActive: true },
          });
          if (!membership || !['owner', 'admin'].includes(membership.role)) {
            throw new ForbiddenException({
              code: ErrorCode.FORBIDDEN,
              message: '仅公司 Owner/Admin 可审批 CEO',
            });
          }
        }

        // 安全红线：approvalId 不存在则必须失败，防止绕过 HITL
        // 通过 tasks.metadata.ceoApprovalId 与公司隔离（company_id）来校验
        const found = await this.tasksRepo
          .createQueryBuilder('t')
          .where('t.companyId = :companyId', { companyId: dto.companyId })
          .andWhere("t.metadata->>'ceoApprovalId' = :approvalId", { approvalId: dto.approvalId })
          .andWhere('t.requiresHumanApproval = true')
          .getCount();

        if (!found) {
          throw new BadRequestException({
            code: ErrorCode.BAD_REQUEST,
            message: 'approvalId 不存在或已过期',
          });
        }

        const decisionAt = new Date().toISOString();

        const resolved: AutonomousCeoApprovalResolvedEvent = {
          eventId: randomUUID(),
          eventType: 'autonomous.ceo.approval.resolved',
          aggregateId: dto.companyId,
          aggregateType: 'company',
          occurredAt: decisionAt,
          version: 1,
          companyId: dto.companyId,
          data: {
            companyId: dto.companyId,
            approvalId: dto.approvalId,
            decision: dto.decision,
            decisionAt,
            metadata: dto.note ? { note: dto.note } : undefined,
          },
        };

        await this.messaging.publish(resolved, {
          routingKey: resolved.eventType,
          persistent: true,
        });

        if (dto.decision === 'approved' || dto.decision === 'modified') {
          const approved: AutonomousCeoApprovalApprovedEvent = {
            eventId: randomUUID(),
            eventType: 'autonomous.ceo.approval.approved',
            aggregateId: dto.companyId,
            aggregateType: 'company',
            occurredAt: decisionAt,
            version: 1,
            companyId: dto.companyId,
            data: {
              companyId: dto.companyId,
              approvalId: dto.approvalId,
              decisionAt,
              metadata: dto.note ? { note: dto.note } : undefined,
            },
          };
          await this.messaging.publish(approved, {
            routingKey: approved.eventType,
            persistent: true,
          });
        }

        if (dto.decision === 'rejected') {
          const rejected: AutonomousCeoApprovalRejectedEvent = {
            eventId: randomUUID(),
            eventType: 'autonomous.ceo.approval.rejected',
            aggregateId: dto.companyId,
            aggregateType: 'company',
            occurredAt: decisionAt,
            version: 1,
            companyId: dto.companyId,
            data: {
              companyId: dto.companyId,
              approvalId: dto.approvalId,
              decisionAt,
              metadata: dto.note ? { note: dto.note } : undefined,
            },
          };
          await this.messaging.publish(rejected, {
            routingKey: rejected.eventType,
            persistent: true,
          });
        }

        return { ok: true };
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  private runWithCompany<T>(
    dto: { companyId: string },
    fn: () => Promise<T>,
  ): Promise<T> {
    return this.tenantContext.runWithCompanyId(dto.companyId, fn);
  }

  private toRpcError(e: any): RpcException {
    if (e?.getStatus && e?.getResponse) {
      return new RpcException({
        status: e.getStatus(),
        response: e.getResponse(),
        message: e.message,
      });
    }
    return e instanceof RpcException
      ? e
      : new RpcException({
          status: 500,
          message: e?.message ?? 'Internal error',
        });
  }
}
