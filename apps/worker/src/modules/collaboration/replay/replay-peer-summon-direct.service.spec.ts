import { ReplayPeerSummonDirectService } from './replay-peer-summon-direct.service.js';

describe('ReplayPeerSummonDirectService', () => {
  it('calls executeSkill for message_send_to_agent', async () => {
    const agentExecution = {
      executeSkill: jest.fn().mockResolvedValue({
        result: { ok: true, summonAccepted: true },
        durationMs: 10,
      }),
    };
    const sequentialPeerIntroSession = {
      activateSession: jest.fn().mockResolvedValue(undefined),
    };
    const config = {
      isCollabAgentPeerSummonEnabled: () => true,
    };
    const svc = new ReplayPeerSummonDirectService(
      config as never,
      agentExecution as never,
      sequentialPeerIntroSession as never,
    );

    const out = await svc.summonDirectorInMainRoom({
      companyId: 'c1',
      roomId: 'r1',
      messageId: 'm1',
      traceId: 't1',
      ceoAgentId: 'ceo-1',
      targetAgentId: 'dir-1',
      targetDisplayName: '工程总监',
    });

    expect(out.ok).toBe(true);
    expect(agentExecution.executeSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        skillName: 'tool.message_send_to_agent',
        agentId: 'ceo-1',
      }),
    );
    expect(sequentialPeerIntroSession.activateSession).toHaveBeenCalledWith('c1', 'r1');
  });
});
