import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { MessagingService } from '@service/messaging';
import { TenantContextService } from '@service/tenant';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { CacheService } from '../../../common/cache/cache.service.js';
import { getOrgTreeVersionCacheKey } from '../../../common/organization/org-tree-cache-keys.js';
import { Agent } from '../entities/agent.entity.js';
import { AgentAuditLog } from '../entities/agent-audit-log.entity.js';
import { AgentValidatorService } from './agent-validator.service.js';

interface Actor {
  id: string;
  roles?: string[];
}

@Injectable()
export class AgentHierarchyService {
  constructor(
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(AgentAuditLog)
    private readonly auditRepo: Repository<AgentAuditLog>,
    private readonly validator: AgentValidatorService,
    private readonly tenantContext: TenantContextService,
    private readonly cacheService: CacheService,
    private readonly messaging: MessagingService,
  ) {}

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

  private async hasCycle(companyId: string, agentId: string, reportsToAgentId: string): Promise<boolean> {
    let cursor: string | null = reportsToAgentId;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor === agentId) return true;
      if (visited.has(cursor)) return true;
      visited.add(cursor);
      const row = await this.agentsRepo.findOne({
        where: { id: cursor, companyId },
        select: ['id', 'reportsToAgentId'],
      } as any);
      cursor = row?.reportsToAgentId ?? null;
    }
    return false;
  }

  async getSupervisor(agentId: string): Promise<{ agentId: string; reportsToAgentId: string | null; hierarchyVersion: number }> {
    const companyId = this.getCompanyIdOrThrow();
    const agent = await this.agentsRepo.findOne({ where: { id: agentId, companyId } });
    if (!agent) {
      throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Agent 不存在' });
    }
    return { agentId: agent.id, reportsToAgentId: agent.reportsToAgentId ?? null, hierarchyVersion: agent.hierarchyVersion };
  }

  async setSupervisor(
    agentId: string,
    reportsToAgentId: string | null,
    actor: Actor,
    reason = 'manual_update',
  ): Promise<{ success: true; hierarchyVersion: number }> {
    const companyId = this.getCompanyIdOrThrow();
    await this.validator.assertCanManageAgents(companyId, actor);

    const agent = await this.agentsRepo.findOne({ where: { id: agentId, companyId } });
    if (!agent) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: 'Agent 不存在',
      });
    }
    if (reportsToAgentId === agentId) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'reportsTo 不能指向自己',
      });
    }
    if (reportsToAgentId) {
      const supervisor = await this.agentsRepo.findOne({
        where: { id: reportsToAgentId, companyId },
      });
      if (!supervisor) {
        throw new NotFoundException({
          code: ErrorCode.RECORD_NOT_FOUND,
          message: '上级 Agent 不存在',
        });
      }
      if (await this.hasCycle(companyId, agentId, reportsToAgentId)) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: '汇报关系存在环，更新被拒绝',
        });
      }
    }

    const hierarchyVersion = Math.floor(Date.now() / 1000);
    const beforeState = {
      reportsToAgentId: agent.reportsToAgentId,
      hierarchyVersion: agent.hierarchyVersion,
    };
    await this.agentsRepo.update(
      { id: agentId, companyId },
      { reportsToAgentId, hierarchyVersion },
    );
    await this.auditRepo.save(
      this.auditRepo.create({
        companyId,
        userId: actor.id,
        agentId,
        action: 'update',
        beforeState,
        afterState: {
          reportsToAgentId,
          hierarchyVersion,
          reason,
        },
      }),
    );
    // 组织树/部门任务口径缓存失效（与组织结构变更一致）
    const versionKey = getOrgTreeVersionCacheKey(companyId);
    const existed = await this.cacheService.exists(versionKey);
    if (!existed) {
      await this.cacheService.set(versionKey, 2, 300 * 24);
    } else {
      await this.cacheService.increment(versionKey, 1);
      await this.cacheService.expire(versionKey, 300 * 24);
    }

    // 变更通知（供后续 UI/订阅者/审计分析）
    await this.messaging.publish(
      {
        eventId: randomUUID(),
        eventType: 'agent.hierarchy.changed',
        aggregateId: agentId,
        aggregateType: 'agent',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          companyId,
          agentId,
          reportsToAgentId,
          hierarchyVersion,
          reason,
          changedByUserId: actor.id,
          changedAt: new Date().toISOString(),
        },
      },
      { routingKey: 'agent.hierarchy.changed', persistent: true },
    );
    return { success: true, hierarchyVersion };
  }
}
