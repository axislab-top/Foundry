import {
  hasPeerSummonToolInSurface,
  isExplicitPeerIntroDelegateTurn,
  resolveOrderedMainRoomDirectors,
  shouldRequirePeerSummonToolForTurn,
  toolNamesIncludePeerSummon,
} from './main-room-sequential-peer-intro.util.js';

describe('main-room-sequential-peer-intro.util', () => {
  it('toolNamesIncludePeerSummon matches bare and prefixed names', () => {
    expect(toolNamesIncludePeerSummon(['facts.company.query'])).toBe(false);
    expect(toolNamesIncludePeerSummon(['tool.message_send_to_agent'])).toBe(true);
    expect(toolNamesIncludePeerSummon(['message_send_to_agent'])).toBe(true);
  });

  it('hasPeerSummonToolInSurface detects summon tool on surface', () => {
    expect(hasPeerSummonToolInSurface(new Set(['facts.company.query']))).toBe(false);
    expect(hasPeerSummonToolInSurface(new Set(['tool.message_send_to_agent']))).toBe(true);
  });

  it('isExplicitPeerIntroDelegateTurn only true for peer_intro', () => {
    expect(isExplicitPeerIntroDelegateTurn('peer_intro')).toBe(true);
    expect(isExplicitPeerIntroDelegateTurn('ceo_coordinate')).toBe(false);
    expect(isExplicitPeerIntroDelegateTurn(null)).toBe(false);
  });

  it('shouldRequirePeerSummonToolForTurn follows active session only', () => {
    expect(shouldRequirePeerSummonToolForTurn({ peerIntroSessionActive: true })).toBe(true);
    expect(shouldRequirePeerSummonToolForTurn({ peerIntroSessionActive: false })).toBe(false);
  });

  it('resolveOrderedMainRoomDirectors follows department order', () => {
    const ordered = resolveOrderedMainRoomDirectors({
      departments: [
        { id: 'dept-eng', name: '工程部' },
        { id: 'dept-product', name: '产品部' },
      ],
      directorAgentIds: new Set(['dir-eng', 'dir-product']),
      roster: [
        { id: 'dir-product', name: '产品总监', role: 'director', organizationNodeId: 'dept-product' },
        { id: 'dir-eng', name: '工程总监', role: 'director', organizationNodeId: 'dept-eng' },
      ],
    });
    expect(ordered.map((d) => d.agentId)).toEqual(['dir-eng', 'dir-product']);
  });
});
