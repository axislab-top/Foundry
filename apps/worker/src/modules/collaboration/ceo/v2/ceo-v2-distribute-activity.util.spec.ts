import { normalizeCeoV2DistributeActivityData } from './ceo-v2-distribute-activity.util.js';

describe('normalizeCeoV2DistributeActivityData', () => {
  it('accepts legacy PlanningResult-only payload', () => {
    const planning = { planId: 'p1', goal: 'g' } as any;
    expect(normalizeCeoV2DistributeActivityData(planning)).toEqual({
      planning,
      intentDepartmentSlugs: [],
    });
  });

  it('unwraps wrapped payload with intent slugs', () => {
    const planning = { planId: 'p2' } as any;
    expect(
      normalizeCeoV2DistributeActivityData({
        planning,
        intentDepartmentSlugs: [' 市场部 ', ''],
      }),
    ).toEqual({
      planning,
      intentDepartmentSlugs: ['市场部'],
    });
  });
});
