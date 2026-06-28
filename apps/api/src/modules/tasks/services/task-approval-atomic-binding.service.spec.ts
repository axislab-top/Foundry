import { TaskApprovalAtomicBindingService } from './task-approval-atomic-binding.service.js';
import { RiskLevel } from '@foundry/multi-agent-core';

describe('TaskApprovalAtomicBindingService', () => {
  it('continues business logic after approval result true', async () => {
    const manager = { update: jest.fn().mockResolvedValue(undefined) };
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      isTransactionActive: true,
      manager,
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };
    const messaging = { publish: jest.fn().mockResolvedValue(undefined) };
    const approvalService = {
      create: jest.fn().mockResolvedValue({ id: 'approval-1' }),
    };
    const approvalPubSub = {
      waitForApprovalResult: jest.fn().mockResolvedValue(true),
    };
    const svc = new TaskApprovalAtomicBindingService(
      dataSource as never,
      messaging as never,
      approvalService as never,
      approvalPubSub as never,
    );

    const result = await svc.executeWithApproval({
      companyId: 'company-1',
      actorId: '00000000-0000-4000-8000-000000000001',
      approvalRequest: {
        approvalRequestId: 'req-1',
        traceId: 'trace-1',
        riskLevel: RiskLevel.HIGH,
        requestedAction: 'tasks.ceo.delegateToDirector',
        policyRef: 'policy:test',
        approver: 'human',
        expiresAt: Date.now() + 1000,
        payload: { taskId: 'task-1' },
        decision: 'pending',
      },
      businessLogic: async () => 'ok',
      options: { taskId: 'task-1' },
    });

    expect(result).toBe('ok');
    expect(approvalPubSub.waitForApprovalResult).toHaveBeenCalledWith('approval-1', expect.any(Number));
  });
});
