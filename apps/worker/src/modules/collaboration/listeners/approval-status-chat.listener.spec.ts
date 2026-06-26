import { of } from 'rxjs';
import { ApprovalStatusChatListener } from './approval-status-chat.listener.js';

describe('ApprovalStatusChatListener', () => {
  function make() {
    const messaging = { subscribeWithBackoff: jest.fn() } as any;
    const pipelineV2Coordinator = {
      run: jest.fn(async () => ({
        routePath: 'execution',
        output: {
          status: 'ok',
          message: 'resumed',
          payload: {
            temporal: { workflowId: 'wf-1' },
            planning: { goal: 'g1', planId: 'plan-1' },
            distribution: { tasks: [{ taskId: 't1' }, { taskId: 't2' }] },
          },
        },
      })),
    } as any;
    const monitoring = {
      incApprovalOutcome: jest.fn(),
      observeApprovalLatency: jest.fn(),
    } as any;
    const config = {
      getWorkerActorUserId: () => 'worker-user',
      getCollaborationMentionRpcTimeoutMs: () => 3000,
    } as any;
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'approval.findOne') {
          return of({
            id: 'a1',
            status: 'approved',
            actionType: 'collaboration.ceo.v2.execute',
            context: { roomId: 'room-main', messageId: 'm1', goal: '继续推进发布' },
          });
        }
        if (pattern === 'collaboration.rooms.findMain') return of({ id: 'room-main' });
        if (pattern === 'agents.findAll') return of({ items: [{ id: 'ceo-1' }] });
        if (pattern === 'collaboration.messages.appendAgent') return of({});
        return of({});
      }),
    } as any;
    const listener = new ApprovalStatusChatListener(messaging, config, monitoring, pipelineV2Coordinator, apiRpc);
    return { listener, messaging, monitoring, apiRpc, pipelineV2Coordinator };
  }

  it('subscribes approval.status.changed topic', () => {
    const { listener, messaging } = make();
    listener.onModuleInit();
    expect(messaging.subscribeWithBackoff).toHaveBeenCalledWith(
      'approval.status.changed',
      expect.any(Function),
      expect.objectContaining({ queue: 'worker-collab-approval-status-chat-queue' }),
    );
  });

  it('approved emits chat message with execution token metadata', async () => {
    const { listener, apiRpc, monitoring, pipelineV2Coordinator } = make();
    await (listener as any).handle({
      companyId: 'c1',
      data: { approvalRequestId: 'a1', status: 'pending' },
    });
    await (listener as any).handle({
      companyId: 'c1',
      data: { approvalRequestId: 'a1', status: 'approved', executionTokenId: 'tok-1' },
    });
    expect(monitoring.incApprovalOutcome).toHaveBeenCalledWith('approved');
    expect(monitoring.observeApprovalLatency).toHaveBeenCalled();
    expect(apiRpc.send).toHaveBeenCalledWith(
      'collaboration.messages.appendAgent',
      expect.objectContaining({
        metadata: expect.objectContaining({
          approvalStatus: 'approved',
          executionTokenId: 'tok-1',
        }),
      }),
    );
    expect(apiRpc.send).toHaveBeenCalledWith(
      'collaboration.messages.appendAgent',
      expect.objectContaining({
        metadata: expect.objectContaining({
          source: 'ceo_v2_post_approval_resume',
          richCard: expect.objectContaining({
            kind: 'ceo_v2_resume',
            cardType: 'approval_resume',
            workflowId: 'wf-1',
            planId: 'plan-1',
            goal: 'g1',
            distributionTaskCount: 2,
            executionMode: 'temporal',
          }),
        }),
      }),
    );
    expect(pipelineV2Coordinator.run).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalRequestId: 'a1',
        companyId: 'c1',
        roomId: 'room-main',
      }),
    );
  });

  it('rejected emits rejected message and never carries token', async () => {
    const { listener, apiRpc, monitoring } = make();
    await (listener as any).handle({
      companyId: 'c1',
      data: { approvalRequestId: 'a2', status: 'rejected' },
    });
    expect(monitoring.incApprovalOutcome).toHaveBeenCalledWith('rejected');
    expect(apiRpc.send).toHaveBeenCalledWith(
      'collaboration.messages.appendAgent',
      expect.objectContaining({
        metadata: expect.objectContaining({ approvalStatus: 'rejected', executionTokenId: null }),
      }),
    );
  });
});

