import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import { TenantContextService } from '@service/tenant';
import type { AgentSkillsChangedEvent, SkillToolSnapshot } from '@contracts/events';
import { revisionToSnapshot } from '../../skills/services/skills.service.js';
import { CacheService } from '../../../common/cache/cache.service.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { SkillsService } from '../../skills/services/skills.service.js';
import { BindAgentSkillsDto } from '../dto/bind-agent-skills.dto.js';
import { Agent } from '../entities/agent.entity.js';
import type { AgentAuditAction } from '../entities/agent-audit-log.entity.js';
import { AgentAuditLog } from '../entities/agent-audit-log.entity.js';
import { AgentSkill } from '../entities/agent-skill.entity.js';
import { AgentValidatorService } from './agent-validator.service.js';

interface Actor {
  id: string;
  roles?: string[];
}

@Injectable()
export class AgentSkillService {
  constructor(
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(AgentSkill)
    private readonly agentSkillsRepo: Repository<AgentSkill>,
    @InjectRepository(AgentAuditLog)
    private readonly auditRepo: Repository<AgentAuditLog>,
    private readonly tenantContext: TenantContextService,
    private readonly skillsService: SkillsService,
    private readonly validator: AgentValidatorService,
    private readonly messagingService: MessagingService,
    private readonly cacheService: CacheService,
  ) {}

  private agentDetailCacheKey(companyId: string, agentId: string): string {
    return `company:${companyId}:agent:${agentId}`;
  }

  private getCompanyIdOrThrow(): string {
    const companyId = this.tenantContext.getCompanyId();
    if (!companyId) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'Company ID is required',
      });
    }
    return companyId;
  }

  private async recordAudit(
    companyId: string,
    agentId: string,
    action: AgentAuditAction,
    beforeState: Record<string, unknown> | null,
    afterState: Record<string, unknown> | null,
    actorId?: string,
  ): Promise<void> {
    await this.auditRepo.save(
      this.auditRepo.create({
        companyId,
        userId: actorId ?? null,
        agentId,
        action,
        beforeState,
        afterState,
      }),
    );
  }

  async listSkillIdsForAgent(agentId: string, companyId: string): Promise<string[]> {
    const rows = await this.agentSkillsRepo.find({
      where: { agentId, companyId },
      select: ['skillId'],
    });
    return rows.map((r) => r.skillId);
  }

  private async emitSkillsChangedEvent(
    agentId: string,
    companyId: string,
    afterIds: string[],
    skills: SkillToolSnapshot[],
  ): Promise<void> {
    const event: AgentSkillsChangedEvent = {
      eventId: randomUUID(),
      eventType: 'agent.skills.changed',
      aggregateId: agentId,
      aggregateType: 'agent',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId,
      data: {
        companyId,
        agentId,
        skillIds: afterIds,
        skills,
        changedAt: new Date().toISOString(),
      },
    };
    await this.messagingService.publish(event, { routingKey: event.eventType, persistent: true });
    await this.cacheService.delete(this.agentDetailCacheKey(companyId, agentId));
  }

  /**
   * Trusted bootstrap: attach default global skills (e.g. after agent.created).
   */
  async bindDefaultSkillsForAgent(
    agentId: string,
    companyId: string,
    skillIds: string[],
  ): Promise<void> {
    if (skillIds.length === 0) return;
    const agent = await this.agentsRepo.findOne({ where: { id: agentId, companyId } });
    if (!agent) {
      return;
    }
    const before = { skillIds: await this.listSkillIdsForAgent(agentId, companyId) };
    for (const skillId of skillIds) {
      await this.skillsService.assertSkillUsableByTenant(skillId, companyId);
    }
    for (const skillId of skillIds) {
      const exists = await this.agentSkillsRepo.findOne({
        where: { agentId, skillId, companyId },
      });
      if (!exists) {
        await this.agentSkillsRepo.save(
          this.agentSkillsRepo.create({ agentId, skillId, companyId }),
        );
      }
    }
    const afterIds = await this.listSkillIdsForAgent(agentId, companyId);
    const revRows = await this.skillsService.findPublishedRevisionsBySkillIdsForTenant(afterIds, companyId);
    const skills = revRows.map(revisionToSnapshot);
    await this.recordAudit(
      companyId,
      agentId,
      'skills_bind',
      before,
      { skillIds: afterIds },
      undefined,
    );
    await this.emitSkillsChangedEvent(agentId, companyId, afterIds, skills);
  }

  async bindSkills(agentId: string, dto: BindAgentSkillsDto, actor: Actor): Promise<string[]> {
    const companyId = this.getCompanyIdOrThrow();
    await this.validator.assertCanManageAgents(companyId, actor);
    const agent = await this.agentsRepo.findOne({ where: { id: agentId, companyId } });
    if (!agent) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: 'Agent 不存在',
      });
    }
    const before = { skillIds: await this.listSkillIdsForAgent(agentId, companyId) };
    for (const skillId of dto.skillIds) {
      await this.skillsService.assertSkillUsableByTenant(skillId, companyId);
    }
    for (const skillId of dto.skillIds) {
      const exists = await this.agentSkillsRepo.findOne({
        where: { agentId, skillId, companyId },
      });
      if (!exists) {
        await this.agentSkillsRepo.save(
          this.agentSkillsRepo.create({ agentId, skillId, companyId }),
        );
      }
    }
    const afterIds = await this.listSkillIdsForAgent(agentId, companyId);
    const revRows = await this.skillsService.findPublishedRevisionsBySkillIdsForTenant(afterIds, companyId);
    const skills = revRows.map(revisionToSnapshot);
    await this.recordAudit(
      companyId,
      agentId,
      'skills_bind',
      before,
      { skillIds: afterIds },
      actor.id,
    );
    await this.emitSkillsChangedEvent(agentId, companyId, afterIds, skills);
    return afterIds;
  }

  async unbindSkills(agentId: string, dto: BindAgentSkillsDto, actor: Actor): Promise<string[]> {
    const companyId = this.getCompanyIdOrThrow();
    await this.validator.assertCanManageAgents(companyId, actor);
    const agent = await this.agentsRepo.findOne({ where: { id: agentId, companyId } });
    if (!agent) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: 'Agent 不存在',
      });
    }
    const before = { skillIds: await this.listSkillIdsForAgent(agentId, companyId) };
    await this.agentSkillsRepo.delete({
      agentId,
      companyId,
      skillId: In(dto.skillIds),
    });
    const afterIds = await this.listSkillIdsForAgent(agentId, companyId);
    const revRowsUnbind = await this.skillsService.findPublishedRevisionsBySkillIdsForTenant(afterIds, companyId);
    const skillsUnbind = revRowsUnbind.map(revisionToSnapshot);
    await this.recordAudit(
      companyId,
      agentId,
      'skills_unbind',
      before,
      { skillIds: afterIds },
      actor.id,
    );
    await this.emitSkillsChangedEvent(agentId, companyId, afterIds, skillsUnbind);
    return afterIds;
  }
}
