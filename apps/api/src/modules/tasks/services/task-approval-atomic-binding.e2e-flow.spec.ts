import { TaskApprovalAtomicBindingService } from './task-approval-atomic-binding.service.js';
import { RiskLevel } from '@foundry/multi-agent-core';

class InMemoryApprovalPubSub {
  private readonly waiters = new Map<string, (approved: boolean) => void>();
  private readonly buffered = new Map<string, boolean>();

  private key(companyId: string, approvalId: string): string {
    return `${companyId}:${approvalId}`;
  }

  async publishApprovalResult(
    companyId: string,
    approvalId: string,
    approved: boolean,
  ): Promise<void> {
    const key = this.key(companyId, approvalId);
    const waiter = this.waiters.get(key);
    if (waiter) {
      waiter(approved);
      this.waiters.delete(key);
      return;
    }
    this.buffered.set(key, approved);
  }

  async waitForApprovalResult(
    companyId: string,
    approvalId: string,
    _timeoutMs: number,
  ): Promise<boolean> {
    const key = this.key(companyId, approvalId);
    const buffered = this.buffered.get(key);
    if (buffered !== undefined) {
      this.buffered.delete(key);
      return buffered;
    }
    return await new Promise<boolean>((resolve) => {
      this.waiters.set(key, resolve);
    });
  }
}

describe('Approval gate async flow (MA-026)', () => {
  it('moves task blocked -> queued after approval publish', async () => {
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
      createQueryRunner: jest
        .fn()
        .mockReturnValueOnce(firstRunner)
        .mockReturnValueOnce(secondRunner),
    };
    const messaging = { publish: jest.fn().mockResolvedValue(undefined) };
    const approvalService = {
      create: jest.fn().mockResolvedValue({ id: 'approval-async-1' }),
    };
    const approvalPubSub = new InMemoryApprovalPubSub();
    const svc = new TaskApprovalAtomicBindingService(
      dataSource as never,
      messaging as never,
      approvalService as never,
      approvalPubSub as never,
      { createInitialFlow: jest.fn(), startAndRun: jest.fn() } as never,
    );

    const runPromise = svc.executeWithApproval({
      companyId: '10000000-0000-4000-8000-000000000001',
      actorId: '20000000-0000-4000-8000-000000000001',
      approvalRequest: {
        approvalRequestId: 'req-1',
        traceId: 'trace-1',
        riskLevel: RiskLevel.HIGH,
        requestedAction: 'tasks.ceo.delegateToDirector',
        policyRef: 'policy:high',
        approver: 'human',
        expiresAt: Date.now() + 10_000,
        payload: { taskId: 'task-1' },
        decision: 'pending',
      },
      options: { taskId: 'task-1' },
      businessLogic: async () => 'ok',
    });

    await Promise.resolve();
    await approvalPubSub.publishApprovalResult(
      '10000000-0000-4000-8000-000000000001',
      'approval-async-1',
      true,
    );

    const result = await runPromise;
    expect(result).toBe('ok');
    expect(firstRunner.manager.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'task-1' }),
      expect.objectContaining({ status: 'blocked' }),
    );
    expect(secondRunner.manager.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'task-1' }),
      expect.objectContaining({ status: 'queued' }),
    );
  });
});
