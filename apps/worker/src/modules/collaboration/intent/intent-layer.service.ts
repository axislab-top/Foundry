import { Injectable, Logger } from '@nestjs/common';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ConfigService } from '../../../common/config/config.service.js';
import { CollaborationLlmBridgeService } from '../collaboration-llm-bridge.service.js';
import { CeoLayerConfigResolverService } from '../ceo/resolver/ceo-layer-config-resolver.service.js';
import type { AudienceRoutingLlmParsed, IntentDecision, RoomContext } from '../contracts/collaboration-2026.contracts.js';
import { audienceRoutingLlmSchema, scrubAudienceRoutingLlmPayload } from '../contracts/collaboration-2026.contracts.js';
import { buildRoomMemberPromptBlock } from '../context/room-context.service.js';
import type { AudienceRoutingRecentTurnFacts } from '../group-chat-context.service.js';
import { resolveSummonTargetsFromRoomNlCopy } from '../intent-summon-nl-resolve.util.js';
import { suggestsCompanyWideDepartmentListingQuery } from './main-room-company-department-listing-query.util.js';
import { resolveAudienceRoutingDeterministic } from './audience-routing-deterministic.js';
import {
  AUDIENCE_ROUTING_FEW_SHOT_BLOCK,
  AUDIENCE_ROUTING_JSON_REPAIR_INSTRUCTION,
  AUDIENCE_ROUTING_SYSTEM_PROMPT,
} from './audience-routing.prompt.js';
import {
  AUDIENCE_ROUTING_SYSTEM_MEMORY_SNIPPETS_MAX_CHARS,
  AUDIENCE_ROUTING_USER_JSON_TRANSCRIPT_MAX_CHARS,
} from './audience-routing-llm-limits.js';
import { repairAudienceRoutingModelJson } from './audience-routing-json-repair.util.js';

/**
 * 主群 **Intent（受众路由）** 实现：**唯一职责**是判定用户本轮要找**哪位房内 agent 接话**（或交 CEO 协调线）。
 * 不承载「要不要拉 facts」「公司画像」「是否在群」等编排/事实策略——那些在 `CollaborationPipelineV2` / `decideOrchestrationPolicy` 等层处理。
 */

/** 召唤置信度门限：@ / NL 花名册匹配低于此值不触发强直连 */
const SUMMON_CONFIDENCE_FLOOR = 0.85;
/**
 * LLM 返回的房内 grounding id：允许略低置信度（模型偶发偏低分；id 已由 roster 校验非幻觉）。
 * Mention / NL 路径仍使用 {@link SUMMON_CONFIDENCE_FLOOR}。
 */
const SUMMON_CONFIDENCE_FLOOR_LLM_GROUNDED = 0.78;

type AudienceResolutionSource =
  | 'audience_routing_llm'
  | 'audience_routing_deterministic_mention'
  | 'audience_routing_deterministic_org_listing'
  | 'audience_routing_llm_fallback';

@Injectable()
export class IntentLayerService {
  private readonly logger = new Logger(IntentLayerService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly llmBridge: CollaborationLlmBridgeService,
    private readonly ceoLayerConfigResolver: CeoLayerConfigResolverService,
  ) {}

