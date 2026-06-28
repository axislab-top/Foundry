import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { In, Repository } from 'typeorm';
import { COMPANY_INDUSTRY_PRESETS } from '@contracts/types';
import { CacheService } from '../../../common/cache/cache.service.js';
import { ConfigService } from '../../../common/config/config.service.js';
import type { DepartmentPlacementDto } from '../dto/department-placement.dto.js';
import type { RecommendCompanyTemplatesDto } from '../dto/company-template-recommendation.dto.js';
import { CompanyTemplate } from '../../templates/entities/company-template.entity.js';
import { TemplateContent } from '../../templates/entities/template-content.entity.js';
import { MarketplaceAgent } from '../../templates/entities/marketplace-agent.entity.js';
import {
  CompanySetupRecommendationService,
  type RecommendedDepartmentPlacement,
} from './company-setup-recommendation.service.js';
import {
  PlatformDepartmentCatalogService,
  type PlatformDepartmentWithDirector,
} from './platform-department-catalog.service.js';
import { MarketplaceMemberAssignmentService } from './marketplace-member-assignment.service.js';

export type OrgPreviewNode = {
  id: string;
  type: 'board' | 'ceo' | 'department' | 'agent';
  label: string;
  parentId?: string;
  roleHint?: string;
  slug?: string;
};

export type CompanyTemplateStats = {
  depth: number;
  deptCount: number;
  agentCount: number;
  estMonthlyCost: number;
};

export type CompanyTemplateOption = {
  id: string;
  name: string;
  matchScore: number;
  description: string;
  sourceKind: 'llm_primary' | 'preset' | 'scale_variant';
  stats: CompanyTemplateStats;
  departmentPlacements: DepartmentPlacementDto[];
  previewGraph: OrgPreviewNode[];
};

export type CompanyTemplateRecommendationResult = {
  templates: CompanyTemplateOption[];
  recommendSource?: 'llm' | 'catalog';
  recommendConfidence?: number;
  fallbackReason?: string;
  cached?: boolean;
};

const CACHE_TTL_SEC = 600;
const FALLBACK_MATCH_SCORE_CAP = 55;

@Injectable()
export class CompanyTemplateEngineService {
  private readonly logger = new Logger(CompanyTemplateEngineService.name);

  constructor(
    private readonly recommendationService: CompanySetupRecommendationService,
    private readonly catalogService: PlatformDepartmentCatalogService,
    private readonly memberAssignment: MarketplaceMemberAssignmentService,
    private readonly cacheService: CacheService,
    private readonly config: ConfigService,
    @InjectRepository(CompanyTemplate)
    private readonly templatesRepo: Repository<CompanyTemplate>,
    @InjectRepository(TemplateContent)
    private readonly contentsRepo: Repository<TemplateContent>,
    @InjectRepository(MarketplaceAgent)
    private readonly marketplaceRepo: Repository<MarketplaceAgent>,
  ) {}

