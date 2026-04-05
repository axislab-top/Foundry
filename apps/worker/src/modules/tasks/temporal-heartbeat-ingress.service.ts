import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service.js';
import { CeoHeartbeatRunCoordinatorService } from './ceo-heartbeat-run-coordinator.service.js';

export interface CompanyHeartbeatIngressBody {
  companyId: string;
  runId?: string;
  temporalWorkflowId?: string;
  temporalRunId?: string;
}

/**
 * Temporal / 内部编排调用的公司心跳入口：task_runs 生命周期 + CEO 图 + 待执行 Agent 任务。
 */
@Injectable()
export class TemporalHeartbeatIngressService {
  constructor(
    private readonly config: ConfigService,
    private readonly coordinator: CeoHeartbeatRunCoordinatorService,
  ) {}

  assertInternalAuth(headerValue: string | undefined): void {
    const expected = this.config.getWorkerInternalApiSecret();
    if (!expected) {
      throw new ServiceUnavailableException('WORKER_INTERNAL_API_SECRET is not configured');
    }
    if (!headerValue || headerValue !== expected) {
      throw new UnauthorizedException('Invalid internal auth');
    }
  }

  async execute(body: CompanyHeartbeatIngressBody): Promise<{ runId: string; ok: true }> {
    const tickAt = new Date().toISOString();
    const { runId } = await this.coordinator.runCycle(body.companyId, tickAt, 'temporal', {
      existingRunId: body.runId?.trim() || undefined,
      temporalWorkflowId: body.temporalWorkflowId,
      temporalRunId: body.temporalRunId,
      metadata: {
        temporalWorkflowId: body.temporalWorkflowId ?? null,
        temporalRunId: body.temporalRunId ?? null,
      },
    });
    return { runId, ok: true };
  }
}
