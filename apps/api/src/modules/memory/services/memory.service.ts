import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { MessagingService } from '@service/messaging';
import type {
  BillingConsumptionRequestedEvent,
  MemoryCollectionCreatedEvent,
  MemoryEntryStoredEvent,
  MemoryIngestAsyncRequestedEvent,
  MemoryStoreRequestedEvent,
} from '@contracts/events';
import { StorageService } from '../../files/storage/storage.service.js';
import { normalizeStorageKey } from '../../files/storage/storage-tenant-path.util.js';
import { extractTextFromDocumentBuffer } from '../utils/memory-document-text.js';
import { MemoryCollection } from '../entities/memory-collection.entity.js';
import {
  MemoryEntry,
  type MemoryRetentionClass,
  type MemorySourceType,
} from '../entities/memory-entry.entity.js';
import type { MemoryActor } from './memory-access.service.js';
import { MemoryAccessService } from './memory-access.service.js';
import { EmbeddingService, type EmbedTextProvenance } from './embedding.service.js';
import { CollaborationRealtimePublisher } from '../../collaboration/services/collaboration-realtime-publisher.service.js';
import { MemoryMetricsService } from './memory-metrics.service.js';
import { ImportanceScorerService } from './importance-scorer.service.js';
import { MemoryGovernanceGuardService } from './memory-governance-guard.service.js';
import { EventDeduplicatorService } from './event-deduplicator.service.js';
import { ConfigService } from '../../../common/config/config.service.js';
import { MemoryGraphService } from './memory-graph.service.js';
import { BillingService } from '../../billing/services/billing.service.js';
import { modelPricingToSnapshotJson } from '../../billing/services/billing-pricing-snapshot.util.js';

