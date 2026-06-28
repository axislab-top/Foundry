import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { TaskHeartbeatTickEvent } from '@contracts/events';
import { Repository } from 'typeorm';
import { BillingService } from '../../billing/services/billing.service.js';
import { MarketplaceAgentSubscription } from '../entities/marketplace-agent-subscription.entity.js';

function toUtcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(yyyyMmDd: string, days: number): string {
  const [y, m, d] = yyyyMmDd.split('-').map((n) => Number(n));
  const base = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  base.setUTCDate(base.getUTCDate() + days);
  return toUtcDateString(base);
}

function isAfter(a: string, b: string): boolean {
  return a > b;
}

@Injectable()
export class MarketplaceAgentDailyBillingListener implements OnModuleInit {
  private readonly logger = new Logger(MarketplaceAgentDailyBillingListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly billing: BillingService,
    @InjectRepository(MarketplaceAgentSubscription)
    private readonly subsRepo: Repository<MarketplaceAgentSubscription>,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<TaskHeartbeatTickEvent>(
      'task.heartbeat.tick',
      this.handle.bind(this),
      {
        queue: 'api-marketplace-agent-daily-billing',
        durable: true,
        prefetchCount: 5,
      },
    );
  }

  private async handle(event: TaskHeartbeatTickEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) ?? event.data?.companyId;
    if (!companyId) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      const today = toUtcDateString(new Date());
      const subs = await this.subsRepo.find({
        where: { companyId, status: 'active' } as any,
      });
      if (!subs.length) return;

      for (const sub of subs) {
        try {
          const start = sub.startedOn || today;
          const last = sub.lastBilledOn;
          const firstToBill = last ? addDays(last, 1) : start;
          if (isAfter(firstToBill, today)) {
            continue;
          }

          // Catch-up but cap to avoid large backfills in a single tick.
          const maxDays = 14;
          let billed = 0;
          let cursor = firstToBill;
          while (!isAfter(cursor, today) && billed < maxDays) {
            const cost = Math.round((sub.dailyPriceCents ?? 0) * 1e6) / 1e6 / 100; // cents -> dollars (6dp safe)
            const idempotencyKey = `mkt:agent_day:${sub.id}:${cursor}`;

            await this.billing.appendRecord(companyId, {
              recordType: 'agent_day' as any,
              agentId: sub.agentId ?? undefined,
              cost,
              idempotencyKey,
              occurredAt: new Date(`${cursor}T00:00:00.000Z`),
              metadata: {
                source: 'marketplace_agent_subscription',
                subscriptionId: sub.id,
                marketplaceAgentId: sub.marketplaceAgentId,
                organizationNodeId: sub.organizationNodeId,
                employmentType: sub.employmentType,
                projectId: sub.projectId,
                billedOn: cursor,
                dailyPriceCents: sub.dailyPriceCents,
                currency: sub.currency,
              },
            });

            sub.lastBilledOn = cursor;
            await this.subsRepo.update({ id: sub.id, companyId } as any, { lastBilledOn: cursor } as any);
            billed += 1;
            cursor = addDays(cursor, 1);
          }

          if (!isAfter(cursor, today)) {
            this.logger.warn('daily billing catch-up capped', {
              companyId,
              subscriptionId: sub.id,
              remainingFrom: cursor,
              cappedDays: maxDays,
            });
          }
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          this.logger.warn('marketplace daily billing failed', {
            companyId,
            subscriptionId: sub.id,
            message,
          });
        }
      }
    });
  }
}

