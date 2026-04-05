import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import type { CollaborationDepartmentJoinedEvent } from '@contracts/events';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { CompanyMembership } from '../../companies/entities/company-membership.entity.js';
import { OrganizationNode } from '../../organization/entities/organization-node.entity.js';
import { OrganizationService } from '../../organization/services/organization.service.js';
import { Agent } from '../../agents/entities/agent.entity.js';
import { AddMembersFromOrganizationNodeDto } from '../dto/add-members-from-node.dto.js';
import { CreateDepartmentRoomDto } from '../dto/create-department-room.dto.js';
import { ChatMessageService } from './chat-message.service.js';
import { ChatRoomService } from './chat-room.service.js';
import { RoomMemberService } from './room-member.service.js';
import { ChatRoom } from '../entities/chat-room.entity.js';
import type { RoomMemberType } from '../entities/room-member.entity.js';

interface ActorRef {
  id: string;
}

@Injectable()
export class CollaborationDynamicsService {
  private readonly logger = new Logger(CollaborationDynamicsService.name);

  constructor(
    private readonly organizationService: OrganizationService,
    private readonly rooms: ChatRoomService,
    private readonly members: RoomMemberService,
    private readonly messages: ChatMessageService,
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepo: Repository<CompanyMembership>,
    @InjectRepository(OrganizationNode)
    private readonly orgNodesRepo: Repository<OrganizationNode>,
    private readonly messaging: MessagingService,
  ) {}

