/**
 * Memory 领域事件：异步流水线、审计、计费观测
 */

import type { BaseEvent } from './base-event.js';

export interface MemoryStoreRequestedEvent extends BaseEvent {
  eventType: 'memory.store.requested';
  aggregateType: 'memory_entry';
  data: {
    companyId: string;
    namespace: string;
    sourceType: string;
    contentLength: number;
    requestedAt: string;
    correlationId?: string;
  };
}

export interface MemoryRetrievedEvent extends BaseEvent {
  eventType: 'memory.retrieved';
  aggregateType: 'memory_retrieval';
  data: {
    companyId: string;
    queryLength: number;
    hitCount: number;
    namespaces?: string[];
    durationMs: number;
    retrievedAt: string;
    /** 结构化路由 / 观测（可选） */
    strategy?: 'search' | 'hierarchy';
    scope?: 'company' | 'department' | 'personal' | 'hierarchy';
    minScore?: number;
    hitEntryIds?: string[];
  };
}

export interface MemorySummaryGeneratedEvent extends BaseEvent {
  eventType: 'memory.summary.generated';
  aggregateType: 'memory_summary';
  data: {
    companyId: string;
    source: 'rpc' | 'room' | 'manual';
    summaryLength: number;
    chunkCount?: number;
    generatedAt: string;
    roomId?: string;
  };
}

export interface MemoryCollectionCreatedEvent extends BaseEvent {
  eventType: 'memory.collection.created';
  aggregateType: 'memory_collection';
  data: {
    companyId: string;
    collectionId: string;
    namespace: string;
    label?: string | null;
    reason: 'company.bootstrap' | 'organization.node' | 'agent.created' | 'manual';
    createdAt: string;
  };
}

export interface MemoryEntryStoredEvent extends BaseEvent {
  eventType: 'memory.entry.stored';
  aggregateType: 'memory_entry';
  data: {
    entryId: string;
    collectionId: string;
    namespace: string;
    sourceType: string;
    contentLength: number;
    storedAt: string;
  };
}

export interface MemoryEntryPromotedEvent extends BaseEvent {
  eventType: 'memory.entry.promoted';
  aggregateType: 'memory_entry';
  data: {
    companyId: string;
    sourceEntryId?: string;
    sourceNamespace: string;
    targetNamespace: string;
    promotedBy: 'worker.consolidation' | 'manual';
    promotedAt: string;
  };
}

/** Worker 异步摄入：大文档经队列 offload，由 Worker RPC 调回 API 执行 memory.document.ingest */
export interface MemoryIngestAsyncRequestedEvent extends BaseEvent {
  eventType: 'memory.ingest.async.requested';
  aggregateType: 'memory_document';
  data: {
    companyId: string;
    storagePath: string;
    namespace: string;
    collectionLabel?: string | null;
    maxChunkChars?: number;
    correlationId: string;
    requestedAt: string;
    fileAssetId?: string | null;
  };
}

/** 历史回填：将 chat_messages 迁移写入 session 命名空间 */
export interface MemorySessionBackfillRequestedEvent extends BaseEvent {
  eventType: 'memory.session.backfill.requested';
  aggregateType: 'memory_backfill';
  data: {
    companyId: string;
    roomId?: string;
    batchSize?: number;
    requestedAt: string;
  };
}

export type MemoryEvent =
  | MemoryStoreRequestedEvent
  | MemoryRetrievedEvent
  | MemorySummaryGeneratedEvent
  | MemoryCollectionCreatedEvent
  | MemoryEntryStoredEvent
  | MemoryEntryPromotedEvent
  | MemoryIngestAsyncRequestedEvent
  | MemorySessionBackfillRequestedEvent;

export interface MemoryEventTopics {
  'memory.store.requested': MemoryStoreRequestedEvent;
  'memory.retrieved': MemoryRetrievedEvent;
  'memory.summary.generated': MemorySummaryGeneratedEvent;
  'memory.collection.created': MemoryCollectionCreatedEvent;
  'memory.entry.stored': MemoryEntryStoredEvent;
  'memory.entry.promoted': MemoryEntryPromotedEvent;
  'memory.ingest.async.requested': MemoryIngestAsyncRequestedEvent;
  'memory.session.backfill.requested': MemorySessionBackfillRequestedEvent;
}
