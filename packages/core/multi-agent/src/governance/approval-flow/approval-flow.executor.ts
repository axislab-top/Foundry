import { Injectable } from '@nestjs/common';
import { RiskLevel, ApprovalRequestSchema } from '../../contracts/approval.contract.js';
import { RuntimeContext } from '../../runtime/runtime-context.js';
import { ApprovalFlowService } from './approval-flow.service.js';
import { ApprovalLevel } from './types.js';
import type { MultiLevelApproval } from './multi-level-approval.schema.js';

export interface ApprovalFlowApprovalPort {
  /** Create an underlying approval request record and return its id. */
  createApprovalRequest(approvalRequest: unknown): Promise<{ approvalId: string }>;
  /** Wait for a decision result for a given approval id. */
  waitForApprovalResult(approvalId: string, timeoutMs: number): Promise<boolean>;
}

/**
 * Executes a multi-level approval flow using an underlying "requestAndWait" port.
 * This is designed to be wired by host apps without breaking Phase 3 single-level gate.
 */
@Injectable()
export class ApprovalFlowExecutor {
  constructor(
    private readonly flowService: ApprovalFlowService,
    private readonly approvalPort: ApprovalFlowApprovalPort,
  ) {}

  /**
   * Ensure the step has a stable underlying approval id persisted onto the flow.
   * This MUST be called before waiting so the flow can be resumed after restarts.
   */
  async prepareStep(flow: MultiLevelApproval, index: number): Promise<{ approvalId: string }> {
    const step = flow.levels[index];
    if (!step) {
      throw new Error('step missing');
    }
    if (step.status !== 'pending') {
      if (!step.approvalId) {
        throw new Error('step already resolved but approvalId missing');
      }
      return { approvalId: step.approvalId };
    }
    if (step.timeoutAt && Date.now() > step.timeoutAt) {
      throw new Error('step timeout');
    }

    const approvalRequest = ApprovalRequestSchema.parse({
      traceId: flow.traceId,
      riskLevel: flow.riskLevel,
      requestedAction: flow.originalAction,
      policyRef: `policy:v${flow.policyVersion}:multi-level`,
      approver: step.approver === 'human' ? 'human' : String(step.approver),
      expiresAt: flow.expiresAt,
      payload: {
        approvalFlowId: flow.approvalFlowId,
        approvalLevel: step.level,
        stepIndex: index,
        companyId: flow.companyId,
        ...(flow.metadata as Record<string, unknown>),
      },
    });

    if (!step.approvalId) {
      const created = await this.approvalPort.createApprovalRequest(approvalRequest);
      step.approvalId = created.approvalId;
    }
    return { approvalId: step.approvalId };
  }

  async waitForStepDecision(flow: MultiLevelApproval, index: number, approvalId: string): Promise<boolean> {
    const step = flow.levels[index];
    const timeoutMs = Math.max(0, (step?.timeoutAt ?? flow.expiresAt) - Date.now());
    return await this.approvalPort.waitForApprovalResult(approvalId, timeoutMs);
  }

  async executeStep(flow: MultiLevelApproval, index: number): Promise<StepExecutionResult> {
    try {
      const { approvalId } = await this.prepareStep(flow, index);
      const ok = await this.waitForStepDecision(flow, index, approvalId);
      return ok
        ? { index, status: 'approved', approvalId }
        : { index, status: 'rejected', reason: 'approval rejected', approvalId };
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      if (msg.includes('timeout')) return { index, status: 'timeout', reason: msg };
      return { index, status: 'rejected', reason: msg };
    }
  }

  async executeWithMultiLevelGate<T>(params: {
    action: string;
    execute: () => Promise<T>;
    riskLevel?: RiskLevel;
    policyVersion: number;
    expiresInMs?: number;
    metadata?: Record<string, unknown>;
  }): Promise<T> {
    const context = RuntimeContext.current();
    if (!context) {
      throw new Error('Runtime context missing in multi-level approval executor');
    }

    const riskLevel = params.riskLevel ?? RiskLevel.HIGH;
    const flow = this.flowService.startFlow({
      originalAction: params.action,
      riskLevel,
      context,
      policyVersion: params.policyVersion,
      expiresAt: Date.now() + (params.expiresInMs ?? 48 * 3600_000),
      metadata: params.metadata,
    });

    // AUTO: no approvals needed.
    if (flow.currentLevel === ApprovalLevel.AUTO || flow.levels.length === 0) {
      return await params.execute();
    }

    // Phase 5 MVP: each step maps to one ApprovalRequest; the host app decides how to route approvers.
    for (let i = 0; i < flow.levels.length; i++) {
      const r = await this.executeStep(flow, i);
      if (r.status !== 'approved') {
        throw new Error(`Approval rejected at level=${flow.levels[i]?.level} flow=${flow.approvalFlowId}`);
      }
    }

    return await params.execute();
  }
}

export type StepExecutionResult =
  | { index: number; status: 'approved'; approvalId?: string }
  | { index: number; status: 'rejected'; reason?: string; approvalId?: string }
  | { index: number; status: 'timeout'; reason?: string; approvalId?: string };

