import { BadRequestException } from '@nestjs/common';
import { AgentPeerSummonInternalService } from './agent-peer-summon-internal.service.js';

describe('AgentPeerSummonInternalService', () => {
  function svc(deps: {
    appendAgentMessage?: jest.Mock;
    findMainRoom?: jest.Mock;
    setNxPx?: jest.Mock;
    publish?: jest.Mock;
  }) {
    return new AgentPeerSummonInternalService(
      {
        appendAgentMessage:
          deps.appendAgentMessage ??
          jest.fn().mockResolvedValue({ id: 'msg-1', roomId: 'room-1' }),
      } as any,
      {
        findOneOrFail: jest.fn(),
        findMainRoom: deps.findMainRoom ?? jest.fn().mockResolvedValue({ id: 'room-1' }),
      } as any,
      { addMembers: jest.fn().mockResolvedValue(undefined) } as any,
      { publish: deps.publish ?? jest.fn().mockResolvedValue(undefined) } as any,
      { setNxPx: deps.setNxPx ?? jest.fn().mockResolvedValue(true) } as any,
      { getRedisKeyPrefix: () => 'pfx:' } as any,
    );
  }

  it('appendAgent as senderAgentId and publishes peer summon event', async () => {
    const publish = jest.fn().mockResolvedValue(undefined);
    const appendAgentMessage = jest.fn().mockResolvedValue({ id: 'msg-1' });
    const service = svc({ publish, appendAgentMessage });

    const out = await service.send({
      companyId: 'c1',
      senderAgentId: 'ceo-1',
      targetAgentId: 'dir-1',
      content: '请工程部总监做个自我介绍',
    });

    expect(out).toEqual({
      ok: true,
      roomId: 'room-1',
      messageId: 'msg-1',
      summonAccepted: true,
    });
    expect(appendAgentMessage).toHaveBeenCalledWith(
      'c1',
      'room-1',
      'ceo-1',
      '请工程部总监做个自我介绍',
      'text',
      expect.objectContaining({
        source: 'agent_peer_summon_tool',
        summonTargetAgentIds: ['dir-1'],
      }),
      null,
    );
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'collaboration.agent-peer-summon.requested',
        data: expect.objectContaining({
          sourceMessageId: 'msg-1',
          senderAgentId: 'ceo-1',
          targetAgentId: 'dir-1',
        }),
      }),
      expect.objectContaining({ routingKey: 'collaboration.agent-peer-summon.requested' }),
    );
  });

  it('skips event when expectReply is false', async () => {
    const publish = jest.fn();
    const service = svc({ publish });
    const out = await service.send({
      companyId: 'c1',
      senderAgentId: 'ceo-1',
      targetAgentId: 'dir-1',
      content: 'hi',
      expectReply: false,
    });
    expect(out.summonAccepted).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });

  it('rejects self summon', async () => {
    const service = svc({});
    await expect(
      service.send({
        companyId: 'c1',
        senderAgentId: 'a1',
        targetAgentId: 'a1',
        content: 'hi',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('dedupes publish when redis nx fails', async () => {
    const publish = jest.fn();
    const service = svc({ publish, setNxPx: jest.fn().mockResolvedValue(false) });
    const out = await service.send({
      companyId: 'c1',
      senderAgentId: 'ceo-1',
      targetAgentId: 'dir-1',
      content: 'hi',
    });
    expect(out.summonAccepted).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });
});
