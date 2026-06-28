import { Injectable } from '@nestjs/common';
import type { ApprovalFlowApprovalPort } from '@foundry/multi-agent-core';
import { ApprovalService } from './approval.service.js';
import { ApprovalResultPubSubService } from './approval-result-pubsub.service.js';

@Injectable()
export class ApprovalFlowApprovalPortService implements ApprovalFlowApprovalPort {
  private readonly companyByApprovalId = new Map<string, string>();

  constructor(
    private readonly approval: ApprovalService,
    private readonly pubsub: ApprovalResultPubSubService,
  ) {}

  async createApprovalRequest(approvalRequest: any): Promise<{ approvalId: string }> {
    // Map core ApprovalRequest -> API approval request row
    const companyId = String(approvalRequest?.payload?.companyId ?? approvalRequest?.companyId ?? '');
    const actionType = String(approvalRequest?.requestedAction ?? 'unknown');
    const riskLevel = approvalRequest?.riskLevel === 'critical' ? 'L3' : approvalRequest?.riskLevel === 'high' ? 'L3' : approvalRequest?.riskLevel === 'medium' ? 'L2' : 'L1';
    const created = await this.approval.create(companyId, {
      actionType,
      riskLevel,
      context: approvalRequest?.payload ?? null,
      createdBy: null,
    });
    if (companyId && created?.id) {
      this.companyByApprovalId.set(created.id, companyId);
    }
    return { approvalId: created.id };
  }

  async waitForApprovalResult(approvalId: string, timeoutMs: number): Promise<boolean> {
    const companyId = this.companyByApprovalId.get(approvalId);
    if (!companyId) {
      return false;
    }
    try {
      return await this.pubsub.waitForApprovalResult(companyId, approvalId, timeoutMs);
    } finally {
      this.companyByApprovalId.delete(approvalId);
    }
  }
}

