import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { context, trace } from '@opentelemetry/api';
import { ConfigService } from '../../../common/config/config.service.js';
import { MemoryEdge, type MemoryEdgeType } from '../entities/memory-edge.entity.js';
import { MemoryGraphRolloutService } from './memory-graph-rollout.service.js';

@Injectable()
export class MemoryGraphService {
  private readonly logger = new Logger(MemoryGraphService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(MemoryEdge) private readonly edgesRepo: Repository<MemoryEdge>,
    private readonly config: ConfigService,
    private readonly rollout: MemoryGraphRolloutService,
  ) {}

  private globalGraphEnabled(): boolean {
    return this.config.isMemoryGraphV2Enabled();
  }

  /**
   * 新增一条边（带简单防环：from 不允许出现在 to 的 lineage 中）。
   * 注意：RLS + TenantContext 仍是第一道隔离。
   */
  async addEdge(params: {
    companyId: string;
    fromEntryId: string;
    toEntryId: string | null;
    edgeType: MemoryEdgeType;
    metadata?: Record<string, unknown> | null;
  }): Promise<{ created: boolean; blockedReason?: 'lineage_cycle_detected' }> {
    if (!this.globalGraphEnabled()) return { created: false };
    if (!(await this.rollout.isMemoryGraphV2Effective(params.companyId))) {
      return { created: false };
    }

    const span = trace.getSpan(context.active());

    if (params.toEntryId) {
      const lineage = await this.getLineage(params.companyId, params.toEntryId, 6);
      const cycle = lineage.nodes.includes(params.fromEntryId);
      if (cycle) {
        if (span) span.setAttribute('foundry.lineage_depth', lineage.maxDepth);
        return { created: false, blockedReason: 'lineage_cycle_detected' };
      }
      if (span) span.setAttribute('foundry.lineage_depth', lineage.maxDepth);
    }

    const doInsert = async () => {
      await this.edgesRepo
        .createQueryBuilder()
        .insert()
        .into(MemoryEdge)
        .values({
          companyId: params.companyId,
          fromEntryId: params.fromEntryId,
          toEntryId: params.toEntryId,
          edgeType: params.edgeType,
          metadata: params.metadata ?? null,
          validFrom: new Date(),
          validTo: null,
        })
        .orIgnore()
        .execute();
    };

    try {
      if (this.config.isCostAwareRoutingEnabled()) {
        await this.dataSource.transaction(async () => {
          await doInsert();
        });
      } else {
        await doInsert();
      }
      if (span) {
        span.setAttribute('foundry.memory_edge_count', 1);
        span.setAttribute('foundry.memory_edge_type', params.edgeType);
      }
      return { created: true };
    } catch (e: any) {
      this.logger.warn('addEdge failed', { message: e?.message, edgeType: params.edgeType });
      return { created: false };
    }
  }

  /**
   * 递归 CTE 溯源（沿着 to_entry_id 反向追溯 from_entry_id）
   * - 返回 nodes（含起点）与最大深度
   * - 仅在需要时调用，避免影响现有检索性能
   */
  async getLineage(
    companyId: string,
    entryId: string,
    depth = 4,
  ): Promise<{ nodes: string[]; edges: Array<{ from: string; to: string | null; edgeType: string; depth: number }>; maxDepth: number }> {
    if (!this.globalGraphEnabled()) return { nodes: [entryId], edges: [], maxDepth: 0 };

    // Hard limit to avoid recursion explosion in production.
    const maxDepth = Math.min(Math.max(depth, 1), 20);
    const timeoutMs = Math.min(
      Math.max(this.config.get<number>('MEMORY_GRAPH_QUERY_TIMEOUT_MS', 80), 20),
      2000,
    );
    const temporal = `AND (me.valid_to IS NULL OR me.valid_to > NOW()) AND me.valid_from <= NOW()`;
    const temporal2 = `AND (me2.valid_to IS NULL OR me2.valid_to > NOW()) AND me2.valid_from <= NOW()`;
    const rows = await this.withTimeout(
      () =>
        this.dataSource.query(
          `
          WITH RECURSIVE lineage AS (
            SELECT
              me.from_entry_id AS "fromId",
              me.to_entry_id AS "toId",
              me.edge_type AS "edgeType",
              1 AS depth
            FROM memory_edges me
            WHERE me.company_id = $1 AND me.to_entry_id = $2
              ${temporal}
            UNION ALL
            SELECT
              me2.from_entry_id AS "fromId",
              me2.to_entry_id AS "toId",
              me2.edge_type AS "edgeType",
              l.depth + 1 AS depth
            FROM memory_edges me2
            INNER JOIN lineage l ON l."fromId" = me2.to_entry_id
            WHERE me2.company_id = $1 AND l.depth < $3
              ${temporal2}
          )
          SELECT "fromId", "toId", "edgeType", depth FROM lineage
          `,
          [companyId, entryId, maxDepth],
        ),
      timeoutMs,
    ).catch(() => []);

    const edges = (rows ?? []) as Array<{ fromId: string; toId: string | null; edgeType: string; depth: number }>;
    const nodes = new Set<string>([entryId]);
    let seenDepth = 0;
    for (const e of edges) {
      nodes.add(e.fromId);
      if (e.toId) nodes.add(e.toId);
      seenDepth = Math.max(seenDepth, Number(e.depth ?? 0));
    }
    return {
      nodes: [...nodes],
      edges: edges.map((e) => ({ from: e.fromId, to: e.toId, edgeType: e.edgeType, depth: e.depth })),
      maxDepth: seenDepth,
    };
  }

