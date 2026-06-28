import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TaskIntentWorkflowService } from './task-intent-workflow.service.js';
import type { TaskIntentCandidate } from '../entities/task-intent-candidate.entity.js';

function candidate(overrides: Partial<TaskIntentCandidate> = {}): TaskIntentCandidate {
  return {
    id: 'candidate-1',
    companyId: 'company-1',
    roomId: 'room-1',
    sourceMessageId: 'message-1',
    actionCandidateId: null,
    createdTaskId: null,
    dedupeKey: 'candidate-key',
    status: 'needs_clarification',
    specDraft: {
      title: '修复登录问题',
      description: '登录失败',
      priority: 'normal',
      dueDate: null,
      expectedOutput: null,
      assigneeType: 'unassigned',
      assigneeId: null,
      acceptanceCriteria: [],
      reportBackToRoomId: 'room-1',
      source: {
        companyId: 'company-1',
        roomId: 'room-1',
        messageId: 'message-1',
        actionCandidateId: null,
      },
    },
    readiness: {
      ready: false,
      confidence: 0.3,
      missingFields: ['owner', 'deliverable'],
      needsClarification: true,
      clarificationPrompt: '补充信息',
      reasons: ['task_spec_incomplete'],
    },
    sourceText: '修复登录问题',
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as TaskIntentCandidate;
}

describe('TaskIntentWorkflowService', () => {
  const roomMembers = { isActiveMember: jest.fn(async () => true) };
  const candidates = {
    findById: jest.fn(),
    patchSpecDraft: jest.fn(),
    markReadyAfterConfirmation: jest.fn(),
  };
  const materializer = { materialize: jest.fn(async () => ({ created: false, taskId: null, reason: 'candidate_not_ready' })) };
  const service = new TaskIntentWorkflowService(roomMembers as never, candidates as never, materializer as never);
  const actor = { id: 'user-1', roles: [] };

  beforeEach(() => {
    jest.clearAllMocks();
    roomMembers.isActiveMember.mockResolvedValue(true);
  });

  it('patches spec and materializes when candidate becomes ready', async () => {
    const existing = candidate();
    const patched = candidate({ status: 'ready_to_create', readiness: { ...existing.readiness, ready: true, needsClarification: false, missingFields: [] } });
    candidates.findById.mockResolvedValueOnce(existing);
    candidates.patchSpecDraft.mockResolvedValueOnce(patched);
    materializer.materialize.mockResolvedValueOnce({ created: true, taskId: 'task-1', reason: 'created' });

    const result = await service.patchSpec({
      companyId: 'company-1',
      actor,
      candidateId: 'candidate-1',
      patch: {
        assigneeType: 'organization_node',
        assigneeId: 'node-1',
        expectedOutput: '登录恢复正常',
        dueDate: '2026-06-15T00:00:00.000Z',
        acceptanceCriteria: ['用户可以登录'],
      },
    });

    expect(candidates.patchSpecDraft).toHaveBeenCalledWith({
      candidate: existing,
      patch: expect.objectContaining({ assigneeId: 'node-1' }),
      patchedByUserId: 'user-1',
    });
    expect(materializer.materialize).toHaveBeenCalledWith(patched);
    expect(result.materializeResult).toEqual({ created: true, taskId: 'task-1', reason: 'created' });
  });

  it('does not allow patching already-created candidates', async () => {
    candidates.findById.mockResolvedValueOnce(candidate({ status: 'created', createdTaskId: 'task-1' }));

    await expect(service.patchSpec({ companyId: 'company-1', actor, candidateId: 'candidate-1', patch: { title: 'x' } })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('confirms ready candidates and materializes them', async () => {
    const existing = candidate({ status: 'awaiting_confirmation', readiness: { ...candidate().readiness, ready: true, needsClarification: false, missingFields: [] } });
    const ready = candidate({ ...existing, status: 'ready_to_create' });
    candidates.findById.mockResolvedValueOnce(existing);
    candidates.markReadyAfterConfirmation.mockResolvedValueOnce(ready);
    materializer.materialize.mockResolvedValueOnce({ created: true, taskId: 'task-1', reason: 'created' });

    const result = await service.confirm({ companyId: 'company-1', actor, candidateId: 'candidate-1' });

    expect(candidates.markReadyAfterConfirmation).toHaveBeenCalledWith({
      candidate: existing,
      confirmationMessageId: 'message-1',
      replayDecisionId: 'manual-confirmation',
    });
    expect(materializer.materialize).toHaveBeenCalledWith(ready);
    expect(result.materializeResult.taskId).toBe('task-1');
  });

  it('rejects confirmation when candidate still needs clarification', async () => {
    candidates.findById.mockResolvedValueOnce(candidate());

    await expect(service.confirm({ companyId: 'company-1', actor, candidateId: 'candidate-1' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects non-room members', async () => {
    candidates.findById.mockResolvedValueOnce(candidate());
    roomMembers.isActiveMember.mockResolvedValueOnce(false);

    await expect(service.patchSpec({ companyId: 'company-1', actor, candidateId: 'candidate-1', patch: { title: 'x' } })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns not found for missing candidates', async () => {
    candidates.findById.mockResolvedValueOnce(null);

    await expect(service.confirm({ companyId: 'company-1', actor, candidateId: 'candidate-1' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
