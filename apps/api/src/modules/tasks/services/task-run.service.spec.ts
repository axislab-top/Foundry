import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContextService } from '@service/tenant';
import { MessagingService } from '@service/messaging';
import { CompanyMembership } from '../../companies/entities/company-membership.entity.js';
import { TaskRun } from '../entities/task-run.entity.js';
import { TaskExecutionLog } from '../entities/task-execution-log.entity.js';
import { CollaborationRealtimePublisher } from '../../collaboration/services/collaboration-realtime-publisher.service.js';
import { Task } from '../entities/task.entity.js';
import { TaskRunService } from './task-run.service.js';

describe('TaskRunService', () => {
  let service: TaskRunService;
  let runsRepo: jest.Mocked<Pick<Repository<TaskRun>, 'create' | 'save' | 'findOne' | 'find' | 'count' | 'createQueryBuilder'>>;
  let membershipsRepo: { findOne: jest.Mock };
  const companyId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const actor = { id: '11111111-2222-3333-4444-555555555555', roles: ['admin'] };

  beforeEach(async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      clone: jest.fn(),
      getCount: jest.fn().mockResolvedValue(0),
      getMany: jest.fn().mockResolvedValue([]),
    };
    qb.clone.mockReturnValue(qb);

    runsRepo = {
      create: jest.fn((x) => x as TaskRun),
      save: jest.fn(async (x: TaskRun) => ({ ...x, id: x.id ?? 'run-1' } as TaskRun)),
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(() => qb),
    };
    membershipsRepo = { findOne: jest.fn() };

    const execLogsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      manager: { query: jest.fn().mockResolvedValue([]) },
    };
    const tasksRepo = { findOne: jest.fn(), createQueryBuilder: jest.fn() };

    const tenantContext = {
      getCompanyId: jest.fn(() => companyId),
      runWithCompanyId: jest.fn((_id: string, fn: () => unknown) => fn()),
    };

    const messaging = { publish: jest.fn().mockResolvedValue(true) };
    const collabRealtime = {
      publishRunStatusChanged: jest.fn().mockResolvedValue(undefined),
      publishEnvelope: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskRunService,
        { provide: getRepositoryToken(TaskRun), useValue: runsRepo },
        { provide: getRepositoryToken(TaskExecutionLog), useValue: execLogsRepo },
        { provide: getRepositoryToken(Task), useValue: tasksRepo },
        { provide: getRepositoryToken(CompanyMembership), useValue: membershipsRepo },
        { provide: TenantContextService, useValue: tenantContext },
        { provide: MessagingService, useValue: messaging },
        { provide: CollaborationRealtimePublisher, useValue: collabRealtime },
      ],
    }).compile();

    service = module.get(TaskRunService);
  });

  it('startRun creates running row', async () => {
    membershipsRepo.findOne.mockResolvedValue({ role: 'admin' });
    runsRepo.save.mockImplementation(async (x: TaskRun) => ({
      ...x,
      id: 'new-run',
      startedAt: new Date(),
    } as TaskRun));

    const out = await service.startRun(
      { triggerSource: 'manual', metadata: { k: 1 } },
      actor,
    );
    expect(out.status).toBe('running');
    expect(out.id).toBe('new-run');
  });

  it('getRun throws when missing', async () => {
    membershipsRepo.findOne.mockResolvedValue({ isActive: true });
    runsRepo.findOne.mockResolvedValue(null);
    await expect(service.getRun('missing', { id: actor.id })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects non-admin member for startRun', async () => {
    membershipsRepo.findOne.mockResolvedValue({ role: 'member' });
    await expect(
      service.startRun({ triggerSource: 'manual' }, { id: actor.id }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('listRuns with taskId adds EXISTS filter on execution logs', async () => {
    membershipsRepo.findOne.mockResolvedValue({ isActive: true });
    const taskId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    await service.listRuns({ id: actor.id }, { page: 1, limit: 10, taskId });
    expect(runsRepo.createQueryBuilder).toHaveBeenCalled();
    const qb = runsRepo.createQueryBuilder.mock.results[0].value;
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('task_execution_logs'),
      { filterTaskId: taskId },
    );
  });
});
