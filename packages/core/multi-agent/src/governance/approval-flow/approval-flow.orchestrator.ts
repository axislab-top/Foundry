import { Injectable, Logger } from '@nestjs/common';
import type { MultiLevelApproval } from './multi-level-approval.schema.js';
import { ApprovalLevel, type ApprovalStepStatus } from './types.js';
import { RuntimeContext as RuntimeExecutionContext } from '../../runtime/runtime-context.js';
import { ApprovalFlowExecutor, type StepExecutionResult } from './approval-flow.executor.js';
import type { ApprovalFlowStorePort } from './flow-store.port.js';

export interface ApprovalFlowOrchestratorOptions {
  /** If true, will try to auto-escalate on step timeout via `escalateTo`. */
  autoEscalateOnTimeout?: boolean;
}

/**
 * Phase 5: real orchestration loop with an explicit flow cursor + status.
 *
 * Persistence is delegated to the host app (DB/Redis/event sourcing). This class is pure orchestration.
 */
@Injectable()
export class ApprovalFlowOrchestrator {
  private readonly logger = new Logger(ApprovalFlowOrchestrator.name);

  constructor(
    private readonly store: ApprovalFlowStorePort,
    private readonly executor: ApprovalFlowExecutor,
  ) {}

  async startAndRun(initialFlow: MultiLevelApproval, options?: ApprovalFlowOrchestratorOptions): Promise<MultiLevelApproval> {
    await this.store.save(initialFlow);
    return await this.execute(initialFlow, options);
  }

  async execute(flow: MultiLevelApproval, options?: ApprovalFlowOrchestratorOptions): Promise<MultiLevelApproval> {
    const ctx = RuntimeExecutionContext.current();
    if (!ctx) {
      throw new Error('Runtime context missing in ApprovalFlowOrchestrator');
    }

    // terminal guard
    if (flow.status !== 'running') return flow;

    await this.store.update(flow);

    while (flow.currentIndex < flow.levels.length) {
      const step = flow.levels[flow.currentIndex]!;
      if (step.status !== 'pending') {
        flow.currentIndex++;
        await this.store.updateStatus(flow.approvalFlowId, flow.status, flow.currentIndex);
        continue;
      }

      ctx.emitTrace?.({
        type: 'approval.step.start',
        flowId: flow.approvalFlowId,
        index: flow.currentIndex,
        level: step.level,
      });

      const group = this.collectParallelGroup(flow, flow.currentIndex);
      // Phase 5: persist step->approvalId before waiting, to be restart-safe.
      for (const idx of group.indexes) {
        await this.executor.prepareStep(flow, idx);
      }
      await this.store.update(flow);

      const results = await Promise.all(group.indexes.map((idx) => this.executor.executeStep(flow, idx)));

      const rejected = results.find((r) => r.status === 'rejected');
      if (rejected) {
        this.applyStepResult(flow, rejected.index, rejected);
        flow.status = 'rejected';
        flow.currentLevel = step.level;
        await this.store.update(flow);
        ctx.emitTrace?.({ type: 'approval.flow.rejected', flowId: flow.approvalFlowId, index: rejected.index });
        return flow;
      }

      const timedOut = results.find((r) => r.status === 'timeout');
      if (timedOut) {
        this.applyStepResult(flow, timedOut.index, timedOut);
        if (options?.autoEscalateOnTimeout && step.escalateTo) {
          // mark current step as skipped and insert escalation step if missing
          flow.levels[timedOut.index]!.status = 'skipped';
          this.insertEscalationIfNeeded(flow, step.escalateTo, timedOut.index + 1);
          await this.store.update(flow);
          ctx.emitTrace?.({
            type: 'approval.step.escalated',
            flowId: flow.approvalFlowId,
            fromLevel: step.level,
            toLevel: step.escalateTo,
          });
          continue;
        }
        flow.status = 'expired';
        await this.store.update(flow);
        ctx.emitTrace?.({ type: 'approval.flow.expired', flowId: flow.approvalFlowId });
        return flow;
      }

      // all approved (or skipped) in group
      for (const r of results) {
        this.applyStepResult(flow, r.index, r);
      }
      flow.currentIndex = group.nextIndex;
      await this.store.update(flow);
    }

    // fully approved
    flow.status = 'approved';
    flow.currentLevel = ApprovalLevel.AUTO;
    await this.store.update(flow);
    ctx.emitTrace?.({ type: 'approval.flow.approved', flowId: flow.approvalFlowId });
    this.logger.log('Approval flow approved', { flowId: flow.approvalFlowId, traceId: flow.traceId });
    return flow;
  }

  private applyStepResult(flow: MultiLevelApproval, index: number, result: StepExecutionResult): void {
    const step = flow.levels[index];
    if (!step) return;
    if (result.status === 'approved') {
      step.status = 'approved';
      step.approvedAt = Date.now();
      step.reason = undefined;
      return;
    }
    if (result.status === 'rejected') {
      step.status = 'rejected';
      step.reason = result.reason;
      return;
    }
    if (result.status === 'timeout') {
      step.status = 'rejected' satisfies ApprovalStepStatus;
      step.reason = result.reason ?? 'timeout';
      return;
    }
  }

  private collectParallelGroup(flow: MultiLevelApproval, startIndex: number): { indexes: number[]; nextIndex: number } {
    const first = flow.levels[startIndex];
    if (!first?.groupId) return { indexes: [startIndex], nextIndex: startIndex + 1 };
    const indexes: number[] = [];
    for (let i = startIndex; i < flow.levels.length; i++) {
      const s = flow.levels[i]!;
      if (s.groupId !== first.groupId) break;
      if (s.status === 'pending') indexes.push(i);
    }
    return { indexes: indexes.length ? indexes : [startIndex], nextIndex: startIndex + 1 + (indexes.length ? indexes.length - 1 : 0) };
  }

  private insertEscalationIfNeeded(flow: MultiLevelApproval, level: ApprovalLevel, atIndex: number): void {
    const exists = flow.levels.some((s) => s.level === level && s.status === 'pending');
    if (exists) return;
    flow.levels.splice(atIndex, 0, { level, approver: 'human', status: 'pending' });
  }
}

