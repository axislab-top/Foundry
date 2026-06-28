import { MentionAliasesService } from './mention-aliases.service.js';

describe('MentionAliasesService', () => {
  const makeRepo = (seed?: any) => {
    let row = seed;
    return {
      findOne: jest.fn(async () => row ?? null),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => {
        row = x;
        return x;
      }),
    };
  };

  it('upserts and removes alias', async () => {
    const heartbeatRepo = makeRepo({ companyId: 'c1', metadata: {} });
    const membershipsRepo = {
      findOne: jest.fn(async () => ({ role: 'owner', isActive: true })),
    };
    const svc = new MentionAliasesService(heartbeatRepo as any, membershipsRepo as any);

    const up = await svc.upsert(
      'c1',
      { id: 'u1', roles: [] },
      { label: 'CFO', nodeType: 'title', targetNodeIds: ['n1'], confidenceBoost: 0.9 },
    );
    expect(up.length).toBe(1);
    expect(up[0]?.label).toBe('CFO');

    const rm = await svc.remove('c1', { id: 'u1', roles: [] }, 'CFO');
    expect(rm).toEqual([]);
  });
});
