import { ApprovalFlowOrchestrator, ApprovalFlowService, ApprovalFlowExecutor, RiskLevel, RuntimeExecutionContext } from '@foundry/multi-agent-core';
import type { ApprovalFlowStorePort, ApprovalFlowApprovalPort, MultiLevelApproval } from '@foundry/multi-agent-core';

class InMemoryFlowStore implements ApprovalFlowStorePort {
  public readonly flows = new Map<string, MultiLevelApproval>();

  async save(flow: MultiLevelApproval): Promise<void> {
    this.flows.set(flow.approvalFlowId, structuredClone(flow));
  }
  async findById(flowId: string): Promise<MultiLevelApproval | null> {
    return this.flows.get(flowId) ?? null;
  }
  async update(flow: MultiLevelApproval): Promise<void> {
    this.flows.set(flow.approvalFlowId, structuredClone(flow));
  }
  async updateStatus(flowId: string, status: MultiLevelApproval['status'], currentIndex?: number): Promise<void> {
    const f = this.flows.get(flowId);
    if (!f) return;
    f.status = status;
    if (typeof currentIndex === 'number') f.currentIndex = currentIndex;
    this.flows.set(flowId, structuredClone(f));
  }
}

class InMemoryApprovalPort implements ApprovalFlowApprovalPort {
  private seq = 0;
  private readonly waiters = new Map<string, (approved: boolean) => void>();
  public readonly created: Array<{ approvalId: string; payload: any }> = [];

  async createApprovalRequest(approvalRequest: any): Promise<{ approvalId: string }> {
    const approvalId = `approval-${++this.seq}`;
    this.created.push({ approvalId, payload: approvalRequest });
    return { approvalId };
  }

  async waitForApprovalResult(approvalId: string, timeoutMs: number): Promise<boolean> {
    return await new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), Math.max(0, timeoutMs));
      this.waiters.set(approvalId, (approved) => {
        clearTimeout(t);
        resolve(approved);
      });
    });
  }

  publish(approvalId: string, approved: boolean): void {
    const w = this.waiters.get(approvalId);
    if (w) {
      this.waiters.delete(approvalId);
      w(approved);
    }
  }
}

describe('Advanced approval flow (MA-040/041)', () => {
  it('drives a persisted flow cursor via step approvals', async () => {
    const store = new InMemoryFlowStore();
    const approvalPort = new InMemoryApprovalPort();
    const flowService = new ApprovalFlowService();
    const executor = new ApprovalFlowExecutor(flowService as any, approvalPort);
    const orchestrator = new ApprovalFlowOrchestrator(store, executor);

    const ctx = new RuntimeExecutionContext({
      traceId: 'trace-adv-1',
      companyId: '10000000-0000-4000-8000-000000000001',
      currentAgentId: 'system.test',
    } as any);

    const flow = flowService.startFlow({
      originalAction: 'tasks.ceo.delegateToDirector',
      riskLevel: RiskLevel.CRITICAL,
      context: ctx as any,
      policyVersion: 7,
      expiresAt: Date.now() + 60_000,
      metadata: { roomId: 'room-1' },
    });

    // Run orchestrator in background (it will block waiting for step1 approval).
    const runPromise = RuntimeExecutionContext.run(ctx as any, () =>
      orchestrator.startAndRun(flow, { autoEscalateOnTimeout: true }),
    );

    // Wait until the first step has an approvalId persisted (restart-safe point).
    for (let i = 0; i < 30; i++) {
      const p = await store.findById(flow.approvalFlowId);
      const step0 = p?.levels?.[0];
      if (step0?.approvalId) break;
      await Promise.resolve();
    }

    const persisted0 = await store.findById(flow.approvalFlowId);
    expect(persisted0?.status).toBe('running');
    expect(persisted0?.currentIndex).toBe(0);
    expect(approvalPort.created.length).toBeGreaterThan(0);

    // Approve each created approval sequentially (dept -> ceo -> board).
    // Since executor persists approvalId into steps, we can read it from store.
    for (let i = 0; i < 3; i++) {
      const persisted = await store.findById(flow.approvalFlowId);
      const step = persisted!.levels[persisted!.currentIndex]!;
      expect(step.approvalId).toBeTruthy();
      approvalPort.publish(step.approvalId!, true);
      // Let orchestrator advance and persist next cursor/approvalId.
      for (let t = 0; t < 10; t++) await Promise.resolve();
    }

    const finalFlow = await runPromise;
    expect(finalFlow.status).toBe('approved');

    const persistedFinal = await store.findById(flow.approvalFlowId);
    expect(persistedFinal?.status).toBe('approved');
    expect(persistedFinal?.currentIndex).toBe(persistedFinal?.levels.length);
  });
});