  /**
   * 查询：某条 entry 被哪些 summary（或其他 fromEntry）引用（summarizes 反向）
   */
  async getSummarizesTree(companyId: string, entryId: string): Promise<Array<{ fromEntryId: string; edgeId: string; createdAt: string }>> {
    if (!this.globalGraphEnabled()) return [];
    const rows = await this.dataSource.query(
      `
      SELECT id, from_entry_id AS "fromEntryId", created_at AS "createdAt"
      FROM memory_edges
      WHERE company_id = $1 AND to_entry_id = $2 AND edge_type = 'summarizes'
        AND (valid_to IS NULL OR valid_to > NOW())
        AND valid_from <= NOW()
      ORDER BY created_at DESC
      LIMIT 200
      `,
      [companyId, entryId],
    );
    return (rows ?? []) as Array<{ fromEntryId: string; edgeId: string; createdAt: string }>;
  }

  /**
   * promoteWithEdge: 批量写 summarizes 边（sourceEntryIds -> summaryEntryId）
   */
  async promoteWithEdge(params: {
    companyId: string;
    summaryEntryId: string;
    sourceEntryIds: string[];
    edgeType?: MemoryEdgeType;
    metadata?: Record<string, unknown> | null;
  }): Promise<{ created: number; blocked: number }> {
    if (!this.globalGraphEnabled()) return { created: 0, blocked: 0 };
    if (!(await this.rollout.isMemoryGraphV2Effective(params.companyId))) {
      return { created: 0, blocked: 0 };
    }
    const edgeType = params.edgeType ?? 'summarizes';
    let created = 0;
    let blocked = 0;
    for (const src of params.sourceEntryIds.filter(Boolean)) {
      const r = await this.addEdge({
        companyId: params.companyId,
        fromEntryId: src,
        toEntryId: params.summaryEntryId,
        edgeType,
        metadata: params.metadata ?? null,
      });
      if (r.created) created += 1;
      else if (r.blockedReason === 'lineage_cycle_detected') blocked += 1;
    }
    return { created, blocked };
  }

  /**
   * 辅助：从 chat messageId 解析对应的 memory_entry.id（chat/source_ref = messageId）
   * 用于 Worker consolidate 记录 “messages -> summary” 的 summarizes 边。
   */
  async resolveChatEntryIds(params: { companyId: string; messageIds: string[] }): Promise<string[]> {
    if (!this.globalGraphEnabled()) return [];
    const ids = params.messageIds.filter(Boolean).slice(0, 500);
    if (!ids.length) return [];
    const rows = await this.dataSource.query(
      `
      SELECT id
      FROM memory_entries
      WHERE company_id = $1 AND source_type = 'chat' AND source_ref = ANY($2::uuid[])
      LIMIT 800
      `,
      [params.companyId, ids],
    );
    return (rows ?? []).map((r: any) => String(r.id)).filter(Boolean);
  }

  /**
   * 因果入边计数：指向该 entry 的 caused_by / derived_from（当前有效期内），用于 GraphRAG 重排。
   */
  async getCausalInboundCounts(companyId: string, entryIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!this.globalGraphEnabled() || !entryIds.length) return out;
    const ids = [...new Set(entryIds.map((x) => String(x ?? '').trim()).filter(Boolean))].slice(0, 64);
    if (!ids.length) return out;
    const rows = await this.dataSource.query(
      `
      SELECT me.to_entry_id AS "entryId", COUNT(*)::int AS c
      FROM memory_edges me
      WHERE me.company_id = $1
        AND me.to_entry_id = ANY($2::uuid[])
        AND me.edge_type IN ('caused_by', 'derived_from')
        AND (me.valid_to IS NULL OR me.valid_to > NOW())
        AND me.valid_from <= NOW()
      GROUP BY me.to_entry_id
      `,
      [companyId, ids],
    );
    for (const r of rows ?? []) {
      const id = String((r as { entryId?: string }).entryId ?? '').trim();
      const c = Number((r as { c?: number }).c ?? 0);
      if (id) out.set(id, c);
    }
    return out;
  }

  private async withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('MemoryGraphQueryTimeout')), ms);
    });
    try {
      return await Promise.race([fn(), timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
