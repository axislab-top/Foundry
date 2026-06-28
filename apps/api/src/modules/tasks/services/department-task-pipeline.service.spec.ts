import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DEPT_PIPELINE_KIND } from '@contracts/types';
import { Agent } from '../../agents/entities/agent.entity.js';
import { OrganizationNode } from '../../organization/entities/organization-node.entity.js';
import { Task } from '../entities/task.entity.js';
import { TaskDependency } from '../entities/task-dependency.entity.js';
import { DepartmentTaskPipelineService } from './department-task-pipeline.service.js';
import { TasksService } from './tasks.service.js';

describe('DepartmentTaskPipelineService', () => {
  const companyId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const actor = { id: '11111111-2222-3333-4444-555555555555', roles: ['admin'] as string[] };
  let service: DepartmentTaskPipelineService;
  let tasksService: {
    assertCanManageDepartmentPipeline: jest.Mock;
    create: jest.Mock;
    updateProgress: jest.Mock;
    findOne: jest.Mock;
  };
  let tasksRepo: { findOne: jest.Mock; save: jest.Mock };
  let taskDepsRepo: { findOne: jest.Mock; delete: jest.Mock; insert: jest.Mock };
  let agentsRepo: { findOne: jest.Mock };
  let nodesRepo: { findOne: jest.Mock };

  beforeEach(async () => {
    tasksService = {
      assertCanManageDepartmentPipeline: jest.fn().mockResolvedValue(undefined),
      create: jest.fn(),
      updateProgress: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn().mockResolvedValue({ id: 'parent-1', metadata: { deptPipeline: { kind: DEPT_PIPELINE_KIND } } }),
    };
    tasksRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (t: Task) => t),
    };
    taskDepsRepo = {
      findOne: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockResolvedValue(undefined),
    };
    agentsRepo = { findOne: jest.fn() };
    nodesRepo = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepartmentTaskPipelineService,
        { provide: TasksService, useValue: tasksService },
        { provide: getRepositoryToken(Task), useValue: tasksRepo },
        { provide: getRepositoryToken(TaskDependency), useValue: taskDepsRepo },
        { provide: getRepositoryToken(Agent), useValue: agentsRepo },
        { provide: getRepositoryToken(OrganizationNode), useValue: nodesRepo },
      ],
    }).compile();

    service = module.get(DepartmentTaskPipelineService);
  });

  it('createSequentialPipeline writes deptPipeline and chains dependsOnTaskIds', async () => {
    const deptNodeId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const parent: Partial<Task> = {
      id: 'parent-1',
      companyId,
      metadata: {},
    };
    tasksRepo.findOne.mockResolvedValue(parent);
    nodesRepo.findOne.mockResolvedValue({ id: deptNodeId, companyId, type: 'department' });
    tasksService.create
      .mockResolvedValueOnce({ id: 'child-a' })
      .mockResolvedValueOnce({ id: 'child-b' });

    const out = await service.createSequentialPipeline(companyId, actor, {
      parentTaskId: 'parent-1',
      departmentOrganizationNodeId: deptNodeId,
      requireCeoSupervision: true,
      steps: [
        { title: 'S1', assigneeType: 'agent', assigneeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
        { title: 'S2', assigneeType: 'agent', assigneeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
      ],
    });

    expect(tasksRepo.save).toHaveBeenCalled();
    const savedParent = tasksRepo.save.mock.calls[0]![0] as Task;
    expect((savedParent.metadata as { deptPipeline: { kind: string } }).deptPipeline.kind).toBe(DEPT_PIPELINE_KIND);
    expect(
      (savedParent.metadata as { deptPipeline: { requireCeoSupervision: boolean } }).deptPipeline
        .requireCeoSupervision,
    ).toBe(true);

    expect(tasksService.create).toHaveBeenCalledTimes(2);
    expect(tasksService.create.mock.calls[0]![0].dependsOnTaskIds).toBeUndefined();
    expect(tasksService.create.mock.calls[1]![0].dependsOnTaskIds).toEqual(['child-a']);
    expect(tasksService.updateProgress).toHaveBeenCalledWith(
      'child-a',
      { status: 'in_progress', progress: 0 },
      actor,
    );
    expect(out.childIds).toEqual(['child-a', 'child-b']);
  });

  it('createCrossDepartmentHandoff inserts handoff and rewires dependency', async () => {
    const parent: Partial<Task> = {
      id: 'parent-1',
      companyId,
      metadata: {
        deptPipeline: {
          kind: DEPT_PIPELINE_KIND,
          departmentOrganizationNodeId: 'local-dept',
        },
      },
    };
    tasksRepo.findOne.mockResolvedValue(parent);
    nodesRepo.findOne.mockResolvedValue({ id: 'other-dept', companyId, type: 'department' });
    agentsRepo.findOne.mockResolvedValue({ id: 'dir-agent', companyId, role: 'director', status: 'active' });
    taskDepsRepo.findOne.mockResolvedValue({ companyId, taskId: 'succ', dependsOnTaskId: 'pred' });
    tasksService.create.mockReset();
    tasksService.create.mockResolvedValueOnce({ id: 'handoff-1' });

    const out = await service.createCrossDepartmentHandoff(companyId, actor, {
      parentTaskId: 'parent-1',
      predecessorTaskId: 'pred',
      successorTaskId: 'succ',
      targetOrganizationNodeId: 'other-dept',
      title: 'Handoff',
    });

    expect(out.handoffTaskId).toBe('handoff-1');
    expect(taskDepsRepo.delete).toHaveBeenCalledWith({
      companyId,
      taskId: 'succ',
      dependsOnTaskId: 'pred',
    });
    expect(taskDepsRepo.insert).toHaveBeenCalledWith({
      companyId,
      taskId: 'succ',
      dependsOnTaskId: 'handoff-1',
    });
  });
});
