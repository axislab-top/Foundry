import { Injectable, Logger } from '@nestjs/common';
import type { BaseMessage } from '@langchain/core/messages';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ConfigService } from '../../common/config/config.service.js';
import { CollaborationLlmBridgeService } from './collaboration-llm-bridge.service.js';
import { GroupChatContextService } from './group-chat-context.service.js';
import type { MemorySearchResult } from './context/collaboration-execution-context.js';
import { CeoLayerConfigResolverService } from './ceo/resolver/ceo-layer-config-resolver.service.js';
import type { MainRoomReplayLlmContextPack } from './pipeline-v2/collaboration-pipeline-v2.types.js';
import { planIncludesBlock, type ContextGroundingPlan } from './context/context-grounding-plan.js';
import {
  getCeoNaturalReplyFinalZhSystemPrompt,
  getCeoNaturalReplySystemPromptFullPrefetchSingleShot,
  getCeoNaturalReplyToolGatheringSystemPrompt,
} from './prompts/main-room-replay-prompts.js';
import { mergeReplayToolSurface } from './replay/replay-delegate-canonical-tools.js';
import { ReplayCanonicalToolLoopService } from './replay/replay-canonical-tool-loop.service.js';
import { CeoLayerOpenAiToolsService } from './ceo/ceo-layer-open-ai-tools.service.js';
import { hasPeerSummonToolInSurface } from './intent/main-room-sequential-peer-intro.util.js';
import {
  wrapReplayUntrustedMemoryBlock,
  wrapReplayUntrustedTranscriptBlock,
} from './replay/main-room-replay-trust-boundary.util.js';

export type CeoNaturalReplyMemoryInput = {
  promptContext?: string;
  memoryHits?: MemorySearchResult[];
};

/**
 * Early-Exit / 主群轻量路径：Memory-first 自然中文回复；模型与密钥走 **CEO `replay` 层**（`strategy.contextPolicy.replay` / 平台下发），与 L2 orchestration 解耦。
 */
@Injectable()
export class CeoNaturalReplyGeneratorService {
  private readonly logger = new Logger(CeoNaturalReplyGeneratorService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly llmBridge: CollaborationLlmBridgeService,
    private readonly groupChatContext: GroupChatContextService,
    private readonly ceoLayerConfigResolver: CeoLayerConfigResolverService,
    private readonly replayToolLoop: ReplayCanonicalToolLoopService,
    private readonly ceoLayerTools: CeoLayerOpenAiToolsService,
  ) {}

