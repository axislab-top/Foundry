import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { MessagingService } from '@service/messaging';
import type { BaseEvent } from '@contracts/events';
import { ApprovalService } from '../../approval/services/approval.service.js';
import { createCompensationEvent, RiskLevel, type ApprovalRequest } from '@foundry/multi-agent-core';
import { Task } from '../entities/task.entity.js';
import { ApprovalResultPubSubService } from '../../approval/services/approval-result-pubsub.service.js';
import { ApprovalFlowRuntimeService } from '../../approval/services/approval-flow-runtime.service.js';

@Injectable()
export class TaskApprovalAtomicBindingService {
  private readonly logger = new Logger(TaskApprovalAtomicBindingService.name);
  private readonly approvalTimeoutMs = 24 * 60 * 60 * 1000;

  constructor(
    private readonly dataSource: DataSource,
    private readonly messaging: MessagingService,
    private readonly approvalService: ApprovalService,
    private readonly approvalPubSub: ApprovalResultPubSubService,
    private readonly approvalFlowRuntime: ApprovalFlowRuntimeService,
  ) {}

  /**
   * Phase 5 MA-041: bind task lifecycle to a persisted multi-level approval flow.
   *
   * Two-phase atomic binding:
   * - Tx1: create flow + set task blocked + persist approvalFlowId
   * - Orchestrator: drive approvals until terminal
   * - Tx2: run business logic + unlock task to queued (or compensate on failure)
   */
  public async executeWithAdvancedApproval<T>(params: {
    companyId: string;
    actorId: string;
    taskId: string;
    action: string;
    riskLevel: RiskLevel;
    businessLogic: () => Promise<T>;
    policyVersion: number;
    traceId: string;
    metadata?: Record<string, unknown>;
  }): Promise<T> {
    const initialFlow = this.approvalFlowRuntime.createInitialFlow({
      traceId: params.traceId,
      companyId: params.companyId,
      currentAgentId: params.actorId,
      originalAction: params.action,
      riskLevel: params.riskLevel,
      policyVersion: params.policyVersion,
      metadata: { taskId: params.taskId, ...(params.metadata ?? {}) },
      expiresInMs: this.approvalTimeoutMs,
    });

    // Tx1: mark blocked + link flow id (persisted through ApprovalFlowStorePort)
    {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        await queryRunner.manager.update(
          Task,
          { id: params.taskId, companyId: params.companyId },
          {
            status: 'blocked',
            approvalFlowId: initialFlow.approvalFlowId,
            metadata: {
              ...(typeof initialFlow.metadata === 'object' ? (initialFlow.metadata as any) : {}),
              traceId: initialFlow.traceId,
            } as Record<string, unknown>,
          },
        );
        await queryRunner.commitTransaction();
      } catch (e) {
        if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
        throw e;
      } finally {
        await queryRunner.release();
      }
    }

    const finalFlow = await this.approvalFlowRuntime.startAndRun(initialFlow);
    if (finalFlow.status !== 'approved') {
      await this.messaging.publish(
        this.wrapCompensationEvent(params.companyId, {
          traceId: finalFlow.traceId,
          action: params.action,
          reason: 'approval_flow_rejected_or_timeout',
          metadata: { approvalFlowId: finalFlow.approvalFlowId },
        }),
        { routingKey: 'compensation.requested', persistent: true },
      );
      throw new Error(`Approval flow not approved: ${finalFlow.approvalFlowId}`);
    }

    // Tx2: execute + unlock task
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const result = await params.businessLogic();
      await queryRunner.manager.update(
        Task,
        { id: params.taskId, companyId: params.companyId },
        { status: 'queued', approvalFlowId: null },
      );
      await queryRunner.commitTransaction();
      return result;
    } catch (error: unknown) {
      if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
      await this.messaging.publish(
        this.wrapCompensationEvent(params.companyId, {
          traceId: finalFlow.traceId,
          action: params.action,
          reason: 'approval_flow_execution_failed',
          metadata: { approvalFlowId: finalFlow.approvalFlowId },
        }),
        { routingKey: 'compensation.requested', persistent: true },
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  public async executeWithApproval<T>(params: {
    companyId: string;
    actorId: string;
    approvalRequest: ApprovalRequest;
    businessLogic: () => Promise<T>;
    options?: { taskId?: string };
  }): Promise<T> {
    const taskId = params.options?.taskId ?? String(params.approvalRequest.payload?.taskId ?? '').trim();

    // Phase 3 MA-026: persist pending approval + blocked state
    let approvalId = '';
    {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        const created = await this.approvalService.create(params.companyId, {
          actionType: params.approvalRequest.requestedAction,
          riskLevel: params.approvalRequest.riskLevel,
          context: params.approvalRequest.payload ?? null,
          createdBy: params.actorId,
        });
        approvalId = created.id;

        if (taskId) {
          await queryRunner.manager.update(
            Task,
            { id: taskId, companyId: params.companyId },
            {
              status: 'blocked',
              metadata: { approvalId: created.id, traceId: params.approvalRequest.traceId } as Record<
                string,
                unknown
              >,
            },
          );
        }
        await this.messaging.publish(
          {
            eventId: randomUUID(),
            eventType: 'approval.requested',
            aggregateId: created.id,
            aggregateType: 'approval_request',
            occurredAt: new Date().toISOString(),
            version: 1,
            companyId: params.companyId,
            data: {
              approvalRequestId: created.id,
              traceId: params.approvalRequest.traceId,
              requestedAction: params.approvalRequest.requestedAction,
              riskLevel: params.approvalRequest.riskLevel,
              payload: params.approvalRequest.payload ?? null,
            },
          } as BaseEvent,
          { routingKey: 'approval.requested', persistent: true },
        );
        await queryRunner.commitTransaction();
      } catch (error) {
        if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }
    }

    const isApproved = await this.approvalPubSub.waitForApprovalResult(
      params.companyId,
      approvalId,
      this.approvalTimeoutMs,
    );
    if (!isApproved) {
      await this.messaging.publish(
        this.wrapCompensationEvent(params.companyId, {
          traceId: params.approvalRequest.traceId,
          action: params.approvalRequest.requestedAction,
          reason: 'approval_rejected_or_timeout',
          metadata: { approvalId },
        }),
        { routingKey: 'compensation.requested', persistent: true },
      );
      throw new Error(`Approval rejected for ${approvalId}`);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const result = await params.businessLogic();
      if (taskId) {
        await queryRunner.manager.update(
          Task,
          { id: taskId, companyId: params.companyId },
          { status: 'queued' },
        );
      }
      await queryRunner.commitTransaction();
      return result;
    } catch (error: unknown) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      await this.messaging.publish(
        this.wrapCompensationEvent(params.companyId, {
          traceId: params.approvalRequest.traceId,
          action: params.approvalRequest.requestedAction,
          reason: 'approval_rejected_or_execution_failed',
          metadata: { approvalId },
        }),
        { routingKey: 'compensation.requested', persistent: true },
      );
      this.logger.error('Approval gate failed', {
        traceId: params.approvalRequest.traceId,
        approvalId,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private wrapCompensationEvent(
    companyId: string,
    params: {
      traceId: string;
      action: string;
      reason: string;
      metadata?: Record<string, unknown>;
    },
  ): BaseEvent {
    const compensation = createCompensationEvent(params);
    return {
      eventId: randomUUID(),
      eventType: 'compensation.requested',
      aggregateId: compensation.traceId,
      aggregateType: 'compensation',
      occurredAt: compensation.occurredAt,
      version: 1,
      companyId,
      data: compensation as unknown as Record<string, unknown>,
    };
  }
}
