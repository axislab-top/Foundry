import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CompanyTemplateEngineService } from './company-template-engine.service.js';
import { CompanySetupRecommendationService } from './company-setup-recommendation.service.js';
import { PlatformDepartmentCatalogService } from './platform-department-catalog.service.js';
import { MarketplaceMemberAssignmentService } from './marketplace-member-assignment.service.js';
import { CacheService } from '../../../common/cache/cache.service.js';
import { ConfigService } from '../../../common/config/config.service.js';
import { CompanyTemplate } from '../../templates/entities/company-template.entity.js';
import { TemplateContent } from '../../templates/entities/template-content.entity.js';
import { MarketplaceAgent } from '../../templates/entities/marketplace-agent.entity.js';
import { PlatformDepartment } from '../../templates/entities/platform-department.entity.js';

jest.mock('@contracts/types', () => ({
  COMPANY_INDUSTRY_PRESETS: [{ code: 'marketing', labelZh: '营销', labelEn: 'Marketing', emoji: '📣' }],
}));

const mockCatalog = [
  {
    slug: 'marketing',
    displayName: '营销部',
    headAgentSlug: 'marketing-head',
    headAgentName: '营销总监',
    sortOrder: 1,
    isDefaultForNewCompany: true,
    category: null,
    responsibilitySummary: null,
    taskTypeTags: [],
  },
  {
    slug: 'product',
    displayName: '产品部',
    headAgentSlug: 'product-head',
    headAgentName: '产品总监',
    sortOrder: 2,
    isDefaultForNewCompany: true,
    category: null,
    responsibilitySummary: null,
    taskTypeTags: [],
  },
];

