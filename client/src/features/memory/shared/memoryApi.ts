import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/shared/api/client";
import { memoryKeys } from "@/features/memory/shared/queryKeys";
import { resolveMemoryTitle } from "@/features/memory/shared/memoryDisplay";
import type {
  CreateMemoryPayload,
  MemoryEntryView,
  MemoryListParams,
  MemorySearchParams,
  MemoryStatus,
} from "@/features/memory/shared/types";

function unwrapPayload<T>(raw: unknown): T {
  const v = raw as any;
  if (v && typeof v === "object" && "data" in v) return unwrapPayload<T>(v.data);
  return raw as T;
}

function normalizeEntry(raw: any): MemoryEntryView {
  const metadata = (raw?.metadata ?? null) as Record<string, unknown> | null;
  const content = String(raw?.content ?? "");
  const tagsRaw = metadata?.tags;
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.filter((x): x is string => typeof x === "string")
    : [];
  const statusRaw = metadata?.status;
  const status: MemoryStatus = statusRaw === "archived" ? "archived" : "active";
  const entry: MemoryEntryView = {
    id: String(raw?.id ?? ""),
    collectionId: raw?.collectionId ? String(raw.collectionId) : undefined,
    namespace: String(raw?.namespace ?? ""),
    title: "",
    content,
    sourceType: String(raw?.sourceType ?? "manual"),
    score: typeof raw?.score === "number" ? raw.score : undefined,
    createdAt: raw?.createdAt ? String(raw.createdAt) : undefined,
    updatedAt: raw?.updatedAt ? String(raw.updatedAt) : undefined,
    isSensitive: Boolean(raw?.isSensitive),
    redacted: Boolean(raw?.redacted),
    tags,
    status,
    metadata,
  };
  entry.title = resolveMemoryTitle(entry);
  return entry;
}

export async function searchMemory(params: MemorySearchParams): Promise<MemoryEntryView[]> {
  const resp = await apiClient.post("/api/v1/memory/search", {
    data: params,
  });
  const payload = unwrapPayload<any>(resp.data);
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.hits) ? payload.hits : [];
  return rows.map(normalizeEntry);
}

export async function listMemory(params: MemoryListParams): Promise<MemoryEntryView[]> {
  const resp = await apiClient.get("/api/v1/memory/entries", {
    params,
  });
  const payload = unwrapPayload<any>(resp.data);
  const rows = Array.isArray(payload) ? payload : [];
  return rows.map(normalizeEntry);
}

export async function createMemory(payload: CreateMemoryPayload) {
  const resp = await apiClient.post("/api/v1/memory/entries", {
    data: payload,
  });
  return unwrapPayload<Record<string, unknown>>(resp.data);
}

export async function archiveMemory(entryId: string) {
  const resp = await apiClient.patch(`/api/v1/memory/entries/${entryId}/archive`);
  return unwrapPayload<Record<string, unknown>>(resp.data);
}

export async function unarchiveMemory(entryId: string) {
  const resp = await apiClient.patch(`/api/v1/memory/entries/${entryId}/unarchive`);
  return unwrapPayload<Record<string, unknown>>(resp.data);
}

export function useMemorySearch(
  companyId: string | undefined,
  scope: string,
  params: MemorySearchParams,
  enabled = true,
) {
  const cid = String(companyId ?? "").trim();
  return useQuery({
    queryKey: memoryKeys.list(cid || undefined, scope, params),
    queryFn: () => searchMemory(params),
    enabled: enabled && Boolean(cid),
  });
}

export function useMemoryList(
  companyId: string | undefined,
  scope: string,
  params: MemoryListParams,
  enabled = true,
) {
  const cid = String(companyId ?? "").trim();
  return useQuery({
    queryKey: memoryKeys.browse(cid || undefined, scope, params),
    queryFn: () => listMemory(params),
    enabled: enabled && Boolean(cid),
  });
}

export function useCreateMemory() {
  return useMutation({
    mutationFn: (payload: CreateMemoryPayload) => createMemory(payload),
  });
}

export function useArchiveMemory() {
  return useMutation({
    mutationFn: (entryId: string) => archiveMemory(entryId),
  });
}

export function useUnarchiveMemory() {
  return useMutation({
    mutationFn: (entryId: string) => unarchiveMemory(entryId),
  });
}
