import { Injectable, Logger } from '@nestjs/common';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ConfigService } from '../../../common/config/config.service.js';
import { CollaborationLlmBridgeService } from '../collaboration-llm-bridge.service.js';
import { CeoLayerConfigResolverService } from '../ceo/resolver/ceo-layer-config-resolver.service.js';
import {
  contextGroundingLlmSchema,
  scrubContextGroundingLlmPayload,
  type ContextGroundingLlmParsed,
} from '../contracts/collaboration-2026.contracts.js';
import type { RoomContext } from '../contracts/collaboration-2026.contracts.js';
import {
  buildMinimalContextGroundingFallback,
  sanitizeContextGroundingBlockIds,
  sanitizePlannerFactsQueryTypes,
  type ContextGroundingBlockId,
  type ContextGroundingPlan,
} from '../context/context-grounding-plan.js';
import type { AudienceRoutingRecentTurnFacts } from '../group-chat-context.service.js';
import { repairContextGroundingModelJson } from './context-grounding-json-repair.util.js';
import {
  CONTEXT_GROUNDING_FEW_SHOT_BLOCK,
  CONTEXT_GROUNDING_JSON_REPAIR_INSTRUCTION,
  CONTEXT_GROUNDING_SYSTEM_PROMPT,
} from './context-grounding.prompt.js';
import {
  CONTEXT_GROUNDING_SYSTEM_MEMORY_SNIPPETS_MAX_CHARS,
  CONTEXT_GROUNDING_USER_JSON_TRANSCRIPT_MAX_CHARS,
} from './context-grounding-llm-limits.js';

/**
 * 主群 **Context Grounding Planner**（与 Intent 受众路由并行、职责独立）：
 * 决定 replay / orchestration 前应预取哪些事实块，不决定接话人。
 */
@Injectable()
export class ContextGroundingPlannerService {
  private readonly logger = new Logger(ContextGroundingPlannerService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly llmBridge: CollaborationLlmBridgeService,
    private readonly ceoLayerConfigResolver: CeoLayerConfigResolverService,
  ) {}

  async planGrounding(input: {
    companyId: string;
    roomContext: RoomContext;
    contentText: string;
    messageId: string;
    threadId?: string | null;
    traceId?: string;
    ceoAgentId?: string | null;
    messageCategory?: string | null;
    recentTranscriptDigest?: string | null;
    audienceRoutingRecentTurnFacts?: AudienceRoutingRecentTurnFacts | null;
    audienceRoutingMemoryDigest?: string | null;
  }): Promise<ContextGroundingPlan> {
    if (input.roomContext.roomType !== 'main') {
      throw new Error('context_grounding_main_room_only');
    }
    const traceId = String(input.traceId ?? input.messageId).trim();
    const text = String(input.contentText ?? '').trim();
    if (!text) {
      throw new Error('context_grounding_empty_user_text');
    }

    if (!this.config.isCeoContextGroundingPlannerEnabled()) {
      const plan = buildMinimalContextGroundingFallback('disabled');
      this.logPlan(traceId, input, plan);
      return plan;
    }

    const orchestrationSetting = await this.ceoLayerConfigResolver.resolveLayerSetting(
      input.companyId,
      'orchestration',
    );
    let plannerModel = String(orchestrationSetting.modelName ?? '').trim();
    if (!plannerModel) {
      const intentSetting = await this.ceoLayerConfigResolver.resolveLayerSetting(input.companyId, 'intent');
      plannerModel = String(intentSetting.modelName ?? '').trim();
    }
    if (!plannerModel) {
      throw new Error('context_grounding_admin_model_unconfigured');
    }

    const llmTimeoutMs = Math.max(120_000, this.config.getCeoDecisionLlmTimeoutMs());
    const model = await this.llmBridge.createChatModel({
      companyId: input.companyId,
      fallbackModelName: plannerModel,
      llmTimeoutMs,
      maxOutputTokens: 768,
      temperatureOverride: 0.06,
      disableReasoning: true,
      taskPriority: 'high',
      ceoContext: 'orchestration',
      trace: { messageId: input.messageId, callsite: 'collab.context-grounding.plan' },
      meteringAgentId: input.ceoAgentId ?? undefined,
    });

    const digest = String(input.recentTranscriptDigest ?? '')
      .trim()
      .slice(0, CONTEXT_GROUNDING_USER_JSON_TRANSCRIPT_MAX_CHARS);
    const turnFacts = input.audienceRoutingRecentTurnFacts ?? null;
    const userTurn = JSON.stringify({
      roomType: input.roomContext.roomType,
      text,
      collaborationMode: input.roomContext.collaborationMode ?? 'discussion',
      messageCategory: String(input.messageCategory ?? '').trim() || null,
      ...(digest ? { recentTranscriptDigest: digest } : {}),
      ...(turnFacts?.lastPersistedRoomMessage ? { recentTurnFacts: turnFacts } : {}),
    });

    const memoryDigest = String(input.audienceRoutingMemoryDigest ?? '').trim();
    const memorySupplement = memoryDigest
      ? `\n\n# Retrieved memory snippets (ground block selection only)\n${memoryDigest.slice(0, CONTEXT_GROUNDING_SYSTEM_MEMORY_SNIPPETS_MAX_CHARS)}`
      : '';

    const baseMessages = [
      new SystemMessage(CONTEXT_GROUNDING_SYSTEM_PROMPT + memorySupplement),
      new HumanMessage(CONTEXT_GROUNDING_FEW_SHOT_BLOCK),
      new HumanMessage(userTurn),
    ];

    const { parsed, fallback } = await this.runGroundingWithRepair(model, baseMessages, {
      companyId: input.companyId,
      messageId: input.messageId,
    });

    const plan = this.normalizePlan(parsed, fallback);
    this.logPlan(traceId, input, plan);
    return plan;
  }

