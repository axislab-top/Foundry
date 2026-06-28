import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { MarketplaceSkillVersionPublishedEvent } from '@contracts/events';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import { trace } from '@opentelemetry/api';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { TenantContextService } from '@service/tenant';
import { ConfigService } from '../../../common/config/config.service.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { CompanyCeoLayerConfig } from '../../companies/entities/company-ceo-layer-config.entity.js';
import { Skill } from '../../skills/entities/skill.entity.js';
import {
  isSkillBindingGatePending,
  SkillBindingValidatorService,
} from '../../skills/services/skill-binding-validator.service.js';
import { compareSemver } from '../../skills/utils/semver.util.js';

const CEO_LAYERS = ['strategy', 'orchestration', 'supervision'] as const;

interface Actor {
  id: string;
  roles?: string[];
}

@Injectable()
export class MarketplaceSkillVersionService {
  private static readonly TRACER_NAME = 'foundry-api-marketplace-skills';

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Skill)
    private readonly skillsRepo: Repository<Skill>,
    private readonly tenantContext: TenantContextService,
    private readonly skillBindingValidator: SkillBindingValidatorService,
    private readonly configService: ConfigService,
    private readonly messagingService: MessagingService,
  ) {}

  private workerActorId(): string {
    return process.env.FOUNDRY_WORKER_ACTOR_USER_ID?.trim() || '';
  }

  private isWorkerActor(actor: Actor): boolean {
    const wid = this.workerActorId();
    return !!wid && actor.id === wid;
  }

  private async assertCompanyAdmin(companyId: string, actor: Actor): Promise<void> {
    if (this.isWorkerActor(actor)) return;
    if (!actor?.id) {
      throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message: '缺少操作者' });
    }
    if (actor.roles?.includes('admin') || actor.roles?.includes('superadmin')) return;
    const rows = await this.dataSource.query<Array<{ ok: number }>>(
      `SELECT 1 AS ok FROM company_memberships
       WHERE company_id = $1 AND user_id = $2 AND is_active = true AND role IN ('owner','admin')
       LIMIT 1`,
      [companyId, actor.id],
    );
    if (!rows?.length) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅公司 Owner/Admin 可管理 Skill 版本升级',
      });
    }
  }

  /**
   * 商城更新 `recommended_skill_version_ids` 后：对**新增**钉版本行发事件，通知仍绑定旧版同名行的公司。
   */
  async emitAfterRecommendedVersionPinsChanged(params: {
    marketplaceAgentId: string;
    agentName: string;
    prevPins: string[] | null | undefined;
    nextPins: string[] | null | undefined;
  }): Promise<void> {
    const prev = [...new Set((params.prevPins ?? []).map((x) => String(x ?? '').trim()).filter(Boolean))];
    const next = [...new Set((params.nextPins ?? []).map((x) => String(x ?? '').trim()).filter(Boolean))];
    const added = next.filter((id) => !prev.includes(id));
    if (added.length === 0) return;

    const companyIds = await this.collectCompanyIdsBoundToOlderSiblings(added);
    const max = this.configService.getMarketplaceBindingNotifyMaxCompanies();
    const sliced = companyIds.slice(0, max);

    const evt: MarketplaceSkillVersionPublishedEvent = {
      eventId: randomUUID(),
      eventType: 'marketplace.skill_version.published',
      aggregateId: params.marketplaceAgentId,
      aggregateType: 'marketplace_agent',
      occurredAt: new Date().toISOString(),
      version: 1,
      data: {
        marketplaceAgentId: params.marketplaceAgentId,
        agentName: params.agentName,
        publishedSkillIds: added,
        updatedAt: new Date().toISOString(),
        companyIds: sliced,
      },
    };
    await this.messagingService.publish(evt, {
      routingKey: 'marketplace.skill_version.published',
      persistent: true,
    });
  }

  /**
   * Worker：对已绑定 **更旧 semver 同名行** 的公司，尝试升级到本次商城钉选的 pinIds（仅非高危目标且 `workerAutoSafeOnly`）。
   */
  async workerAutoSafeUpgradePins(
    companyId: string,
    actor: Actor,
    pinIds: string[],
  ): Promise<{ upgraded: number; skipped: number }> {
    if (!this.isWorkerActor(actor)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅 Worker 服务账号可触发自动安全升级',
      });
    }
    let upgraded = 0;
    let skipped = 0;
    const pins = [...new Set(pinIds.map((x) => String(x ?? '').trim()).filter(Boolean))];
    for (const toId of pins) {
      const toSkill = await this.skillsRepo.findOne({ where: { id: toId, companyId: IsNull() } });
      if (!toSkill) {
        skipped += 1;
        continue;
      }
      const siblings = await this.skillsRepo.find({
        where: { companyId: IsNull(), name: toSkill.name },
      });
      const older = siblings.filter(
        (s) =>
          s.id !== toId &&
          compareSemver(toSkill.semverVersion ?? '1.0.0', s.semverVersion ?? '1.0.0') > 0,
      );
      older.sort((a, b) =>
        compareSemver(b.semverVersion ?? '1.0.0', a.semverVersion ?? '1.0.0'),
      );
      let did = false;
      for (const from of older) {
        try {
          const r = await this.upgradeVersion({
            companyId,
            actor,
            fromSkillId: from.id,
            toSkillId: toId,
            workerAutoSafeOnly: true,
          });
          if (r.outcome === 'upgraded') {
            upgraded += 1;
            did = true;
            break;
          }
          if (r.outcome === 'skipped_high_risk') skipped += 1;
        } catch {
          skipped += 1;
        }
      }
      if (!did && older.length) skipped += 1;
    }
    return { upgraded, skipped };
  }

  async collectCompanyIdsBoundToOlderSiblings(publishedSkillIds: string[]): Promise<string[]> {
    const ids = [...new Set(publishedSkillIds.map((x) => String(x ?? '').trim()).filter(Boolean))];
    if (!ids.length) return [];

    const rows = await this.skillsRepo.find({
      where: { id: In(ids), companyId: IsNull() },
      select: ['id', 'name'],
    });
    const oldIdSet = new Set<string>();
    for (const r of rows) {
      const siblings = await this.skillsRepo.find({
        where: { companyId: IsNull(), name: r.name },
        select: ['id'],
      });
      for (const s of siblings) {
        if (!ids.includes(s.id)) oldIdSet.add(s.id);
      }
    }
    const oldIds = [...oldIdSet];
    if (!oldIds.length) return [];

    const orgCompanies = await this.dataSource.query<Array<{ company_id: string }>>(
      `SELECT DISTINCT company_id FROM organization_node_skills WHERE skill_id = ANY($1::uuid[])`,
      [oldIds],
    );
    const agentCompanies = await this.dataSource.query<Array<{ company_id: string }>>(
      `SELECT DISTINCT company_id FROM agent_skills WHERE skill_id = ANY($1::uuid[])`,
      [oldIds],
    );
    const fromCeo = await this.companiesWithSkillInCeoLayerConfig(oldIds);

    const set = new Set<string>();
    for (const r of orgCompanies) {
      const id = String(r.company_id ?? '').trim();
      if (id) set.add(id);
    }
    for (const r of agentCompanies) {
      const id = String(r.company_id ?? '').trim();
      if (id) set.add(id);
    }
    for (const id of fromCeo) set.add(id);
    return [...set];
  }

  private async companiesWithSkillInCeoLayerConfig(skillIds: string[]): Promise<string[]> {
    const out = new Set<string>();
    for (const sid of skillIds) {
      const needle = JSON.stringify([sid]);
      const rows = await this.dataSource.query<Array<{ company_id: string }>>(
        `SELECT company_id FROM company_ceo_layer_configs WHERE
          (ceo_layer_config->'strategy'->'skillIds')::jsonb @> $1::jsonb
          OR (ceo_layer_config->'orchestration'->'skillIds')::jsonb @> $1::jsonb
          OR (ceo_layer_config->'supervision'->'skillIds')::jsonb @> $1::jsonb`,
        [needle],
      );
      for (const r of rows) {
        const id = String(r.company_id ?? '').trim();
        if (id) out.add(id);
      }
    }
    return [...out];
  }

  private async assertCompanyUsesSkill(companyId: string, skillId: string): Promise<void> {
    const org = await this.dataSource.query<Array<{ c: number }>>(
      `SELECT 1 AS c FROM organization_node_skills WHERE company_id = $1 AND skill_id = $2 LIMIT 1`,
      [companyId, skillId],
    );
    if (org?.length) return;
    const ag = await this.dataSource.query<Array<{ c: number }>>(
      `SELECT 1 AS c FROM agent_skills WHERE company_id = $1 AND skill_id = $2 LIMIT 1`,
      [companyId, skillId],
    );
    if (ag?.length) return;
    const needle = JSON.stringify([skillId]);
    const ceo = await this.dataSource.query<Array<{ c: number }>>(
      `SELECT 1 AS c FROM company_ceo_layer_configs WHERE company_id = $1 AND (
          (ceo_layer_config->'strategy'->'skillIds')::jsonb @> $2::jsonb
          OR (ceo_layer_config->'orchestration'->'skillIds')::jsonb @> $2::jsonb
          OR (ceo_layer_config->'supervision'->'skillIds')::jsonb @> $2::jsonb
        ) LIMIT 1`,
      [companyId, needle],
    );
    if (ceo?.length) return;

    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message: '该公司未引用此 Skill 版本，无法升级替换',
    });
  }

  private replaceSkillIdInCeoConfig(cfg: Record<string, unknown>, from: string, to: string): Record<string, unknown> {
    const out: Record<string, unknown> = { ...cfg };
    for (const layer of CEO_LAYERS) {
      const raw = out[layer];
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const item = { ...(raw as Record<string, unknown>) };
      if (Array.isArray(item.skillIds)) {
        item.skillIds = (item.skillIds as unknown[]).map((x) => {
          const s = String(x ?? '').trim();
          return s === from ? to : s;
        });
      }
      out[layer] = item;
    }
    return out;
  }

  async listAvailableUpgrades(
    companyId: string,
    actor: Actor,
    skillName?: string,
  ): Promise<{
    items: Array<{
      skillName: string;
      currentSkillId: string;
      currentSemver: string;
      isCurrentLatest: boolean;
      versions: Array<{
        id: string;
        semverVersion: string;
        isLatest: boolean;
        changelog: string | null;
      }>;
    }>;
  }> {
    await this.assertCompanyAdmin(companyId, actor);
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      const bound = await this.skillBindingValidator.loadBoundSkillIds(companyId);
      const boundIds = [...bound];
      if (!boundIds.length) return { items: [] };

      const skills = await this.skillsRepo.find({
        where: { id: In(boundIds), companyId: IsNull() },
      });
      const nameFilter = skillName?.trim().toLowerCase();
      const byName = new Map<string, Skill[]>();
      for (const s of skills) {
        if (nameFilter && s.name.trim().toLowerCase() !== nameFilter) continue;
        const list = byName.get(s.name) ?? [];
        list.push(s);
        byName.set(s.name, list);
      }

      const items: Array<{
        skillName: string;
        currentSkillId: string;
        currentSemver: string;
        isCurrentLatest: boolean;
        versions: Array<{
          id: string;
          semverVersion: string;
          isLatest: boolean;
          changelog: string | null;
        }>;
      }> = [];

      for (const [nm, owned] of byName) {
        if (!owned.length) continue;
        const cur = owned[0]!;
        const versions = await this.skillsRepo.find({
          where: { companyId: IsNull(), name: nm },
        });
        versions.sort((a, b) => {
          const c = compareSemver(a.semverVersion ?? '1.0.0', b.semverVersion ?? '1.0.0');
          return c !== 0 ? c : String(a.id).localeCompare(String(b.id));
        });
        if (versions.length < 2) continue;
        items.push({
          skillName: nm,
          currentSkillId: cur.id,
          currentSemver: cur.semverVersion?.trim() ? cur.semverVersion.trim() : '1.0.0',
          isCurrentLatest: !!cur.isLatest,
          versions: versions.map((v) => ({
            id: v.id,
            semverVersion: v.semverVersion?.trim() ? v.semverVersion.trim() : '1.0.0',
            isLatest: !!v.isLatest,
            changelog: v.changelog ?? null,
          })),
        });
      }
      return { items };
    });
  }

  async upgradeVersion(params: {
    companyId: string;
    actor: Actor;
    fromSkillId: string;
    toSkillId: string;
    workerAutoSafeOnly?: boolean;
  }): Promise<
    | { outcome: 'upgraded' }
    | { outcome: 'pending_approval'; approvalRequestId: string; pendingSkillIds: string[]; message: string }
    | { outcome: 'skipped_high_risk' }
  > {
    const tracer = trace.getTracer(MarketplaceSkillVersionService.TRACER_NAME, '1.0.0');
    const span = tracer.startSpan('marketplace.skills.upgradeVersion');
    const companyId = params.companyId;
    span.setAttribute('foundry.company_id', companyId);
    span.setAttribute('foundry.skill_version', params.toSkillId);
    span.setAttribute('foundry.skill_version_from', params.fromSkillId);
    span.setAttribute('foundry.skill_version_to', params.toSkillId);

    try {
      await this.assertCompanyAdmin(companyId, params.actor);

      return await this.tenantContext.runWithCompanyId(companyId, async () => {
        const fromSkill = await this.skillsRepo.findOne({
          where: { id: params.fromSkillId, companyId: IsNull() },
        });
        const toSkill = await this.skillsRepo.findOne({
          where: { id: params.toSkillId, companyId: IsNull() },
        });
        if (!fromSkill || !toSkill) {
          throw new UnprocessableEntityException({
            code: ErrorCode.VALIDATION_ERROR,
            message: '仅支持平台全局 Skill 之间的版本替换',
          });
        }
        if (fromSkill.name !== toSkill.name) {
          throw new BadRequestException({
            code: ErrorCode.BAD_REQUEST,
            message: 'fromSkill 与 toSkill 必须同名',
          });
        }
        if (fromSkill.id === toSkill.id) {
          return { outcome: 'upgraded' };
        }
        if (compareSemver(toSkill.semverVersion ?? '1.0.0', fromSkill.semverVersion ?? '1.0.0') < 0) {
          throw new BadRequestException({
            code: ErrorCode.BAD_REQUEST,
            message: '不允许降级到更低 semver（如需回滚请单独走治理流程）',
          });
        }

        await this.assertCompanyUsesSkill(companyId, fromSkill.id);

        span.setAttribute('foundry.skill_version.semver', toSkill.semverVersion ?? '1.0.0');

        const gate = await this.skillBindingValidator.evaluateHighRiskSkillBindingApprovalGate({
          companyId,
          skillIds: [toSkill.id],
          actorId: params.actor.id,
          bindingSurface: 'version_upgrade',
          context: {
            fromSkillId: fromSkill.id,
            toSkillId: toSkill.id,
            skillName: fromSkill.name,
          },
          source: 'marketplace.skills.upgradeVersion',
          skipApprovalGate: false,
        });

        if (isSkillBindingGatePending(gate)) {
          if (params.workerAutoSafeOnly) {
            return { outcome: 'skipped_high_risk' };
          }
          return {
            outcome: 'pending_approval',
            approvalRequestId: gate.approvalRequestId,
            pendingSkillIds: gate.pendingSkillIds,
            message: gate.message,
          };
        }

        await this.dataSource.transaction(async (em) => {
          const from = fromSkill.id;
          const to = toSkill.id;
          const c = companyId;
          const ceoRepo = em.getRepository(CompanyCeoLayerConfig);

          await em.query(
            `DELETE FROM agent_skills a USING agent_skills b
             WHERE a.company_id = $1 AND b.company_id = $1 AND b.skill_id = $2
               AND a.agent_id = b.agent_id AND a.skill_id = $3`,
            [c, from, to],
          );
          await em.query(`UPDATE agent_skills SET skill_id = $3 WHERE company_id = $1 AND skill_id = $2`, [
            c,
            from,
            to,
          ]);

          await em.query(
            `DELETE FROM organization_node_skills a USING organization_node_skills b
             WHERE a.company_id = $1 AND b.company_id = $1 AND b.skill_id = $2
               AND a.organization_node_id = b.organization_node_id AND a.skill_id = $3`,
            [c, from, to],
          );
          await em.query(
            `UPDATE organization_node_skills SET skill_id = $3 WHERE company_id = $1 AND skill_id = $2`,
            [c, from, to],
          );

          const cfgRow = await ceoRepo.findOne({ where: { companyId: c } });
          if (cfgRow) {
            const nextCfg = this.replaceSkillIdInCeoConfig(
              (cfgRow.ceoLayerConfig ?? {}) as Record<string, unknown>,
              from,
              to,
            );
            cfgRow.ceoLayerConfig = nextCfg;
            await ceoRepo.save(cfgRow);
          }
        });

        await this.skillBindingValidator.invalidateCompanyBoundSkillsCache(companyId);
        return { outcome: 'upgraded' };
      });
    } finally {
      span.end();
    }
  }
}
