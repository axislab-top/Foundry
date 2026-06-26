import { CeoSequentialPeerIntroSessionService } from './ceo-sequential-peer-intro-session.service.js';

describe('CeoSequentialPeerIntroSessionService', () => {
  it('tracks summoned directors and chain turn eligibility', async () => {
    const redisStore = new Map<string, string>();
    const svc = new CeoSequentialPeerIntroSessionService(
      {
        getRedisKeyPrefix: () => 'test:',
        getWorkerActorUserId: () => 'worker-1',
      } as never,
      {
        get: jest.fn(async (key: string) => redisStore.get(key) ?? null),
        setPx: jest.fn(async (key: string, value: string) => {
          redisStore.set(key, value);
          return true;
        }),
        setNxPx: jest.fn(async () => true),
      } as never,
      {
        buildRoomContext: jest.fn().mockResolvedValue({
          roomType: 'main',
          memberDirectory: [{ memberType: 'agent', memberId: 'dir-1' }],
          orgSnapshot: { departments: [{ id: 'dept-1', name: '工程部' }] },
        }),
      } as never,
      {
        getActiveAgents: jest.fn().mockResolvedValue([
          { id: 'dir-1', name: '工程总监', role: 'director', organizationNodeId: 'dept-1' },
        ]),
      } as never,
    );

    await svc.activateSession('c1', 'r1');
    await svc.recordDirectorSummoned('c1', 'r1', 'dir-1');
    expect(await svc.shouldContinueAfterDirectorReply('c1', 'r1', 'dir-1')).toBe(true);
    expect(await svc.shouldContinueAfterDirectorReply('c1', 'r1', 'dir-2')).toBe(false);
  });
});
