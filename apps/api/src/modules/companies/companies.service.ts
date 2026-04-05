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
  CompanyCreatedEvent,
  CompanyStatusChangedEvent,
  CompanyUpdatedEvent,
} from '@contracts/events';
import { CacheService } from '../../common/cache/cache.service.js';
import { ErrorCode } from '../../common/exceptions/error-codes.js';
import { OrganizationInitializerService } from '../organization/services/organization-initializer.service.js';
import { MarketplaceAgent } from '../templates/entities/marketplace-agent.entity.js';
import { Company } from './entities/company.entity.js';
import { CompanyMembership } from './entities/company-membership.entity.js';
import type { DepartmentPlacementDto } from './dto/department-placement.dto.js';
import { CreateCompanyDto } from './dto/create-company.dto.js';
import { QueryCompanyDto } from './dto/query-company.dto.js';
import { UpdateCompanyDto } from './dto/update-company.dto.js';
import { UpdateCompanyStatusDto } from './dto/update-company-status.dto.js';

interface Actor {
  id: string;
  roles?: string[];
}

interface PaginatedResult<T> {
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
    @InjectRepository(MarketplaceAgent)
    private readonly marketplaceAgentsRepo: Repository<MarketplaceAgent>,
    private readonly cacheService: CacheService,
    private readonly messagingService: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly organizationInitializer: OrganizationInitializerService,
  ) {}

  private actorIsPlatformAdmin(actor: Actor): boolean {
    return Boolean(actor?.roles?.some((r) => r === 'admin' || r === 'superadmin'));
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
    await this.publishCompanyCreated(company, actor.id);
    return company;
  }

  /**
   * 向导用草稿公司：有合法 companyId 与成员关系，但不初始化组织、不发布 company.created。
   */
  async createDraftShell(actor: Actor): Promise<Company> {
    const companyId = randomUUID();
    const now = new Date();
    const slug = `draft-${companyId.replace(/-/g, '').slice(0, 12)}`;
    const placeholderName = '未命名公司';

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
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
    await this.assertCanManageCompany(companyId, actor.id, actor.roles);
    const first = await this.findOne(companyId);
    if (first.status !== 'draft') {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: '该公司已创建或状态不是草稿，无法通过向导完成',
      });
    }
    if (first.createdBy !== actor.id && !this.actorIsPlatformAdmin(actor)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅创建者可完成该公司的向导提交',
      });
    }

    await this.assertDepartmentPlacementSlugs(dto.departmentPlacements);

    let slug = this.generateSlug(dto.name);
    for (let attempts = 1; attempts <= 5; attempts += 1) {
      const company = await this.findOne(companyId);
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

      try {
        await this.companiesRepo.save(company);
        await this.clearCompanyCache(companyId);
        const refreshed = await this.findOne(companyId);
        await this.organizationInitializer.initializeForCompany(
          refreshed.id,
          refreshed.industry || undefined,
          refreshed.industryCode || undefined,
          dto.departmentPlacements,
        );
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
    const membership = await this.membershipsRepo.findOne({
      where: { companyId, userId, isActive: true } as FindOptionsWhere<CompanyMembership>,
    });
    return !!membership;
  }

  async remove(companyId: string, actor: Actor): Promise<{ ok: true }> {
    await this.assertCanManageCompany(companyId, actor.id, actor.roles);
    // Hard-delete: intended for cancel-create in dev flows.
    // DB-level FK constraints should cascade to company-scoped rows.
    await this.companiesRepo.delete({ id: companyId } as any);
    await this.clearCompanyCache(companyId);
    return { ok: true };
  }

  private async assertCanManageCompany(companyId: string, userId: string, roles?: string[]): Promise<void> {
    if (roles?.includes('admin')) return;

    const membership = await this.membershipsRepo.findOne({
      where: { companyId, userId, isActive: true } as FindOptionsWhere<CompanyMembership>,
    });
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅公司 Owner/Admin 可执行此操作',
      });
    }
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
