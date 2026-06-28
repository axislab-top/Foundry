import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Agent } from '../../agents/entities/agent.entity.js';
import { CompanyMembership } from '../../companies/entities/company-membership.entity.js';
import { OrganizationNode } from '../../organization/entities/organization-node.entity.js';
import {
  buildNodeIdToDepartmentIdMap,
  collectDescendantOrgNodeIds,
  type OrgNodeLite,
} from '../../tasks/utils/organization-department.util.js';
import type { ChatRoom } from '../entities/chat-room.entity.js';
import { ChatRoomService } from './chat-room.service.js';
import { RoomMemberService } from './room-member.service.js';

export type AgentCollaborationSyncInput = {
  agentId: string;
  role: string;
  status: string;
  organizationNodeId?: string | null;
};

/**
 * 组织树 ↔ 协作群成员同步（部门群 + 主群）。
 * 产品口径：部门群内包含该部门子树下全部 active Agent（含 executor），主群仍仅 CEO/director。
 */
@Injectable()
export class CollaborationOrgSyncService {
  private readonly logger = new Logger(CollaborationOrgSyncService.name);

  constructor(
    private readonly rooms: ChatRoomService,
    private readonly members: RoomMemberService,
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(OrganizationNode)
    private readonly orgNodesRepo: Repository<OrganizationNode>,
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepo: Repository<CompanyMembership>,
  ) {}

  async onAgentCreated(companyId: string, input: AgentCollaborationSyncInput): Promise<void> {
    if (input.status !== 'active') return;

    if (['ceo', 'director'].includes(input.role)) {
      await this.addAgentToMainRoom(companyId, input.agentId, input.role);
    }

    if (input.organizationNodeId) {
      await this.syncAgentToDepartmentRoom(companyId, input.agentId, input.organizationNodeId);
    }

    // 为新 Agent 自动创建与所有现有人类成员的私聊房间
    await this.ensureDirectRoomsForNewAgent(companyId, input.agentId);
  }

  async onDepartmentNodeCreated(
    companyId: string,
    departmentNode: OrganizationNode,
    options?: { actorUserId?: string; headAgentId?: string },
  ): Promise<{ room: ChatRoom; created: boolean }> {
    const ensured = await this.ensureDepartmentRoom(companyId, departmentNode, {
      actorUserId: options?.actorUserId,
      syncManagers: true,
    });

    const directorAgentId =
      options?.headAgentId ??
      departmentNode.agentId ??
      (await this.resolveActiveDirectorAgentId(companyId, departmentNode.id));
    if (directorAgentId) {
      await this.members.addMembers(companyId, ensured.room.id, [
        { memberType: 'agent', memberId: directorAgentId },
      ]);
      await this.addAgentToMainRoom(companyId, directorAgentId, 'director');
    }

    await this.syncActiveAgentsForDepartment(companyId, departmentNode.id);
    return ensured;
  }

  async ensureDepartmentRoom(
    companyId: string,
    departmentNode: OrganizationNode,
    options?: { actorUserId?: string; syncManagers?: boolean },
  ): Promise<{ room: ChatRoom; created: boolean }> {
    const departmentSlug = this.toDepartmentSlug(departmentNode);
    const existing =
      (await this.rooms.findDepartmentRoomByOrganizationNodeId(companyId, departmentNode.id)) ??
      (await this.rooms.findDepartmentRoomBySlug(companyId, departmentSlug));

    const room =
      existing ??
      (await this.rooms.createRoom(companyId, {
        roomType: 'department',
        name: `${departmentNode.name} · 部门群`,
        createdBy: options?.actorUserId ?? undefined,
        organizationNodeId: departmentNode.id,
        metadata: {
          source: 'organization_sync_auto_init',
          departmentSlug,
          organizationNodeId: departmentNode.id,
        },
      }));

    if (options?.syncManagers !== false) {
      if (options?.actorUserId) {
        await this.members.addMembers(companyId, room.id, [
          { memberType: 'human', memberId: options.actorUserId },
        ]);
      }
      await this.syncCompanyManagerHumansToRoom(companyId, room.id);
    }

    return { room, created: !existing };
  }

  async syncActiveAgentsForDepartment(companyId: string, departmentNodeId: string): Promise<void> {
    const room = await this.rooms.findDepartmentRoomByOrganizationNodeId(companyId, departmentNodeId);
    if (!room) {
      this.logger.warn('Department room missing for agent sync', { companyId, departmentNodeId });
      return;
    }

    const agentIds = await this.listActiveAgentIdsInDepartmentSubtree(companyId, departmentNodeId);
    if (!agentIds.length) return;

    await this.members.addMembers(
      companyId,
      room.id,
      agentIds.map((agentId) => ({ memberType: 'agent' as const, memberId: agentId })),
    );
  }

