import { TaskIntentCandidateService } from './task-intent-candidate.service.js';
import type { ReplayDecision } from '../entities/replay-decision.entity.js';
import type { ChatMessage } from '../entities/chat-message.entity.js';
import type { TaskIntentCandidate } from '../entities/task-intent-candidate.entity.js';

describe('TaskIntentCandidateService replay flow', () => {
  const repo = {
    rows: [] as TaskIntentCandidate[],
    findOne: jest.fn(),
    create: jest.fn((input: Partial<TaskIntentCandidate>) => input as TaskIntentCandidate),
    save: jest.fn(async (row: TaskIntentCandidate) => {
      if (!row.id) row.id = `candidate-${repo.rows.length + 1}`;
      const existingIndex = repo.rows.findIndex((item) => item.id === row.id || item.dedupeKey === row.dedupeKey);
      if (existingIndex >= 0) repo.rows[existingIndex] = row;
      else repo.rows.push(row);
      return row;
    }),
  };

  beforeEach(() => {
    repo.rows = [];
    repo.findOne.mockReset();
    repo.create.mockClear();
    repo.save.mockClear();
    repo.findOne.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.dedupeKey) return repo.rows.find((row) => row.dedupeKey === where.dedupeKey) ?? null;
      if (where.companyId && where.roomId && where.status) {
        return repo.rows
          .filter((row) => row.companyId === where.companyId && row.roomId === where.roomId && row.status === where.status)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
      }
      return null;
    });
  });

  function service(): TaskIntentCandidateService {
    return new TaskIntentCandidateService(repo as never);
  }

  function message(metadata: Record<string, unknown> = {}): ChatMessage {
    return {
      id: 'message-1',
      companyId: 'company-1',
      roomId: 'room-1',
      content: '请把这个方案转成任务',
      metadata,
    } as ChatMessage;
  }

  function replay(kind: ReplayDecision['kind'] = 'prepare_task_draft'): ReplayDecision {
    return {
      id: 'replay-1',
      companyId: 'company-1',
      roomId: 'room-1',
      triggerMessageId: 'message-1',
      kind,
      confidence: 0.9,
      requiresUserConfirmation: false,
      targetDepartmentSlugs: [],
      targetAgentIds: [],
      summary: '准备任务草稿',
      rationale: [],
      executionHint: null,
      source: 'conversation_replay',
    } as ReplayDecision;
  }

  it('drafts a ready task candidate from explicit replay task spec', async () => {
    const result = await service().draftFromReplayDecision({
      companyId: 'company-1',
      roomId: 'room-1',
      message: message({
        taskSpec: {
          title: '完成登录修复',
          description: '修复登录失败问题',
          assigneeType: 'organization_node',
          assigneeId: 'node-1',
          expectedOutput: '登录恢复正常',
          dueDate: '2026-06-15T00:00:00.000Z',
          acceptanceCriteria: ['用户可以正常登录'],
        },
      }),
      replayDecision: replay(),
      actionCandidate: null,
    });

    expect(result.status).toBe('ready_to_create');
    expect(result.readiness.ready).toBe(true);
    expect(result.metadata).toMatchObject({
      source: 'replay_decision',
      replayDecisionId: 'replay-1',
    });
  });

  it('keeps incomplete replay task candidate in needs_clarification', async () => {
    const result = await service().draftFromReplayDecision({
      companyId: 'company-1',
      roomId: 'room-1',
      message: message(),
      replayDecision: replay(),
      actionCandidate: null,
    });

    expect(result.status).toBe('needs_clarification');
    expect(result.readiness.ready).toBe(false);
    expect(result.readiness.missingFields).toContain('owner');
    expect(result.readiness.missingFields).toContain('deliverable');
  });

  it('marks latest awaiting candidate ready after confirmation', async () => {
    const candidate = await service().draftFromReplayDecision({
      companyId: 'company-1',
      roomId: 'room-1',
      message: message({
        taskSpec: {
          title: '完成登录修复',
          description: '修复登录失败问题',
          assigneeType: 'organization_node',
          assigneeId: 'node-1',
          expectedOutput: '登录恢复正常',
          dueDate: '2026-06-15T00:00:00.000Z',
          acceptanceCriteria: ['用户可以正常登录'],
        },
      }),
      replayDecision: replay(),
      actionCandidate: null,
    });
    candidate.status = 'awaiting_confirmation';
    candidate.createdAt = new Date('2026-06-10T00:00:00.000Z');
    await repo.save(candidate);

    const latest = await service().findLatestAwaitingConfirmation({ companyId: 'company-1', roomId: 'room-1' });
    expect(latest?.id).toBe(candidate.id);

    const confirmed = await service().markReadyAfterConfirmation({
      candidate: latest!,
      confirmationMessageId: 'message-confirm',
      replayDecisionId: 'replay-confirm',
    });

    expect(confirmed.status).toBe('ready_to_create');
    expect(confirmed.readiness.ready).toBe(true);
    expect(confirmed.metadata).toMatchObject({
      confirmationMessageId: 'message-confirm',
      replayDecisionId: 'replay-confirm',
    });
  });
});
