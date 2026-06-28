import { ApprovalEventHandler } from './approval-event.handler.js';

describe('ApprovalEventHandler', () => {
  function make() {
    const messaging = { subscribeWithBackoff: jest.fn() } as any;
    const approvalGateService = { processDecision: jest.fn() } as any;
    const handler = new ApprovalEventHandler(messaging, approvalGateService);
    return { handler, messaging, approvalGateService };
  }

  it('subscribes approval.status.changed topic', () => {
    const { handler, messaging } = make();
    handler.onModuleInit();
    expect(messaging.subscribeWithBackoff).toHaveBeenCalledWith(
      'approval.status.changed',
      expect.any(Function),
      expect.objectContaining({ queue: 'worker-company-runtime-approval-status-queue' }),
    );
  });

  it('routes approved event to approval gate', async () => {
    const { handler, approvalGateService } = make();
    await (handler as any).handleApprovalStatusChanged({
      eventId: 'evt-1',
      companyId: 'c1',
      data: {
        approvalRequestId: 'a1',
        status: 'approved',
        actionType: 'budget.autonomous.task.execute',
      },
    });
    expect(approvalGateService.processDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt-1',
        companyId: 'c1',
        approvalRequestId: 'a1',
        status: 'approved',
      }),
    );
  });

  it('ignores non-terminal status', async () => {
    const { handler, approvalGateService } = make();
    await (handler as any).handleApprovalStatusChanged({
      eventId: 'evt-2',
      companyId: 'c1',
      data: {
        approvalRequestId: 'a2',
        status: 'pending',
        actionType: 'budget.autonomous.task.execute',
      },
    });
    expect(approvalGateService.processDecision).not.toHaveBeenCalled();
  });

  it('propagates processing errors for retry/dlq', async () => {
    const { handler, approvalGateService } = make();
    approvalGateService.processDecision.mockRejectedValueOnce(new Error('boom'));
    await expect(
      (handler as any).handleApprovalStatusChanged({
        eventId: 'evt-3',
        companyId: 'c1',
        data: {
          approvalRequestId: 'a3',
          status: 'rejected',
          actionType: 'budget.autonomous.task.execute',
        },
      }),
    ).rejects.toThrow('boom');
  });
});
