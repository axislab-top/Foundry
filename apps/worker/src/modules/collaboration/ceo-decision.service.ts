import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createHash } from 'crypto';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';
import type { CollaborationRoutedIntent } from './intent-types.js';
import { CollaborationLlmBridgeService } from './collaboration-llm-bridge.service.js';
import {
  buildCeoDecisionHumanPayload,
  buildCeoDecisionSystemPrompt,
  parseCeoDecisionJson,
  structuredToRoutedMode,
} from './ceo-decision.node.js';
import {
  collaborationRoutingHeuristic,
  fallbackIntentFromEmptyModel,
} from './collaboration-routing-heuristics.js';
import { COLLAB_LLM_TRACE } from '../../common/logging/collab-llm-trace.util.js';

type ChatMessageRow = {
  id: string;
  content?: string | null;
  senderType?: string;
  seq?: string;
};

export interface CeoDecisionInput {
  companyId: string;
  roomId: string;
  messageId: string;
  contentText: string;
  threadId?: string | null;
  mentionedAgentIds: string[];
  ceoAgentId: string | null;
}

export interface CeoDecisionResult {
  mode: CollaborationRoutedIntent;
  confidence: number;
  mentionedAgentIds: string[];
  /** 讨论轮次 CEO 建议优先发言的 Agent（Phase 3 控场） */
  discussionSpeakerAllowlist?: string[];
  discussionMaxSpeakers?: number;
  actionSummary?: string;
  requiresHumanApproval?: boolean;
  approvalTitle?: string | null;
  nextStep?: string;
  modelUsed?: string;
  latencyMs?: number;
  cacheHit?: boolean;
  rawDecisionJson?: string;
}

@Injectable()
export class CeoDecisionService {
  private readonly logger = new Logger(CeoDecisionService.name);
  private readonly decisionCache = new Map<string, { exp: number; result: CeoDecisionResult }>();

