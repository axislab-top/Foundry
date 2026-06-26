import {
  deptReportHasDeliverableArtifacts,
  l2SubGoalRequiresDeliverable,
} from './l2-deliverable-gate.util.js';

describe('l2-deliverable-gate.util', () => {
  it('l2SubGoalRequiresDeliverable: true for main_room_l2 keys by default', () => {
    expect(
      l2SubGoalRequiresDeliverable({ goalDelegationKey: 'main_room_l2:plan:task:ops' }),
    ).toBe(true);
  });

  it('l2SubGoalRequiresDeliverable: false when explicitly disabled', () => {
    expect(
      l2SubGoalRequiresDeliverable({
        goalDelegationKey: 'main_room_l2:plan:task:ops',
        requiresDeliverable: false,
      }),
    ).toBe(false);
  });

  it('deptReportHasDeliverableArtifacts: uri counts', () => {
    expect(deptReportHasDeliverableArtifacts([{ type: 'file', uri: 'mem://x' }])).toBe(true);
    expect(deptReportHasDeliverableArtifacts([{ type: 'file', fileAssetId: 'fa-1' }])).toBe(true);
    expect(deptReportHasDeliverableArtifacts([{ type: 'text', content: '   ' }])).toBe(false);
  });
});
