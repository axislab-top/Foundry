import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import type {
  CollaborationResponderCeoLayer,
  CollaborationResponderThinkingStatus,
} from '@contracts/events';
import { ConfigService } from '../../../common/config/config.service.js';
import { withCollaborationRpcRetries } from '../utils/collaboration-rpc-retry.util.js';

export type PublishResponderThinkingParams = {
  companyId: string;
  roomId: string;
  sourceMessageId: string;
  status: CollaborationResponderThinkingStatus;
  responderAgentIds: string[];
  routePath?: string;
  intentType?: string;
  ceoLayer?: CollaborationResponderCeoLayer;
  roomType?: 'main' | 'department';
  runId?: string;
  traceId?: string;
};

@Injectable()
export class ResponderThinkingPublisher {
  private readonly logger = new Logger(ResponderThinkingPublisher.name);

  constructor(
    private readonly config: ConfigService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  publishBestEffort(params: PublishResponderThinkingParams): void {
    if (!this.config.isCollabResponderThinkingEnabled()) return;

    const startedAt = new Date().toISOString();
    const payload = {
      companyId: params.companyId,
      actor: this.workerActor(),
      roomId: params.roomId,
      sourceMessageId: params.sourceMessageId,
      status: params.status,
      responderAgentIds: params.responderAgentIds,
      routePath: params.routePath,
      intentType: params.intentType,
      ceoLayer: params.ceoLayer,
      roomType: params.roomType,
      runId: params.runId,
      traceId: params.traceId,
      startedAt,
      ...(params.status === 'idle' ? { endedAt: startedAt } : {}),
    };
    void withCollaborationRpcRetries(
      async () => await this.rpc('collaboration.realtime.publishResponderThinking', payload),
      { attempts: this.config.getCollabResponderThinkingRetryAttempts() },
    ).catch((e) =>
      this.logger.warn('foundry.collaboration.responder_thinking.publish_failed', {
        companyId: params.companyId,
        roomId: params.roomId,
        sourceMessageId: params.sourceMessageId,
        status: params.status,
        err: e instanceof Error ? e.message : String(e),
      }),
    );
  }

  private workerActor() {
    return { id: '00000000-0000-4000-8000-000000000001', roles: ['admin'] as string[] };
  }

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return await firstValueFrom(
      this.apiRpc.send<T>(pattern, payload).pipe(timeout(this.config.getCollaborationMentionRpcTimeoutMs())),
    );
  }
}