  /**
   * **仅主群**：前置受众路由，只做「接话人」解析（房内 agentIds vs CEO 线）。
   *
   * **决策顺序**：
   * ① 确定性路径（房内 @、组织列表问法）→ 直接出结果
   * ② 其余：**单次 LLM** + JSON 修复；解析失败则 graceful fallback 到 CEO 线（不再用 CEO 交办正则短路）
   *
   * 下游归一化（`normalizeAudienceDecision`）按优先级处理：
   *   a. mention 召唤 → b. NL 目录匹配 → c. LLM 房内 ID → d. 组织列表压制 → e. CEO 线
   *
   * 部门房不走本方法；部门主管回复由管线构造确定性 stub，不经受众 LLM。
   */
  async recognizeIntent(input: {
    companyId: string;
    roomContext: RoomContext;
    contentText: string;
    messageId: string;
    threadId?: string | null;
    traceId?: string;
    mentionedAgentIds?: string[];
    mentionedNodeIds?: string[];
    ceoAgentId?: string | null;
    originalContentText?: string;
    recentTranscriptDigest?: string | null;
    /** 服务端从 messages.list 抽取的最后一条持久化消息事实（含 senderId），非推断规则。 */
    audienceRoutingRecentTurnFacts?: AudienceRoutingRecentTurnFacts | null;
    audienceRoutingMemoryDigest?: string | null;
  }): Promise<IntentDecision> {
    if (input.roomContext.roomType !== 'main') {
      throw new Error('audience_routing_main_room_only');
    }
    const traceId = String(input.traceId ?? input.messageId).trim();
    const text = String(input.contentText ?? '').trim();
    if (!text) {
      throw new Error('audience_routing_empty_user_text');
    }

    const layerSetting = await this.ceoLayerConfigResolver.resolveLayerSetting(input.companyId, 'intent');
    const routingModel = String(layerSetting.modelName ?? '').trim();
    if (!routingModel) {
      throw new Error('audience_routing_admin_model_unconfigured');
    }

    const mentionedAgentIds = Array.from(
      new Set((input.mentionedAgentIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean)),
    ).slice(0, 12);
    const mentionedNodeIds = Array.from(
      new Set((input.mentionedNodeIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean)),
    ).slice(0, 12);

    const maxDirect = this.config.getCollabMainRoomMaxDirectTargets();
    const originalContentText = String(input.originalContentText ?? text).trim();

    // ── Step 1: 确定性路径 ──
    const deterministic = resolveAudienceRoutingDeterministic({
      originalContentText,
      mentionedAgentIds,
      roomContext: input.roomContext,
      ceoAgentId: input.ceoAgentId ?? null,
      maxDirect,
    });

    let parsed: AudienceRoutingLlmParsed;
    let audienceResolutionSource: AudienceResolutionSource;

    if (deterministic.callLlm === false) {
      audienceResolutionSource =
        deterministic.kind === 'mention_in_room'
          ? 'audience_routing_deterministic_mention'
          : 'audience_routing_deterministic_org_listing';
      parsed = deterministic.parsed;
      this.logger.log('audience_routing.llm_skipped', {
        traceId,
        messageId: input.messageId,
        companyId: input.companyId,
        kind: deterministic.kind,
      });
    } else {
      // ── Step 2: 单次 LLM + JSON 修复 + graceful fallback ──
      const llmTimeoutMs = Math.max(120_000, this.config.getCeoDecisionLlmTimeoutMs());
      const model = await this.llmBridge.createChatModel({
        companyId: input.companyId,
        fallbackModelName: routingModel,
        llmTimeoutMs,
        maxOutputTokens: 768,
        temperatureOverride: 0.06,
        disableReasoning: true,
        taskPriority: 'high',
        ceoContext: 'intent',
        trace: { messageId: input.messageId, callsite: 'collab.audience-routing.recognize' },
        meteringAgentId: input.ceoAgentId ?? undefined,
      });

      const structuredRoomMemberDirectory = buildRoomMemberPromptBlock(input.roomContext.memberDirectory ?? []);
      const digest = String(input.recentTranscriptDigest ?? '')
        .trim()
        .slice(0, AUDIENCE_ROUTING_USER_JSON_TRANSCRIPT_MAX_CHARS);
      const turnFacts = input.audienceRoutingRecentTurnFacts ?? null;
      const conversationSignals: Record<string, unknown> = {
        structuredRoomMemberDirectory,
        memberDirectoryCount: input.roomContext.memberDirectory?.length ?? 0,
        mentionedAgentIds,
        mentionedNodeIds,
      };
      if (turnFacts?.lastPersistedRoomMessage) {
        conversationSignals.recentTurnFacts = turnFacts;
      }
      const userTurn = JSON.stringify({
        roomType: input.roomContext.roomType,
        roomName: input.roomContext.roomName,
        text,
        ...(digest ? { recentTranscriptDigest: digest } : {}),
        conversationSignals,
      });

      const memoryDigest = String(input.audienceRoutingMemoryDigest ?? '').trim();
      const memorySupplement = memoryDigest
        ? `\n\n# Retrieved memory snippets (ground routing only; do not quote verbatim to the user)\n${memoryDigest.slice(0, AUDIENCE_ROUTING_SYSTEM_MEMORY_SNIPPETS_MAX_CHARS)}`
        : '';
      const baseMessages = [
        new SystemMessage(AUDIENCE_ROUTING_SYSTEM_PROMPT + memorySupplement),
        new HumanMessage(AUDIENCE_ROUTING_FEW_SHOT_BLOCK),
        new HumanMessage(userTurn),
      ];

      const llmResult = await this.runAudienceRoutingWithRepair(model, baseMessages, {
        companyId: input.companyId,
        messageId: input.messageId,
      });
      parsed = llmResult.parsed;
      audienceResolutionSource = llmResult.fallback ? 'audience_routing_llm_fallback' : 'audience_routing_llm';
    }

    return this.normalizeAudienceDecision(
      {
        roomContext: input.roomContext,
        contentText: text,
        originalContentText,
        mentionedAgentIds,
        mentionedNodeIds,
        ceoAgentId: input.ceoAgentId ?? null,
      },
      traceId,
      parsed,
      audienceResolutionSource,
    );
  }

