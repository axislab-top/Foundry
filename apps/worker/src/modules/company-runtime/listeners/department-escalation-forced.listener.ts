import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { DepartmentEscalationForcedEvent } from '@contracts/events';
import { MessagingService } from '@service/messaging';
import { CompanyOrchestratorService } from '../company-orchestrator.service.js';
import { GovernanceCommandBusService } from '../governance/governance-command-bus.service.js';

/**
 * 快速风险通道：收到部门强制升级裁断事件时，立即触发公司巡检/心跳链路。
 * 复用 CompanyOrchestratorService（无需新增全局状态）。
 */
@Injectable()
export class DepartmentEscalationForcedListener implements OnModuleInit {
  private readonly logger = new Logger(DepartmentEscalationForcedListener.name);
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly messaging: MessagingService,
    private readonly companyOrchestrator: CompanyOrchestratorService,
    private readonly governanceBus: GovernanceCommandBusService,
  ) {}

  onModuleInit(): void {
    this.messaging.subscribeWithBackoff<DepartmentEscalationForcedEvent>(
      'department.escalation.forced',
      this.handle.bind(this),
      {
        queue: 'worker-company-runtime-department-escalation-forced',
        durable: true,
        prefetchCount: 10,
        retry: {
          enabled: true,
          maxAttempts: 8,
          initialDelayMs: 1000,
          backoffFactor: 2,
          maxDelayMs: 60_000,
        },
      },
    );
  }

  private async handle(event: DepartmentEscalationForcedEvent): Promise<void> {
    const companyId = event.data.companyId;
    if (!companyId) return;
    if (this.inFlight.has(companyId)) {
      return;
    }
    this.inFlight.add(companyId);
    try {
      await this.governanceBus.publishInterventionReceived({
        companyId,
        interventionType: 'inspect_finding',
        source: 'company_inspect',
        sourceMessageId: event.data.sourceMessageId,
        roomId: event.data.roomId,
        commandVersion: 1,
        payload: {
          channel: 'department.escalation.forced',
          departmentSlug: event.data.departmentSlug,
          taskId: event.data.taskId ?? null,
          reason: event.data.reason,
        },
      });
      await this.companyOrchestrator.runHeartbeat({
        companyId,
        tickAt: new Date().toISOString(),
        triggerSource: 'nest_timer',
        options: {
          metadata: {
            kind: 'department_escalation_forced',
            departmentSlug: event.data.departmentSlug,
            taskId: event.data.taskId ?? null,
            reason: event.data.reason,
            sourceMessageId: event.data.sourceMessageId,
            roomId: event.data.roomId,
          },
        },
      });
      await this.governanceBus.publishCommandExecuted({
        companyId,
        commandType: 'company_inspect.fast_channel',
        commandId: `${companyId}:${event.data.departmentSlug}:${event.data.taskId ?? 'unknown'}`,
        commandVersion: 1,
        status: 'applied',
        reason: 'fast risk channel handled by heartbeat',
        payload: {
          departmentSlug: event.data.departmentSlug,
          taskId: event.data.taskId ?? null,
          sourceMessageId: event.data.sourceMessageId,
        },
      });
    } catch (e: unknown) {
      this.logger.warn('department escalation forced heartbeat failed', {
        companyId,
        departmentSlug: event.data.departmentSlug,
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      this.inFlight.delete(companyId);
    }
  }
}

