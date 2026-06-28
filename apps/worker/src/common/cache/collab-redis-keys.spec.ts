import {
  mainRoomStrategyDraftSessionKey,
  mainRoomStrategyGoalSessionKey,
  mainRoomDispatchPlanSessionKey,
  planningContinuityHintKey,
} from '@contracts/types/collab-redis-keys';
import {
  MAIN_ROOM_THREAD_SENTINEL,
  normalizeCollaborationThreadId,
  collaborationThreadReadCandidates,
  readCollabSessionWithThreadFallback,
  isOrchestrationRunStale,
} from '@contracts/types';

describe('planningContinuityHintKey', () => {
  it('embeds planning_continuity_hint namespace', () => {
    expect(planningContinuityHintKey('', 'c1', 'r1', 'main')).toContain('planning_continuity_hint');
    expect(planningContinuityHintKey('pfx', 'c1', 'r1', '')).toBe('pfx:collab:planning_continuity_hint:v1:c1:r1:main');
  });
});

describe('mainRoomStrategyDraftSessionKey', () => {
  it('embeds main_room_strategy_draft namespace', () => {
    expect(mainRoomStrategyDraftSessionKey('', 'c1', 'r1', 't1')).toContain('main_room_strategy_draft');
  });
});

describe('mainRoomStrategyGoalSessionKey', () => {
  it('embeds main_room_strategy_goal namespace', () => {
    expect(mainRoomStrategyGoalSessionKey('', 'c1', 'r1', 't1')).toContain('main_room_strategy_goal');
  });
});

describe('mainRoomDispatchPlanSessionKey', () => {
  it('normalizes threadId sentinel', () => {
    expect(mainRoomDispatchPlanSessionKey('', 'c1', 'r1', 'MAIN')).toContain(':main');
  });
});

describe('collab thread id SSOT', () => {
  it('normalizeCollaborationThreadId', () => {
    expect(normalizeCollaborationThreadId(null)).toBe(MAIN_ROOM_THREAD_SENTINEL);
    expect(collaborationThreadReadCandidates('550e8400-e29b-41d4-a716-446655440000')).toEqual([
      '550e8400-e29b-41d4-a716-446655440000',
      MAIN_ROOM_THREAD_SENTINEL,
    ]);
  });

  it('readCollabSessionWithThreadFallback', async () => {
    const result = await readCollabSessionWithThreadFallback({
      threadId: '550e8400-e29b-41d4-a716-446655440000',
      read: async (tid) => (tid === MAIN_ROOM_THREAD_SENTINEL ? { hit: true } : null),
    });
    expect(result.value).toEqual({ hit: true });
    expect(result.resolvedThreadId).toBe(MAIN_ROOM_THREAD_SENTINEL);
  });

  it('isOrchestrationRunStale', () => {
    const old = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    expect(isOrchestrationRunStale(old)).toBe(true);
  });
});
