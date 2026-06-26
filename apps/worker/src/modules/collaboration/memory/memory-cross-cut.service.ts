import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import type { CollaborationHeartbeatCorrelationPayload } from '@contracts/events';
import { metrics, trace, SpanStatusCode } from '@opentelemetry/api';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../../common/config/config.service.js';
import { RedisCacheService } from '../../../common/cache/redis-cache.service.js';
import type { CollaborationExecutionContext } from '../context/collaboration-execution-context.js';
import { planIncludesBlock } from '../context/context-grounding-plan.js';
import { normalizeMemoryRetrievalSkipReason } from './memory-retrieval-skip-reason.js';

/** API `memory.search` 命中行（内部与 Graph 文档对齐）。 */
export type MemorySearchHit = {
  id?: string;
  content?: string;
  score?: number;
  namespace?: string;
};

/** 与 RoomContext.orgSnapshot.departments 对齐的最小切片（避免循环依赖 RoomContext）。 */
export type MemoryLayerRoomHint = {
  organizationNodeId: string | null;
  orgDepartments: Array<{ id: string; slug: string; name?: string }>;
};

@Injectable()
export class MemoryCrossCutService {
  private readonly logger = new Logger(MemoryCrossCutService.name);
  private readonly tracer = trace.getTracer('foundry.collaboration.memory');
  private readonly meter = metrics.getMeter('foundry.collaboration');
  private readonly readHitCounter = this.meter.createCounter('foundry.collaboration.memory.read.hit_total');
  private readonly readMissCounter = this.meter.createCounter('foundry.collaboration.memory.read.miss_total');
  private readonly writeCounter = this.meter.createCounter('foundry.collaboration.memory.write_total');
  private readonly readLatency = this.meter.createHistogram('foundry.collaboration.memory.read.latency_ms');
  private readonly memoryMeter = metrics.getMeter('foundry.memory');
  private readonly retrievalDuplicateSkipped = this.memoryMeter.createCounter('foundry.memory.retrieval.duplicate_skipped', {
    description: 'Skipped redundant memory.search within same trace',
  });
  private readonly retrievalDuplicateSkippedTotal = this.memoryMeter.createCounter(
    'foundry.memory.retrieval.duplicate_skipped_total',
    { description: 'Total skipped lead/auxiliary memory retrievals (no phase label; dashboard sum)' },
  );
  private readonly leadHitsCounter = this.memoryMeter.createCounter('foundry.memory.retrieval.lead_hits', {
    description: 'Lead retrieve_before_intent normalized hit count per completion',
  });
  private readonly traceMemoryByCompanyTrace = new Map<
    string,
    { hits: MemorySearchHit[]; promptContext: string; hitCount: number; expiresAt: number }
  >();

  constructor(
    private readonly config: ConfigService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
    private readonly redisCache: RedisCacheService,
  ) {}

  /**
   * Phase 3.6：按 companyId + traceId 复用 60s 内的 lead 检索结果；未命中时执行 `fetcher` 并写入缓存。
   */
  async getOrRetrieveForTrace(
    companyId: string,
    traceId: string,
    fetcher: () => Promise<{ hits: MemorySearchHit[]; promptContext: string; hitCount: number }>,
  ): Promise<{ hits: MemorySearchHit[]; promptContext: string; hitCount: number; duplicateSkipped: boolean }> {
    const cid = String(companyId ?? '').trim();
    const tid = String(traceId ?? '').trim();
    if (!cid || !tid || !this.config.isMemoryRetrievalDeduplicationEnabled()) {
      const v = await fetcher();
      return { ...v, duplicateSkipped: false };
    }
    const cacheKey = this.traceCacheKey(cid, tid);
    const now = Date.now();
    const row = this.traceMemoryByCompanyTrace.get(cacheKey);
    if (row && row.expiresAt > now) {
      this.bumpDuplicateSkipped('retrieve_before_intent_cache', tid, cid);
      return {
        hits: row.hits,
        promptContext: row.promptContext,
        hitCount: row.hitCount,
        duplicateSkipped: true,
      };
    }

    if (this.config.isMemoryRetrievalLeadRedisCacheEnabled()) {
      const fromRedis = await this.readLeadFromRedis(cid, tid);
      if (fromRedis) {
        this.traceMemoryByCompanyTrace.set(cacheKey, {
          hits: fromRedis.hits,
          promptContext: fromRedis.promptContext,
          hitCount: fromRedis.hitCount,
          expiresAt: now + 60_000,
        });
        this.bumpDuplicateSkipped('retrieve_before_intent_redis', tid, cid);
        return { ...fromRedis, duplicateSkipped: true };
      }
    }

    const fresh = await fetcher();
    this.traceMemoryByCompanyTrace.set(cacheKey, {
      hits: fresh.hits,
      promptContext: fresh.promptContext,
      hitCount: fresh.hitCount,
      expiresAt: now + 60_000,
    });
    void this.writeLeadToRedis(cid, tid, fresh);
    return { ...fresh, duplicateSkipped: false };
  }

