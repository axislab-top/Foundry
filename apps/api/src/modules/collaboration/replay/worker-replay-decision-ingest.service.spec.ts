import { WorkerReplayDecisionIngestService } from './worker-replay-decision-ingest.service.js';
import type { CollaborationReplayDelegateCompletedEvent } from '@contracts/events';

function event(overrides: Partial<CollaborationReplayDelegateCompletedEvent['data']> = {}) {
  return {
    eventId: 'e1',
    eventType: 'collaboration.replay.delegate.completed' as const,
    aggregateId: 'm1',
    aggregateType: 'chat_message' as const,
    occurredAt: new Date().toISOString(),
    version: 1,
    companyId: 'company-1',
    data: {
      messageId: 'm1',
      roomId: 'room-1',
      traceId: 'trace-1',
      authorizationOutcome: 'authorized' as const,
      replayDecisionKind: 'confirm_execution' as const,
      requiresUserConfirmation: false,
      targetDepartmentSlugs: [],
      targetAgentIds: [],
      summary: 'authorized',
      rationale: ['worker_replay_ssot'],
      completedAt: new Date().toISOString(),
      ...overrides,
    },
  } satisfies CollaborationReplayDelegateCompletedEvent;
}

describe('WorkerReplayDecisionIngestService', () => {
  it('records replay decision and triggers intake', async () => {
    const message = { id: 'm1', roomId: 'room-1', metadata: {} };
    const replayDecision = {
      id: 'rd-1',
      kind: 'confirm_execution',
      confidence: 0.9,
      requiresUserConfirmation: false,
      targetDepartmentSlugs: [],
      targetAgentIds: [],
      summary: 'authorized',
      rationale: ['worker_replay_ssot'],
      source: 'worker_main_room_replay',
    };
    const replayDecisions = {
      recordFromWorkerEvent: jest.fn(async () => replayDecision),
    };
    const actionCandidates = {
      upsertFromReplayDecision: jest.fn(async () => ({ id: 'ac-1', kind: 'task_intent_candidate' })),
    };
    const executionIntake = { intakeReplayDecision: jest.fn(async () => null) };
    const collabRealtime = { publishMessageMetadataUpdated: jest.fn(async () => undefined) };
    const messagesRepo = {
      findOne: jest.fn(async () => message),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        execute: jest.fn(async () => undefined),
      })),
    };

    const svc = new WorkerReplayDecisionIngestService(
      replayDecisions as never,
      actionCandidates as never,
      executionIntake as never,
      collabRealtime as never,
      messagesRepo as never,
    );

    await svc.ingest(event());

    expect(replayDecisions.recordFromWorkerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          kind: 'confirm_execution',
          source: 'worker_main_room_replay',
        }),
      }),
    );
    expect(executionIntake.intakeReplayDecision).toHaveBeenCalledWith(
      expect.objectContaining({ replayDecision }),
    );
    expect(collabRealtime.publishMessageMetadataUpdated).toHaveBeenCalledWith('company-1', message);
  });

  it('warns and returns when message missing', async () => {
    const replayDecisions = { recordFromWorkerEvent: jest.fn() };
    const messagesRepo = { findOne: jest.fn(async () => null) };
    const svc = new WorkerReplayDecisionIngestService(
      replayDecisions as never,
      { upsertFromReplayDecision: jest.fn() } as never,
      { intakeReplayDecision: jest.fn() } as never,
      { publishMessageMetadataUpdated: jest.fn() } as never,
      messagesRepo as never,
    );
    await svc.ingest(event());
    expect(replayDecisions.recordFromWorkerEvent).not.toHaveBeenCalled();
  });

  it('does not publish metadata update when refreshed message is missing', async () => {
    const message = { id: 'm1', roomId: 'room-1', metadata: {} };
    const replayDecisions = {
      recordFromWorkerEvent: jest.fn(async () => ({
        id: 'rd-1',
        kind: 'confirm_execution',
        confidence: 0.9,
        requiresUserConfirmation: false,
        targetDepartmentSlugs: [],
        targetAgentIds: [],
        summary: 'authorized',
        rationale: ['worker_replay_ssot'],
        source: 'worker_main_room_replay',
      })),
    };
    const collabRealtime = { publishMessageMetadataUpdated: jest.fn(async () => undefined) };
    let findOneCalls = 0;
    const messagesRepo = {
      findOne: jest.fn(async () => {
        findOneCalls += 1;
        return findOneCalls === 1 ? message : null;
      }),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        execute: jest.fn(async () => undefined),
      })),
    };

    const svc = new WorkerReplayDecisionIngestService(
      replayDecisions as never,
      { upsertFromReplayDecision: jest.fn(async () => null) } as never,
      { intakeReplayDecision: jest.fn(async () => null) } as never,
      collabRealtime as never,
      messagesRepo as never,
    );

    await svc.ingest(event());

    expect(collabRealtime.publishMessageMetadataUpdated).not.toHaveBeenCalled();
  });
});
