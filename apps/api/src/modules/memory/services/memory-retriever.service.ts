import {
  Injectable,
  ForbiddenException,
  Logger,
  Optional,
  RequestTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import type { MemoryRetrievedEvent } from '@contracts/events';
import { ConfigService } from '../../../common/config/config.service.js';
import { EmbeddingService } from './embedding.service.js';
import { MemoryAccessService, type MemoryActor } from './memory-access.service.js';
import { RoomMember } from '../../collaboration/entities/room-member.entity.js';
import { CollaborationRealtimePublisher } from '../../collaboration/services/collaboration-realtime-publisher.service.js';
import {
  agentNamespace,
  companyNamespace,
  resolveDepartmentMemoryNamespace,
  sessionNamespace,
} from '../utils/memory-namespace.js';
import { OrganizationNode } from '../../organization/entities/organization-node.entity.js';
import { MemoryMetricsService } from './memory-metrics.service.js';
import { MemoryElasticService } from './memory-elastic.service.js';
import { MemoryGraphService } from './memory-graph.service.js';
import { MemoryGraphRolloutService } from './memory-graph-rollout.service.js';

export interface MemorySearchFilters {
  companyId: string;
  namespaces?: string[];
  sourceTypes?: string[];
  keyword?: string;
  topK?: number;
  createdAfter?: string;
  createdBefore?: string;
  agentId?: string;
  organizationNodeId?: string;
  /** 供 retrieveWithHierarchy 使用（会话工作记忆层） */
  roomId?: string;
  /**
   * JSONB contains：`metadata @> value`
   * 用于 tags / visibility / department_id 等过滤（与 Graph RAG 元数据对齐的过渡字段）。
   */
  metadataContains?: Record<string, unknown>;
  /** 覆盖全局 MEMORY_RAG_MIN_SCORE */
  minScore?: number;
  actor?: MemoryActor;
  /** Opt 2: pre-computed query embedding to avoid redundant embed calls in hierarchy search */
  precomputedEmbedding?: number[];
}

export interface MemorySearchHit {
  id: string;
  collectionId: string;
  namespace: string;
  content: string;
  metadata: Record<string, unknown> | null;
  sourceType: string;
  score: number;
  importanceScore?: number;
  createdAt?: string;
  redacted?: boolean;
  tier?: 'session' | 'agent' | 'dept' | 'company';
}

@Injectable()
export class MemoryRetrieverService {
  private readonly logger = new Logger(MemoryRetrieverService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(OrganizationNode)
    private readonly orgNodesRepo: Repository<OrganizationNode>,
    @InjectRepository(RoomMember)
    private readonly roomMembersRepo: Repository<RoomMember>,
    private readonly embedding: EmbeddingService,
    private readonly config: ConfigService,
    private readonly access: MemoryAccessService,
    private readonly messaging: MessagingService,
    private readonly metrics: MemoryMetricsService,
    private readonly graphRollout: MemoryGraphRolloutService,
    private readonly graph: MemoryGraphService,
    @Optional() private readonly realtime?: CollaborationRealtimePublisher,
    @Optional() private readonly elastic?: MemoryElasticService,
  ) {}

  /**
   * Phase 3：Hybrid GraphRAG 检索（仅在进程开关 + 公司级 rollout 生效时启用）
   * - 先走 legacy hybrid（向量 + 关键词/FTS）
   * - 对 top hits 做 graph traversal（lineage + summarizes），再按 importance/lineage_depth/recency 重排
   * - 全链路超时保护，避免 graph 扩散影响 P95
   * - 查询向量维与 {@link EmbeddingService.resolveEffectiveEmbeddingDimensions} 一致（含 EMBEDDING_PROJECTION_* 时为目标维）
   */
  async hybridGraphRAGSearch(
    query: string,
    filters: MemorySearchFilters,
    options?: { audit?: { strategy: 'search' | 'hierarchy'; scope?: string } },
  ): Promise<MemorySearchHit[]> {
    const started = Date.now();
    const topK = Math.min(filters.topK ?? 8, 50);
    const graphTimeoutMs = Math.min(
      Math.max(this.config.get<number>('MEMORY_GRAPH_TRAVERSAL_TIMEOUT_MS', 40), 5),
      200,
    );
    const graphDepth = Math.min(
      Math.max(this.config.get<number>('MEMORY_GRAPH_TRAVERSAL_DEPTH', 6), 1),
      20,
    );
    const graphWeight = Math.min(
      Math.max(this.config.get<number>('MEMORY_GRAPH_WEIGHT', 0.18), 0),
      1,
    );

    const legacyHits = await this.legacySearch(query, filters, {
      suppressPublish: true,
      audit: options?.audit,
    });
    if (!legacyHits.length || graphWeight <= 0) {
      // publish once as normal search
      const out = legacyHits.slice(0, topK);
      this.metrics.observeRetrieval(out.length ? 'hit' : 'miss', 'search', Date.now() - started);
      return out;
    }

    // Only expand a small window to control latency.
    const seed = legacyHits.slice(0, Math.min(6, legacyHits.length));
    const nowMs = Date.now();
    const deadline = nowMs + graphTimeoutMs;

    const lineageDepthById = new Map<string, number>();
    const summarizeCountById = new Map<string, number>();

    for (const h of seed) {
      if (Date.now() > deadline) break;
      // Best-effort: graph calls are already timeout-protected internally.
      const lineage = await this.graph.getLineage(filters.companyId, h.id, graphDepth).catch(() => null);
      if (lineage) {
        lineageDepthById.set(h.id, lineage.maxDepth);
      }
      const tree = await this.graph.getSummarizesTree(filters.companyId, h.id).catch(() => []);
      if (tree?.length) {
        summarizeCountById.set(h.id, tree.length);
      }
    }

    const causalIds = legacyHits.slice(0, 12).map((h) => h.id);
    const causalById = await this.graph
      .getCausalInboundCounts(filters.companyId, causalIds)
      .catch(() => new Map<string, number>());

    const reranked = legacyHits
      .map((h) => {
        const importance = clamp01(h.importanceScore ?? 0.5);
        const lineageDepth = Math.min(lineageDepthById.get(h.id) ?? 0, 20);
        const lineageBoost = lineageDepth > 0 ? Math.max(0, 1 - lineageDepth / 12) : 0;
        const summarizesBoost = Math.min((summarizeCountById.get(h.id) ?? 0) / 20, 1);
        const causalBoost = Math.min((causalById.get(h.id) ?? 0) / 12, 1);
        const createdAtMs =
          typeof h.createdAt === 'string' ? Date.parse(h.createdAt) : Number.NaN;
        const ageDays = Number.isFinite(createdAtMs)
          ? (Date.now() - createdAtMs) / 86400000
          : 30;
        const recency = Math.max(0, 1 - Math.min(ageDays, 60) / 60);
        const graphScore =
          0.42 * lineageBoost +
          0.22 * summarizesBoost +
          0.18 * causalBoost +
          0.18 * recency;
        const score = Number(
          (h.score * (1 - graphWeight) + graphScore * graphWeight + 0.08 * (importance - 0.5)).toFixed(6),
        );
        return { ...h, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    // publish memory.retrieved via existing path (reuse publish by calling search once with suppressPublish=false)
    // We keep the side effects minimal: realtime + metrics. Here we only record metrics; the caller path already audits.
    this.metrics.observeRetrieval(reranked.length ? 'hit' : 'miss', 'search', Date.now() - started);
    if (this.config.isCostAwareRoutingEnabled()) {
      const graphSignal =
        [...lineageDepthById.values()].some((d) => d > 0) || [...summarizeCountById.values()].some((c) => c > 0);
      this.metrics.observeGraphHybridSignal(graphSignal ? 'graph_enriched' : 'vector_only');
    }
    return reranked;
  }

  async search(
    query: string,
    filters: MemorySearchFilters,
    options?: {
      suppressPublish?: boolean;
      audit?: { strategy: 'search' | 'hierarchy'; scope?: string };
    },
  ): Promise<MemorySearchHit[]> {
    const graphOn =
      this.config.isMemoryGraphV2Enabled() &&
      (await this.graphRollout.isMemoryGraphV2Effective(filters.companyId));
    if (graphOn) {
      return this.hybridGraphRAGSearch(query, filters, { audit: options?.audit });
    }
    return this.legacySearch(query, filters, options);
  }

  private async legacySearch(
    query: string,
    filters: MemorySearchFilters,
    options?: {
      suppressPublish?: boolean;
      audit?: { strategy: 'search' | 'hierarchy'; scope?: string };
    },
  ): Promise<MemorySearchHit[]> {
    const started = Date.now();
    const memCfg = this.config.getMemoryConfig();
    const topK = Math.min(filters.topK ?? 8, 50);
    let namespaces = filters.namespaces;
    if (!namespaces?.length) {
      if (filters.agentId) {
        namespaces = [agentNamespace(filters.agentId)];
      } else if (filters.organizationNodeId) {
        const node = await this.orgNodesRepo.findOne({ where: { id: filters.organizationNodeId } });
        const slug =
          node && typeof node.metadata?.platformDepartmentSlug === 'string'
            ? node.metadata.platformDepartmentSlug
            : null;
        namespaces = [
          resolveDepartmentMemoryNamespace({
            organizationNodeId: filters.organizationNodeId,
            platformDepartmentSlug: slug,
          }),
        ];
      }
    }

    const requestedNamespaces = namespaces;
    const requestedSession = (requestedNamespaces ?? []).filter((ns) =>
      ns.startsWith('session:'),
    );
    const requestedNonSession = (requestedNamespaces ?? []).filter(
      (ns) => !ns.startsWith('session:'),
    );

    const actorWithRooms = requestedSession.length
      ? await this.withAllowedRooms(filters, filters.actor)
      : filters.actor;
    const resolved = await this.access.resolveSearchNamespaces(
      requestedNamespaces
        ? requestedNonSession.length
          ? requestedNonSession
          : requestedSession.length
            ? []
            : undefined
        : undefined,
      actorWithRooms,
    );
    if (requestedSession.length) {
      for (const ns of requestedSession) {
        if (!(await this.access.namespaceAllowedForActor(ns, actorWithRooms))) {
          throw new ForbiddenException({
            code: 'MEMORY_NAMESPACE_FORBIDDEN',
            message: `无权检索记忆命名空间: ${ns}`,
          });
        }
      }
    }
    const effectiveNamespaces = [
      ...(resolved ?? []),
      ...requestedSession,
    ];

    let qEmb: number[];
    if (filters.precomputedEmbedding?.length) {
      qEmb = filters.precomputedEmbedding;
    } else {
      try {
        const er = await this.embedding.embedText(query, {
          companyId: filters.companyId,
          agentId: filters.agentId ?? undefined,
        });
        qEmb = er.embedding;
      } catch (e: any) {
        this.logger.warn('embedding for query failed', { message: e?.message });
        throw new ServiceUnavailableException({
          code: 'MEMORY_EMBED_UNAVAILABLE',
          message: '检索向量化失败，请稍后重试',
        });
      }
    }

    const vecW = this.config.getMemoryConfig().hybridVectorWeight;
    const keyW = 1 - vecW;
    const kw = filters.keyword?.trim();
    const kwPattern = kw ? `%${kw}%` : null;

    const params: unknown[] = [qEmb, filters.companyId];
    let idx = 3;
    const where: string[] = [];

    if (effectiveNamespaces?.length) {
      where.push(`mc.namespace = ANY($${idx}::text[])`);
      params.push(effectiveNamespaces);
      idx += 1;
    }
    if (filters.sourceTypes?.length) {
      where.push(`me.source_type = ANY($${idx}::text[])`);
      params.push(filters.sourceTypes);
      idx += 1;
    }
    if (filters.createdAfter) {
      where.push(`me.created_at >= $${idx}::timestamptz`);
      params.push(filters.createdAfter);
      idx += 1;
    }
    if (filters.createdBefore) {
      where.push(`me.created_at <= $${idx}::timestamptz`);
      params.push(filters.createdBefore);
      idx += 1;
    }
    if (
      filters.metadataContains &&
      Object.keys(filters.metadataContains).length > 0
    ) {
      where.push(`me.metadata @> $${idx}::jsonb`);
      params.push(JSON.stringify(filters.metadataContains));
      idx += 1;
    }

    const cosineExpr = `memory_cosine_similarity(me.embedding, $1::float8[])`;
    let scoreExpr = cosineExpr;
    let kwIdx = 0;
    const qSlice = query.trim().slice(0, 2000);
    const useFt =
      !kwPattern && memCfg.hybridFullTextSearch && qSlice.length > 0;
    if (kwPattern) {
      kwIdx = idx;
      params.push(kwPattern);
      idx += 1;
      scoreExpr = `(${vecW}::float8 * (${cosineExpr}) + ${keyW}::float8 * CASE WHEN me.content ILIKE $${kwIdx} THEN 1::float8 ELSE 0::float8 END)`;
    } else if (useFt) {
      const tsIdx = idx;
      params.push(qSlice);
      idx += 1;
      const tsRank = `(CASE WHEN me.content_search @@ plainto_tsquery('simple', $${tsIdx}::text) THEN LEAST(1.0::float8, 4.0::float8 * ts_rank_cd(me.content_search, plainto_tsquery('simple', $${tsIdx}::text))) ELSE 0::float8 END)`;
      scoreExpr = `(${vecW}::float8 * (${cosineExpr}) + ${keyW}::float8 * (${tsRank}))`;
    }

    params.push(topK);
    const limitIdx = idx;

    const whereSql = where.length ? ` AND ${where.join(' AND ')}` : '';
    const sql = `
      SELECT
        me.id,
        me.collection_id AS "collectionId",
        mc.namespace,
        me.content,
        me.metadata,
        me.source_type AS "sourceType",
        me.is_sensitive AS "isSensitive",
        me.importance_score AS "importanceScore",
        me.created_at AS "createdAt",
        ${scoreExpr} AS score
      FROM memory_entries me
      INNER JOIN memory_collections mc ON mc.id = me.collection_id
      WHERE me.company_id = $2
      ${whereSql}
      ORDER BY score DESC
      LIMIT $${limitIdx}
    `;

    const timeoutMs = this.config.getMemoryConfig().ragQueryTimeoutMs;
    let rows: any[];
    try {
      rows = await this.withQueryTimeout(
        () => this.dataSource.query(sql, params),
        timeoutMs,
      );
    } catch (e: any) {
      if (e?.name === 'MemoryQueryTimeout') {
        throw new RequestTimeoutException({
          code: 'MEMORY_SEARCH_TIMEOUT',
          message: `记忆检索超时（>${timeoutMs}ms）`,
        });
      }
      throw e;
    }

    const canSensitive = this.access.canReadSensitive(filters.actor);
    const hits = (rows as any[]).map((r) => {
      const isSensitive = Boolean(r.isSensitive);
      const base = {
        id: r.id,
        collectionId: r.collectionId,
        namespace: r.namespace,
        content: r.content,
        metadata: r.metadata,
        sourceType: r.sourceType,
        score: Number(r.score),
        importanceScore: r.importanceScore != null ? Number(r.importanceScore) : undefined,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : (r.createdAt ? String(r.createdAt) : undefined),
      };
      if (isSensitive && !canSensitive) {
        return {
          ...base,
          content: '[敏感记忆，需审批或 memory.sensitive.read 权限后查看正文]',
          metadata: null,
          redacted: true,
        };
      }
      return base;
    });

    const minScore = filters.minScore ?? memCfg.ragMinScore ?? 0;
    let mergedHits = hits;

    // Optional: external BM25 backend (Elastic/OpenSearch). Merge + rerank with the existing hybrid weights.
    if (this.elastic?.isEnabled() && query.trim().length > 0) {
      const bm25 = await this.elastic.searchBm25({
        companyId: filters.companyId,
        query,
        namespaces: effectiveNamespaces.length ? effectiveNamespaces : undefined,
        sourceTypes: filters.sourceTypes,
        topK: Math.min(topK, 25),
        metadataContains: filters.metadataContains,
      });
      if (bm25.length) {
        const maxScore = Math.max(...bm25.map((h) => h.score), 1);
        const bm25Map = new Map(bm25.map((h) => [h.id, h.score / maxScore]));
        mergedHits = mergedHits.map((h) => {
          const keyScore = bm25Map.get(h.id) ?? 0;
          const vecScore = Math.max(0, Math.min(1, h.score));
          return { ...h, score: Number((vecW * vecScore + keyW * keyScore).toFixed(6)) };
        });
        // Also include pure-BM25 hits not in vector topK by fetching their rows (best-effort, small limit).
        const missingIds = bm25
          .map((h) => h.id)
          .filter((id) => !mergedHits.some((x) => x.id === id))
          .slice(0, 12);
        if (missingIds.length) {
          try {
            const moreRows = await this.dataSource.query(
              `
              SELECT
                me.id,
                me.collection_id AS "collectionId",
                mc.namespace,
                me.content,
                me.metadata,
                me.source_type AS "sourceType",
                me.is_sensitive AS "isSensitive"
              FROM memory_entries me
              INNER JOIN memory_collections mc ON mc.id = me.collection_id
              WHERE me.company_id = $1 AND me.id = ANY($2::uuid[])
              LIMIT 20
              `,
              [filters.companyId, missingIds],
            );
            const more = (moreRows as any[]).map((r) => {
              const isSensitive = Boolean(r.isSensitive);
              const base = {
                id: r.id,
                collectionId: r.collectionId,
                namespace: r.namespace,
                content: r.content,
                metadata: r.metadata,
                sourceType: r.sourceType,
                score: Number((keyW * (bm25Map.get(r.id) ?? 0)).toFixed(6)),
                importanceScore: 0,
                createdAt: null as string | null,
              };
              if (isSensitive && !canSensitive) {
                return { ...base, content: '[敏感记忆，需审批或 memory.sensitive.read 权限后查看正文]', metadata: null, redacted: true };
              }
              return base;
            });
            mergedHits = [...mergedHits, ...more];
          } catch (e: any) {
            this.logger.warn('elastic merge fetch failed', { message: e?.message });
          }
        }
        mergedHits = mergedHits.sort((a, b) => b.score - a.score).slice(0, topK);
      }
    }

    const passed = minScore > 0 ? mergedHits.filter((h) => h.score >= minScore) : mergedHits;

    if (!options?.suppressPublish) {
      this.metrics.observeRetrieval(passed.length > 0 ? 'hit' : 'miss', options?.audit?.strategy ?? 'search', Date.now() - started);
      void this.publishRetrieved(filters.companyId, {
        queryLength: query.length,
        hitCount: passed.length,
        namespaces: effectiveNamespaces.length
          ? effectiveNamespaces
          : requestedNamespaces,
        durationMs: Date.now() - started,
        strategy: options?.audit?.strategy ?? 'search',
        scope: options?.audit?.scope as
          | 'company'
          | 'department'
          | 'personal'
          | 'hierarchy'
          | undefined,
        minScore: minScore > 0 ? minScore : undefined,
        hitEntryIds: passed.slice(0, 24).map((h) => h.id),
      });
    }

    return passed;
  }

  async retrieveWithHierarchy(
    query: string,
    filters: MemorySearchFilters & { roomId?: string },
    hierarchyAudit?: { scope?: string },
  ): Promise<MemorySearchHit[]> {
    const started = Date.now();
    const memCfg = this.config.getMemoryConfig();
    const layered: Array<{
      tier: MemorySearchHit['tier'];
      namespaces?: string[];
      boost: number;
    }> = [];
    if (filters.roomId) {
      layered.push({
        tier: 'session',
        namespaces: [sessionNamespace(filters.roomId)],
        boost: 1.18,
      });
    }
    if (filters.agentId) {
      layered.push({
        tier: 'agent',
        namespaces: [agentNamespace(filters.agentId)],
        boost: 1.08,
      });
    }
    if (filters.organizationNodeId) {
      const deptNode = await this.orgNodesRepo.findOne({
        where: { id: filters.organizationNodeId, companyId: filters.companyId },
      });
      const slug =
        deptNode && typeof deptNode.metadata?.platformDepartmentSlug === 'string'
          ? deptNode.metadata.platformDepartmentSlug.trim()
          : null;
      const deptNs = resolveDepartmentMemoryNamespace({
        organizationNodeId: filters.organizationNodeId,
        platformDepartmentSlug: slug?.length ? slug : null,
      });
      layered.push({
        tier: 'dept',
        namespaces: [deptNs],
        boost: 1.03,
      });
    }
    layered.push({
      tier: 'company',
      namespaces: [companyNamespace()],
      boost: 1,
    });

    // Opt 2: pre-embed query once to avoid 4x redundant embedding calls
    let precomputedEmbedding: number[] | undefined = filters.precomputedEmbedding;
    if (!precomputedEmbedding?.length) {
      try {
        const er = await this.embedding.embedText(query, {
          companyId: filters.companyId,
          agentId: filters.agentId ?? undefined,
        });
        precomputedEmbedding = er.embedding;
      } catch {
        // fallback: each search() call will embed independently
      }
    }

    const merged = new Map<string, MemorySearchHit>();
    for (const layer of layered) {
      const hits = await this.search(
        query,
        {
          ...filters,
          precomputedEmbedding,
          namespaces: layer.namespaces,
          topK: Math.min(filters.topK ?? 8, 20),
        },
        { suppressPublish: true },
      );
      for (const hit of hits) {
        const boosted = Number((hit.score * layer.boost).toFixed(6));
        const prev = merged.get(hit.id);
        if (!prev || boosted > prev.score) {
          merged.set(hit.id, { ...hit, score: boosted, tier: layer.tier });
        }
      }
    }
    let out = [...merged.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(filters.topK ?? 8, 50));
    const minScore = filters.minScore ?? memCfg.ragMinScore ?? 0;
    if (minScore > 0) {
      out = out.filter((h) => h.score >= minScore);
    }
    void this.publishRetrieved(filters.companyId, {
      queryLength: query.length,
      hitCount: out.length,
      durationMs: Date.now() - started,
      strategy: 'hierarchy',
      scope: hierarchyAudit?.scope as
        | 'company'
        | 'department'
        | 'personal'
        | 'hierarchy'
        | undefined,
      minScore: minScore > 0 ? minScore : undefined,
      hitEntryIds: out.slice(0, 24).map((h) => h.id),
    });
    this.metrics.observeRetrieval(out.length > 0 ? 'hit' : 'miss', 'hierarchy', Date.now() - started);
    if (out[0]?.metadata && typeof out[0].metadata.createdAt === 'string') {
      const ageSec = Math.floor((Date.now() - new Date(out[0].metadata.createdAt).getTime()) / 1000);
      this.metrics.observeFreshness(hierarchyAudit?.scope ?? 'hierarchy', ageSec);
    }
    return out;
  }

  private async withAllowedRooms(
    filters: MemorySearchFilters,
    actor?: MemoryActor,
  ): Promise<MemoryActor | undefined> {
    if (!actor) return actor;
    if (this.access.isPrivileged(actor)) return actor;
    const rows = await this.roomMembersRepo.find({
      where: {
        companyId: filters.companyId,
        memberType: 'human',
        memberId: actor.id,
        leftAt: IsNull(),
      },
      select: ['roomId'],
      take: 2000,
    });
    const roomIds = rows.map((r: { roomId: string }) => r.roomId);
    return { ...actor, roomIds };
  }

  private async withQueryTimeout<T>(
    fn: () => Promise<T>,
    ms: number,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error('timeout');
        err.name = 'MemoryQueryTimeout';
        reject(err);
      }, ms);
    });
    try {
      return await Promise.race([fn(), timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async publishRetrieved(
    companyId: string,
    data: {
      queryLength: number;
      hitCount: number;
      namespaces?: string[];
      durationMs: number;
      strategy?: 'search' | 'hierarchy';
      scope?: 'company' | 'department' | 'personal' | 'hierarchy';
      minScore?: number;
      hitEntryIds?: string[];
    },
  ): Promise<void> {
    try {
      const payload: MemoryRetrievedEvent['data'] = {
        companyId,
        queryLength: data.queryLength,
        hitCount: data.hitCount,
        namespaces: data.namespaces,
        durationMs: data.durationMs,
        retrievedAt: new Date().toISOString(),
        strategy: data.strategy,
        scope: data.scope,
        minScore: data.minScore,
        hitEntryIds: data.hitEntryIds,
      };
      const event: MemoryRetrievedEvent = {
        eventId: randomUUID(),
        eventType: 'memory.retrieved',
        aggregateId: companyId,
        aggregateType: 'memory_retrieval',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: payload,
      };
      await this.messaging.publish(event, {
        routingKey: 'memory.retrieved',
        persistent: true,
      });
      await this.realtime?.publishEnvelope({
        companyId,
        event: 'memory:retrieved',
        payload: {
          hitCount: data.hitCount,
          durationMs: data.durationMs,
          strategy: data.strategy ?? 'search',
          scope: data.scope ?? 'hierarchy',
        },
      });
    } catch (e: any) {
      this.logger.warn('publish memory.retrieved failed', { message: e?.message });
    }
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
