import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MessagingService } from '@service/messaging';
import { TenantContextService } from '@service/tenant';
import { CollaborationApprovalNotifier } from '../../collaboration/services/collaboration-approval-notifier.service.js';
import { ChatMessageService } from '../../collaboration/services/chat-message.service.js';
import { ChatRoomService } from '../../collaboration/services/chat-room.service.js';
import { DiscussionThreadService } from '../../collaboration/services/discussion-thread.service.js';
import { RoomMemberService } from '../../collaboration/services/room-member.service.js';
import { CacheService } from '../../../common/cache/cache.service.js';
import { CollaborationRealtimePublisher } from '../../collaboration/services/collaboration-realtime-publisher.service.js';
import { Agent } from '../../agents/entities/agent.entity.js';
import { CompanyMembership } from '../../companies/entities/company-membership.entity.js';
import { OrganizationNode } from '../../organization/entities/organization-node.entity.js';
import { TaskAssignment } from '../entities/task-assignment.entity.js';
import { TaskDependency } from '../entities/task-dependency.entity.js';
import { Task } from '../entities/task.entity.js';
import { TasksService } from './tasks.service.js';
import { ConfigService } from '../../../common/config/config.service.js';

describe('TasksService', () => {
  let service: TasksService;
  let tenantContext: { getCompanyId: jest.Mock; runWithCompanyId: jest.Mock };
  let membershipsRepo: { findOne: jest.Mock };
  let tasksRepo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock; createQueryBuilder: jest.Mock };
  let collabApprovalNotifier: { pushToRoom: jest.Mock };
  let messagingService: { publish: jest.Mock };
  let cacheService: { get: jest.Mock; set: jest.Mock };
  let nodesRepo: { find: jest.Mock; findOne: jest.Mock };
  let agentsRepo: { find: jest.Mock; findOne: jest.Mock };
  let chatRooms: { findMainRoom: jest.Mock; findOneOrFail: jest.Mock };
  let chatMessages: { appendSystemMessageAsActor: jest.Mock };
  let threads: { create: jest.Mock; mergeMetadata: jest.Mock };
  let roomMembers: { isActiveMember: jest.Mock; listActiveMembers: jest.Mock };
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
      manager: {
        transaction: jest.fn(async (fn: (manager: any) => any) => {
          const mgr = {
            query: jest.fn().mockResolvedValue(undefined),
            getRepository: jest.fn(() => ({
              findOne: membershipsRepo.findOne,
              update: jest.fn().mockResolvedValue(undefined),
              createQueryBuilder: jest.fn(() => ({
                insert: jest.fn().mockReturnThis(),
                into: jest.fn().mockReturnThis(),
                values: jest.fn().mockReturnThis(),
                orIgnore: jest.fn().mockReturnThis(),
                execute: jest.fn().mockResolvedValue(undefined),
              })),
            })),
          };
          return fn(mgr);
        }),
      },
    };
    tasksRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn((t: Task) => Promise.resolve(t)),
      create: jest.fn((x: Partial<Task>) => ({
        assigneeType: 'unassigned',
        assigneeId: null,
        status: 'pending',
        progress: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...x,
        id: 'task-1',
      })),
      createQueryBuilder: jest.fn(() => createDefaultQueryBuilderMock()),
    };
    collabApprovalNotifier = { pushToRoom: jest.fn() };
    cacheService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(true),
    };
    nodesRepo = { find: jest.fn(), findOne: jest.fn() };
    agentsRepo = { find: jest.fn(), findOne: jest.fn() };
    messagingService = { publish: jest.fn() };
    chatRooms = { findMainRoom: jest.fn(), findOneOrFail: jest.fn() };
    chatMessages = { appendSystemMessageAsActor: jest.fn() };
    threads = { create: jest.fn(), mergeMetadata: jest.fn() };
    roomMembers = {
      isActiveMember: jest.fn().mockResolvedValue(true),
      listActiveMembers: jest.fn().mockResolvedValue([]),
    };
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
        {
          provide: getRepositoryToken(TaskAssignment),
          useValue: {
            create: jest.fn((x: unknown) => x),
            save: jest.fn(async (x: unknown) => x),
            createQueryBuilder: jest.fn(() => ({
              update: jest.fn().mockReturnThis(),
              set: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              execute: jest.fn().mockResolvedValue(undefined),
            })),
          },
        },
        { provide: getRepositoryToken(CompanyMembership), useValue: membershipsRepo },
        { provide: getRepositoryToken(Agent), useValue: agentsRepo },
        { provide: getRepositoryToken(OrganizationNode), useValue: nodesRepo },
        { provide: getRepositoryToken(TaskDependency), useValue: taskDepsRepo },
        { provide: CacheService, useValue: cacheService },
        { provide: TenantContextService, useValue: tenantContext },
        {
          provide: MessagingService,
          useValue: messagingService,
        },
        {
          provide: CollaborationRealtimePublisher,
          useValue: { publishEnvelope: jest.fn() },
        },
        {
          provide: CollaborationApprovalNotifier,
          useValue: collabApprovalNotifier,
        },
        { provide: ChatRoomService, useValue: chatRooms },
        { provide: ChatMessageService, useValue: chatMessages },
        { provide: DiscussionThreadService, useValue: threads },
        { provide: RoomMemberService, useValue: roomMembers },
        {
          provide: ConfigService,
          useValue: {
            isCollabDeptDispatchSystemCardEnabled: jest.fn(() => true),
          },
        },
      ],
    }).compile();

    service = module.get(TasksService);
  });

  it('create allows member self-service unassigned task', async () => {
    membershipsRepo.findOne.mockResolvedValue({
      companyId,
      userId,
      role: 'member',
      isActive: true,
    });

    const out = await service.create({ title: 'x' }, { id: userId });
    expect(out.title).toBe('x');
    expect((out.metadata as { createdVia?: string })?.createdVia).toBe('member_self_service');
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

  describe('findAll — priority and q', () => {
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

    it('filters by priority', async () => {
      const qb = mockQueryBuilder();
      tasksRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ priority: 'high', page: 1, pageSize: 10 }, { id: userId });

      expect(qb.andWhere).toHaveBeenCalledWith('t.priority = :priority', { priority: 'high' });
    });

    it('filters by title keyword', async () => {
      const qb = mockQueryBuilder();
      tasksRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ q: '  landing  ', page: 1, pageSize: 10 }, { id: userId });

      expect(qb.andWhere).toHaveBeenCalledWith('t.title ILIKE :q', { q: '%landing%' });
    });
  });

  describe('director management flows', () => {
    const directorId = '22222222-2222-2222-2222-222222222222';
    const subordinateId = '33333333-3333-3333-3333-333333333333';
    const parentTaskId = 'parent-task-1';

    beforeEach(() => {
      membershipsRepo.findOne.mockResolvedValue({
        companyId,
        userId,
        role: 'member',
        isActive: true,
      });
    });

    it('delegateByDirector creates child task for direct subordinate', async () => {
      tasksRepo.findOne.mockResolvedValueOnce({
        id: parentTaskId,
        companyId,
        assigneeType: 'agent',
        assigneeId: directorId,
      } as Task);
      agentsRepo.findOne
        .mockResolvedValueOnce({
          id: directorId,
          companyId,
          role: 'director',
          organizationNodeId: 'node-director',
        })
        .mockResolvedValueOnce({
          id: subordinateId,
          companyId,
          role: 'executor',
          organizationNodeId: 'node-subordinate',
        });
      nodesRepo.findOne.mockResolvedValue({
        id: 'node-subordinate',
        parentId: 'node-director',
      });

      const out = await service.delegateByDirector(
        parentTaskId,
        {
          directorAgentId: directorId,
          assigneeAgentId: subordinateId,
          title: 'delegated',
        },
        { id: userId },
      );

      expect(tasksRepo.save).toHaveBeenCalled();
      expect(out.assigneeId).toBe(subordinateId);
      expect(messagingService.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'task.assigned' }),
        expect.objectContaining({ routingKey: 'task.assigned' }),
      );
    });

    it('submitDirectorReview publishes reviewed event', async () => {
      tasksRepo.findOne.mockResolvedValue({
        id: 'task-2',
        companyId,
        assigneeType: 'agent',
        assigneeId: subordinateId,
        status: 'completed',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Task);
      agentsRepo.findOne
        .mockResolvedValueOnce({
          id: directorId,
          companyId,
          role: 'director',
          organizationNodeId: 'node-director',
        })
        .mockResolvedValueOnce({
          id: subordinateId,
          companyId,
          role: 'executor',
          organizationNodeId: 'node-subordinate',
        });
      nodesRepo.findOne.mockResolvedValue({
        id: 'node-subordinate',
        parentId: 'node-director',
      });

      await service.submitDirectorReview(
        'task-2',
        {
          reviewerAgentId: directorId,
          qualityScore: 88,
          overallAssessment: 'good',
          approveToProceed: true,
        },
        { id: userId },
      );

      expect(messagingService.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'task.reviewed.by_director' }),
        expect.objectContaining({ routingKey: 'task.reviewed.by_director' }),
      );
    });
  });

  describe('completeMainRoomDistributionSubGoal', () => {
    const parentId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const childId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    it('marks L2 sub-goal completed and publishes task.completed for admin actor', async () => {
      membershipsRepo.findOne.mockResolvedValue({
        companyId,
        userId,
        role: 'member',
        isActive: true,
      });
      const child = {
        id: childId,
        companyId,
        parentId,
        status: 'in_progress',
        progress: 40,
        metadata: {
          goalDelegationKey: 'main_room_l2:plan-x:wave-a:ops',
          goalLevel: 'sub',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Task;
      tasksRepo.findOne.mockResolvedValue(child);

      const out = await service.completeMainRoomDistributionSubGoal(
        childId,
        { parentGoalTaskId: parentId, reason: '编排监督确认结案' },
        { id: userId, roles: ['admin'] },
      );

      expect((out as { status?: string }).status).toBe('completed');
      expect(messagingService.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'task.completed' }),
        expect.anything(),
      );
      expect(tasksRepo.save).toHaveBeenCalled();
    });

    it('rejects non-privileged members', async () => {
      membershipsRepo.findOne.mockResolvedValue({
        companyId,
        userId,
        role: 'member',
        isActive: true,
      });
      tasksRepo.findOne.mockResolvedValue({
        id: childId,
        companyId,
        parentId,
        status: 'in_progress',
        metadata: { goalDelegationKey: 'main_room_l2:plan-x:wave-a:ops' },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Task);

      await expect(
        service.completeMainRoomDistributionSubGoal(childId, { parentGoalTaskId: parentId }, { id: userId }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects non-L2 goalDelegationKey', async () => {
      membershipsRepo.findOne.mockResolvedValue({
        companyId,
        userId,
        role: 'owner',
        isActive: true,
      });
      tasksRepo.findOne.mockResolvedValue({
        id: childId,
        companyId,
        parentId,
        status: 'in_progress',
        metadata: { goalDelegationKey: 'manual:ops' },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Task);

      await expect(
        service.completeMainRoomDistributionSubGoal(childId, { parentGoalTaskId: parentId }, { id: userId }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects wrong parentGoalTaskId', async () => {
      membershipsRepo.findOne.mockResolvedValue({
        companyId,
        userId,
        role: 'owner',
        isActive: true,
      });
      tasksRepo.findOne.mockResolvedValue({
        id: childId,
        companyId,
        parentId,
        status: 'in_progress',
        metadata: { goalDelegationKey: 'main_room_l2:plan-x:wave-a:ops' },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Task);

      await expect(
        service.completeMainRoomDistributionSubGoal(childId, { parentGoalTaskId: '00000000-0000-0000-0000-000000000001' }, {
          id: userId,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('task chat chain', () => {
    const taskId = 'task-chat-1';
    const deptRoomId = 'room-dept-1';
    const mainRoomId = 'room-main-1';
    const baseTask = {
      id: taskId,
      companyId,
      title: '短视频营销方案',
      description: '完成选题与脚本',
      status: 'in_progress',
      progress: 40,
      parentId: null,
      metadata: {},
      dueDate: null,
      expectedOutput: null,
      blockedReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Task;

    beforeEach(() => {
      membershipsRepo.findOne.mockResolvedValue({
        companyId,
        userId,
        role: 'owner',
        isActive: true,
      });
      tasksRepo.findOne.mockResolvedValue(baseTask);
      roomMembers.isActiveMember.mockResolvedValue(true);
      chatRooms.findMainRoom.mockResolvedValue({ id: mainRoomId, roomType: 'main' });
      chatMessages.appendSystemMessageAsActor.mockResolvedValue({ id: 'msg-1' });
      threads.create.mockResolvedValue({ id: 'thread-1' });
      threads.mergeMetadata.mockResolvedValue(undefined);
    });

    it('dispatchTaskToDepartmentRoom posts department_dispatch card and thread', async () => {
      chatRooms.findOneOrFail.mockResolvedValue({
        id: deptRoomId,
        roomType: 'department',
        organizationNodeId: 'org-dept-marketing',
      });

      const out = await service.dispatchTaskToDepartmentRoom(
        taskId,
        { departmentRoomId: deptRoomId, fromRoomId: mainRoomId },
        { id: userId },
      );

      expect(out.roomId).toBe(deptRoomId);
      expect(out.threadId).toBe('thread-1');
      expect(chatMessages.appendSystemMessageAsActor).toHaveBeenCalledWith(
        companyId,
        deptRoomId,
        userId,
        expect.stringContaining('【部门任务下发】'),
        expect.objectContaining({
          source: 'task_dispatch',
          taskId,
          richCard: expect.objectContaining({ cardType: 'department_dispatch' }),
        }),
      );
      expect(tasksRepo.save).toHaveBeenCalled();
    });

    it('reportTaskToMainRoom requires owner/admin and publishes task.report.generated', async () => {
      chatRooms.findOneOrFail.mockResolvedValue({ id: mainRoomId, roomType: 'main' });

      const out = await service.reportTaskToMainRoom(
        taskId,
        { summary: '市场部已完成脚本初稿', sourceRoomId: deptRoomId },
        { id: userId },
      );

      expect(out.roomId).toBe(mainRoomId);
      expect(chatMessages.appendSystemMessageAsActor).toHaveBeenCalledWith(
        companyId,
        mainRoomId,
        userId,
        expect.stringContaining('部门汇总·任务回报'),
        expect.objectContaining({
          richCard: expect.objectContaining({ cardType: 'report_summary' }),
        }),
      );
      expect(messagingService.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'task.report.generated' }),
        expect.any(Object),
      );
    });

    it('reportTaskToMainRoom rejects non-manager member', async () => {
      membershipsRepo.findOne.mockResolvedValue({
        companyId,
        userId,
        role: 'member',
        isActive: true,
      });

      await expect(
        service.reportTaskToMainRoom(taskId, { summary: 'x' }, { id: userId }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('requestTaskCoordination posts coordination_request and publishes escalation', async () => {
      chatRooms.findOneOrFail.mockImplementation(async (_cid: string, rid: string) => {
        if (rid === mainRoomId) return { id: mainRoomId, roomType: 'main' };
        if (rid === deptRoomId) return { id: deptRoomId, roomType: 'department' };
        throw new Error('room not found');
      });

      const out = await service.requestTaskCoordination(
        taskId,
        {
          targetDepartmentRoomId: deptRoomId,
          request: '请技术部提供数据接口文档',
          sourceRoomId: deptRoomId,
        },
        { id: userId },
      );

      expect(out.roomId).toBe(mainRoomId);
      expect(chatMessages.appendSystemMessageAsActor).toHaveBeenCalledWith(
        companyId,
        mainRoomId,
        userId,
        expect.stringContaining('【跨部门协调】'),
        expect.objectContaining({
          richCard: expect.objectContaining({ cardType: 'coordination_request' }),
        }),
      );
      expect(messagingService.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'task.escalation.requested' }),
        expect.any(Object),
      );
    });
  });

  describe('delegation candidates', () => {
    it('returns ranked candidates in room scope', async () => {
      membershipsRepo.findOne.mockResolvedValue({
        companyId,
        userId,
        role: 'member',
        isActive: true,
      });
      tasksRepo.findOne.mockResolvedValue({
        id: 'task-root',
        companyId,
        assigneeType: 'agent',
        assigneeId: 'director-1',
      } as Task);
      agentsRepo.findOne.mockResolvedValue({
        id: 'director-1',
        companyId,
        role: 'director',
        status: 'active',
      });
      roomMembers.listActiveMembers.mockResolvedValue([
        { memberType: 'agent', memberId: 'a-1' },
        { memberType: 'agent', memberId: 'a-2' },
      ]);
      agentsRepo.find.mockResolvedValue([
        { id: 'director-1', name: 'Dir', role: 'director', reportsToAgentId: null, status: 'active' },
        { id: 'a-1', name: 'A1', role: 'executor', reportsToAgentId: 'director-1', status: 'active' },
        { id: 'a-2', name: 'A2', role: 'executor', reportsToAgentId: null, status: 'active' },
      ]);
      const qb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { assigneeId: 'a-1', activeCount: '3', blockedCount: '1', inProgressCount: '2' },
          { assigneeId: 'a-2', activeCount: '1', blockedCount: '0', inProgressCount: '1' },
        ]),
      };
      tasksRepo.createQueryBuilder.mockReturnValue(qb);

      const out = await service.listDelegationCandidates(
        'task-root',
        { roomId: 'room-1', limit: 10 },
        { id: userId },
      );
      expect(roomMembers.isActiveMember).toHaveBeenCalledWith(companyId, 'room-1', 'human', userId);
      expect(out.items.length).toBe(2);
      expect(out.items[0]?.agentId).toBe('a-1');
      expect(out.items[0]?.directReport).toBe(true);
    });
  });

  describe('assign', () => {
    it('rejects member who is not task creator', async () => {
      membershipsRepo.findOne.mockResolvedValue({
        companyId,
        userId,
        role: 'member',
        isActive: true,
      });
      tasksRepo.findOne.mockResolvedValue({
        id: 'task-1',
        companyId,
        assigneeType: 'unassigned',
        assigneeId: null,
        status: 'pending',
        progress: 0,
        createdByUserId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Task);

      await expect(
        service.assign('task-1', { assigneeType: 'agent', assigneeId: 'agent-1' }, { id: userId }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows task creator member to assign', async () => {
      membershipsRepo.findOne.mockResolvedValue({
        companyId,
        userId,
        role: 'member',
        isActive: true,
      });
      tasksRepo.findOne.mockResolvedValue({
        id: 'task-1',
        companyId,
        assigneeType: 'unassigned',
        assigneeId: null,
        status: 'pending',
        progress: 0,
        createdByUserId: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Task);
      agentsRepo.findOne.mockResolvedValue({ id: 'agent-1', companyId });

      await service.assign('task-1', { assigneeType: 'agent', assigneeId: 'agent-1' }, { id: userId });

      expect(tasksRepo.save).toHaveBeenCalled();
    });

    it('allows company admin to assign others tasks', async () => {
      membershipsRepo.findOne.mockResolvedValue({
        companyId,
        userId,
        role: 'admin',
        isActive: true,
      });
      tasksRepo.findOne.mockResolvedValue({
        id: 'task-1',
        companyId,
        assigneeType: 'unassigned',
        assigneeId: null,
        status: 'pending',
        progress: 0,
        createdByUserId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Task);
      agentsRepo.findOne.mockResolvedValue({ id: 'agent-1', companyId });

      await service.assign('task-1', { assigneeType: 'agent', assigneeId: 'agent-1' }, { id: userId });

      expect(tasksRepo.save).toHaveBeenCalled();
    });
  });
});
