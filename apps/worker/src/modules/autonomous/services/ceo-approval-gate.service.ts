import { Injectable } from '@nestjs/common';

/**
 * CEO 审批门闸：用于让后续任务执行（Task/Agent）在 CEO 审批通过后才放行。
 *
 * 注意：该实现基于进程内存状态 + MQ 广播事件更新。
 * 每个 Worker 实例都会消费同一审批事件并更新自己的内存映射。
 */
@Injectable()
export class CeoApprovalGateService {
  private readonly approvalIdToTraceId = new Map<string, string>(); // `${companyId}:${approvalId}` -> traceId
  private readonly approvedTraces = new Set<string>(); // `${companyId}:${traceId}`
  private readonly rejectedTraces = new Set<string>(); // `${companyId}:${traceId}`

  private approvalKey(companyId: string, approvalId: string): string {
    return `${companyId}:${approvalId}`;
  }

  private traceKey(companyId: string, traceId: string): string {
    return `${companyId}:${traceId}`;
  }

  markRequired(params: {
    companyId: string;
    approvalId: string;
    traceId: string;
  }): void {
    const k = this.approvalKey(params.companyId, params.approvalId);
    this.approvalIdToTraceId.set(k, params.traceId);
  }

  resolve(params: {
    companyId: string;
    approvalId: string;
    decision: 'approved' | 'rejected' | 'modified';
  }): void {
    const traceId = this.approvalIdToTraceId.get(this.approvalKey(params.companyId, params.approvalId));
    if (!traceId) {
      // 无映射时不影响系统；后续可以扩展为 DB/Redis 持久映射。
      return;
    }
    const tk = this.traceKey(params.companyId, traceId);
    if (params.decision === 'approved') {
      this.approvedTraces.add(tk);
      this.rejectedTraces.delete(tk);
    } else if (params.decision === 'rejected') {
      this.rejectedTraces.add(tk);
      this.approvedTraces.delete(tk);
    } else {
      // modified：当前先按 approved 处理（待后续接入“修改版计划”）
      this.approvedTraces.add(tk);
      this.rejectedTraces.delete(tk);
    }
  }

  /**
   * 最佳实践：允许直接按 traceId 写入决策状态，
   * 避免 multi-instance 下依赖 approvalId->traceId 映射顺序。
   */
  resolveTrace(params: {
    companyId: string;
    traceId: string;
    decision: 'approved' | 'rejected' | 'modified';
  }): void {
    const tk = this.traceKey(params.companyId, params.traceId);
    if (params.decision === 'approved') {
      this.approvedTraces.add(tk);
      this.rejectedTraces.delete(tk);
    } else if (params.decision === 'rejected') {
      this.rejectedTraces.add(tk);
      this.approvedTraces.delete(tk);
    } else {
      // modified：当前先按 approved 处理
      this.approvedTraces.add(tk);
      this.rejectedTraces.delete(tk);
    }
  }

  isCeoApproved(companyId: string, traceId: string): boolean {
    const tk = this.traceKey(companyId, traceId);
    return this.approvedTraces.has(tk);
  }
}

