import { ReplayDecisionService } from './replay-decision.service.js';
import type { ChatMessage } from '../entities/chat-message.entity.js';
import type { ChatRoom } from '../entities/chat-room.entity.js';

describe('ReplayDecisionService main room guard', () => {
  function service(room: Partial<ChatRoom> | null) {
    return new ReplayDecisionService(
      { findOne: jest.fn(), save: jest.fn(), create: jest.fn() } as never,
      { find: jest.fn(async () => []) } as never,
      { findOne: jest.fn(async () => room) } as never,
    );
  }

  function message(metadata: Record<string, unknown> = {}): ChatMessage {
    return {
      id: 'message-1',
      companyId: 'company-1',
      roomId: 'room-main',
      senderType: 'human',
      content: '定稿',
      metadata,
    } as ChatMessage;
  }

  it('skips prepare_task_draft on main room via decideForMessage guard', async () => {
    const decisionsRepo = {
      findOne: jest.fn(async () => null),
      save: jest.fn(async (row: unknown) => row),
      create: jest.fn((row: unknown) => row),
    };
    const svc = new ReplayDecisionService(
      decisionsRepo as never,
      { find: jest.fn(async () => []) } as never,
      { findOne: jest.fn(async () => ({ roomType: 'main' })) } as never,
    );
    const decision = await svc.decideForMessage(
      'company-1',
      message({ taskSpec: { title: '季度方案', expectedOutput: '文档' } }),
    );
    expect(decision.kind).toBe('continue_conversation');
    expect(decision.rationale).toContain('main_room_worker_replay_ssot');
  });

  it('keeps prepare_task_draft on non-main room via decideForNonMainRoomMessage', async () => {
    const decisionsRepo = {
      findOne: jest.fn(async () => null),
      save: jest.fn(async (row: unknown) => row),
      create: jest.fn((row: unknown) => row),
    };
    const svc = new ReplayDecisionService(
      decisionsRepo as never,
      { find: jest.fn(async () => []) } as never,
      { findOne: jest.fn(async () => ({ roomType: 'department' })) } as never,
    );
    const decision = await svc.decideForNonMainRoomMessage(
      'company-1',
      message({ taskSpec: { title: '任务' } }),
    );
    expect(decision.kind).toBe('prepare_task_draft');
  });

  it('recordFromWorkerEvent upserts with worker source and metadata', async () => {
    const savedRows: unknown[] = [];
    const decisionsRepo = {
      findOne: jest.fn(async () => null),
      save: jest.fn(async (row: unknown) => {
        savedRows.push(row);
        return { ...(row as object), id: 'replay-worker-1' };
      }),
      create: jest.fn((row: unknown) => row),
    };
    const svc = new ReplayDecisionService(
      decisionsRepo as never,
      { find: jest.fn(async () => []) } as never,
      { findOne: jest.fn(async () => ({ roomType: 'main' })) } as never,
    );
    const decision = await svc.recordFromWorkerEvent({
      snapshot: {
        companyId: 'company-1',
        roomId: 'room-main',
        triggerMessageId: 'message-1',
        kind: 'confirm_execution',
        confidence: 0.9,
        requiresUserConfirmation: false,
        targetDepartmentSlugs: [],
        targetAgentIds: [],
        summary: 'authorized',
        rationale: ['worker_replay_ssot'],
        source: 'worker_main_room_replay',
      },
      workerTraceId: 'trace-1',
      authorizationOutcome: 'authorized',
    });
    expect(decision.id).toBe('replay-worker-1');
    expect(decisionsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'worker_main_room_replay',
        metadata: expect.objectContaining({ recordedBy: 'WorkerReplaySsot' }),
      }),
    );
  });
});