  private traceCacheKey(companyId: string, traceId: string): string {
    return `${companyId}:${traceId}`;
  }

  private bumpDuplicateSkipped(phase: string, traceId?: string, companyId?: string): void {
    if (!this.config.isMemoryRetrievalDeduplicationEnabled()) return;
    this.retrievalDuplicateSkipped.add(1, { phase });
    this.retrievalDuplicateSkippedTotal.add(1);
    this.logger.log('memory.retrieval.skipped.duplicate', {
      skipReason: normalizeMemoryRetrievalSkipReason(phase),
      phase,
      ...(companyId ? { companyId } : {}),
      ...(traceId ? { traceId } : {}),
    });
  }

  private traceRedisKey(companyId: string, traceId: string): string {
    return `memory:trace:${String(companyId).trim()}:${String(traceId).trim()}`;
  }

  private async readLeadFromRedis(
    companyId: string,
    traceId: string,
  ): Promise<{ hits: MemorySearchHit[]; promptContext: string; hitCount: number } | null> {
    if (!this.config.isMemoryRetrievalLeadRedisCacheEnabled()) return null;
    try {
      const raw = await this.redisCache.get(this.traceRedisKey(companyId, traceId));
      if (!raw?.trim()) return null;
      const parsed = JSON.parse(raw) as {
        v?: number;
        hits?: MemorySearchHit[];
        promptContext?: string;
        hitCount?: number;
      };
      if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.hits)) return null;
      return {
        hits: parsed.hits,
        promptContext: String(parsed.promptContext ?? ''),
        hitCount: typeof parsed.hitCount === 'number' ? parsed.hitCount : 0,
      };
    } catch {
      return null;
    }
  }

  private async writeLeadToRedis(
    companyId: string,
    traceId: string,
    payload: { hits: MemorySearchHit[]; promptContext: string; hitCount: number },
  ): Promise<void> {
    if (!this.config.isMemoryRetrievalLeadRedisCacheEnabled()) return;
    const ttl = Math.max(1_000, Math.min(120_000, this.config.getMemoryRetrievalLeadRedisTtlMs()));
    try {
      await this.redisCache.setPx(
        this.traceRedisKey(companyId, traceId),
        JSON.stringify({
          v: 1,
          hits: payload.hits,
          promptContext: payload.promptContext,
          hitCount: payload.hitCount,
        }),
        ttl,
      );
    } catch {
      /* ignore */
    }
  }

  /** Phase 3.6：下游复用 lead 命中而跳过第二次 RPC 时打点（如 auxiliary）。 */
  recordRetrievalDuplicateSkipped(phase: string): void {
    this.bumpDuplicateSkipped(phase);
  }

  /**
   * Intent 前记忆横切：结构化成员目录（main room）与向量检索片段 **拼接为单一 promptContext**。
   * W4：可选 session / department / company 分层命名空间检索。
   * Phase 3.6：`MEMORY_RETRIEVAL_DEDUPLICATION_ENABLED` 时同一 traceId 命中进程缓存则不再发起 `memory.search`。
   */
  async retrieveBeforeIntent(params: {
    companyId: string;
    roomId: string;
    roomType: string;
    contentText: string;
    traceId: string;
    /** 2026：与 RoomContext.memberDirectory 对齐的权威名单切片 */
    roomMemberPromptBlock?: string | null;
    /** true：不在 promptContext 中重复 roster（userTurn JSON 已含 structuredRoomMemberDirectory） */
    skipRoster?: boolean;
    /** W4：组织节点 → 部门 slug，用于 `company:*:department:*` 检索 */
    layerRoomHint?: MemoryLayerRoomHint;
    /** Phase 3.6：写入共享执行上下文供 Direct Agent / auxiliary 复用 */
    collaborationExecutionContext?: CollaborationExecutionContext;
  }): Promise<{ promptContext: string; hitCount: number; memoryHits: MemorySearchHit[]; duplicateSkipped: boolean }> {
    return await this.tracer.startActiveSpan('foundry.collaboration.memory.retrieve_before_intent', async (span) => {
      const startedAt = Date.now();
      try {
        const layeredNs: string[] = [];
        if (this.config.isCollabMemoryLayeringEnabled()) {
          layeredNs.push(`company:${params.companyId}:session:${params.roomId}`);
          const slugs = this.resolveDepartmentSlugs(params.layerRoomHint, []);
          for (const s of slugs) {
            layeredNs.push(`company:${params.companyId}:department:${s}`);
          }
          layeredNs.push(`company:${params.companyId}:company`);
        }
        /** API `CompanyProfileService.syncCompanyProfile` 写入的命名空间（DB companies / organization_nodes 同步正文）。 */
        const canonicalCompanyProfileNs = 'company';
        const namespaces = [
          ...layeredNs,
          canonicalCompanyProfileNs,
          `company:${params.companyId}:collaboration:strategy`,
          `company:${params.companyId}:collaboration:orchestration`,
          `company:${params.companyId}:collaboration:supervision`,
          `company:${params.companyId}:room:${params.roomId}:collaboration`,
        ];
        const uniq = [...new Set(namespaces)];

        const fetchLead = async (): Promise<{ hits: MemorySearchHit[]; promptContext: string; hitCount: number }> => {
          const hits = await this.searchMemory(params.companyId, params.contentText, uniq, 8);
          const normalized = hits
            .map((h) => String(h?.content ?? '').trim())
            .filter(Boolean)
            .slice(0, 4);
          const hitCount = normalized.length;
          if (hitCount > 0) {
            this.readHitCounter.add(1, { roomType: params.roomType });
          } else {
            this.readMissCounter.add(1, { roomType: params.roomType });
          }
          const blocks: string[] = [];
          const roster = String(params.roomMemberPromptBlock ?? '').trim();
          const plan = params.collaborationExecutionContext?.contextGroundingPlan;
          const injectRoster =
            roster &&
            params.roomType === 'main' &&
            !params.skipRoster &&
            (plan ? planIncludesBlock(plan, 'room_roster') : false);
          if (injectRoster) {
            blocks.push(roster);
          }
          if (normalized.length) {
            blocks.push(
              `【Memory retrieval — collaboration namespaces】\n${normalized.map((x, i) => `${i + 1}. ${x.slice(0, 300)}`).join('\n')}`,
            );
          }
          const promptContext = blocks.join('\n\n').trim();
          return { hits, promptContext, hitCount };
        };

        const merged = await this.getOrRetrieveForTrace(params.companyId, params.traceId, fetchLead);
        this.readLatency.record(Date.now() - startedAt, { roomType: params.roomType });
        this.leadHitsCounter.add(Math.max(0, merged.hitCount), {
          duplicate_skipped: merged.duplicateSkipped ? 'true' : 'false',
        });

        const ctx = params.collaborationExecutionContext;
        if (ctx) {
          ctx.memoryHits = merged.hits.map((h) => ({ ...h }));
          ctx.retrievedAt = new Date();
          ctx.leadMemorySearchDone = true;
          ctx.traceId = params.traceId;
          const leadPc = String(merged.promptContext ?? '').trim();
          if (leadPc) {
            ctx.leadPromptContext = leadPc.length > 12_000 ? leadPc.slice(0, 12_000) : leadPc;
          } else {
            delete ctx.leadPromptContext;
          }
        }

        this.logger.log('foundry.collaboration.memory.retrieve_before_intent', {
          companyId: params.companyId,
          roomId: params.roomId,
          traceId: params.traceId,
          hitCount: merged.hitCount,
          layered: this.config.isCollabMemoryLayeringEnabled(),
          rosterInjected: Boolean(
            params.roomMemberPromptBlock &&
              params.roomType === 'main' &&
              !params.skipRoster &&
              String(params.roomMemberPromptBlock).trim(),
          ),
          duplicateSkipped: merged.duplicateSkipped,
        });
        span.setStatus({ code: SpanStatusCode.OK });
        return {
          promptContext: merged.promptContext,
          hitCount: merged.hitCount,
          memoryHits: merged.hits,
          duplicateSkipped: merged.duplicateSkipped,
        };
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
        this.readMissCounter.add(1, { roomType: params.roomType });
        return { promptContext: '', hitCount: 0, memoryHits: [], duplicateSkipped: false };
      } finally {
        span.end();
      }
    });
  }

  /**
   * Strategy 前 CEO 知识包：跨协作与公司命名空间的 Memory 检索，默认取 Top 3 条事实片段。
   */
  async retrieveTopCompanyFactsForCeoPack(params: {
    companyId: string;
    roomId: string;
    query: string;
    traceId: string;
    limit?: number;
    layerRoomHint?: MemoryLayerRoomHint;
  }): Promise<{ lines: string[] }> {
    const limit = Math.max(1, Math.min(6, params.limit ?? 3));
    const layered: string[] = [];
    if (this.config.isCollabMemoryLayeringEnabled()) {
      layered.push(`company:${params.companyId}:session:${params.roomId}`);
      for (const s of this.resolveDepartmentSlugs(params.layerRoomHint, [])) {
        layered.push(`company:${params.companyId}:department:${s}`);
      }
      layered.push(`company:${params.companyId}:company`);
    }
    const namespaces = [
      ...layered,
      'company',
      `company:${params.companyId}:collaboration:strategy`,
      `company:${params.companyId}:collaboration:orchestration`,
      `company:${params.companyId}:collaboration:supervision`,
      `company:${params.companyId}:room:${params.roomId}:collaboration`,
      `company:${params.companyId}:ceo`,
      `company:${params.companyId}:company`,
    ];
    try {
      const hits = await this.searchMemory(params.companyId, params.query, [...new Set(namespaces)], 12);
      const lines = hits
        .map((h) => String(h?.content ?? '').trim())
        .filter(Boolean)
        .slice(0, limit);
      this.logger.log('foundry.collaboration.memory.retrieve_ceo_pack_facts', {
        companyId: params.companyId,
        roomId: params.roomId,
        traceId: params.traceId,
        returned: lines.length,
      });
      return { lines };
    } catch (e) {
      this.logger.warn('foundry.collaboration.memory.retrieve_ceo_pack_facts_failed', {
        companyId: params.companyId,
        roomId: params.roomId,
        traceId: params.traceId,
        message: e instanceof Error ? e.message : String(e),
      });
      return { lines: [] };
    }
  }

  /**
   * Intent 分类完成后写入 session / company 轻量摘要（便于下一回合检索）。
   */
  /**
   * Phase 3.5：快速 handover 时 CEO 不在前台发言，仅在后台沉淀一条 handover 观测供 Memory Graph / 编排命名空间检索。
   */
  async persistCeoObservedDirectAgentHandover(params: {
    companyId: string;
    roomId: string;
    messageId: string;
    traceId: string;
    ceoAgentId: string;
    targetAgentId: string;
    userText: string;
    roomType: string;
    heartbeatCorrelation?: CollaborationHeartbeatCorrelationPayload;
  }): Promise<void> {
    if (!this.config.isCollabMemoryLayeringEnabled()) return;
    const text = `[handover] CEO_async_observe direct_agent target=${params.targetAgentId} ceo=${params.ceoAgentId} msg=${params.messageId} user="${String(params.userText).trim().slice(0, 400)}"`;
    const meta = this.corMetadata(
      {
        traceId: params.traceId,
        roomId: params.roomId,
        stage: 'direct_agent_handover',
        source: 'collaboration_pipeline',
        messageId: params.messageId,
      },
      params.heartbeatCorrelation,
    );
    try {
      await this.storeMemory(params.companyId, `company:${params.companyId}:collaboration:orchestration`, text, meta);
      await this.storeMemory(params.companyId, `company:${params.companyId}:session:${params.roomId}`, text, meta);
      this.writeCounter.add(2, { roomType: params.roomType, stage: 'handover' });
    } catch (e) {
      this.logger.warn('foundry.collaboration.memory.persist_direct_agent_handover_failed', {
        companyId: params.companyId,
        roomId: params.roomId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async persistAfterIntentClassified(params: {
    companyId: string;
    roomId: string;
    messageId: string;
    traceId: string;
    intentType: string;
    confidence: number;
    roomType: string;
    heartbeatCorrelation?: CollaborationHeartbeatCorrelationPayload;
  }): Promise<void> {
    if (!this.config.isCollabMemoryLayeringEnabled()) return;
    const text = `[intent] type=${params.intentType} conf=${params.confidence.toFixed(2)} msg=${params.messageId}`;
    const meta = this.corMetadata(
      {
        traceId: params.traceId,
        roomId: params.roomId,
        stage: 'intent_classified',
        source: 'collaboration_pipeline',
        messageId: params.messageId,
      },
      params.heartbeatCorrelation,
    );
    try {
      await this.storeMemory(params.companyId, `company:${params.companyId}:session:${params.roomId}`, text, meta);
      this.writeCounter.add(1, { roomType: params.roomType, stage: 'intent' });
    } catch (e) {
      this.logger.warn('foundry.collaboration.memory.persist_after_intent_failed', {
        companyId: params.companyId,
        roomId: params.roomId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /**
   * 主群/协作表面回复落地后写入 session 摘要（短文本），挂 heartbeatCorrelation。
   */
  async persistAfterSurfaceReply(params: {
    companyId: string;
    roomId: string;
    messageId: string;
    traceId: string;
    replyText: string;
    roomType: string;
    heartbeatCorrelation?: CollaborationHeartbeatCorrelationPayload;
  }): Promise<void> {
    if (!this.config.isCollabMemoryLayeringEnabled()) return;
    const text = String(params.replyText ?? '').trim().slice(0, 1800);
    if (!text) return;
    const meta = this.corMetadata(
      {
        traceId: params.traceId,
        roomId: params.roomId,
        stage: 'surface_reply',
        source: 'collaboration_pipeline',
        messageId: params.messageId,
      },
      params.heartbeatCorrelation,
    );
    try {
      await this.storeMemory(params.companyId, `company:${params.companyId}:session:${params.roomId}`, text, meta);
      this.writeCounter.add(1, { roomType: params.roomType, stage: 'reply' });
    } catch (e) {
      this.logger.warn('foundry.collaboration.memory.persist_after_reply_failed', {
        companyId: params.companyId,
        roomId: params.roomId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async persistAfterSupervision(params: {
    companyId: string;
    roomId: string;
    traceId: string;
    strategySummary: string;
    orchestrationSummary: string;
    supervisionSummary: string;
    roomType: string;
    messageId?: string;
    /** W4：与 orchestration 分发部门 slug 对齐，写入 dept 命名空间 */
    departmentSlugs?: string[];
    heartbeatCorrelation?: CollaborationHeartbeatCorrelationPayload;
    layerRoomHint?: MemoryLayerRoomHint;
  }): Promise<void> {
    await this.tracer.startActiveSpan('foundry.collaboration.memory.persist_after_supervision', async (span) => {
      try {
        const deptSlugs = this.resolveDepartmentSlugs(params.layerRoomHint, params.departmentSlugs);
        const hbMeta = (base: Record<string, unknown>) => this.corMetadata(base, params.heartbeatCorrelation);

        const promises: Promise<void>[] = [
          this.storeMemory(
            params.companyId,
            `company:${params.companyId}:collaboration:strategy`,
            params.strategySummary,
            hbMeta({
              traceId: params.traceId,
              roomId: params.roomId,
              stage: 'strategy',
              source: 'run_main_room_flow',
              messageId: params.messageId ?? null,
            }),
          ),
          this.storeMemory(
            params.companyId,
            `company:${params.companyId}:collaboration:orchestration`,
            params.orchestrationSummary,
            hbMeta({
              traceId: params.traceId,
              roomId: params.roomId,
              stage: 'orchestration',
              source: 'run_main_room_flow',
              messageId: params.messageId ?? null,
            }),
          ),
          this.storeMemory(
            params.companyId,
            `company:${params.companyId}:collaboration:supervision`,
            params.supervisionSummary,
            hbMeta({
              traceId: params.traceId,
              roomId: params.roomId,
              stage: 'supervision',
              source: 'run_main_room_flow',
              messageId: params.messageId ?? null,
            }),
          ),
          this.storeMemory(
            params.companyId,
            `company:${params.companyId}:room:${params.roomId}:collaboration`,
            [params.strategySummary, params.orchestrationSummary, params.supervisionSummary].join('\n'),
            hbMeta({
              traceId: params.traceId,
              roomId: params.roomId,
              stage: 'room_rollup',
              source: 'run_main_room_flow',
              messageId: params.messageId ?? null,
            }),
          ),
        ];

        let extraWrites = 0;
        if (this.config.isCollabMemoryLayeringEnabled()) {
          const rollup = [
            '[strategy]',
            params.strategySummary,
            '[orchestration]',
            params.orchestrationSummary,
            '[supervision]',
            params.supervisionSummary,
          ]
            .join('\n')
            .slice(0, 10_000);
          promises.push(
            this.storeMemory(
              params.companyId,
              `company:${params.companyId}:session:${params.roomId}`,
              rollup,
              hbMeta({
                traceId: params.traceId,
                roomId: params.roomId,
                stage: 'session_rollup',
                source: 'run_main_room_flow',
                messageId: params.messageId ?? null,
              }),
            ),
          );
          extraWrites += 1;
          const deptLine = `[orch] ${params.orchestrationSummary}\n[sup] ${params.supervisionSummary}`.slice(0, 8000);
          for (const slug of deptSlugs) {
            promises.push(
              this.storeMemory(
                params.companyId,
                `company:${params.companyId}:department:${slug}`,
                deptLine,
                hbMeta({
                  traceId: params.traceId,
                  roomId: params.roomId,
                  stage: 'department_rollup',
                  source: 'run_main_room_flow',
                  departmentSlug: slug,
                  messageId: params.messageId ?? null,
                }),
              ),
            );
            extraWrites += 1;
          }
          promises.push(
            this.storeMemory(
              params.companyId,
              `company:${params.companyId}:company`,
              rollup,
              hbMeta({
                traceId: params.traceId,
                roomId: params.roomId,
                stage: 'company_rollup',
                source: 'run_main_room_flow',
                messageId: params.messageId ?? null,
              }),
            ),
          );
          extraWrites += 1;
        }

        await Promise.all(promises);
        this.writeCounter.add(4 + extraWrites, { roomType: params.roomType });
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
        this.logger.warn('foundry.collaboration.memory.persist_after_supervision_failed', {
          companyId: params.companyId,
          roomId: params.roomId,
          traceId: params.traceId,
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        span.end();
      }
    });
  }

  private resolveDepartmentSlugs(hint?: MemoryLayerRoomHint, extra?: string[]): string[] {
    const out = new Set<string>();
    for (const s of extra ?? []) {
      const t = this.sanitizeSegment(s);
      if (t) out.add(t);
    }
    if (hint?.organizationNodeId && Array.isArray(hint.orgDepartments)) {
      const row = hint.orgDepartments.find((d) => d.id === hint.organizationNodeId);
      if (row?.slug) {
        const t = this.sanitizeSegment(row.slug);
        if (t) out.add(t);
      }
    }
    return [...out].slice(0, 12);
  }

  private sanitizeSegment(raw: string): string {
    const s = String(raw ?? '')
      .trim()
      .replace(/[^a-zA-Z0-9._\u4e00-\u9fff-]/g, '_')
      .slice(0, 96);
    return s || '';
  }

  private corMetadata(
    base: Record<string, unknown>,
    hb?: CollaborationHeartbeatCorrelationPayload,
  ): Record<string, unknown> {
    if (!hb) return base;
    return {
      ...base,
      heartbeatCorrelation: {
        heartbeatRunId: hb.heartbeatRunId,
        tickAt: hb.tickAt,
        triggerSource: hb.triggerSource,
        runKind: hb.runKind,
        mainRoomId: hb.mainRoomId,
        collaborationSurfaceRoomId: hb.collaborationSurfaceRoomId,
      },
    };
  }

  private async searchMemory(
    companyId: string,
    query: string,
    namespaces: string[],
    topK: number,
  ): Promise<MemorySearchHit[]> {
    const response = await firstValueFrom(
      this.apiRpc
        .send<MemorySearchHit[]>('memory.search', {
          companyId,
          actor: this.workerActor(),
          data: {
            query: String(query ?? '').trim().slice(0, 500),
            topK,
            namespaces,
          },
        })
        .pipe(timeout({ first: Math.max(1200, this.config.getCollaborationMentionRpcTimeoutMs()) })),
    ).catch(() => []);
    return Array.isArray(response) ? response : [];
  }

  private async storeMemory(
    companyId: string,
    namespace: string,
    content: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const text = String(content ?? '').trim();
    if (!text) return;
    await firstValueFrom(
      this.apiRpc
        .send('memory.entries.store', {
          companyId,
          actor: this.workerActor(),
          data: {
            namespace,
            collectionLabel: 'collaboration_stage_memory',
            sourceType: 'summary',
            content: text.slice(0, 10_000),
            metadata: {
              ...metadata,
              writtenAt: new Date().toISOString(),
            },
          },
        })
        .pipe(timeout({ first: Math.max(1200, this.config.getCollaborationMentionRpcTimeoutMs()) })),
    );
  }

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }
}