  async generateNaturalReply(params: {
    companyId: string;
    roomId: string;
    messageId: string;
    /** 工具路径 RPC；默认 `messageId`。 */
    traceId?: string | null;
    threadId?: string | null;
    userText: string;
    ceoAgentId: string | null;
    humanSenderId?: string | null;
    memory: CeoNaturalReplyMemoryInput;
    /**
     * 可选：插入 Human 的协作状态/模式说明（如 Ask 路由分支），与全局 system prompt 解耦。
     * 置于【用户问题】之前。
     */
    modeContextBlock?: string | null;
    /** 主群组织节点部门快照；仅当 plan 含 `org_snapshot` 时注入 */
    orgSnapshotPromptBlock?: string | null;
    /** Context Grounding Plan：门控 org / memory / transcript 注入 */
    contextGroundingPlan?: ContextGroundingPlan | null;
    /**
     * 与 {@link MainRoomReplayLlmContextService} 对齐：主群 replay 单回合预组装，避免与执行委托脱节及重复 RPC。
     */
    preassembledContext?: MainRoomReplayLlmContextPack | null;
  }): Promise<string | null> {
    const baseTimeoutMs = Math.max(4_000, Math.min(11_000, this.config.getCollaborationMentionRpcTimeoutMs()));
    const timeoutMs = this.config.isCeoReplayToolsEnabled()
      ? this.config.getCeoReplayToolsAdjustedLlmTimeoutMs(baseTimeoutMs)
      : baseTimeoutMs;
    const traceId = String(params.traceId ?? params.messageId).trim();

    const plan = params.contextGroundingPlan;
    const wantMemory = planIncludesBlock(plan, 'memory');
    const wantTranscript = planIncludesBlock(plan, 'transcript');
    const wantOrg = planIncludesBlock(plan, 'org_snapshot');

    const pre = params.preassembledContext;
    let memoryBlock = '';
    let transcriptBlock = '';
    if (pre != null) {
      memoryBlock = wantMemory ? String(pre.memoryBlock ?? '').trim() : '';
      transcriptBlock = wantTranscript ? String(pre.transcriptBlock ?? '').trim() : '';
    } else if (wantMemory) {
      try {
        const hits = params.memory.memoryHits;
        if (Array.isArray(hits) && hits.length > 0) {
          memoryBlock = wrapReplayUntrustedMemoryBlock(
            this.groupChatContext.formatLeadCollaborationMemoryHitsAsRetrievalPack(hits).block,
          );
        } else {
          const lead = String(params.memory.promptContext ?? '').trim();
          if (lead) {
            memoryBlock = wrapReplayUntrustedMemoryBlock(
              `【Memory retrieval — lead intent context】\n${lead.slice(0, 3500)}`,
            );
          } else {
            const pack = await this.groupChatContext.buildRetrievedMemoryBlock({
              companyId: params.companyId,
              roomId: params.roomId,
              query: params.userText,
              timeoutMs,
              topK: Math.min(8, this.config.getGroupChatMemoryRetrievalTopK()),
            });
            memoryBlock = wrapReplayUntrustedMemoryBlock(pack.block);
          }
        }
      } catch (e) {
        this.logger.warn('ceo.natural_reply.memory_block_failed', {
          companyId: params.companyId,
          roomId: params.roomId,
          message: e instanceof Error ? e.message : String(e),
        });
        memoryBlock = '';
      }

      if (wantTranscript && this.config.isCeoReplayInjectRecentTranscriptEnabled()) {
        try {
          transcriptBlock = wrapReplayUntrustedTranscriptBlock(
            (
              await this.groupChatContext.buildCeoReplayRecentTranscriptBlock({
                companyId: params.companyId,
                roomId: params.roomId,
                threadId: params.threadId ?? null,
                excludeMessageId: params.messageId,
                messageCount: this.config.getWorkerDirectAgentTranscriptMessageCount(),
                timeoutMs,
                maxBodyChars: this.config.getCeoReplayRecentTranscriptMaxBodyChars(),
              })
            ).trim(),
          );
        } catch (e) {
          this.logger.debug('ceo.natural_reply.transcript_skipped', {
            companyId: params.companyId,
            roomId: params.roomId,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    const userTurn = String(params.userText).trim().slice(0, 2000);
    const orgSnap = wantOrg ? String(params.orgSnapshotPromptBlock ?? '').trim() : '';
    const humanChunks: string[] = [];
    if (transcriptBlock.trim()) humanChunks.push(transcriptBlock);
    if (orgSnap.trim()) humanChunks.push(`【组织部门事实 — 权威】\n${orgSnap.slice(0, 2500)}`);
    if (memoryBlock.trim()) humanChunks.push(memoryBlock.trim());
    const modeCtx = String(params.modeContextBlock ?? '').trim();
    if (modeCtx) humanChunks.push(modeCtx.slice(0, 2000));
    humanChunks.push(`【用户问题】\n${userTurn}`);
    const humanBody = humanChunks.join('\n\n');

    const ceoId = String(params.ceoAgentId ?? '').trim();
    const toolsWant = this.config.isCeoReplayToolsEnabled();
    if (toolsWant && !ceoId) {
      this.logger.warn('ceo.natural_reply.tools_skipped_no_ceo_agent', {
        companyId: params.companyId,
        roomId: params.roomId,
        messageId: params.messageId,
      });
    }
    const useToolPath = toolsWant && Boolean(ceoId);

    try {
      const replayLayer = await this.ceoLayerConfigResolver
        .resolveLayerSetting(params.companyId, 'replay')
        .catch(() => null);
      const fallbackModel = this.config.getCeoReplayModelName();
      const maxTok =
        typeof replayLayer?.maxTokens === 'number' && Number.isFinite(replayLayer.maxTokens)
          ? Math.min(16000, Math.max(128, Math.floor(replayLayer.maxTokens)))
          : 8000;
      const tempOverride =
        typeof replayLayer?.temperature === 'number' && Number.isFinite(replayLayer.temperature)
          ? Math.max(0, Math.min(1.5, replayLayer.temperature))
          : 0.35;

      const model = await this.llmBridge.createChatModel({
        companyId: params.companyId,
        agentId: params.ceoAgentId ?? undefined,
        fallbackModelName: fallbackModel,
        llmTimeoutMs: timeoutMs,
        maxOutputTokens: maxTok,
        temperatureOverride: tempOverride,
        disableReasoning: true,
        ceoContext: 'replay',
        trace: { messageId: params.messageId, callsite: 'ceo.natural_reply' },
        meteringAgentId: params.ceoAgentId ?? undefined,
      });

      let text = '';

      if (!useToolPath) {
        const system = getCeoNaturalReplySystemPromptFullPrefetchSingleShot();
        const raw = await model.invoke([new SystemMessage(system), new HumanMessage(humanBody)]);
        text = String((raw as { content?: unknown })?.content ?? '').trim();
      } else {
        const layerBuilt = await this.ceoLayerTools.build({
          companyId: params.companyId,
          ceoAgentId: ceoId,
          layer: 'replay',
          applyV2ToolSurface: false,
        });
        const tools = mergeReplayToolSurface(layerBuilt.tools);
        const allowedToolNames = new Set(
          tools.map((t) => String((t as { function?: { name?: string } }).function?.name ?? '').trim()).filter(Boolean),
        );

        const bindable = model as { bind?: (opts: unknown) => { invoke: (m: BaseMessage[]) => Promise<unknown> } };
        const modelWithTools =
          typeof bindable.bind === 'function'
            ? bindable.bind({ tools, tool_choice: 'auto' })
            : model;

        const messages: BaseMessage[] = [
          new SystemMessage(getCeoNaturalReplyToolGatheringSystemPrompt()),
          new HumanMessage(humanBody),
        ];

        const loopOut = await this.replayToolLoop.run({
          modelWithTools,
          messages,
          companyId: params.companyId,
          roomId: params.roomId,
          threadId: params.threadId ?? null,
          traceId,
          messageId: params.messageId,
          ceoAgentId: ceoId,
          humanSenderId: params.humanSenderId ?? null,
          maxRounds: this.config.getCeoReplayToolsMaxRounds(),
          maxCallsPerRound: this.config.getCeoReplayToolsMaxCallsPerRound(),
          allowedToolNames,
          capabilitySkillIds: layerBuilt.configuredSkillIds,
        });

        const finalMessages: BaseMessage[] = [
          new SystemMessage(getCeoNaturalReplyFinalZhSystemPrompt()),
          ...loopOut.messages.slice(1),
        ];

        const finalModel = await this.llmBridge.createChatModel({
          companyId: params.companyId,
          agentId: params.ceoAgentId ?? undefined,
          fallbackModelName: fallbackModel,
          llmTimeoutMs: timeoutMs,
          maxOutputTokens: maxTok,
          temperatureOverride: tempOverride,
          disableReasoning: true,
          ceoContext: 'replay',
          trace: { messageId: params.messageId, callsite: 'ceo.natural_reply.final_zh' },
          meteringAgentId: params.ceoAgentId ?? undefined,
        });

        const rawFinal = await finalModel.invoke(finalMessages);
        text = String((rawFinal as { content?: unknown })?.content ?? '').trim();
      }

      this.logger.log('ceo.natural_reply.reply_generated', {
        companyId: params.companyId,
        roomId: params.roomId,
        messageId: params.messageId,
        chars: text.length,
        replayToolsEnabled: useToolPath,
      });
      return text ? text.slice(0, 32000) : null;
    } catch (e) {
      this.logger.warn('ceo.natural_reply.model_failed', {
        companyId: params.companyId,
        roomId: params.roomId,
        messageId: params.messageId,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  /**
   * 仅跑 replay 工具阶段（如依次自我介绍链式推进）；不生成对用户终稿。
   * CEO 须在本路径亲自调用 message_send_to_agent。
   */
  async runPeerSummonToolTurn(params: {
    companyId: string;
    roomId: string;
    messageId: string;
    traceId?: string | null;
    threadId?: string | null;
    ceoAgentId: string;
    humanSenderId?: string | null;
    humanBody: string;
    requirePeerSummonTool?: boolean;
  }): Promise<{ toolCallsExecuted: number; toolNames: string[] }> {
    const ceoId = String(params.ceoAgentId ?? '').trim();
    if (!ceoId || !this.config.isCeoReplayToolsEnabled()) {
      return { toolCallsExecuted: 0, toolNames: [] };
    }

    const baseTimeoutMs = Math.max(4_000, Math.min(11_000, this.config.getCollaborationMentionRpcTimeoutMs()));
    const timeoutMs = this.config.getCeoReplayToolsAdjustedLlmTimeoutMs(baseTimeoutMs);
    const traceId = String(params.traceId ?? params.messageId).trim();

    try {
      const replayLayer = await this.ceoLayerConfigResolver
        .resolveLayerSetting(params.companyId, 'replay')
        .catch(() => null);
      const fallbackModel = this.config.getCeoReplayModelName();
      const maxTok =
        typeof replayLayer?.maxTokens === 'number' && Number.isFinite(replayLayer.maxTokens)
          ? Math.min(16000, Math.max(128, Math.floor(replayLayer.maxTokens)))
          : 8000;
      const tempOverride =
        typeof replayLayer?.temperature === 'number' && Number.isFinite(replayLayer.temperature)
          ? Math.max(0, Math.min(1.5, replayLayer.temperature))
          : 0.35;

      const model = await this.llmBridge.createChatModel({
        companyId: params.companyId,
        agentId: ceoId,
        fallbackModelName: fallbackModel,
        llmTimeoutMs: timeoutMs,
        maxOutputTokens: maxTok,
        temperatureOverride: tempOverride,
        disableReasoning: true,
        ceoContext: 'replay',
        trace: { messageId: params.messageId, callsite: 'ceo.peer_summon_tool_turn' },
        meteringAgentId: ceoId,
      });

      const layerBuilt = await this.ceoLayerTools.build({
        companyId: params.companyId,
        ceoAgentId: ceoId,
        layer: 'replay',
        applyV2ToolSurface: false,
      });
      const tools = mergeReplayToolSurface(layerBuilt.tools);
      const allowedToolNames = new Set(
        tools.map((t) => String((t as { function?: { name?: string } }).function?.name ?? '').trim()).filter(Boolean),
      );
      const requireTool =
        params.requirePeerSummonTool === true && hasPeerSummonToolInSurface(allowedToolNames);

      const bindable = model as { bind?: (opts: unknown) => { invoke: (m: BaseMessage[]) => Promise<unknown> } };
      const modelWithTools =
        typeof bindable.bind === 'function'
          ? bindable.bind({ tools, tool_choice: requireTool ? 'required' : 'auto' })
          : model;

      const loopOut = await this.replayToolLoop.run({
        modelWithTools,
        messages: [
          new SystemMessage(getCeoNaturalReplyToolGatheringSystemPrompt()),
          new HumanMessage(params.humanBody),
        ],
        companyId: params.companyId,
        roomId: params.roomId,
        threadId: params.threadId ?? null,
        traceId,
        messageId: params.messageId,
        ceoAgentId: ceoId,
        humanSenderId: params.humanSenderId ?? null,
        maxRounds: this.config.getCeoReplayToolsMaxRounds(),
        maxCallsPerRound: this.config.getCeoReplayToolsMaxCallsPerRound(),
        allowedToolNames,
        capabilitySkillIds: layerBuilt.configuredSkillIds,
      });

      return {
        toolCallsExecuted: loopOut.telemetry.toolCallsExecuted,
        toolNames: loopOut.telemetry.toolNames,
      };
    } catch (e) {
      this.logger.warn('ceo.peer_summon_tool_turn.failed', {
        companyId: params.companyId,
        roomId: params.roomId,
        messageId: params.messageId,
        error: e instanceof Error ? e.message : String(e),
      });
      return { toolCallsExecuted: 0, toolNames: [] };
    }
  }
}
