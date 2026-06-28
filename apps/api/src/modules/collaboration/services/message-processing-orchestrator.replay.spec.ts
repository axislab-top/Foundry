import { MessageProcessingOrchestratorService } from './message-processing-orchestrator.service.js';
import type { ChatMessage } from '../entities/chat-message.entity.js';
import type { ReplayDecision } from '../entities/replay-decision.entity.js';

describe('MessageProcessingOrchestratorService replay integration', () => {
  const policy = {
    buildSemanticProfile: jest.fn(() => ({
      messageKind: 'human_text',
      intentCategory: 'unknown',
      processingMode: 'unknown',
      userFacingStage: 'understanding',
      contentLength: 12,
      hasMentions: false,
      hasTaskIntent: false,
      isIndexable: true,
      isEligibleForReceivedEvent: true,
      reasons: [],
    })),
    decideActions: jest.fn(() => []),
  };
  const decisions = { record: jest.fn(async () => undefined) };
  const candidates = {
    upsertFromDecision: jest.fn(),
    upsertFromReplayDecision: jest.fn(async () => ({ id: 'action-replay-1', kind: 'discussion_route' })),
  };
  const jobs = { upsertPending: jest.fn() };
  const eventFactory = {};
  const replayDecisions = {
    decideForNonMainRoomMessage: jest.fn(),
    decideForMessage: jest.fn(),
    isMainRoom: jest.fn(async () => false),
  };
  const executionIntake = { intakeReplayDecision: jest.fn(async () => null) };
  const messaging = {};
  const config = { isCollabMainRoomReplaySsotPhase2Enabled: () => false };
  const collabRealtime = { publishMessageMetadataUpdated: jest.fn(async () => undefined) };
  const queryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    execute: jest.fn(async () => undefined),
  };
  const messagesRepo = {
    createQueryBuilder: jest.fn(() => queryBuilder),
    findOne: jest.fn(async () => ({
      id: 'message-1',
      companyId: 'company-1',
      roomId: 'room-1',
      metadata: { replayDecision: { kind: 'start_discussion' } },
    })),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function service(): MessageProcessingOrchestratorService {
    return new MessageProcessingOrchestratorService(
      policy as never,
      decisions as never,
      candidates as never,
      jobs as never,
      eventFactory as never,
      replayDecisions as never,
      executionIntake as never,
      messaging as never,
      config as never,
      collabRealtime as never,
      messagesRepo as never,
    );
  }

  function humanMessage(metadata: Record<string, unknown> = {}): ChatMessage {
    return {
      id: 'message-1',
      companyId: 'company-1',
      roomId: 'room-1',
      senderType: 'human',
      senderId: 'user-1',
      messageType: 'text',
      content: '请大家先讨论一下',
      metadata,
    } as ChatMessage;
  }

  function replay(kind: ReplayDecision['kind']): ReplayDecision {
    return {
      id: `replay-${kind}`,
      companyId: 'company-1',
      roomId: 'room-1',
      triggerMessageId: 'message-1',
      kind,
      confidence: 0.8,
      requiresUserConfirmation: false,
      targetDepartmentSlugs: [],
      targetAgentIds: [],
      summary: kind,
      rationale: ['test'],
      executionHint: null,
      source: 'conversation_replay',
    } as ReplayDecision;
  }

  it('records replay metadata but does not enter execution intake for non-execution replay decisions', async () => {
    replayDecisions.decideForNonMainRoomMessage.mockResolvedValueOnce(replay('start_discussion'));

    await service().process('company-1', humanMessage());

    expect(replayDecisions.decideForNonMainRoomMessage).toHaveBeenCalledWith('company-1', expect.objectContaining({ id: 'message-1' }));
    expect(candidates.upsertFromReplayDecision).toHaveBeenCalledWith({
      companyId: 'company-1',
      decision: expect.objectContaining({ kind: 'start_discussion' }),
    });
    expect(executionIntake.intakeReplayDecision).toHaveBeenCalledWith({
      companyId: 'company-1',
      message: expect.objectContaining({ id: 'message-1' }),
      replayDecision: expect.objectContaining({ kind: 'start_discussion' }),
      actionCandidate: expect.objectContaining({ id: 'action-replay-1' }),
    });
    expect(queryBuilder.setParameter).toHaveBeenCalledWith(
      'replayDecision',
      expect.stringContaining('start_discussion'),
    );
    expect(collabRealtime.publishMessageMetadataUpdated).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({ id: 'message-1' }),
    );
  });

  it('passes prepare_task_draft replay decisions to execution intake', async () => {
    candidates.upsertFromReplayDecision.mockResolvedValueOnce({ id: 'action-task-1', kind: 'task_intent_candidate' });
    replayDecisions.decideForNonMainRoomMessage.mockResolvedValueOnce(replay('prepare_task_draft'));

    await service().process('company-1', humanMessage({ taskSpec: { title: '任务' } }));

    expect(executionIntake.intakeReplayDecision).toHaveBeenCalledWith({
      companyId: 'company-1',
      message: expect.objectContaining({ id: 'message-1' }),
      replayDecision: expect.objectContaining({ kind: 'prepare_task_draft' }),
      actionCandidate: expect.objectContaining({ id: 'action-task-1' }),
    });
    expect(queryBuilder.setParameter).toHaveBeenCalledWith(
      'replayDecision',
      expect.stringContaining('prepare_task_draft'),
    );
  });

  it('always skips sync replay on main room (Worker SSOT)', async () => {
    replayDecisions.isMainRoom.mockResolvedValueOnce(true);

    await service().process(
      'company-1',
      humanMessage({
        taskSpec: { title: '任务' },
        audienceDecision: { roomType: 'main', responderType: 'ceo' },
      }),
    );

    expect(replayDecisions.decideForNonMainRoomMessage).not.toHaveBeenCalled();
    expect(replayDecisions.decideForMessage).not.toHaveBeenCalled();
    expect(candidates.upsertFromReplayDecision).not.toHaveBeenCalled();
    expect(executionIntake.intakeReplayDecision).not.toHaveBeenCalled();
  });

  it('skips replay processing for stream chunks and agent messages', async () => {
    await service().process('company-1', {
      ...humanMessage(),
      senderType: 'agent',
    } as ChatMessage);
    await service().process('company-1', {
      ...humanMessage(),
      messageType: 'stream_chunk',
    } as ChatMessage);

    expect(replayDecisions.decideForNonMainRoomMessage).not.toHaveBeenCalled();
    expect(replayDecisions.decideForMessage).not.toHaveBeenCalled();
    expect(candidates.upsertFromReplayDecision).not.toHaveBeenCalled();
    expect(executionIntake.intakeReplayDecision).not.toHaveBeenCalled();
  });
});
