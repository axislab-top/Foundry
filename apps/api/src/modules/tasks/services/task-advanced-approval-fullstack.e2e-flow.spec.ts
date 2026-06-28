import { TaskApprovalAtomicBindingService } from './task-approval-atomic-binding.service.js';
import { RiskLevel } from '@foundry/multi-agent-core';

describe('Advanced approval fullstack binding (MA-041)', () => {
  it('blocks task with approvalFlowId then unlocks to queued after flow approved', async () => {
    const firstRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      isTransactionActive: true,
      manager: { update: jest.fn().mockResolvedValue(undefined) },
    };
    const secondRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      isTransactionActive: true,
      manager: { update: jest.fn().mockResolvedValue(undefined) },
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValueOnce(firstRunner).mockReturnValueOnce(secondRunner),
    };
    const messaging = { publish: jest.fn().mockResolvedValue(undefined) };
    const approvalService = { create: jest.fn().mockResolvedValue({ id: 'approval-unused' }) };
    const approvalPubSub = { waitForApprovalResult: jest.fn().mockResolvedValue(true) };

    // Fake approval flow runtime: returns a stable flow id and waits until we "approve".
    let resolveRun: (flow: any) => void;
    const runPromise = new Promise<any>((r) => (resolveRun = r));
    const approvalFlowRuntime = {
      createInitialFlow: jest.fn().mockReturnValue({
        approvalFlowId: 'flow-1',
        traceId: 'trace-1',
        companyId: 'company-1',
        status: 'running',
        currentIndex: 0,
        levels: [{ level: 'dept_supervisor', approver: 'dept', status: 'pending', approvalId: 'a1' }],
        expiresAt: Date.now() + 1000,
        riskLevel: 'critical',
        originalAction: 'tasks.ceo.delegateToDirector',
        currentLevel: 'dept_supervisor',
        policyVersion: 1,
        metadata: {},
      }),
      startAndRun: jest.fn().mockImplementation(async () => {
        return await runPromise;
      }),
    };

    const svc = new TaskApprovalAtomicBindingService(
      dataSource as never,
      messaging as never,
      approvalService as never,
      approvalPubSub as never,
      approvalFlowRuntime as never,
    );

    const p = svc.executeWithAdvancedApproval({
      companyId: 'company-1',
      actorId: 'actor-1',
      taskId: 'task-1',
      action: 'tasks.ceo.delegateToDirector',
      riskLevel: RiskLevel.CRITICAL,
      policyVersion: 1,
      traceId: 'trace-1',
      businessLogic: async () => 'ok',
    });

    // Wait until Tx1 finishes the blocked update.
    for (let i = 0; i < 30; i++) {
      if ((firstRunner.manager.update as any).mock.calls.length > 0) break;
      await Promise.resolve();
    }
    // After Tx1 it should have set blocked + approvalFlowId.
    expect(firstRunner.manager.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'task-1', companyId: 'company-1' }),
      expect.objectContaining({ status: 'blocked', approvalFlowId: 'flow-1' }),
    );

    // Approve the flow.
    resolveRun!({ approvalFlowId: 'flow-1', status: 'approved', traceId: 'trace-1' });

    const out = await p;
    expect(out).toBe('ok');
    expect(secondRunner.manager.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'task-1', companyId: 'company-1' }),
      expect.objectContaining({ status: 'queued', approvalFlowId: null }),
    );
  });
});

