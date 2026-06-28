import { Company } from '../companies/entities/company.entity.js';
import { CompanyMembership } from '../companies/entities/company-membership.entity.js';
import { TasksService } from './services/tasks.service.js';

type TaskRecord = {
  id: string;
  companyId: string;
  parentId: string | null;
  title: string;
  description: string | null;
  status: 'pending';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  dueDate: Date | null;
  expectedOutput: string | null;
  progress: number;
  assigneeType: 'unassigned' | 'agent' | 'organization_node';
  assigneeId: string | null;
  skillIds: string[] | null;
  blockedReason: string | null;
  requiresHumanApproval: boolean;
  metadata: Record<string, unknown> | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

describe('TasksService.create member self-service', () => {
  const companyId = 'a0000000-0000-4000-8000-000000000001';
  const userId = 'b0000000-0000-4000-8000-000000000001';
  const agentId = 'c0000000-0000-4000-8000-000000000001';

  const buildHarness = (membershipRole: 'member' | 'owner') => {
    const now = new Date('2026-02-01T00:00:00.000Z');
    let taskSeq = 0;
    const tasks: TaskRecord[] = [];
    const membershipRow = { companyId, userId, role: membershipRole, isActive: true };

    const membershipsRepo: any = {
      findOne: jest.fn(async ({ where }: any) =>
        where.companyId === companyId && where.userId === userId ? membershipRow : null,
      ),
      manager: {
        transaction: jest.fn(async (cb: (m: any) => Promise<unknown>) => {
          const repo = {
            findOne: jest.fn(async ({ where }: any) => {
              if (where.companyId === companyId && where.userId === userId) {
                if ('isActive' in where && where.isActive === false) return null;
                return membershipRow;
              }
              return null;
            }),
            update: jest.fn(async () => ({ affected: 1 })),
            createQueryBuilder: jest.fn(() => ({
              insert: jest.fn().mockReturnThis(),
              into: jest.fn().mockReturnThis(),
              values: jest.fn().mockReturnThis(),
              orIgnore: jest.fn().mockReturnThis(),
              execute: jest.fn().mockResolvedValue(undefined),
            })),
          };
          const m = {
            query: jest.fn().mockResolvedValue(undefined),
            getRepository: (ent: unknown) => {
              if (ent === CompanyMembership) return repo;
              if (ent === Company) return { findOne: jest.fn().mockResolvedValue(null) };
              return { findOne: jest.fn().mockResolvedValue(null) };
            },
          };
          return cb(m);
        }),
      },
    };

    const tasksRepo: any = {
      findOne: jest.fn(async ({ where }: any) => {
        if (!where?.id) return null;
        return tasks.find((t) => t.id === where.id && t.companyId === where.companyId) ?? null;
      }),
      create: jest.fn((payload: Partial<TaskRecord>) => {
        const created: TaskRecord = {
          id: `task-${++taskSeq}`,
          companyId: payload.companyId as string,
          parentId: payload.parentId ?? null,
          title: payload.title ?? '',
          description: payload.description ?? null,
          status: 'pending',
          priority: (payload.priority as TaskRecord['priority']) ?? 'normal',
          dueDate: payload.dueDate ?? null,
          expectedOutput: payload.expectedOutput ?? null,
          progress: 0,
          assigneeType: (payload.assigneeType as TaskRecord['assigneeType']) ?? 'unassigned',
          assigneeId: payload.assigneeId ?? null,
          skillIds: payload.skillIds ?? null,
          blockedReason: null,
          requiresHumanApproval: payload.requiresHumanApproval ?? false,
          metadata: (payload.metadata as Record<string, unknown>) ?? null,
          createdByUserId: payload.createdByUserId ?? null,
          createdAt: new Date(now.getTime()),
          updatedAt: new Date(now.getTime()),
        };
        return created;
      }),
      save: jest.fn(async (payload: TaskRecord) => {
        const idx = tasks.findIndex((t) => t.id === payload.id);
        if (idx >= 0) tasks[idx] = { ...payload };
        else tasks.push({ ...payload });
        return { ...payload };
      }),
    };

    const taskDepsRepo: any = {
      delete: jest.fn(),
      insert: jest.fn(),
      find: jest.fn(async () => []),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };

    const assignmentsRepo: any = {
      create: jest.fn((x: unknown) => x),
      save: jest.fn(async (x: unknown) => x),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      })),
    };

    const agentsRepo: any = {
      findOne: jest.fn(async ({ where }: any) =>
        where?.id === agentId ? { id: agentId, companyId, role: 'executor' } : null,
      ),
      find: jest.fn(async () => []),
    };

    const nodesRepo: any = {
      findOne: jest.fn(async () => null),
      find: jest.fn(async () => []),
    };

    const tenantContext: any = {
      getCompanyId: () => companyId,
      runWithCompanyId: jest.fn((_cid: string, fn: () => Promise<unknown> | unknown) => fn()),
    };

    const messagingService: any = {
      publish: jest.fn(async () => true),
      subscribeWithBackoff: jest.fn(),
    };

    const tasksService = new TasksService(
      {} as any,
      tasksRepo,
      taskDepsRepo,
      assignmentsRepo,
      membershipsRepo,
      agentsRepo,
      nodesRepo,
      { get: jest.fn(async () => null), set: jest.fn(async () => true) } as any,
      tenantContext,
      messagingService,
      { publishEnvelope: jest.fn(async () => true) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return { tasksService, tasks, messagingService };
  };

  it('member may create unassigned task and gets member_self_service metadata', async () => {
    const { tasksService, tasks, messagingService } = buildHarness('member');
    const row = await tasksService.create({ title: 'Need visibility' }, { id: userId });
    expect(row.title).toBe('Need visibility');
    const stored = tasks.find((t) => t.id === row.id);
    expect((stored?.metadata as { createdVia?: string })?.createdVia).toBe('member_self_service');
    const createdEvt = messagingService.publish.mock.calls.find((c) => c[0]?.eventType === 'task.created');
    expect(createdEvt?.[0]?.data?.source).toBe('manual');
  });

  it('member cannot create with assignee', async () => {
    const { tasksService } = buildHarness('member');
    await expect(
      tasksService.create(
        { title: 'x', assigneeType: 'agent', assigneeId: agentId } as any,
        { id: userId },
      ),
    ).rejects.toThrow(/成员仅可创建未分配任务/);
  });

  it('member cannot spoof autonomous publish source', async () => {
    const { tasksService, messagingService } = buildHarness('member');
    await tasksService.create({ title: 'y' }, { id: userId }, { source: 'autonomous' });
    const createdEvt = messagingService.publish.mock.calls.find((c) => c[0]?.eventType === 'task.created');
    expect(createdEvt?.[0]?.data?.source).toBe('manual');
  });

  it('owner may create assigned task', async () => {
    const { tasksService } = buildHarness('owner');
    const row = await tasksService.create(
      { title: 'Exec', assigneeType: 'agent', assigneeId: agentId } as any,
      { id: userId },
    );
    expect(row.assigneeId).toBe(agentId);
  });
});
