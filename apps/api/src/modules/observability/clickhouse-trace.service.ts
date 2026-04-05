import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createClient, type ClickHouseClient } from '@clickhouse/client';

export interface ExecutionLogMirrorInput {
  companyId: string;
  runId: string | null;
  taskId: string | null;
  agentId: string | null;
  traceId: string | null;
  stepType: string;
  message: string | null;
  outputSnapshot: Record<string, unknown> | null;
  durationMs: number | null;
  billingUnits: string | null;
}

export interface TraceEventRow {
  event_time: string;
  company_id: string;
  run_id: string;
  task_id: string | null;
  agent_id: string | null;
  request_id: string;
  trace_id: string;
  span_id: string;
  parent_span_id: string;
  event_type: string;
  source_service: string;
  payload_json: string;
}

/**
 * Append-only mirror of execution steps into ClickHouse (M2). Disabled when CLICKHOUSE_URL unset.
 */
@Injectable()
export class ClickhouseTraceService implements OnModuleInit {
  private readonly logger = new Logger(ClickhouseTraceService.name);
  private client: ClickHouseClient | null = null;

  get enabled(): boolean {
    return this.client != null;
  }

  async onModuleInit(): Promise<void> {
    const url = (process.env.CLICKHOUSE_URL || '').trim();
    if (!url) {
      this.logger.log('CLICKHOUSE_URL not set; trace_events mirror disabled');
      return;
    }
    try {
      this.client = createClient({
        url,
        username: process.env.CLICKHOUSE_USER || 'default',
        password: process.env.CLICKHOUSE_PASSWORD || '',
        database: process.env.CLICKHOUSE_DATABASE || 'foundry_obs',
      });
      await this.ensureSchema();
      this.logger.log('ClickHouse trace mirror enabled');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn(`ClickHouse init failed: ${message}`);
      this.client = null;
    }
  }

  private async ensureSchema(): Promise<void> {
    if (!this.client) return;
    await this.client.exec({
      query: 'CREATE DATABASE IF NOT EXISTS foundry_obs',
    });
    await this.client.exec({
      query: `
        CREATE TABLE IF NOT EXISTS foundry_obs.trace_events
        (
            event_time DateTime64(3) DEFAULT now64(3),
            company_id String,
            run_id String,
            task_id Nullable(String),
            agent_id Nullable(String),
            request_id String DEFAULT '',
            trace_id String DEFAULT '',
            span_id String DEFAULT '',
            parent_span_id String DEFAULT '',
            event_type String DEFAULT 'execution_log',
            source_service String DEFAULT 'api',
            payload_json String
        )
        ENGINE = MergeTree
        ORDER BY (company_id, run_id, event_time)
      `,
    });
  }

  async mirrorExecutionLog(input: ExecutionLogMirrorInput, sourceService = 'api'): Promise<void> {
    if (!this.client || !input.runId) {
      return;
    }
    const payload = {
      stepType: input.stepType,
      message: input.message,
      outputSnapshot: input.outputSnapshot,
      durationMs: input.durationMs,
      billingUnits: input.billingUnits,
    };
    try {
      await this.client.insert({
        table: 'foundry_obs.trace_events',
        values: [
          {
            company_id: input.companyId,
            run_id: input.runId,
            task_id: input.taskId,
            agent_id: input.agentId,
            request_id: '',
            trace_id: input.traceId ?? '',
            span_id: '',
            parent_span_id: '',
            event_type: 'execution_log',
            source_service: sourceService,
            payload_json: JSON.stringify(payload),
          },
        ],
        format: 'JSONEachRow',
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn(`trace_events insert failed: ${message}`);
    }
  }

  async listByRunId(
    companyId: string,
    runId: string,
    limit = 500,
  ): Promise<{ items: TraceEventRow[] }> {
    if (!this.client) {
      return { items: [] };
    }
    const lim = Math.min(Math.max(limit, 1), 2000);
    try {
      const result = await this.client.query({
        query: `
          SELECT
            toString(event_time) AS event_time,
            company_id,
            run_id,
            task_id,
            agent_id,
            request_id,
            trace_id,
            span_id,
            parent_span_id,
            event_type,
            source_service,
            payload_json
          FROM foundry_obs.trace_events
          WHERE company_id = {cid:String} AND run_id = {rid:String}
          ORDER BY event_time ASC
          LIMIT {lim:UInt32}
        `,
        query_params: { cid: companyId, rid: runId, lim },
        format: 'JSONEachRow',
      });
      const rows = (await result.json()) as TraceEventRow[];
      return { items: rows };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn(`trace_events query failed: ${message}`);
      return { items: [] };
    }
  }
}
