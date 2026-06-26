import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { trace } from '@opentelemetry/api';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';
import { COLLAB_LLM_TRACE } from '../../common/logging/collab-llm-trace.util.js';
import type { CeoV2Layer } from './ceo/config/ceo-layer.config.js';
import {
  CeoLayerConfigResolverService,
  type DirectAgentMemoryInjectConfig,
} from './ceo/resolver/ceo-layer-config-resolver.service.js';
import type {
  PendingMentionEntry,
  ReplyFactsPack,
} from './ceo/dto/ceo-v2-pipeline.types.js';
import type { L1DecisionContext as ContractsL1DecisionContext } from '@foundry/contracts/types/collaboration';
import type { CollaborationIntentDecisionV20261, MemoryReference } from '@contracts/types';
import { ConversationStateRedisCacheService } from './conversation-state-redis-cache.service.js';
import { AgentsActiveDirectoryCacheService } from './context/agents-active-directory-cache.service.js';
import { MonitoringService } from '../../common/monitoring/monitoring.service.js';
import { parsePendingMentions } from './ceo/mention-intent-moe.util.js';
import { isCeoAudienceIntentType } from './intent/intent-audience.util.js';
import { userMessageSuggestsPlanningContinuity } from './main-room-user-message.util.js';
import { planIncludesBlock, type ContextGroundingPlan } from './context/context-grounding-plan.js';
import type { MemorySearchResult } from './context/collaboration-execution-context.js';
import { toSkillCatalogEntry } from '@service/ai';
import type { SkillToolSnapshot } from '@contracts/events';

type ChatListItem = {
  id: string;
  content?: string | null;
  senderType?: string;
  /** Agent / human sender id when API provides it（受众路由 structured facts 依赖）。 */
  senderId?: string | null;
  messageType?: string;
  threadId?: string | null;
};

/** 与 `collaboration.messages.list` 同源，供受众路由 JSON；非推断、非业务规则，仅事实摘要。 */
export type AudienceRoutingRecentTurnFacts = {
  /** 排除当前用户本条 `messageId` 后，线程内时间上最后一条已持久化消息。 */
  lastPersistedRoomMessage?: {
    messageId: string;
    senderType: string;
    senderId: string | null;
    contentPreview: string;
  };
};

type MemorySearchHit = {
  id: string;
  content: string;
  score: number;
  namespace?: string;
  sourceType?: string;
  metadata?: Record<string, unknown> | null;
};

type CompanyProfileGetResult =
  | { text?: string | null; generatedAt?: string | null }
  | { structured?: unknown; generatedAt?: string | null };

type CompanyProfileLoadMeta = {
  status: 'hit' | 'missing' | 'fetch_failed';
  generatedAt: string | null;
  syncAttempted: boolean;
  syncFailed?: boolean;
};

type LayerSettingLite = {
  vectorNamespace?: string | null;
};

type AgentDepartmentSharingContext = {
  role: string | null;
  departmentSlug: string | null;
  /** API：祖先链 department 节点 id（与 `agents.departmentSharingContext` 对齐） */
  departmentOrganizationNodeId?: string | null;
  allowDeptSharedSkills: boolean;
  allowDeptSharedMemory: boolean;
};

type RoomMemberRow = {
  memberType: string;
  memberId: string;
};

type ExtendedL1DecisionContext = ContractsL1DecisionContext & {
  targetAgentIds?: string[];
  mentionRoute?: string;
  replyMode?: string;
  needsApproval?: boolean;
  classifierContextBrief?: string;
  waitingForAgentIds?: string[];
  transcriptSummary?: string;
  humanIdentityDigest?:
    | string
    | {
        block?: string;
        telemetryLabel?: string;
      };
};

/**
 * GroupChatContextService（生产级收口说明）
 *
 * 目标：为 L1/L2/L3（含并行/讨论路径）提供**一致**、**轻量**、**可观测**且**可连续**的上下文注入，避免 CEO 自循环与被 @ Agent echo。
 *
 * 设计原则：
 * - **单一事实来源（Single source of truth）**：
 *   - humanIdentityBlock 只能在此处构建/注入（`buildHumanIdentityPack*`），供 L2/L3 复用，避免语义割裂。
 *   - conversationStateBlock 也在此处构建/注入，并 best-effort 写入 Memory 以支持跨 invoke 连续性。
 * - **严格优先级（Deterministic precedence）**：
 *   - conversation state：`hint (Graph/SupervisionState)` → `Memory(最近窗口最新)` → `heuristic fallback(最小窗口)`。
 * - **统一注入顺序（No context split）**：
 *   - 所有层（L1/L2/L3/并行）在语义上保持同序：`humanIdentity` → `conversationState` → `evidence blocks`（profile/members/memory）。
 *   - 解释：先确定“谁在说话”（身份），再确定“是否在等待谁/是否应继续推进”（状态），最后给检索/证据，避免重复协调与 echo。
 * - **持久化策略（Continuity）**：
 *   - 写入：room-scoped namespace + 固定 `collectionLabel=conversation_state` + `metadata.kind=conversation_state` + `content.updatedAt`。
 *   - 读取：`namespace + metadataContains + createdAfter` 过滤后，按 `content.updatedAt` 选最新。
 *   - L3 supervision 会将 state 写入 Graph SupervisionState（Redis checkpoint）实现跨 invoke 连续。
 * - **可观测性（OTel + logs）**：
 *   - 统一设置：`foundry.conversation_state` / `foundry.current_round` / `foundry.waiting_for_agents`。
 *   - 关键日志：`group_chat.conversation_state_loaded` / `..._injected` / `..._stopped`（stop 在 L3 Reflect）。
 * - **防御性（Hardening）**：
 *   - 任何状态构建/读取/写入失败只 warn，不阻断回复与编排。
 *   - 自循环根治依赖两端：state 连续性（Memory + Graph checkpoint）与执行终止（L3 Reflect hard-stop）；本服务负责提供稳定 state 注入与恢复能力。
 *
 * 扩展点（TODO）：
 * - Agent↔Agent mutual identity via MCP：基于 room roster + agent cards 注入（gated），避免引入噪声/泄露。
 */
/**
 * 群聊分层上下文（Working + Session/Episodic 检索 + 结构化成员表）。
 * 供 CEO/Agent 直聊、讨论纪要等路径复用，避免各写一套 list/search。
 *
 * Human identity 设计原则（最终收口）：
 * - 单一事实来源：人类身份块只能在此处通过 buildHumanIdentityPack* 构建（users + membership + room member）。
 * - L1/L2/L3 语义一致：向量层（L1 queryAugmentPrefix）、轻直聊（L2 auxiliarySystemText）、重图（L3 Planner/State）
 *   都复用同一个“compact + block”来源，避免检索证据与回答语境割裂。
 * - 门控：非 CEO 目标默认不注入，需显式开启 FOUNDRY_ENABLE_HUMAN_IDENTITY_ALL_AGENTS 以减少 Agent 间噪声。
 * - 可观测性：OTel foundry.human_identity 以 telemetryLabel 作为统一标签；调用方可在异步边界外重复写入确保 span 可见。
 *
 * TODO: Agent↔Agent mutual identity via MCP in future sprint (room roster + agent cards, gated).
 */
@Injectable()
export class GroupChatContextService {
  private readonly logger = new Logger(GroupChatContextService.name);
  private readonly replyFactsCache = new Map<
    string,
    { expiresAt: number; value: ReplyFactsPack }
  >();

  constructor(
    private readonly config: ConfigService,
    private readonly ceoLayerConfigResolver: CeoLayerConfigResolverService,
    private readonly convStateCache: ConversationStateRedisCacheService,
    private readonly monitoring: MonitoringService,
    private readonly agentsDirectoryCache: AgentsActiveDirectoryCacheService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  /** 解析 pendingMentions：使用 v2 mention intent utils（strategy gate 统一入口）。 */
  private async parsePendingMentionsViaClassifier(raw: unknown): Promise<Record<string, PendingMentionEntry>> {
    return parsePendingMentions(raw);
  }

  /**
   * 读取最近一条 room-scoped conversation state（用于 L3 supervision 开局 hint）。
   *
   * 精确过滤策略（最小侵入）：
   * - namespace: company:{companyId}:ceo:room:{roomId}:state
   * - sourceTypes: ['summary']
   * - keyword: 'conversation_state'（配合 collectionLabel 与内容）
   * - metadataContains: { kind: 'conversation_state', roomId, threadId? }
   * - createdAfter: now - 30min（实现近似 TTL）
   *
   * 由于 memory.search hit 不携带 createdAt，这里从 topK 命中中按 content.updatedAt 选最新（写入时保证该字段存在）。
   */
  async readLastConversationStateFromMemory(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    timeoutMs: number;
    /** L1 等低延迟路径：允许 sub-100ms RPC 超时（默认仍 floor 800ms 以兼容旧调用） */
    fastLookup?: boolean;
    /** 近似 TTL 的窗口（默认 30min） */
    lookbackMs?: number | null;
  }): Promise<{
    currentRound: number;
    waitingForAgentIds: string[];
    updatedAt: string;
    pendingMentions: Record<string, PendingMentionEntry>;
  } | null> {
    const companyId = String(params.companyId || '').trim();
    const roomId = String(params.roomId || '').trim();
    if (!companyId || !roomId) return null;

    const namespace = `company:${companyId}:ceo:room:${roomId}:state`;
    const lookbackMs = Number.isFinite(params.lookbackMs as number) ? Math.max(60_000, Number(params.lookbackMs)) : 30 * 60_000;
    const createdAfter = new Date(Date.now() - lookbackMs).toISOString();
    const tid = (params.threadId ?? '').trim();

    try {
      const hydrateStart = Date.now();
      const cached = await this.convStateCache.getSnapshot({
        companyId,
        roomId,
        threadId: tid || null,
      });
      if (cached) {
        this.monitoring?.incCollabConversationStateCache('redis_hit');
        this.monitoring?.observeCollabClassifierHydrateMs('redis', Date.now() - hydrateStart);
        const span0 = trace.getActiveSpan();
        span0?.setAttribute('foundry.current_round', cached.currentRound);
        span0?.setAttribute('foundry.waiting_for_agents', cached.waitingForAgentIds.join(',').slice(0, 500));
        span0?.setAttribute(
          'foundry.conversation_state',
          cached.waitingForAgentIds.length ? 'redis_hit_waiting' : 'redis_hit_idle',
        );
        this.logger.debug(`${COLLAB_LLM_TRACE} | group_chat.conversation_state_loaded_redis`, {
          companyId,
          roomId,
          threadId: tid || null,
          currentRound: cached.currentRound,
        });
        const waiting = cached.waitingForDepartmentSlugs?.length
          ? cached.waitingForDepartmentSlugs
          : cached.waitingForAgentIds ?? [];
        return {
          currentRound: cached.currentRound,
          waitingForAgentIds: waiting,
          updatedAt: cached.updatedAt,
          pendingMentions: cached.pendingMentions,
        };
      }
      this.monitoring?.incCollabConversationStateCache('redis_miss');

      const rpcCap = params.fastLookup
        ? Math.max(22, Math.min(params.timeoutMs, 52))
        : Math.max(800, Math.min(params.timeoutMs, 5000));
      const hits = await firstValueFrom(
        this.apiRpc
          .send<MemorySearchHit[]>('memory.search', {
            companyId,
            actor: this.workerActor(),
            data: {
              query: 'conversation_state',
              keyword: 'conversation_state',
              namespaces: [namespace],
              sourceTypes: ['summary'],
              topK: 6,
              createdAfter,
              metadataContains: {
                kind: 'conversation_state',
                roomId,
                ...(tid ? { threadId: tid } : {}),
              },
            },
          } as Record<string, unknown>)
          .pipe(timeout(rpcCap)),
      );

      const list = Array.isArray(hits) ? hits : [];
      if (!list.length) {
        this.monitoring?.observeCollabClassifierHydrateMs(
          params.fastLookup ? 'memory' : 'combined',
          Date.now() - hydrateStart,
        );
        return null;
      }

      const parsed = (
        await Promise.all(
          list.map(async (h) => {
            const meta = (h.metadata ?? {}) as Record<string, unknown>;
            const metaKind = typeof meta.kind === 'string' ? meta.kind.trim() : '';
            const metaRoomId = typeof meta.roomId === 'string' ? meta.roomId.trim() : '';
            const metaThreadId = typeof meta.threadId === 'string' ? meta.threadId.trim() : '';
            if (metaKind && metaKind !== 'conversation_state') return null;
            if (metaRoomId && metaRoomId !== roomId) return null;
            if (tid && metaThreadId && metaThreadId !== tid) return null;

            const raw = (h.content ?? '').trim();
            if (!raw) return null;
            try {
              const j = JSON.parse(raw) as any;
              const updatedAt = typeof j?.updatedAt === 'string' ? j.updatedAt : '';
              const currentRound = Number.isFinite(j?.currentRound) ? Math.max(1, Math.floor(Number(j.currentRound))) : 1;
              const fromDept = Array.isArray(j?.waitingForDepartmentSlugs)
                ? j.waitingForDepartmentSlugs.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 12)
                : [];
              const waitingForAgentIds = Array.isArray(j?.waitingForAgentIds)
                ? j.waitingForAgentIds.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 12)
                : [];
              const waitingForDepartmentSlugs = fromDept.length ? fromDept : waitingForAgentIds;
              const pendingMentions =
                j?.pendingMentions && typeof j.pendingMentions === 'object'
                  ? await this.parsePendingMentionsViaClassifier(j.pendingMentions)
                  : {};
              if (!updatedAt) return null;
              const stateUpdatedAt =
                typeof j?.stateUpdatedAt === 'string' && j.stateUpdatedAt.trim() ? j.stateUpdatedAt.trim() : updatedAt;
              return {
                updatedAt,
                currentRound,
                waitingForAgentIds: waitingForDepartmentSlugs,
                waitingForDepartmentSlugs,
                stateUpdatedAt,
                pendingMentions,
              };
            } catch {
              return null;
            }
          }),
        )
      ).filter(
        (x): x is {
          updatedAt: string;
          currentRound: number;
          waitingForAgentIds: string[];
          waitingForDepartmentSlugs: string[];
          stateUpdatedAt: string;
          pendingMentions: Record<string, PendingMentionEntry>;
        } => Boolean(x),
      );

