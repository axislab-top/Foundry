import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import type { BaseMessage } from '@langchain/core/messages';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../../common/config/config.service.js';
import { ConversationOutputSanitizerService } from '../conversation-output-sanitizer.service.js';
import {
  extractLlmFinishReason,
  extractLlmTextContent,
} from '../direct-reply/direct-reply-output.util.js';

export type LlmStreamModel = {
  invoke?: (input: unknown, options?: unknown) => Promise<unknown>;
  stream?: (input: unknown, options?: unknown) => Promise<AsyncIterable<unknown>>;
};

export type LlmStreamToRoomParams = {
  model: LlmStreamModel;
  messages: BaseMessage[];
  companyId: string;
  roomId: string;
  agentId: string;
  sourceMessageId: string;
  streamId: string;
  threadId?: string | null;
  baseMetadata?: Record<string, unknown>;
  /** appendAgent metadata.source */
  streamSource?: string;
  timeoutMs?: number;
};

export type LlmStreamToRoomResult = {
  text: string;
  tokenStreamed: boolean;
  finishReason?: string | null;
};

export function buildCeoOrchestrationStreamId(messageId: string, ceoAgentId: string): string {
  return `ceo_orchestration:${String(messageId).trim()}:${String(ceoAgentId).trim()}`;
}

export function buildDirectReplyStreamId(sourceMessageId: string, agentId: string): string {
  return `direct_reply:${String(sourceMessageId).trim()}:${String(agentId).trim()}`;
}

@Injectable()
export class CollaborationLlmTokenStreamService {
  private readonly logger = new Logger(CollaborationLlmTokenStreamService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  async streamToRoom(params: LlmStreamToRoomParams): Promise<LlmStreamToRoomResult> {
    const canTokenStream =
      this.config.isCollabLlmTokenStreamingEnabled() &&
      typeof params.model.stream === 'function';

    if (!canTokenStream) {
      return this.invokeFallback(params);
    }

    const timeoutMs = Math.max(1000, params.timeoutMs ?? this.config.getCollaborationLlmTimeoutMs());
    try {
      return await Promise.race([
        this.runTokenStream(params),
        new Promise<LlmStreamToRoomResult>((_, reject) => {
          setTimeout(() => reject(new Error('llm_token_stream_timeout')), timeoutMs);
        }),
      ]);
    } catch (e: unknown) {
      this.logger.warn('foundry.llm_token_stream.fallback_invoke', {
        companyId: params.companyId,
        roomId: params.roomId,
        streamId: params.streamId,
        message: e instanceof Error ? e.message : String(e),
      });
      return this.invokeFallback(params);
    }
  }

  private async runTokenStream(params: LlmStreamToRoomParams): Promise<LlmStreamToRoomResult> {
    const flushMs = this.config.getCollabLlmTokenStreamFlushMs();
    const minChars = this.config.getCollabLlmTokenStreamMinChars();
    const streamId = String(params.streamId).trim();
    const streamSource = params.streamSource ?? 'collab_llm_token_stream';

    let rawAccumulated = '';
    let publishedVisibleLength = 0;
    let chunkIndex = 0;
    let lastFlushAt = Date.now();
    let finishReason: string | null = null;

    const stream = await params.model.stream!(params.messages);
    for await (const chunk of stream) {
      const delta = extractLlmTextContent(chunk);
      if (delta) rawAccumulated += delta;
      const fr = extractLlmFinishReason(chunk);
      if (fr) finishReason = fr;

      const visible = ConversationOutputSanitizerService.toVisibleLayer(rawAccumulated);
      const pendingVisible = visible.slice(publishedVisibleLength);
      const elapsed = Date.now() - lastFlushAt;
      if (pendingVisible.length >= minChars || elapsed >= flushMs) {
        await this.publishDelta({
          ...params,
          streamId,
          streamSource,
          delta: pendingVisible,
          chunkIndex,
        });
        if (pendingVisible.length > 0) {
          publishedVisibleLength = visible.length;
          chunkIndex += 1;
          lastFlushAt = Date.now();
        }
      }
    }

    const finalVisible = ConversationOutputSanitizerService.toVisibleLayer(rawAccumulated);
    const tail = finalVisible.slice(publishedVisibleLength);
    if (tail.trim().length > 0) {
      await this.publishDelta({
        ...params,
        streamId,
        streamSource,
        delta: tail,
        chunkIndex,
      });
      chunkIndex += 1;
    } else if (chunkIndex === 0 && finalVisible.trim().length > 0) {
      await this.publishDelta({
        ...params,
        streamId,
        streamSource,
        delta: finalVisible,
        chunkIndex: 0,
      });
    }

    return {
      text: finalVisible.trim(),
      tokenStreamed: chunkIndex > 0 || finalVisible.trim().length > 0,
      finishReason,
    };
  }

  private async invokeFallback(params: LlmStreamToRoomParams): Promise<LlmStreamToRoomResult> {
    if (typeof params.model.invoke !== 'function') {
      return { text: '', tokenStreamed: false, finishReason: null };
    }
    const raw = await params.model.invoke(params.messages);
    const text = ConversationOutputSanitizerService.toVisibleLayer(extractLlmTextContent(raw));
    return {
      text,
      tokenStreamed: false,
      finishReason: extractLlmFinishReason(raw),
    };
  }

  private async publishDelta(params: {
    companyId: string;
    roomId: string;
    agentId: string;
    sourceMessageId: string;
    streamId: string;
    threadId?: string | null;
    baseMetadata?: Record<string, unknown>;
    streamSource: string;
    delta: string;
    chunkIndex: number;
  }): Promise<void> {
    const delta = ConversationOutputSanitizerService.toVisibleLayer(params.delta);
    if (!delta.trim()) return;

    const rpcTimeout = this.config.getCollaborationMentionRpcTimeoutMs();
    try {
      await firstValueFrom(
        this.apiRpc
          .send('collaboration.messages.appendAgent', {
            companyId: params.companyId,
            actor: this.workerActor(),
            roomId: params.roomId,
            agentId: params.agentId,
            content: delta,
            messageType: 'stream_chunk',
            threadId: params.threadId ?? undefined,
            metadata: {
              ...(params.baseMetadata ?? {}),
              source: params.streamSource,
              directReplyToMessageId: params.sourceMessageId,
              streamId: params.streamId,
              chunkIndex: params.chunkIndex,
              provisional: true,
              tokenStream: true,
            },
          })
          .pipe(timeout(rpcTimeout)),
      );
    } catch (e: unknown) {
      this.logger.warn('foundry.llm_token_stream.chunk_failed', {
        companyId: params.companyId,
        roomId: params.roomId,
        streamId: params.streamId,
        chunkIndex: params.chunkIndex,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
