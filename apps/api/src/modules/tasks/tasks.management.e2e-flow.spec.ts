import { Company } from '../companies/entities/company.entity.js';
import { CompanyMembership } from '../companies/entities/company-membership.entity.js';
import { TasksService } from './services/tasks.service.js';
import { DirectorManagementMemoryListener } from '../memory/listeners/director-management-memory.listener.js';
import { DirectorManagementFacadeService } from './services/director-management-facade.service.js';

type TaskRecord = {
  id: string;
  companyId: string;
  parentId: string | null;
  title: string;
  description: string | null;
  status:
    | 'pending'
    | 'in_progress'
    | 'review'
    | 'awaiting_approval'
    | 'completed'
    | 'blocked'
    | 'cancelled'
    | 'paused';
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

type NodeRecord = {
  id: string;
  companyId: string;
  parentId: string | null;
  agentId: string | null;
  type: string;
};

type AgentRecord = {
  id: string;
  companyId: string;
  role: 'ceo' | 'director' | 'executor';
  organizationNodeId: string | null;
  reportsToAgentId?: string | null;
};

describe('Management chain acceptance flow', () => {
  const companyId = '10000000-0000-4000-8000-000000000001';
  const actorId = '20000000-0000-4000-8000-000000000001';
  const directorId = '30000000-0000-4000-8000-000000000001';
  const executorId = '40000000-0000-4000-8000-000000000001';
  const ceoId = '50000000-0000-4000-8000-000000000001';

  const createHarness = () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    let taskSeq = 0;
    const tasks: TaskRecord[] = [];
    const nodes: NodeRecord[] = [
      {
        id: 'node-director',
        companyId,
        parentId: null,
        agentId: directorId,
        type: 'agent',
      },
      {
        id: 'node-executor',
        companyId,
        parentId: 'node-director',
        agentId: executorId,
        type: 'agent',
      },
    ];
    const agents: AgentRecord[] = [
      {
        id: ceoId,
        companyId,
        role: 'ceo',
        organizationNodeId: null,
        reportsToAgentId: null,
      },
      {
        id: directorId,
        companyId,
        role: 'director',
        organizationNodeId: 'node-director',
        reportsToAgentId: ceoId,
      },
      {
        id: executorId,
        companyId,
        role: 'executor',
        organizationNodeId: 'node-executor',
        reportsToAgentId: directorId,
      },
    ];
    const publishedEvents: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
    const memoryEntries: Array<{ content: string; metadata?: Record<string, unknown> | null }> = [];

    const membershipRow = { companyId, userId: actorId, role: 'owner' as const, isActive: true };
    const membershipsRepo: any = {
      findOne: jest.fn(async ({ where }: any) =>
        where.companyId === companyId && where.userId === actorId ? membershipRow : null,
      ),
      manager: {
        transaction: jest.fn(async (cb: (m: any) => Promise<unknown>) => {
          const repo = {
            findOne: jest.fn(async ({ where }: any) => {
              if (where.companyId === companyId && where.userId === actorId) {
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
              if (ent === Company) {
                return { findOne: jest.fn().mockResolvedValue(null) };
              }
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
      find: jest.fn(async ({ where }: any) => {
        if (Array.isArray(where)) {
          return tasks.filter((t) =>
            where.some((w) => t.id === w.id && t.companyId === w.companyId),
          );
        }
        if (where?.parentId !== undefined) {
          return tasks.filter(
            (t) => t.companyId === where.companyId && t.parentId === (where.parentId ?? null),
          );
        }
        if (where?.companyId) {
          return tasks.filter((t) => t.companyId === where.companyId);
        }
        return [];
      }),
      create: jest.fn((payload: Partial<TaskRecord>) => {
        const created: TaskRecord = {
          id: `task-${++taskSeq}`,
          companyId: payload.companyId as string,
          parentId: payload.parentId ?? null,
          title: payload.title ?? '',
          description: payload.description ?? null,
          status: (payload.status as TaskRecord['status']) ?? 'pending',
          priority: (payload.priority as TaskRecord['priority']) ?? 'normal',
          dueDate: payload.dueDate ?? null,
          expectedOutput: payload.expectedOutput ?? null,
          progress: payload.progress ?? 0,
          assigneeType: (payload.assigneeType as TaskRecord['assigneeType']) ?? 'unassigned',
          assigneeId: payload.assigneeId ?? null,
          skillIds: payload.skillIds ?? null,
          blockedReason: payload.blockedReason ?? null,
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
        payload.updatedAt = new Date(payload.updatedAt.getTime() + 1000);
        if (idx >= 0) tasks[idx] = { ...payload };
        else tasks.push({ ...payload });
        return { ...payload };
      }),
      remove: jest.fn(),
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

    const nodesRepo: any = {
      findOne: jest.fn(async ({ where }: any) => {
        if (where?.id) {
          return nodes.find((n) => n.id === where.id && n.companyId === where.companyId) ?? null;
        }
        return null;
      }),
      find: jest.fn(async ({ where }: any) =>
        nodes.filter(
          (n) =>
            n.companyId === where.companyId &&
            (where.parentId === undefined ? true : n.parentId === where.parentId),
        ),
      ),
    };

    const agentsRepo: any = {
      findOne: jest.fn(async ({ where }: any) =>
        agents.find(
          (a) =>
            a.id === where.id &&
            a.companyId === where.companyId &&
            (where.role ? a.role === where.role : true),
        ) ?? null,
      ),
      find: jest.fn(async ({ where }: any) => {
        if (Array.isArray(where)) {
          return agents.filter((a) =>
            where.some((w) => a.id === w.id && a.companyId === w.companyId),
          );
        }
        return agents.filter((a) => a.companyId === where.companyId);
      }),
    };

    const tenantContext: any = {
      getCompanyId: () => companyId,
      runWithCompanyId: jest.fn((_cid: string, fn: () => Promise<unknown> | unknown) => fn()),
    };

    const messagingService: any = {
      publish: jest.fn(async (event: Record<string, unknown>) => {
        publishedEvents.push({ eventType: String(event.eventType), payload: event });
        return true;
      }),
      subscribeWithBackoff: jest.fn(),
    };

    const memoryService: any = {
      storeEntry: jest.fn(async (entry: { content: string; metadata?: Record<string, unknown> }) => {
        memoryEntries.push({ content: entry.content, metadata: entry.metadata ?? null });
        return { id: `mem-${memoryEntries.length}` };
      }),
    };

    const idempotencyRepo: any = {
      seen: new Set<string>(),
      insert: jest.fn(async ({ companyId: cid, eventType, idempotencyKey }: any) => {
        const key = `${cid}:${eventType}:${idempotencyKey}`;
        if (idempotencyRepo.seen.has(key)) {
          const err: any = new Error('duplicate');
          err.code = '23505';
          throw err;
        }
        idempotencyRepo.seen.add(key);
        return { identifiers: [{ id: key }] };
      }),
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
    const directorManagementStub: any = {
      delegateTask: jest.fn(),
      submitReview: jest.fn(),
      reviewBatchApprove: jest.fn(),
      generateProgressReport: jest.fn(),
    };
    const boundSkills = new Map<string, string[]>([
      [ceoId, ['skill-ceo-breakdown', 'skill-ceo-assigner']],
    ]);
    const skillNameToId = new Map<string, string>([
      ['ceo-strategic-breakdown', 'skill-ceo-breakdown'],
      ['ceo-task-assigner', 'skill-ceo-assigner'],
      ['director-task-delegator', 'skill-dir-delegate'],
      ['director-subordinate-reviewer', 'skill-dir-reviewer'],
      ['director-team-performance-coach', 'skill-dir-coach'],
      ['director-progress-reporter', 'skill-dir-reporter'],
    ]);
    const agentSkillService: any = {
      listSkillIdsForAgent: jest.fn(async (agentId: string) => boundSkills.get(agentId) ?? []),
    };
    const skillsService: any = {
      findGlobalSkillIdsByNames: jest.fn(async (names: string[]) =>
        names.map((x) => skillNameToId.get(x)).filter((x): x is string => Boolean(x)),
      ),
      assertSkillUsableByTenant: jest.fn(async () => true),
    };
    const facade = new DirectorManagementFacadeService(
      directorManagementStub,
      tasksService,
      agentSkillService,
      skillsService,
      messagingService,
      agentsRepo,
      tasksRepo,
    );

    const listener = new DirectorManagementMemoryListener(
      messagingService,
      tenantContext,
      memoryService,
      idempotencyRepo,
    );
    listener.onModuleInit();

    return {
      tasksService,
      facade,
      subscriptions: messagingService.subscribeWithBackoff.mock.calls,
      publishedEvents,
      memoryEntries,
    };
  };

  it('delegates, completes, reviews, reports and persists memory once', async () => {
    const { tasksService, subscriptions, publishedEvents, memoryEntries } = createHarness();

    const rootTask = await tasksService.create(
      {
        title: 'Root strategic objective',
        assigneeType: 'agent',
        assigneeId: directorId,
      } as any,
      { id: actorId, roles: ['member'] },
    );

    const delegated = await tasksService.delegateByDirector(
      String(rootTask.id),
      {
        directorAgentId: directorId,
        assigneeAgentId: executorId,
        title: 'Execute milestone A',
        successCriteria: ['deliver demo'],
      },
      { id: actorId, roles: ['member'] },
    );

    await tasksService.updateProgress(
      String(delegated.id),
      { status: 'completed', progress: 100 },
      { id: actorId, roles: ['member'] },
    );

    await tasksService.submitDirectorReview(
      String(delegated.id),
      {
        reviewerAgentId: directorId,
        qualityScore: 92,
        overallAssessment: 'good',
        approveToProceed: true,
      },
      { id: actorId, roles: ['member'] },
    );

    const reviewSub = subscriptions.find((x: any[]) => x[0] === 'task.reviewed.by_director')?.[1];
    const progressSub = subscriptions.find((x: any[]) => x[0] === 'director.progress.reported')?.[1];
    expect(reviewSub).toBeDefined();
    expect(progressSub).toBeDefined();

    await reviewSub({
      eventId: 'evt-review-1',
      companyId,
      data: {
        companyId,
        taskId: String(delegated.id),
        reviewerAgentId: directorId,
        qualityScore: 92,
        overallAssessment: 'good',
        approveToProceed: true,
        performanceImpact: 'positive',
      },
    });

    const progressEvent = {
      eventId: 'evt-progress-1',
      companyId,
      data: {
        companyId,
        directorAgentId: directorId,
        roomId: '50000000-0000-4000-8000-000000000001',
        reportType: 'heartbeat',
        messageId: '60000000-0000-4000-8000-000000000001',
      },
    };
    await progressSub(progressEvent);
    await progressSub(progressEvent);

    const eventTypes = publishedEvents.map((e) => e.eventType);
    expect(eventTypes).toContain('task.assigned');
    expect(eventTypes).toContain('task.completed');
    expect(eventTypes).toContain('task.reviewed.by_director');

    expect(memoryEntries.some((x) => x.content.includes('主管审查'))).toBe(true);
    const progressMemories = memoryEntries.filter((x) => x.content.includes('主管汇报'));
    expect(progressMemories).toHaveLength(1);
  });

  it('CEO should breakdown strategic goal and delegate to Director via skills', async () => {
    const { facade, tasksService, publishedEvents } = createHarness();
    const traceId = '70000000-0000-4000-8000-000000000001';

    const delegated = await facade.delegateFromCeo(
      companyId,
      {
        ceoAgentId: ceoId,
        directorAgentId: directorId,
        title: 'Launch Q2 strategic campaign',
        description: 'CEO breakdown delegated to marketing director',
        priority: 'high',
        traceId,
        source: 'ceo-strategic-breakdown',
      },
      { id: actorId, roles: ['owner'] },
    );

    expect(delegated).toBeDefined();
    const saved = await tasksService.findOne(String((delegated as any).id), {
      id: actorId,
      roles: ['owner'],
    });
    expect(saved.assigneeId).toBe(directorId);
    expect(saved.assigneeType).toBe('agent');
    expect((saved.metadata as any)?.traceId).toBe(traceId);

    const taskAssignedEvents = publishedEvents.filter((e) => e.eventType === 'task.assigned');
    expect(taskAssignedEvents.length).toBeGreaterThan(0);

    const skillEvents = publishedEvents.filter((e) => e.eventType === 'skill.executed');
    expect(skillEvents).toHaveLength(2);
    const executedNames = skillEvents.map((e) => String((e.payload as any)?.data?.skillName));
    expect(executedNames).toContain('ceo-strategic-breakdown');
    expect(executedNames).toContain('ceo-task-assigner');
    expect(skillEvents.every((e) => (e.payload as any)?.data?.traceId === traceId)).toBe(true);
  });
});
