import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, In, Repository, SelectQueryBuilder } from 'typeorm';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import {
  SQL_SET_LOCAL_CURRENT_TENANT,
  SQL_SET_LOCAL_MEMBERSHIP_LISTING_USER,
  TenantContextService,
} from '@service/tenant';
import type {
  BaseEvent,
  CompanyCreatedEvent,
  CompanyStatusChangedEvent,
  CompanyUpdatedEvent,
} from '@contracts/events';
import { normalizeCeoLayerConfig } from '@foundry/skills';
import { CacheService } from '../../common/cache/cache.service.js';
import { ErrorCode } from '../../common/exceptions/error-codes.js';
import { OrganizationInitializerService } from '../organization/services/organization-initializer.service.js';
import { Agent } from '../agents/entities/agent.entity.js';
import { MarketplaceAgent } from '../templates/entities/marketplace-agent.entity.js';
import { Company } from './entities/company.entity.js';
import {
  CompanyHeartbeatConfig,
  type CompanyHeartbeatFrequency,
} from './entities/company-heartbeat-config.entity.js';
import { CompanyMembership } from './entities/company-membership.entity.js';
import type { DepartmentPlacementDto } from './dto/department-placement.dto.js';
import { CreateCompanyDto } from './dto/create-company.dto.js';
import { QueryCompanyDto } from './dto/query-company.dto.js';
import { UpdateCompanyDto } from './dto/update-company.dto.js';
import { UpdateCompanyStatusDto } from './dto/update-company-status.dto.js';
import { UpdateCompanyHeartbeatConfigDto } from './dto/update-company-heartbeat-config.dto.js';
import { UpdateCompanyCeoDecisionConfigDto } from './dto/update-company-ceo-decision-config.dto.js';
import { UpdateCompanyCeoGovernancePolicyDto } from './dto/update-company-ceo-governance-policy.dto.js';
import { SkillRuntimeResolverService } from './services/skill-runtime-resolver.service.js';
import { CeoLayerConfigService, mergePlatformContextPolicyFallback } from './services/ceo-layer-config.service.js';
import {
  CompanyRuntimePreferenceService,
  type CeoGovernancePolicyV1,
} from './services/company-runtime-preference.service.js';
import { ApprovalService } from '../approval/services/approval.service.js';
import { PolicyAuditService } from '../approval/services/policy-audit.service.js';
import { CollaborationBootstrapService } from '../collaboration/services/collaboration-bootstrap.service.js';
import { LlmKeysService } from '../llm-keys/llm-keys.service.js';
import { sanitizeCeoLayerConfigLlmKeyIds } from '../../common/utils/ceo-layer-llm-key-sanitizer.util.js';
import { CompanyCreationQuotaService } from './services/company-creation-quota.service.js';

interface Actor {
  id: string;
  roles?: string[];
}

export interface CompanySnapshotRecord {
  id: string;
  companyId: string;
  version: string;
  snapshot: Record<string, unknown>;
  createdAt: string;
}

export interface CompanyCeoDecisionConfig {
  ceoDecisionModel: string | null;
  ceoDecisionLlmKeyId: string | null;
}

export interface CompanyCeoLayerConfigResponse {
  templateConfig: Record<string, unknown>;
  companyConfig: Record<string, unknown>;
}

export interface CompanyCeoGovernancePolicyUpdateResult {
  applied: boolean;
  pendingApproval: boolean;
  approvalRequestId: string | null;
  policy: CeoGovernancePolicyV1 | null;
}

