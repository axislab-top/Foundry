import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { projectEmbeddingLinearDown } from '../../../common/llm/embedding-projection.util.js';
import { ConfigService } from '../../../common/config/config.service.js';
import { EmbeddingService } from './embedding.service.js';
import { MemoryGraphRolloutService } from './memory-graph-rollout.service.js';

/** Memory Graph 物化节点 / 边可选向量统一维度（与迁移 CHECK 一致） */
export const MEMORY_GRAPH_EMBEDDING_DIM = 2048 as const;

/**
 * W13：将历史 session 共现条目增量挂上 `related_to`（后台批次，幂等）。
 * Phase3：memory_nodes + memory_edges.embedding 的 2048 回填与条目重嵌入。
 */
@Injectable()
export class MemoryGraphBackfillService {
  private readonly logger = new Logger(MemoryGraphBackfillService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly rollout: MemoryGraphRolloutService,
    private readonly embedding: EmbeddingService,
  ) {}

  async backfillRelatedEdgesBatch(companyId: string, limit = 200): Promise<{ inserted: number }> {
    if (!this.config.isMemoryGraphV2Enabled()) {
      return { inserted: 0 };
    }
    if (!(await this.rollout.isMemoryGraphV2Effective(companyId))) {
      return { inserted: 0 };
    }
    const lim = Math.min(Math.max(Math.floor(limit), 1), 2000);
    try {
      const rows = await this.dataSource.query(
        `
        INSERT INTO memory_edges (company_id, from_entry_id, to_entry_id, edge_type, metadata, valid_from, valid_to)
        SELECT x.company_id, x.from_id, x.to_id, 'related_to',
               jsonb_build_object('kind', 'backfill_session_cooccurrence', 'source', 'memory_graph_backfill'),
               NOW(), NULL
        FROM (
          SELECT me1.company_id, me1.id AS from_id, me2.id AS to_id
          FROM memory_entries me1
          INNER JOIN memory_collections mc1 ON mc1.id = me1.collection_id
          INNER JOIN memory_entries me2 ON me2.company_id = me1.company_id AND me2.id <> me1.id
          INNER JOIN memory_collections mc2 ON mc2.id = me2.collection_id
          WHERE me1.company_id = $1
            AND mc1.namespace = mc2.namespace
            AND mc1.namespace LIKE 'session:%'
            AND me1.created_at < me2.created_at
            AND me2.created_at <= me1.created_at + interval '48 hours'
            AND NOT EXISTS (
              SELECT 1 FROM memory_edges e
              WHERE e.company_id = me1.company_id
                AND e.from_entry_id = me1.id
                AND e.to_entry_id = me2.id
                AND e.edge_type = 'related_to'
            )
          LIMIT $2
        ) AS x
        RETURNING id
        `,
        [companyId, lim],
      );
      const inserted = Array.isArray(rows) ? rows.length : 0;
      if (inserted > 0) {
        this.logger.log('memory_graph.backfill_related_batch', { companyId, inserted });
      }
      return { inserted };
    } catch (e: unknown) {
      this.logger.warn('memory_graph.backfill_related_batch_failed', {
        companyId,
        message: e instanceof Error ? e.message : String(e),
      });
      return { inserted: 0 };
    }
  }

