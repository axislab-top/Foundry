import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { context, propagation } from '@opentelemetry/api';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../../common/config/config.service.js';
import { COLLAB_LLM_TRACE } from '../../../common/logging/collab-llm-trace.util.js';
import { ConversationOutputSanitizerService } from '../conversation-output-sanitizer.service.js';

@Injectable()
export class DiagnosticFallbackService {
  private readonly logger = new Logger(DiagnosticFallbackService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly outputSanitizer: ConversationOutputSanitizerService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  async appendDiagnosticFallback(params: {
    companyId: string;
    roomId: string;
    agentId: string;
    sourceMessageId: string;
    heartbeatId: string;
    threadId?: string | null;
    reason?: string;
    messageOverride?: string;
  }): Promise<void> {
    const fallbackContent =
      params.messageOverride?.trim() || this.config.getCollaborationDiagnosticFallbackMessage();
    const baggage = propagation.createBaggage({
      'foundry.direct_reply_failure': { value: params.reason ?? 'direct_reply_failed' },
      layer: { value: 'layer2' },
      companyId: { value: params.companyId },
      heartbeatId: { value: params.heartbeatId },
    });
    const ctx = propagation.setBaggage(context.active(), baggage);
    const timeoutMs = this.config.getCollaborationMentionRpcTimeoutMs();
    this.logger.error(`${COLLAB_LLM_TRACE} | direct_reply.safe_fallback_append`, {
      companyId: params.companyId,
      roomId: params.roomId,
      agentId: params.agentId,
      sourceMessageId: params.sourceMessageId,
      threadId: params.threadId ?? null,
      heartbeatId: params.heartbeatId,
      reason: params.reason ?? null,
      contentPreview: fallbackContent.slice(0, 120),
    });
    await context.with(ctx, async () => {
      await firstValueFrom(
        this.apiRpc
          .send<unknown>('collaboration.messages.appendAgent', {
            companyId: params.companyId,
            actor: this.workerActor(),
            roomId: params.roomId,
            agentId: params.agentId,
            content: this.outputSanitizer.toVisibleLayer(fallbackContent),
            messageType: 'text',
            threadId: params.threadId ?? undefined,
            metadata: {
              source: 'collab_direct_reply_safe_fallback',
              directReplyToMessageId: params.sourceMessageId,
              isSafeFallback: true,
              reason: params.reason ?? 'direct_reply_failed',
              heartbeatId: params.heartbeatId,
              layer: 'layer2',
            },
          })
          .pipe(timeout(timeoutMs)),
      );
    });
  }
}