  constructor(
    private readonly config: ConfigService,
    private readonly collabLlm: CollaborationLlmBridgeService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private rpcTimeoutMs() {
    return this.config.getCollaborationMentionRpcTimeoutMs();
  }

  private async rpcWithRetry<T>(
    pattern: string,
    payload: Record<string, unknown>,
  ): Promise<T> {
    const timeoutMs = this.rpcTimeoutMs();
    return await firstValueFrom(this.apiRpc.send<T>(pattern, payload).pipe(timeout(timeoutMs)));
  }

  /**
   * 拉取最近 N 条消息并格式化为 CEO 可读文本（含轻量摘要占位，便于后续接 RAG）。
   */
  async buildRoomContext(params: {
    companyId: string;
    roomId: string;
    limit: number;
  }): Promise<{ transcriptSummary: string; companyName: string }> {
    const { companyId, roomId, limit } = params;
    const list = await this.rpcWithRetry<{ items?: ChatMessageRow[] }>('collaboration.messages.list', {
      companyId,
      actor: this.workerActor(),
      roomId,
      limit,
    });
    const items = list?.items ?? [];
    const lines: string[] = [];
    for (const m of items) {
      if (m.content == null || String(m.content).trim() === '') continue;
      const who = m.senderType === 'agent' ? 'Agent' : m.senderType === 'human' ? 'Human' : 'Other';
      lines.push(`[${who} ${m.seq ?? ''}] ${String(m.content).slice(0, 1500)}`);
    }
    const transcriptSummary = lines.join('\n');

    let companyName = 'Company';
    try {
      const co = await this.rpcWithRetry<{ name?: string }>('companies.findOne', {
        companyId,
        actor: this.workerActor(),
        id: companyId,
      });
      if (co?.name && typeof co.name === 'string') companyName = co.name;
    } catch {
      /* non-fatal */
    }

    return { transcriptSummary, companyName };
  }

  private cacheKey(input: CeoDecisionInput, transcriptSummary: string): string {
    const h = createHash('sha256');
    h.update(
      JSON.stringify({
        c: input.companyId,
        r: input.roomId,
        m: input.messageId,
        t: input.contentText,
        tr: transcriptSummary.slice(-800),
      }),
    );
    return h.digest('hex');
  }

  private getCached(key: string): CeoDecisionResult | null {
    if (!this.config.isCeoDecisionCacheEnabled()) return null;
    const row = this.decisionCache.get(key);
    if (!row || row.exp < Date.now()) {
      if (row) this.decisionCache.delete(key);
      return null;
    }
    return { ...row.result, cacheHit: true };
  }

  private setCache(key: string, result: CeoDecisionResult): void {
    if (!this.config.isCeoDecisionCacheEnabled()) return;
    const ttl = this.config.getCeoDecisionCacheTtlMs();
    this.decisionCache.set(key, { exp: Date.now() + ttl, result: { ...result, cacheHit: false } });
  }

  private mergeMentionedIds(
    fromUser: string[],
    fromJson: string[] | undefined,
    ceoId: string | null,
  ): string[] {
    if (fromJson && fromJson.length > 0) {
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const filtered = fromJson.filter((id) => uuid.test(id));
      if (filtered.length > 0) return filtered;
    }
    return fromUser;
  }

  private uuidRe() {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  }

  /** 供协作流水线在 forcedMode 等路径下复用讨论控场逻辑 */
  getDiscussionModeration(params: {
    mode: CollaborationRoutedIntent;
    parsedAllowlist: string[] | undefined;
    parsedMax: number | undefined;
    mentionedAgentIds: string[];
    ceoId: string | null;
  }): { discussionSpeakerAllowlist?: string[]; discussionMaxSpeakers?: number } {
    if (params.mode !== 'discussion') return {};
    const cap = Math.min(
      8,
      Math.max(1, params.parsedMax ?? this.config.getDiscussionModerationMaxSpeakers()),
      this.config.getDiscussionModerationMaxSpeakers(),
    );
    const uuid = this.uuidRe();
    let allow = (params.parsedAllowlist ?? []).filter((id) => uuid.test(id));
    allow = allow.filter((id) => !params.ceoId || id !== params.ceoId);
    allow = allow.slice(0, cap);
    if (allow.length === 0) {
      const nonCeo = params.mentionedAgentIds.filter((id) => !params.ceoId || id !== params.ceoId);
      allow = nonCeo.slice(0, cap);
    }
    return { discussionSpeakerAllowlist: allow, discussionMaxSpeakers: cap };
  }

  async decide(input: CeoDecisionInput): Promise<CeoDecisionResult> {
    const started = Date.now();
    this.logger.log(`${COLLAB_LLM_TRACE} | ceo_decision.start`, {
      messageId: input.messageId,
      companyId: input.companyId,
      roomId: input.roomId,
    });
    const heuristic = collaborationRoutingHeuristic(
      input.contentText,
      input.mentionedAgentIds,
      input.ceoAgentId,
    );
    if (heuristic && heuristic.confidence >= this.config.getCeoDecisionHeuristicMinConfidence()) {
      this.logger.log(`${COLLAB_LLM_TRACE} | ceo_decision.exit`, {
        messageId: input.messageId,
        path: 'heuristic',
        mode: heuristic.mode,
        ms: Date.now() - started,
      });
      const mod =
        heuristic.mode === 'discussion'
          ? this.getDiscussionModeration({
              mode: 'discussion',
              parsedAllowlist: undefined,
              parsedMax: undefined,
              mentionedAgentIds: heuristic.mentionedAgentIds,
              ceoId: input.ceoAgentId,
            })
          : {};
      return {
        mode: heuristic.mode,
        confidence: heuristic.confidence,
        mentionedAgentIds: heuristic.mentionedAgentIds,
        ...mod,
        latencyMs: Date.now() - started,
        cacheHit: false,
      };
    }

    const limit = this.config.getCeoDecisionMaxContextMessages();
    const { transcriptSummary, companyName } = await this.buildRoomContext({
      companyId: input.companyId,
      roomId: input.roomId,
      limit,
    });

    const ck = this.cacheKey(input, transcriptSummary);
    const hit = this.getCached(ck);
    if (hit) {
      this.logger.log(`${COLLAB_LLM_TRACE} | ceo_decision.exit`, {
        messageId: input.messageId,
        path: 'cache',
        mode: hit.mode,
        ms: Date.now() - started,
      });
      return { ...hit, latencyMs: Date.now() - started };
    }

    const modelName = this.config.getCeoDecisionModel();
    if (!modelName) {
      const fb = fallbackIntentFromEmptyModel(input.mentionedAgentIds, input.ceoAgentId);
      const mod =
        fb.mode === 'discussion'
          ? this.getDiscussionModeration({
              mode: 'discussion',
              parsedAllowlist: undefined,
              parsedMax: undefined,
              mentionedAgentIds: fb.mentionedAgentIds,
              ceoId: input.ceoAgentId,
            })
          : {};
      const result: CeoDecisionResult = {
        mode: fb.mode,
        confidence: fb.confidence,
        mentionedAgentIds: fb.mentionedAgentIds,
        ...mod,
        latencyMs: Date.now() - started,
        cacheHit: false,
      };
      this.setCache(ck, result);
      this.logger.log(`${COLLAB_LLM_TRACE} | ceo_decision.exit`, {
        messageId: input.messageId,
        path: 'no_model_config',
        mode: result.mode,
        ms: Date.now() - started,
      });
      return result;
    }

    try {
      this.logger.log(`${COLLAB_LLM_TRACE} | ceo_decision.llm_branch`, {
        messageId: input.messageId,
        configuredModel: modelName,
      });
      const model = await this.collabLlm.createChatModel({
        companyId: input.companyId,
        agentId: input.ceoAgentId ?? undefined,
        fallbackModelName: modelName,
        llmTimeoutMs: this.config.getCeoDecisionLlmTimeoutMs(),
        maxOutputTokens: this.config.getCeoDecisionMaxOutputTokens(),
        taskPriority: 'normal',
      });
      this.logger.log(`${COLLAB_LLM_TRACE} | ceo_decision.llm_invoke`, { messageId: input.messageId });
      const sys = buildCeoDecisionSystemPrompt(companyName);
      const human = buildCeoDecisionHumanPayload({
        transcriptSummary,
        latestMessage: input.contentText,
        mentionedAgentIds: input.mentionedAgentIds,
        ceoAgentId: input.ceoAgentId,
      });
      const res = await model.invoke([new SystemMessage(sys), new HumanMessage(human)]);
      const raw =
        typeof res.content === 'string'
          ? res.content
          : Array.isArray(res.content)
            ? res.content.map((c) => (typeof c === 'string' ? c : JSON.stringify(c))).join('')
            : JSON.stringify(res.content);
      const parsed = parseCeoDecisionJson(raw);
      if (!parsed) {
        throw new Error('CEO decision JSON parse failed');
      }
      const mode = structuredToRoutedMode(parsed);
      const conf = typeof parsed.confidence === 'number' ? parsed.confidence : 0.72;
      const mentioned = this.mergeMentionedIds(
        input.mentionedAgentIds,
        parsed.mentionedAgents,
        input.ceoAgentId,
      );
      const mod = this.getDiscussionModeration({
        mode,
        parsedAllowlist: parsed.discussionSpeakerAllowlist,
        parsedMax: parsed.maxConcurrentDiscussionSpeakers,
        mentionedAgentIds: mentioned,
        ceoId: input.ceoAgentId,
      });
      let result: CeoDecisionResult = {
        mode,
        confidence: conf,
        mentionedAgentIds: mentioned,
        ...mod,
        actionSummary: parsed.actionSummary,
        requiresHumanApproval: parsed.requiresHumanApproval,
        approvalTitle: parsed.approvalTitle ?? null,
        nextStep: parsed.nextStep,
        modelUsed: modelName,
        latencyMs: Date.now() - started,
        cacheHit: false,
        rawDecisionJson: JSON.stringify(parsed),
      };

      const threshold = this.config.getCollabIntentConfidenceThreshold();
      if (result.confidence < threshold) {
        const mod2 = this.getDiscussionModeration({
          mode: 'discussion',
          parsedAllowlist: parsed.discussionSpeakerAllowlist,
          parsedMax: parsed.maxConcurrentDiscussionSpeakers,
          mentionedAgentIds: mentioned,
          ceoId: input.ceoAgentId,
        });
        result = {
          ...result,
          ...mod2,
          mode: 'discussion',
          confidence: Math.max(result.confidence, 0.5),
        };
      }

      this.setCache(ck, result);
      this.logger.log(`${COLLAB_LLM_TRACE} | ceo_decision.exit`, {
        messageId: input.messageId,
        path: 'llm_ok',
        mode: result.mode,
        ms: Date.now() - started,
      });
      return result;
    } catch (e: unknown) {
      this.logger.warn('CEO decision LLM failed, using heuristic fallback', {
        message: e instanceof Error ? e.message : String(e),
        trace: COLLAB_LLM_TRACE,
        messageId: input.messageId,
      });
      const fb = heuristic ?? fallbackIntentFromEmptyModel(input.mentionedAgentIds, input.ceoAgentId);
      const mod =
        fb.mode === 'discussion'
          ? this.getDiscussionModeration({
              mode: 'discussion',
              parsedAllowlist: undefined,
              parsedMax: undefined,
              mentionedAgentIds: fb.mentionedAgentIds,
              ceoId: input.ceoAgentId,
            })
          : {};
      const result: CeoDecisionResult = {
        mode: fb.mode,
        confidence: fb.confidence,
        mentionedAgentIds: fb.mentionedAgentIds,
        ...mod,
        latencyMs: Date.now() - started,
        cacheHit: false,
      };
      this.setCache(ck, result);
      this.logger.log(`${COLLAB_LLM_TRACE} | ceo_decision.exit`, {
        messageId: input.messageId,
        path: 'llm_error_fallback',
        mode: result.mode,
        ms: Date.now() - started,
      });
      return result;
    }
  }
}