  /**
   * Phase3：将仍为「上游输出维」（如 2048）的 memory_entries.embedding 批量投影到 EMBEDDING_TARGET_DIM。
   * 需 EMBEDDING_PROJECTION_ENABLED=true；幂等（已是 target 维的行不会被选中）。
   */
  async reprojectEmbeddingsBatch(
    companyId: string,
    limit = 300,
  ): Promise<{ scanned: number; updated: number; skippedReason?: string }> {
    const mem = this.config.getMemoryConfig();
    if (!mem.embeddingProjectionEnabled) {
      return { scanned: 0, updated: 0, skippedReason: 'projection_disabled' };
    }
    const fromDim = mem.embeddingModelOutputDim;
    const toDim = mem.embeddingTargetDim;
    if (fromDim === toDim) {
      return { scanned: 0, updated: 0, skippedReason: 'same_dims' };
    }
    const lim = Math.min(2000, Math.max(1, Math.floor(limit)));
    let rows: Array<{ id: string; embedding: unknown }>;
    try {
      rows = await this.dataSource.query(
        `
        SELECT id, embedding
        FROM memory_entries
        WHERE company_id = $1::uuid
          AND array_length(embedding, 1) = $2
        ORDER BY created_at DESC
        LIMIT $3
        `,
        [companyId, fromDim, lim],
      );
    } catch (e: unknown) {
      this.logger.warn('memory_graph.reproject_embeddings_query_failed', {
        companyId,
        message: e instanceof Error ? e.message : String(e),
      });
      return { scanned: 0, updated: 0, skippedReason: 'query_failed' };
    }
    const list = Array.isArray(rows) ? rows : [];
    let updated = 0;
    for (const row of list) {
      const id = String(row.id ?? '').trim();
      const raw = row.embedding;
      const emb = Array.isArray(raw) ? (raw as number[]) : null;
      if (!id || !emb || emb.length !== fromDim) continue;
      try {
        const projected = projectEmbeddingLinearDown(emb, fromDim, toDim);
        await this.dataSource.query(
          `UPDATE memory_entries SET embedding = $1::float8[] WHERE id = $2::uuid AND company_id = $3::uuid`,
          [projected, id, companyId],
        );
        updated += 1;
      } catch (e: unknown) {
        this.logger.warn('memory_graph.reproject_embedding_row_failed', {
          companyId,
          entryId: id,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
    if (updated > 0) {
      this.logger.log('memory_graph.reproject_embeddings_batch', { companyId, scanned: list.length, updated });
    }
    return { scanned: list.length, updated };
  }

  /**
   * 将已是 2048 维的 memory_entries 向量同步到 memory_nodes（INSERT … ON CONFLICT）。
   */
  async syncMemoryNodes2048FromEntriesBatch(
    companyId: string,
    limit = 500,
  ): Promise<{ upserted: number }> {
    if (limit === 0) return { upserted: 0 };
    const lim = Math.min(5000, Math.max(1, Math.floor(limit)));
    try {
      const rows = await this.dataSource.query(
        `
        WITH cand AS (
          SELECT me.company_id, me.id AS memory_entry_id, me.embedding
          FROM memory_entries me
          WHERE me.company_id = $1::uuid
            AND array_length(me.embedding, 1) = $3
          ORDER BY me.created_at DESC
          LIMIT $2
        )
        INSERT INTO memory_nodes (company_id, memory_entry_id, embedding)
        SELECT company_id, memory_entry_id, embedding FROM cand
        ON CONFLICT (memory_entry_id) DO UPDATE SET
          embedding = EXCLUDED.embedding,
          updated_at = now()
        RETURNING id
        `,
        [companyId, lim, MEMORY_GRAPH_EMBEDDING_DIM],
      );
      const n = Array.isArray(rows) ? rows.length : 0;
      if (n > 0) {
        this.logger.log('memory_graph.sync_memory_nodes_2048', { companyId, upserted: n });
      }
      return { upserted: n };
    } catch (e: unknown) {
      this.logger.warn('memory_graph.sync_memory_nodes_2048_failed', {
        companyId,
        message: e instanceof Error ? e.message : String(e),
      });
      return { upserted: 0 };
    }
  }

  /**
   * 对非 2048 维的 memory_entries 重新 embed，写回条目并 upsert memory_nodes。
   * 依赖当前部署的 MEMORY_EMBEDDING_DIMENSIONS / 池化模型实际输出为 2048。
   */
  async reembedMemoryEntriesTo2048Batch(
    companyId: string,
    limit = 25,
  ): Promise<{ scanned: number; updated: number; skipped: number }> {
    if (limit === 0) return { scanned: 0, updated: 0, skipped: 0 };
    const lim = Math.min(200, Math.max(1, Math.floor(limit)));
    let rows: Array<{ id: string; content: string }>;
    try {
      rows = await this.dataSource.query(
        `
        SELECT id, content
        FROM memory_entries
        WHERE company_id = $1::uuid
          AND (array_length(embedding, 1) IS DISTINCT FROM $2)
        ORDER BY created_at DESC
        LIMIT $3
        `,
        [companyId, MEMORY_GRAPH_EMBEDDING_DIM, lim],
      );
    } catch (e: unknown) {
      this.logger.warn('memory_graph.reembed_2048_query_failed', {
        companyId,
        message: e instanceof Error ? e.message : String(e),
      });
      return { scanned: 0, updated: 0, skipped: 0 };
    }
    const list = Array.isArray(rows) ? rows : [];
    let updated = 0;
    let skipped = 0;
    for (const row of list) {
      const id = String(row.id ?? '').trim();
      const content = String(row.content ?? '');
      if (!id || !content.trim()) {
        skipped += 1;
        continue;
      }
      try {
        const vec = await this.embedding.embedText(content, { companyId });
        if (vec.embedding.length !== MEMORY_GRAPH_EMBEDDING_DIM) {
          this.logger.warn('memory_graph.reembed_2048_wrong_dim', {
            companyId,
            entryId: id,
            got: vec.embedding.length,
            expected: MEMORY_GRAPH_EMBEDDING_DIM,
          });
          skipped += 1;
          continue;
        }
        await this.dataSource.query(
          `UPDATE memory_entries SET embedding = $1::float8[] WHERE id = $2::uuid AND company_id = $3::uuid`,
          [vec.embedding, id, companyId],
        );
        await this.dataSource.query(
          `
          INSERT INTO memory_nodes (company_id, memory_entry_id, embedding)
          VALUES ($1::uuid, $2::uuid, $3::float8[])
          ON CONFLICT (memory_entry_id) DO UPDATE SET embedding = EXCLUDED.embedding, updated_at = now()
          `,
          [companyId, id, vec],
        );
        updated += 1;
      } catch (e: unknown) {
        this.logger.warn('memory_graph.reembed_2048_row_failed', {
          companyId,
          entryId: id,
          message: e instanceof Error ? e.message : String(e),
        });
        skipped += 1;
      }
    }
    if (updated > 0) {
      this.logger.log('memory_graph.reembed_entries_2048', { companyId, scanned: list.length, updated, skipped });
    }
    return { scanned: list.length, updated, skipped };
  }

  /**
   * 用 from_entry 上已存在的 2048 向量填充 memory_edges.embedding（边级快照）。
   */
  async backfillMemoryEdgeEmbeddings2048Batch(
    companyId: string,
    limit = 400,
  ): Promise<{ updated: number }> {
    if (limit === 0) return { updated: 0 };
    const lim = Math.min(5000, Math.max(1, Math.floor(limit)));
    let ids: Array<{ id: string }>;
    try {
      ids = await this.dataSource.query(
        `
        SELECT e.id
        FROM memory_edges e
        INNER JOIN memory_entries m ON m.id = e.from_entry_id
        WHERE e.company_id = $1::uuid
          AND e.embedding IS NULL
          AND array_length(m.embedding, 1) = $2
        LIMIT $3
        `,
        [companyId, MEMORY_GRAPH_EMBEDDING_DIM, lim],
      );
    } catch (e: unknown) {
      this.logger.warn('memory_graph.backfill_edge_emb_query_failed', {
        companyId,
        message: e instanceof Error ? e.message : String(e),
      });
      return { updated: 0 };
    }
    let updated = 0;
    for (const r of Array.isArray(ids) ? ids : []) {
      const edgeId = String((r as { id?: string }).id ?? '').trim();
      if (!edgeId) continue;
      try {
        const ret = await this.dataSource.query(
          `
          UPDATE memory_edges e
          SET embedding = m.embedding
          FROM memory_entries m
          WHERE e.id = $1::uuid
            AND e.company_id = $2::uuid
            AND m.id = e.from_entry_id
            AND array_length(m.embedding, 1) = $3
          RETURNING e.id
          `,
          [edgeId, companyId, MEMORY_GRAPH_EMBEDDING_DIM],
        );
        if (Array.isArray(ret) && ret.length > 0) updated += 1;
      } catch {
        /* ignore row */
      }
    }
    if (updated > 0) {
      this.logger.log('memory_graph.backfill_edge_embeddings_2048', { companyId, updated });
    }
    return { updated };
  }

  /**
   * 一键顺序执行：同步节点 → 重嵌入非 2048 条目 → 回填边向量（每步独立 limit）。
   */
  async runMemoryGraph2048BackfillPipeline(
    companyId: string,
    opts?: { syncNodesLimit?: number; reembedLimit?: number; edgeLimit?: number },
  ): Promise<{
    syncNodes: { upserted: number };
    reembed: { scanned: number; updated: number; skipped: number };
    edges: { updated: number };
  }> {
    const syncNodes = await this.syncMemoryNodes2048FromEntriesBatch(
      companyId,
      opts?.syncNodesLimit ?? 500,
    );
    const reembed = await this.reembedMemoryEntriesTo2048Batch(companyId, opts?.reembedLimit ?? 25);
    const edges = await this.backfillMemoryEdgeEmbeddings2048Batch(companyId, opts?.edgeLimit ?? 400);
    return { syncNodes, reembed, edges };
  }
}
