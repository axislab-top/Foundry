import { ApprovalGateService } from './approval-gate.service.js';

describe('ApprovalGateService', () => {
  function make() {
    const pendingTaskService = {
      resumeAfterBudgetApproval: jest.fn(),
      cancelAfterBudgetRejection: jest.fn(),
    } as any;
    const service = new ApprovalGateService(pendingTaskService);
    return { service, pendingTaskService };
  }

  it('routes approved budget decision to resume', async () => {
    const { service, pendingTaskService } = make();
    await service.processDecision({
      eventId: 'evt-1',
      companyId: 'c1',
      approvalRequestId: 'a1',
      actionType: 'budget.autonomous.task.execute',
      status: 'approved',
    });
    expect(pendingTaskService.resumeAfterBudgetApproval).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'c1', approvalRequestId: 'a1' }),
    );
    expect(pendingTaskService.cancelAfterBudgetRejection).not.toHaveBeenCalled();
  });

  it('routes rejected budget decision to cancel', async () => {
    const { service, pendingTaskService } = make();
    await service.processDecision({
      eventId: 'evt-2',
      companyId: 'c1',
      approvalRequestId: 'a2',
      actionType: 'budget.autonomous.task.execute',
      status: 'rejected',
      reason: 'no budget',
    });
    expect(pendingTaskService.cancelAfterBudgetRejection).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'c1', approvalRequestId: 'a2', status: 'rejected' }),
    );
    expect(pendingTaskService.resumeAfterBudgetApproval).not.toHaveBeenCalled();
  });

  it('is idempotent for same decision event key', async () => {
    const { service, pendingTaskService } = make();
    const evt = {
      eventId: 'evt-dup',
      companyId: 'c1',
      approvalRequestId: 'a3',
      actionType: 'budget.autonomous.task.execute',
      status: 'approved' as const,
    };
    await service.processDecision(evt);
    await service.processDecision(evt);
    expect(pendingTaskService.resumeAfterBudgetApproval).toHaveBeenCalledTimes(1);
  });

  it('W10: routes employee.autonomous.subtask.execute approved to resume', async () => {
    const { service, pendingTaskService } = make();
    await service.processDecision({
      eventId: 'evt-emp',
      companyId: 'c1',
      approvalRequestId: 'a-emp',
      actionType: 'employee.autonomous.subtask.execute',
      status: 'approved',
    });
    expect(pendingTaskService.resumeAfterBudgetApproval).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'c1', approvalRequestId: 'a-emp' }),
    );
  });

  it('W9: routes director.autonomous.subtask.execute approved to resume', async () => {
    const { service, pendingTaskService } = make();
    await service.processDecision({
      eventId: 'evt-dir',
      companyId: 'c1',
      approvalRequestId: 'a-dir',
      actionType: 'director.autonomous.subtask.execute',
      status: 'approved',
    });
    expect(pendingTaskService.resumeAfterBudgetApproval).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'c1', approvalRequestId: 'a-dir' }),
    );
  });

  it('W11: routes cross.department.joint.approval approved to resume', async () => {
    const { service, pendingTaskService } = make();
    await service.processDecision({
      eventId: 'evt-xd',
      companyId: 'c1',
      approvalRequestId: 'a-xd',
      actionType: 'cross.department.joint.approval',
      status: 'approved',
    });
    expect(pendingTaskService.resumeAfterBudgetApproval).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'c1', approvalRequestId: 'a-xd' }),
    );
  });

  it('skips unknown action type', async () => {
    const { service, pendingTaskService } = make();
    await service.processDecision({
      companyId: 'c1',
      approvalRequestId: 'a4',
      actionType: 'agent.hire',
      status: 'approved',
    });
    expect(pendingTaskService.resumeAfterBudgetApproval).not.toHaveBeenCalled();
    expect(pendingTaskService.cancelAfterBudgetRejection).not.toHaveBeenCalled();
  });
});