      if (!parsed.length) {
        this.monitoring?.observeCollabClassifierHydrateMs(
          params.fastLookup ? 'memory' : 'combined',
          Date.now() - hydrateStart,
        );
        return null;
      }

      parsed.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
      const latest = parsed[0]!;

      const span = trace.getActiveSpan();
      span?.setAttribute('foundry.current_round', latest.currentRound);
      span?.setAttribute('foundry.waiting_for_agents', latest.waitingForAgentIds.join(',').slice(0, 500));
      span?.setAttribute('foundry.conversation_state', latest.waitingForAgentIds.length ? 'loaded_waiting' : 'loaded_idle');

      this.logger.debug(`${COLLAB_LLM_TRACE} | group_chat.conversation_state_loaded`, {
        companyId,
        roomId,
        threadId: tid || null,
        namespace,
        createdAfter,
        currentRound: latest.currentRound,
        waitingForAgentIds: latest.waitingForAgentIds,
        updatedAt: latest.updatedAt,
      });

      this.monitoring?.observeCollabClassifierHydrateMs(
        params.fastLookup ? 'memory' : 'combined',
        Date.now() - hydrateStart,
      );
      void this.convStateCache
        .setSnapshot({
          companyId,
          roomId,
          threadId: tid || null,
          snapshot: {
            currentRound: latest.currentRound,
            waitingForDepartmentSlugs: latest.waitingForDepartmentSlugs,
            waitingForAgentIds: latest.waitingForAgentIds,
            updatedAt: latest.updatedAt,
            stateUpdatedAt: latest.stateUpdatedAt,
            pendingMentions: latest.pendingMentions,
          },
        })
        .then(() => this.monitoring?.incCollabConversationStateCache('redis_write'))
        .catch(() => undefined);

