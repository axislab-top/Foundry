import { Injectable, Logger } from '@nestjs/common';
import { TenantContextService } from '@service/tenant';
import { ConfigService } from '../../../common/config/config.service.js';
import type { CeoDecisionResult } from '../ceo/dto/ceo-v2-pipeline.types.js';
import { CeoInteractiveQueueService } from '../ceo/queue/ceo-interactive-queue.service.js';
import { COLLAB_LLM_TRACE } from '../../../common/logging/collab-llm-trace.util.js';

export type L1RlhfCollectInput = {
  companyId: string;
  roomId: string;
  messageId: string;
  rawDecision: unknown;
  finalDecision: CeoDecisionResult;
  approvalRequests?: Array<{ id?: string; status?: string; outcome?: string }>;
  l3ExecutionResult?: { status?: string; success?: boolean; summary?: string };
};

@Injectable()
export class L1RlhfCollectorService {
  private readonly logger = new Logger(L1RlhfCollectorService.name);
  private readonly companyCounters = new Map<string, number>();

  constructor(
    private readonly config: ConfigService,
    private readonly tenantContext: TenantContextService,
    private readonly ceoQueue: CeoInteractiveQueueService,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private namespace(companyId: string): string {
    return `company:${companyId}:l1:rlhf_data`;
  }

  private nextCount(companyId: string): number {
    const prev = this.companyCounters.get(companyId) ?? 0;
    const next = prev + 1;
    this.companyCounters.set(companyId, next);
    return next;
  }

  async collect(input: L1RlhfCollectInput): Promise<void> {
    await this.tenantContext.runWithCompanyId(input.companyId, async () => {
      try {
        const count = this.nextCount(input.companyId);
        await this.ceoQueue.send('memory.entries.store', {
          companyId: input.companyId,
          actor: this.workerActor(),
          data: {
            namespace: this.namespace(input.companyId),
            collectionLabel: 'l1_rlhf_data',
            sourceType: 'summary',
            content: JSON.stringify({
              rawDecision: input.rawDecision ?? null,
              finalDecision: input.finalDecision ?? null,
              approvalRequests: input.approvalRequests ?? [],
              l3ExecutionResult: input.l3ExecutionResult ?? null,
            }).slice(0, 12000),
            metadata: {
              source: 'l1_rlhf_collector',
              roomId: input.roomId,
              messageId: input.messageId,
              sampleCount: count,
            },
          },
        } as Record<string, unknown>);
        if (count % 100_000 === 0) {
          this.logger.log(`${COLLAB_LLM_TRACE} | l1.rlhf_dpo_prepare_placeholder`, {
            companyId: input.companyId,
            samples: count,
            status: 'pending_trainer_integration',
          });
        }
      } catch (error) {
        this.logger.warn(`${COLLAB_LLM_TRACE} | l1.rlhf_collect_failed`, {
          companyId: input.companyId,
          roomId: input.roomId,
          messageId: input.messageId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }
}