  async recommendTemplates(
    dto: RecommendCompanyTemplatesDto,
    companyId?: string,
  ): Promise<CompanyTemplateRecommendationResult> {
    if (!this.config.isAdvancedCompanyCreationWizardEnabled()) {
      this.logger.debug('Advanced company wizard disabled; using catalog-backed templates');
    }

    const cacheKey = this.buildCacheKey(dto);
    if (!dto.refresh) {
      const cached = await this.cacheService.get<CompanyTemplateRecommendationResult>(cacheKey);
      if (cached?.templates?.length) {
        return { ...cached, cached: true };
      }
    }

    const catalog = await this.catalogService.loadDepartmentsWithDirectors();
    if (!catalog.length) {
      return {
        templates: [],
        recommendSource: 'catalog',
        recommendConfidence: 0,
        fallbackReason: 'no_platform_departments_with_director',
        cached: false,
      };
    }

    const primary = await this.recommendationService.recommend(
      {
        industryCode: dto.industryCode,
        scale: dto.scale,
        goal: dto.goal,
        description: dto.description,
        companyName: dto.companyName,
        initialBudget: dto.initialBudget,
      },
      companyId,
    );

    const primaryPlacements = this.enrichPlacementsWithPlatformSlug(
      primary.departmentPlacements,
      catalog,
    );
    const industryLabel =
      COMPANY_INDUSTRY_PRESETS.find((p) => p.code === dto.industryCode)?.labelZh ?? '通用';
    const isLlm = primary.source === 'llm';

    const templates: CompanyTemplateOption[] = [];

    templates.push(
      await this.buildOption({
        id: 'llm-primary',
        name: isLlm ? `${industryLabel} · AI 定制版` : `${industryLabel} · 平台标准版`,
        matchScore: this.computeMatchScore(primary.confidence, isLlm),
        description: this.buildGoalDescription(
          dto.goal,
          isLlm
            ? '基于您的目标，从平台已配置部门中智能选配团队'
            : '基于平台已配置部门与主管的标准编制（AI 暂不可用或结果为空）',
        ),
        sourceKind: 'llm_primary',
        placements: primaryPlacements,
        initialBudget: dto.initialBudget,
        catalog,
        scale: dto.scale,
      }),
    );

    const presetTemplates = await this.loadPresetTemplates(dto, catalog, primaryPlacements);
    for (const preset of presetTemplates.slice(0, 1)) {
      templates.push(preset);
    }

    templates.push(
      await this.buildScaleVariantOption(dto, primaryPlacements, catalog, industryLabel),
    );

    const deduped = this.deduplicateTemplates(templates).slice(0, 3);
    const result: CompanyTemplateRecommendationResult = {
      templates: deduped,
      recommendSource: primary.source,
      recommendConfidence: primary.confidence,
      fallbackReason: primary.fallbackReason,
      cached: false,
    };

    await this.cacheService.set(cacheKey, result, CACHE_TTL_SEC);
    return result;
  }

  async patchPlacementsByPrompt(
    placements: DepartmentPlacementDto[],
    prompt: string,
    scale: 'small' | 'medium' | 'large' = 'medium',
  ): Promise<DepartmentPlacementDto[]> {
    const text = String(prompt ?? '').trim();
    const catalog = await this.catalogService.loadDepartmentsWithDirectors();
    let next = this.catalogService.filterPlacementsToCatalog(placements, catalog);

    if (!text) {
      return this.fillMembersForPlacements(next, catalog, scale);
    }

    next = next.map((p) => ({ ...p, memberAgentSlugs: [...(p.memberAgentSlugs ?? [])] }));

    const addMatch = text.match(/(?:增加|添加|新建)\s*([^\s，,。]+?)(?:部门|部)?/);
    if (addMatch) {
      const rawName = addMatch[1]?.trim();
      const matched = rawName ? this.catalogService.findBySlugOrName(catalog, { name: rawName }) : null;
      if (matched && !next.some((p) => p.platformDepartmentSlug === matched.slug)) {
        next.push(this.catalogService.toPlacement(matched));
      }
    }

    const removeMatch = text.match(/(?:删除|移除|去掉)\s*([^\s，,。]+?)(?:部门|部)?/);
    if (removeMatch) {
      const rawName = removeMatch[1]?.trim();
      const matched = rawName ? this.catalogService.findBySlugOrName(catalog, { name: rawName }) : null;
      if (matched) {
        next = next.filter((p) => p.platformDepartmentSlug !== matched.slug);
      } else if (rawName) {
        next = next.filter((p) => !p.name.includes(rawName));
      }
    }

    const enriched = this.enrichPlacementsWithPlatformSlug(next, catalog);
    return this.fillMembersForPlacements(enriched, catalog, scale);
  }

