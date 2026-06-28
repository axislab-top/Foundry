import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../../common/config/config.service.js';
import { ConversationOutputSanitizerService } from '../conversation-output-sanitizer.service.js';
import { splitTextForStreamChunks } from './direct-reply-output.util.js';

@Injectable()
export class DirectReplyStreamPublisherService {
  private readonly logger = new Logger(DirectReplyStreamPublisherService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  /**
   * 流式块 + 最终正文双写：中间态走 stream_chunk（记忆/未读跳过），最终 text 供持久阅读。
   */
  async publishIncrementalStream(params: {
    companyId: string;
    roomId: string;
    agentId: string;
    threadId?: string | null;
    sourceMessageId: string;
    streamId: string;
    fullText: string;
    baseMetadata?: Record<string, unknown>;
  }): Promise<void> {
    const visible = ConversationOutputSanitizerService.toVisibleLayer(params.fullText);
    if (!visible.trim()) return;

    const chunkSize = Math.min(
      this.config.getCollabDirectReplyStreamChunkChars(),
      Math.max(24, Math.ceil(visible.length / 8)),
    );
    const chunks = splitTextForStreamChunks(visible, chunkSize);
    if (!chunks.length) return;

    const rpcTimeout = this.config.getCollaborationMentionRpcTimeoutMs();
    const streamId = String(params.streamId).trim();
    const baseMeta = params.baseMetadata ?? {};
    const interChunkDelayMs = Math.max(
      8,
      Math.min(80, this.config.getCollabLlmTokenStreamFlushMs()),
    );

    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = ConversationOutputSanitizerService.toVisibleLayer(chunks[i]!);
      if (!chunk.trim()) continue;
      try {
        await firstValueFrom(
          this.apiRpc
            .send('collaboration.messages.appendAgent', {
              companyId: params.companyId,
              actor: this.workerActor(),
              roomId: params.roomId,
              agentId: params.agentId,
              content: chunk,
              messageType: 'stream_chunk',
              threadId: params.threadId ?? undefined,
              metadata: {
                ...baseMeta,
                source: 'collab_direct_reply_stream',
                directReplyToMessageId: params.sourceMessageId,
                streamId,
                chunkIndex: i,
                chunkCount: chunks.length,
                provisional: true,
              },
            })
            .pipe(timeout(rpcTimeout)),
        );
        if (i + 1 < chunks.length) {
          await new Promise((resolve) => setTimeout(resolve, interChunkDelayMs));
        }
      } catch (e: unknown) {
        this.logger.warn('foundry.direct_reply.stream_chunk_failed', {
          companyId: params.companyId,
          roomId: params.roomId,
          streamId,
          chunkIndex: i,
          message: e instanceof Error ? e.message : String(e),
        });
        break;
      }
    }
  }
}
