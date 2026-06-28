import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService } from '@service/tenant';
import type { ApprovalStatusChangedEvent } from '@contracts/events';
import { AgentSkillService } from '../../agents/services/agent-skill.service.js';

/**
 * P1.2: Skill 绑定审批前置（回调闭环）
 *
 * 监听 `approval.status.changed`：
 * - 当 `actionType === 'skill.binding' && status === 'approved'`
 * - 调用 `AgentSkillService.completeHighRiskBinding(approvalRequestId)` 完成实际绑定
 */
@Injectable()
export class SkillBindingApprovalListener implements OnModuleInit {
  private readonly logger = new Logger(SkillBindingApprovalListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly agentSkillService: AgentSkillService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<ApprovalStatusChangedEvent>(
      'approval.status.changed',
      async (evt) => {
        const data = (evt as any)?.data as ApprovalStatusChangedEvent['data'] | undefined;
        const companyId = String(data?.companyId ?? '').trim();
        const approvalRequestId = String(data?.approvalRequestId ?? '').trim();
        const status = String(data?.status ?? '').trim();
        const actionType = String((data as any)?.actionType ?? '').trim();
        if (!companyId || !approvalRequestId) return;
        if (status !== 'approved') return;
        if (actionType !== 'skill.binding') return;

        await this.tenantContext.runWithCompanyId(companyId, async () => {
          try {
            await this.agentSkillService.completeHighRiskBinding(companyId, approvalRequestId);
          } catch (e: unknown) {
            this.logger.warn('completeHighRiskBinding failed', {
              companyId,
              approvalRequestId,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        });
      },
      {
        queue: 'api-approval-skill-binding-approved-queue',
        durable: true,
        prefetchCount: 5,
        retry: {
          enabled: true,
          maxAttempts: 5,
          initialDelayMs: 1000,
          backoffFactor: 2,
          maxDelayMs: 30_000,
        },
      },
    );
  }
}

