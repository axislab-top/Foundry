import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContextService } from '@service/tenant';
import { ApprovalService } from '../../approval/services/approval.service.js';
import { Agent } from '../../agents/entities/agent.entity.js';
import { AgentSkillService } from '../../agents/services/agent-skill.service.js';
import { BillingService } from '../../billing/services/billing.service.js';
import { Skill } from '../../skills/entities/skill.entity.js';
import { SkillRevision } from '../../skills/entities/skill-revision.entity.js';
import { SkillsService } from '../../skills/services/skills.service.js';
import { CompanyCeoLayerConfig } from '../../companies/entities/company-ceo-layer-config.entity.js';
import { MarketplaceSkillPackage } from '../entities/marketplace-skill-package.entity.js';
import { MarketplaceSkillSubscription } from '../entities/marketplace-skill-subscription.entity.js';

type Actor = { id: string; roles?: string[] };

@Injectable()
export class MarketplaceSkillPackagesService {
  private static readonly LARGE_PURCHASE_APPROVAL_CENTS = 50_000;

  constructor(
    @InjectRepository(MarketplaceSkillPackage)
    private readonly packagesRepo: Repository<MarketplaceSkillPackage>,
    @InjectRepository(MarketplaceSkillSubscription)
    private readonly subscriptionsRepo: Repository<MarketplaceSkillSubscription>,
    @InjectRepository(Skill)
    private readonly skillsRepo: Repository<Skill>,
    @InjectRepository(SkillRevision)
    private readonly revisionsRepo: Repository<SkillRevision>,
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(CompanyCeoLayerConfig)
    private readonly ceoLayerConfigRepo: Repository<CompanyCeoLayerConfig>,
    private readonly tenantContext: TenantContextService,
    private readonly skillsService: SkillsService,
    private readonly billingService: BillingService,
    private readonly approvalService: ApprovalService,
    private readonly agentSkillService: AgentSkillService,
  ) {}

  async listPublished(params?: { page?: number; pageSize?: number; search?: string }) {
    return this.listInternal({ ...(params ?? {}), publishedOnly: true });
  }

