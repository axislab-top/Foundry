import { MainRoomCeoTurnStateService } from './main-room-ceo-turn-state.service.js';

describe('MainRoomCeoTurnStateService', () => {
  function service(unified: boolean, legacyDualWrite = true) {
    const redisStore = new Map<string, string>();
    const collabStore = new Map<string, string>();
    const config = {
      getRedisKeyPrefix: () => 'test',
      isCollabCeoTurnStateUnifiedEnabled: () => unified,
      isCollabCeoTurnStateLegacyDualWriteEnabled: () => legacyDualWrite,
    };
    const redisCache = {
      get: jest.fn(async (k: string) => redisStore.get(k) ?? null),
      setPx: jest.fn(async (k: string, v: string) => {
        redisStore.set(k, v);
        return true;
      }),
      del: jest.fn(async (k: string) => {
        redisStore.delete(k);
      }),
    };
    const collabRedis = {
      get: jest.fn(async (k: string) => collabStore.get(k) ?? null),
      setPx: jest.fn(async (k: string, v: string) => {
        collabStore.set(k, v);
        return true;
      }),
      del: jest.fn(async (k: string) => {
        collabStore.delete(k);
      }),
    };
    return {
      svc: new MainRoomCeoTurnStateService(config as never, redisCache as never),
      redisStore,
    };
  }

  it('reads legacy draft when unified flag is off', async () => {
    const { svc, redisStore } = service(false);
    redisStore.set(
      'test:collab:main_room_strategy_draft:v1:c1:r1:main',
      JSON.stringify({ draftGoalSummary: 'legacy goal', updatedAt: '2026-01-01T00:00:00.000Z' }),
    );
    const draft = await svc.getDraft({ companyId: 'c1', roomId: 'r1' });
    expect(draft?.draftGoalSummary).toBe('legacy goal');
  });

  it('lazy migrates legacy sections into unified key when unified flag is on', async () => {
    const { svc, redisStore } = service(true);
    redisStore.set(
      'test:collab:main_room_strategy_draft:v1:c1:r1:main',
      JSON.stringify({ draftGoalSummary: 'migrated', updatedAt: '2026-01-01T00:00:00.000Z' }),
    );
    await svc.getDraft({ companyId: 'c1', roomId: 'r1' });
    expect(redisStore.has('test:collab:main_room_ceo_turn_state:v1:c1:r1:main')).toBe(true);
  });

  it('dual-writes draft to legacy keys when unified and legacy dual-write enabled', async () => {
    const { svc, redisStore } = service(true, true);
    await svc.setDraft({ companyId: 'c1', roomId: 'r1' }, { draftGoalSummary: 'dual write' });
    expect(redisStore.get('test:collab:main_room_strategy_draft:v1:c1:r1:main')).toContain('dual write');
    expect(redisStore.get('test:collab:main_room_ceo_turn_state:v1:c1:r1:main')).toContain('dual write');
  });

  it('writes unified only when legacy dual-write disabled', async () => {
    const { svc, redisStore } = service(true, false);
    await svc.setDraft({ companyId: 'c1', roomId: 'r1' }, { draftGoalSummary: 'unified only' });
    expect(redisStore.get('test:collab:main_room_ceo_turn_state:v1:c1:r1:main')).toContain('unified only');
    expect(redisStore.has('test:collab:main_room_strategy_draft:v1:c1:r1:main')).toBe(false);
  });

  it('reads unified key directly when present', async () => {
    const { svc, redisStore } = service(true, false);
    redisStore.set(
      'test:collab:main_room_ceo_turn_state:v1:c1:r1:main',
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
        draft: { draftGoalSummary: 'from unified', updatedAt: '2026-01-01T00:00:00.000Z' },
      }),
    );
    const draft = await svc.getDraft({ companyId: 'c1', roomId: 'r1' });
    expect(draft?.draftGoalSummary).toBe('from unified');
  });
});
