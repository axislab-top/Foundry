import type { ApprovalRequest } from '../../contracts/approval.contract.js';
import type { CompensationEvent } from './compensation-event.js';

export interface AtomicBindingTransaction {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface AtomicBindingPort {
  createApprovalRecord: (approval: ApprovalRequest) => Promise<{ approvalId: string }>;
  markTaskBlocked: (taskId: string, approvalId: string) => Promise<void>;
  waitForApproval: (approvalId: string) => Promise<boolean>;
  publishCompensation: (event: CompensationEvent) => Promise<void>;
}

export class AtomicBindingService {
  constructor(
    private readonly tx: AtomicBindingTransaction,
    private readonly port: AtomicBindingPort,
  ) {}

  public async executeWithApproval<T>(
    approvalRequest: ApprovalRequest,
    businessLogic: () => Promise<T>,
  ): Promise<T> {
    await this.tx.begin();
    try {
      const approvalRecord = await this.port.createApprovalRecord(approvalRequest);
      const maybeTaskId = (approvalRequest.payload?.taskId as string | undefined) ?? '';
      if (maybeTaskId) {
        await this.port.markTaskBlocked(maybeTaskId, approvalRecord.approvalId);
      }
      const approved = await this.port.waitForApproval(approvalRecord.approvalId);
      if (!approved) {
        throw new Error(`Approval rejected: ${approvalRecord.approvalId}`);
      }
      const result = await businessLogic();
      await this.tx.commit();
      return result;
    } catch (error: unknown) {
      await this.tx.rollback();
      throw error;
    }
  }
}
