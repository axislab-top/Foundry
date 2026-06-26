import { Inject, Injectable } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import type { CollaborationHeartbeatCorrelationPayload } from '@contracts/events';
import type { CollaborationIntentDecisionV20261 } from '@contracts/types';
import { ConfigService } from '../../common/config/config.service.js';
import type { LightStructuredOutputV2 } from './ceo/dto/ceo-v2-pipeline.types.js';
import type { DirectCollabGeneratedReply, DirectReplyRoomType } from './direct-reply/direct-reply-output.types.js';
import { toDirectReplyGenerationMetadata } from './direct-reply/direct-reply-output.util.js';
import { DirectReplyStreamPublisherService } from './direct-reply/direct-reply-stream-publisher.service.js';
import { ConversationOutputSanitizerService } from './conversation-output-sanitizer.service.js';

/**
 * 将 LightStructuredOutputV2 写入协作消息（appendAgent）。
 *
 * P2.2：主群召唤 Agent（`direct_summon` → routePath `direct_agent`/`direct_group`）时的上下文注入由
 * MemoryContextAssemblerService.assembleForDirected → GroupChatContextService.buildAuxiliaryContextForReply
 *（directSummonOptions）完成；Intent 层仅路由；本服务不参与记忆块拼装。
 */
@Injectable()
export class DirectCollabReplyService {
  constructor(
    private readonly config: ConfigService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
    private readonly streamPublisher: DirectReplyStreamPublisherService,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  async reply(
    params: {
      companyId: string;
      roomId: string;
      agentId: string;
      sourceMessageId: string;
      threadId?: string | null;
      output?: LightStructuredOutputV2;
      /** 模型生成观测（完整或明示截断策略） */
      generation?: DirectCollabGeneratedReply | null;
      roomType?: DirectReplyRoomType;
      /** P1.2：可选写入 appendAgent metadata，供审计/回放 */
      intentDecision2026_1?: CollaborationIntentDecisionV20261;
      heartbeatCorrelation?: CollaborationHeartbeatCorrelationPayload;
    } & Record<string, unknown>,
  ): Promise<void> {
    if (!params.output) {
      throw new Error('v2_output_required: DirectCollabReplyService.reply requires output: LightStructuredOutputV2');
    }

    const visibleText = ConversationOutputSanitizerService.toVisibleLayer(params.output.finalText);
    const streamId = `direct_reply:${params.sourceMessageId}:${params.agentId}`;
    const roomType = params.roomType;
    const streaming = this.config.isCollabDirectReplyStreamingEnabledForRoom(roomType);
    const baseMetadata: Record<string, unknown> = {
      source: 'collab_direct_reply_v2',
      directReplyToMessageId: params.sourceMessageId,
      nextStep: params.output.nextStep,
      commitmentText: params.output.commitmentText,
      lightStructuredOutputV2: params.output,
      streamId,
      ...(params.intentDecision2026_1 ? { intentDecision2026_1: params.intentDecision2026_1 } : {}),
      ...(params.heartbeatCorrelation ? { heartbeatCorrelation: params.heartbeatCorrelation } : {}),
      ...(params.generation
        ? { directReplyGeneration: toDirectReplyGenerationMetadata(params.generation, streaming) }
        : {}),
      ...(roomType ? { roomType } : {}),
    };

    if (streaming && !params.generation?.tokenStreamed && visibleText.trim().length > 0) {
      await this.streamPublisher.publishIncrementalStream({
        companyId: params.companyId,
        roomId: params.roomId,
        agentId: params.agentId,
        threadId: params.threadId ?? null,
        sourceMessageId: params.sourceMessageId,
        streamId,
        fullText: visibleText,
        baseMetadata,
      });
    }

    await firstValueFrom(
      this.apiRpc
        .send('collaboration.messages.appendAgent', {
          companyId: params.companyId,
          actor: this.workerActor(),
          roomId: params.roomId,
          agentId: params.agentId,
          content: visibleText,
          messageType: 'text',
          threadId: params.threadId ?? undefined,
          metadata: {
            ...baseMetadata,
            provisional: false,
            isStreaming: false,
          },
          memoryReferences: (params.output.memoryReferences ?? []).map((memoryEntryId) => ({ memoryEntryId })),
        })
        .pipe(timeout(this.config.getCollaborationMentionRpcTimeoutMs())),
    );
  }
}
