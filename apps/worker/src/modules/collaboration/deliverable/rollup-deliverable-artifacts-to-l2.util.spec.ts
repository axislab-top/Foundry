import {
  isMainRoomL2GoalDelegationKey,
  mergeDeliverableArtifactsForL2Parent,
} from './rollup-deliverable-artifacts-to-l2.util.js';

describe('rollup-deliverable-artifacts-to-l2.util', () => {
  it('isMainRoomL2GoalDelegationKey detects L2 keys', () => {
    expect(isMainRoomL2GoalDelegationKey('main_room_l2:plan:task:marketing')).toBe(true);
    expect(isMainRoomL2GoalDelegationKey('other')).toBe(false);
  });

  it('mergeDeliverableArtifactsForL2Parent dedupes by fileAssetId', () => {
    const merged = mergeDeliverableArtifactsForL2Parent(
      [{ type: 'skill', content: 'a', fileAssetId: 'f1' }],
      [{ type: 'skill', content: 'b', fileAssetId: 'f1' }, { type: 'report', content: 'c' }],
    );
    expect(merged).toHaveLength(2);
  });
});