  private async fillMembersForPlacements(
    placements: DepartmentPlacementDto[],
    catalog: PlatformDepartmentWithDirector[],
    scale: 'small' | 'medium' | 'large',
  ): Promise<DepartmentPlacementDto[]> {
    const withHeads = placements.filter((p) => p.headAgentSlug?.trim());
    const employees = await this.memberAssignment.loadPublishedEmployees();
    const pool = this.memberAssignment.buildEmployeePoolByDepartment(employees, catalog);
    return this.memberAssignment.fillMissingMembers(withHeads, pool, scale);
  }

  enrichPlacementsWithPlatformSlug(
    placements: RecommendedDepartmentPlacement[] | DepartmentPlacementDto[],
    catalog?: PlatformDepartmentWithDirector[],
  ): DepartmentPlacementDto[] {
    return placements
      .map((p) => {
        const slug =
          (p as DepartmentPlacementDto).platformDepartmentSlug?.trim() ||
          catalog?.find((d) => d.displayName === p.name)?.slug;
        const catalogDept = slug ? catalog?.find((d) => d.slug === slug) : null;
        return {
          name: catalogDept?.displayName ?? p.name,
          headAgentSlug: catalogDept?.headAgentSlug ?? p.headAgentSlug ?? null,
          memberAgentSlugs: [...(p.memberAgentSlugs ?? [])],
          ...(slug ? { platformDepartmentSlug: slug } : {}),
        };
      })
      .filter((p) => p.name.trim().length > 0);
  }

  async buildPreviewGraph(placements: DepartmentPlacementDto[]): Promise<OrgPreviewNode[]> {
    const slugs = new Set<string>(['ceo']);
    for (const dept of placements) {
      if (dept.headAgentSlug) slugs.add(dept.headAgentSlug);
      for (const slug of dept.memberAgentSlugs ?? []) {
        if (slug) slugs.add(slug);
      }
    }
    const nameMap = await this.loadAgentDisplayNames([...slugs]);

    const nodes: OrgPreviewNode[] = [
      { id: 'board', type: 'board', label: '董事会' },
      {
        id: 'ceo',
        type: 'ceo',
        label: nameMap.get('ceo') ?? 'CEO',
        slug: 'ceo',
        parentId: 'board',
        roleHint: '战略与协调',
      },
    ];

    placements.forEach((dept, index) => {
      const deptId = `dept-${index}`;
      const agentCount = (dept.headAgentSlug ? 1 : 0) + (dept.memberAgentSlugs?.length ?? 0);
      nodes.push({
        id: deptId,
        type: 'department',
        label: dept.name,
        slug: dept.platformDepartmentSlug,
        parentId: 'ceo',
        roleHint: agentCount > 0 ? `${agentCount} 位 Agent` : undefined,
      });
      if (dept.headAgentSlug) {
        nodes.push({
          id: `${deptId}-head`,
          type: 'agent',
          label: nameMap.get(dept.headAgentSlug) ?? dept.headAgentSlug,
          slug: dept.headAgentSlug,
          parentId: deptId,
          roleHint: '部门主管',
        });
      }
      (dept.memberAgentSlugs ?? []).forEach((slug, memberIndex) => {
        nodes.push({
          id: `${deptId}-member-${memberIndex}`,
          type: 'agent',
          label: nameMap.get(slug) ?? slug,
          slug,
          parentId: deptId,
          roleHint: '执行岗',
        });
      });
    });

    return nodes;
  }

  private async loadAgentDisplayNames(slugs: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(slugs.filter(Boolean))];
    if (!unique.length) return new Map();