export interface CeoGovernancePolicyTemplate {
  id: string;
  label: string;
  description: string;
  policyPatch: Record<string, unknown>;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);
  private readonly CACHE_TTL = 3600;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Company) private readonly companiesRepo: Repository<Company>,
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepo: Repository<CompanyMembership>,
    @InjectRepository(CompanyHeartbeatConfig)
    private readonly heartbeatConfigRepo: Repository<CompanyHeartbeatConfig>,
    @InjectRepository(MarketplaceAgent)
    private readonly marketplaceAgentsRepo: Repository<MarketplaceAgent>,
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    private readonly cacheService: CacheService,
    private readonly messagingService: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly organizationInitializer: OrganizationInitializerService,
    private readonly skillRuntimeResolver: SkillRuntimeResolverService,
    private readonly ceoLayerConfigService: CeoLayerConfigService,
    private readonly runtimePreference: CompanyRuntimePreferenceService,
    private readonly approvalService: ApprovalService,
    private readonly policyAudit: PolicyAuditService,
    private readonly collaborationBootstrap: CollaborationBootstrapService,
    private readonly llmKeysService: LlmKeysService,
    private readonly creationQuota: CompanyCreationQuotaService,
  ) {}

  /** 建公司/转正后同步主群，避免用户进协作页时 MQ 尚未消费导致空列表。 */
  private async ensureCollaborationReadyForNewCompany(
    company: Company,
    ownerUserId: string,
  ): Promise<void> {
    await this.tenantContext.runWithCompanyId(company.id, async () => {
      await this.collaborationBootstrap.ensureMainRoomConvergedForCompany(
        company.id,
        ownerUserId,
        company.name ?? undefined,
      );
    });
  }

  private actorIsPlatformAdmin(actor: Actor): boolean {
    return Boolean(actor?.roles?.some((r) => r === 'admin' || r === 'superadmin'));
  }

  private async getPlatformIntentLayerGlobalSettings(): Promise<Record<string, unknown>> {
    const rows = await this.dataSource.query(
      `SELECT value FROM platform_settings WHERE key = $1 LIMIT 1`,
      ['collab.intentLayer.globalSettings'],
    );
    const value = rows?.[0]?.value;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private async getPlatformReplayGlobalSettings(): Promise<Record<string, unknown>> {
    const rows = await this.dataSource.query(
      `SELECT value FROM platform_settings WHERE key = $1 LIMIT 1`,
      ['collab.replay.globalSettings'],
    );
    const value = rows?.[0]?.value;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  /** 校验 departmentPlacements 中引用的商城 slug 均已上架 */
  private async assertDepartmentPlacementSlugs(placements?: DepartmentPlacementDto[]): Promise<void> {
    if (!placements?.length) {
      return;
    }
    const slugs = new Set<string>();
    for (const p of placements) {
      const head = p.headAgentSlug?.trim();
      if (head) {
        if (head === 'ceo') {
          throw new BadRequestException({
            code: ErrorCode.BAD_REQUEST,
            message: '部门主管不能指定为 ceo 商城 Agent',
          });
        }
        slugs.add(head);
      }
      for (const raw of p.memberAgentSlugs ?? []) {
        const s = raw?.trim();
        if (!s) {
          continue;
        }
        if (s === 'ceo') {
          throw new BadRequestException({
            code: ErrorCode.BAD_REQUEST,
            message: '成员列表不能包含 ceo 商城 Agent',
          });
        }
        slugs.add(s);
      }
    }
    if (slugs.size === 0) {
      return;
    }
    const rows = await this.marketplaceAgentsRepo.find({
      where: { slug: In([...slugs]), isPublished: true },
      select: ['slug'],
    });
    const found = new Set(rows.map((r) => r.slug));
    for (const slug of slugs) {
      if (!found.has(slug)) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: `无效或未上架的商城 Agent slug: ${slug}`,
        });
      }
    }
  }

  async create(createDto: CreateCompanyDto, actor: Actor): Promise<Company> {
    await this.assertDepartmentPlacementSlugs(createDto.departmentPlacements);
    await this.creationQuota.assertCanCreateCompany(actor);

    const companyId = randomUUID();
    const now = new Date();
    let slug = this.generateSlug(createDto.name);
    let inserted = false;
    let attempts = 0;

    while (!inserted && attempts < 5) {
      attempts += 1;
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        await this.creationQuota.assertCanCreateCompanyInTransaction(queryRunner, actor);
        await queryRunner.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);

        await queryRunner.query(
          `
            INSERT INTO companies
              (id, name, slug, industry, industry_code, scale, goal, initial_budget, description, logo_url, timezone, is_active, status, created_by, created_at, updated_at)
            VALUES
              ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, 'active', $12, $13, $13)
          `,
          [
            companyId,
            createDto.name,
            slug,
            createDto.industry || null,
            createDto.industryCode || null,
            createDto.scale || null,
            createDto.goal || null,
            createDto.initialBudget ?? null,
            createDto.description || null,
            createDto.logoUrl || null,
            createDto.timezone || null,
            actor.id,
            now,
          ],
        );

        await queryRunner.query(
          `
            INSERT INTO company_memberships
              (company_id, user_id, role, is_active, created_at, updated_at)
            VALUES
              ($1, $2, 'owner', true, $3, $3)
          `,
          [companyId, actor.id, now],
        );

        await queryRunner.commitTransaction();
        inserted = true;
      } catch (error: any) {
        await queryRunner.rollbackTransaction();
        if (error?.code === '23505' && attempts < 5) {
          slug = `${slug}-${Math.floor(Math.random() * 1000)}`;
        } else if (error?.code === '23505') {
          throw new ConflictException({
            code: ErrorCode.RECORD_ALREADY_EXISTS,
            message: '公司 slug 已存在，请更换公司名称后重试',
          });
        } else {
          throw error;
        }
      } finally {
        await queryRunner.release();
      }
    }

    await this.clearCompanyCache(companyId);
    const company = await this.findOne(companyId);
    // Synchronous bootstrap for wizard flow: ensure org + CEO key assignment are ready immediately.
    await this.organizationInitializer.initializeForCompany(
      company.id,
      company.industry || undefined,
      company.industryCode || undefined,
      createDto.departmentPlacements,
    );
    const platformIntentLayerSettings = await this.getPlatformIntentLayerGlobalSettings();
    await this.ceoLayerConfigService.applyPlatformIntentLayerGlobalSettingsToCompany(
      company.id,
      platformIntentLayerSettings,
    );
    const platformReplaySettings = await this.getPlatformReplayGlobalSettings();
    if (Object.keys(platformReplaySettings).length > 0) {
      await this.ceoLayerConfigService.applyPlatformReplayGlobalSettingsToCompany(company.id, platformReplaySettings);
    }
    await this.ensureCollaborationReadyForNewCompany(company, actor.id);
    await this.publishCompanyCreated(company, actor.id);
    return company;
  }

  /**
   * 向导用草稿公司：有合法 companyId 与成员关系，但不初始化组织、不发布 company.created。
   */
  async createDraftShell(actor: Actor): Promise<Company> {
    await this.creationQuota.assertCanCreateCompany(actor);

    const companyId = randomUUID();
    const now = new Date();
    const slug = `draft-${companyId.replace(/-/g, '').slice(0, 12)}`;
    const placeholderName = '未命名公司';

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await this.creationQuota.assertCanCreateCompanyInTransaction(queryRunner, actor);
      await queryRunner.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);

      await queryRunner.query(
        `
          INSERT INTO companies
            (id, name, slug, industry, industry_code, scale, goal, initial_budget, description, logo_url, timezone, is_active, status, created_by, created_at, updated_at)
          VALUES
            ($1, $2, $3, null, null, null, null, null, null, null, null, false, 'draft', $4, $5, $5)
        `,
        [companyId, placeholderName, slug, actor.id, now],
      );

      await queryRunner.query(
        `
          INSERT INTO company_memberships
            (company_id, user_id, role, is_active, created_at, updated_at)
          VALUES
            ($1, $2, 'owner', true, $3, $3)
        `,
        [companyId, actor.id, now],
      );

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    await this.clearCompanyCache(companyId);
    // 向导草稿阶段预先准备 CEO 的 LLM key assignment，
    // 让 setup-recommendation 即使在 draft 阶段也能走 LLM 而非规则兜底。
    await this.organizationInitializer.ensureCeoKeyAssignmentForCompany(companyId);
    return this.findOne(companyId);
  }

  /**
   * 草稿转正：写入向导最终字段、激活，并执行组织初始化与 company.created。
   */
  async completeWizard(companyId: string, dto: CreateCompanyDto, actor: Actor): Promise<Company> {
    await this.assertCanCompleteWizard(companyId, actor);
    // Avoid relying on CLS-based RLS when the first read happens right after a transaction.
    // We set app.current_tenant explicitly so the companies row won't be filtered out as "not found".
    const first = await this.dataSource.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
      return manager.getRepository(Company).findOne({ where: { id: companyId } });
    });
    if (!first) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '公司不存在',
      });
    }
    if (first.status !== 'draft') {
      // 幂等：首次 complete 已成功但客户端重试（双点、刷新后 session 残留等）时直接返回已激活公司。
      if (first.status === 'active') {
        const creatorId = first.createdBy ? String(first.createdBy) : null;
        const actorId = String(actor.id);
        if ((creatorId && creatorId === actorId) || this.actorIsPlatformAdmin(actor)) {
          try {
            await this.ensureCollaborationReadyForNewCompany(first, actor.id);
          } catch (err: unknown) {
            this.logger.warn('Idempotent completeWizard: main room bootstrap failed', {
              companyId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          return this.findOne(companyId);
        }
      }
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: '该公司已创建或状态不是草稿，无法通过向导完成',
      });
    }

    await this.assertDepartmentPlacementSlugs(dto.departmentPlacements);

    let slug = this.generateSlug(dto.name);
    for (let attempts = 1; attempts <= 5; attempts += 1) {
      try {
        const refreshed = await this.dataSource.transaction(async (manager) => {
          await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);

          const company = await manager.getRepository(Company).findOne({ where: { id: companyId } });
          if (!company) {
            throw new NotFoundException({
              code: ErrorCode.RECORD_NOT_FOUND,
              message: '公司不存在',
            });
          }

          company.name = dto.name;
          company.slug = slug;
          company.industry = dto.industry ?? null;
          company.industryCode = dto.industryCode ?? null;
          company.scale = dto.scale ?? null;
          company.goal = dto.goal ?? null;
          company.initialBudget =
            dto.initialBudget != null && Number.isFinite(dto.initialBudget)
              ? String(dto.initialBudget)
              : null;
          company.description = dto.description ?? null;
          company.logoUrl = dto.logoUrl ?? null;
          company.timezone = dto.timezone ?? null;
          company.status = 'active';
          company.isActive = true;

          await manager.getRepository(Company).save(company);

          const updated = await manager.getRepository(Company).findOne({ where: { id: companyId } });
          if (!updated) {
            throw new NotFoundException({
              code: ErrorCode.RECORD_NOT_FOUND,
              message: '公司不存在',
            });
          }
          return updated;
        });

        await this.clearCompanyCache(companyId);
        await this.organizationInitializer.initializeForCompany(
          refreshed.id,
          refreshed.industry || undefined,
          refreshed.industryCode || undefined,
          dto.departmentPlacements,
        );
        const platformIntentLayerSettings = await this.getPlatformIntentLayerGlobalSettings();
        await this.ceoLayerConfigService.applyPlatformIntentLayerGlobalSettingsToCompany(
          refreshed.id,
          platformIntentLayerSettings,
        );
        const platformReplaySettings = await this.getPlatformReplayGlobalSettings();
        if (Object.keys(platformReplaySettings).length > 0) {
          await this.ceoLayerConfigService.applyPlatformReplayGlobalSettingsToCompany(
            refreshed.id,
            platformReplaySettings,
          );
        }
        await this.ensureCollaborationReadyForNewCompany(refreshed, actor.id);
        await this.publishCompanyCreated(refreshed, actor.id);
        return refreshed;
      } catch (error: any) {
        if (error?.code === '23505' && attempts < 5) {
          slug = `${this.generateSlug(dto.name)}-${Math.floor(Math.random() * 1000)}`;
          continue;
        }
        if (error?.code === '23505') {
          throw new ConflictException({
            code: ErrorCode.RECORD_ALREADY_EXISTS,
            message: '公司 slug 已存在，请更换公司名称后重试',
          });
        }
        throw error;
      }
    }

    throw new ConflictException({
      code: ErrorCode.RECORD_ALREADY_EXISTS,
      message: '公司 slug 已存在，请更换公司名称后重试',
    });
  }

  async findAll(query: QueryCompanyDto, actor: Actor): Promise<PaginatedResult<Company>> {
    const tenantScope = this.tenantContext.getCompanyId();

    if (!tenantScope) {
      return this.dataSource.transaction(async (manager) => {
        await manager.query(SQL_SET_LOCAL_MEMBERSHIP_LISTING_USER, [actor.id]);
        const qb = manager.createQueryBuilder(Company, 'company');
        const { page, pageSize } = this.applyCompanyListFilters(qb, query, actor);
        const [items, total] = await qb.getManyAndCount();
        return {
          items,
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        };
      });
    }

    const cacheKey = `company:${tenantScope}:companies:list:${JSON.stringify(query)}`;
    const cached = await this.cacheService.get<PaginatedResult<Company>>(cacheKey);
    if (cached) {
      return cached;
    }

    const qb = this.companiesRepo.createQueryBuilder('company');
    const { page, pageSize } = this.applyCompanyListFilters(qb, query, actor);
    const [items, total] = await qb.getManyAndCount();
    const result = {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    await this.cacheService.set(cacheKey, result, this.CACHE_TTL);
    return result;
  }

  private applyCompanyListFilters(
    queryBuilder: SelectQueryBuilder<Company>,
    query: QueryCompanyDto,
    actor: Actor,
  ): { page: number; pageSize: number } {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder || 'DESC';
    const sortColumn =
      sortBy === 'updatedAt'
        ? 'company.updatedAt'
        : sortBy === 'name'
          ? 'company.name'
          : sortBy === 'status'
            ? 'company.status'
            : 'company.createdAt';

    // Admin 控制台：平台管理员默认可见全量公司（不按 created_by / membership 过滤）。
    // 普通用户：仅可见自己创建或加入的公司。
    if (!this.actorIsPlatformAdmin(actor)) {
      queryBuilder.leftJoin(
        'company_memberships',
        'membership',
        'membership.company_id = company.id AND membership.user_id = :userId AND membership.is_active = true',
        { userId: actor.id },
      );
      queryBuilder.where(
        'company.created_by = :userId OR membership.user_id IS NOT NULL',
        {
          userId: actor.id,
        },
      );
    }

    if (query.search) {
      queryBuilder.andWhere('(company.name ILIKE :search OR company.slug ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    if (query.createdBy && this.actorIsPlatformAdmin(actor)) {
      queryBuilder.andWhere('company.created_by = :createdBy', { createdBy: query.createdBy });
    }

    // 向导草稿公司不应出现在列表；用户在向导内通过专用草稿 ID 会话工作。
    queryBuilder.andWhere('company.status != :draftOnly', { draftOnly: 'draft' });

    queryBuilder.orderBy(sortColumn, sortOrder).skip((page - 1) * pageSize).take(pageSize);

    return { page, pageSize };
  }

  async findOne(id: string): Promise<Company> {
    const cacheKey = `company:${id}:profile`;
    const cached = await this.cacheService.get<Company>(cacheKey);
    if (cached) return cached;

    const company = await this.companiesRepo.findOne({ where: { id } as FindOptionsWhere<Company> });
    if (!company) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '公司不存在',
      });
    }

    await this.cacheService.set(cacheKey, company, this.CACHE_TTL);
    return company;
  }

  async update(id: string, dto: UpdateCompanyDto, actor: Actor): Promise<Company> {
    await this.assertCanManageCompany(id, actor.id, actor.roles);
    const company = await this.findOne(id);
    const before = { ...company };

    if (dto.slug && dto.slug !== company.slug) {
      dto.slug = this.generateSlug(dto.slug);
    }

    Object.assign(company, dto);

    let updated: Company;
    try {
      updated = await this.companiesRepo.save(company);
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new ConflictException({
          code: ErrorCode.RECORD_ALREADY_EXISTS,
          message: '公司 slug 已存在',
        });
      }
      throw error;
    }

    await this.clearCompanyCache(id);
    await this.publishCompanyUpdated(before, updated, actor.id);
    return updated;
  }

  async changeStatus(id: string, dto: UpdateCompanyStatusDto, actor: Actor): Promise<Company> {
    await this.assertCanManageCompany(id, actor.id, actor.roles);
    const company = await this.findOne(id);
    const fromStatus = company.status;
    company.status = dto.status;
    company.isActive = dto.status === 'active';
    const updated = await this.companiesRepo.save(company);
    await this.clearCompanyCache(id);
    await this.publishCompanyStatusChanged(updated, fromStatus, dto.status, actor.id, dto.reason);
    return updated;
  }

  async validateAccess(companyId: string, userId: string): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
      await manager.query(SQL_SET_LOCAL_MEMBERSHIP_LISTING_USER, [userId]);
      const membership = await manager.getRepository(CompanyMembership).findOne({
        where: { companyId, userId, isActive: true } as FindOptionsWhere<CompanyMembership>,
      });
      return !!membership;
    });
  }

  /**
   * 内网 RPC：解析用户在租户内的活跃 membership 角色（owner/admin/member）。
   */
  async findActiveMembership(
    companyId: string,
    userId: string,
  ): Promise<{ role: CompanyMembership['role'] } | null> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
      await manager.query(SQL_SET_LOCAL_MEMBERSHIP_LISTING_USER, [userId]);
      const membership = await manager.getRepository(CompanyMembership).findOne({
        where: { companyId, userId, isActive: true } as FindOptionsWhere<CompanyMembership>,
      });
      if (!membership) return null;
      return { role: membership.role };
    });
  }

  async countActiveMemberships(companyId: string): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
      const count = await manager.getRepository(CompanyMembership).count({
        where: { companyId, isActive: true } as FindOptionsWhere<CompanyMembership>,
      });
      return count;
    });
  }

  async getHeartbeatConfig(companyId: string, actor: Actor): Promise<CompanyHeartbeatConfig> {
    await this.assertCanManageCompany(companyId, actor.id, actor.roles);
    return this.getOrCreateHeartbeatConfig(companyId);
  }

  async updateHeartbeatConfig(
    companyId: string,
    dto: UpdateCompanyHeartbeatConfigDto,
    actor: Actor,
  ): Promise<CompanyHeartbeatConfig> {
    await this.assertCanManageCompany(companyId, actor.id, actor.roles);

    const config = await this.getOrCreateHeartbeatConfig(companyId);
    if (dto.enabled !== undefined) {
      config.enabled = dto.enabled;
    }
    if (dto.frequency !== undefined) {
      config.frequency = dto.frequency;
    }
    if (dto.metadata) {
      config.metadata = {
        ...(config.metadata || {}),
        ...dto.metadata,
      };
    }
    return this.heartbeatConfigRepo.save(config);
  }

  async getCeoDecisionConfig(companyId: string, actor: Actor): Promise<CompanyCeoDecisionConfig> {
    await this.assertCanManageCompany(companyId, actor.id, actor.roles);
    const config = await this.getOrCreateHeartbeatConfig(companyId);
    const metadata = (config.metadata ?? {}) as Record<string, unknown>;
    const rows = await this.dataSource.query(
      `
      select llm_model as "llmModel", llm_key_id as "llmKeyId"
      from agents
      where company_id = $1 and role = 'ceo'
      order by created_at asc
      limit 1
    `,
      [companyId],
    );
    const fallback = (rows?.[0] ?? {}) as { llmModel?: string | null; llmKeyId?: string | null };
    return {
      ceoDecisionModel:
        typeof metadata.ceoDecisionModel === 'string'
          ? metadata.ceoDecisionModel
          : (fallback.llmModel ?? null),
      ceoDecisionLlmKeyId:
        typeof metadata.ceoDecisionLlmKeyId === 'string'
          ? metadata.ceoDecisionLlmKeyId
          : (fallback.llmKeyId ?? null),
    };
  }

  async updateCeoDecisionConfig(
    companyId: string,
    dto: UpdateCompanyCeoDecisionConfigDto,
    actor: Actor,
  ): Promise<CompanyCeoDecisionConfig> {
    await this.assertCanManageCompany(companyId, actor.id, actor.roles);
    const config = await this.getOrCreateHeartbeatConfig(companyId);
    const metadata = { ...(config.metadata ?? {}) } as Record<string, unknown>;
    if (dto.ceoDecisionModel !== undefined) {
      metadata.ceoDecisionModel = dto.ceoDecisionModel?.trim() || null;
    }
    if (dto.ceoDecisionLlmKeyId !== undefined) {
      metadata.ceoDecisionLlmKeyId = dto.ceoDecisionLlmKeyId || null;
    }
    config.metadata = metadata;
    await this.heartbeatConfigRepo.save(config);
    return this.getCeoDecisionConfig(companyId, actor);
  }

  async getCeoLayerConfig(
    companyId: string,
    actor: Actor,
  ): Promise<CompanyCeoLayerConfigResponse> {
    await this.assertCanManageCompany(companyId, actor.id, actor.roles);

    const templateRow = await this.marketplaceAgentsRepo.findOne({
      where: { slug: 'ceo', isPublished: true },
    });
    const templateConfig = templateRow
      ? normalizeCeoLayerConfig(templateRow.ceoLayerConfig ?? {})
      : ({} as Record<string, unknown>);
    const storedCompanyConfig = await this.ceoLayerConfigService.getStoredLayerConfig(companyId);
    const runtimeCompanyConfig = await this.skillRuntimeResolver.getResolvedCeoTemplateForWorker(
      companyId,
      templateRow,
    );
    const companyConfig = {
      ...(runtimeCompanyConfig ?? {}),
      ...((storedCompanyConfig ?? {}) as Record<string, unknown>),
      strategy: {
        ...(((runtimeCompanyConfig as Record<string, unknown> | null)?.strategy ?? {}) as Record<
          string,
          unknown
        >),
        ...(((storedCompanyConfig as Record<string, unknown> | null)?.strategy ?? {}) as Record<
          string,
          unknown
        >),
      },
    };

    const activeChatKeyIds = await this.llmKeysService.loadActiveChatKeyIdSet();
    const sanitizedTemplate = sanitizeCeoLayerConfigLlmKeyIds(templateConfig, activeChatKeyIds);
    const sanitizedCompany = sanitizeCeoLayerConfigLlmKeyIds(companyConfig, activeChatKeyIds);
    const platformReplay = await this.getPlatformReplayGlobalSettings();
    const platformIntent = await this.getPlatformIntentLayerGlobalSettings();
    const companyWithPlatformContext = mergePlatformContextPolicyFallback(
      sanitizedCompany,
      platformReplay,
      platformIntent,
    );

    return { templateConfig: sanitizedTemplate, companyConfig: companyWithPlatformContext };
  }

  /**
   * 管理端：以事务写入 `company_ceo_layer_configs`（模板按层合并 + 三层键补全）并 **声明式** 将并集 skillIds 同步到 CEO Agent。
   * 与「从商城模板重新同步三层」共用同一原子路径，供显式「强制同步」入口调用。
   */
  private async applyAtomicCeoLayerTemplateToCompanyAndAgent(companyId: string): Promise<void> {
    const template = await this.marketplaceAgentsRepo.findOne({
      where: { slug: 'ceo', isPublished: true },
    });
    if (!template) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '未找到已上架的 CEO 商城模板（slug=ceo）',
      });
    }
    const merged = await this.ceoLayerConfigService.atomicEnsureAndSync(
      companyId,
      normalizeCeoLayerConfig(template.ceoLayerConfig ?? {}),
    );
    const ceo = await this.agentsRepo.findOne({
      where: { companyId, role: 'ceo' } as any,
    });
    if (!ceo?.id) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '公司尚未创建 CEO Agent',
      });
    }
    await this.ceoLayerConfigService.syncLayerConfigToCeoAgent(companyId, ceo.id, merged);
  }

  /**
   * 管理端：仅将 **当前 DB 快照** `company_ceo_layer_configs` 增量推到 CEO `agent_skills`（不读商城模板）。
   */
  async syncCeoLayerSkillsToAgent(companyId: string, actor: Actor): Promise<{ ok: true }> {
    await this.assertCanManageCompany(companyId, actor.id, actor.roles);
    const stored = await this.ceoLayerConfigService.getStoredLayerConfig(companyId);
    if (!stored) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '公司尚无 CEO 三层快照，请使用「从商城模板重新同步三层」。',
      });
    }
    const ceo = await this.agentsRepo.findOne({
      where: { companyId, role: 'ceo' } as any,
    });
    if (!ceo?.id) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '公司尚未创建 CEO Agent',
      });
    }
    await this.ceoLayerConfigService.syncStoredLayerConfigToCeoAgent(companyId, ceo.id);
    return { ok: true };
  }

  /**
   * 管理端：以商城 `slug=ceo` 模板 **按层合并** 进公司快照，再增量同步 `agent_skills`。
   */
  async syncCeoLayerConfigFromTemplate(companyId: string, actor: Actor): Promise<{ ok: true }> {
    await this.assertCanManageCompany(companyId, actor.id, actor.roles);
    await this.applyAtomicCeoLayerTemplateToCompanyAndAgent(companyId);
    return { ok: true };
  }

  /**
   * 管理端：强制走与新建公司相同的三层原子初始化路径（事务写入 `company_ceo_layer_configs` + CEO `agent_skills` 并集）。
   */
  async atomicSyncCeoLayerConfigToAgent(companyId: string, actor: Actor): Promise<{ ok: true }> {
    await this.assertCanManageCompany(companyId, actor.id, actor.roles);
    await this.applyAtomicCeoLayerTemplateToCompanyAndAgent(companyId);
    return { ok: true };
  }

  async updateCeoLayerConfig(
    companyId: string,
    ceoLayerConfig: Record<string, unknown>,
    actor: Actor,
  ): Promise<CompanyCeoLayerConfigResponse> {
    await this.assertCanManageCompany(companyId, actor.id, actor.roles);
    await this.ceoLayerConfigService.saveLayerConfig(companyId, ceoLayerConfig ?? {});
    return this.getCeoLayerConfig(companyId, actor);
  }

  async getCeoGovernancePolicy(companyId: string, actor: Actor): Promise<CeoGovernancePolicyV1> {
    await this.assertCanManageCompany(companyId, actor.id, actor.roles);
    return this.runtimePreference.getCeoGovernancePolicy(companyId);
  }

  async getCeoGovernancePolicyTemplates(companyId: string, actor: Actor): Promise<CeoGovernancePolicyTemplate[]> {
    await this.assertCanManageCompany(companyId, actor.id, actor.roles);
    return [
      {
        id: 'chairman-mainroom-default',
        label: '董事长主群默认',
        description: '角色召唤优先放行，信息不足降级回复，不阻断',
        policyPatch: {
          defaults: {
            allowRoleSpeakerWithoutProfile: true,
            suppressProfileFollowup: true,
            forceFactsQueryTypes: ['role_presence', 'room_members'],
          },
        },
      },
      {
        id: 'department-room-cautious',
        label: '部门群谨慎模式',
        description: '要求更强事实校验，保留降级回复但减少主观结论',
        policyPatch: {
          defaults: {
            allowRoleSpeakerWithoutProfile: true,
            suppressProfileFollowup: true,
            forceFactsQueryTypes: ['role_presence', 'room_members', 'org_structure'],
          },
        },
      },
    ];
  }

  private isHighRiskGovernancePatch(patch: Record<string, unknown>): boolean {
    const defaults =
      patch.defaults && typeof patch.defaults === 'object' && !Array.isArray(patch.defaults)
        ? (patch.defaults as Record<string, unknown>)
        : {};
    const roomOverrides =
      patch.roomOverrides && typeof patch.roomOverrides === 'object' && !Array.isArray(patch.roomOverrides)
        ? (patch.roomOverrides as Record<string, unknown>)
        : {};
    const roleOverrides =
      patch.roleOverrides && typeof patch.roleOverrides === 'object' && !Array.isArray(patch.roleOverrides)
        ? (patch.roleOverrides as Record<string, unknown>)
        : {};
    if (typeof defaults.allowRoleSpeakerWithoutProfile === 'boolean' && defaults.allowRoleSpeakerWithoutProfile === false) {
      return true;
    }
    const containsForcedUnsafe = (obj: Record<string, unknown>): boolean => {
      for (const v of Object.values(obj)) {
        if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
        const r = v as Record<string, unknown>;
        if (typeof r.allowRoleSpeakerWithoutProfile === 'boolean' && r.allowRoleSpeakerWithoutProfile === false) return true;
      }
      return false;
    };
    return containsForcedUnsafe(roomOverrides) || containsForcedUnsafe(roleOverrides);
  }

  async updateCeoGovernancePolicy(
    companyId: string,
    dto: UpdateCompanyCeoGovernancePolicyDto,
    actor: Actor,
  ): Promise<CompanyCeoGovernancePolicyUpdateResult> {
    await this.assertCanManageCompany(companyId, actor.id, actor.roles);
    const current = await this.runtimePreference.getCeoGovernancePolicy(companyId);
    const patch: Record<string, unknown> = {
      ...(dto.version ? { version: dto.version } : {}),
      ...(typeof dto.requireApprovalForHighRiskChanges === 'boolean'
        ? { requireApprovalForHighRiskChanges: dto.requireApprovalForHighRiskChanges }
        : {}),
      ...(dto.defaults && typeof dto.defaults === 'object' ? { defaults: dto.defaults } : {}),
      ...(dto.roomOverrides && typeof dto.roomOverrides === 'object' ? { roomOverrides: dto.roomOverrides } : {}),
      ...(dto.roleOverrides && typeof dto.roleOverrides === 'object' ? { roleOverrides: dto.roleOverrides } : {}),
    };
    const highRisk = this.isHighRiskGovernancePatch(patch);
    const requireApproval = Boolean(current.requireApprovalForHighRiskChanges);

    if (highRisk && requireApproval && !dto.approvedByUserId) {
      const approval = await this.approvalService.create(companyId, {
        actionType: 'company.ceo.governance_policy.update',
        riskLevel: 'L3',
        context: {
          title: 'CEO 治理策略高风险变更',
          summary: dto.changeReason ?? '治理策略高风险变更需董事长审批后生效',
          governancePolicyPatch: patch,
          companyId,
        },
        createdBy: actor.id,
      });
      await this.policyAudit
        .append({
          companyId,
          policyKey: 'ceo.governance_policy.v1',
          policyVersion: Math.max(1, Math.floor(Date.now() / 1000)),
          eventType: 'used_for_approval',
          actorId: actor.id,
          payload: {
            highRisk: true,
            approvalRequestId: approval.id,
            patchKeys: Object.keys(patch),
          },
        })
        .catch(() => undefined);
      await this.publishGovernancePolicyChanged({
        companyId,
        actorId: actor.id,
        highRisk: true,
        pendingApproval: true,
        approvalRequestId: approval.id,
        patchKeys: Object.keys(patch),
      });
      return {
        applied: false,
        pendingApproval: true,
        approvalRequestId: approval.id,
        policy: null,
      };
    }

    const policy = await this.runtimePreference.upsertCeoGovernancePolicy({
      companyId,
      patch,
      updatedBy: dto.approvedByUserId ?? actor.id,
    });
    await this.policyAudit
      .append({
        companyId,
        policyKey: 'ceo.governance_policy.v1',
        policyVersion: Math.max(1, Math.floor(Date.now() / 1000)),
        eventType: 'published',
        actorId: dto.approvedByUserId ?? actor.id,
        payload: {
          directApply: true,
          highRisk,
          patchKeys: Object.keys(patch),
        },
      })
      .catch(() => undefined);
    await this.publishGovernancePolicyChanged({
      companyId,
      actorId: dto.approvedByUserId ?? actor.id,
      highRisk,
      pendingApproval: false,
      approvalRequestId: null,
      patchKeys: Object.keys(patch),
    });
    return {
      applied: true,
      pendingApproval: false,
      approvalRequestId: null,
      policy,
    };
  }

  private async publishGovernancePolicyChanged(params: {
    companyId: string;
    actorId: string | null;
    highRisk: boolean;
    pendingApproval: boolean;
    approvalRequestId: string | null;
    patchKeys: string[];
  }): Promise<void> {
    try {
      const event: BaseEvent = {
        eventId: randomUUID(),
        eventType: 'company.ceo.governance_policy.changed',
        aggregateId: params.companyId,
        aggregateType: 'company',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId: params.companyId,
        data: {
          companyId: params.companyId,
          actorId: params.actorId,
          highRisk: params.highRisk,
          pendingApproval: params.pendingApproval,
          approvalRequestId: params.approvalRequestId,
          patchKeys: params.patchKeys,
        },
      };
      await this.messagingService.publish(event, {
        routingKey: 'company.ceo.governance_policy.changed',
        persistent: true,
      });
    } catch (error: any) {
      this.logger.warn('publish company.ceo.governance_policy.changed failed', {
        companyId: params.companyId,
        error: error?.message,
      });
    }
  }

  private async getOrCreateHeartbeatConfig(companyId: string): Promise<CompanyHeartbeatConfig> {
    await this.findOne(companyId);
    let config = await this.heartbeatConfigRepo.findOne({ where: { companyId } });
    if (config) {
      return config;
    }
    config = this.heartbeatConfigRepo.create({
      companyId,
      enabled: false,
      frequency: 'daily' as CompanyHeartbeatFrequency,
      lastExecutedAt: null,
      metadata: {},
    });
    return this.heartbeatConfigRepo.save(config);
  }

  async remove(companyId: string, actor: Actor): Promise<{ ok: true }> {
    await this.assertCanManageCompany(companyId, actor.id, actor.roles);
    // Hard-delete: intended for cancel-create in dev flows.
    // DB-level FK constraints should cascade to company-scoped rows.
    await this.companiesRepo.delete({ id: companyId } as any);
    await this.clearCompanyCache(companyId);
    return { ok: true };
  }

  /**
   * 向导完成：草稿公司以 companies.created_by 为准（与 createDraftShell 一致）；
   * 若仅依赖 company_memberships，在成员行缺失或与 JWT actor 不一致时会误 403。
   * 非草稿公司仍按 Owner/Admin 成员关系校验。
   */
  private async assertCanCompleteWizard(companyId: string, actor: Actor): Promise<void> {
    if (this.actorIsPlatformAdmin(actor)) {
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
      await manager.query(SQL_SET_LOCAL_MEMBERSHIP_LISTING_USER, [actor.id]);

      const rows = await manager.query(
        `SELECT status, created_by AS "createdBy" FROM companies WHERE id = $1 LIMIT 1`,
        [companyId],
      );
      const row = rows?.[0] as { status?: string; createdBy?: string | null } | undefined;
      if (!row) {
        throw new NotFoundException({
          code: ErrorCode.RECORD_NOT_FOUND,
          message: '公司不存在',
        });
      }

      if (row.status === 'draft') {
        const creatorId = row.createdBy ? String(row.createdBy) : null;
        const actorId = String(actor.id);
        if (creatorId && creatorId === actorId) {
          return;
        }
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: '仅创建者可完成该公司的向导提交',
        });
      }

      const membership = await manager.getRepository(CompanyMembership).findOne({
        where: { companyId, userId: actor.id, isActive: true } as FindOptionsWhere<CompanyMembership>,
      });
      if (!membership || !['owner', 'admin'].includes(membership.role)) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: '仅公司 Owner/Admin 可执行此操作',
        });
      }
    });
  }

  private async assertCanManageCompany(companyId: string, userId: string, roles?: string[]): Promise<void> {
    if (this.actorIsPlatformAdmin({ id: userId, roles })) {
      return;
    }

    /**
     * company_memberships RLS（CompanyListRlsForMembershipScope）：
     * company_id = app.current_tenant OR user_id = app.membership_listing_user
     * 仅靠连接上 session 的 app.current_tenant（TenantTypeormContextBootstrapper）在 RPC/连接池场景下不可靠；
     * 在短事务内 SET LOCAL 两枚 GUC，与迁移策略一致，保证成员行可读。
     */
    const membership = await this.dataSource.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
      await manager.query(SQL_SET_LOCAL_MEMBERSHIP_LISTING_USER, [userId]);
      return manager.getRepository(CompanyMembership).findOne({
        where: { companyId, userId, isActive: true } as FindOptionsWhere<CompanyMembership>,
      });
    });
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅公司 Owner/Admin 可执行此操作',
      });
    }
  }

  /**
   * 提供给 Controller/跨模块基础设施调用的权限断言。
   * 规则与公司治理类接口一致：Platform Admin 或该公司 Owner/Admin。
   */
  async assertCanManageCompanyAsActor(companyId: string, actor: Actor): Promise<void> {
    await this.assertCanManageCompany(companyId, actor.id, actor.roles);
  }

  async saveSnapshot(params: {
    companyId: string;
    version: string;
    snapshot: Record<string, unknown>;
    actor: Actor;
  }): Promise<CompanySnapshotRecord> {
    await this.assertCanManageCompany(params.companyId, params.actor.id, params.actor.roles);
    const row = await this.dataSource.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [params.companyId]);
      const inserted = await manager.query(
        `
          INSERT INTO company_snapshots (company_id, version, snapshot)
          VALUES ($1, $2, $3::jsonb)
          ON CONFLICT (company_id, version)
          DO UPDATE SET snapshot = EXCLUDED.snapshot
          RETURNING id, company_id, version, snapshot, created_at
        `,
        [params.companyId, params.version, JSON.stringify(params.snapshot)],
      );
      return inserted?.[0];
    });
    return {
      id: String(row.id),
      companyId: String(row.company_id),
      version: String(row.version),
      snapshot: (row.snapshot ?? {}) as Record<string, unknown>,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  async getLatestSnapshot(params: {
    companyId: string;
    actor: Actor;
  }): Promise<CompanySnapshotRecord | null> {
    await this.assertCanManageCompany(params.companyId, params.actor.id, params.actor.roles);
    const row = await this.dataSource.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [params.companyId]);
      const rows = await manager.query(
        `
          SELECT id, company_id, version, snapshot, created_at
          FROM company_snapshots
          WHERE company_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [params.companyId],
      );
      return rows?.[0] ?? null;
    });
    if (!row) return null;
    return {
      id: String(row.id),
      companyId: String(row.company_id),
      version: String(row.version),
      snapshot: (row.snapshot ?? {}) as Record<string, unknown>,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  private generateSlug(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);
  }

  private async clearCompanyCache(companyId: string): Promise<void> {
    await this.cacheService.delete(`company:${companyId}:profile`);
  }

  private async publishCompanyCreated(company: Company, createdBy: string): Promise<void> {
    try {
      const event: CompanyCreatedEvent = {
        eventId: randomUUID(),
        eventType: 'company.created',
        aggregateId: company.id,
        aggregateType: 'company',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId: company.id,
        data: {
          companyId: company.id,
          name: company.name,
          slug: company.slug || '',
          industry: company.industry || undefined,
          industryCode: company.industryCode || undefined,
          createdBy,
          status: company.status,
          createdAt: company.createdAt.toISOString(),
        },
      };

      await this.messagingService.publish(event, {
        routingKey: 'company.created',
        persistent: true,
      });
    } catch (error: any) {
      this.logger.error('Failed to publish company.created event', {
        companyId: company.id,
        error: error?.message,
      });
    }
  }

  private async publishCompanyUpdated(
    before: Company,
    after: Company,
    updatedBy: string,
  ): Promise<void> {
    const changes: Record<string, any> = {};
    const keys: Array<keyof UpdateCompanyDto> = [
      'name',
      'slug',
      'industry',
      'industryCode',
      'scale',
      'goal',
      'initialBudget',
      'description',
      'logoUrl',
      'contactEmail',
      'contactPhone',
      'timezone',
      'defaultLanguage',
    ];

    for (const key of keys) {
      if ((before as any)[key] !== (after as any)[key]) {
        changes[key] = (after as any)[key];
      }
    }

    if (Object.keys(changes).length === 0) return;

    try {
      const event: CompanyUpdatedEvent = {
        eventId: randomUUID(),
        eventType: 'company.updated',
        aggregateId: after.id,
        aggregateType: 'company',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId: after.id,
        data: {
          companyId: after.id,
          updatedBy,
          changes,
          updatedAt: after.updatedAt.toISOString(),
        },
      };
      await this.messagingService.publish(event, {
        routingKey: 'company.updated',
        persistent: true,
      });
    } catch (error: any) {
      this.logger.error('Failed to publish company.updated event', {
        companyId: after.id,
        error: error?.message,
      });
    }
  }

  private async publishCompanyStatusChanged(
    company: Company,
    fromStatus: Company['status'],
    toStatus: Company['status'],
    changedBy: string,
    reason?: string,
  ): Promise<void> {
    try {
      const event: CompanyStatusChangedEvent = {
        eventId: randomUUID(),
        eventType: 'company.status_changed',
        aggregateId: company.id,
        aggregateType: 'company',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId: company.id,
        data: {
          companyId: company.id,
          changedBy,
          fromStatus,
          toStatus,
          reason,
          changedAt: new Date().toISOString(),
        },
      };
      await this.messagingService.publish(event, {
        routingKey: 'company.status_changed',
        persistent: true,
      });
    } catch (error: any) {
      this.logger.error('Failed to publish company.status_changed event', {
        companyId: company.id,
        error: error?.message,
      });
    }
  }
}
