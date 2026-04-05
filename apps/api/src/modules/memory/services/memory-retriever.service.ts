import {
  Injectable,
  ForbiddenException,
  Logger,
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
import {
  agentNamespace,
  companyNamespace,
  departmentNamespace,
  sessionNamespace,
} from '../utils/memory-namespace.js';

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
}

export interface MemorySearchHit {
  id: string;
  collectionId: string;
  namespace: string;
  content: string;
  metadata: Record<string, unknown> | null;
  sourceType: string;
  score: number;
  redacted?: boolean;
  tier?: 'session' | 'agent' | 'dept' | 'company';
}

@Injectable()
export class MemoryRetrieverService {
  private readonly logger = new Logger(MemoryRetrieverService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(RoomMember)
    private readonly roomMembersRepo: Repository<RoomMember>,
    private readonly embedding: EmbeddingService,
    private readonly config: ConfigService,
    private readonly access: MemoryAccessService,
    private readonly messaging: MessagingService,
  ) {}

  async search(
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
        namespaces = [departmentNamespace(filters.organizationNodeId)];
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
    const resolved = this.access.resolveSearchNamespaces(
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
        if (!this.access.namespaceAllowedForActor(ns, actorWithRooms)) {
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
    try {
      qEmb = await this.embedding.embedText(query);
    } catch (e: any) {
      this.logger.warn('embedding for query failed', { message: e?.message });
      throw new ServiceUnavailableException({
        code: 'MEMORY_EMBED_UNAVAILABLE',
        message: '检索向量化失败，请稍后重试',
      });
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
    const passed =
      minScore > 0 ? hits.filter((h) => h.score >= minScore) : hits;

    if (!options?.suppressPublish) {
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
      layered.push({
        tier: 'dept',
        namespaces: [departmentNamespace(filters.organizationNodeId)],
        boost: 1.03,
      });
    }
    layered.push({
      tier: 'company',
      namespaces: [companyNamespace()],
      boost: 1,
    });

    const merged = new Map<string, MemorySearchHit>();
    for (const layer of layered) {
      const hits = await this.search(
        query,
        {
          ...filters,
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
    } catch (e: any) {
      this.logger.warn('publish memory.retrieved failed', { message: e?.message });
    }
  }
}
