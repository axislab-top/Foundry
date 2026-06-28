import { TaskMaterializerService } from './task-materializer.service.js';
import type { TaskIntentCandidate } from '../entities/task-intent-candidate.entity.js';
import type { Task } from '../../tasks/entities/task.entity.js';

function readyCandidate(overrides: Partial<TaskIntentCandidate> = {}): TaskIntentCandidate {
  return {
    id: 'candidate-1',
    companyId: 'company-1',
    roomId: 'room-1',
    sourceMessageId: 'message-1',
    actionCandidateId: 'action-1',
    createdTaskId: null,
    dedupeKey: 'task-intent:replay:replay-1',
    status: 'ready_to_create',
    specDraft: {
      title: '完成登录修复',
      description: '修复登录失败问题',
      priority: 'high',
      dueDate: '2026-06-15T00:00:00.000Z',
      expectedOutput: '登录恢复正常',
      assigneeType: 'organization_node',
      assigneeId: 'node-1',
      acceptanceCriteria: ['用户可以正常登录'],
      reportBackToRoomId: 'room-1',
      source: {
        companyId: 'company-1',
        roomId: 'room-1',
        messageId: 'message-1',
        actionCandidateId: 'action-1',
      },
    },
    readiness: {
      ready: true,
      confidence: 0.9,
      missingFields: [],
      needsClarification: false,
      clarificationPrompt: null,
      reasons: ['task_spec_ready'],
    },
    sourceText: '准备任务草稿',
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as TaskIntentCandidate;
}

describe('TaskMaterializerService', () => {
  const taskIntentRepo = { findOne: jest.fn() };
  const dataSource = { transaction: jest.fn() };
  const service = new TaskMaterializerService(
    dataSource as never,
    {} as never,
    taskIntentRepo as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not materialize candidates that are not ready', async () => {
    const result = await service.materialize(readyCandidate({
      status: 'needs_clarification',
      readiness: {
        ready: false,
        confidence: 0.4,
        missingFields: ['owner'],
        needsClarification: true,
        clarificationPrompt: '补充负责人',
        reasons: ['task_spec_incomplete'],
      },
    }));

    expect(result).toEqual({
      created: false,
      taskId: null,
      reason: 'candidate_not_ready:needs_clarification',
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('returns existing task id when candidate was already materialized', async () => {
    const result = await service.materialize(readyCandidate({ createdTaskId: 'task-existing', status: 'created' }));

    expect(result).toEqual({
      created: false,
      taskId: 'task-existing',
      reason: 'already_created',
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('creates a task once for ready candidates', async () => {
    const candidate = readyCandidate();
    dataSource.transaction.mockImplementation(async (fn: (manager: Record<string, unknown>) => Promise<unknown>) => {
      const manager = {
        findOne: jest.fn(async () => candidate),
        create: jest.fn((_entity: unknown, input: Partial<Task>) => ({ id: 'task-1', ...input })),
        save: jest.fn(async (_entity: unknown, row: Record<string, unknown>) => {
          if ('title' in row) return { id: 'task-1', ...row };
          return row;
        }),
        update: jest.fn(async () => undefined),
        createQueryBuilder: jest.fn(() => ({
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          setParameter: jest.fn().mockReturnThis(),
          execute: jest.fn(async () => undefined),
        })),
      };
      return fn(manager);
    });

    const result = await service.materialize(candidate);

    expect(result).toEqual({ created: true, taskId: 'task-1', reason: 'created' });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(candidate.createdTaskId).toBe('task-1');
    expect(candidate.status).toBe('created');
  });
});