  /**
   * 将某组织节点下的 Agent 拉入当前群聊，并写入系统消息与领域事件。
   */
  async addMembersFromOrganizationNode(
    companyId: string,
    actor: ActorRef,
    dto: AddMembersFromOrganizationNodeDto,
  ): Promise<{
    room: ChatRoom;
    addedAgentIds: string[];
    bindings: Array<{ nodeId: string; nodeName: string; agentId: string }>;
    systemMessage: Awaited<ReturnType<ChatMessageService['appendSystemMessageAsActor']>>;
  }> {
    const room = await this.rooms.findOneOrFail(companyId, dto.roomId);
    const allowedInRoom = await this.members.isActiveMember(
      companyId,
      dto.roomId,
      'human',
      actor.id,
    );
    if (!allowedInRoom) {
      // 系统/自治执行（例如 Worker）可能不在房间内，但它作为 company owner/admin 代表公司执行拉取。
      const m = await this.membershipsRepo.findOne({
        where: { companyId, userId: actor.id, isActive: true },
      });
      const allowedByCompanyRole = !!m && ['owner', 'admin'].includes(m.role);
      if (!allowedByCompanyRole) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: '仅群内成员或公司 Owner/Admin 可拉取部门成员',
        });
      }
    }

    const scope = dto.scope ?? 'subtree';
    const bindings = await this.organizationService.findAgentBindingsForNode(
      dto.organizationNodeId,
      scope,
    );
    const candidateIds = [...new Set(bindings.map((b) => b.agentId))];
    const activeIds = await this.filterActiveAgentIds(companyId, candidateIds);
    if (activeIds.length === 0) {
      const systemMessage = await this.messages.appendSystemMessageAsActor(
        companyId,
        dto.roomId,
        actor.id,
        '所选组织范围内暂无可加入的活跃 Agent。',
        {
          kind: 'department_pull',
          organizationNodeId: dto.organizationNodeId,
          scope,
          empty: true,
        },
      );
      return {
        room,
        addedAgentIds: [],
        bindings: [],
        systemMessage,
      };
    }

    const memberPayload = activeIds.map((agentId) => ({
      memberType: 'agent' as const,
      memberId: agentId,
    }));
    await this.members.addMembers(companyId, dto.roomId, memberPayload);

    const anchorName =
      bindings.find((b) => b.nodeId === dto.organizationNodeId)?.nodeName ??
      bindings[0]?.nodeName ??
      '组织节点';
    const content =
      scope === 'node_only'
        ? `「${anchorName}」对应 Agent 已加入协作。`
        : `「${anchorName}」及下属组织共 ${activeIds.length} 名 Agent 已加入协作。`;

    const systemMessage = await this.messages.appendSystemMessageAsActor(
      companyId,
      dto.roomId,
      actor.id,
      content,
      {
        kind: 'department_pull',
        organizationNodeId: dto.organizationNodeId,
        scope,
        agentIds: activeIds,
      },
    );

    await this.publishDepartmentJoined(companyId, {
      roomId: dto.roomId,
      organizationNodeId: dto.organizationNodeId,
      scope,
      actorUserId: actor.id,
      agentIds: activeIds,
    });

    this.logger.log('Department agents pulled into room', {
      companyId,
      roomId: dto.roomId,
      nodeId: dto.organizationNodeId,
      count: activeIds.length,
    });

    return {
      room,
      addedAgentIds: activeIds,
      bindings: bindings.filter((b) => activeIds.includes(b.agentId)),
      systemMessage,
    };
  }

  /**
   * 创建「部门群」房间（绑定 organization_node_id），需公司 owner/admin。
   */
  async createDepartmentRoom(
    companyId: string,
    actor: ActorRef,
    dto: CreateDepartmentRoomDto,
  ): Promise<ChatRoom> {
    await this.assertCompanyOwnerOrAdmin(companyId, actor.id);
    const node = await this.orgNodesRepo.findOne({
      where: { id: dto.organizationNodeId, companyId },
    });
    if (!node) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '组织节点不存在',
      });
    }

    const name = dto.name?.trim() || `${node.name} · 部门群`;

    const room = await this.rooms.createRoom(companyId, {
      roomType: 'department',
      name,
      createdBy: actor.id,
      organizationNodeId: dto.organizationNodeId,
      metadata: { source: 'createDepartmentRoom' },
    });

    await this.members.addMembers(companyId, room.id, [
      { memberType: 'human', memberId: actor.id },
    ]);

    const bindings = await this.organizationService.findAgentBindingsForNode(
      dto.organizationNodeId,
      'subtree',
    );
    const activeIds = await this.filterActiveAgentIds(
      companyId,
      [...new Set(bindings.map((b) => b.agentId))],
    );
    if (activeIds.length > 0) {
      await this.members.addMembers(
        companyId,
        room.id,
        activeIds.map((agentId) => ({ memberType: 'agent' as const, memberId: agentId })),
      );
    }

    await this.messages.appendSystemMessageAsActor(
      companyId,
      room.id,
      actor.id,
      `已创建部门协作群「${name}」，并拉入当前组织范围内的 Agent。`,
      { kind: 'room_created', roomType: 'department' },
    );

    return room;
  }

  /**
   * 将成员移出房间（软离开）。操作者须为房间内 human 成员。
   */
  async removeRoomMember(
    companyId: string,
    actor: ActorRef,
    dto: { roomId: string; memberType: RoomMemberType; memberId: string },
  ): Promise<{ success: true; affected: number }> {
    const allowed = await this.members.isActiveMember(
      companyId,
      dto.roomId,
      'human',
      actor.id,
    );
    if (!allowed) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅群内成员可移出他人',
      });
    }
    const { affected } = await this.members.removeMember(
      companyId,
      dto.roomId,
      dto.memberType,
      dto.memberId,
    );
    if (affected === 0) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '成员不在房间内或已离开',
      });
    }
    return { success: true, affected };
  }

  private async assertCompanyOwnerOrAdmin(
    companyId: string,
    userId: string,
  ): Promise<void> {
    const m = await this.membershipsRepo.findOne({
      where: { companyId, userId, isActive: true },
    });
    if (!m || !['owner', 'admin'].includes(m.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅公司 Owner/Admin 可创建部门协作群',
      });
    }
  }

  private async filterActiveAgentIds(
    companyId: string,
    ids: string[],
  ): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.agentsRepo.find({
      where: { companyId, id: In(ids), status: 'active' },
      select: ['id'],
    });
    return rows.map((r) => r.id);
  }

  /**
   * 按名称模糊匹配组织节点（供「拉工程部」等自然语言解析前置检索）。
   */
  async searchOrganizationNodes(
    companyId: string,
    query: string,
    limit = 20,
  ): Promise<Pick<OrganizationNode, 'id' | 'name' | 'type' | 'parentId'>[]> {
    const q = query.trim();
    if (!q) {
      return [];
    }
    const rows = await this.orgNodesRepo
      .createQueryBuilder('n')
      .select(['n.id', 'n.name', 'n.type', 'n.parentId'])
      .where('n.company_id = :companyId', { companyId })
      .andWhere('n.name ILIKE :pat', { pat: `%${q}%` })
      .orderBy('n.order_no', 'ASC')
      .take(Math.min(Math.max(limit, 1), 50))
      .getMany();
    return rows;
  }

  private async publishDepartmentJoined(
    companyId: string,
    data: {
      roomId: string;
      organizationNodeId: string;
      scope: string;
      actorUserId: string;
      agentIds: string[];
    },
  ): Promise<void> {
    try {
      const event: CollaborationDepartmentJoinedEvent = {
        eventId: randomUUID(),
        eventType: 'collaboration.department.joined',
        aggregateId: data.roomId,
        aggregateType: 'chat_room',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          ...data,
          joinedAt: new Date().toISOString(),
        },
      };
      await this.messaging.publish(event, {
        routingKey: 'collaboration.department.joined',
        persistent: true,
      });
    } catch (e: any) {
      this.logger.warn('publish collaboration.department.joined failed', {
        error: e?.message,
      });
    }
  }
}
