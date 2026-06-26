import { isUserInitiatedMainRoomDirectSummon } from './main-room-direct-summon-provenance.util.js';

describe('isUserInitiatedMainRoomDirectSummon', () => {
  it('returns true when target overlaps mentionedAgentIds', () => {
    expect(
      isUserInitiatedMainRoomDirectSummon({
        routableTargetIds: ['a1', 'a2'],
        mentionedAgentIds: ['a2'],
      }),
    ).toBe(true);
  });

  it('returns true for nl_room_directory provenance', () => {
    expect(
      isUserInitiatedMainRoomDirectSummon({
        routableTargetIds: ['a1'],
        mentionedAgentIds: [],
        summonProvenance: 'nl_room_directory',
      }),
    ).toBe(true);
  });

  it('returns false for audience_llm_uuid without mentions', () => {
    expect(
      isUserInitiatedMainRoomDirectSummon({
        routableTargetIds: ['a1', 'a2'],
        mentionedAgentIds: [],
        summonProvenance: 'audience_llm_uuid',
      }),
    ).toBe(false);
  });
});
