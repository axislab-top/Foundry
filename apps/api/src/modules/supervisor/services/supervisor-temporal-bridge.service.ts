import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Connection, Client } from '@temporalio/client';

@Injectable()
export class SupervisorTemporalBridgeService implements OnModuleDestroy {
  private readonly logger = new Logger(SupervisorTemporalBridgeService.name);
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

  /**
   * M5：失败 Run 复盘 workflow；workflowId 按 runId 去重。
   */
  async startSupervisorReviewWorkflow(input: {
    companyId: string;
    runId: string;
    taskId?: string;
  }): Promise<string | null> {
    try {
      const client = await this.ensureClient();
      if (!client) return null;
      const taskQueue = process.env.TEMPORAL_TASK_QUEUE ?? 'foundry-company';
      const workflowId = `m5-supervisor-${input.runId}`;
      await client.workflow.start('supervisorReviewWorkflow', {
        taskQueue,
        workflowId,
        args: [input],
      });
      return workflowId;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Workflow execution already started')) {
        this.logger.debug(`Supervisor workflow already exists for run ${input.runId}`);
        return null;
      }
      this.logger.warn(`Temporal supervisor workflow start skipped: ${msg}`);
      return null;
    }
  }
}
