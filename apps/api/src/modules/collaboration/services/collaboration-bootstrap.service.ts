import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Agent } from '../../agents/entities/agent.entity.js';
import { CompanyMembership } from '../../companies/entities/company-membership.entity.js';
import { OrganizationNode } from '../../organization/entities/organization-node.entity.js';
import { ChatRoomService } from './chat-room.service.js';
import { RoomMemberService } from './room-member.service.js';
import { OrganizationService } from '../../organization/services/organization.service.js';
import { CollaborationOrgSyncService } from './collaboration-org-sync.service.js';

/**
 * 主群初始化：公司负责人 + CEO + 全部部门主管（director，若已存在）。
 */
@Injectable()
export class CollaborationBootstrapService {
  private readonly logger = new Logger(CollaborationBootstrapService.name);
  private static readonly MAIN_ROOM_CONVERGE_ATTEMPTS = 3;

  constructor(
    private readonly rooms: ChatRoomService,
    private readonly members: RoomMemberService,
    private readonly orgSync: CollaborationOrgSyncService,
    private readonly organizationService: OrganizationService,
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(OrganizationNode)
    private readonly orgNodesRepo: Repository<OrganizationNode>,
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepo: Repository<CompanyMembership>,
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

    const [ceo, directors] = await Promise.all([
      this.agentsRepo.findOne({
        where: { companyId, role: 'ceo', status: 'active' },
      }),
      this.agentsRepo.find({
        where: { companyId, role: 'director', status: 'active' },
      }),
    ]);
    if (ceo) {
      await this.members.addMembers(companyId, main.id, [
        { memberType: 'agent', memberId: ceo.id },
      ]);
    }
    if (directors.length > 0) {
      await this.members.addMembers(
        companyId,
        main.id,
        directors.map((d) => ({ memberType: 'agent' as const, memberId: d.id })),
      );
    }

    await this.syncCompanyManagerHumansToRoom(companyId, main.id);

    this.logger.log('Main collaboration room ready', {
      companyId,
      roomId: main.id,
      ceoJoined: !!ceo,
      directorJoinedCount: directors.length,
    });

    await this.organizationService.getRoomOrgSnapshot(main.id);
  }

  /**
   * Ensure the critical main-room invariant converges:
   * - main room exists
   * - active CEO exists and is an active member of main room
   */
  async ensureMainRoomConvergedForCompany(
    companyId: string,
    ownerUserId: string,
    companyName?: string,
  ): Promise<void> {
    let lastReason = 'unknown';
    for (let attempt = 1; attempt <= CollaborationBootstrapService.MAIN_ROOM_CONVERGE_ATTEMPTS; attempt += 1) {
      await this.ensureMainRoomForCompany(companyId, ownerUserId, companyName);
      const check = await this.checkMainRoomConvergence(companyId);
      if (check.converged) {
        if (attempt > 1) {
          this.logger.warn('Main room convergence recovered on retry', {
            companyId,
            attempt,
          });
        }
        return;
      }
      lastReason = check.reason;
      this.logger.warn('Main room convergence not reached yet', {
        companyId,
        attempt,
        reason: check.reason,
      });
    }
    throw new Error(
      `Main room convergence failed after ${CollaborationBootstrapService.MAIN_ROOM_CONVERGE_ATTEMPTS} attempts: ${lastReason}`,
    );
  }

  async ensureDepartmentRoomsForCompany(
    companyId: string,
    actorUserId?: string,
  ): Promise<void> {
    const departments = await this.orgNodesRepo.find({
      where: { companyId, type: 'department' },
      order: { order: 'ASC' },
    });
    if (!departments.length) return;
    let createdCount = 0;
    for (const node of departments) {
      const existing =
        (await this.rooms.findDepartmentRoomByOrganizationNodeId(companyId, node.id)) ??
        (await this.rooms.findDepartmentRoomBySlug(companyId, this.orgSync.toDepartmentSlug(node)));
      const ensured = await this.orgSync.ensureDepartmentRoom(companyId, node, {
        actorUserId,
        syncManagers: true,
      });
      if (!existing && ensured.created) {
        await this.organizationService.getRoomOrgSnapshot(ensured.room.id);
        createdCount += 1;
      }
      await this.orgSync.syncActiveAgentsForDepartment(companyId, node.id);
    }
    this.logger.log('Department rooms reconciled from organization', {
      companyId,
      createdCount,
      departmentCount: departments.length,
    });
  }

  /**
   * 为当前公司所有活跃人类成员 × 所有活跃 Agent 幂等创建私聊房间。
   * 在列表加载时调用，确保联系人列表中的 Agent 均可直接发起对话。
   */
  async ensureDirectRoomsForCompany(companyId: string): Promise<void> {
    const [agents, memberships, existingKeys] = await Promise.all([
      this.agentsRepo.find({
        where: { companyId, status: 'active' },
        select: ['id', 'name', 'role'],
      }),
      this.membershipsRepo.find({
        where: { companyId, isActive: true },
        select: ['userId'],
      }),
      this.rooms.findExistingDirectRoomKeys(companyId),
    ]);
    if (!agents.length || !memberships.length) return;

    const humanIds = [...new Set(memberships.map((m) => m.userId))];
    let createdCount = 0;

    for (const humanId of humanIds) {
      for (const agent of agents) {
        if (existingKeys.has(`${humanId}:${agent.id}`)) continue;
        const room = await this.rooms.createRoom(companyId, {
          roomType: 'direct',
          name: agent.name || agent.role || 'Agent',
          createdBy: humanId,
          metadata: { directAgentId: agent.id, source: 'ensureDirectRoomsForCompany' },
        });
        await this.members.addMembers(companyId, room.id, [
          { memberType: 'human', memberId: humanId },
          { memberType: 'agent', memberId: agent.id },
        ]);
        createdCount += 1;
      }
    }

    if (createdCount > 0) {
      this.logger.log('Direct rooms ensured for company', {
        companyId,
        createdCount,
        agentCount: agents.length,
        humanCount: humanIds.length,
      });
    }
  }

  /**
   * 将当前公司所有活跃 Owner/Admin 人类成员幂等加入指定协作房（含已存在房间上的补全）。
   * RoomMemberService.addMembers 会去重 / 恢复 leftAt。
   */
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

  private async checkMainRoomConvergence(companyId: string): Promise<{ converged: boolean; reason: string }> {
    const [mainRoom, ceo] = await Promise.all([
      this.rooms.findMainRoom(companyId),
      this.agentsRepo.findOne({
        where: { companyId, role: 'ceo', status: 'active' },
        select: ['id'],
      } as any),
    ]);
    if (!mainRoom) {
      return { converged: false, reason: 'main_room_missing' };
    }
    if (!ceo?.id) {
      return { converged: false, reason: 'active_ceo_missing' };
    }
    const ceoInMain = await this.members.isActiveMember(
      companyId,
      mainRoom.id,
      'agent',
      ceo.id,
    );
    if (!ceoInMain) {
      return { converged: false, reason: 'ceo_not_in_main_room' };
    }
    return { converged: true, reason: 'ok' };
  }
}
