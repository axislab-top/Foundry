import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MessagingService } from '@service/messaging';
import { SupervisorReviewService } from './supervisor-review.service.js';
import { SupervisorLesson } from '../entities/supervisor-lesson.entity.js';
import { TaskRun } from '../../tasks/entities/task-run.entity.js';
import { TaskExecutionLog } from '../../tasks/entities/task-execution-log.entity.js';
import { Task } from '../../tasks/entities/task.entity.js';
import { Agent } from '../../agents/entities/agent.entity.js';
import { ChatRoom } from '../../collaboration/entities/chat-room.entity.js';
import { MemoryService } from '../../memory/services/memory.service.js';
import { ModelRouterService } from '../../billing/services/model-router.service.js';
import { ConfigService } from '../../../common/config/config.service.js';
import { ChatMessageService } from '../../collaboration/services/chat-message.service.js';
import { SUPERVISOR_LESSON_NAMESPACE } from '@foundry/supervisor-core';

describe('SupervisorReviewService', () => {
  const companyId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const runId = 'run-run-run-run-run-run-run-run-run-run';
  const taskId = 'task-task-task-task-task-task-task-task';

  it('executeReviewPipeline stores to company + agent namespaces for agent task', async () => {
    const agentId = 'a0000000-0000-4000-8000-0000000000a1';
    const memCalls: { namespace: string }[] = [];
    const memory = {
      storeEntry: jest.fn(async (p: { namespace: string }) => {
        memCalls.push({ namespace: p.namespace });
        return { id: 'mem-1' } as never;
      }),
    };
    const lessonsRepo = {
      create: jest.fn((x: unknown) => x),
      save: jest.fn(async (x: { id?: string }) => ({ ...x, id: x.id ?? 'les-1' })),
      count: jest.fn().mockResolvedValue(0),
    };
    const runsRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: runId,
        companyId,
        errorSummary: 'unit test failure',
      }),
    };
    const logsRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    const tasksRepo = {
      findOne: jest.fn().mockResolvedValue({
        title: 'T',
        assigneeType: 'agent',
        assigneeId: agentId,
      }),
    };
    const agentsRepo = {
      findOne: jest.fn().mockResolvedValue({
        organizationNodeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      }),
    };
    const roomsRepo = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupervisorReviewService,
        { provide: getRepositoryToken(SupervisorLesson), useValue: lessonsRepo },
        { provide: getRepositoryToken(TaskRun), useValue: runsRepo },
        { provide: getRepositoryToken(TaskExecutionLog), useValue: logsRepo },
        { provide: getRepositoryToken(Task), useValue: tasksRepo },
        { provide: getRepositoryToken(Agent), useValue: agentsRepo },
        { provide: getRepositoryToken(ChatRoom), useValue: roomsRepo },
        { provide: MemoryService, useValue: memory },
        {
          provide: ModelRouterService,
          useValue: { resolveModel: jest.fn().mockResolvedValue({ modelName: 'gpt-4o-mini' }) },
        },
        {
          provide: ConfigService,
          useValue: {
            getMemoryConfig: () => ({ openaiApiKey: '', openaiBaseUrl: 'https://api.openai.com/v1' }),
          },
        },
        { provide: MessagingService, useValue: { publish: jest.fn() } },
        { provide: ChatMessageService, useValue: { appendSystemMessageAsActor: jest.fn() } },
      ],
    }).compile();

    const svc = module.get(SupervisorReviewService);
    jest.spyOn(svc, 'analyzeLessonsWithLlm').mockResolvedValue([
      {
        rootCause: 'r',
        lesson: 'l',
        preventiveAction: 'p',
        confidence: 0.95,
      },
    ]);

    const out = await svc.executeReviewPipeline({
      companyId,
      runId,
      taskId,
    });

    expect(out.lessonsIngestedToMemory).toBe(1);
    expect(memory.storeEntry).toHaveBeenCalled();
    expect(memCalls.some((m) => m.namespace === SUPERVISOR_LESSON_NAMESPACE)).toBe(true);
    expect(memCalls.some((m) => m.namespace === `lesson:agent:${agentId}`)).toBe(true);
    expect(out.memoryNamespacesUsed.length).toBeGreaterThanOrEqual(1);
  });
});
