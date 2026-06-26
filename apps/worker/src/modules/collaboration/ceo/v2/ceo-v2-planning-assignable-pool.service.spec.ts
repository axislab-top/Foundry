import { CeoV2PlanningAssignablePoolService } from './ceo-v2-planning-assignable-pool.service.js';

describe('CeoV2PlanningAssignablePoolService', () => {
  it('skips RPC when assignableDepartmentSlugs already present', async () => {
    const roomContextService = { buildRoomContext: jest.fn() };
    const svc = new CeoV2PlanningAssignablePoolService({ getCollabAssignableDepartmentPolicy: () => 'org_only' } as any, roomContextService as any);
    const planning = {
      planId: 'p1',
      metadata: {
        assignableDepartmentSlugs: ['alpha'],
        departmentCapabilities: [{ slug: 'alpha', name: 'Alpha', taskTypeTags: ['general'] }],
      },
    } as any;
    const out = await svc.enrichPlanning(planning, { companyId: 'c1', roomId: 'r1', intentSlugs: ['beta'] });
    expect(out).toBe(planning);
    expect(roomContextService.buildRoomContext).not.toHaveBeenCalled();
  });

  it('resolves pool from org snapshot when metadata pool missing', async () => {
    const roomContextService = {
      buildRoomContext: jest.fn(async () => ({
        orgSnapshot: { departments: [{ slug: '研发部' }, { slug: '市场部' }] },
      })),
    };
    const svc = new CeoV2PlanningAssignablePoolService({ getCollabAssignableDepartmentPolicy: () => 'org_only' } as any, roomContextService as any);
    const planning = { planId: 'p2', metadata: { companyId: 'c1', roomId: 'r1' } } as any;
    const out = await svc.enrichPlanning(planning, { companyId: 'c1', roomId: 'r1', intentSlugs: [] });
    expect((out.metadata as any).assignableDepartmentSlugs).toEqual(['研发部', '市场部']);
  });
});
