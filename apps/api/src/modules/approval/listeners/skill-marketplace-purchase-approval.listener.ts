import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import type { ApprovalStatusChangedEvent } from '@contracts/events';
import { TenantContextService } from '@service/tenant';
import { MarketplaceSkillPackagesService } from '../../templates/services/marketplace-skill-packages.service.js';
import { ApprovalService } from '../services/approval.service.js';

@Injectable()
export class SkillMarketplacePurchaseApprovalListener implements OnModuleInit {
  private readonly logger = new Logger(SkillMarketplacePurchaseApprovalListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly skillMarketplace: MarketplaceSkillPackagesService,
    private readonly approvals: ApprovalService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<ApprovalStatusChangedEvent>(
      'approval.status.changed',
      async (evt) => {
        const data = (evt as any)?.data as ApprovalStatusChangedEvent['data'] | undefined;
        const companyId = String(data?.companyId ?? '').trim();
        if (!companyId || String(data?.status ?? '') !== 'approved') return;
        if (String((data as any)?.actionType ?? '') !== 'skill.marketplace.purchase') return;
        const approvalId = String(data?.approvalRequestId ?? '').trim();
        if (!approvalId) return;
        await this.tenantContext.runWithCompanyId(companyId, async () => {
          try {
            const req = await this.approvals.findOne(companyId, approvalId);
            const ctx = (req?.context ?? {}) as Record<string, unknown>;
            const packageId = String(ctx.packageId ?? '').trim();
            if (!packageId) return;
            await this.skillMarketplace.bindToCompany(companyId, packageId, {
              id: String(req?.resolvedBy ?? req?.createdBy ?? 'system'),
              roles: ['system'],
            });
            this.logger.log(`skill.marketplace.purchase applied: approval=${approvalId} package=${packageId}`);
          } catch (e: unknown) {
            this.logger.warn(`skill marketplace approval listener failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        });
      },
      {
        queue: 'api-approval-skill-marketplace-purchase-queue',
        durable: true,
        prefetchCount: 5,
      },
    );
  }
}

