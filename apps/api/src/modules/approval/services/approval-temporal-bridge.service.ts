import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Connection, Client } from '@temporalio/client';

/**
 * 可选：连接 Temporal 以启动审批等待 workflow 并回传 signal。
 * 未配置 TEMPORAL_ADDRESS 时全部为 no-op，审批仍以 PostgreSQL 为准。
 */
@Injectable()
export class ApprovalTemporalBridgeService implements OnModuleDestroy {
  private readonly logger = new Logger(ApprovalTemporalBridgeService.name);
  private client: Client | null = null;

  async onModuleDestroy(): Promise<void> {
    if (this.client?.connection) {
      try {
        await this.client.connection.close();
      } catch {
        /* ignore */
      }
    }
  }

  private async ensureClient(): Promise<Client | null> {
    const addr = process.env.TEMPORAL_ADDRESS?.trim();
    if (!addr) return null;
    if (this.client) return this.client;
    const connection = await Connection.connect({ address: addr });
    const namespace = process.env.TEMPORAL_NAMESPACE ?? 'default';
    this.client = new Client({ connection, namespace });
    return this.client;
  }

  async startApprovalWaitWorkflow(input: {
    approvalId: string;
    companyId: string;
  }): Promise<string | null> {
    try {
      const client = await this.ensureClient();
      if (!client) return null;
      const taskQueue = process.env.TEMPORAL_TASK_QUEUE ?? 'foundry-company';
      const workflowId = `m4-approval-${input.approvalId}`;
      await client.workflow.start('approvalWaitWorkflow', {
        taskQueue,
        workflowId,
        args: [input],
      });
      return workflowId;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Temporal start skipped: ${msg}`);
      return null;
    }
  }

  async signalDecision(workflowId: string | null, decision: 'approved' | 'rejected'): Promise<void> {
    if (!workflowId) return;
    try {
      const client = await this.ensureClient();
      if (!client) return;
      const handle = client.workflow.getHandle(workflowId);
      await handle.signal('approval.decision', decision);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Temporal signal skipped: ${msg}`);
    }
  }
}
