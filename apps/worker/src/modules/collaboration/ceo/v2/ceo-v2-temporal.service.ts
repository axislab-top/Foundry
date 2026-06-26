import { Injectable, Logger } from '@nestjs/common';
import { Client, Connection } from '@temporalio/client';
import type { HeavyExecutionOutput } from '@foundry/contracts/types/collaboration';
import { ConfigService } from '../../../../common/config/config.service.js';
import type { DistributionPlan, DirectorSignalPayload, EmployeeExecutionResult, IntentDecision } from '@contracts/types';
import type { PlanningTurnContextSerializable } from '../../context/planning-turn-context.types.js';

// ---- Signal payload types (previously from ./temporal/ceo-v2-signals.js) ----

export interface V2DepartmentPartialUpdateSignalPayload {
  traceId: string;
  parentWorkflowId: string;
  distributionId: string;
  distributionItemId: string;
  departmentId: string;
  directorSignal: DirectorSignalPayload;
  employeePartials?: EmployeeExecutionResult[];
}

export interface V2DepartmentCompleteSignalPayload {
  traceId: string;
  parentWorkflowId: string;
  distributionId: string;
  distributionItemId: string;
  departmentId: string;
  directorSignal: DirectorSignalPayload;
  employeeResults: EmployeeExecutionResult[];
}

/**
 * CEO v2 Temporal: Supervisor durable execution integration.
 *
 * NOTE: The Temporal workflow definitions (ceo-v2-root.workflow, department-v2-sub.workflow,
 * ceo-v2-signals) have been removed. The signal methods below use raw signal names
 * (string-based) so consumers can still compile, but startHeavyExecution and
 * startDepartmentChildWorkflow will throw at runtime since the workflow bundles are gone.
 */
@Injectable()
export class CeoV2TemporalService {
  private readonly logger = new Logger(CeoV2TemporalService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * @deprecated Workflow definitions removed — this method will throw at runtime.
   */
  async startHeavyExecution(
    _intent: IntentDecision,
    input: {
      companyId: string;
      roomId: string;
      messageId: string;
      contentText: string;
      ceoAgentId?: string | null;
      humanSenderId?: string | null;
      threadId?: string | null;
      routingRootMessageId?: string | null;
      planAnchorMessageId?: string | null;
      runId?: string | null;
      distributionPlan?: DistributionPlan;
      planningTurnContext?: PlanningTurnContextSerializable | null;
    },
  ): Promise<{ workflowId: string; runId: string }> {
    const routingRootMessageId = String(input.routingRootMessageId ?? input.messageId).trim() || input.messageId;
    const workflowId = `ceo-v2-supervision:${routingRootMessageId}`;
    this.logger.warn('ceo_v2.temporal.startHeavyExecution.stub', {
      workflowId,
      companyId: input.companyId,
      roomId: input.roomId,
    });
    throw new Error(
      'ceo_v2.temporal.startHeavyExecution: workflow definitions removed — Temporal root workflow bundle is no longer available.',
    );
  }

  /**
   * @deprecated Workflow definitions removed — this method will throw at runtime.
   */
  async startDepartmentChildWorkflow(params: {
    parentWorkflowId: string;
    traceId: string;
    routingRootMessageId: string;
    turnMessageId?: string;
    companyId: string;
    roomId: string;
    distributionItem: DistributionPlan['tasks'][number];
  }): Promise<{ workflowId: string; runId: string }> {
    this.logger.warn('ceo_v2.temporal.startDepartmentChildWorkflow.stub', {
      parentWorkflowId: params.parentWorkflowId,
    });
    throw new Error(
      'ceo_v2.temporal.startDepartmentChildWorkflow: workflow definitions removed — Temporal department sub-workflow bundle is no longer available.',
    );
  }

  /**
   * Send department partial update signal (child -> parent) via raw signal name.
   */
  async signalDepartmentPartialUpdate(payload: V2DepartmentPartialUpdateSignalPayload): Promise<void> {
    const handle = await this.getWorkflowHandle(payload.parentWorkflowId);
    await handle.signal('v2DepartmentPartialUpdateSignal', payload);
  }

  /**
   * Send department complete signal (child -> parent) via raw signal name.
   */
  async signalDepartmentComplete(payload: V2DepartmentCompleteSignalPayload): Promise<void> {
    const handle = await this.getWorkflowHandle(payload.parentWorkflowId);
    await handle.signal('v2DepartmentCompleteSignal', payload);
  }

  /**
   * Wait for root workflow to complete and return result (with optional timeout).
   */
  async waitForHeavyExecutionResult(params: {
    workflowId: string;
    timeoutMs?: number;
  }): Promise<HeavyExecutionOutput> {
    const handle = await this.getWorkflowHandle(params.workflowId);
    const p = handle.result() as Promise<HeavyExecutionOutput>;
    const timeoutMs = Math.max(0, Number(params.timeoutMs ?? 0));
    if (!timeoutMs) return p;
    return await Promise.race([
      p,
      new Promise<HeavyExecutionOutput>((_resolve, reject) =>
        setTimeout(() => reject(new Error('ceo_v2_temporal_wait_timeout')), timeoutMs),
      ),
    ]);
  }

  private async getWorkflowHandle(workflowId: string) {
    const connection = await Connection.connect({ address: this.config.getTemporalAddress() });
    const client = new Client({ connection, namespace: this.config.getTemporalNamespace() });
    return client.workflow.getHandle(workflowId);
  }
}