  async listAllAdmin(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: 'all' | 'published' | 'draft';
  }) {
    const status = params?.status ?? 'all';
    return this.listInternal({
      page: params?.page,
      pageSize: params?.pageSize,
      search: params?.search,
      publishedOnly: status === 'published' ? true : status === 'draft' ? false : undefined,
    });
  }

  private async listInternal(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    publishedOnly?: boolean;
  }) {
    const page = Math.max(1, Number(params?.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(params?.pageSize ?? 20)));
    const qb = this.packagesRepo.createQueryBuilder('p');
    if (typeof params.publishedOnly === 'boolean') {
      qb.where('p.is_published = :pub', { pub: params.publishedOnly });
    }
    if (params?.search?.trim()) {
      qb.andWhere('(p.name ILIKE :q OR p.description ILIKE :q OR p.slug ILIKE :q)', {
        q: `%${params.search.trim()}%`,
      });
    }
    qb.orderBy('p.usage_count', 'DESC')
      .addOrderBy('p.updated_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 0,
    };
  }

  async createPackage(input: {
    slug: string;
    name: string;
    description?: string | null;
    sourceSkillId: string;
    sourceRevisionId?: string | null;
    pricingModel?: 'free' | 'one_time' | 'subscription';
    priceCents?: number;
    subscriptionInterval?: string | null;
    isPublished?: boolean;
  }): Promise<MarketplaceSkillPackage> {
    const source = await this.skillsRepo.findOne({ where: { id: input.sourceSkillId } as any });
    if (!source) throw new NotFoundException('source skill not found');
    const rev = input.sourceRevisionId
      ? await this.revisionsRepo.findOne({ where: { id: input.sourceRevisionId, skillId: source.id } as any })
      : await this.revisionsRepo.findOne({
          where: { skillId: source.id, status: 'published', reviewStatus: 'approved' } as any,
          order: { version: 'DESC' as any },
        });
    if (!rev) throw new BadRequestException('published source revision required');
    const governance =
      rev.metadata && typeof rev.metadata === 'object' && !Array.isArray(rev.metadata)
        ? ((rev.metadata as Record<string, unknown>).governance as Record<string, unknown> | null) ?? null
        : null;
    const row = this.packagesRepo.create({
      slug: input.slug.trim(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      sourceSkillId: source.id,
      sourceRevisionId: rev.id,
      versionLabel: (source as any).semverVersion ?? `v${rev.version}`,
      governanceSnapshot: governance,
      handlerConfigSnapshot: rev.handlerConfig ?? null,
      mcpToolsSnapshot:
        rev.handlerConfig && typeof rev.handlerConfig === 'object' && !Array.isArray(rev.handlerConfig)
          ? (((rev.handlerConfig as Record<string, unknown>).mcpTools as unknown[] | null) ?? null)
          : null,
      pricingModel: input.pricingModel ?? 'free',
      priceCents: Math.max(0, Number(input.priceCents ?? 0)),
      subscriptionInterval: input.subscriptionInterval?.trim() || null,
      isPublished: Boolean(input.isPublished),
      metadata: null,
    });
    return this.packagesRepo.save(row);
  }

  async updatePackage(
    id: string,
    patch: Partial<{
      name: string;
      description: string | null;
      pricingModel: 'free' | 'one_time' | 'subscription';
      priceCents: number;
      subscriptionInterval: string | null;
      isPublished: boolean;
    }>,
  ): Promise<MarketplaceSkillPackage> {
    const row = await this.packagesRepo.findOne({ where: { id } as any });
    if (!row) throw new NotFoundException('skill package not found');
    if (patch.name !== undefined) row.name = String(patch.name).trim();
    if (patch.description !== undefined) row.description = patch.description?.trim() || null;
    if (patch.pricingModel !== undefined) row.pricingModel = patch.pricingModel;
    if (patch.priceCents !== undefined) row.priceCents = Math.max(0, Number(patch.priceCents));
    if (patch.subscriptionInterval !== undefined) row.subscriptionInterval = patch.subscriptionInterval?.trim() || null;
    if (patch.isPublished !== undefined) row.isPublished = Boolean(patch.isPublished);
    return this.packagesRepo.save(row);
  }

  async purchase(companyId: string, packageId: string, actor: Actor): Promise<
    | { outcome: 'pending_approval'; approvalRequestId: string; message: string }
    | { outcome: 'purchased'; packageId: string; purchasedSkillId: string; boundAgentId?: string | null }
  > {
    const pkg = await this.packagesRepo.findOne({ where: { id: packageId, isPublished: true } as any });
    if (!pkg) throw new NotFoundException('skill package not found');
    const requiresApproval = (pkg.priceCents ?? 0) >= MarketplaceSkillPackagesService.LARGE_PURCHASE_APPROVAL_CENTS;
    if (requiresApproval) {
      const req = await this.approvalService.create(companyId, {
        actionType: 'skill.marketplace.purchase',
        riskLevel: 'L2',
        context: {
          companyId,
          packageId: pkg.id,
          priceCents: pkg.priceCents,
          sourceSkillId: pkg.sourceSkillId,
          sourceRevisionId: pkg.sourceRevisionId,
          requestedBy: actor.id,
        },
        createdBy: actor.id,
      });
      return {
        outcome: 'pending_approval',
        approvalRequestId: req.id,
        message: '大额 Skill 包购买已提交审批，请在审批中心处理后重试。',
      };
    }
    return this.bindToCompany(companyId, packageId, actor);
  }

  async bindToCompany(companyId: string, packageId: string, actor: Actor): Promise<{
    outcome: 'purchased';
    packageId: string;
    purchasedSkillId: string;
    boundAgentId?: string | null;
  }> {
    const pkg = await this.packagesRepo.findOne({ where: { id: packageId, isPublished: true } as any });
    if (!pkg) throw new NotFoundException('skill package not found');
    const rev = pkg.sourceRevisionId
      ? await this.revisionsRepo.findOne({ where: { id: pkg.sourceRevisionId } as any })
      : await this.revisionsRepo.findOne({
          where: { skillId: pkg.sourceSkillId, status: 'published', reviewStatus: 'approved' } as any,
          order: { version: 'DESC' as any },
        });
    if (!rev) throw new BadRequestException('source revision not found');

    const cloned = await this.skillsRepo.save(
      this.skillsRepo.create({
        companyId,
        name: `${rev.name}.pkg.${Date.now().toString().slice(-5)}`,
        description: rev.description ?? null,
        toolSchema: rev.toolSchema ?? null,
        promptTemplate: rev.promptTemplate ?? null,
        implementationType: rev.implementationType as any,
        handlerConfig: rev.handlerConfig ?? null,
        requiredPermissions: rev.requiredPermissions ?? [],
        version: 1,
        semverVersion: pkg.versionLabel ?? null,
        isLatest: true,
        isPublic: rev.isPublic,
        isSystem: false,
        metadata: {
          marketplacePackageId: pkg.id,
          sourceSkillId: pkg.sourceSkillId,
          sourceRevisionId: rev.id,
        },
      }) as any,
    );

    await this.revisionsRepo.save(
      this.revisionsRepo.create({
        skillId: cloned.id,
        companyId,
        version: 1,
        status: 'published',
        reviewStatus: 'approved',
        name: cloned.name,
        description: cloned.description,
        toolSchema: cloned.toolSchema,
        promptTemplate: cloned.promptTemplate,
        implementationType: cloned.implementationType as any,
        handlerConfig: cloned.handlerConfig,
        requiredPermissions: cloned.requiredPermissions,
        isPublic: cloned.isPublic,
        isSystem: cloned.isSystem,
        metadata: rev.metadata ?? null,
        artifactId: null,
        createdByUserId: actor.id,
        reviewedByUserId: actor.id,
        reviewedAt: new Date(),
      }) as any,
    );

    if ((pkg.priceCents ?? 0) > 0) {
      await this.billingService.appendRecord(companyId, {
        recordType: 'other',
        cost: Number(pkg.priceCents) / 100,
        metadata: {
          source: 'marketplace.skill.purchase',
          packageId: pkg.id,
          packageSlug: pkg.slug,
          pricingModel: pkg.pricingModel,
        },
      } as any);
    }

    if (pkg.pricingModel === 'subscription') {
      const today = new Date().toISOString().slice(0, 10);
      await this.subscriptionsRepo.save(
        this.subscriptionsRepo.create({
          companyId,
          marketplaceSkillPackageId: pkg.id,
          purchasedSkillId: cloned.id,
          priceCents: pkg.priceCents ?? 0,
          status: 'active',
          startedOn: today,
          lastBilledOn: null,
          endedOn: null,
          metadata: {
            interval: pkg.subscriptionInterval ?? 'month',
          },
        }),
      );
    }

    const ceo = await this.agentsRepo.findOne({ where: { companyId, role: 'ceo' as any } as any });
    if (ceo?.id) {
      await this.tenantContext.runWithCompanyId(companyId, async () => {
        await this.agentSkillService.bindSkills(
          ceo.id,
          {
            skillIds: [cloned.id],
            source: 'marketplace.skill.bindToCompany',
          } as any,
          { id: actor.id, roles: actor.roles },
        );
      });
      await this.addSkillToCeoLayers(companyId, cloned.id);
    }
    await this.packagesRepo.increment({ id: pkg.id }, 'usageCount', 1);
    return {
      outcome: 'purchased',
      packageId: pkg.id,
      purchasedSkillId: cloned.id,
      boundAgentId: ceo?.id ?? null,
    };
  }

  private async addSkillToCeoLayers(companyId: string, skillId: string): Promise<void> {
    const row = await this.ceoLayerConfigRepo.findOne({ where: { companyId } as any });
    const base = (row?.ceoLayerConfig ?? {}) as Record<string, any>;
    const layers = ['strategy', 'orchestration', 'supervision'] as const;
    for (const layer of layers) {
      const curr = base[layer] && typeof base[layer] === 'object' ? { ...base[layer] } : {};
      const ids = Array.isArray(curr.skillIds) ? curr.skillIds.map((x: unknown) => String(x)).filter(Boolean) : [];
      if (!ids.includes(skillId)) ids.push(skillId);
      curr.skillIds = ids;
      base[layer] = curr;
    }
    if (!row) {
      await this.ceoLayerConfigRepo.save(
        this.ceoLayerConfigRepo.create({
          companyId,
          ceoLayerConfig: base,
        }),
      );
      return;
    }
    row.ceoLayerConfig = base;
    await this.ceoLayerConfigRepo.save(row);
  }
}

