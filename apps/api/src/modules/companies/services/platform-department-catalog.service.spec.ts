import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PlatformDepartmentCatalogService } from './platform-department-catalog.service.js';
import { PlatformDepartment } from '../../templates/entities/platform-department.entity.js';

describe('PlatformDepartmentCatalogService', () => {
  let service: PlatformDepartmentCatalogService;

  const platformDeptRepo = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformDepartmentCatalogService,
        { provide: getRepositoryToken(PlatformDepartment), useValue: platformDeptRepo },
      ],
    }).compile();
    service = module.get(PlatformDepartmentCatalogService);
  });

  it('loads only departments with published department_head directors', async () => {
    platformDeptRepo.find.mockResolvedValue([
      {
        slug: 'marketing',
        displayName: '营销部',
        sortOrder: 1,
        isDefaultForNewCompany: true,
        category: null,
        responsibilitySummary: null,
        taskTypeTags: [],
        director: { slug: 'marketing-head', name: '营销总监', isPublished: true, agentCategory: 'department_head' },
      },
      {
        slug: 'legal',
        displayName: '法务部',
        sortOrder: 2,
        isDefaultForNewCompany: false,
        category: null,
        responsibilitySummary: null,
        taskTypeTags: [],
        director: null,
      },
    ]);

    const rows = await service.loadDepartmentsWithDirectors();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.slug).toBe('marketing');
    expect(rows[0]?.headAgentSlug).toBe('marketing-head');
  });

  it('selectForScale prefers default departments', () => {
    const catalog = [
      {
        slug: 'a',
        displayName: 'A',
        headAgentSlug: 'a-head',
        headAgentName: 'A',
        sortOrder: 2,
        isDefaultForNewCompany: false,
        category: null,
        responsibilitySummary: null,
        taskTypeTags: [],
      },
      {
        slug: 'b',
        displayName: 'B',
        headAgentSlug: 'b-head',
        headAgentName: 'B',
        sortOrder: 1,
        isDefaultForNewCompany: true,
        category: null,
        responsibilitySummary: null,
        taskTypeTags: [],
      },
    ];
    const picked = service.selectForScale(catalog, 'small');
    expect(picked.map((d) => d.slug)).toEqual(['b', 'a']);
  });
});