    const rows = await this.marketplaceRepo.find({
      where: { slug: In(unique), isPublished: true },
      select: ['slug', 'name'],
    });
    return new Map(rows.map((row) => [row.slug, row.name]));
  }

  computeStats(placements: DepartmentPlacementDto[], initialBudget?: number): CompanyTemplateStats {
    const agentCount =
      placements.reduce(
        (sum, p) => sum + (p.headAgentSlug ? 1 : 0) + (p.memberAgentSlugs?.length ?? 0),
        0,
      ) + 1;
    const formulaCost = Math.round(agentCount * 120 + placements.length * 40);
    const budgetCap =
      initialBudget != null && Number.isFinite(initialBudget) && initialBudget > 0
        ? Math.round(initialBudget)
        : null;
    return {
      depth: 3,
      deptCount: placements.length,
      agentCount,
      estMonthlyCost: budgetCap != null ? Math.min(formulaCost, budgetCap) : formulaCost,
    };
  }

  private computeMatchScore(confidence: number, isLlm: boolean): number {
    const raw = Math.round((confidence ?? 0.5) * 100);
    if (!isLlm) return Math.min(FALLBACK_MATCH_SCORE_CAP, raw);
    return Math.max(0, Math.min(98, raw));
  }

  private async finalizeTemplatePlacements(
    placements: DepartmentPlacementDto[],
    catalog: PlatformDepartmentWithDirector[],
    scale: 'small' | 'medium' | 'large',
  ): Promise<DepartmentPlacementDto[]> {
    const baseline = this.catalogService.buildBaselinePlacements(catalog, scale);
    const merged = this.memberAssignment.mergeOntoBaseline(baseline, placements);
    const employees = await this.memberAssignment.loadPublishedEmployees();
    const pool = this.memberAssignment.buildEmployeePoolByDepartment(employees, catalog);
    return this.memberAssignment.fillMissingMembers(merged, pool, scale);
  }

  private async buildOption(params: {
    id: string;
    name: string;
    matchScore: number;
    description: string;
    sourceKind: CompanyTemplateOption['sourceKind'];
    placements: DepartmentPlacementDto[];
    initialBudget?: number;
    catalog?: PlatformDepartmentWithDirector[];
    scale?: 'small' | 'medium' | 'large';
  }): Promise<CompanyTemplateOption> {
    let placements = params.placements.filter((p) => p.headAgentSlug?.trim());
    if (params.catalog && params.scale) {
      placements = await this.finalizeTemplatePlacements(placements, params.catalog, params.scale);
    }
    return {
      id: params.id,
      name: params.name,
      matchScore: params.matchScore,
      description: params.description,
      sourceKind: params.sourceKind,
      departmentPlacements: placements,
      stats: this.computeStats(placements, params.initialBudget),
      previewGraph: await this.buildPreviewGraph(placements),
    };
  }

  private async buildScaleVariantOption(
    dto: RecommendCompanyTemplatesDto,
    primaryPlacements: DepartmentPlacementDto[],
    catalog: PlatformDepartmentWithDirector[],
    industryLabel: string,
  ): Promise<CompanyTemplateOption> {
    const baseCatalog = this.catalogService.selectForScale(catalog, dto.scale);
    const basePlacements = this.catalogService.toPlacements(baseCatalog);
    const placements = this.catalogService.mergePlacementsBySlug(basePlacements, primaryPlacements);

    const label =
      dto.scale === 'small' ? '精简启动版' : dto.scale === 'medium' ? '标准成长版' : '全编制版';
    const scaleScore = dto.scale === 'small' ? 72 : dto.scale === 'medium' ? 76 : 70;
    const scaleLimit = baseCatalog.length;

    return this.buildOption({
      id: `scale-${dto.scale}`,
      name: `${industryLabel} · ${label}`,
      matchScore: scaleScore,
      description: this.buildGoalDescription(
        dto.goal,
        `包含平台 ${scaleLimit} 个已配置部门，并按规模配备执行岗`,
      ),
      sourceKind: 'scale_variant',
      placements,
      initialBudget: dto.initialBudget,
      catalog,
      scale: dto.scale,
    });
  }

  private async loadPresetTemplates(
    dto: RecommendCompanyTemplatesDto,
    catalog: PlatformDepartmentWithDirector[],
    primaryPlacements: DepartmentPlacementDto[],
  ): Promise<CompanyTemplateOption[]> {
    const rows = await this.templatesRepo.find({
      where: { isPublished: true },
      order: { usageCount: 'DESC', name: 'ASC' },
      take: 20,
    });

    const scored = rows
      .map((row) => ({ row, score: this.scorePresetTemplate(row, dto) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    const out: CompanyTemplateOption[] = [];
    for (const { row, score } of scored.slice(0, 2)) {
      const contentRow = await this.contentsRepo.findOne({ where: { templateId: row.id } });
      const content = (contentRow?.content ?? {}) as {
        departmentPlacements?: Array<{
          name: string;
          headAgentSlug?: string | null;
          memberAgentSlugs?: string[];
          platformDepartmentSlug?: string;
        }>;
      };
      const raw = content.departmentPlacements ?? [];
      if (!raw.length) continue;

      const filtered = this.catalogService.filterPlacementsToCatalog(
        raw.map((p) => ({
          name: p.name,
          headAgentSlug: p.headAgentSlug ?? null,
          memberAgentSlugs: p.memberAgentSlugs ?? [],
          platformDepartmentSlug: p.platformDepartmentSlug,
        })),
        catalog,
      );
      if (!filtered.length) continue;

      const baseline = this.catalogService.toPlacements(this.catalogService.selectForScale(catalog, dto.scale));
      const merged = this.catalogService.mergePlacementsBySlug(baseline, [...filtered, ...primaryPlacements]);

      out.push(
        await this.buildOption({
          id: `preset-${row.slug}`,
          name: row.name,
          matchScore: Math.min(90, Math.round(score * 100)),
          description:
            row.description?.trim() ||
            this.buildGoalDescription(dto.goal, '平台精选组织模板（仅含已配置主管的部门）'),
          sourceKind: 'preset',
          placements: merged,
          initialBudget: dto.initialBudget,
          catalog,
          scale: dto.scale,
        }),
      );
    }
    return out;
  }

  private scorePresetTemplate(row: CompanyTemplate, dto: RecommendCompanyTemplatesDto): number {
    let score = 0.35;
    if (row.industry && row.industry === dto.industryCode) score += 0.35;
    if (row.scale && row.scale === dto.scale) score += 0.2;
    if (row.usageCount > 0) score += Math.min(0.1, row.usageCount / 500);
    const goal = (dto.goal ?? '').toLowerCase();
    const desc = `${row.description ?? ''} ${row.name}`.toLowerCase();
    if (goal && desc.includes(goal.slice(0, Math.min(8, goal.length)).toLowerCase())) {
      score += 0.15;
    }
    return score;
  }

  private deduplicateTemplates(templates: CompanyTemplateOption[]): CompanyTemplateOption[] {
    const seen = new Set<string>();
    const out: CompanyTemplateOption[] = [];
    for (const t of templates) {
      const key = t.departmentPlacements
        .map(
          (p) =>
            `${p.platformDepartmentSlug ?? p.name}|${p.headAgentSlug ?? ''}|${(p.memberAgentSlugs ?? []).join(',')}`,
        )
        .sort()
        .join('||');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
    return out;
  }

  private buildGoalDescription(goal: string | undefined, fallback: string): string {
    const trimmed = String(goal ?? '').trim();
    if (!trimmed) return fallback;
    const snippet = trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed;
    return `${fallback}：${snippet}`;
  }

  private buildCacheKey(dto: RecommendCompanyTemplatesDto): string {
    const raw = [
      dto.industryCode,
      dto.scale,
      dto.goal ?? '',
      dto.description ?? '',
      dto.companyName ?? '',
      dto.initialBudget != null ? String(dto.initialBudget) : '',
    ].join('|');
    const hash = createHash('sha256').update(raw).digest('hex').slice(0, 24);
    return `company:wizard:templates:v3:${hash}`;
  }
}
