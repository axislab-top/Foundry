import { resolveAudienceRoutingDeterministic } from './audience-routing-deterministic.js';
import type { RoomContext } from '../contracts/collaboration-2026.contracts.js';

function room(over?: Partial<RoomContext>): RoomContext {
  return {
    companyId: 'c',
    roomId: 'r',
    roomType: 'main',
    roomName: 'Main',
    organizationNodeId: null,
    members: [
      { memberType: 'agent', memberId: 'agent-a' },
      { memberType: 'agent', memberId: 'agent-b' },
    ],
    memberDirectory: [],
    orgSnapshot: { departments: [], updatedAt: new Date().toISOString() },
    ...over,
  };
}

describe('resolveAudienceRoutingDeterministic', () => {
  it('skips LLM when all non-CEO @ are in-room', () => {
    const out = resolveAudienceRoutingDeterministic({
      originalContentText: 'hi',
      mentionedAgentIds: ['agent-a'],
      roomContext: room(),
      ceoAgentId: null,
      maxDirect: 8,
    });
    expect(out.callLlm).toBe(false);
    if (out.callLlm === false) {
      expect(out.kind).toBe('mention_in_room');
      expect(out).toMatchObject({
        callLlm: false,
        kind: 'mention_in_room',
        parsed: {
          confidence: 0.96,
          explanation: expect.stringContaining('跳过受众路由 LLM'),
        },
      });
    }
  });

  it('calls LLM when some @ are not in room', () => {
    const out = resolveAudienceRoutingDeterministic({
      originalContentText: 'hi',
      mentionedAgentIds: ['agent-a', 'ghost'],
      roomContext: room(),
      ceoAgentId: null,
      maxDirect: 8,
    });
    expect(out.callLlm).toBe(true);
  });

  it('skips LLM for org-wide department listing without non-CEO in-room @', () => {
    const out = resolveAudienceRoutingDeterministic({
      originalContentText: '我公司有哪些部门',
      mentionedAgentIds: [],
      roomContext: room(),
      ceoAgentId: null,
      maxDirect: 8,
    });
    expect(out.callLlm).toBe(false);
    if (out.callLlm === false) {
      expect(out.kind).toBe('org_listing_ceo_line');
      expect(out).toMatchObject({
        callLlm: false,
        kind: 'org_listing_ceo_line',
        parsed: {
          confidence: 0.93,
          explanation: expect.stringContaining('组织全貌'),
        },
      });
    }
  });
});
