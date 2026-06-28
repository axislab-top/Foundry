import { Injectable } from '@nestjs/common';
import {
  ApprovalFlowExecutor,
  ApprovalFlowOrchestrator,
  ApprovalFlowService,
  type MultiLevelApproval,
  RiskLevel,
  RuntimeExecutionContext,
} from '@foundry/multi-agent-core';
import { ApprovalFlowStoreService } from './approval-flow-store.service.js';
import { ApprovalFlowApprovalPortService } from './approval-flow-approval-port.service.js';

@Injectable()
export class ApprovalFlowRuntimeService {
  constructor(
    private readonly store: ApprovalFlowStoreService,
    private readonly approvalPort: ApprovalFlowApprovalPortService,
  ) {}

  createInitialFlow(params: {
    traceId: string;
    companyId: string;
    currentAgentId: string;
    originalAction: string;
    riskLevel: RiskLevel;
    policyVersion: number;
    expiresInMs?: number;
    metadata?: Record<string, unknown>;
  }): MultiLevelApproval {
    const ctx = new RuntimeExecutionContext({
      traceId: params.traceId,
      companyId: params.companyId,
      currentAgentId: params.currentAgentId,
    } as any);
    const flowService = new ApprovalFlowService();
    return RuntimeExecutionContext.run(ctx as any, () =>
      flowService.startFlow({
        originalAction: params.originalAction,
        riskLevel: params.riskLevel,
        context: ctx as any,
        policyVersion: params.policyVersion,
        expiresAt: Date.now() + (params.expiresInMs ?? 48 * 3600_000),
        metadata: params.metadata,
      }),
    );
  }

  async startAndRun(flow: MultiLevelApproval): Promise<MultiLevelApproval> {
    const flowService = new ApprovalFlowService();
    const executor = new ApprovalFlowExecutor(flowService as any, this.approvalPort);
    const orchestrator = new ApprovalFlowOrchestrator(this.store, executor);
    const ctx = new RuntimeExecutionContext({
      traceId: flow.traceId,
      companyId: flow.companyId,
      currentAgentId: 'system.approval-flow',
    } as any);
    return await RuntimeExecutionContext.run(ctx as any, () =>
      orchestrator.startAndRun(flow, { autoEscalateOnTimeout: true }),
    );
  }
}

