import { of } from 'rxjs';
import { RolePersonalityEngine } from './role-personality.engine.js';

describe('RolePersonalityEngine', () => {
  it('loads profile from memory and persists updates', async () => {
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'memory.search') {
          return of([
            {
              content: JSON.stringify({
                behaviorStyle: 'assertive',
                responsibilityLevel: 'high',
                departmentCultureBias: 'quality-first',
              }),
            },
          ]);
        }
        return of({ id: 'm1' });
      }),
    } as any;
    const config = {
      getApiRpcTimeoutMs: () => 1000,
      getWorkerActorUserId: () => 'worker',
    } as any;

    const svc = new RolePersonalityEngine(apiRpc, config);
    const profile = await svc.loadRoleProfile({
      companyId: 'c1',
      departmentSlug: 'engineering',
      role: 'supervisor',
    });

    expect(profile.behaviorStyle).toBe('assertive');
    expect(profile.responsibilityLevel).toBe('high');
    await svc.persistRoleProfile({
      companyId: 'c1',
      departmentSlug: 'engineering',
      role: 'supervisor',
      profile,
      source: 'unit-test',
    });
    expect(apiRpc.send).toHaveBeenCalledWith(
      'memory.entries.store',
      expect.objectContaining({
        companyId: 'c1',
      }),
    );
  });
});