export interface StoreMemoryParams {
  companyId: string;
  namespace: string;
  collectionLabel?: string;
  content: string;
  sourceType: MemorySourceType;
  sourceRef?: string | null;
  metadata?: Record<string, unknown> | null;
  embedding?: number[];
  isSensitive?: boolean;
  /** 消息监听器等系统入口跳过命名空间 ACL */
  skipAccessCheck?: boolean;
  actor?: MemoryActor;
  importanceScore?: number;
  cycleDepth?: number;
  lineageHash?: string | null;
  retentionClass?: MemoryRetentionClass;
  decayAt?: Date | null;
  blockedReason?: string | null;
}

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    @InjectRepository(MemoryCollection)
    private readonly collectionsRepo: Repository<MemoryCollection>,
    @InjectRepository(MemoryEntry)
    private readonly entriesRepo: Repository<MemoryEntry>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly embedding: EmbeddingService,
    private readonly messaging: MessagingService,
    private readonly access: MemoryAccessService,
    private readonly storage: StorageService,
    private readonly metrics: MemoryMetricsService,
    private readonly importanceScorer: ImportanceScorerService,
    private readonly governanceGuard: MemoryGovernanceGuardService,
    private readonly eventDeduplicator: EventDeduplicatorService,
    private readonly configService: ConfigService,
    private readonly memoryGraph: MemoryGraphService,
    private readonly billing: BillingService,
    @Optional() private readonly realtime?: CollaborationRealtimePublisher,
  ) {}

  async ensureCollection(
    companyId: string,
    namespace: string,
    label?: string,
    reason: MemoryCollectionCreatedEvent['data']['reason'] = 'manual',
  ): Promise<MemoryCollection> {
    const existing = await this.collectionsRepo.findOne({
      where: { companyId, namespace },
    });
    if (existing) return existing;
    try {
      const created = this.collectionsRepo.create({
        companyId,
        namespace,
        label: label ?? null,
        metadata: null,
      });
      const saved = await this.collectionsRepo.save(created);
      await this.publishCollectionCreated(companyId, saved, reason);
      return saved;
    } catch (e: any) {
      if (e?.code === '23505') {
        const again = await this.collectionsRepo.findOne({
          where: { companyId, namespace },
        });
        if (again) return again;
      }
      throw e;
    }
  }

  async storeEntry(params: StoreMemoryParams): Promise<MemoryEntry | null> {
    if (!this.configService.get<boolean>('MEMORY_GOVERNANCE_V2_ENABLED', false)) {
      return this.legacyStoreEntry(params);
    }

    const guardResult = await this.governanceGuard.guard({
      companyId: params.companyId,
      namespace: params.namespace,
      content: params.content,
      sourceType: params.sourceType,
      actor: params.actor,
      metadata: params.metadata,
      cycleDepth: params.cycleDepth,
      isSensitive: params.isSensitive,
    });
    if (!guardResult.allowed) {
      this.logger.warn(`Memory write blocked: ${guardResult.reason}`);
      this.metrics.inc('memory_write_blocked', { reason: guardResult.reason ?? 'unknown' });
      return null;
    }

    const scored = await this.importanceScorer.score({
      companyId: params.companyId,
      namespace: params.namespace,
      content: params.content,
      sourceType: params.sourceType,
      actorRoles: params.actor?.roles,
      metadata: params.metadata,
    });
    params.importanceScore = scored.importance_score;
    params.cycleDepth = (params.cycleDepth ?? 0) + 1;
    params.retentionClass = scored.retention_class;
    params.decayAt = scored.decay_at;
    params.lineageHash = guardResult.lineageHash ?? params.lineageHash ?? null;
    params.metadata = {
      ...(params.metadata ?? {}),
      salienceBand: scored.salience_band,
    };

    if (!params.skipAccessCheck) {
      await this.access.assertStoreNamespace(params.namespace, params.actor);
    }
    const {
      companyId,
      namespace,
      collectionLabel,
      content,
      sourceType,
      sourceRef,
      metadata,
      isSensitive,
      importanceScore,
      cycleDepth,
      lineageHash,
      retentionClass,
      decayAt,
      blockedReason,
    } = params;
    const collection = await this.ensureCollection(
      companyId,
      namespace,
      collectionLabel,
    );
    const expectedDim = await this.embedding.resolveEffectiveEmbeddingDimensions({ companyId });
    let emb: number[];
    let embedProvenance: EmbedTextProvenance | null = null;
    if (params.embedding) {
      emb = params.embedding;
    } else {
      const er = await this.embedding.embedText(content, {
        companyId,
        agentId: params.actor?.id,
      });
      emb = er.embedding;
      embedProvenance = er.provenance;
    }
    if (emb.length !== expectedDim) {
      throw new UnprocessableEntityException({
        code: 'MEMORY_EMBEDDING_DIM_MISMATCH',
        message: `向量维度必须为 ${expectedDim}，当前 ${emb.length}`,
      });
    }

    await this.publishStoreRequested(companyId, {
      namespace,
      sourceType,
      contentLength: content.length,
    });

    const id = randomUUID();
    const sensitive = Boolean(isSensitive);

    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.dataSource.query(
          `
          INSERT INTO memory_entries
            (id, company_id, collection_id, content, embedding, metadata, source_type, source_ref, created_at, is_sensitive, importance_score, cycle_depth, lineage_hash, retention_class, decay_at, blocked_reason)
          VALUES
            ($1, $2, $3, $4, $5::float8[], $6::jsonb, $7, $8, CURRENT_TIMESTAMP, $9, $10, $11, $12, $13, $14, $15)
          `,
          [
            id,
            companyId,
            collection.id,
            content,
            emb,
            metadata ? JSON.stringify(metadata) : null,
            sourceType,
            sourceRef ?? null,
            sensitive,
            Number((importanceScore ?? 0.5).toFixed(2)),
            cycleDepth ?? 0,
            lineageHash ?? null,
            retentionClass ?? 'medium',
            decayAt ?? null,
            blockedReason ?? null,
          ],
        );
        lastErr = undefined;
        break;
      } catch (e: any) {
        lastErr = e;
        if (e?.code === '23505') {
          throw new ConflictException({
            message: '该来源的记忆已存在',
            code: 'MEMORY_DUPLICATE_SOURCE',
          });
        }
        if (
          e?.code === '42703' ||
          /(is_sensitive|importance_score|cycle_depth|lineage_hash|retention_class|decay_at|blocked_reason)/.test(
            String(e?.message),
          )
        ) {
          await this.dataSource.query(
            `
            INSERT INTO memory_entries
              (id, company_id, collection_id, content, embedding, metadata, source_type, source_ref, created_at)
            VALUES
              ($1, $2, $3, $4, $5::float8[], $6::jsonb, $7, $8, CURRENT_TIMESTAMP)
            `,
            [
              id,
              companyId,
              collection.id,
              content,
              emb,
              metadata ? JSON.stringify(metadata) : null,
              sourceType,
              sourceRef ?? null,
            ],
          );
          lastErr = undefined;
          break;
        }
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }
    if (lastErr) throw lastErr;

    const row = await this.entriesRepo.findOneOrFail({ where: { id } });
    if (lineageHash) {
      await this.eventDeduplicator.rememberEvent({
        companyId,
        eventType: 'memory.write.lineage',
        idempotencyKey: lineageHash,
      });
    }

    await this.publishStored(companyId, {
      entryId: id,
      collectionId: collection.id,
      namespace,
      sourceType,
      contentLength: content.length,
    });

    await this.publishEmbeddingBilling({
      companyId,
      entryId: id,
      contentLength: content.length,
      namespace,
      sourceType,
      importanceScore: Number((importanceScore ?? 0.5).toFixed(2)),
      provenance: embedProvenance,
    });

    await this.realtime?.publishEnvelope({
      companyId,
      event: 'memory:ingested',
      payload: {
        entryId: id,
        namespace,
        sourceType,
        createdAt: new Date().toISOString(),
      },
    });

    return row;
  }

  private async legacyStoreEntry(params: StoreMemoryParams): Promise<MemoryEntry> {
    if (!params.skipAccessCheck) {
      await this.access.assertStoreNamespace(params.namespace, params.actor);
    }
    const {
      companyId,
      namespace,
      collectionLabel,
      content,
      sourceType,
      sourceRef,
      metadata,
      isSensitive,
    } = params;
    const collection = await this.ensureCollection(companyId, namespace, collectionLabel);
    const expectedDim = await this.embedding.resolveEffectiveEmbeddingDimensions({ companyId });
    let emb: number[];
    let embedProvenance: EmbedTextProvenance | null = null;
    if (params.embedding) {
      emb = params.embedding;
    } else {
      const er = await this.embedding.embedText(content, {
        companyId,
        agentId: params.actor?.id,
      });
      emb = er.embedding;
      embedProvenance = er.provenance;
    }
    if (emb.length !== expectedDim) {
      throw new UnprocessableEntityException({
        code: 'MEMORY_EMBEDDING_DIM_MISMATCH',
        message: `向量维度必须为 ${expectedDim}，当前 ${emb.length}`,
      });
    }

    await this.publishStoreRequested(companyId, {
      namespace,
      sourceType,
      contentLength: content.length,
    });

    const id = randomUUID();
    const sensitive = Boolean(isSensitive);

    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.dataSource.query(
          `
          INSERT INTO memory_entries
            (id, company_id, collection_id, content, embedding, metadata, source_type, source_ref, created_at, is_sensitive)
          VALUES
            ($1, $2, $3, $4, $5::float8[], $6::jsonb, $7, $8, CURRENT_TIMESTAMP, $9)
          `,
          [
            id,
            companyId,
            collection.id,
            content,
            emb,
            metadata ? JSON.stringify(metadata) : null,
            sourceType,
            sourceRef ?? null,
            sensitive,
          ],
        );
        lastErr = undefined;
        break;
      } catch (e: any) {
        lastErr = e;
        if (e?.code === '23505') {
          throw new ConflictException({
            message: '该来源的记忆已存在',
            code: 'MEMORY_DUPLICATE_SOURCE',
          });
        }
        if (e?.code === '42703' || /is_sensitive/.test(String(e?.message))) {
          await this.dataSource.query(
            `
            INSERT INTO memory_entries
              (id, company_id, collection_id, content, embedding, metadata, source_type, source_ref, created_at)
            VALUES
              ($1, $2, $3, $4, $5::float8[], $6::jsonb, $7, $8, CURRENT_TIMESTAMP)
            `,
            [
              id,
              companyId,
              collection.id,
              content,
              emb,
              metadata ? JSON.stringify(metadata) : null,
              sourceType,
              sourceRef ?? null,
            ],
          );
          lastErr = undefined;
          break;
        }
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }
    if (lastErr) throw lastErr;

    const row = await this.entriesRepo.findOneOrFail({ where: { id } });
    await this.publishStored(companyId, {
      entryId: id,
      collectionId: collection.id,
      namespace,
      sourceType,
      contentLength: content.length,
    });
    await this.publishEmbeddingBilling({
      companyId,
      entryId: id,
      contentLength: content.length,
      namespace,
      sourceType,
      provenance: embedProvenance,
    });
    await this.realtime?.publishEnvelope({
      companyId,
      event: 'memory:ingested',
      payload: {
        entryId: id,
        namespace,
        sourceType,
        createdAt: new Date().toISOString(),
      },
    });
    return row;
  }

  async storeSummary(params: Omit<StoreMemoryParams, 'sourceType'>): Promise<MemoryEntry | null> {
    const row = await this.storeEntry({
      ...params,
      sourceType: 'summary',
    });
    if (!row) return row;

    // Graph V2: 在成功写入 summary 后记录 summarizes 边（可追溯）。
    // - 不强制旧数据回填
    // - 仅当调用方提供 sourceEntryIds（已解析为 memory_entries.id）时写边
    if (this.configService.isMemoryGraphV2Enabled()) {
      const sourceEntryIds = Array.isArray((params.metadata as any)?.sourceEntryIds)
        ? (((params.metadata as any)?.sourceEntryIds ?? []) as unknown[]).filter(
            (x): x is string => typeof x === 'string' && x.length > 0,
          )
        : [];
      if (sourceEntryIds.length) {
        await this.memoryGraph.promoteWithEdge({
          companyId: params.companyId,
          summaryEntryId: row.id,
          sourceEntryIds,
          edgeType: 'summarizes',
          metadata: {
            kind: 'summary_lineage',
            namespace: params.namespace,
          },
        });
      }
    }

    return row;
  }

  private async publishEmbeddingBilling(params: {
    companyId: string;
    entryId: string;
    contentLength: number;
    namespace: string;
    sourceType: string;
    importanceScore?: number;
    /** 来自真实 Embed 调用；null 时不发布（预计算向量 / 确定性伪向量） */
    provenance: EmbedTextProvenance | null;
  }): Promise<void> {
    if (!params.provenance) {
      return;
    }

    const pricing = await this.billing.resolveEffectiveModelPricing(
      params.companyId,
      params.provenance.modelName,
      new Date(),
      params.provenance.llmModelId,
    );
    const pricingSnapshotJson = pricing ? modelPricingToSnapshotJson(pricing) : undefined;

    const importance = typeof params.importanceScore === 'number' ? params.importanceScore : 0.5;
    const tier = importance >= 0.8 ? 'high' : importance <= 0.3 ? 'low' : 'standard';
    const event: BillingConsumptionRequestedEvent = {
      eventId: randomUUID(),
      eventType: 'billing.consumption.requested',
      aggregateId: params.entryId,
      aggregateType: 'billing',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: params.companyId,
      data: {
        companyId: params.companyId,
        recordType: 'embedding',
        modelName: params.provenance.modelName,
        llmModelId: params.provenance.llmModelId ?? undefined,
        llmKeyId: params.provenance.llmKeyId ?? undefined,
        inputTokens: params.provenance.inputTokens,
        idempotencyKey: `mem-emb:${params.entryId}`,
        pricingSnapshotJson,
        pricingSource: pricingSnapshotJson ? 'snapshot' : undefined,
        metadata: {
          namespace: params.namespace,
          sourceType: params.sourceType,
          importanceScore: Number(importance.toFixed(2)),
          importanceTier: tier,
        },
      },
    };
    await this.messaging.publish(event, {
      routingKey: 'billing.consumption.requested',
      persistent: true,
    });
  }

  /**
   * 从存储拉取文本文件，按块写入记忆（.txt / utf-8 JSON 等）
   */
  async ingestTextFile(params: {
    companyId: string;
    storagePath: string;
    namespace: string;
    actor?: MemoryActor;
    collectionLabel?: string;
    maxChunkChars?: number;
  }): Promise<{ chunks: number; detectedAs?: 'pdf' | 'utf8' }> {
    MemoryService.assertMemoryIngestStoragePathForCompany(params.companyId, params.storagePath);
    const buf = await this.storage.download(
      params.companyId,
      params.storagePath,
    );
    let text: string;
    let detectedAs: 'pdf' | 'utf8' | undefined;
    try {
      const extracted = await extractTextFromDocumentBuffer(
        buf,
        params.storagePath,
      );
      text = extracted.text;
      detectedAs = extracted.detectedAs;
    } catch (e: any) {
      throw new BadRequestException({
        code: 'MEMORY_DOCUMENT_DECODE',
        message:
          e?.message?.includes('Password') || e?.message?.includes('encrypted')
            ? 'PDF 已加密，无法解析'
            : '无法解析文档内容（PDF/文本）',
      });
    }
    if (!text.trim()) {
      throw new BadRequestException({
        code: 'MEMORY_DOCUMENT_EMPTY',
        message: '文件内容为空',
      });
    }
    const max = Math.min(params.maxChunkChars ?? 4000, 32000);
    const chunks = chunkText(text, max);

    // Opt 4: batch-embed all chunks in a single API call
    const embeddings = await this.embedding.embedTexts(chunks, {
      companyId: params.companyId,
    });

    for (let i = 0; i < chunks.length; i++) {
      await this.storeEntry({
        companyId: params.companyId,
        namespace: params.namespace,
        collectionLabel: params.collectionLabel ?? `Document: ${params.storagePath}`,
        content: chunks[i],
        sourceType: 'document',
        metadata: {
          path: params.storagePath,
          chunkIndex: i,
          chunkCount: chunks.length,
          documentFormat: detectedAs,
        },
        actor: params.actor,
        embedding: embeddings[i]?.embedding,
      });
    }
    return { chunks: chunks.length, detectedAs };
  }

  /**
   * Sprint 2：ingest 源文件必须落在本公司对象命名空间（与 Runner workspace / P1 存储一致）。
   * 允许 `companies/{companyId}/...` 与只读兼容的 legacy `memory/{companyId}/...`。
   */
  static assertMemoryIngestStoragePathForCompany(
    companyId: string,
    rawPath: string,
  ): void {
    const p = normalizeStorageKey(rawPath);
    const ok =
      p.startsWith(`companies/${companyId}/`) || p.startsWith(`memory/${companyId}/`);
    if (!ok) {
      throw new BadRequestException({
        code: 'MEMORY_STORAGE_NOT_COMPANY_SCOPED',
        message:
          'storagePath must be under companies/{companyId}/ or legacy memory/{companyId}/ for ingest',
      });
    }
  }

  /**
   * 发布异步文档摄入请求，由 Worker 消费后 RPC 调回 {@link ingestTextFile}。
   */
  async publishDocumentIngestAsync(params: {
    companyId: string;
    storagePath: string;
    namespace: string;
    collectionLabel?: string | null;
    maxChunkChars?: number;
    fileAssetId?: string;
  }): Promise<{ correlationId: string; accepted: true }> {
    MemoryService.assertMemoryIngestStoragePathForCompany(params.companyId, params.storagePath);
    const correlationId = randomUUID();
    const event: MemoryIngestAsyncRequestedEvent = {
      eventId: randomUUID(),
      eventType: 'memory.ingest.async.requested',
      aggregateId: correlationId,
      aggregateType: 'memory_document',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: params.companyId,
      data: {
        companyId: params.companyId,
        storagePath: params.storagePath,
        namespace: params.namespace,
        collectionLabel: params.collectionLabel ?? null,
        maxChunkChars: params.maxChunkChars,
        correlationId,
        requestedAt: new Date().toISOString(),
        fileAssetId: params.fileAssetId ?? null,
      },
    };
    await this.messaging.publish(event, {
      routingKey: 'memory.ingest.async.requested',
      persistent: true,
    });
    return { correlationId, accepted: true as const };
  }

  private async publishStoreRequested(
    companyId: string,
    data: { namespace: string; sourceType: string; contentLength: number },
  ): Promise<void> {
    try {
      const event: MemoryStoreRequestedEvent = {
        eventId: randomUUID(),
        eventType: 'memory.store.requested',
        aggregateId: companyId,
        aggregateType: 'memory_entry',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          companyId,
          namespace: data.namespace,
          sourceType: data.sourceType,
          contentLength: data.contentLength,
          requestedAt: new Date().toISOString(),
        },
      };
      await this.messaging.publish(event, {
        routingKey: 'memory.store.requested',
        persistent: true,
      });
    } catch (e: any) {
      this.logger.warn('publish memory.store.requested failed', {
        error: e?.message,
      });
    }
  }

  private async publishStored(
    companyId: string,
    data: {
      entryId: string;
      collectionId: string;
      namespace: string;
      sourceType: string;
      contentLength: number;
    },
  ): Promise<void> {
    try {
      const event: MemoryEntryStoredEvent = {
        eventId: randomUUID(),
        eventType: 'memory.entry.stored',
        aggregateId: data.entryId,
        aggregateType: 'memory_entry',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          entryId: data.entryId,
          collectionId: data.collectionId,
          namespace: data.namespace,
          sourceType: data.sourceType,
          contentLength: data.contentLength,
          storedAt: new Date().toISOString(),
        },
      };
      await this.messaging.publish(event, {
        routingKey: 'memory.entry.stored',
        persistent: true,
      });
    } catch (e: any) {
      this.logger.warn('publish memory.entry.stored failed', {
        error: e?.message,
      });
    }
  }

  /**
   * Sprint 3.2：公司迁移包导出（不含 embedding；内容启发式脱敏）。
   * 调用方须为平台管理员或 Runner system actor（见 RPC 校验）。
   */
  async exportMigrationBundle(params: {
    companyId: string;
    actor: MemoryActor;
  }): Promise<{
    formatVersion: '3.2';
    exportedAt: string;
    companyId: string;
    entries: Array<{
      namespace: string;
      collectionLabel: string | null;
      content: string;
      summary: string | null;
      metadata: Record<string, unknown> | null;
      sourceType: MemorySourceType;
      sourceRef: string | null;
      isSensitive: boolean;
      originalEntryId: string;
      createdAt: string;
    }>;
    redaction: { mode: 'heuristic_v1'; note: string };
    piiScan: 'placeholder_pending_full_scan';
  }> {
    MemoryService.assertPlatformMigrationActor(params.actor);
    const rows = (await this.dataSource.query(
      `
      SELECT me.id, me.content, me.summary, me.metadata, me.source_type, me.source_ref,
             me.is_sensitive, me.created_at,
             mc.namespace, mc.label AS collection_label
      FROM memory_entries me
      JOIN memory_collections mc ON mc.id = me.collection_id
      WHERE me.company_id = $1
      ORDER BY me.created_at ASC
      `,
      [params.companyId],
    )) as Array<{
      id: string;
      content: string;
      summary: string | null;
      metadata: unknown;
      source_type: string;
      source_ref: string | null;
      is_sensitive: boolean;
      created_at: Date;
      namespace: string;
      collection_label: string | null;
    }>;

    const entries = rows.map((r) => ({
      namespace: r.namespace,
      collectionLabel: r.collection_label,
      content: redactMigrationText(r.content),
      summary: r.summary ? redactMigrationText(r.summary) : null,
      metadata: (r.metadata ?? null) as Record<string, unknown> | null,
      sourceType: r.source_type as MemorySourceType,
      sourceRef: r.source_ref,
      isSensitive: Boolean(r.is_sensitive),
      originalEntryId: r.id,
      createdAt:
        r.created_at instanceof Date
          ? r.created_at.toISOString()
          : String(r.created_at),
    }));

    return {
      formatVersion: '3.2',
      exportedAt: new Date().toISOString(),
      companyId: params.companyId,
      entries,
      redaction: {
        mode: 'heuristic_v1',
        note: 'Email/phone-like patterns replaced; full PII scan is pending productization.',
      },
      piiScan: 'placeholder_pending_full_scan',
    };
  }

  /**
   * Sprint 3.2：将迁移包写入目标公司（重新生成向量与计费事件）。
   */
  async importMigrationBundle(params: {
    targetCompanyId: string;
    actor: MemoryActor;
    bundle: {
      formatVersion: string;
      entries: Array<{
        namespace: string;
        collectionLabel?: string | null;
        content: string;
        summary?: string | null;
        metadata?: Record<string, unknown> | null;
        sourceType: MemorySourceType;
        sourceRef?: string | null;
        isSensitive?: boolean;
      }>;
    };
  }): Promise<{ imported: number }> {
    MemoryService.assertPlatformMigrationActor(params.actor);
    if (params.bundle.formatVersion !== '3.2') {
      throw new BadRequestException({
        code: 'MEMORY_MIGRATION_FORMAT',
        message: `Unsupported bundle formatVersion: ${params.bundle.formatVersion}`,
      });
    }
    let n = 0;
    for (const e of params.bundle.entries) {
      await this.storeEntry({
        companyId: params.targetCompanyId,
        namespace: e.namespace,
        collectionLabel: e.collectionLabel ?? undefined,
        content: e.content,
        sourceType: e.sourceType,
        sourceRef: e.sourceRef ?? null,
        metadata: {
          ...(e.metadata ?? {}),
          migrationImport: true,
        },
        isSensitive: Boolean(e.isSensitive),
        actor: params.actor,
        skipAccessCheck: true,
      });
      n += 1;
    }
    return { imported: n };
  }

  /**
   * 浏览模式：纯 SQL 按 namespace 分页查询，不调 embedding。
   * 用于前端记忆页面空查询时的列表展示。
   */
  async listEntries(params: {
    companyId: string;
    namespaces?: string[];
    sourceTypes?: string[];
    createdAfter?: string;
    topK?: number;
  }): Promise<
    Array<{
      id: string;
      collectionId: string;
      namespace: string;
      content: string;
      metadata: Record<string, unknown> | null;
      sourceType: string;
      isSensitive: boolean;
      importanceScore: number;
      createdAt: string;
    }>
  > {
    const topK = Math.min(Math.max(params.topK ?? 50, 1), 100);

    const conditions: string[] = ['me.company_id = $1', 'me.blocked_reason IS NULL'];
    const values: unknown[] = [params.companyId];
    let idx = 2;

    if (params.namespaces?.length) {
      conditions.push(`mc.namespace = ANY($${idx}::text[])`);
      values.push(params.namespaces);
      idx++;
    }
    if (params.sourceTypes?.length) {
      conditions.push(`me.source_type = ANY($${idx}::text[])`);
      values.push(params.sourceTypes);
      idx++;
    }
    if (params.createdAfter) {
      conditions.push(`me.created_at >= $${idx}`);
      values.push(params.createdAfter);
      idx++;
    }

    values.push(topK);

    const sql = `
      SELECT me.id, me.collection_id AS "collectionId", mc.namespace,
             me.content, me.metadata, me.source_type AS "sourceType",
             me.is_sensitive AS "isSensitive", me.importance_score AS "importanceScore",
             me.created_at AS "createdAt"
      FROM memory_entries me
      INNER JOIN memory_collections mc ON mc.id = me.collection_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY me.created_at DESC
      LIMIT $${idx}
    `;

    const rows = await this.dataSource.query(sql, values);
    return rows.map((r: any) => ({
      id: String(r.id),
      collectionId: String(r.collectionId),
      namespace: String(r.namespace),
      content: String(r.content ?? ''),
      metadata: (r.metadata ?? null) as Record<string, unknown> | null,
      sourceType: String(r.sourceType ?? 'manual'),
      isSensitive: Boolean(r.isSensitive),
      importanceScore: Number(r.importanceScore ?? 0.5),
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
    }));
  }

  async setEntryArchivedStatus(params: {
    companyId: string;
    entryId: string;
    archived: boolean;
    actor?: MemoryActor;
  }): Promise<{ ok: true; id: string; status: 'active' | 'archived' }> {
    const row = await this.entriesRepo.findOne({
      where: {
        id: params.entryId,
        companyId: params.companyId,
      },
      relations: ['collection'],
    } as any);
    if (!row) {
      throw new BadRequestException({
        code: 'MEMORY_ENTRY_NOT_FOUND',
        message: 'memory entry not found',
      });
    }
    const collection = await this.collectionsRepo.findOne({
      where: { id: row.collectionId, companyId: params.companyId },
    });
    if (!collection) {
      throw new BadRequestException({
        code: 'MEMORY_COLLECTION_NOT_FOUND',
        message: 'memory collection not found',
      });
    }
    await this.access.assertStoreNamespace(collection.namespace, params.actor);
    const mergedMeta = {
      ...((row.metadata ?? {}) as Record<string, unknown>),
      status: params.archived ? 'archived' : 'active',
      archivedAt: params.archived ? new Date().toISOString() : null,
    };
    await this.entriesRepo.update(
      { id: params.entryId, companyId: params.companyId },
      { metadata: mergedMeta },
    );
    return {
      ok: true,
      id: params.entryId,
      status: params.archived ? 'archived' : 'active',
    };
  }

  private static assertPlatformMigrationActor(actor: MemoryActor | undefined): void {
    const roles = new Set((actor?.roles ?? []).map((r) => String(r).toLowerCase()));
    if (roles.has('admin') || roles.has('superadmin') || roles.has('system')) {
      return;
    }
    throw new ForbiddenException({
      code: 'MEMORY_MIGRATION_FORBIDDEN',
      message: 'Platform admin or system actor required',
    });
  }

  private async publishCollectionCreated(
    companyId: string,
    col: MemoryCollection,
    reason: MemoryCollectionCreatedEvent['data']['reason'],
  ): Promise<void> {
    try {
      const event: MemoryCollectionCreatedEvent = {
        eventId: randomUUID(),
        eventType: 'memory.collection.created',
        aggregateId: col.id,
        aggregateType: 'memory_collection',
        occurredAt: new Date().toISOString(),
        version: 1,
        companyId,
        data: {
          companyId,
          collectionId: col.id,
          namespace: col.namespace,
          label: col.label,
          reason,
          createdAt: new Date().toISOString(),
        },
      };
      await this.messaging.publish(event, {
        routingKey: 'memory.collection.created',
        persistent: true,
      });
    } catch (e: any) {
      this.logger.warn('publish memory.collection.created failed', {
        error: e?.message,
      });
    }
  }
}

function redactMigrationText(text: string): string {
  let s = text;
  s = s.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]');
  s = s.replace(
    /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,6}\b/g,
    '[REDACTED_PHONE]',
  );
  return s;
}

function chunkText(text: string, maxChars: number): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (normalized.length <= maxChars) return [normalized];
  const parts: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + maxChars, normalized.length);
    if (end < normalized.length) {
      const slice = normalized.slice(start, end);
      const breakAt = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('\n'));
      if (breakAt > 200) {
        end = start + breakAt;
      }
    }
    parts.push(normalized.slice(start, end).trim());
    start = end;
  }
  return parts.filter(Boolean);
}