  /**
   * 解析 @mention 与房内 agent roster 的交集；mentionedNodeIds 预留组织节点扩展（当前不计入直连目标）。
   */
  resolveExplicitTarget(
    roomContext: RoomContext,
    mentionedAgentIds: string[],
    mentionedNodeIds: string[],
    ceoAgentId?: string | null,
  ): { inRoomAgentIds: string[]; missingMentionedAgentIds: string[] } {
    void mentionedNodeIds;
    const roomAgentIds = new Set(
      (roomContext.members ?? [])
        .filter((m) => m.memberType === 'agent')
        .map((m) => String(m.memberId ?? '').trim())
        .filter(Boolean),
    );
    const mentioned = Array.from(new Set(mentionedAgentIds.map((id) => String(id ?? '').trim()).filter(Boolean)));
    const inRoomRaw = mentioned.filter((id) => roomAgentIds.has(id));
    const ceo = String(ceoAgentId ?? '').trim();
    const inRoomAgentIds = (ceo ? inRoomRaw.filter((id) => id !== ceo) : inRoomRaw).slice(0, 8);
    const effectiveInRoom = inRoomAgentIds.length > 0 ? inRoomAgentIds : inRoomRaw.slice(0, 8);
    const missingMentionedAgentIds = mentioned.filter((id) => !roomAgentIds.has(id)).slice(0, 8);
    return { inRoomAgentIds: effectiveInRoom, missingMentionedAgentIds };
  }

  private static readonly AUDIENCE_ROUTING_LLM_RAW_PREVIEW_CHARS = 2500;

  /**
   * Debug：模型原始输出（截断）；排查「handoff 为空」时对齐 assistant 全文。
   */
  private logAudienceRoutingLlmRaw(
    phase: 'primary' | 'repair',
    ctx: { companyId: string; messageId: string },
    rawText: string,
  ): void {
    const cap = IntentLayerService.AUDIENCE_ROUTING_LLM_RAW_PREVIEW_CHARS;
    this.logger.debug(`audience_routing.llm_${phase}_raw`, {
      companyId: ctx.companyId,
      messageId: ctx.messageId,
      rawCharLength: rawText.length,
      rawPreview: rawText.slice(0, cap),
    });
  }

  /** 解析成功后的结构化摘要（默认 log 级别，便于生产 grep）。 */
  private logAudienceRoutingLlmParsed(
    phase: 'primary' | 'repair',
    ctx: { companyId: string; messageId: string },
    parsed: AudienceRoutingLlmParsed,
  ): void {
    this.logger.log(`audience_routing.llm_${phase}_parsed`, {
      companyId: ctx.companyId,
      messageId: ctx.messageId,
      targetAgentIds: parsed.targetAgentIds ?? [],
      confidence: parsed.confidence,
      explanation: String(parsed.explanation ?? '').slice(0, 240),
    });
  }

  /**
   * 单次 LLM + JSON 修复。两次都失败时 graceful fallback（返回 CEO 线默认值，不抛异常）。
   */
  private async runAudienceRoutingWithRepair(
    model: BaseChatModel,
    baseMessages: (HumanMessage | SystemMessage)[],
    ctx: { companyId: string; messageId: string },
  ): Promise<{ parsed: AudienceRoutingLlmParsed; fallback: boolean }> {
    const rawModel = model as BaseChatModel & { invoke: (input: unknown) => Promise<AIMessage> };

    const tryParse = (label: string, rawText: string): AudienceRoutingLlmParsed | null => {
      try {
        const obj = this.parseJsonObjectFromModelText(rawText);
        const scrubbed = scrubAudienceRoutingLlmPayload(obj);
        return audienceRoutingLlmSchema.parse(scrubbed);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`audience_routing.${label}_invalid`, {
          companyId: ctx.companyId,
          messageId: ctx.messageId,
          err: msg,
        });
        return null;
      }
    };

