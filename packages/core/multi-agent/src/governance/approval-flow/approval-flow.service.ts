import { Injectable, Logger } from '@nestjs/common';
import { MultiLevelApprovalSchema, type MultiLevelApproval } from './multi-level-approval.schema.js';
import { ApprovalLevel, type ApprovalStep } from './types.js';
import { RiskLevel } from '../../contracts/approval.contract.js';
import type { RuntimeContext as RuntimeExecutionContext } from '../../runtime/runtime-context.js';

/**
 * Phase 5: multi-level approval orchestration model (in-memory schema).
 *
 * Note: persistence/locking is delegated to existing Phase 3 AtomicBinding in host apps.
 */
@Injectable()
export class ApprovalFlowService {
  private readonly logger = new Logger(ApprovalFlowService.name);

  public startFlow(params: {
    originalAction: string;
    riskLevel: RiskLevel;
    context: RuntimeExecutionContext;
    policyVersion: number;
    expiresAt: number;
    metadata?: Record<string, unknown>;
  }): MultiLevelApproval {
    const levels = this.buildApprovalLevels(params.riskLevel);
    const currentLevel = this.determineStartLevel(params.riskLevel);

    const flow = MultiLevelApprovalSchema.parse({
      traceId: params.context.traceId,
      companyId: params.context.companyId,
      originalAction: params.originalAction,
      riskLevel: params.riskLevel,
      currentLevel,
      levels,
      policyVersion: params.policyVersion,
      expiresAt: params.expiresAt,
      metadata: params.metadata ?? {},
    }) as MultiLevelApproval;

    params.context.emitTrace?.({
      type: 'approval.flow.started',
      flowId: flow.approvalFlowId,
      riskLevel: flow.riskLevel,
      currentLevel: flow.currentLevel,
      policyVersion: flow.policyVersion,
    });

    this.logger.log(`Approval flow started`, {
      flowId: flow.approvalFlowId,
      traceId: flow.traceId,
      companyId: flow.companyId,
      riskLevel: flow.riskLevel,
      currentLevel: flow.currentLevel,
      policyVersion: flow.policyVersion,
    });

    return flow;
  }

  public determineStartLevel(risk: RiskLevel): ApprovalLevel {
    if (risk === RiskLevel.LOW) return ApprovalLevel.AUTO;
    if (risk === RiskLevel.MEDIUM) return ApprovalLevel.DEPT_SUPERVISOR;
    if (risk === RiskLevel.HIGH) return ApprovalLevel.CEO;
    return ApprovalLevel.BOARD;
  }

  public buildApprovalLevels(risk: RiskLevel): ApprovalStep[] {
    const levels: ApprovalStep[] = [];

    // LOW: auto, no human steps.
    if (risk === RiskLevel.LOW) return levels;

    // MEDIUM+: dept supervisor
    if (risk === RiskLevel.MEDIUM || risk === RiskLevel.HIGH || risk === RiskLevel.CRITICAL) {
      levels.push({
        level: ApprovalLevel.DEPT_SUPERVISOR,
        approver: 'dept_supervisor',
        status: 'pending',
      });
    }

    // HIGH+: CEO
    if (risk === RiskLevel.HIGH || risk === RiskLevel.CRITICAL) {
      levels.push({
        level: ApprovalLevel.CEO,
        approver: 'ceo',
        status: 'pending',
      });
    }

    // CRITICAL: board / human
    if (risk === RiskLevel.CRITICAL) {
      levels.push({
        level: ApprovalLevel.BOARD,
        approver: 'human',
        status: 'pending',
      });
    }

    return levels;
  }
}