      return latest;
    } catch (e: unknown) {
      this.logger.warn(`${COLLAB_LLM_TRACE} | group_chat.conversation_state_load_failed`, {
        companyId,
        roomId,
        threadId: tid || null,
        message: this.formatError(e),
      });
      return null;
    }
  }

  /**
   * 对话状态块（最小可用，供 L2/L3 防自循环 + 明确等待对象）。
   *
   * 设计目标：
   * - 极短：1-3 行，人类与模型都能快速读懂。
   * - 可判定：明确是否“应继续推进”还是“应等待指定人回复”。
   * - 可降级：无法解析时给出稳定的默认块，不影响主流程。
   *
   * State 持久化策略（生产收口）：
   * - **写入**：每次构建 state block 都 best-effort 写入 Memory（room-scoped namespace + 固定 collectionLabel + metadata.kind）。
   * - **读取**：当调用方未提供 hint 时，优先从 Memory 读取最近 30min 的最新一条 state（按 content.updatedAt 排序）。
   * - **Graph 连续性**：L3 supervision 会在开局读取该 state 作为 hint，并将最终 state 写入 SupervisionState（Redis checkpoint），实现跨 invoke 连续。
   */
  async buildConversationStateBlock(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    timeoutMs: number;
    /**
     * 提示：当调用方（如 L3 supervision state）已经知道正在等待哪些 agent，
     * 可直接传入以避免启发式解析带来的误判。
     */
    hintWaitingForAgentIds?: string[] | null;
    /** 提示：调用方若维护 currentRound 可传入。 */
    hintCurrentRound?: number | null;
    /** 与 Graph/HeavyState 对齐的 pending @ 状态（draft/confirmed × round）。 */
    hintPendingMentions?: Record<string, PendingMentionEntry> | null;
    /** 启发式解析的消息窗口大小（越大越准，但 RPC 更重）。 */
    windowSize?: number | null;
  }): Promise<{
    block: string;
    currentRound: number;
    waitingForAgentIds: string[];
    pendingMentions: Record<string, PendingMentionEntry>;
    telemetryLabel: string;
  }> {
    // Production hardening: this method must never throw or block replies.
    // Any unexpected error falls back to a stable default state pack.
    try {
      const span = trace.getActiveSpan();
      const waitingHint = Array.isArray(params.hintWaitingForAgentIds)
        ? params.hintWaitingForAgentIds.map((s) => String(s || '').trim()).filter(Boolean)
        : [];
      const roundHint = Number.isFinite(params.hintCurrentRound as number)
        ? Math.max(1, Math.floor(params.hintCurrentRound as number))
        : null;

      const defaultPack = (p?: {
        currentRound?: number;
        waitingForAgentIds?: string[];
        pendingMentions?: Record<string, PendingMentionEntry>;
        note?: string;
      }) => {
        const currentRound = p?.currentRound && Number.isFinite(p.currentRound) ? Math.max(1, Math.floor(p.currentRound)) : 1;
        const waitingForAgentIds = Array.isArray(p?.waitingForAgentIds)
          ? [...new Set(p!.waitingForAgentIds.map((x) => String(x || '').trim()).filter(Boolean))].slice(0, 6)
          : [];
        const pendingMentions =
          p?.pendingMentions && typeof p.pendingMentions === 'object' ? p.pendingMentions : {};
        const pmLine =
          Object.keys(pendingMentions).length > 0
            ? `pendingMentions: ${Object.entries(pendingMentions)
                .map(([id, v]) => `${id}=${v.stage}@r${v.round}`)
                .join('; ')
                .slice(0, 900)}`
            : null;
        const statusLine = waitingForAgentIds.length
          ? `本轮已完成 1 次协调，正在等待：${waitingForAgentIds.join(', ')}`
          : '本轮暂无明确等待对象；如刚完成@人协调，请等待对方回复（不要自循环推进）。';
        const note = (p?.note ?? '').trim();
        const block = [
          '【对话状态（Conversation State）】',
          statusLine,
          `discussionRound: ${currentRound}`,
          'discussionMaxRounds: 4',
          pmLine,
          note ? `备注：${note}` : null,
        ].filter((x): x is string => Boolean(x)).join('\n');
        const telemetryLabel = waitingForAgentIds.length ? `waiting_for:${waitingForAgentIds.join(',')}`.slice(0, 200) : 'idle_or_waiting';
        span?.setAttribute('foundry.conversation_state', telemetryLabel);
        span?.setAttribute('foundry.current_round', currentRound);
        span?.setAttribute('foundry.waiting_for_agents', waitingForAgentIds.join(',').slice(0, 500));
        if (Object.keys(pendingMentions).length) {
          span?.setAttribute('foundry.pending_mentions', Object.keys(pendingMentions).join(',').slice(0, 500));
        }
        this.logger.log(`${COLLAB_LLM_TRACE} | group_chat.conversation_state_injected`, {
          companyId: params.companyId,
          roomId: params.roomId,
          threadId: params.threadId ?? null,
          currentRound,
          waitingForAgentIds,
          waitingForDepartmentSlugs: waitingForAgentIds,
          pendingMentionKeys: Object.keys(pendingMentions).length,
          telemetryLabel,
        });

        // Best-effort persist state to Memory (room-scoped). Any failure must never block replies.
        try {
          const namespace = `company:${params.companyId}:ceo:room:${params.roomId}:state`;
          const expiresAtIso = new Date(Date.now() + 30 * 60_000).toISOString();
          const nowIso = new Date().toISOString();
          const payload = {
            currentRound,
            waitingForDepartmentSlugs: waitingForAgentIds,
            waitingForAgentIds,
            pendingMentions,
            updatedAt: nowIso,
            stateUpdatedAt: nowIso,
          };
          void this.convStateCache
            .setSnapshot({
              companyId: params.companyId,
              roomId: params.roomId,
              threadId: params.threadId ?? null,
              snapshot: payload,
            })
            .then(() => this.monitoring?.incCollabConversationStateCache('redis_write'))
            .catch(() => undefined);
          void firstValueFrom(
            this.apiRpc
              .send('memory.entries.store', {
                companyId: params.companyId,
                actor: this.workerActor(),
                data: {
                  namespace,
                  collectionLabel: 'conversation_state',
                  content: JSON.stringify(payload),
                  sourceType: 'summary',
                  metadata: {
                    kind: 'conversation_state',
                    roomId: params.roomId,
                    threadId: (params.threadId ?? null) as any,
                    expiresAt: expiresAtIso,
                  },
                },
              } as Record<string, unknown>)
              .pipe(timeout(Math.max(800, Math.min(params.timeoutMs, 5000)))),
          ).catch((e: unknown) => {
            this.logger.warn(`${COLLAB_LLM_TRACE} | group_chat.conversation_state_persist_failed`, {
              companyId: params.companyId,
              roomId: params.roomId,
              message: this.formatError(e),
            });
          });
        } catch (e: unknown) {
          this.logger.warn(`${COLLAB_LLM_TRACE} | group_chat.conversation_state_persist_guard_failed`, {
            companyId: params.companyId,
            roomId: params.roomId,
            message: this.formatError(e),
          });
        }
        return { block, currentRound, waitingForAgentIds, pendingMentions, telemetryLabel };
      };

      const hintPm =
        params.hintPendingMentions && typeof params.hintPendingMentions === 'object'
          ? params.hintPendingMentions
          : {};

      // Priority #1: hint from caller (Graph/HeavyState).
      if (waitingHint.length > 0) {
        return defaultPack({
          currentRound: roundHint ?? 1,
          waitingForAgentIds: waitingHint,
          pendingMentions: hintPm,
        });
      }

      // Priority #2: restore from Memory (room-scoped latest state).
      try {
        const persisted = await this.readLastConversationStateFromMemory({
          companyId: params.companyId,
          roomId: params.roomId,
          threadId: params.threadId ?? null,
          timeoutMs: params.timeoutMs,
          lookbackMs: 30 * 60_000,
        });
        if (persisted) {
          return defaultPack({
            currentRound: roundHint ?? persisted.currentRound ?? 1,
            waitingForAgentIds: persisted.waitingForAgentIds ?? [],
            pendingMentions: persisted.pendingMentions ?? {},
            note: '已从 Memory 恢复上一轮对话状态（用于跨 invoke 连续性）。',
          });
        }
      } catch (e: unknown) {
        this.logger.warn(`${COLLAB_LLM_TRACE} | group_chat.conversation_state_restore_guard_failed`, {
          companyId: params.companyId,
          roomId: params.roomId,
          message: this.formatError(e),
        });
      }

      // Priority #3: lightweight heuristic fallback (best-effort).
      // Constraint: limit=12, inspect at most last 3 ask+@ messages to reduce cost/false positives.
      const actor = this.workerActor();
      const limit = Math.min(Math.max(Number(params.windowSize ?? 12), 12), 12);
      let items: ChatListItem[] = [];
      try {
        const list = await firstValueFrom(
          this.apiRpc
            .send<{ items?: ChatListItem[] }>('collaboration.messages.list', {
              companyId: params.companyId,
              actor,
              roomId: params.roomId,
              limit,
            } as Record<string, unknown>)
            .pipe(timeout(Math.max(500, Math.min(params.timeoutMs, 8000)))),
        );
        items = Array.isArray(list?.items) ? list!.items! : [];
      } catch (e: unknown) {
        this.logger.warn(`${COLLAB_LLM_TRACE} | group_chat.conversation_state_list_failed`, {
          companyId: params.companyId,
          roomId: params.roomId,
          message: this.formatError(e),
        });
        return defaultPack({
          currentRound: roundHint ?? 1,
          waitingForAgentIds: [],
          pendingMentions: hintPm,
          note: '对话状态解析失败（拉取消息失败）。',
        });
      }

    const tid = (params.threadId ?? '').trim();
    if (tid) {
      items = items.filter((m) => (m.threadId ?? null) === tid);
    } else {
      const mainOnly = items.filter((m) => m.threadId == null);
      items = mainOnly.length > 0 ? mainOnly : items;
    }

    const normalized = items
      .map((m) => ({
        senderType: (m.senderType ?? '').trim(),
        content: (m.content ?? '').trim(),
      }))
      .filter((m) => m.content.length > 0);

    // Detect last few "coordination / ask" messages that mention @someone.
    const mentionRegex = /@([^\s，。；：:、]+(?:（[^）]+）)?)/g;
    const askRegex = /(请|麻烦|烦请).*(回复|汇报|同步|更新|说明|跟进|确认)/;
    const asks: Array<{ idx: number; mentions: string[]; content: string }> = [];
    for (let i = normalized.length - 1; i >= 0; i--) {
      const c = normalized[i]!.content;
      if (!c.includes('@')) continue;
      if (!askRegex.test(c)) continue;
      const mentions: string[] = [];
      for (const m of c.matchAll(mentionRegex)) {
        const raw = String(m[1] ?? '').trim();
        if (raw) mentions.push(raw);
      }
      if (mentions.length > 0) {
        asks.push({ idx: i, mentions: [...new Set(mentions)].slice(0, 6), content: c });
        if (asks.length >= 3) break;
      }
    }

    if (asks.length === 0) {
      return defaultPack({ currentRound: roundHint ?? 1, waitingForAgentIds: [], pendingMentions: hintPm });
    }

    // Choose the most recent ask and check whether there is any agent reply afterwards.
    const mostRecent = asks[0]!;
    const after = normalized.slice(mostRecent.idx + 1);
    const hasAnyAgentReplyAfter = after.some((m) => m.senderType === 'agent');
    // If there is no agent reply at all after the ask, we are waiting for the mentioned agents.
    // (We avoid matching agentId strings in content to reduce false negatives/positives.)
    const waiting = hasAnyAgentReplyAfter ? [] : mostRecent.mentions;

    // Round heuristic: count asks in window (coarse but monotonic-ish).
    const askCount = asks.length;
    const currentRound = roundHint ?? Math.max(1, Math.min(askCount, 20));

    return defaultPack({
      currentRound,
      waitingForAgentIds: waiting,
      pendingMentions: hintPm,
      note: `最近一次协调@对象：${mostRecent.mentions.join(', ')}`,
    });
    } catch (e: unknown) {
      this.logger.warn(`${COLLAB_LLM_TRACE} | group_chat.conversation_state_guard_failed`, {
        companyId: params.companyId,
        roomId: params.roomId,
        threadId: params.threadId ?? null,
        message: this.formatError(e),
      });
      // Stable fallback (no extra RPCs in guard path).
      return {
        block:
          '【对话状态（Conversation State）】\n本轮暂无明确等待对象；如刚完成@人协调，请等待对方回复（不要自循环推进）。\ndiscussionRound: 1\ndiscussionMaxRounds: 4',
        currentRound: 1,
        waitingForAgentIds: [],
        pendingMentions: {},
        telemetryLabel: 'guard_failed',
      };
    }
  }

  /**
   * Best-effort：将 currentRound / waiting / pendingMentions 写入 room state Memory。
   * 供 L1 MoE @ 去重与跨消息连续性使用（失败不抛）。
   */
  async persistRoomConversationState(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    timeoutMs: number;
    currentRound: number;
    waitingForAgentIds: string[];
    pendingMentions: Record<string, PendingMentionEntry>;
  }): Promise<void> {
    const companyId = String(params.companyId || '').trim();
    const roomId = String(params.roomId || '').trim();
    if (!companyId || !roomId) return;
    const currentRound = Math.max(1, Math.floor(params.currentRound || 1));
    const waitingForAgentIds = [...new Set((params.waitingForAgentIds ?? []).map((x) => String(x || '').trim()).filter(Boolean))].slice(0, 12);
    const pendingMentions = params.pendingMentions && typeof params.pendingMentions === 'object' ? params.pendingMentions : {};
    const namespace = `company:${companyId}:ceo:room:${roomId}:state`;
    const expiresAtIso = new Date(Date.now() + 30 * 60_000).toISOString();
    const nowIso = new Date().toISOString();
    const payload = {
      currentRound,
      waitingForDepartmentSlugs: waitingForAgentIds,
      waitingForAgentIds,
      pendingMentions,
      updatedAt: nowIso,
      stateUpdatedAt: nowIso,
    };
    void this.convStateCache
      .setSnapshot({
        companyId,
        roomId,
        threadId: params.threadId ?? null,
        snapshot: payload,
      })
      .then(() => this.monitoring?.incCollabConversationStateCache('redis_write'))
      .catch(() => undefined);
    try {
      void firstValueFrom(
        this.apiRpc
          .send('memory.entries.store', {
            companyId,
            actor: this.workerActor(),
            data: {
              namespace,
              collectionLabel: 'conversation_state',
              content: JSON.stringify(payload),
              sourceType: 'summary',
              metadata: {
                kind: 'conversation_state',
                roomId,
                threadId: (params.threadId ?? null) as any,
                expiresAt: expiresAtIso,
              },
            },
          } as Record<string, unknown>)
          .pipe(timeout(Math.max(800, Math.min(params.timeoutMs, 5000)))),
      ).catch((e: unknown) => {
        this.logger.warn(`${COLLAB_LLM_TRACE} | group_chat.conversation_state_persist_explicit_failed`, {
          companyId,
          roomId,
          message: this.formatError(e),
        });
      });
    } catch (e: unknown) {
      this.logger.warn(`${COLLAB_LLM_TRACE} | group_chat.conversation_state_persist_explicit_guard_failed`, {
        companyId,
        roomId,
        message: this.formatError(e),
      });
    }
  }

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private formatError(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (typeof e === 'string') return e;
    if (e && typeof e === 'object') {
      const rec = e as Record<string, unknown>;
      if (typeof rec.message === 'string') return rec.message;
      const response = rec.response;
      if (response && typeof response === 'object') {
        const msg = (response as Record<string, unknown>).message;
        if (typeof msg === 'string') return msg;
        if (Array.isArray(msg)) return msg.map((x) => String(x)).join('; ');
      }
      try {
        return JSON.stringify(e);
      } catch {
        return String(e);
      }
    }
    return String(e);
  }

  static clipText(s: string | null | undefined, max: number): string {
    const t = (s ?? '').trim();
    if (!t) return '';
    return t.length <= max ? t : `${t.slice(0, max)}…`;
  }

  private resolveLayerNamespace(companyId: string, ctx: CeoV2Layer, layer: LayerSettingLite | null): string {
    const mappedLayer =
      ctx === 'intent'
        ? 'L1-intent'
        : ctx === 'strategy'
          ? 'L1'
          : ctx === 'supervision'
            ? 'L3'
            : ctx === 'replay'
              ? 'replay'
              : 'L2';
    const configuredNs = typeof layer?.vectorNamespace === 'string' ? layer.vectorNamespace.trim() : '';
    return (configuredNs || `company:{companyId}:ceo:layer:${mappedLayer}`).replace('{companyId}', companyId);
  }

  private async resolveMemoryNamespacesForReply(params: {
    companyId: string;
    agentId?: string;
    ceoContext: CeoV2Layer;
    layerNamespace: string;
    timeoutMs: number;
  }): Promise<{ namespaces: string[]; departmentOrganizationNodeId: string | null }> {
    const agentId = (params.agentId ?? '').trim();
    if (!agentId) {
      return { namespaces: [params.layerNamespace], departmentOrganizationNodeId: null };
    }
    try {
      const ctx = await firstValueFrom(
        this.apiRpc
          .send<AgentDepartmentSharingContext>('agents.departmentSharingContext', {
            companyId: params.companyId,
            actor: this.workerActor(),
            id: agentId,
          } as Record<string, unknown>)
          .pipe(timeout(Math.min(params.timeoutMs, 2500))),
      );
      const role = typeof ctx?.role === 'string' ? ctx.role.trim() : '';
      const deptNodeId = String(ctx?.departmentOrganizationNodeId ?? '').trim() || null;
      if (role === 'ceo') {
        return { namespaces: [params.layerNamespace], departmentOrganizationNodeId: null };
      }
      const namespaces = [`agent:${agentId}`];
      const slug = typeof ctx?.departmentSlug === 'string' ? ctx.departmentSlug.trim() : '';
      const allowDeptSharedMemory = Boolean(ctx?.allowDeptSharedMemory);
      if (allowDeptSharedMemory && slug) {
        namespaces.push(`department:${slug}`);
      }
      return { namespaces, departmentOrganizationNodeId: deptNodeId };
    } catch {
      // Defensive fallback: strict isolation (agent-only) for non-CEO paths.
      return { namespaces: [`agent:${agentId}`], departmentOrganizationNodeId: null };
    }
  }

  /**
   * 基础设施级：加载公司档案（来自 Memory-RAG company namespace 的聚合条目）。
   * 不依赖“用户提问的语义检索命中”，用于在 Light/Heavy 都能稳定拿到公司基本信息。
   */
  async loadCompanyProfile(params: {
    companyId: string;
    timeoutMs: number;
  }): Promise<string> {
    const { block } = await this.loadCompanyProfileWithMeta(params);
    return block;
  }

  async loadCompanyProfileWithMeta(params: {
    companyId: string;
    timeoutMs: number;
    section?: string;
    ceoContext?: CeoV2Layer;
  }): Promise<{ block: string; meta: CompanyProfileLoadMeta }> {
    /** 未显式指定时默认 **replay**（对用户层），与主群直连 / reply facts 一致。 */
    const ctx = params.ceoContext ?? 'replay';
    const layer = (await this.ceoLayerConfigResolver
      .resolveLayerSetting(params.companyId, ctx)
      .catch(() => null)) as LayerSettingLite | null;
    const layerNamespace = this.resolveLayerNamespace(params.companyId, ctx, layer);
    try {
      const res = await firstValueFrom(
        this.apiRpc
          .send<CompanyProfileGetResult>('memory.companyProfile.get', {
            companyId: params.companyId,
            actor: this.workerActor(),
            section: params.section,
          } as Record<string, unknown>)
          .pipe(timeout(params.timeoutMs)),
      );
      const text = (res as any)?.text;
      const generatedAt = (res as any)?.generatedAt;
      if (typeof text === 'string' && text.trim()) {
        const clipped = GroupChatContextService.clipText(text, 1800);
        return {
          block: `【公司档案（自动同步；namespace=company / CompanyProfile；ceoLayerNs=${layerNamespace}）】\n${clipped}\n${
            generatedAt ? `（generatedAt=${generatedAt}）` : ''
          }`,
          meta: { status: 'hit', generatedAt: typeof generatedAt === 'string' ? generatedAt : null, syncAttempted: false },
        };
      }
      // Self-heal: trigger a best-effort sync once when missing.
      // The API side has a cooldown lock (30s) to avoid stampedes.
      let syncAttempted = false;
      let syncFailed = false;
      try {
        syncAttempted = true;
        await firstValueFrom(
          this.apiRpc
            .send('memory.companyProfile.sync', {
              companyId: params.companyId,
              actor: this.workerActor(),
            } as Record<string, unknown>)
            .pipe(timeout(Math.min(params.timeoutMs, 8000))),
        );
      } catch (e: unknown) {
        syncFailed = true;
        this.logger.warn('group_chat.company_profile_sync_failed', {
          message: this.formatError(e),
          trace: COLLAB_LLM_TRACE,
        });
      }

      // Multi-hop: if sync likely succeeded, attempt one immediate re-fetch (best-effort).
      if (syncAttempted && !syncFailed) {
        try {
          const refetch = await firstValueFrom(
            this.apiRpc
              .send<CompanyProfileGetResult>('memory.companyProfile.get', {
                companyId: params.companyId,
                actor: this.workerActor(),
                section: params.section,
              } as Record<string, unknown>)
              .pipe(timeout(Math.min(params.timeoutMs, 1500))),
          );
          const t2 = ((refetch as any)?.text ?? '').trim();
          const g2 = (refetch as any)?.generatedAt;
          if (typeof t2 === 'string' && t2.trim()) {
            const clipped = GroupChatContextService.clipText(t2, 1800);
            return {
              block: `【公司档案（自动同步；namespace=company / CompanyProfile；ceoLayerNs=${layerNamespace}）】\n${clipped}\n${
                g2 ? `（generatedAt=${g2}）` : ''
              }`,
              meta: {
                status: 'hit',
                generatedAt: typeof g2 === 'string' ? g2 : null,
                syncAttempted: true,
              },
            };
          }
        } catch {
          // ignore refetch failures
        }
      }
      return {
        block:
          '【公司档案（自动同步）】（暂无公司档案条目；已尝试触发同步，请稍后再问一次或在后台点“立即同步公司档案”。）',
        meta: {
          status: 'missing',
          generatedAt: typeof generatedAt === 'string' ? generatedAt : null,
          syncAttempted,
          syncFailed: syncAttempted ? syncFailed : undefined,
        },
      };
    } catch (e: unknown) {
      this.logger.warn('group_chat.company_profile_fetch_failed', {
        message: this.formatError(e),
        trace: COLLAB_LLM_TRACE,
      });
      return {
        block: '【公司档案（自动同步）】（暂时无法加载，请稍后重试。）',
        meta: { status: 'fetch_failed', generatedAt: null, syncAttempted: false },
      };
    }
  }

  /**
   * L1：近期消息 → LangChain 多轮（不含当前触发条）。
   */
  async loadTranscriptMessages(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    excludeMessageId: string;
    maxMessages: number;
    timeoutMs: number;
  }): Promise<BaseMessage[]> {
    const actor = this.workerActor();
    const fetchLimit = Math.min(Math.max(params.maxMessages + 8, 16), 200);
    let items: ChatListItem[] = [];
    try {
      const list = await firstValueFrom(
        this.apiRpc
          .send<{ items?: ChatListItem[] }>('collaboration.messages.list', {
            companyId: params.companyId,
            actor,
            roomId: params.roomId,
            limit: fetchLimit,
          } as Record<string, unknown>)
          .pipe(timeout(params.timeoutMs)),
      );
      items = list?.items ?? [];
    } catch (e: unknown) {
      this.logger.warn('group_chat.transcript_fetch_failed', {
        companyId: params.companyId,
        roomId: params.roomId,
        message: this.formatError(e),
        trace: COLLAB_LLM_TRACE,
      });
      return [];
    }

    const tid = params.threadId?.trim();
    if (tid) {
      items = items.filter((m) => (m.threadId ?? null) === tid);
    } else {
      const mainOnly = items.filter((m) => m.threadId == null);
      items = mainOnly.length > 0 ? mainOnly : items;
    }

    items = items.filter((m) => m.id !== params.excludeMessageId);
    const slice = items.slice(-params.maxMessages);

    const out: BaseMessage[] = [];
    for (const m of slice) {
      const raw = (m.content ?? '').trim();
      if (!raw) continue;
      const clipped = GroupChatContextService.clipText(raw, 3500);
      const mt = m.messageType ?? 'text';
      if (mt === 'system') continue;
      if (m.senderType === 'human') {
        out.push(new HumanMessage(clipped));
      } else if (m.senderType === 'agent') {
        out.push(new AIMessage(clipped));
      }
    }
    return out;
  }

  /**
   * 讨论纪要等：扁平文本（时间正序），不 exclude（包含最新一条）。
   */
  async loadTranscriptFlattened(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    limit: number;
    timeoutMs: number;
  }): Promise<string> {
    const actor = this.workerActor();
    let items: ChatListItem[] = [];
    try {
      const list = await firstValueFrom(
        this.apiRpc
          .send<{ items?: ChatListItem[] }>('collaboration.messages.list', {
            companyId: params.companyId,
            actor,
            roomId: params.roomId,
            limit: Math.min(params.limit, 200),
          } as Record<string, unknown>)
          .pipe(timeout(params.timeoutMs)),
      );
      items = list?.items ?? [];
    } catch (e: unknown) {
      this.logger.warn('group_chat.transcript_flat_fetch_failed', {
        roomId: params.roomId,
        message: this.formatError(e),
        trace: COLLAB_LLM_TRACE,
      });
      return '';
    }

    const tid = params.threadId?.trim();
    if (tid) {
      items = items.filter((m) => (m.threadId ?? null) === tid);
    } else {
      const mainOnly = items.filter((m) => m.threadId == null);
      items = mainOnly.length > 0 ? mainOnly : items;
    }

    return items
      .map((m) => {
        const c = GroupChatContextService.clipText(m.content ?? '', 500);
        return `${m.senderType ?? '?'}: ${c}`;
      })
      .join('\n');
  }

  /**
   * L2+L3：分层混合检索（session→agent→dept→company），绑定当前房间。
   */
  async buildRetrievedMemoryBlock(params: {
    companyId: string;
    roomId: string;
    agentId?: string;
    projectId?: string | null;
    query: string;
    timeoutMs: number;
    topK: number;
    namespaces?: string[];
    /** 与部门记忆 `department:{slug}` / `dept:{id}` 对齐；带 roomId 时供 API 层级检索 dept 层 */
    organizationNodeId?: string | null;
  }): Promise<{ block: string; entryIds: string[]; memoryReferences: MemoryReference[] }> {
    const actor = this.workerActor();
    const q = GroupChatContextService.clipText(params.query, 4000);
    if (!q) {
      return { block: '', entryIds: [], memoryReferences: [] };
    }
    try {
      const hits = await firstValueFrom(
        this.apiRpc
          .send<MemorySearchHit[]>('memory.search', {
            companyId: params.companyId,
            actor,
            data: {
              query: q,
              roomId: params.roomId,
              namespaces: Array.isArray(params.namespaces) && params.namespaces.length > 0 ? params.namespaces : undefined,
              topK: Math.min(Math.max(params.topK, 1), 24),
              ...(params.agentId ? { agentId: params.agentId } : {}),
              ...(params.projectId ? { projectId: params.projectId } : {}),
              ...(String(params.organizationNodeId ?? '').trim()
                ? { organizationNodeId: String(params.organizationNodeId).trim() }
                : {}),
            },
          } as Record<string, unknown>)
          .pipe(timeout(params.timeoutMs)),
      );
      const list = Array.isArray(hits) ? hits : [];
      if (!list.length) {
        return {
          block: '【会话相关知识检索】（暂无命中；可能尚未写入会话记忆或未开启 SESSION 索引。）',
          entryIds: [],
          memoryReferences: [],
        };
      }
      const lines = list.map((h) => {
        const prev = GroupChatContextService.clipText(h.content, 600);
        const ns = h.namespace ?? '';
        const st = h.sourceType ?? '';
        return `- [memory_entry id=${h.id} score=${Number(h.score).toFixed(4)} ns=${ns} type=${st}] ${prev}`;
      });
      const memoryReferences: MemoryReference[] = list.map((h) => ({
        memoryEntryId: h.id,
        score: typeof h.score === 'number' ? h.score : undefined,
        namespace: h.namespace,
        sourceType: h.sourceType,
        snippet: GroupChatContextService.clipText(h.content, 400),
      }));
      return {
        block: `【会话相关知识检索（memory_entry，供对照与引用；优先与当前讨论相关）】\n${lines.join('\n')}`,
        entryIds: list.map((h) => h.id),
        memoryReferences,
      };
    } catch (e: unknown) {
      this.logger.warn('group_chat.memory_search_failed', {
        roomId: params.roomId,
        message: this.formatError(e),
        trace: COLLAB_LLM_TRACE,
      });
      return {
        block: '【会话相关知识检索】（暂时无法检索，请稍后重试。）',
        entryIds: [],
        memoryReferences: [],
      };
    }
  }

  /**
   * Phase 3.6：将 lead 检索命中格式化为与 {@link buildRetrievedMemoryBlock} 一致的 auxiliary 块（无 RPC）。
   */
  formatLeadCollaborationMemoryHitsAsRetrievalPack(hits: MemorySearchResult[]): {
    block: string;
    entryIds: string[];
    memoryReferences: MemoryReference[];
  } {
    const list = Array.isArray(hits) ? hits : [];
    if (!list.length) {
      return {
        block: '【会话相关知识检索】（暂无命中；可能尚未写入会话记忆或未开启 SESSION 索引。）',
        entryIds: [],
        memoryReferences: [],
      };
    }
    const lines = list.map((h) => {
      const prev = GroupChatContextService.clipText(String(h.content ?? ''), 600);
      const ns = h.namespace ?? '';
      const st = h.sourceType ?? '';
      const id = String(h.id ?? '').trim() || 'unknown';
      const scoreNum = typeof h.score === 'number' ? h.score : 0;
      return `- [memory_entry id=${id} score=${Number(scoreNum).toFixed(4)} ns=${ns} type=${st}] ${prev}`;
    });
    const memoryReferences: MemoryReference[] = list.map((h) => ({
      memoryEntryId: h.id,
      score: typeof h.score === 'number' ? h.score : undefined,
      namespace: h.namespace,
      sourceType: h.sourceType,
      snippet: GroupChatContextService.clipText(String(h.content ?? ''), 400),
    }));
    return {
      block: `【会话相关知识检索（memory_entry，供对照与引用；优先与当前讨论相关）】\n${lines.join('\n')}`,
      entryIds: list.map((h) => String(h.id ?? '').trim()).filter(Boolean),
      memoryReferences,
    };
  }

  /**
   * 结构化：房间活跃成员（Actor 粒度）。
   */
  async buildRoomMembersBlock(params: {
    companyId: string;
    roomId: string;
    timeoutMs: number;
  }): Promise<string> {
    try {
      const rows = await firstValueFrom(
        this.apiRpc
          .send<RoomMemberRow[]>('collaboration.members.list', {
            companyId: params.companyId,
            actor: this.workerActor(),
            roomId: params.roomId,
          } as Record<string, unknown>)
          .pipe(timeout(params.timeoutMs)),
      );
      const list = Array.isArray(rows) ? rows : [];
      if (!list.length) {
        return '【本房间成员】（暂无活跃成员记录。）';
      }
      const lines = list.map(
        (m) => `- ${m.memberType}: ${m.memberId}`,
      );
      return `【本房间当前成员（active）】\n${lines.join('\n')}`;
    } catch (e: unknown) {
      this.logger.warn('group_chat.members_fetch_failed', {
        roomId: params.roomId,
        message: this.formatError(e),
        trace: COLLAB_LLM_TRACE,
      });
      return '【本房间成员】（暂时无法拉取。）';
    }
  }

  /**
   * 解析触发消息的真人用户 ID（非 human 发送则返回 null）。供 L1/L2/L3 与讨论纪要复用。
   */
  async resolveHumanUserIdFromTriggerMessage(
    companyId: string,
    messageId: string,
    timeoutMs: number,
  ): Promise<string | null> {
    const mid = (messageId ?? '').trim();
    if (!mid) return null;
    try {
      const msg = await firstValueFrom(
        this.apiRpc
          .send<{ senderType?: string; senderId?: string }>('collaboration.messages.get', {
            companyId,
            actor: this.workerActor(),
            messageId: mid,
          } as Record<string, unknown>)
          .pipe(timeout(timeoutMs)),
      );
      if (!msg || msg.senderType !== 'human') return null;
      const sid = (msg.senderId ?? '').trim();
      return sid || null;
    } catch (e: unknown) {
      this.logger.debug(`${COLLAB_LLM_TRACE} | group_chat.human_sender_resolve_failed`, {
        messageId: mid,
        message: this.formatError(e),
      });
      return null;
    }
  }

  /**
   * L1 / L3 共用：当前人类发言者的身份摘要（平台用户、租户 membership、房间内成员关系）。
   * compactLine 用于向量检索 query 拼接；telemetryLabel 用于 OTel foundry.human_identity。
   */
  async buildHumanIdentityPack(params: {
    companyId: string;
    roomId: string;
    userId: string;
    timeoutMs: number;
    traceMessageId?: string;
  }): Promise<{ block: string; compactLine: string; telemetryLabel: string }> {
    const uid = (params.userId ?? '').trim();
    if (!uid) return { block: '', compactLine: '', telemetryLabel: '' };
    const span = trace.getActiveSpan();
    const t = Math.max(500, Math.min(params.timeoutMs, 8000));

    // 3 个 RPC 并行执行，避免串行 3x 超时。
    const [userResult, membershipResult, membersResult] = await Promise.allSettled([
      firstValueFrom(
        this.apiRpc
          .send<{ username?: string; email?: string }>('users.findOne', {
            id: uid,
            companyId: params.companyId,
            actor: this.workerActor(),
          } as Record<string, unknown>)
          .pipe(timeout(t)),
      ),
      firstValueFrom(
        this.apiRpc
          .send<{ role?: string } | null>('companies.membership.findActive', {
            companyId: params.companyId,
            userId: uid,
            actor: this.workerActor(),
          } as Record<string, unknown>)
          .pipe(timeout(t)),
      ),
      firstValueFrom(
        this.apiRpc
          .send<RoomMemberRow[]>('collaboration.members.list', {
            companyId: params.companyId,
            actor: this.workerActor(),
            roomId: params.roomId,
          } as Record<string, unknown>)
          .pipe(timeout(t)),
      ),
    ]);

    let username = '';
    let email = '';
    if (userResult.status === 'fulfilled') {
      const user = userResult.value;
      username = (user?.username ?? '').trim();
      email = (user?.email ?? '').trim();
    } else {
      this.logger.debug(`${COLLAB_LLM_TRACE} | group_chat.human_identity_user_failed`, {
        userId: uid,
        message: this.formatError(userResult.reason),
      });
    }

    let membershipRole: string | null = null;
    if (membershipResult.status === 'fulfilled') {
      const m = membershipResult.value;
      if (m && typeof m.role === 'string' && m.role.trim()) membershipRole = m.role.trim();
    } else {
      this.logger.debug(`${COLLAB_LLM_TRACE} | group_chat.human_identity_membership_failed`, {
        userId: uid,
        message: this.formatError(membershipResult.reason),
      });
    }

    let inRoom = false;
    if (membersResult.status === 'fulfilled') {
      const list = Array.isArray(membersResult.value) ? membersResult.value : [];
      inRoom = list.some((r) => r.memberType === 'human' && (r.memberId ?? '').trim() === uid);
    }

    const display = username || email || uid;
    const roleLabel = membershipRole ?? 'unknown';
    const relation =
      membershipRole === 'owner'
        ? 'Primary tenant owner; main human stakeholder the AI CEO should align with strategically (board-facing operator).'
        : membershipRole === 'admin'
          ? 'Tenant administrator with elevated company settings access.'
          : membershipRole === 'member'
            ? 'Active tenant member.'
            : 'Human user in chat (tenant membership role not resolved).';
    const telemetryLabel = `${roleLabel}:${display}`.slice(0, 200);
    span?.setAttribute('foundry.human_identity', telemetryLabel);
    this.logger.log(`${COLLAB_LLM_TRACE} | group_chat.human_identity_injected`, {
      companyId: params.companyId,
      roomId: params.roomId,
      userId: uid,
      traceMessageId: params.traceMessageId ?? null,
      telemetryLabel,
      displayName: display,
      membershipRole: roleLabel,
      inRoom,
    });
    this.logger.debug(`${COLLAB_LLM_TRACE} | group_chat.human_identity_detail`, {
      displayName: display,
      membershipRole: roleLabel,
      username: username || null,
      email: email ? '[set]' : null,
    });

    const blockLines = [
      '【当前人类发言者身份】（真人用户，非组织树中的 Agent 角色）',
      `单句摘要：当前人类发言者 ${display}（租户角色：${roleLabel}）`,
      `Current speaker: ${display} (tenant membership: ${roleLabel})`,
      `- user_id=${uid}`,
      username ? `- username=${username}` : null,
      email ? `- email=${email}` : null,
      `- in_this_room=${inRoom ? 'yes' : 'unknown_or_no'}`,
      `- relationship_to_ceo: ${relation}`,
    ].filter((x): x is string => Boolean(x));

    const block = blockLines.join('\n');
    const compactLine = `Human speaker display="${display}"; tenant_role=${roleLabel}; user_id=${uid}; in_room=${inRoom}`;

    return { block, compactLine, telemetryLabel };
  }

  /**
   * L3 Hybrid：从触发消息解析发言人并构建身份包（非 human 消息则返回空包）。
   */
  async buildHumanIdentityPackForTriggerMessage(params: {
    companyId: string;
    roomId: string;
    messageId: string;
    timeoutMs: number;
    /** 优先使用流水线/调用方已知的用户 ID，避免重复 messages.get */
    humanUserId?: string | null;
  }): Promise<{ block: string; compactLine: string; telemetryLabel: string }> {
    const fromParam = (params.humanUserId ?? '').trim();
    const uid =
      fromParam ||
      (await this.resolveHumanUserIdFromTriggerMessage(
        params.companyId,
        params.messageId,
        params.timeoutMs,
      ));
    if (!uid) return { block: '', compactLine: '', telemetryLabel: '' };
    return this.buildHumanIdentityPack({
      companyId: params.companyId,
      roomId: params.roomId,
      userId: uid,
      timeoutMs: params.timeoutMs,
      traceMessageId: params.messageId,
    });
  }

  /**
   * CEO 直聊默认注入；非 CEO 直聊（replyingToCeo === false）仅当 FOUNDRY_ENABLE_HUMAN_IDENTITY_ALL_AGENTS 开启时注入。
   * replyingToCeo 省略时按 CEO 直聊处理（与 DirectCollabReplyService 默认一致）。
   * 语义小结：仅当「显式非 CEO 且开关关闭」时跳过；replyingToCeo 为 true/undefined 时注入，为 false 时由 env 决定。
   */
  // TODO: Agent↔Agent mutual identity via MCP in future sprint (room roster + agent cards, gated).
  private shouldInjectHumanIdentityForDirectReply(replyingToCeo: boolean | undefined): boolean {
    if (replyingToCeo === true) return true;
    if (replyingToCeo === false) return this.config.getEnableHumanIdentityForAllAgents();
    return true;
  }

  private replyFactsCacheKey(companyId: string, agentId: string): string {
    return `l2:replyfacts:${companyId}:${agentId}`;
  }

  private pruneReplyFactsCache(now: number): void {
    if (this.replyFactsCache.size <= 512) return;
    for (const [k, v] of this.replyFactsCache.entries()) {
      if (v.expiresAt <= now) this.replyFactsCache.delete(k);
    }
    // Hard cap: if still over limit after expiry prune, evict entries with earliest expiresAt.
    const HARD_CAP = 768;
    if (this.replyFactsCache.size > HARD_CAP) {
      const entries = [...this.replyFactsCache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
      const toEvict = entries.slice(0, entries.length - HARD_CAP);
      for (const [k] of toEvict) {
        this.replyFactsCache.delete(k);
      }
    }
  }

  private async getOrBuildReplyFacts(
    companyId: string,
    agentId: string,
    l1DecisionContext?: ExtendedL1DecisionContext,
    options?: { forceRefresh?: boolean },
  ): Promise<ReplyFactsPack> {
    const key = this.replyFactsCacheKey(companyId, agentId);
    const now = Date.now();
    this.pruneReplyFactsCache(now);
    if (!options?.forceRefresh) {
      const hit = this.replyFactsCache.get(key);
      if (hit && hit.expiresAt > now) {
        this.monitoring.recordL2ReplyFactsCache('hit');
        trace.getActiveSpan()?.setAttribute('foundry.l2.replyfacts.cache.hit', 1);
        return hit.value;
      }
    }
    this.monitoring.recordL2ReplyFactsCache('miss');
    trace.getActiveSpan()?.setAttribute('foundry.l2.replyfacts.cache.miss', 1);
    const started = Date.now();
    const facts = await this.buildReplyFacts(companyId, agentId, l1DecisionContext, options);
    const ttlMs = this.config.getL2ReplyFactsCacheTtlMs();
    if (ttlMs > 0) {
      this.replyFactsCache.set(key, {
        value: facts,
        expiresAt: Date.now() + ttlMs,
      });
    }
    const buildLatencyMs = Date.now() - started;
    this.monitoring.observeL2ReplyFactsBuildLatencyMs(buildLatencyMs);
    trace.getActiveSpan()?.setAttribute('foundry.l2.replyfacts.build.latency_ms', buildLatencyMs);
    return facts;
  }

  async buildReplyFacts(
    companyId: string,
    agentId: string,
    l1DecisionContext?: ExtendedL1DecisionContext,
    options?: { forceRefresh?: boolean },
  ): Promise<ReplyFactsPack> {
    const rpcTimeoutMs = this.config.getCollaborationMentionRpcTimeoutMs();
    const [companyRow, agentRows, skillSnapshots, lightLayerSetting] = await Promise.all([
      firstValueFrom(
        this.apiRpc
          .send<{ name?: string | null }>('companies.findOne', {
            companyId,
            actor: this.workerActor(),
            id: companyId,
          } as Record<string, unknown>)
          .pipe(timeout(rpcTimeoutMs)),
      ).catch(() => ({ name: '' })),
      this.agentsDirectoryCache.getActiveAgents(companyId, this.workerActor()).catch((e: unknown) => {
        this.logger.warn(`${COLLAB_LLM_TRACE} | group_chat.reply_facts_agents_directory_failed`, {
          companyId,
          agentId,
          message: this.formatError(e),
        });
        return [] as Array<{ id: string; name?: string | null; role?: string | null }>;
      }),
      firstValueFrom(
        this.apiRpc
          .send<{ items?: unknown[]; skills?: unknown[] }>('agents.effectiveSkillSnapshots', {
            companyId,
            actor: this.workerActor(),
            /** API `AgentsIdRpcDto` 字段名为 `id`，误用 `agentId` 会导致校验失败（Validation error）。 */
            id: agentId,
            forceRefresh: Boolean(options?.forceRefresh),
            includeMarket: true,
          } as Record<string, unknown>)
          .pipe(timeout(rpcTimeoutMs)),
      ).catch((e: unknown) => {
        this.logger.warn(`${COLLAB_LLM_TRACE} | group_chat.reply_facts_skill_snapshots_failed`, {
          companyId,
          agentId,
          message: this.formatError(e),
        });
        return { items: [] };
      }),
      this.ceoLayerConfigResolver
        .resolveLayerSetting(companyId, 'replay')
        .catch(() => null as Record<string, unknown> | null),
    ]);
    const items = Array.isArray(agentRows) ? agentRows : [];
    const roster = items.map((a) => ({
      id: String(a?.id ?? '').trim(),
      name: String(a?.name ?? '').trim() || null,
      role: String(a?.role ?? '').trim() || null,
    }));
    const l1Targets = Array.isArray(l1DecisionContext?.targetAgentIds)
      ? l1DecisionContext.targetAgentIds.filter((x) => Boolean(String(x ?? '').trim()))
      : [];
    const agentRosterBrief: any = {
      total: roster.length,
      agents: roster.slice(0, 48),
      l1TargetAgentIds: l1Targets,
      l1WaitingForAgentIds: Array.isArray(l1DecisionContext?.waitingForAgentIds)
        ? l1DecisionContext.waitingForAgentIds
        : [],
    };
    const ceoLayerConfig: any = lightLayerSetting ?? {};
    const vectorNamespace = this.resolveLayerNamespace(
      companyId,
      'replay',
      (lightLayerSetting ?? null) as LayerSettingLite | null,
    );
    const snapAny = skillSnapshots as any;
    const snapList = Array.isArray(snapAny?.skills)
      ? (snapAny.skills as any[])
      : Array.isArray(snapAny?.items)
        ? (snapAny.items as any[])
        : [];
    const governanceBrief = (() => {
      // Conservative summary: pick the strictest caps among effective skills (min of non-null).
      const mins: Record<string, number> = {};
      const takeMin = (k: string, v: unknown) => {
        if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return;
        const n = Math.floor(v);
        mins[k] = mins[k] ? Math.min(mins[k], n) : n;
      };
      for (const s of snapList) {
        takeMin('maxInputTokens', (s as any)?.maxInputTokens);
        takeMin('maxOutputTokens', (s as any)?.maxOutputTokens);
        takeMin('maxInputSizeBytes', (s as any)?.maxInputSizeBytes);
        takeMin('timeoutSeconds', (s as any)?.timeoutSeconds);
      }
      const parts: string[] = [];
      if (mins.maxInputTokens) parts.push(`maxInputTokens<=${mins.maxInputTokens}`);
      if (mins.maxOutputTokens) parts.push(`maxOutputTokens<=${mins.maxOutputTokens}`);
      if (mins.maxInputSizeBytes) parts.push(`maxInputSizeBytes<=${mins.maxInputSizeBytes}`);
      if (mins.timeoutSeconds) parts.push(`timeoutSeconds<=${mins.timeoutSeconds}`);
      return parts.length ? parts.join(', ') : '';
    })();
    const skillCatalog = snapList.map((s) => toSkillCatalogEntry(s as SkillToolSnapshot));
    return {
      companyName: String(companyRow?.name ?? '').trim(),
      agentRosterBrief,
      skillCatalog,
      skillGovernanceBrief: governanceBrief ? governanceBrief : null,
      ceoLayerConfig,
      vectorNamespace,
    };
  }

  /**
   * 直聊/多 Agent 回复：一次拉齐 L1 文本块 + 成员 + 混合检索。
   *
   * **auxiliarySystemText 拼接顺序（稳定契约）**
   *
   * 1. `directSummonPreface`：预留；当前无独立文案时不占行。
   * 2. 人类身份 → 对话状态
   * 3. L1 决策复用 → 2026.1 unified intent
   * 4. Reply Facts
   * 5. 【公司画像】→ 6.【最近对话】（仅主群召唤 Agent：`directSummonOptions.isDirectSummoned` 且
   *    `routingHints.targetAgentIds` 非空，由 Direct Reply 层注入）
   * 7. 原有多 section 公司档案（与 5 去重）→ 成员 → memory.search 等
   *
   * 非召唤路径与旧行为完全一致（条件分支外零额外 RPC）。
   */
  async buildAuxiliaryContextForReply(params: {
    companyId: string;
    roomId: string;
    agentId?: string;
    projectId?: string | null;
    threadId?: string | null;
    latestUserText: string;
    excludeMessageId: string;
    timeoutMs: number;
    ceoContext?: CeoV2Layer;
    enableMemoryRetrieval?: boolean;
    companyProfileSections?: string[];
    /** 已知的人类发送者时传入，避免重复 messages.get；L3/supervision 路径可与 excludeMessageId 二选一 */
    humanUserId?: string | null;
    /** 当前回复目标是否为 CEO（false 且未开 env 开关时不注入人类身份） */
    replyingToCeo?: boolean;
    /** 优先复用 L1 决策上下文，避免 L2 重复构建 */
    l1DecisionContext?: ExtendedL1DecisionContext;
    /** P1.2：IntentLayer 2026.1 SSOT，直聊/直连回复 auxiliary 注入 */
    intentDecision2026_1?: CollaborationIntentDecisionV20261;
    /**
     * P2.2：由 MemoryContextAssembler 在 `routingHints.targetAgentIds` 非空时置位。
     * 本方法再次与 `intentDecision2026_1` 交叉校验，防止误标导致注入。
     */
    directSummonOptions?: {
      isDirectSummoned?: boolean;
      targetAgentId?: string;
    };
    /** P0：主群 @ 列表（与 CEO id 配合判断公司级召唤，auxiliary hint） */
    mentionedAgentIds?: string[];
    ceoAgentId?: string | null;
    /** Phase 3.6：复用主群 lead `retrieveBeforeIntent` 命中，跳过 auxiliary 内二次 `memory.search` */
    reuseLeadCollaborationMemorySearch?: boolean;
    leadCollaborationMemoryHits?: MemorySearchResult[];
    /** `retrieveBeforeIntent` 的 promptContext 快照；与 Intent 路由输入对齐，供直连 replay auxiliary 注入 */
    intentPhaseLeadPromptContext?: string | null;
    /** Context Grounding Planner 产出：门控成员块等 auxiliary 注入 */
    contextGroundingPlan?: ContextGroundingPlan | null;
  }): Promise<{
    transcript: BaseMessage[];
    auxiliarySystemText: string;
    memoryEntryIds: string[];
    memoryReferences: MemoryReference[];
    companyProfileMeta?: CompanyProfileLoadMeta;
    /** 与 buildHumanIdentityPack.telemetryLabel 一致，供 L2 等在异步边界外设置 foundry.human_identity */
    humanIdentityTelemetry?: string | null;
  }> {
    const l1DecisionContext = params.l1DecisionContext;
    if (!l1DecisionContext && process.env.NODE_ENV === 'production') {
      this.logger.warn('L2 called without L1DecisionContext - performance degradation expected');
    }
    /** 默认 replay：主群对用户回复上下文：显式传 orchestration/strategy/supervision 时再走执行向配置。 */
    const ctx: CeoV2Layer = params.ceoContext ?? 'replay';
    const layer = (await this.ceoLayerConfigResolver
      .resolveLayerSetting(params.companyId, ctx)
      .catch(() => null)) as LayerSettingLite | null;
    const lightCfg = await this.ceoLayerConfigResolver
      .getConfig(params.companyId, ctx)
      .then((c) => c?.enableMemoryRetrieval)
      .catch(() => null);

    const configuredHist =
      layer && typeof (layer as any).historyMessagesLimit === 'number'
        ? (layer as any).historyMessagesLimit
        : null;
    const histLimit = Number.isFinite(configuredHist)
      ? Math.max(0, Math.floor(configuredHist as number))
      : this.config.getCollabDirectReplyHistoryLimit() ?? 12;

    // 2026 hardening：当前 `ctx` 层（默认 orchestration；直连组装传入 replay）的 enableMemoryRetrieval 优先。
    const shouldRetrieve =
      typeof lightCfg === 'boolean' ? lightCfg : (params.enableMemoryRetrieval ?? true);
    const retrievalOn = this.config.isGroupChatMemoryRetrievalEnabled() && shouldRetrieve;
    const topK = this.config.getGroupChatMemoryRetrievalTopK();
    const layerNamespace = this.resolveLayerNamespace(params.companyId, ctx, layer);
    const memNsResolved = await this.resolveMemoryNamespacesForReply({
      companyId: params.companyId,
      agentId: params.agentId,
      ceoContext: ctx,
      layerNamespace,
      timeoutMs: params.timeoutMs,
    });

    const unifiedTargetAgentIds = params.intentDecision2026_1?.routingHints?.targetAgentIds;
    const intentIsDirectSummon = Array.isArray(unifiedTargetAgentIds) && unifiedTargetAgentIds.length > 0;
    const isDirectSummoned =
      Boolean(params.directSummonOptions?.isDirectSummoned) && intentIsDirectSummon;

    let injectCfg: DirectAgentMemoryInjectConfig | null = null;
    /** P2.2 收口：召唤路径统一前言，约束模型勿复读卡片、勿偏离用户当前一句 */
    const rawPeerIds = params.intentDecision2026_1?.routingHints?.targetAgentIds;
    const peerSummonCount =
      isDirectSummoned && Array.isArray(rawPeerIds)
        ? new Set(rawPeerIds.map((id) => String(id ?? '').trim()).filter(Boolean)).size
        : 0;
    const directSummonPrefaceBlock = isDirectSummoned
      ? [
          '【直聊任务】',
          '你被人类点名回应本条消息。下文为公司画像/节选对话等辅助信息（勿对用户完整朗读）。',
          '请优先理解用户当前一句并直接作答；仅在必要时引用摘要中的事实。',
          peerSummonCount > 1
            ? '【多同事同轮】本轮多人被同时点名：只代表你自己作答；勿向他人发号施令或复述「请依次介绍」类主持话术。'
            : '',
        ]
          .filter(Boolean)
          .join('\n')
      : '';
    let directSummonCompanyBlock = '';
    let directSummonTranscriptBlock = '';
    if (isDirectSummoned) {
      injectCfg = await this.ceoLayerConfigResolver.getDirectAgentMemoryInjectConfig(params.companyId).catch(() => ({
        injectCompanyProfile: this.config.getWorkerDirectAgentDefaultInjectCompanyProfile(),
        injectRecentTranscript: this.config.getWorkerDirectAgentDefaultInjectRecentTranscript(),
        transcriptMessageCount: this.config.getWorkerDirectAgentTranscriptMessageCount(),
      }));
      const [prof, trans] = await Promise.all([
        injectCfg.injectCompanyProfile
          ? this.buildDirectSummonCompanyProfilePreface({
              companyId: params.companyId,
              timeoutMs: params.timeoutMs,
              ceoContext: ctx,
            })
          : Promise.resolve(''),
        injectCfg.injectRecentTranscript
          ? this.buildDirectSummonRecentTranscriptPreface({
              companyId: params.companyId,
              roomId: params.roomId,
              threadId: params.threadId ?? null,
              messageCount: injectCfg.transcriptMessageCount,
              timeoutMs: params.timeoutMs,
            })
          : Promise.resolve(''),
      ]);
      directSummonCompanyBlock = String(prof ?? '').trim();
      directSummonTranscriptBlock = String(trans ?? '').trim();
    }

    /** 闲聊中带目标/计划：注入轻量规划衔接（非 L1 工具链，仅提示模型语气与收口） */
    const planningContinuityBlock =
      isDirectSummoned && userMessageSuggestsPlanningContinuity(params.latestUserText)
        ? [
            '【规划衔接提示（轻量）】',
            '用户本轮表述涉及目标、计划或里程碑。请先直接回应其具体问题；可在答复末尾自然邀请补充范围（时间线、部门、约束）。',
            '无需仅为「顺带提到规划」而调用工具；若用户明确要求查数、名单或外部事实再使用工具。',
          ].join('\n')
        : '';

    const l1Context = l1DecisionContext;
    const transcriptSummary = String(l1Context?.transcriptSummary ?? '').trim();
    const transcript =
      transcriptSummary.length > 0
        ? [
            new HumanMessage(`L1 transcript summary:\n${GroupChatContextService.clipText(transcriptSummary, 3600)}`),
            // Keep a short raw tail to preserve referents like "them/that/this" in follow-up turns.
            ...(
              await this.loadTranscriptMessages({
                companyId: params.companyId,
                roomId: params.roomId,
                threadId: params.threadId ?? null,
                excludeMessageId: params.excludeMessageId,
                maxMessages: Math.max(2, Math.min(histLimit > 0 ? histLimit : 4, 6)),
                timeoutMs: params.timeoutMs,
              })
            ),
          ]
        : histLimit > 0
          ? await this.loadTranscriptMessages({
              companyId: params.companyId,
              roomId: params.roomId,
              threadId: params.threadId ?? null,
              excludeMessageId: params.excludeMessageId,
              maxMessages: histLimit,
              timeoutMs: params.timeoutMs,
            })
          : [];

    const sections =
      isDirectSummoned && injectCfg?.injectCompanyProfile
        ? ([] as string[])
        : Array.isArray(params.companyProfileSections) && params.companyProfileSections.length
          ? [...new Set(params.companyProfileSections.map((s) => String(s || '').trim()).filter(Boolean))].slice(0, 3)
          : ['overview'];

    const injectMembersBlock = planIncludesBlock(params.contextGroundingPlan, 'room_roster');
    const [companyProfilePacks, membersBlock, memPack, replyFacts] = await Promise.all([
      Promise.all(
        sections.map((section) =>
          this.loadCompanyProfileWithMeta({
            companyId: params.companyId,
            timeoutMs: params.timeoutMs,
            section,
            ceoContext: ctx,
          }),
        ),
      ),
      injectMembersBlock
        ? this.buildRoomMembersBlock({
            companyId: params.companyId,
            roomId: params.roomId,
            timeoutMs: params.timeoutMs,
          })
        : Promise.resolve(''),
      retrievalOn
        ? params.reuseLeadCollaborationMemorySearch === true && params.leadCollaborationMemoryHits !== undefined
          ? Promise.resolve(this.formatLeadCollaborationMemoryHitsAsRetrievalPack(params.leadCollaborationMemoryHits))
          : this.buildRetrievedMemoryBlock({
              companyId: params.companyId,
              roomId: params.roomId,
              agentId: params.agentId,
              projectId: params.projectId,
              query: params.latestUserText,
              timeoutMs: params.timeoutMs,
              topK,
              namespaces: memNsResolved.namespaces,
              organizationNodeId: memNsResolved.departmentOrganizationNodeId,
            })
        : Promise.resolve({ block: '', entryIds: [] as string[], memoryReferences: [] as MemoryReference[] }),
      this.getOrBuildReplyFacts(
        params.companyId,
        String(params.agentId ?? '').trim(),
        l1Context,
      ).catch(() => ({
        companyName: '',
        agentRosterBrief: null,
        skillCatalog: [],
        ceoLayerConfig: null,
        vectorNamespace: layerNamespace,
      })),
    ]);

    const leadCtxRaw = String(params.intentPhaseLeadPromptContext ?? '').trim();
    const memBlockTrim = String(memPack.block ?? '').trim();
    const reuseLeadPack =
      params.reuseLeadCollaborationMemorySearch === true &&
      params.leadCollaborationMemoryHits !== undefined;
    const intentPhaseAuxBlock =
      leadCtxRaw && (!reuseLeadPack || !memBlockTrim)
        ? `【Intent前记忆横切（与 Intent 路由前 retrieveBeforeIntent 一致；勿对用户宣读）】\n${GroupChatContextService.clipText(leadCtxRaw, 6000)}`
        : '';

    const profileBlocks = companyProfilePacks.map((p) => p.block);
    const meta0 = companyProfilePacks[0]?.meta;

    let humanIdentityBlock = '';
    let humanIdentityTelemetry: string | null = null;
    let conversationStateBlock = '';
    const injectHuman =
      (ctx === 'orchestration' || ctx === 'supervision') &&
      this.shouldInjectHumanIdentityForDirectReply(params.replyingToCeo);
    if (injectHuman) {
      if (l1Context?.humanIdentityDigest) {
        const digest = l1Context.humanIdentityDigest as any;
        humanIdentityBlock = String(digest?.block ?? '').trim();
        humanIdentityTelemetry = String(digest?.telemetryLabel ?? '').trim() || null;
      }
    }
    if (injectHuman && !humanIdentityBlock) {
      const uid =
        (params.humanUserId && String(params.humanUserId).trim()) ||
        (await this.resolveHumanUserIdFromTriggerMessage(
          params.companyId,
          params.excludeMessageId,
          params.timeoutMs,
        ));
      if (uid) {
        try {
          const pack = await this.buildHumanIdentityPack({
            companyId: params.companyId,
            roomId: params.roomId,
            userId: uid,
            timeoutMs: params.timeoutMs,
            traceMessageId: params.excludeMessageId,
          });
          humanIdentityBlock = pack.block;
          humanIdentityTelemetry = pack.telemetryLabel ? pack.telemetryLabel : null;
          if (!humanIdentityBlock.trim()) {
            this.logger.warn(`${COLLAB_LLM_TRACE} | group_chat.auxiliary_identity_empty`, {
              companyId: params.companyId,
              roomId: params.roomId,
              ceoContext: ctx,
              replyingToCeo: params.replyingToCeo ?? null,
              userId: uid,
              traceMessageId: params.excludeMessageId,
            });
          } else {
            this.logger.debug(`${COLLAB_LLM_TRACE} | group_chat.auxiliary_identity_prepended`, {
              companyId: params.companyId,
              roomId: params.roomId,
              ceoContext: ctx,
              replyingToCeo: params.replyingToCeo ?? null,
              telemetryLabel: pack.telemetryLabel,
              blockChars: humanIdentityBlock.length,
            });
          }
        } catch (e: unknown) {
          // 防御性降级：身份构建失败不影响回复（避免由于 RPC 抖动导致 CEO/Agent 无法回应）。
          this.logger.warn(`${COLLAB_LLM_TRACE} | group_chat.auxiliary_identity_failed`, {
            companyId: params.companyId,
            roomId: params.roomId,
            ceoContext: ctx,
            replyingToCeo: params.replyingToCeo ?? null,
            userId: uid,
            traceMessageId: params.excludeMessageId,
            message: this.formatError(e),
          });
        }
      }
    }

    // conversation state injection (L2/L3 consistency): place right after humanIdentityBlock.
    // buildConversationStateBlock is production-hardened (hint → memory restore → heuristic) and never blocks.
    try {
      const pack = await this.buildConversationStateBlock({
        companyId: params.companyId,
        roomId: params.roomId,
        threadId: params.threadId ?? null,
        timeoutMs: params.timeoutMs,
        hintWaitingForAgentIds: Array.isArray(l1Context?.waitingForAgentIds) ? l1Context?.waitingForAgentIds : undefined,
      });
      conversationStateBlock = (pack.block ?? '').trim();
    } catch (e: unknown) {
      this.logger.warn(`${COLLAB_LLM_TRACE} | group_chat.auxiliary_conversation_state_failed`, {
        companyId: params.companyId,
        roomId: params.roomId,
        ceoContext: ctx,
        message: this.formatError(e),
      });
      conversationStateBlock = '';
    }

    const l1DecisionBlock = l1Context
      ? [
          '【L1决策上下文复用】',
          `mentionRoute=${String(l1Context.mentionRoute ?? '').trim() || 'unknown'}`,
          `replyMode=${l1Context.replyMode}`,
          `needsApproval=${String(Boolean(l1Context.needsApproval))}`,
          Array.isArray(l1Context.targetAgentIds) && l1Context.targetAgentIds.length
            ? `targetAgentIds=${l1Context.targetAgentIds.join(',')}`
            : '',
          l1Context.classifierContextBrief
            ? `classifierContextBrief=${GroupChatContextService.clipText(l1Context.classifierContextBrief, 800)}`
            : '',
        ]
          .filter(Boolean)
          .join('\n')
      : '';
    const u = params.intentDecision2026_1;
    const unifiedRouting = u?.routingHints as {
      shouldExecute: boolean;
      riskLevel: string;
      targetAgentIds?: string[];
    };
    const rh = u?.routingHints as { explicitDirectTargets?: boolean; targetAgentIds?: string[] } | undefined;
    const mentionIds = (params.mentionedAgentIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean);
    const ceoId = String(params.ceoAgentId ?? '').trim();
    const companyLevelMentionOnly =
      mentionIds.length > 0 && mentionIds.some((id) => !ceoId || id !== ceoId);
    const summonSurfaceHint =
      (Array.isArray(rh?.targetAgentIds) && rh!.targetAgentIds!.length > 0) ||
      Boolean(rh?.explicitDirectTargets) ||
      companyLevelMentionOnly;
    /** P0：quick / 召唤面永不依赖画像问卷；与编排层删除强制追问模板对齐（仍可用 COLLAB_PROFILE_FOLLOWUP_SUPPRESS_QUICK 收窄其它策略位） */
    const suppressProfileFollowupHint =
      isCeoAudienceIntentType(u?.intentType) ||
      summonSurfaceHint ||
      (this.config.isCollabProfileFollowupSuppressQuick() && Boolean(params.directSummonOptions?.isDirectSummoned))
        ? 'orchestrationPolicyHint=suppress_profile_followup_p0_paths'
        : '';
    const unifiedIntent2026Block = u
      ? [
          '【2026.1 统一意图（Pipeline SSOT）】',
          `intentType=${u.intentType}`,
          `confidence=${u.confidence}`,
          `shouldExecute=${String(Boolean(unifiedRouting?.shouldExecute))}`,
          `riskLevel=${unifiedRouting?.riskLevel ?? ''}`,
          Array.isArray(unifiedRouting?.targetAgentIds) && unifiedRouting.targetAgentIds.length
            ? `targetAgentIds=${unifiedRouting.targetAgentIds.join(',')}`
            : '',
          u.explanation ? `explanation=${GroupChatContextService.clipText(u.explanation, 640)}` : '',
          suppressProfileFollowupHint,
        ]
          .filter(Boolean)
          .join('\n')
      : '';
    const factsBlock = [
      '【Reply Facts】',
      replyFacts.companyName ? `companyName=${replyFacts.companyName}` : '',
      replyFacts.vectorNamespace ? `vectorNamespace=${replyFacts.vectorNamespace}` : '',
      replyFacts.ceoLayerConfig ? `ceoLayerConfig=${JSON.stringify(replyFacts.ceoLayerConfig).slice(0, 1200)}` : '',
      replyFacts.agentRosterBrief ? `agentRosterBrief=${JSON.stringify(replyFacts.agentRosterBrief).slice(0, 1600)}` : '',
      Array.isArray(replyFacts.skillCatalog) && replyFacts.skillCatalog.length
        ? `skillCatalog=${JSON.stringify(replyFacts.skillCatalog.slice(0, 24)).slice(0, 2000)}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
    const parts = [
      ...(directSummonPrefaceBlock.trim() ? [directSummonPrefaceBlock.trim()] : []),
      humanIdentityBlock,
      conversationStateBlock,
      l1DecisionBlock,
      unifiedIntent2026Block,
      ...(planningContinuityBlock.trim() ? [planningContinuityBlock.trim()] : []),
      factsBlock,
      ...(directSummonCompanyBlock ? [directSummonCompanyBlock] : []),
      ...(directSummonTranscriptBlock ? [directSummonTranscriptBlock] : []),
      ...profileBlocks,
      membersBlock,
      ...(intentPhaseAuxBlock ? [intentPhaseAuxBlock] : []),
      memPack.block,
    ].filter((p) => Boolean(p && String(p).trim().length > 0));
    return {
      transcript,
      auxiliarySystemText: parts.join('\n\n'),
      memoryEntryIds: memPack.entryIds,
      memoryReferences: memPack.memoryReferences ?? [],
      companyProfileMeta: meta0,
      humanIdentityTelemetry,
    };
  }

  /**
   * 讨论模式 CEO 纪要：扁平 transcript + 检索块。
   */
  async buildDiscussionDigestInput(params: {
    companyId: string;
    roomId: string;
    agentId?: string;
    projectId?: string | null;
    threadId?: string | null;
    anchorContent: string;
    timeoutMs: number;
    ceoContext?: CeoV2Layer;
    /** 用于解析人类发言者（当前回合 / 触发消息的 message id，SSOT 命名） */
    turnMessageId?: string | null;
    /** @deprecated 请使用 `turnMessageId` */
    triggerMessageId?: string | null;
    humanUserId?: string | null;
  }): Promise<{ combinedHumanText: string; memoryEntryIds: string[]; memoryReferences: MemoryReference[] }> {
    const ctx: CeoV2Layer = params.ceoContext ?? 'supervision';
    const layer = (await this.ceoLayerConfigResolver
      .resolveLayerSetting(params.companyId, ctx)
      .catch(() => null)) as LayerSettingLite | null;
    const layerNamespace = this.resolveLayerNamespace(params.companyId, ctx, layer);
    const retrievalOn = this.config.isGroupChatMemoryRetrievalEnabled();
    const topK = this.config.getGroupChatMemoryRetrievalTopK();
    const limit = this.config.getGroupChatDigestTranscriptLimit();
    const memNsResolved = await this.resolveMemoryNamespacesForReply({
      companyId: params.companyId,
      agentId: params.agentId,
      ceoContext: ctx,
      layerNamespace,
      timeoutMs: params.timeoutMs,
    });

    const [flat, memPack] = await Promise.all([
      this.loadTranscriptFlattened({
        companyId: params.companyId,
        roomId: params.roomId,
        threadId: params.threadId ?? null,
        limit,
        timeoutMs: params.timeoutMs,
      }),
      retrievalOn
        ? this.buildRetrievedMemoryBlock({
            companyId: params.companyId,
            roomId: params.roomId,
            agentId: params.agentId,
            projectId: params.projectId,
            query: params.anchorContent,
            timeoutMs: params.timeoutMs,
            topK,
            namespaces: memNsResolved.namespaces,
            organizationNodeId: memNsResolved.departmentOrganizationNodeId,
          })
        : Promise.resolve({ block: '', entryIds: [] as string[], memoryReferences: [] as MemoryReference[] }),
    ]);

    let humanBlock = '';
    let digestIdentityTelemetry: string | null = null;
    if (ctx === 'supervision' || ctx === 'orchestration') {
      const hid = (params.humanUserId ?? '').trim();
      const tid = (params.turnMessageId ?? params.triggerMessageId ?? '').trim();
      const applyIdentityPack = (p: { block: string; telemetryLabel: string }) => {
        humanBlock = p.block;
        digestIdentityTelemetry = p.telemetryLabel ? p.telemetryLabel : null;
      };
      // supervision 讨论 digest：优先显式 humanUserId（与流水线 humanSenderId 对齐），否则从触发消息解析。
      try {
        if (ctx === 'supervision' && hid && !tid) {
          applyIdentityPack(
            await this.buildHumanIdentityPack({
              companyId: params.companyId,
              roomId: params.roomId,
              userId: hid,
              timeoutMs: params.timeoutMs,
              traceMessageId: undefined,
            }),
          );
        } else if (tid) {
          applyIdentityPack(
            await this.buildHumanIdentityPackForTriggerMessage({
              companyId: params.companyId,
              roomId: params.roomId,
              messageId: tid,
              timeoutMs: params.timeoutMs,
              humanUserId: hid || undefined,
            }),
          );
        } else if (hid) {
          applyIdentityPack(
            await this.buildHumanIdentityPack({
              companyId: params.companyId,
              roomId: params.roomId,
              userId: hid,
              timeoutMs: params.timeoutMs,
              traceMessageId: undefined,
            }),
          );
        }
        if (humanBlock && humanBlock.trim()) {
          this.logger.debug(`${COLLAB_LLM_TRACE} | group_chat.discussion_digest_identity_prepended`, {
            companyId: params.companyId,
            roomId: params.roomId,
            ceoContext: ctx,
            hasTriggerMessageId: Boolean(tid),
            hasHumanUserId: Boolean(hid),
            telemetryLabel: digestIdentityTelemetry,
            blockChars: humanBlock.length,
          });
        } else if ((hid || tid) && humanBlock === '') {
          this.logger.warn(`${COLLAB_LLM_TRACE} | group_chat.discussion_digest_identity_empty`, {
            companyId: params.companyId,
            roomId: params.roomId,
            ceoContext: ctx,
            hasTriggerMessageId: Boolean(tid),
            hasHumanUserId: Boolean(hid),
          });
        }
      } catch (e: unknown) {
        // 防御性降级：digest 不应因身份构建失败而阻断合并/纪要。
        this.logger.warn(`${COLLAB_LLM_TRACE} | group_chat.discussion_digest_identity_failed`, {
          companyId: params.companyId,
          roomId: params.roomId,
          ceoContext: ctx,
          hasTriggerMessageId: Boolean(tid),
          hasHumanUserId: Boolean(hid),
          message: this.formatError(e),
        });
      }
    }

    const combined = [humanBlock, memPack.block, '--- 近期消息 ---', flat]
      .filter((s) => s.trim().length > 0)
      .join('\n')
      .slice(0, 12_000);

    return {
      combinedHumanText: combined,
      memoryEntryIds: memPack.entryIds,
      memoryReferences: memPack.memoryReferences ?? [],
    };
  }

  /** P2.2：命中画像后的轻量异步 sync（不 await，不阻断回复） */
  private fireLightCompanyProfileSync(companyId: string, timeoutMs: number): void {
    try {
      void firstValueFrom(
        this.apiRpc
          .send('memory.companyProfile.sync', {
            companyId,
            actor: this.workerActor(),
          } as Record<string, unknown>)
          .pipe(timeout(Math.min(4000, Math.max(800, timeoutMs)))),
      ).catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  /**
   * P2.2：召唤路径专用【公司画像】——底层仍走 `loadCompanyProfileWithMeta`（命中后 `void` 轻量 sync）。
   * 失败仅 metric + debug，不抛错。
   */
  private async buildDirectSummonCompanyProfilePreface(params: {
    companyId: string;
    timeoutMs: number;
    ceoContext: CeoV2Layer;
  }): Promise<string> {
    try {
      const pack = await this.loadCompanyProfileWithMeta({
        companyId: params.companyId,
        timeoutMs: params.timeoutMs,
        section: 'overview',
        ceoContext: params.ceoContext,
      });
      let body = (pack.block ?? '').trim();
      body = body.replace(/^【公司档案（[^】]*）】\s*\n?/, '').trim();
      body = body.replace(/\n?（generatedAt=[^）]*）\s*$/i, '').trim();
      const clipped = GroupChatContextService.clipText(body, 720);
      const rendered = clipped
        ? [
            '【公司画像 — 直聊摘要】',
            '以下为与公司相关的极简摘要，便于承接话题（勿对用户复述全文）：',
            '若与用户问题无关可忽略本块。',
            clipped,
          ].join('\n')
        : '';

      let status: 'hit' | 'miss' | 'failed' = 'miss';
      if (pack.meta.status === 'fetch_failed') {
        status = 'failed';
      } else if (pack.meta.status === 'hit') {
        status = rendered ? 'hit' : 'miss';
        if (status === 'hit') {
          this.fireLightCompanyProfileSync(params.companyId, params.timeoutMs);
        }
      } else if (pack.meta.status === 'missing') {
        status = 'miss';
      }
      this.monitoring?.incCollaborationDirectAgentMemoryInject({ type: 'company_profile', status });

      return rendered;
    } catch (e: unknown) {
      this.monitoring?.incCollaborationDirectAgentMemoryInject({ type: 'company_profile', status: 'failed' });
      this.logger.debug(`${COLLAB_LLM_TRACE} | group_chat.direct_summon_company_profile_failed`, {
        companyId: params.companyId,
        message: this.formatError(e),
      });
      return '';
    }
  }

  /**
   * P2.2：`collaboration.messages.list` 最近 N 条，线程规则与本服务其它 transcript 一致；
   * 整块约 3500 字上限。
   */
  private async buildDirectSummonRecentTranscriptPreface(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    messageCount: number;
    timeoutMs: number;
  }): Promise<string> {
    return this.buildRecentRoomTranscriptDigest({
      ...params,
      guidanceLine:
        '以下为主群近期节选，仅用于理解指代；请聚焦用户当前一句，勿逐条复述历史：',
      telemetryReason: 'direct_summon',
    });
  }

  /**
   * CEO fast_path / `ceo.natural_reply`：与直连同源的主群节选，供「刚才说了什么」、指代消解。
   */
  async buildCeoReplayRecentTranscriptBlock(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    /** 排除当前轮用户消息，避免与【用户原话】/【用户问题】重复。 */
    excludeMessageId?: string | null;
    messageCount?: number;
    timeoutMs: number;
    /** 覆盖默认 1400：replay 上下文包等可传入更大预算。 */
    maxBodyChars?: number;
  }): Promise<string> {
    const n =
      typeof params.messageCount === 'number' && Number.isFinite(params.messageCount)
        ? params.messageCount
        : this.config.getWorkerDirectAgentTranscriptMessageCount();
    const excludeId = String(params.excludeMessageId ?? '').trim();
    return this.buildRecentRoomTranscriptDigest({
      companyId: params.companyId,
      roomId: params.roomId,
      threadId: params.threadId ?? null,
      messageCount: n,
      timeoutMs: params.timeoutMs,
      guidanceLine:
        '以下为主群近期节选，供理解对话上下文与用户追问（例如「刚才说了什么」「上文指什么」）；可简要复述用户前几轮要点：',
      telemetryReason: 'ceo_replay',
      maxBodyChars: params.maxBodyChars,
      excludeMessageIds: excludeId ? [excludeId] : undefined,
    });
  }

  /**
   * 主群 **Intent 受众路由** 专用节选：**人类与 agent 均收录**，agent 正文使用更短 `clip` 以抑制「列完人名/长篇介绍」对 `targetAgentIds` 的噪声，
   * 同时保留「谁在说话、是否只有 CEO 在回」等**对话流**信号，供路由模型与 `structuredRoomMemberDirectory` 联合判断（无服务端关键词兜底）。
   * CEO replay / directed 等路径仍用 {@link buildCeoReplayRecentTranscriptBlock} 等全量或更高预算节选。
   */
  async buildIntentAudienceRoutingTranscriptBlock(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    /** 当前用户本条消息 id：若在 list 中已可见则排除，避免「最后一条」误判为本句自身。 */
    excludeMessageId?: string | null;
    messageCount?: number;
    timeoutMs: number;
    maxBodyChars?: number;
  }): Promise<{ digest: string; recentTurnFacts: AudienceRoutingRecentTurnFacts }> {
    const n =
      typeof params.messageCount === 'number' && Number.isFinite(params.messageCount)
        ? params.messageCount
        : this.config.getWorkerDirectAgentTranscriptMessageCount();
    const excludeId = String(params.excludeMessageId ?? '').trim();
    const { rendered, recentTurnFacts } = await this.buildRecentRoomTranscriptDigestCore({
      companyId: params.companyId,
      roomId: params.roomId,
      threadId: params.threadId ?? null,
      messageCount: n,
      timeoutMs: params.timeoutMs,
      guidanceLine: [
        '以下为最近群内发言节选（人类与 agent 均可能出现；agent 单条正文已截断）。',
        '节选与 `conversationSignals.recentTurnFacts` 均由服务端从消息列表生成；路由仍由模型结合当前用户句与花名册决定。',
      ].join(''),
      telemetryReason: 'intent_audience_routing',
      maxBodyChars: params.maxBodyChars,
      bodyClipCharsHuman: 220,
      bodyClipCharsAgent: 140,
      excludeMessageIds: excludeId ? [excludeId] : undefined,
    });
    return { digest: rendered.trim(), recentTurnFacts: recentTurnFacts ?? {} };
  }

  private async buildRecentRoomTranscriptDigest(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    messageCount: number;
    timeoutMs: number;
    guidanceLine: string;
    telemetryReason: 'direct_summon' | 'ceo_replay' | 'intent_audience_routing';
    /** 节选正文上限（不含 `【最近对话 — 节选】` 与 guidance 行）；过小会削弱多轮指代。 */
    maxBodyChars?: number;
    /** 仅保留 `senderType=human` 的消息（其余路径默认 false；Intent 受众路由已改为全角色 + 分角色截断）。 */
    humanSenderTypesOnly?: boolean;
    /** human 消息单行正文最大字符（默认 220）。 */
    bodyClipCharsHuman?: number;
    /** 非 human（如 agent）消息单行正文最大字符；默认与 human 相同，Intent 路由传入更小的值以控噪声。 */
    bodyClipCharsAgent?: number;
    excludeMessageIds?: string[];
  }): Promise<string> {
    const { rendered } = await this.buildRecentRoomTranscriptDigestCore(params);
    return rendered;
  }

  private async buildRecentRoomTranscriptDigestCore(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    messageCount: number;
    timeoutMs: number;
    guidanceLine: string;
    telemetryReason: 'direct_summon' | 'ceo_replay' | 'intent_audience_routing';
    maxBodyChars?: number;
    humanSenderTypesOnly?: boolean;
    bodyClipCharsHuman?: number;
    bodyClipCharsAgent?: number;
    /** 从时间线移除这些消息 id（通常为本轮用户 messageId），再计算节选与 lastPersisted 事实。 */
    excludeMessageIds?: string[];
  }): Promise<{ rendered: string; recentTurnFacts?: AudienceRoutingRecentTurnFacts }> {
    const actor = this.workerActor();
    const n = Math.min(20, Math.max(4, Math.floor(params.messageCount)));
    const fetchLimit = Math.min(200, Math.max(n + 4, 16));
    try {
      const list = await firstValueFrom(
        this.apiRpc
          .send<{ items?: ChatListItem[] }>('collaboration.messages.list', {
            companyId: params.companyId,
            actor,
            roomId: params.roomId,
            limit: fetchLimit,
          } as Record<string, unknown>)
          .pipe(timeout(Math.max(500, Math.min(params.timeoutMs, 8000)))),
      );
      let items: ChatListItem[] = Array.isArray(list?.items) ? list!.items! : [];
      const tid = (params.threadId ?? '').trim();
      if (tid) {
        items = items.filter((m) => (m.threadId ?? null) === tid);
      } else {
        const mainOnly = items.filter((m) => m.threadId == null);
        items = mainOnly.length > 0 ? mainOnly : items;
      }
      const exclude = new Set(
        (params.excludeMessageIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean),
      );
      if (exclude.size > 0) {
        items = items.filter((m) => !exclude.has(String(m.id ?? '').trim()));
      }
      let pool = items;
      if (params.humanSenderTypesOnly === true) {
        pool = items.filter((m) => String(m.senderType ?? '').toLowerCase() === 'human');
      }

      let recentTurnFacts: AudienceRoutingRecentTurnFacts | undefined;
      if (params.telemetryReason === 'intent_audience_routing') {
        const last = pool.length > 0 ? pool[pool.length - 1] : undefined;
        if (last && String(last.id ?? '').trim()) {
          const sid = String(last.senderId ?? '').trim();
          recentTurnFacts = {
            lastPersistedRoomMessage: {
              messageId: String(last.id).trim(),
              senderType: String(last.senderType ?? 'unknown').trim(),
              senderId: sid.length > 0 ? sid : null,
              contentPreview: GroupChatContextService.clipText(last.content ?? '', 160),
            },
          };
        } else {
          recentTurnFacts = {};
        }
      }

      const defaultLineClip = 220;
      const humanClip = Math.max(40, Math.floor(params.bodyClipCharsHuman ?? defaultLineClip));
      const agentClip = Math.max(32, Math.floor(params.bodyClipCharsAgent ?? params.bodyClipCharsHuman ?? defaultLineClip));
      const slice = pool.slice(-n);
      const lines = slice
        .map((m) => {
          const role = (m.senderType ?? '?').trim();
          const st = String(m.senderType ?? '').toLowerCase();
          const clipLimit = st === 'human' ? humanClip : agentClip;
          const c = GroupChatContextService.clipText(m.content ?? '', clipLimit);
          return c ? `- ${role}: ${c}` : '';
        })
        .filter(Boolean);
      const body = lines.join('\n');
      const maxBody = Math.min(16_000, Math.max(400, Math.floor(params.maxBodyChars ?? 1400)));
      const clipped = GroupChatContextService.clipText(body, maxBody);
      const rendered = clipped
        ? ['【最近对话 — 节选】', params.guidanceLine, clipped].join('\n')
        : '';
      if (params.telemetryReason === 'direct_summon') {
        this.monitoring?.incCollaborationDirectAgentMemoryInject({
          type: 'transcript',
          status: rendered ? 'hit' : 'miss',
        });
      }
      return { rendered, recentTurnFacts };
    } catch (e: unknown) {
      if (params.telemetryReason === 'direct_summon') {
        this.monitoring?.incCollaborationDirectAgentMemoryInject({ type: 'transcript', status: 'failed' });
      }
      this.logger.debug(`${COLLAB_LLM_TRACE} | group_chat.recent_transcript_digest_failed`, {
        companyId: params.companyId,
        roomId: params.roomId,
        reason: params.telemetryReason,
        message: this.formatError(e),
      });
      return { rendered: '' };
    }
  }
}

/** 与 orchestration roster / DIRECT_FACT_ANSWER 共用：用户是否明确要求列出房间成员 */
