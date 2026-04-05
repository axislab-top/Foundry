import { apiClient } from './apiClient';

/** Matches apps/api MemoryRetrieverService MemorySearchHit */
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

export type MemorySourceType =
  | 'chat'
  | 'task'
  | 'skill'
  | 'document'
  | 'summary'
  | 'manual';

export interface MemorySearchBody {
  query: string;
  namespaces?: string[];
  sourceTypes?: MemorySourceType[];
  keyword?: string;
  topK?: number;
  createdAfter?: string;
  createdBefore?: string;
  agentId?: string;
  organizationNodeId?: string;
  roomId?: string;
}

/**
 * Semantic memory search (RAG). Gateway merges `actor` + `companyId` from JWT / x-company-id.
 */
export async function searchMemory(body: { data: MemorySearchBody }): Promise<MemorySearchHit[]> {
  const { data } = await apiClient.post<unknown>('/v1/memory/search', body);
  return data as MemorySearchHit[];
}

export interface MemorySummarizeResult {
  summary: string;
  structured?: unknown;
}

export async function summarizeMemory(body: {
  data: {
    texts: string[];
    context?: string;
    structured?: boolean;
    persist?: boolean;
    persistNamespace?: string;
  };
}): Promise<MemorySummarizeResult> {
  const { data } = await apiClient.post<unknown>('/v1/memory/summarize', body);
  return data as MemorySummarizeResult;
}

export async function ingestDocumentAsync(body: {
  data: {
    storagePath: string;
    namespace: string;
    collectionLabel?: string;
    maxChunkChars?: number;
  };
}): Promise<{ correlationId: string; accepted: true }> {
  const { data } = await apiClient.post<unknown>('/v1/memory/documents/ingest-async', body);
  return data as { correlationId: string; accepted: true };
}