  async syncAgentToDepartmentRoom(
    companyId: string,
    agentId: string,
    organizationNodeId: string,
  ): Promise<void> {
    const departmentNodeId = await this.resolveDepartmentNodeId(companyId, organizationNodeId);
    if (!departmentNodeId) return;

    const departmentNode = await this.orgNodesRepo.findOne({
      where: { id: departmentNodeId, companyId, type: 'department' },
    });
    if (!departmentNode) return;

    const { room } = await this.ensureDepartmentRoom(companyId, departmentNode, { syncManagers: false });
    await this.members.addMembers(companyId, room.id, [
      { memberType: 'agent', memberId: agentId },
    ]);
  }

  async listActiveAgentIdsInDepartmentSubtree(
    companyId: string,
    departmentNodeId: string,
  ): Promise<string[]> {
    const nodes = await this.listOrgNodesLite(companyId);
    const subtree = collectDescendantOrgNodeIds(departmentNodeId, nodes);
    const agents = await this.agentsRepo.find({
      where: { companyId, status: 'active' },
      select: ['id', 'organizationNodeId'],
    });
    return Array.from(
      new Set(
        agents
          .filter((a) => a.organizationNodeId && subtree.has(a.organizationNodeId))
          .map((a) => a.id)
          .filter(Boolean),
      ),
    );
  }

  async resolveDepartmentNodeId(
    companyId: string,
    organizationNodeId: string,
  ): Promise<string | null> {
    const nodes = await this.listOrgNodesLite(companyId);
    const map = buildNodeIdToDepartmentIdMap(nodes);
    return map.get(organizationNodeId) ?? null;
  }

  private async resolveActiveDirectorAgentId(
    companyId: string,
    departmentNodeId: string,
  ): Promise<string | null> {
    const director = await this.agentsRepo.findOne({
      where: {
        companyId,
        organizationNodeId: departmentNodeId,
        role: 'director',
        status: 'active',
      } as const,
      select: ['id'],
    });
    return director?.id ?? null;
  }

  private async addAgentToMainRoom(companyId: string, agentId: string, role: string): Promise<void> {
    const mainRoom = await this.rooms.findMainRoom(companyId);
    if (!mainRoom) {
      this.logger.warn('Main room missing, skip agent auto-join', { companyId, agentId, role });
      return;
    }
    await this.members.addMembers(companyId, mainRoom.id, [
      { memberType: 'agent', memberId: agentId },
    ]);
  }

  private async syncCompanyManagerHumansToRoom(companyId: string, roomId: string): Promise<void> {
    const ownersAndAdmins = await this.membershipsRepo.find({
      where: { companyId, isActive: true },
    });
    const managers = ownersAndAdmins.filter((m) => m.role === 'owner' || m.role === 'admin');
    if (!managers.length) return;
    await this.members.addMembers(
      companyId,
      roomId,
      managers.map((m) => ({ memberType: 'human' as const, memberId: m.userId })),
    );
  }

  private async listOrgNodesLite(companyId: string): Promise<OrgNodeLite[]> {
    const rows = await this.orgNodesRepo.find({
      where: { companyId },
      select: ['id', 'parentId', 'type'],
    });
    return rows.map((n) => ({ id: n.id, parentId: n.parentId, type: n.type }));
  }

  /**
   * 为新创建的 Agent 自动建立与公司内所有活跃人类成员的私聊房间。
   */
  private async ensureDirectRoomsForNewAgent(
    companyId: string,
    agentId: string,
  ): Promise<void> {
    const [agent, memberships] = await Promise.all([
      this.agentsRepo.findOne({ where: { id: agentId }, select: ['id', 'name', 'role'] }),
      this.membershipsRepo.find({ where: { companyId, isActive: true }, select: ['userId'] }),
    ]);
    if (!agent || !memberships.length) return;

    const humanIds = [...new Set(memberships.map((m) => m.userId))];
    const existingKeys = await this.rooms.findExistingDirectRoomKeys(companyId);
    let createdCount = 0;

    for (const humanId of humanIds) {
      if (existingKeys.has(`${humanId}:${agentId}`)) continue;
      const room = await this.rooms.createRoom(companyId, {
        roomType: 'direct',
        name: agent.name || agent.role || 'Agent',
        createdBy: humanId,
        metadata: { directAgentId: agentId, source: 'ensureDirectRoomsForNewAgent' },
      });
      await this.members.addMembers(companyId, room.id, [
        { memberType: 'human', memberId: humanId },
        { memberType: 'agent', memberId: agentId },
      ]);
      createdCount += 1;
    }

    if (createdCount > 0) {
      this.logger.log('Direct rooms created for new agent', {
        companyId,
        agentId,
        createdCount,
        humanCount: humanIds.length,
      });
    }
  }

  toDepartmentSlug(node: OrganizationNode): string {
    const fromMeta =
      node.metadata &&
      typeof node.metadata === 'object' &&
      typeof (node.metadata as Record<string, unknown>).platformDepartmentSlug === 'string'
        ? String((node.metadata as Record<string, unknown>).platformDepartmentSlug)
        : '';
    const source = fromMeta || node.name || node.id;
    return source
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9-\u4e00-\u9fff]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64);
  }
}
