import { MainRoomRoundtableService } from './main-room-roundtable.service.js';
import type { RoomContext } from './contracts/collaboration-2026.contracts.js';

describe('MainRoomRoundtableService.tryScheduleAfterMainRoomPipeline', () => {
  function svc(publish: jest.Mock, redis: { setNxPx: jest.Mock }) {
    return new MainRoomRoundtableService(
      {
        isCollabMainRoomRoundtableEnabled: () => true,
        getCollabMainRoomRoundtableMaxRounds: () => 4,
        getCollabMainRoomRoundtableRedisTtlMs: () => 600_000,
        getCollabMainRoomMaxDirectTargets: () => 8,
        getRedisKeyPrefix: () => 't:',
      } as any,
      { publish } as any,
      redis as any,
      {} as any,
      { send: jest.fn() } as any,
    );
  }

  const roomMainDiscussion: RoomContext = {
    companyId: 'c1',
    roomId: 'r1',
    roomType: 'main',
    roomName: 'Main',
    organizationNodeId: null,
    members: [],
    memberDirectory: [],
    collaborationMode: 'discussion',
    orgSnapshot: { departments: [], updatedAt: new Date().toISOString() },
  };

  it('does not publish when fewer than 2 non-CEO participants', async () => {
    const publish = jest.fn();
    const redis = { setNxPx: jest.fn(async () => true) };
    await svc(publish, redis).tryScheduleAfterMainRoomPipeline({
      companyId: 'c1',
      roomId: 'r1',
      anchorMessageId: 'm1',
      roomContext: roomMainDiscussion,
      humanSenderId: 'u1',
      humanMessageContent: 'hi',
      mentionedAgentIds: ['ceo-1', 'a2'],
      ceoAgentId: 'ceo-1',
      threadId: null,
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it('publishes roundtable step when two agents mentioned (non-CEO)', async () => {
    const publish = jest.fn(async () => true);
    const redis = { setNxPx: jest.fn(async () => true) };
    await svc(publish, redis).tryScheduleAfterMainRoomPipeline({
      companyId: 'c1',
      roomId: 'r1',
      anchorMessageId: 'm1',
      roomContext: roomMainDiscussion,
      humanSenderId: 'u1',
      humanMessageContent: 'hi',
      mentionedAgentIds: ['a1', 'a2'],
      ceoAgentId: 'ceo-1',
      threadId: null,
    });
    expect(publish).toHaveBeenCalledTimes(1);
    const row = publish.mock.calls[0] as unknown as [unknown];
    const evt = row[0] as { data?: { participantAgentIds?: string[] } };
    expect(evt?.data?.participantAgentIds).toEqual(['a1', 'a2']);
  });
});
