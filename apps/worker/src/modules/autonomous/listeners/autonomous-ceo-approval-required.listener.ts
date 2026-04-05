import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import type { AutonomousCeoApprovalRequiredEvent } from '@contracts/events';
import { CeoApprovalGateService } from '../services/ceo-approval-gate.service.js';

@Injectable()
export class AutonomousCeoApprovalRequiredListener implements OnModuleInit {
  private readonly logger = new Logger(AutonomousCeoApprovalRequiredListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly gate: CeoApprovalGateService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<AutonomousCeoApprovalRequiredEvent>(
      'autonomous.ceo.approval.required',
      this.handle.bind(this),
      {
        // 多实例 HITL resume：必须让所有 Worker 实例都接收到 required 事件，
        // 由于 RabbitMQ queue 是“竞争消费”模型，不能复用同名 queue。
        // 使用 exclusive + autoDelete，为每个实例创建独占队列，实现广播式消费。
        exclusive: true,
        autoDelete: true,
        durable: false,
        prefetchCount: 10,
      },
    );
  }

  private async handle(event: AutonomousCeoApprovalRequiredEvent): Promise<void> {
    try {
      this.gate.markRequired({
        companyId: event.data.companyId,
        approvalId: event.data.approvalId,
        traceId: event.data.traceId,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn('autonomous.ceo.approval.required gate mark failed', { error: msg });
    }
  }
}

