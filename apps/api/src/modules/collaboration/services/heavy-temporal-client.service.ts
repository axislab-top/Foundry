import { Injectable, Logger } from '@nestjs/common';
import { Client, Connection } from '@temporalio/client';
import { ConfigService } from '../../../common/config/config.service.js';
import { metrics, trace } from '@opentelemetry/api';

export type HeavyWorkflowSignalType = 'humanApprovalSignal' | 'interventionSignal';

/**
 * L3 Temporal 重构 Step 8: Admin Observability Panel
 * Temporal admin client for listing workflow state/history and sending signals.
 */
@Injectable()
export class HeavyTemporalClientService {
  private readonly logger = new Logger(HeavyTemporalClientService.name);
  private readonly tracer = trace.getTracer('api-collaboration-heavy-admin');
  private readonly meter = metrics.getMeter('api-collaboration-heavy-admin');
  private readonly requests = this.meter.createCounter('foundry.l3.admin.requests');
  private readonly latency = this.meter.createHistogram('foundry.l3.admin.latency', { unit: 'ms' });
  private readonly signalSent = this.meter.createCounter('foundry.l3.admin.signal.sent');
  private connection: Connection | null = null;
  private readonly namespace: string;

  constructor(private readonly config: ConfigService) {
    this.namespace = this.config.get<string>('TEMPORAL_NAMESPACE', 'default');
  }

  private async getClient(): Promise<Client> {
    if (!this.connection) {
      this.connection = await Connection.connect({
        address: this.config.get<string>('TEMPORAL_ADDRESS', 'localhost:7233'),
      });
    }
    return new Client({
      connection: this.connection,
      namespace: this.namespace,
    });
  }

  async listOpenWorkflows(companyId?: string): Promise<
    Array<{
      workflowId: string;
      runId?: string;
      status?: string;
      startTime?: string | null;
      executionTimeMs?: number | null;
      stage?: string;
      companyId?: string | null;
      humanInterventionCount?: number;
    }>
  > {
    const span = this.tracer.startSpan('l3.ceo-heavy.admin.listOpenWorkflows');
    const started = Date.now();
    try {
      const client = await this.getClient();
      const query = `WorkflowType = "ceoHeavyRootWorkflow" AND ExecutionStatus = "Running"`;
      const out: Array<{
        workflowId: string;
        runId?: string;
        status?: string;
        startTime?: string | null;
        executionTimeMs?: number | null;
        stage?: string;
        companyId?: string | null;
        humanInterventionCount?: number;
      }> = [];
      for await (const item of client.workflow.list({ query })) {
        const wfId = String((item as any)?.workflowId ?? '');
        if (!wfId) continue;
        const handle = client.workflow.getHandle(wfId);
        const desc = await handle.describe().catch(() => null as any);
        const memoCompanyId = String(desc?.memo?.companyId ?? desc?.searchAttributes?.companyId ?? '').trim() || null;
        if (companyId && memoCompanyId !== companyId) continue;
        const startedAt = desc?.startTime ? new Date(desc.startTime).getTime() : null;
        out.push({
          workflowId: wfId,
          runId: String(desc?.runId ?? (item as any)?.runId ?? ''),
          status: String(desc?.status?.name ?? (item as any)?.status ?? 'RUNNING'),
          startTime: desc?.startTime ? new Date(desc.startTime).toISOString() : null,
          executionTimeMs: startedAt ? Date.now() - startedAt : null,
          stage: String(desc?.memo?.stage ?? 'running'),
          companyId: memoCompanyId,
          humanInterventionCount: Number(desc?.memo?.humanInterventionCount ?? 0),
        });
      }
      this.requests.add(1, { action: 'list', status: 'success' });
      this.latency.record(Date.now() - started, { action: 'list' });
      return out;
    } catch (e) {
      span.recordException(e as Error);
      this.requests.add(1, { action: 'list', status: 'error' });
      throw e;
    } finally {
      span.end();
    }
  }

  async describeWorkflow(workflowId: string): Promise<{
    workflowId: string;
    status?: string;
    runId?: string;
    historyEvents: Array<Record<string, unknown>>;
    rawDescribe?: Record<string, unknown>;
  }> {
    const span = this.tracer.startSpan('l3.ceo-heavy.admin.describeWorkflow');
    const started = Date.now();
    try {
      const client = await this.getClient();
      const handle = client.workflow.getHandle(workflowId);
      const desc = await handle.describe();
      const historyEvents: Array<Record<string, unknown>> = [];
      const history = await (handle as any).fetchHistory?.().catch(() => null);
      if (history && Array.isArray(history.events)) {
        for (const ev of history.events.slice(-200)) {
          historyEvents.push({
            eventId: ev?.eventId ?? null,
            eventType: ev?.eventType ?? null,
            eventTime: ev?.eventTime ?? null,
          });
        }
      }
      this.requests.add(1, { action: 'detail', status: 'success' });
      this.latency.record(Date.now() - started, { action: 'detail' });
      return {
        workflowId,
        status: String((desc as any)?.status?.name ?? 'UNKNOWN'),
        runId: String((desc as any)?.runId ?? ''),
        historyEvents,
        rawDescribe: desc as any,
      };
    } catch (e) {
      span.recordException(e as Error);
      this.requests.add(1, { action: 'detail', status: 'error' });
      throw e;
    } finally {
      span.end();
    }
  }

  async signalWorkflow(params: {
    workflowId: string;
    signalType: HeavyWorkflowSignalType;
    payload: Record<string, unknown>;
  }): Promise<{ ok: true }> {
    const span = this.tracer.startSpan('l3.ceo-heavy.admin.signalWorkflow');
    const started = Date.now();
    try {
      const client = await this.getClient();
      const handle = client.workflow.getHandle(params.workflowId);
      await handle.signal(params.signalType, params.payload);
      this.signalSent.add(1, { signalType: params.signalType });
      this.requests.add(1, { action: 'signal', status: 'success' });
      this.latency.record(Date.now() - started, { action: 'signal' });
      return { ok: true };
    } catch (e) {
      span.recordException(e as Error);
      this.requests.add(1, { action: 'signal', status: 'error' });
      this.logger.warn('heavy workflow signal failed', {
        workflowId: params.workflowId,
        signalType: params.signalType,
        message: e instanceof Error ? e.message : String(e),
      });
      throw e;
    } finally {
      span.end();
    }
  }
}

