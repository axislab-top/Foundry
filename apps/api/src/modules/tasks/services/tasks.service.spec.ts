import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MessagingService } from '@service/messaging';
import { TenantContextService } from '@service/tenant';
import { CollaborationApprovalNotifier } from '../../collaboration/services/collaboration-approval-notifier.service.js';
import { CacheService } from '../../../common/cache/cache.service.js';
import { CollaborationRealtimePublisher } from '../../collaboration/services/collaboration-realtime-publisher.service.js';
import { Agent } from '../../agents/entities/agent.entity.js';
import { CompanyMembership } from '../../companies/entities/company-membership.entity.js';
import { OrganizationNode } from '../../organization/entities/organization-node.entity.js';
import { TaskAssignment } from '../entities/task-assignment.entity.js';
import { TaskDependency } from '../entities/task-dependency.entity.js';
import { Task } from '../entities/task.entity.js';
import { TasksService } from './tasks.service.js';

describe('TasksService', () => {
  let service: TasksService;
  let tenantContext: { getCompanyId: jest.Mock; runWithCompanyId: jest.Mock };
  let membershipsRepo: { findOne: jest.Mock };
  let tasksRepo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock; createQueryBuilder: jest.Mock };
  let collabApprovalNotifier: { pushToRoom: jest.Mock };
  let cacheService: { get: jest.Mock; set: jest.Mock };
  let nodesRepo: { find: jest.Mock };
  let agentsRepo: { find: jest.Mock };
  let taskDepsRepo: {
    delete: jest.Mock;
    insert: jest.Mock;
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  const companyId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const userId = '11111111-2222-3333-4444-555555555555';

  function createDefaultQueryBuilderMock() {
    const chain = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      clone: jest.fn(),
      getCount: jest.fn().mockResolvedValue(0),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    chain.clone.mockReturnValue(chain);
    return chain;
  }

  beforeEach(async () => {
    tenantContext = {
      getCompanyId: jest.fn(() => companyId),
      runWithCompanyId: jest.fn((_id: string, fn: () => unknown) => fn()),
    };
    membershipsRepo = {
      findOne: jest.fn(),
    };
    tasksRepo = {
      findOne: jest.fn(),
      save: jest.fn((t: Task) => Promise.resolve(t)),
      create: jest.fn((x: Partial<Task>) => ({ ...x, id: 'task-1' })),
      createQueryBuilder: jest.fn(() => createDefaultQueryBuilderMock()),
    };
    collabApprovalNotifier = { pushToRoom: jest.fn() };
    cacheService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(true),
    };
    nodesRepo = { find: jest.fn() };
    agentsRepo = { find: jest.fn() };
    const depQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    taskDepsRepo = {
      delete: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(() => depQb),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: DataSource, useValue: { query: jest.fn() } },
        { provide: getRepositoryToken(Task), useValue: tasksRepo },
        { provide: getRepositoryToken(TaskAssignment), useValue: {} },
        { provide: getRepositoryToken(CompanyMembership), useValue: membershipsRepo },
        { provide: getRepositoryToken(Agent), useValue: agentsRepo },
        { provide: getRepositoryToken(OrganizationNode), useValue: nodesRepo },
        { provide: getRepositoryToken(TaskDependency), useValue: taskDepsRepo },
        { provide: CacheService, useValue: cacheService },
        { provide: TenantContextService, useValue: tenantContext },
        {
          provide: MessagingService,
          useValue: { publish: jest.fn() },
        },
        {
          provide: CollaborationRealtimePublisher,
          useValue: { publishEnvelope: jest.fn() },
        },
        {
          provide: CollaborationApprovalNotifier,
          useValue: collabApprovalNotifier,
        },
      ],
    }).compile();

    service = module.get(TasksService);
  });

  it('create rejects non-owner/admin members', async () => {
    membershipsRepo.findOne.mockResolvedValue({
      companyId,
      userId,
      role: 'member',
      isActive: true,
    });

    await expect(
      service.create({ title: 'x' }, { id: userId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('updateProgress allows task creator', async () => {
    membershipsRepo.findOne.mockResolvedValue({
      companyId,
      userId,
      role: 'member',
      isActive: true,
    });
    tasksRepo.findOne.mockResolvedValue({
      id: 'task-1',
      companyId,
      status: 'in_progress',
      progress: 10,
      createdByUserId: userId,
      parentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Task);

    await service.updateProgress(
      'task-1',
      { progress: 50, status: 'in_progress' },
      { id: userId },
    );

    expect(tasksRepo.save).toHaveBeenCalled();
  });

  it('updateProgress rejects review tasks without approvalId', async () => {
    membershipsRepo.findOne.mockResolvedValue({
      companyId,
      userId,
      role: 'owner',
      isActive: true,
    });

    tasksRepo.findOne.mockResolvedValue({
      id: 'task-1',
      companyId,
      status: 'review',
      progress: 0,
      createdByUserId: userId,
      parentId: null,
      requiresHumanApproval: true,
      metadata: {
        taskReviewApprovalId: 'ap-1',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Task);

    await expect(
      service.updateProgress(
        'task-1',
        { status: 'in_progress' },
        { id: userId, roles: ['member'] },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('updateProgress rejects review tasks with wrong approvalId', async () => {
    membershipsRepo.findOne.mockResolvedValue({
      companyId,
      userId,
      role: 'owner',
      isActive: true,
    });

    tasksRepo.findOne.mockResolvedValue({
      id: 'task-1',
      companyId,
      status: 'review',
      progress: 0,
      createdByUserId: userId,
      parentId: null,
      requiresHumanApproval: true,
      metadata: {
        taskReviewApprovalId: 'ap-expected',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Task);

    await expect(
      service.updateProgress(
        'task-1',
        { status: 'in_progress', approvalId: 'ap-wrong' },
        { id: userId, roles: ['member'] },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('updateProgress allows review tasks with correct approvalId', async () => {
    membershipsRepo.findOne.mockResolvedValue({
      companyId,
      userId,
      role: 'owner',
      isActive: true,
    });

    tasksRepo.findOne.mockResolvedValue({
      id: 'task-1',
      companyId,
      status: 'review',
      progress: 0,
      createdByUserId: userId,
      parentId: null,
      requiresHumanApproval: true,
      metadata: {
        taskReviewApprovalId: 'ap-expected',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Task);

    await service.updateProgress(
      'task-1',
      { status: 'in_progress', approvalId: 'ap-expected', progress: 50 },
      { id: userId, roles: ['member'] },
    );

    expect(tasksRepo.save).toHaveBeenCalled();
  });

  it('maybeNotifyHumanApproval generates taskReviewApprovalId and forwards approvalId', async () => {
    const task: any = {
      id: 'task-1',
      companyId,
      roomId: 'room-1',
      status: 'review',
      requiresHumanApproval: true,
      assigneeId: 'agent-1',
      metadata: {
        roomId: 'room-1',
      },
    };

    await (service as any).maybeNotifyHumanApproval(task as Task);

    expect(collabApprovalNotifier.pushToRoom).toHaveBeenCalledTimes(1);
    const callArgs = collabApprovalNotifier.pushToRoom.mock.calls[0][0];
    expect(callArgs.approvalId).toBeDefined();
    expect(task.metadata.taskReviewApprovalId).toBe(callArgs.approvalId);
    expect(collabApprovalNotifier.pushToRoom.mock.calls[0][0].metadata).toEqual(
      expect.objectContaining({ taskId: 'task-1', kind: 'task_review' }),
    );
  });

  describe('findAll — departmentOrganizationNodeId', () => {
    const deptId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const slotId = 'ssssssss-ssss-ssss-ssss-ssssssssssss';

    function mockQueryBuilder() {
      const chain = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        clone: jest.fn(),
        getCount: jest.fn().mockResolvedValue(0),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      chain.clone.mockReturnValue(chain);
      return chain;
    }

    beforeEach(() => {
      membershipsRepo.findOne.mockResolvedValue({
        companyId,
        userId,
        role: 'member',
        isActive: true,
      });
    });

    it('rejects when combined with assigneeId', async () => {
      await expect(
        service.findAll(
          {
            departmentOrganizationNodeId: deptId,
            assigneeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            page: 1,
            pageSize: 10,
          },
          { id: userId },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(nodesRepo.find).not.toHaveBeenCalled();
    });

    it('rejects when node is not a department', async () => {
      cacheService.get.mockImplementation(async (key: string) => {
        if (key.includes(':org-tree:version')) {
          return 2;
        }
        return null;
      });
      const ceoId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
      nodesRepo.find.mockResolvedValue([{ id: ceoId, parentId: null, type: 'ceo' }]);

      await expect(
        service.findAll({ departmentOrganizationNodeId: ceoId, page: 1 }, { id: userId }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('on cache hit does not load organization nodes', async () => {
      cacheService.get.mockImplementation(async (key: string) => {
        if (key.includes(':org-tree:version')) {
          return 7;
        }
        return { subIds: [deptId, slotId] };
      });
      agentsRepo.find.mockResolvedValue([{ id: 'agent-1', organizationNodeId: slotId }]);
      const qb = mockQueryBuilder();
      tasksRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ departmentOrganizationNodeId: deptId, page: 1, pageSize: 10 }, { id: userId });

      expect(nodesRepo.find).not.toHaveBeenCalled();
      expect(agentsRepo.find).toHaveBeenCalled();
      expect(cacheService.set).not.toHaveBeenCalled();
      expect(qb.andWhere).toHaveBeenCalled();
    });

    it('on cache miss persists subtree ids', async () => {
      cacheService.get.mockImplementation(async (key: string) => {
        if (key.includes(':org-tree:version')) {
          return 4;
        }
        return null;
      });
      nodesRepo.find.mockResolvedValue([
        { id: deptId, parentId: null, type: 'department' },
        { id: slotId, parentId: deptId, type: 'agent' },
      ]);
      agentsRepo.find.mockResolvedValue([]);
      const qb = mockQueryBuilder();
      tasksRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ departmentOrganizationNodeId: deptId, page: 1 }, { id: userId });

      expect(nodesRepo.find).toHaveBeenCalled();
      expect(cacheService.set).toHaveBeenCalledWith(
        expect.stringMatching(/:tasks:dept-subtree:v4:dept:/),
        { subIds: expect.arrayContaining([deptId, slotId]) },
        300,
      );
    });
  });
});