describe('CompanyTemplateEngineService', () => {
  let service: CompanyTemplateEngineService;

  const recommendationService = {
    recommend: jest.fn().mockResolvedValue({
      source: 'llm',
      departmentPlacements: [
        {
          name: '营销部',
          headAgentSlug: 'marketing-head',
          memberAgentSlugs: ['content-writer'],
          platformDepartmentSlug: 'marketing',
        },
        {
          name: '产品部',
          headAgentSlug: 'product-head',
          memberAgentSlugs: [],
          platformDepartmentSlug: 'product',
        },
      ],
      departments: ['营销部', '产品部'],
      marketplaceAgentSlugs: ['marketing-head', 'content-writer', 'product-head'],
      agentCountHint: 12,
      confidence: 0.82,
    }),
  };

  const catalogService = {
    loadDepartmentsWithDirectors: jest.fn().mockResolvedValue(mockCatalog),
    selectForScale: jest.fn((catalog: typeof mockCatalog) => catalog),
    buildBaselinePlacements: jest.fn((catalog: typeof mockCatalog) =>
      catalog.map((d) => ({
        name: d.displayName,
        headAgentSlug: d.headAgentSlug,
        memberAgentSlugs: [],
        platformDepartmentSlug: d.slug,
      })),
    ),
    toPlacements: jest.fn((catalog: typeof mockCatalog) =>
      catalog.map((d) => ({
        name: d.displayName,
        headAgentSlug: d.headAgentSlug,
        memberAgentSlugs: [],
        platformDepartmentSlug: d.slug,
      })),
    ),
    toPlacement: jest.fn((d: (typeof mockCatalog)[number]) => ({
      name: d.displayName,
      headAgentSlug: d.headAgentSlug,
      memberAgentSlugs: [],
      platformDepartmentSlug: d.slug,
    })),
    findBySlugOrName: jest.fn(),
    filterPlacementsToCatalog: jest.fn((placements: unknown[]) => placements),
    mergePlacementsBySlug: jest.fn((base: unknown[], overlay: unknown[]) => {
      const overlayMap = new Map(
        (overlay as Array<{ platformDepartmentSlug?: string }>)
          .filter((p) => p.platformDepartmentSlug)
          .map((p) => [String(p.platformDepartmentSlug), p] as const),
      );
      return (base as Array<{ platformDepartmentSlug?: string; memberAgentSlugs?: string[] }>).map((dept) => {
        const fromOverlay = overlayMap.get(String(dept.platformDepartmentSlug));
        if (!fromOverlay) return dept;
        return {
          ...dept,
          memberAgentSlugs:
            ((fromOverlay as { memberAgentSlugs?: string[] }).memberAgentSlugs?.length ?? 0) > 0
              ? (fromOverlay as { memberAgentSlugs?: string[] }).memberAgentSlugs
              : dept.memberAgentSlugs,
        };
      });
    }),
  };

  const memberAssignmentService = {
    loadPublishedEmployees: jest.fn().mockResolvedValue([
      { slug: 'content-writer', name: '内容策划', agentCategory: 'employee', departmentRoles: ['marketing'] },
    ]),
    buildEmployeePoolByDepartment: jest.fn(() => new Map([['marketing', ['content-writer']]])),
    mergeOntoBaseline: jest.fn((base: unknown[], overlay: unknown[]) => base),
    fillMissingMembers: jest.fn((placements: Array<{ memberAgentSlugs?: string[] }>) =>
      placements.map((p) => ({
        ...p,
        memberAgentSlugs: p.memberAgentSlugs?.length ? p.memberAgentSlugs : ['content-writer'],
      })),
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyTemplateEngineService,
        { provide: CompanySetupRecommendationService, useValue: recommendationService },
        { provide: PlatformDepartmentCatalogService, useValue: catalogService },
        { provide: MarketplaceMemberAssignmentService, useValue: memberAssignmentService },
        {
          provide: CacheService,
          useValue: { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: ConfigService,
          useValue: { isAdvancedCompanyCreationWizardEnabled: () => true },
        },
        { provide: getRepositoryToken(CompanyTemplate), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(TemplateContent), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        {
          provide: getRepositoryToken(MarketplaceAgent),
          useValue: {
            find: jest.fn().mockResolvedValue([
              { slug: 'marketing-head', name: '营销总监' },
              { slug: 'product-head', name: '产品总监' },
              { slug: 'content-writer', name: '内容策划' },
              { slug: 'ceo', name: '首席执行官' },
            ]),
          },
        },
        { provide: getRepositoryToken(PlatformDepartment), useValue: {} },
      ],
    }).compile();

    service = module.get(CompanyTemplateEngineService);
  });

  it('returns up to 3 template options with preview graph and honest match score', async () => {
    const result = await service.recommendTemplates({
      industryCode: 'marketing',
      scale: 'medium',
      goal: '短视频营销增长',
      companyName: 'Nova Labs',
    });

    expect(result.templates.length).toBeGreaterThanOrEqual(1);
    expect(result.templates.length).toBeLessThanOrEqual(3);
    expect(result.templates[0]?.previewGraph.some((n) => n.type === 'ceo')).toBe(true);
    expect(result.templates[0]?.departmentPlacements.length).toBeGreaterThan(0);
    expect(result.templates[0]?.departmentPlacements.every((p) => p.headAgentSlug)).toBe(true);
    expect(result.templates[0]?.matchScore).toBe(82);
    expect(result.recommendSource).toBe('llm');
  });

  it('caps match score when recommendation source is catalog', async () => {
    recommendationService.recommend.mockResolvedValueOnce({
      source: 'catalog',
      departmentPlacements: [
        {
          name: '营销部',
          headAgentSlug: 'marketing-head',
          memberAgentSlugs: [],
          platformDepartmentSlug: 'marketing',
        },
      ],
      departments: ['营销部'],
      marketplaceAgentSlugs: ['marketing-head'],
      agentCountHint: 12,
      confidence: 0.5,
      fallbackReason: 'missing_marketplace_ceo_key_binding',
    });

    const result = await service.recommendTemplates({
      industryCode: 'marketing',
      scale: 'medium',
      goal: '增长',
    });

    expect(result.templates[0]?.matchScore).toBeLessThanOrEqual(55);
    expect(result.fallbackReason).toBe('missing_marketplace_ceo_key_binding');
  });

  it('patchPlacementsByPrompt can add a platform department', async () => {
    catalogService.findBySlugOrName.mockReturnValue(mockCatalog[1]);
    const next = await service.patchPlacementsByPrompt(
      [{ name: '营销部', headAgentSlug: 'marketing-head', memberAgentSlugs: [], platformDepartmentSlug: 'marketing' }],
      '增加产品部门',
    );
    expect(next.some((p) => p.platformDepartmentSlug === 'product')).toBe(true);
  });
});
