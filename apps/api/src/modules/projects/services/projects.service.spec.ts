import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TenantContextService } from '@service/tenant';
import { Agent } from '../../agents/entities/agent.entity.js';
import { CompanyMembership } from '../../companies/entities/company-membership.entity.js';
import { Task } from '../../tasks/entities/task.entity.js';
import { Project } from '../entities/project.entity.js';
import { ProjectsService } from './projects.service.js';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let projectsRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let tasksRepo: { count: jest.Mock; find: jest.Mock; query: jest.Mock };
  let agentsRepo: { query: jest.Mock; find: jest.Mock; createQueryBuilder: jest.Mock };
  let membershipsRepo: { manager: { transaction: jest.Mock } };

  const companyId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const actor = { id: '11111111-2222-3333-4444-555555555555' };

  beforeEach(async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      clone: jest.fn(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(1),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 'proj-1',
          companyId,
          name: 'Test Project',
          client: 'Client A',
          status: 'active',
          deadline: null,
          progress: 10,
          notes: null,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-02'),
        },
      ]),
    };
    qb.clone.mockReturnValue(qb);

    projectsRepo = {
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({
        ...x,
        id: x.id ?? 'proj-new',
        createdAt: x.createdAt ?? new Date('2026-01-01'),
        updatedAt: x.updatedAt ?? new Date('2026-01-02'),
      })),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(() => qb),
    };
    tasksRepo = {
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([]),
      query: jest.fn().mockResolvedValue([]),
    };
    agentsRepo = {
      query: jest.fn().mockResolvedValue([]),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };
    membershipsRepo = {
      manager: {
        transaction: jest.fn(async (fn: (m: unknown) => unknown) => {
          const mgr = {
            query: jest.fn(),
            getRepository: jest.fn(() => ({
              findOne: jest.fn().mockResolvedValue({ companyId, userId: actor.id, isActive: true }),
            })),
          };
          return fn(mgr);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        {
          provide: TenantContextService,
          useValue: { getCompanyId: jest.fn(() => companyId) },
        },
        { provide: getRepositoryToken(Project), useValue: projectsRepo },
        { provide: getRepositoryToken(Task), useValue: tasksRepo },
        { provide: getRepositoryToken(Agent), useValue: agentsRepo },
        { provide: getRepositoryToken(CompanyMembership), useValue: membershipsRepo },
      ],
    }).compile();

    service = module.get(ProjectsService);
  });

  it('findAll returns paginated projects with stats', async () => {
    const result = await service.findAll({ page: 1, pageSize: 20 }, actor);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Test Project');
    expect(result.items[0].taskCount).toBe(0);
  });

  it('create persists a project', async () => {
    const row = await service.create(
      { name: 'New', client: 'Acme', status: 'active' },
      actor,
    );
    expect(projectsRepo.save).toHaveBeenCalled();
    expect(row.name).toBe('New');
  });

  it('remove rejects when linked tasks exist', async () => {
    projectsRepo.findOne.mockResolvedValue({
      id: 'proj-1',
      companyId,
      name: 'P',
      client: 'C',
      status: 'active',
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    tasksRepo.count.mockResolvedValue(2);
    await expect(service.remove('proj-1', actor)).rejects.toBeInstanceOf(ConflictException);
  });

  it('findOne throws when missing', async () => {
    projectsRepo.findOne.mockResolvedValue(null);
    await expect(service.findOne('missing', actor)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rollupProgress updates project progress from tasks', async () => {
    projectsRepo.findOne.mockResolvedValue({
      id: 'proj-1',
      companyId,
      name: 'P',
      client: 'C',
      status: 'active',
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    tasksRepo.find.mockResolvedValue([
      { status: 'completed' },
      { status: 'pending' },
    ]);
    await service.rollupProgress('proj-1', companyId);
    expect(projectsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ progress: 50 }),
    );
  });
});
