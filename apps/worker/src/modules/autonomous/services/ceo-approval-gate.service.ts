import { Injectable } from '@nestjs/common';

/**
 * CEO 审批门闸：自治流水线内快速同步（同进程）用。
 *
 * **Pending 任务执行路径**（pending-agent-tasks）已改为只读 **任务 metadata** 中的
 * `ceoApprovalDecision`，不再依赖本服务的 `isCeoApproved`，避免 Worker 重启丢状态。
 * 监听器仍可调用 `resolve` / `resolveTrace` 以加速同实例内后续 tick。
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

