import { Injectable, InternalServerErrorException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { TenantContextService } from '@service/tenant';
import { CacheService } from '../../../common/cache/cache.service.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { ApprovalService } from '../../approval/services/approval.service.js';
import { OrganizationNode } from '../../organization/entities/organization-node.entity.js';
import { OrganizationNodeSkill } from '../../organization/entities/organization-node-skill.entity.js';
import { SkillAuditLog } from '../entities/skill-audit-log.entity.js';
import { Skill } from '../entities/skill.entity.js';
import { SkillRevision } from '../entities/skill-revision.entity.js';
import {
  effectiveSecurityProfileForBinding,
  skillBindingRequiresApproval,
} from '../utils/skill-binding-security-profile.util.js';
import { RoleDefaultGlobalSkillsService } from '../../platform-settings/role-default-global-skills.service.js';
import { User } from '../../users/entities/user.entity.js';

export interface SkillBindingValidationContext {
  operatorId?: string | null;
  source?: string;
}

/** P17：高危 Skill 绑定须先经 `ApprovalRequest`（`actionType: skill.binding`）。仅两种互斥形态。 */
export type SkillBindingApprovalGateResult =
  | { status: 'allowed' }
  | {
      status: 'pending_approval';
      approvalRequestId: string;
      pendingSkillIds: string[];
      message: string;
    };

const P17_PENDING_MESSAGE =
  '所选 Skill 含高危执行档位（network / shell / dangerous），已提交审批。通过后在审批中心完成后续绑定操作（或重新发起绑定）。';

export function isSkillBindingGatePending(
  r: SkillBindingApprovalGateResult,
): r is Extract<SkillBindingApprovalGateResult, { status: 'pending_approval' }> {
  return r.status === 'pending_approval';
}

/** Agent / 组织节点绑定 API 的统一返回（成功写入 vs 待审批）。 */
export type SkillBindingWriteResult =
  | { outcome: 'bound'; skillIds: string[] }
  | {
      outcome: 'pending_approval';
      approvalRequestId: string;
      pendingSkillIds: string[];
      message: string;
    };

/**
 * P13：公司级 Skill 绑定强校验 — 仅允许
 * - 公司已绑定在任意组织节点上的 Skill（organization_node_skills）
 * - 公司自有 Skill（skills.company_id = 当前租户）
 * - 平台全局 Skill 且 metadata.isGlobal === true（显式放行）
 *
 * 结果缓存：`company:{companyId}:bound_skills`，TTL 30s。
 * 所有 DB 访问均在 `runWithCompanyId(companyId)` 下执行以满足 RLS。
 */
@Injectable()
export class SkillBindingValidatorService {
  static readonly BOUND_SKILLS_CACHE_TTL_SEC = 30;

  constructor(
    @InjectRepository(Skill)
    private readonly skillsRepo: Repository<Skill>,
    @InjectRepository(SkillRevision)
    private readonly revisionsRepo: Repository<SkillRevision>,
    @InjectRepository(OrganizationNodeSkill)
    private readonly orgNodeSkillsRepo: Repository<OrganizationNodeSkill>,
    @InjectRepository(OrganizationNode)
    private readonly organizationNodesRepo: Repository<OrganizationNode>,
    @InjectRepository(SkillAuditLog)
    private readonly skillAuditRepo: Repository<SkillAuditLog>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly tenantContext: TenantContextService,
    private readonly cache: CacheService,
    private readonly approvalService: ApprovalService,
    private readonly roleDefaultGlobalSkills: RoleDefaultGlobalSkillsService,
  ) {}

  boundSkillsCacheKey(companyId: string): string {
    return `company:${companyId}:bound_skills`;
  }

  /** Worker/system actor 可能不在 `users` 表；审计 FK 要求存在或为 null。 */
  private async resolveChangedByUserId(actorId: string | null | undefined): Promise<string | null> {
    const id = typeof actorId === 'string' ? actorId.trim() : '';
    if (!id) return null;
    const exists = await this.usersRepo.exist({ where: { id } as any });
    return exists ? id : null;
  }

  async invalidateCompanyBoundSkillsCache(companyId: string): Promise<void> {
    await this.cache.delete(this.boundSkillsCacheKey(companyId));
  }

  /**
   * P17：对 **待绑定** 的 skillIds，若发布档位的 **`network` / `shell` / `dangerous`**（metadata 或内置名启发式）
   * 则创建 **`skill.binding`** 审批单并返回 **`pending_approval`**（不写 agent_skills / org_node_skills）。
   * `skipApprovalGate` 仅用于系统引导绑定（如默认技能 bootstrap）。
   */
  async evaluateHighRiskSkillBindingApprovalGate(params: {
    companyId: string;
    skillIds: string[];
    actorId: string | null;
    bindingSurface: 'agent' | 'org_node' | 'ceo_layer' | 'version_upgrade';
    context: Record<string, unknown>;
    source: string;
    skipApprovalGate?: boolean;
  }): Promise<SkillBindingApprovalGateResult> {
    if (params.skipApprovalGate) {
      return { status: 'allowed' };
    }
    const uniq = [...new Set(params.skillIds.map((x) => String(x ?? '').trim()).filter(Boolean))];
    if (uniq.length === 0) {
      return { status: 'allowed' };
    }

    return this.tenantContext.runWithCompanyId(
      params.companyId,
      async (): Promise<SkillBindingApprovalGateResult> => {
        const skills = await this.skillsRepo.find({
          where: { id: In(uniq) },
          select: ['id', 'name', 'securityProfile'],
        });
        const revMap = await this.loadLatestPublishedRevisionsMap(params.companyId, uniq);

        const pendingSkillIds: string[] = [];
        for (const sid of uniq) {
          const sk = skills.find((s) => s.id === sid);
          const rev = revMap.get(sid);
          const profile = effectiveSecurityProfileForBinding(
            rev ?? null,
            sk?.name ?? '',
            (sk as any)?.securityProfile ?? null,
          );
          if (skillBindingRequiresApproval(profile)) {
            pendingSkillIds.push(sid);
          }
        }
        if (pendingSkillIds.length === 0) {
          return { status: 'allowed' };
        }

        const isUpgrade = params.bindingSurface === 'version_upgrade';
        const created = await this.approvalService.create(params.companyId, {
          actionType: 'skill.binding',
          riskLevel: 'L3',
          context: {
            title: isUpgrade
              ? `高危 Skill 版本升级（${pendingSkillIds.length} 项）`
              : `高危 Skill 绑定（${pendingSkillIds.length} 项）`,
            summary: isUpgrade
              ? `待升级目标 Skill ID：${pendingSkillIds.join(
                  ', ',
                )}。审批通过后在管理端重新发起「一键升级」或由 Worker 完成安全自动升级。`
              : `待绑定 Skill ID：${pendingSkillIds.join(
                  ', ',
                )}。审批通过后请在租户端重新发起绑定（Agent / 组织节点 / CEO 同步）。`,
            companyId: params.companyId,
            targetSkillIds: pendingSkillIds,
            bindingSurface: params.bindingSurface,
            requestedBy: params.actorId,
            source: params.source,
            ...params.context,
          },
          createdBy: params.actorId,
        });

        const approvalRequestId = String(created?.id ?? '').trim();
        if (!approvalRequestId) {
          throw new InternalServerErrorException('ApprovalRequest persisted without id (skill.binding)');
        }

        const firstSkill = skills.find((s) => pendingSkillIds.includes(s.id));
        const changedByUserId = await this.resolveChangedByUserId(params.actorId);
        await this.skillAuditRepo.save(
          this.skillAuditRepo.create({
            companyId: params.companyId,
            skillId: pendingSkillIds[0] ?? null,
            skillName: firstSkill?.name?.trim() ? firstSkill.name.trim() : null,
            actionType: 'binding_request_created',
            changedByUserId,
            beforeState: {
              candidateSkillIds: uniq,
              bindingSurface: params.bindingSurface,
              source: params.source,
            },
            afterState: {
              approvalRequestId,
              pendingSkillIds,
              actionType: 'skill.binding',
            },
            scanResult: null,
            riskLevel: 'L3',
            reviewStatus: 'logged',
          }),
        );

        return SkillBindingValidatorService.pendingGateResult({
          approvalRequestId,
          pendingSkillIds,
        });
      },
    );
  }

  /** 唯一构造 `pending_approval` 形态，避免散落对象字面量导致字段漂移。 */
  private static pendingGateResult(params: {
    approvalRequestId: string;
    pendingSkillIds: string[];
    message?: string;
  }): Extract<SkillBindingApprovalGateResult, { status: 'pending_approval' }> {
    return {
      status: 'pending_approval',
      approvalRequestId: params.approvalRequestId,
      pendingSkillIds: params.pendingSkillIds,
      message: params.message?.trim() ? params.message.trim() : P17_PENDING_MESSAGE,
    };
  }

  private async loadLatestPublishedRevisionsMap(
    companyId: string,
    skillIds: string[],
  ): Promise<Map<string, SkillRevision>> {
    const rows = await this.revisionsRepo
      .createQueryBuilder('r')
      .where('r.skill_id IN (:...skillIds)', { skillIds })
      .andWhere('r.status = :st', { st: 'published' })
      .andWhere('r.review_status = :rv', { rv: 'approved' })
      .andWhere('(r.company_id IS NULL OR r.company_id = :companyId)', { companyId })
      .orderBy('r.skill_id', 'ASC')
      .addOrderBy('r.version', 'DESC')
      .getMany();
    const m = new Map<string, SkillRevision>();
    for (const r of rows) {
      if (!m.has(r.skillId)) {
        m.set(r.skillId, r);
      }
    }
    return m;
  }

  /**
   * 返回当前租户下「允许出现在 Agent / CEO 配置中的」Skill ID 集合（含缓存）。
   */
  async loadBoundSkillIds(companyId: string): Promise<Set<string>> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      const key = this.boundSkillsCacheKey(companyId);
      const cached = await this.cache.get<string>(key);
      if (cached) {
        try {
          const arr = JSON.parse(cached) as string[];
          return new Set(arr);
        } catch {
          /* fall through */
        }
      }

      const orgRows = await this.orgNodeSkillsRepo
        .createQueryBuilder('ons')
        .select('DISTINCT ons.skill_id', 'skillId')
        .where('ons.company_id = :companyId', { companyId })
        .getRawMany();
      const fromOrg = orgRows
        .map((r) => String((r as { skillId?: string }).skillId ?? '').trim())
        .filter(Boolean);

      const companyOwned = await this.skillsRepo.find({
        where: { companyId },
        select: ['id'],
      });
      const fromCompany = companyOwned.map((s) => s.id);

      const globalExempt = await this.skillsRepo
        .createQueryBuilder('s')
        .select('s.id', 'id')
        .where('s.company_id IS NULL')
        .andWhere(`(s.metadata::jsonb ->> 'isGlobal') = 'true'`)
        .getRawMany();
      const fromGlobal = globalExempt
        .map((r) => String((r as { id?: string }).id ?? '').trim())
        .filter(Boolean);

      const set = new Set<string>([...fromOrg, ...fromCompany, ...fromGlobal]);
      await this.cache.set(key, JSON.stringify([...set]), SkillBindingValidatorService.BOUND_SKILLS_CACHE_TTL_SEC);
      return set;
    });
  }

  /**
   * 运行时二次防护：过滤掉未绑定/未放行的 skillId，不抛错。
   */
  async filterSkillIdsToCompanyCatalog(companyId: string, skillIds: string[]): Promise<string[]> {
    const uniq = [...new Set(skillIds.map((x) => String(x ?? '').trim()).filter(Boolean))];
    if (!uniq.length) return [];
    const bound = await this.loadBoundSkillIds(companyId);
    return uniq.filter((id) => bound.has(id));
  }

  /**
   * 组织节点绑定入口：仅校验 Skill 对租户可见且非「他司私有」；
   * 不要求已出现在 organization_node_skills（否则无法首次挂载）。
   */
  async validateSkillsAssignableToOrgNode(
    companyId: string,
    skillIds: string[],
    context?: SkillBindingValidationContext,
  ): Promise<void> {
    const uniq = [...new Set(skillIds.map((x) => String(x ?? '').trim()).filter(Boolean))];
    if (uniq.length === 0) return;
    await this.tenantContext.runWithCompanyId(companyId, async () => {
      for (const id of uniq) {
        const row = await this.skillsRepo.findOne({ where: { id } });
        if (!row) {
          throw new UnprocessableEntityException({
            code: ErrorCode.VALIDATION_ERROR,
            message: `Skill '${id}' does not exist or is not visible for this tenant.`,
          });
        }
        if (row.companyId != null && row.companyId !== companyId) {
          throw new UnprocessableEntityException({
            code: ErrorCode.VALIDATION_ERROR,
            message: `Skill '${row.name}' cannot be bound: it belongs to another company.`,
          });
        }
      }
    });
  }

  /**
   * 将 **平台全局**（`skills.company_id IS NULL`）的 skillId 挂到公司 Board 的 `organization_node_skills`，
   * 以满足 P13 `validateSkillsBelongToCompany`；并尽力 `metadata.isGlobal=true`。
   */
  async mountPlatformGlobalSkillsOnBoard(
    companyId: string,
    skillIds: string[],
  ): Promise<{ insertedOrgBindings: number; isGlobalToggled: number }> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      const uniq = [...new Set(skillIds.map((x) => String(x ?? '').trim()).filter(Boolean))];
      if (!uniq.length) {
        await this.invalidateCompanyBoundSkillsCache(companyId);
        return { insertedOrgBindings: 0, isGlobalToggled: 0 };
      }

      const rows = await this.skillsRepo.find({
        where: { id: In(uniq) },
        select: ['id', 'name', 'companyId'],
      });
      const eligible = rows.filter((r) => r.companyId == null);
      if (!eligible.length) {
        await this.invalidateCompanyBoundSkillsCache(companyId);
        return { insertedOrgBindings: 0, isGlobalToggled: 0 };
      }

      const board = await this.organizationNodesRepo.findOne({
        where: { companyId, type: 'board', parentId: IsNull() } as any,
        order: { order: 'ASC' } as any,
      });
      if (!board?.id) {
        await this.invalidateCompanyBoundSkillsCache(companyId);
        return { insertedOrgBindings: 0, isGlobalToggled: 0 };
      }

      const ids = eligible.map((r) => r.id);
      const insertedRows = await this.orgNodeSkillsRepo.manager.query(
        `
        INSERT INTO organization_node_skills (organization_node_id, skill_id, company_id, created_at)
        SELECT $1::uuid, x, $2::uuid, NOW()
        FROM unnest($3::uuid[]) AS x
        ON CONFLICT (organization_node_id, skill_id) DO NOTHING
        RETURNING skill_id
        `,
        [board.id, companyId, ids],
      );
      const insertedOrgBindings = Array.isArray(insertedRows) ? insertedRows.length : 0;

      const nameList = eligible.map((r) => String(r.name ?? '').trim()).filter(Boolean);
      const upd = (await this.skillsRepo.manager.query(
        `
        UPDATE skills
        SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{isGlobal}', 'true'::jsonb, true)
        WHERE company_id IS NULL
          AND id = ANY($1::uuid[])
          AND name = ANY($2::text[])
        `,
        [ids, nameList],
      )) as { rowCount?: number } | unknown;
      const isGlobalToggled =
        typeof upd === 'object' && upd !== null && 'rowCount' in upd
          ? Number((upd as { rowCount: number }).rowCount)
          : 0;

      await this.invalidateCompanyBoundSkillsCache(companyId);
      return { insertedOrgBindings, isGlobalToggled };
    });
  }

  /**
   * 历史路径：按平台「默认全局技能名」白名单将缺失的公司级挂载补齐到 Board。
   * 白名单 = ceo + director + executor 三角色默认技能名并集（与 {@link BootstrapSkillCatalogService} 对齐）。
   * 新引导代码优先走 {@link BootstrapSkillCatalogService.ensureCompanyCatalogThenBindToAgent}。
   */
  async allowGlobalSkillsWhenMissingInCompany(
    companyId: string,
    skillIds: string[],
  ): Promise<{ insertedOrgBindings: number; isGlobalToggled: number }> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      const roles = ['ceo', 'director', 'executor'] as const;
      const nameLists = await Promise.all(
        roles.map((r) => this.roleDefaultGlobalSkills.getEffectiveRoleDefaultGlobalSkillNames(r)),
      );
      const allowedNames = new Set(nameLists.flat().map((n) => String(n ?? '').trim()).filter(Boolean));
      const uniq = [...new Set(skillIds.map((x) => String(x ?? '').trim()).filter(Boolean))];
      if (!uniq.length) {
        await this.invalidateCompanyBoundSkillsCache(companyId);
        return { insertedOrgBindings: 0, isGlobalToggled: 0 };
      }
      const rows = await this.skillsRepo.find({
        where: { id: In(uniq) },
        select: ['id', 'name', 'companyId'],
      });
      const filteredIds = rows
        .filter((r) => r.companyId == null && typeof r.name === 'string' && allowedNames.has(r.name))
        .map((r) => r.id);
      return this.mountPlatformGlobalSkillsOnBoard(companyId, filteredIds);
    });
  }

  async validateSkillsBelongToCompany(
    companyId: string,
    skillIds: string[],
    context?: SkillBindingValidationContext,
  ): Promise<void> {
    const uniq = [...new Set(skillIds.map((x) => String(x ?? '').trim()).filter(Boolean))];
    if (uniq.length === 0) return;

    const bound = await this.loadBoundSkillIds(companyId);
    const invalid = uniq.filter((id) => !bound.has(id));
    if (invalid.length === 0) return;

    const { displayName, firstId } = await this.tenantContext.runWithCompanyId(companyId, async () => {
      const rows = await this.skillsRepo.find({
        where: { id: In(invalid) },
        select: ['id', 'name'],
      });
      const byId = new Map(rows.map((s) => [s.id, s.name]));
      const fid = invalid[0]!;
      const nm = byId.get(fid);
      return { displayName: nm && nm.trim() ? nm.trim() : fid, firstId: fid };
    });

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      const changedByUserId = await this.resolveChangedByUserId(context?.operatorId);
      await this.skillAuditRepo.save(
        this.skillAuditRepo.create({
          companyId,
          skillId: firstId,
          skillName: displayName !== firstId ? displayName : null,
          actionType: 'binding_validation_denied',
          changedByUserId,
          beforeState: {
            skillIds: uniq,
            source: context?.source ?? 'validateSkillsBelongToCompany',
          },
          afterState: { invalidSkillIds: invalid },
          scanResult: null,
          riskLevel: 'L2',
          reviewStatus: 'logged',
        }),
      );
    });

    throw new UnprocessableEntityException({
      code: ErrorCode.VALIDATION_ERROR,
      message: `Skill '${displayName}' is not bound to this company. Please bind it at company level first.`,
      invalidSkillIds: invalid,
    });
  }
}
