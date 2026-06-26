import { Injectable, Logger } from '@nestjs/common';
import type { AudienceRoutingRecentTurnFacts } from '../group-chat-context.service.js';
import { GroupChatContextService } from '../group-chat-context.service.js';
import { MainRoomFollowupRouteHintService } from '../main-room-followup-route-hint.service.js';
import { ConfigService } from '../../../common/config/config.service.js';
import { CollaborationRetrievalPlannerService } from '../memory/collaboration-retrieval-planner.service.js';
import type { RoomContext } from '../contracts/collaboration-2026.contracts.js';
import type { CollaborationPipelineV2RunInput } from '../pipeline-v2/collaboration-pipeline-v2.types.js';
import { buildAudienceRoutingMemoryDigest } from '../pipeline-v2/audience-routing-memory-digest.js';
import { ensureCollaborationExecutionContext } from '../pipeline-v2/ensure-collaboration-execution-context.util.js';
import { buildMemoryLayerRoomHint } from '../pipeline-v2/memory-layer-room-hint.util.js';
import { buildRoomMemberPromptBlock } from '../context/room-context.service.js';

/**
 * 主群受众路由 LLM 调用前的统一组装：`retrieveBeforeIntent`、跟进 hint、人类节选 transcript、memory digest。
 * `runMainRoomFlow` 与 `runMainRoomPipelineViaIntentLayer`、内部预览共用，避免入口漂移。
 *
 * `params.nonDestructiveFollowupHint === true`（如 internal preview）时只读 Redis planning hint，不 `getDel` 消费。
 */
@Injectable()
export class MainRoomAudienceRoutingContextService {
  private readonly logger = new Logger(MainRoomAudienceRoutingContextService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly retrievalPlanner: CollaborationRetrievalPlannerService,
    private readonly mainRoomFollowupRouteHint: MainRoomFollowupRouteHintService,
    private readonly groupChatContext: GroupChatContextService,
  ) {}

  /**
   * 主群受众路由（IntentLayer）专用输入：**不**拼接 `retrieveBeforeIntent` 记忆块，避免「接话人」与「答题材料」混在同一向量空间。
   * 记忆仍在 {@link MemoryCrossCutService.retrieveBeforeIntent} → `memoryContext`，供 post-intent / replay / strategy 等下游使用。
   */
  private buildMainRoomAudienceRoutingTurnText(
    userContentText: string,
    followupHintLine: string | null | undefined,
  ): string {
    const base = String(userContentText ?? '').trim();
    const hint = String(followupHintLine ?? '').trim();
    if (!hint) return base.slice(0, 4500);
    return `${base}\n\n[foundry.session_followup]\n${hint}`.slice(0, 4500);
  }

  /**
   * 主群 IntentLayer：拉取受众路由节选 + **结构化轮次事实**（同源 RPC；可关 MAIN_ROOM_INTENT_INJECT_RECENT_TRANSCRIPT）。
   * `recentTurnFacts` 给出排除当前 `messageId` 后最后一条持久化消息的 senderType/senderId，避免模型仅从截断正文推断说话人。
   */
  private async fetchMainRoomIntentAudienceRoutingTranscriptBundle(params: {
    input: CollaborationPipelineV2RunInput;
    roomType: string;
  }): Promise<{ digest: string; recentTurnFacts: AudienceRoutingRecentTurnFacts }> {
    if (params.roomType !== 'main' || !this.config.isMainRoomIntentInjectRecentTranscriptEnabled()) {
      return { digest: '', recentTurnFacts: {} };
    }
    const rpcTimeout = Math.max(4_000, Math.min(12_000, this.config.getCollaborationMentionRpcTimeoutMs()));
    try {
      return await this.groupChatContext.buildIntentAudienceRoutingTranscriptBlock({
        companyId: params.input.companyId,
        roomId: params.input.roomId,
        threadId: params.input.threadId ?? null,
        excludeMessageId: params.input.messageId,
        timeoutMs: rpcTimeout,
        maxBodyChars: this.config.getCeoReplayRecentTranscriptMaxBodyChars(),
      });
    } catch {
      return { digest: '', recentTurnFacts: {} };
    }
  }

