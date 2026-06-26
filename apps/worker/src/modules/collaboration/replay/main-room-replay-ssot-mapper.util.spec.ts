import {
  isExplicitTaskSpecReadyForConfirm,
  mapAuthorizationToReplaySsotResult,
} from './main-room-replay-ssot-mapper.util.js';

describe('main-room-replay-ssot-mapper.util', () => {
  it('maps propose to propose_execution', () => {
    const result = mapAuthorizationToReplaySsotResult({
      authorizationOutcome: 'propose',
      discussionMode: false,
      draftGoalSummary: '季度增长方案',
    });
    expect(result.replayDecisionKind).toBe('propose_execution');
    expect(result.requiresUserConfirmation).toBe(true);
    expect(result.rationale).toContain('worker_replay_ssot');
  });

  it('maps authorized without taskSpec to confirm_execution', () => {
    const result = mapAuthorizationToReplaySsotResult({
      authorizationOutcome: 'authorized',
      discussionMode: false,
    });
    expect(result.replayDecisionKind).toBe('confirm_execution');
    expect(result.requiresUserConfirmation).toBe(false);
  });

  it('maps authorized with incomplete taskSpec to prepare_task_draft', () => {
    const result = mapAuthorizationToReplaySsotResult({
      authorizationOutcome: 'authorized',
      discussionMode: false,
      messageMetadata: {
        taskSpec: { title: '任务' },
      },
    });
    expect(result.replayDecisionKind).toBe('prepare_task_draft');
    expect(result.requiresUserConfirmation).toBe(true);
  });

  it('maps authorized with ready taskSpec to confirm_execution', () => {
    expect(
      isExplicitTaskSpecReadyForConfirm({
        taskSpec: {
          title: '任务',
          description: '描述',
          expectedOutput: '文档',
          assigneeType: 'agent',
          assigneeId: 'agent-1',
        },
      }),
    ).toBe(true);

    const result = mapAuthorizationToReplaySsotResult({
      authorizationOutcome: 'authorized',
      discussionMode: false,
      messageMetadata: {
        taskSpec: {
          title: '任务',
          description: '描述',
          expectedOutput: '文档',
          assigneeType: 'agent',
          assigneeId: 'agent-1',
        },
      },
    });
    expect(result.replayDecisionKind).toBe('confirm_execution');
    expect(result.requiresUserConfirmation).toBe(false);
  });

  it('maps light_reply in discussion mode to start_discussion', () => {
    const result = mapAuthorizationToReplaySsotResult({
      authorizationOutcome: 'light_reply',
      discussionMode: true,
    });
    expect(result.replayDecisionKind).toBe('start_discussion');
  });

  it('maps bypass explicit_directed to continue_conversation', () => {
    const result = mapAuthorizationToReplaySsotResult({
      authorizationOutcome: 'bypass',
      discussionMode: false,
      routeBypass: 'explicit_directed',
    });
    expect(result.replayDecisionKind).toBe('continue_conversation');
  });
});