    // Attempt 1: primary
    const t1 = this.messageText(await rawModel.invoke(baseMessages));
    this.logAudienceRoutingLlmRaw('primary', ctx, t1);
    const first = tryParse('primary', t1);
    if (first) {
      this.logAudienceRoutingLlmParsed('primary', ctx, first);
      return { parsed: first, fallback: false };
    }

    // Attempt 2: JSON repair
    const repairMessages = [
      ...baseMessages,
      new HumanMessage(
        JSON.stringify({
          instruction: AUDIENCE_ROUTING_JSON_REPAIR_INSTRUCTION,
          prior_output: t1.slice(0, 14_000),
        }),
      ),
    ];
    const t2 = this.messageText(await rawModel.invoke(repairMessages));
    this.logAudienceRoutingLlmRaw('repair', ctx, t2);
    const second = tryParse('repair', t2);
    if (second) {
      this.logAudienceRoutingLlmParsed('repair', ctx, second);
      return { parsed: second, fallback: false };
    }

    // Graceful fallback: CEO 线
    this.logger.warn('audience_routing.llm_fallback_ceo', {
      companyId: ctx.companyId,
      messageId: ctx.messageId,
      primaryRawPreview: t1.slice(0, 800),
      repairRawPreview: t2.slice(0, 800),
    });
    return {
      parsed: { targetAgentIds: [], confidence: 0.5, explanation: 'audience_routing_llm_parse_failed' },
      fallback: true,
    };
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