  async prepareMainRoomAudienceRoutingRecognizeContext(params: {
    input: CollaborationPipelineV2RunInput;
    roomContext: RoomContext;
    traceId: string;
    nonDestructiveFollowupHint?: boolean;
  }): Promise<{
    memoryContext: Awaited<
      ReturnType<InstanceType<typeof CollaborationRetrievalPlannerService>['planLeadRetrieval']>
    >;
    audienceRoutingTurnText: string;
    recentTranscriptDigest: string | undefined;
    audienceRoutingRecentTurnFacts: AudienceRoutingRecentTurnFacts;
    audienceRoutingMemoryDigest: string | undefined;
    followupHintLine: string | null;
    roomMemberPromptBlock: string;
  }> {
    const { input, roomContext, traceId } = params;
    if (roomContext.roomType !== 'main') {
      throw new Error('prepare_main_room_audience_routing_requires_main_room');
    }
    ensureCollaborationExecutionContext(input, traceId);

    const roomMemberPromptBlock = buildRoomMemberPromptBlock(roomContext.memberDirectory ?? []);
    const memoryContext = await this.retrievalPlanner.planLeadRetrieval({
      companyId: input.companyId,
      roomId: input.roomId,
      roomType: roomContext.roomType,
      contentText: input.contentText,
      traceId,
      roomMemberPromptBlock: roomMemberPromptBlock || undefined,
      skipRoster: true,
      layerRoomHint: buildMemoryLayerRoomHint(roomContext),
      collaborationExecutionContext: input.collaborationExecutionContext,
    });

    const followupHintLine = params.nonDestructiveFollowupHint
      ? await this.mainRoomFollowupRouteHint.peekFollowupHint({
          companyId: input.companyId,
          roomId: input.roomId,
          threadId: input.threadId ?? null,
        })
      : await this.mainRoomFollowupRouteHint.consumeFollowupHint({
          companyId: input.companyId,
          roomId: input.roomId,
          threadId: input.threadId ?? null,
        });
    const audienceRoutingTurnText = this.buildMainRoomAudienceRoutingTurnText(input.contentText, followupHintLine);

    const routingBundle = await this.fetchMainRoomIntentAudienceRoutingTranscriptBundle({
      input,
      roomType: roomContext.roomType,
    });
    const recentTranscriptDigest = routingBundle.digest.trim() || undefined;
    const audienceRoutingRecentTurnFacts = routingBundle.recentTurnFacts ?? {};

    const routingMemoryMode = this.config.getCollabRoutingMemoryMode();
    const audienceRoutingMemoryDigest =
      routingMemoryMode !== 'none' && memoryContext.hitCount > 0
        ? buildAudienceRoutingMemoryDigest(
            memoryContext.memoryHits,
            routingMemoryMode === 'full' ? 'full' : 'digest',
          ).trim() || undefined
        : undefined;

    if (memoryContext.hitCount > 0) {
      this.logger.log('foundry.collaboration.intent_audience_routing.memory_routing_context', {
        companyId: input.companyId,
        roomId: input.roomId,
        messageId: input.messageId,
        traceId,
        routingMemoryMode,
        retrieveBeforeIntentHitCount: memoryContext.hitCount,
        digestInjected: Boolean(audienceRoutingMemoryDigest),
        digestChars: audienceRoutingMemoryDigest?.length ?? 0,
      });
    }

    return {
      memoryContext,
      audienceRoutingTurnText,
      recentTranscriptDigest,
      audienceRoutingRecentTurnFacts,
      audienceRoutingMemoryDigest,
      followupHintLine,
      roomMemberPromptBlock,
    };
  }
}
