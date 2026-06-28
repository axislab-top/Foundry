import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContextService } from '@service/tenant';
import { CompanyMembership } from '../../companies/entities/company-membership.entity.js';
import { TaskExecutionLog } from '../entities/task-execution-log.entity.js';
import { TaskRun } from '../entities/task-run.entity.js';
import { Task } from '../entities/task.entity.js';
import { ClickhouseTraceService } from '../../observability/clickhouse-trace.service.js';
import { CollaborationRealtimePublisher } from '../../collaboration/services/collaboration-realtime-publisher.service.js';
import { TaskExecutionService } from './task-execution.service.js';

describe('TaskExecutionService', () => {
  let service: TaskExecutionService;
  let logsRepo: jest.Mocked<Pick<Repository<TaskExecutionLog>, 'create' | 'save' | 'find'>>;
  let tasksRepo: { findOne: jest.Mock };
  let membershipsRepo: { findOne: jest.Mock };
  let runsRepo: { findOne: jest.Mock };

  const companyId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const taskId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const actor = { id: '11111111-2222-3333-4444-555555555555', roles: ['admin'] };

  beforeEach(async () => {
    logsRepo = {
      create: jest.fn((x) => x as TaskExecutionLog),
      save: jest.fn(async (x: TaskExecutionLog) => ({
        ...x,
        id: x.id ?? 'log-1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      })),
      find: jest.fn(),
    };
    tasksRepo = { findOne: jest.fn() };
    runsRepo = { findOne: jest.fn() };
    membershipsRepo = { findOne: jest.fn() };

    const tenantContext = {
      getCompanyId: jest.fn(() => companyId),
      runWithCompanyId: jest.fn((_id: string, fn: () => unknown) => fn()),
    };

    const clickhouseTrace = { mirrorExecutionLog: jest.fn().mockResolvedValue(undefined) };
    const collabRealtime = { publishExecutionLogAppended: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskExecutionService,
        { provide: getRepositoryToken(TaskExecutionLog), useValue: logsRepo },
        { provide: getRepositoryToken(Task), useValue: tasksRepo },
        { provide: getRepositoryToken(TaskRun), useValue: runsRepo },
        { provide: getRepositoryToken(CompanyMembership), useValue: membershipsRepo },
        { provide: TenantContextService, useValue: tenantContext },
        { provide: ClickhouseTraceService, useValue: clickhouseTrace },
        { provide: CollaborationRealtimePublisher, useValue: collabRealtime },
      ],
    }).compile();

    service = module.get(TaskExecutionService);
  });

  describe('listExecutionLogsGroupedByRun', () => {
    it('throws when task missing', async () => {
      membershipsRepo.findOne.mockResolvedValue({ isActive: true });
      tasksRepo.findOne.mockResolvedValue(null);
      await expect(
        service.listExecutionLogsGroupedByRun(taskId, actor, 50),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('groups logs by runId and sorts groups by latest activity', async () => {
      membershipsRepo.findOne.mockResolvedValue({ isActive: true });
      tasksRepo.findOne.mockResolvedValue({ id: taskId, companyId });
      const r1 = 'run-11111111-1111-1111-1111-111111111111';
      const r2 = 'run-22222222-2222-2222-2222-222222222222';
      logsRepo.find.mockResolvedValue([
        {
          id: 'a',
          companyId,
          taskId,
          agentId: null,
          stepType: 's1',
          message: 'm1',
          outputSnapshot: null,
          billingUnits: null,
          durationMs: null,
          traceId: null,
          runId: r1,
          createdAt: new Date('2026-01-02T10:00:00Z'),
        },
        {
          id: 'b',
          companyId,
          taskId,
          agentId: null,
          stepType: 's0',
          message: 'older',
          outputSnapshot: null,
          billingUnits: null,
          durationMs: null,
          traceId: null,
          runId: r1,
          createdAt: new Date('2026-01-02T09:00:00Z'),
        },
        {
          id: 'c',
          companyId,
          taskId,
          agentId: null,
          stepType: 's2',
          message: 'latest run',
          outputSnapshot: null,
          billingUnits: null,
          durationMs: null,
          traceId: null,
          runId: r2,
          createdAt: new Date('2026-01-03T12:00:00Z'),
        },
      ] as TaskExecutionLog[]);

      const out = await service.listExecutionLogsGroupedByRun(taskId, actor, 200);
      expect(out.taskId).toBe(taskId);
      expect(out.groups).toHaveLength(2);
      expect(out.groups[0].runId).toBe(r2);
      expect(out.groups[1].runId).toBe(r1);
      expect(out.groups[1].items.map((x) => x.stepType)).toEqual(['s0', 's1']);
    });
  });
});
