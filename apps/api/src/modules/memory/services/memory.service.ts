import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
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
import { extractTextFromDocumentBuffer } from '../utils/memory-document-text.js';
import { MemoryCollection } from '../entities/memory-collection.entity.js';
import {
  MemoryEntry,
  type MemorySourceType,
} from '../entities/memory-entry.entity.js';
import type { MemoryActor } from './memory-access.service.js';
import { MemoryAccessService } from './memory-access.service.js';
import { EmbeddingService } from './embedding.service.js';

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

  async storeEntry(params: StoreMemoryParams): Promise<MemoryEntry> {
    if (!params.skipAccessCheck) {
      this.access.assertStoreNamespace(params.namespace, params.actor);
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
    const collection = await this.ensureCollection(
      companyId,
      namespace,
      collectionLabel,
    );
    const emb =
      params.embedding ?? (await this.embedding.embedText(content));
    if (emb.length !== this.embedding.dimensions) {
      throw new UnprocessableEntityException({
        code: 'MEMORY_EMBEDDING_DIM_MISMATCH',
        message: `向量维度必须为 ${this.embedding.dimensions}，当前 ${emb.length}`,
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
    });

    return row;
  }

  private async publishEmbeddingBilling(params: {
    companyId: string;
    entryId: string;
    contentLength: number;
    namespace: string;
    sourceType: string;
  }): Promise<void> {
    const inputTokens = Math.max(1, Math.ceil(params.contentLength / 4));
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
        inputTokens,
        idempotencyKey: `mem-emb:${params.entryId}`,
        metadata: {
          namespace: params.namespace,
          sourceType: params.sourceType,
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
    const buf = await this.storage.download(params.storagePath);
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
      });
    }
    return { chunks: chunks.length, detectedAs };
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
  }): Promise<{ correlationId: string; accepted: true }> {
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
