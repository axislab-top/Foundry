import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { metrics, trace, SpanStatusCode } from '@opentelemetry/api';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../../common/config/config.service.js';
import type {
  HeavyExecutionOutput as CollaborationHeavyExecutionOutput2026,
  IntentDecision as CollaborationIntentDecision2026,
  PlanningResult as CollaborationPlanningResult2026,
} from '../contracts/collaboration-2026.contracts.js';

@Injectable()
export class RlhfSamplerService {
  private readonly logger = new Logger(RlhfSamplerService.name);
  private readonly tracer = trace.getTracer('foundry.collaboration.rlhf');
  private readonly meter = metrics.getMeter('foundry.collaboration');
  private readonly sampledCounter = this.meter.createCounter('foundry.collaboration.rlhf.sampled_total');
  private readonly skippedCounter = this.meter.createCounter('foundry.collaboration.rlhf.skipped_total');

  constructor(
    private readonly config: ConfigService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  async sampleAfterSupervision(params: {
    companyId: string;
    roomId: string;
    messageId: string;
    traceId: string;
    userPrompt: string;
    intentDecision: CollaborationIntentDecision2026;
    planning: CollaborationPlanningResult2026;
    supervision: CollaborationHeavyExecutionOutput2026;
    userFeedbackPositive?: boolean;
    userFeedbackScore?: number | null;
  }): Promise<{ sampled: boolean; reason?: string }> {
    return await this.tracer.startActiveSpan('foundry.collaboration.rlhf.sample_after_supervision', async (span) => {
      try {
        const confidence = Number(params.intentDecision?.confidence ?? 0);
        const feedbackScore =
          typeof params.userFeedbackScore === 'number' && Number.isFinite(params.userFeedbackScore)
            ? Number(params.userFeedbackScore)
            : null;
        const feedbackPositive = params.userFeedbackPositive === true || (feedbackScore !== null && feedbackScore >= 0.8);

        if (!(confidence > 0.85 && feedbackPositive)) {
          this.skippedCounter.add(1, { reason: 'threshold_not_met' });
          span.setStatus({ code: SpanStatusCode.OK });
          return { sampled: false, reason: 'threshold_not_met' };
        }

        const namespace = `company:${params.companyId}:rlhf:collaboration`;
        const payload = {
          traceId: params.traceId,
          roomId: params.roomId,
          messageId: params.messageId,
          sampledAt: new Date().toISOString(),
          input: {
            userPrompt: params.userPrompt.slice(0, 1200),
            intentType: params.intentDecision.intentType,
            confidence: params.intentDecision.confidence,
          },
          output: {
            strategyGoal: params.planning.strategyGoal,
            finalText: params.supervision.finalText,
            finalSummary: params.supervision.finalSummary ?? null,
          },
          feedback: {
            positive: feedbackPositive,
            score: feedbackScore,
          },
        };

        await firstValueFrom(
          this.apiRpc
            .send('memory.entries.store', {
              companyId: params.companyId,
              actor: this.workerActor(),
              data: {
                namespace,
                collectionLabel: 'collaboration_rlhf_samples',
                sourceType: 'summary',
                content: JSON.stringify(payload).slice(0, 12_000),
                metadata: {
                  source: 'rlhf_sampler_service',
                  traceId: params.traceId,
                  roomId: params.roomId,
                  messageId: params.messageId,
                  confidence: confidence,
                  intentType: params.intentDecision.intentType,
                },
              },
            })
            .pipe(timeout({ first: Math.max(1200, this.config.getCollaborationMentionRpcTimeoutMs()) })),
        );

        this.sampledCounter.add(1, { intentType: params.intentDecision.intentType });
        this.logger.log('foundry.collaboration.rlhf.sampled', {
          companyId: params.companyId,
          roomId: params.roomId,
          messageId: params.messageId,
          traceId: params.traceId,
          confidence,
        });
        span.setStatus({ code: SpanStatusCode.OK });
        return { sampled: true };
      } catch (error) {
        this.skippedCounter.add(1, { reason: 'store_failed' });
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
        this.logger.warn('foundry.collaboration.rlhf.sample_failed', {
          companyId: params.companyId,
          roomId: params.roomId,
          messageId: params.messageId,
          traceId: params.traceId,
          message: error instanceof Error ? error.message : String(error),
        });
        return { sampled: false, reason: 'store_failed' };
      } finally {
        span.end();
      }
    });
  }

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }
}