  private parseJsonObjectFromModelText(raw: string): unknown {
    const t = raw.trim();
    const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t);
    const body = fence ? fence[1]!.trim() : t;
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('audience_routing_json_not_found');
    }
    const slice = body.slice(start, end + 1);
    try {
      return JSON.parse(slice);
    } catch {
      return JSON.parse(repairAudienceRoutingModelJson(slice));
    }
  }

  /**
   * 归一化受众路由决策：按优先级顺序解析目标 agent。
   *
   * 顺序：a. mention 召唤 → b. NL 目录匹配 → c. LLM 房内 ID → d. 组织列表查询压制 → e. CEO 线
   */
  private normalizeAudienceDecision(
    input: {
      roomContext: RoomContext;
      contentText: string;
      originalContentText: string;
      mentionedAgentIds: string[];
      mentionedNodeIds: string[];
      ceoAgentId?: string | null;
    },
    traceId: string,
    out: AudienceRoutingLlmParsed,
    audienceResolutionSource: AudienceResolutionSource,
  ): IntentDecision {
    const conf = Number(out.confidence ?? 0);
    const ceo = String(input.ceoAgentId ?? '').trim();
    const maxDirect = this.config.getCollabMainRoomMaxDirectTargets();

    const explicit = this.resolveExplicitTarget(
      input.roomContext,
      input.mentionedAgentIds,
      input.mentionedNodeIds,
      input.ceoAgentId,
    );

    let targetAgentIds: string[] | undefined;
    let explicitDirectTargets: boolean | undefined;
    let summonAgentsMissingFromRoom: string[] | undefined;

    // ── a. Mention 召唤（最高优先级）──
    const mentionTargets = Array.from(
      new Set(input.mentionedAgentIds.map((id) => String(id ?? '').trim()).filter(Boolean)),
    )
      .filter((id) => !ceo || id !== ceo)
      .slice(0, maxDirect);

    if (mentionTargets.length > 0 && conf >= SUMMON_CONFIDENCE_FLOOR) {
      targetAgentIds = mentionTargets;
      explicitDirectTargets = true;
      const missingFiltered = explicit.missingMentionedAgentIds.filter((id) => mentionTargets.includes(id));
      summonAgentsMissingFromRoom = missingFiltered.length > 0 ? missingFiltered : undefined;
    }

    // ── b. NL 目录匹配（无 @ 时）──
    if (!targetAgentIds && input.mentionedAgentIds.length === 0 && conf >= SUMMON_CONFIDENCE_FLOOR) {
      const nlIds = resolveSummonTargetsFromRoomNlCopy(
        input.originalContentText,
        input.roomContext,
        input.ceoAgentId,
      ).slice(0, maxDirect);
      if (nlIds.length > 0) {
        targetAgentIds = nlIds;
        explicitDirectTargets = true;
        this.logger.log('audience_routing_nl_directory_match', { traceId, targetAgentIds: nlIds, confidence: conf });
      }
    }

    // ── c. LLM 房内 ID 校验（已 grounding 的目标允许略低置信度门限）──
    if (!targetAgentIds) {
      const llmRoomIds = this.pickRoomGroundedAgentIds(input.roomContext, out.targetAgentIds, maxDirect);
      const llmFloor = llmRoomIds.length > 0 ? SUMMON_CONFIDENCE_FLOOR_LLM_GROUNDED : SUMMON_CONFIDENCE_FLOOR;
      if (conf >= llmFloor && llmRoomIds.length > 0) {
        targetAgentIds = llmRoomIds;
        explicitDirectTargets = true;
        this.logger.log('audience_routing_llm_room_ids', { traceId, targetAgentIds: llmRoomIds, confidence: conf });
      } else if (
        audienceResolutionSource === 'audience_routing_llm' ||
        audienceResolutionSource === 'audience_routing_llm_fallback'
      ) {
        const rawLlm = [...(out.targetAgentIds ?? [])];
        let dropReason: string;
        if (rawLlm.length === 0) {
          dropReason = 'llm_empty_target_agent_ids';
        } else if (llmRoomIds.length === 0) {
          dropReason = 'llm_ids_not_in_room_after_grounding';
        } else if (conf < llmFloor) {
          dropReason = 'below_confidence_floor_for_llm_grounded_ids';
        } else {
          dropReason = 'unknown';
        }
        this.logger.debug('audience_routing.normalize_no_handoff_after_llm', {
          traceId,
          audienceResolutionSource,
          rawLlmTargetAgentIds: rawLlm,
          groundedInRoomIds: llmRoomIds,
          confidence: conf,
          confidenceFloor: llmFloor,
          dropReason,
        });
      }
    }

    // ── d. 组织列表查询压制（LLM 常误判为全员直连）──
    if (targetAgentIds && targetAgentIds.length > 0 && suggestsCompanyWideDepartmentListingQuery(input.originalContentText)) {
      this.logger.log('audience_routing_suppress_multi_direct_for_org_listing_query', {
        traceId,
        priorTargetAgentIds: targetAgentIds,
        confidence: conf,
      });
      targetAgentIds = undefined;
      explicitDirectTargets = undefined;
      summonAgentsMissingFromRoom = undefined;
    }

    // ── e. 最终输出 ──
    const hasResolvedAgents = (targetAgentIds?.length ?? 0) > 0;
    const riskLevel = hasResolvedAgents ? 'low' : 'medium';

    if (explicitDirectTargets) {
      this.logger.log('audience_routing_explicit_agent_targets', {
        traceId,
        targetAgentIds,
        confidence: conf,
        missingInvites: summonAgentsMissingFromRoom?.length ?? 0,
      });
    }

    return {
      traceId,
      roomType: input.roomContext.roomType,
      intentType: 'audience_resolution',
      confidence: conf,
      explanation: String(out.explanation ?? '').trim() || 'audience_routing_llm',
      routingHints: {
        riskLevel,
        requiresParallelism: false,
        shouldExecute: false,
        responseMode: 'group_reply',
        ...(targetAgentIds !== undefined ? { targetAgentIds } : {}),
        ...(explicitDirectTargets !== undefined ? { explicitDirectTargets } : {}),
        ...(summonAgentsMissingFromRoom !== undefined ? { summonAgentsMissingFromRoom } : {}),
      },
      targetDepartmentSlugs: [],
      /** 受众层不声明 CEO Orchestration/Strategy/Supervisor；下游由 replay 与治理入口决定。 */
      targetLayer: null,
      metadata: {
        source: audienceResolutionSource,
        primaryAudience: hasResolvedAgents ? 'in_room_agents' : 'ceo_line',
      },
    };
  }

  /** 仅采纳出现在房内成员表中的 agentId，避免模型编造 UUID。 */
  private pickRoomGroundedAgentIds(
    roomContext: RoomContext,
    raw: string[] | undefined,
    maxDirect: number,
  ): string[] {
    if (!raw?.length) return [];
    const roomAgentIds = new Set(
      (roomContext.members ?? [])
        .filter((m) => m.memberType === 'agent')
        .map((m) => String(m.memberId ?? '').trim())
        .filter(Boolean),
    );
    const cap = Number.isFinite(maxDirect) ? Math.max(1, Math.min(32, Math.floor(maxDirect))) : 4;
    return Array.from(new Set(raw.map((id) => String(id ?? '').trim()).filter((id) => roomAgentIds.has(id)))).slice(
      0,
      cap,
    );
  }
}
