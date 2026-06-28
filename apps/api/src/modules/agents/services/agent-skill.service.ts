import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import { TenantContextService } from '@service/tenant';
import type { AgentSkillsChangedEvent, SkillToolSnapshot } from '@contracts/events';
import type { McpToolDefinition } from '@foundry/contracts/types/mcp.protocol';
import { collectBoundMcpToolsFromSnapshots, ToolRegistry } from '@service/ai';
import { CacheService } from '../../../common/cache/cache.service.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { SkillsService } from '../../skills/services/skills.service.js';
import { ApprovalService } from '../../approval/services/approval.service.js';
import {
  isSkillBindingGatePending,
  SkillBindingValidatorService,
  type SkillBindingWriteResult,
} from '../../skills/services/skill-binding-validator.service.js';
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
    private readonly skillBindingValidator: SkillBindingValidatorService,
    private readonly validator: AgentValidatorService,
    private readonly messagingService: MessagingService,
    private readonly cacheService: CacheService,
    private readonly toolRegistry: ToolRegistry,
    private readonly approvals: ApprovalService,
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

  private async buildSnapshotsForAgentEvent(
    companyId: string,
    skillIds: string[],
  ): Promise<SkillToolSnapshot[]> {
    return this.skillsService.buildAgentSkillSnapshotsForTenant(companyId, skillIds);
  }

  private highestSecurityProfileFromSnapshots(snapshots: SkillToolSnapshot[]): string {
    const rank = (p: string) =>
      p === 'dangerous' ? 5 : p === 'shell' ? 4 : p === 'network' ? 3 : p === 'fs-write' ? 2 : 1;
    let securityProfile: string | null = null;
    for (const snap of snapshots) {
      const sp = String((snap as { securityProfile?: string }).securityProfile ?? 'safe').trim() || 'safe';
      if (!securityProfile || rank(sp) > rank(securityProfile)) {
        securityProfile = sp;
      }
    }
    return securityProfile ?? 'safe';
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
   * 将 MCP tools 绑定到运行时 ToolRegistry（Agent 隔离）。
   *
   * 约束：
   * - 仅注册当前 Agent 自己的工具集合；
   * - 后续执行侧必须使用 `ToolRegistry.assertMcpToolBound` 做硬失败保护。
   *
   * @param companyId 公司 ID
   * @param agentId Agent ID
   * @param tools MCP 工具定义数组（空数组表示清空绑定）
   * @param layer CEO 层级（可选：classifier/light/heavy）
   */
  async registerMcpToolsForAgent(params: {
    companyId: string;
    agentId: string;
    tools: McpToolDefinition[];
    layer?: string | null;
  }): Promise<void> {
    await this.toolRegistry.registerMcpTools({
      protocol: 'MCP-v1',
      companyId: params.companyId,
      agentId: params.agentId,
      layer: params.layer ?? null,
      tools: Array.isArray(params.tools) ? params.tools : [],
      securityProfile: 'safe',
      source: 'agent_skill_service_register',
      registeredAt: new Date().toISOString(),
    });
  }

  /**
   * Trusted bootstrap: attach default global skills (e.g. after agent.created).
   */
  async bindDefaultSkillsForAgent(
    agentId: string,
    companyId: string,
    skillIds: string[],
    source = 'default_bootstrap',
  ): Promise<void> {
    if (skillIds.length === 0) return;
    const agent = await this.agentsRepo.findOne({ where: { id: agentId, companyId } });
    if (!agent) {
      return;
    }
    const before = { skillIds: await this.listSkillIdsForAgent(agentId, companyId) };
    await this.skillBindingValidator.validateSkillsBelongToCompany(companyId, skillIds, {
      operatorId: undefined,
      source:
        source === 'bootstrap_role_default'
          ? 'agent.attachBootstrapSkillsToAgent'
          : 'agent.bindDefaultSkillsForAgent',
    });
    for (const skillId of skillIds) {
      const exists = await this.agentSkillsRepo.findOne({
        where: { agentId, skillId, companyId },
      });
      if (!exists) {
        await this.agentSkillsRepo.save(
          this.agentSkillsRepo.create({
            agentId,
            skillId,
            companyId,
            source,
            isTemporary: false,
            expiresAt: null,
          }),
        );
      }
    }
    const afterIds = await this.listSkillIdsForAgent(agentId, companyId);
    const skills = await this.buildSnapshotsForAgentEvent(companyId, afterIds);
    await this.registerMcpToolsFromSkills(companyId, agentId, afterIds, null);
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

  // DIFF: New helper: bind skills + optional explicit MCP tool allowlist (names).
  async bindSkillsWithMcp(
    agentId: string,
    dto: BindAgentSkillsDto & { mcpToolNames?: string[] },
    actor: Actor,
  ): Promise<SkillBindingWriteResult> {
    const res = await this.bindSkills(agentId, dto, actor);
    if (res.outcome !== 'bound') return res;
    const companyId = this.getCompanyIdOrThrow();
    const names =
      Array.isArray(dto.mcpToolNames) && dto.mcpToolNames.length
        ? [...new Set(dto.mcpToolNames.map((x) => String(x ?? '').trim()).filter(Boolean))].slice(0, 50)
        : null;
    // If a tool allowlist is provided, only register these names from skill payloads.
    await this.registerMcpToolsFromSkills(companyId, agentId, res.skillIds, null, names ?? undefined);
    return res;
  }

  // DIFF: New method - bulk read skills → register MCP tools per agent (optional layer).
  async registerMcpToolsFromSkills(
    companyId: string,
    agentId: string,
    skillIds: string[],
    layer?: string | null,
    toolNameAllowlist?: string[],
  ): Promise<void> {
    const uniq = [...new Set((skillIds ?? []).map((x) => String(x ?? '').trim()).filter(Boolean))];
    const snapshots = await this.buildSnapshotsForAgentEvent(companyId, uniq);
    const allow = Array.isArray(toolNameAllowlist) && toolNameAllowlist.length
      ? new Set(toolNameAllowlist.map((x) => String(x ?? '').trim()).filter(Boolean))
      : null;

    let deduped = collectBoundMcpToolsFromSnapshots(snapshots);
    if (allow) {
      deduped = deduped.filter((t) => allow.has(t.name));
    }

    const securityProfile = this.highestSecurityProfileFromSnapshots(snapshots);
    await this.toolRegistry.registerMcpTools({
      protocol: 'MCP-v1',
      companyId,
      agentId,
      layer: layer ?? null,
      tools: deduped,
      securityProfile,
      source: 'agent_skill_service.registerMcpToolsFromSkills',
      registeredAt: new Date().toISOString(),
    });

    await this.messagingService.publish(
      {
        eventId: randomUUID(),
        eventType: 'agent.mcp-tools.changed',
        aggregateId: agentId,
        aggregateType: 'agent',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          companyId,
          agentId,
          layer: layer ?? null,
          tools: deduped,
          securityProfile: securityProfile ?? 'safe',
          changedAt: new Date().toISOString(),
        },
      } as any,
      { routingKey: 'agent.mcp-tools.changed', persistent: true },
    );
  }

  /**
   * 强制刷新 Agent 的 MCP bindings（layer = null）。
   * 直接依据当前 skill bindings 重建 ToolRegistry 内存态与运行时事件。
   */
  async refreshMcpBindingsForAgent(companyId: string, agentId: string): Promise<void> {
    const ids = await this.listSkillIdsForAgent(agentId, companyId);
    await this.registerMcpToolsFromSkills(companyId, agentId, ids, null);
  }

  private async resolveBindingVersionLock(
    companyId: string,
    skillIds: string[],
    lock?: { version?: number; semverVersion?: string },
  ): Promise<{ version: number | null; semverVersion: string | null }> {
    const version = typeof lock?.version === 'number' ? lock.version : null;
    const semver = lock?.semverVersion?.trim() ? lock.semverVersion.trim() : null;
    if (version == null && !semver) return { version: null, semverVersion: null };
    const uniq = [...new Set(skillIds.map((x) => String(x ?? '').trim()).filter(Boolean))];
    if (!uniq.length) return { version: null, semverVersion: null };
    if (version != null && version < 1) {
      throw new BadRequestException('version must be >= 1');
    }
    const published = await this.skillsService.findPublishedRevisionsBySkillIdsForTenant(uniq, companyId);
    for (const sid of uniq) {
      if (version != null) {
        const hit = published.find((r) => r.skillId === sid && r.version === version);
        if (!hit) {
          throw new BadRequestException(`Skill '${sid}' does not have published revision version=${version}`);
        }
      }
      if (semver) {
        const sk = await this.skillsService.assertSkillUsableByTenant(sid, companyId);
        const skillSemver = String((sk as any).semverVersion ?? '').trim();
        if (skillSemver && skillSemver !== semver) {
          throw new BadRequestException(
            `Skill '${sid}' semverVersion mismatch: expected '${semver}', actual '${skillSemver}'`,
          );
        }
      }
    }
    return { version, semverVersion: semver };
  }

  async bindSkills(agentId: string, dto: BindAgentSkillsDto, actor: Actor): Promise<SkillBindingWriteResult> {
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
    await this.skillBindingValidator.validateSkillsBelongToCompany(companyId, dto.skillIds, {
      operatorId: actor.id,
      source: 'agents.bindSkills',
    });
    const existing = new Set(before.skillIds);
    const newlyAdded = dto.skillIds.filter((id) => !existing.has(id));
    if (newlyAdded.length > 0) {
      const gate = await this.skillBindingValidator.evaluateHighRiskSkillBindingApprovalGate({
        companyId,
        skillIds: newlyAdded,
        actorId: actor.id,
        bindingSurface: 'agent',
        context: { agentId, version: dto.version ?? null, semverVersion: dto.semverVersion ?? null },
        source: 'agents.bindSkills',
      });
      if (isSkillBindingGatePending(gate)) {
        return {
          outcome: 'pending_approval',
          approvalRequestId: gate.approvalRequestId,
          pendingSkillIds: gate.pendingSkillIds,
          message: gate.message,
        };
      }
    }
    const isTemporary = Boolean(dto.isTemporary);
    const source = dto.source?.trim() ? dto.source.trim().slice(0, 120) : null;
    const lock = await this.resolveBindingVersionLock(companyId, dto.skillIds, {
      version: dto.version,
      semverVersion: dto.semverVersion,
    });
    const expiresAt =
      dto.expiresAt && isTemporary ? new Date(dto.expiresAt) : null;
    const safeExpiresAt = expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null;

    /**
     * TypeORM：`repository.createQueryBuilder().insert().into('agent_skills')` 会通过表名匹配到
     * {@link AgentSkill} 元数据（`DataSource.findMetadata`）。此时 `.values()` 的键必须是**实体属性名**
     *（`agentId`、`skillId`…），否则 `getInsertedColumns()` + `column.getEntityValue(valueSet)` 全为
     * `undefined`，PostgreSQL 收到 `NULL` 写入 `agent_id` / `skill_id`，触发 not-null 约束。
     * `ON CONFLICT` 子句仍使用数据库列名（`agent_id`、`skill_id` 等）。
     */
    await this.agentSkillsRepo
      .createQueryBuilder()
      .insert()
      .into(AgentSkill)
      .values(
        dto.skillIds.map((skillId) => ({
          agentId,
          skillId,
          companyId,
          source,
          isTemporary,
          expiresAt: safeExpiresAt,
          version: lock.version,
          semverVersion: lock.semverVersion,
        })),
      )
      .orUpdate(['source', 'is_temporary', 'expires_at', 'version', 'semver_version'], ['agent_id', 'skill_id'])
      .execute();
    const afterIds = await this.listSkillIdsForAgent(agentId, companyId);
    const skills = await this.buildSnapshotsForAgentEvent(companyId, afterIds);
    await this.registerMcpToolsFromSkills(companyId, agentId, afterIds, null);
    await this.recordAudit(
      companyId,
      agentId,
      'skills_bind',
      before,
      { skillIds: afterIds },
      actor.id,
    );
    await this.emitSkillsChangedEvent(agentId, companyId, afterIds, skills);
    return { outcome: 'bound', skillIds: afterIds };
  }

  /**
   * P1.2: Complete a previously gated high-risk binding after human approval.
   *
   * - Reads ApprovalRequest(actionType=skill.binding) context:
   *   - bindingSurface (must be 'agent' for now)
   *   - agentId
   *   - targetSkillIds (pendingSkillIds)
   * - Applies binding and refreshes MCP tools + events.
   */
  async completeHighRiskBinding(companyId: string, approvalRequestId: string): Promise<{ ok: true; boundSkillIds: string[] }> {
    const cid = String(companyId ?? '').trim();
    const aid = String(approvalRequestId ?? '').trim();
    if (!cid) throw new BadRequestException('companyId is required');
    if (!aid) throw new BadRequestException('approvalRequestId is required');

    const req = await this.approvals.findOne(cid, aid);
    if (!req) throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'ApprovalRequest 不存在' });
    if (req.actionType !== 'skill.binding') {
      throw new BadRequestException('approvalRequest.actionType mismatch (expected skill.binding)');
    }
    if (req.status !== 'approved') {
      throw new BadRequestException(`approvalRequest is not approved: ${req.status}`);
    }
    const ctx = (req.context ?? {}) as Record<string, unknown>;
    const surface = String(ctx.bindingSurface ?? '').trim();
    if (surface && surface !== 'agent') {
      // For now, only agent binding is auto-completed here.
      return { ok: true, boundSkillIds: [] };
    }
    const agentId = String(ctx.agentId ?? '').trim();
    if (!agentId) {
      throw new BadRequestException('approvalRequest.context.agentId is required');
    }
    const targetSkillIds = Array.isArray(ctx.targetSkillIds)
      ? (ctx.targetSkillIds as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean)
      : [];
    if (targetSkillIds.length === 0) {
      return { ok: true, boundSkillIds: [] };
    }
    const lock = await this.resolveBindingVersionLock(cid, targetSkillIds, {
      version: typeof ctx.version === 'number' ? (ctx.version as number) : undefined,
      semverVersion: typeof ctx.semverVersion === 'string' ? (ctx.semverVersion as string) : undefined,
    });

    // Ensure these skills are valid for tenant catalog (P13).
    await this.skillBindingValidator.validateSkillsBelongToCompany(cid, targetSkillIds, {
      operatorId: req.resolvedBy ?? null,
      source: 'agents.completeHighRiskBinding',
    });

    const before = { skillIds: await this.listSkillIdsForAgent(agentId, cid) };

    // Persist bindings (idempotent upsert). 值对象须与 {@link AgentSkill} 属性名一致（见 bindSkills 注释）。
    await this.agentSkillsRepo
      .createQueryBuilder()
      .insert()
      .into(AgentSkill)
      .values(
        targetSkillIds.map((skillId) => ({
          agentId,
          skillId,
          companyId: cid,
          source: 'approval_complete_skill_binding',
          isTemporary: false,
          expiresAt: null,
          version: lock.version,
          semverVersion: lock.semverVersion,
        })),
      )
      .orUpdate(['source', 'is_temporary', 'expires_at', 'version', 'semver_version'], ['agent_id', 'skill_id'])
      .execute();

    const afterIds = await this.listSkillIdsForAgent(agentId, cid);
    const skills = await this.buildSnapshotsForAgentEvent(cid, afterIds);
    await this.registerMcpToolsFromSkills(cid, agentId, afterIds, null);
    await this.recordAudit(cid, agentId, 'skills_bind', before, { skillIds: afterIds }, req.resolvedBy ?? undefined);
    await this.emitSkillsChangedEvent(agentId, cid, afterIds, skills);
    return { ok: true, boundSkillIds: afterIds };
  }

  async gcExpiredTemporaryBindings(companyId: string, actor: Actor): Promise<{ deleted: number }> {
    await this.validator.assertCanManageAgents(companyId, actor);
    const now = new Date();
    const res = await this.agentSkillsRepo
      .createQueryBuilder()
      .delete()
      .from('agent_skills')
      .where('company_id = :companyId', { companyId })
      .andWhere('is_temporary = true')
      .andWhere('expires_at IS NOT NULL')
      .andWhere('expires_at < :now', { now })
      .execute();
    return { deleted: res.affected ?? 0 };
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
    const skillsUnbind = await this.buildSnapshotsForAgentEvent(companyId, afterIds);
    await this.registerMcpToolsFromSkills(companyId, agentId, afterIds, null);
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