  private normalizePlan(parsed: ContextGroundingLlmParsed, fallback: boolean): ContextGroundingPlan {
    if (fallback) {
      return buildMinimalContextGroundingFallback('llm_fallback');
    }

    let blocks = sanitizeContextGroundingBlockIds(parsed.prefetchBlocks);
    if (!blocks.includes('speaker')) {
      blocks = ['speaker', ...blocks.filter((b) => b !== 'speaker')];
    }

    return {
      prefetchBlocks: blocks.slice(0, 8) as ContextGroundingBlockId[],
      factsQueryTypes: sanitizePlannerFactsQueryTypes(parsed.factsQueryTypes),
      toolPolicy: parsed.toolPolicy ?? 'tools_allowed',
      confidence: parsed.confidence,
      source: 'llm',
      explanation: String(parsed.explanation ?? '').slice(0, 500) || undefined,
    };
  }

  private async runGroundingWithRepair(
    model: BaseChatModel,
    baseMessages: (HumanMessage | SystemMessage)[],
    ctx: { companyId: string; messageId: string },
  ): Promise<{ parsed: ContextGroundingLlmParsed; fallback: boolean }> {
    const rawModel = model as BaseChatModel & { invoke: (input: unknown) => Promise<AIMessage> };

    const tryParse = (label: string, rawText: string): ContextGroundingLlmParsed | null => {
      try {
        const obj = this.parseJsonObjectFromModelText(rawText);
        const scrubbed = scrubContextGroundingLlmPayload(obj);
        return contextGroundingLlmSchema.parse(scrubbed);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`context_grounding.${label}_invalid`, {
          companyId: ctx.companyId,
          messageId: ctx.messageId,
          err: msg,
        });
        return null;
      }
    };

    const t1 = this.messageText(await rawModel.invoke(baseMessages));
    const first = tryParse('primary', t1);
    if (first) {
      return { parsed: first, fallback: false };
    }

    const repairMessages = [
      ...baseMessages,
      new HumanMessage(
        JSON.stringify({
          instruction: CONTEXT_GROUNDING_JSON_REPAIR_INSTRUCTION,
          prior_output: t1.slice(0, 14_000),
        }),
      ),
    ];
    const t2 = this.messageText(await rawModel.invoke(repairMessages));
    const second = tryParse('repair', t2);
    if (second) {
      return { parsed: second, fallback: false };
    }

    this.logger.warn('context_grounding.llm_fallback_minimal', {
      companyId: ctx.companyId,
      messageId: ctx.messageId,
      primaryRawPreview: t1.slice(0, 800),
      repairRawPreview: t2.slice(0, 800),
    });
    return {
      parsed: {
        prefetchBlocks: ['speaker', 'transcript'],
        factsQueryTypes: [],
        toolPolicy: 'tools_allowed',
        confidence: 0.5,
        explanation: 'context_grounding_llm_parse_failed',
      },
      fallback: true,
    };
  }

  private parseJsonObjectFromModelText(raw: string): unknown {
    const t = raw.trim();
    const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t);
    const body = fence ? fence[1]!.trim() : t;
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('context_grounding_json_not_found');
    }
    const slice = body.slice(start, end + 1);
    try {
      return JSON.parse(slice);
    } catch {
      return JSON.parse(repairContextGroundingModelJson(slice));
    }
  }

  private messageText(msg: AIMessage): string {
    const c = msg.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) {
      return c
        .map((p) =>
          typeof p === 'object' && p !== null && 'text' in p
            ? String((p as { text?: string }).text ?? '')
            : String(p),
        )
        .join('');
    }
    return String(c ?? '');
  }

  private logPlan(
    traceId: string,
    input: { companyId: string; roomId?: string; messageId: string },
    plan: ContextGroundingPlan,
  ): void {
    this.logger.log('foundry.context.grounding.plan', {
      traceId,
      companyId: input.companyId,
      roomId: input.roomId ?? null,
      messageId: input.messageId,
      prefetchBlocks: plan.prefetchBlocks,
      factsQueryTypes: plan.factsQueryTypes,
      toolPolicy: plan.toolPolicy,
      confidence: plan.confidence,
      source: plan.source,
      explanation: plan.explanation?.slice(0, 240) ?? null,
    });
  }
}
