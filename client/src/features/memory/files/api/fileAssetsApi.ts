import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/api/client";
import { fileAssetKeys } from "./queryKeys";
import type {
  FileAssetView,
  FileListQueryParams,
  FileListResponse,
  FileStatsResponse,
  UploadFilePayload,
} from "./fileAssetsTypes";
import {
  categoryToUi,
  inferFileType,
  resolveSourceLabel,
} from "../utils/fileDisplay";

function unwrapPayload<T>(raw: unknown): T {
  const v = raw as Record<string, unknown>;
  if (v && typeof v === "object" && "data" in v) return unwrapPayload<T>(v.data);
  return raw as T;
}

function normalizeFileAsset(raw: Record<string, unknown>): FileAssetView {
  const category = String(raw.category ?? "other") as FileAssetView["category"];
  const sourceType = String(raw.sourceType ?? "user") as FileAssetView["sourceType"];
  const name = String(raw.name ?? "");
  const contentType = String(raw.contentType ?? "");
  return {
    id: String(raw.id ?? ""),
    name,
    type: inferFileType(name, contentType),
    size: Number(raw.size ?? 0),
    uploadTime: String(raw.createdAt ?? ""),
    source: resolveSourceLabel({
      sourceType,
      sourceAgentName: raw.sourceAgentName as string | null | undefined,
      createdByUserId: raw.createdByUserId as string | null | undefined,
    }),
    sourceType,
    sourceAgentId: raw.sourceAgentId ? String(raw.sourceAgentId) : null,
    sourceTaskId: raw.sourceTaskId ? String(raw.sourceTaskId) : null,
    category,
    categoryUi: categoryToUi(category),
    projectId: raw.projectId ? String(raw.projectId) : null,
    projectName: raw.projectName ? String(raw.projectName) : null,
    description: raw.description ? String(raw.description) : null,
    ingestStatus: (raw.ingestStatus as FileAssetView["ingestStatus"]) ?? "none",
    ingestChunkCount:
      typeof raw.ingestChunkCount === "number" ? raw.ingestChunkCount : null,
    memoryNamespace: raw.memoryNamespace ? String(raw.memoryNamespace) : null,
    storagePath: String(raw.storagePath ?? ""),
  };
}

export async function listFileAssets(
  params: FileListQueryParams,
): Promise<FileListResponse> {
  const resp = await apiClient.get("/api/v1/file-assets", { params });
  const payload = unwrapPayload<{
    items?: Record<string, unknown>[];
    total?: number;
    page?: number;
    pageSize?: number;
  }>(resp.data);
  const items = (payload.items ?? []).map((r) => normalizeFileAsset(r));
  return {
    items,
    total: payload.total ?? items.length,
    page: payload.page ?? 1,
    pageSize: payload.pageSize ?? items.length,
  };
}

export async function getFileAssetsStats(): Promise<FileStatsResponse> {
  const resp = await apiClient.get("/api/v1/file-assets/stats");
  return unwrapPayload<FileStatsResponse>(resp.data);
}

export async function uploadFileAsset(payload: UploadFilePayload): Promise<FileAssetView> {
  const form = new FormData();
  form.append("file", payload.file);
  const params: Record<string, string> = {};
  if (payload.projectId) params.projectId = payload.projectId;
  if (payload.category) params.category = payload.category;
  if (payload.description) params.description = payload.description;
  if (payload.memoryNamespace) params.memoryNamespace = payload.memoryNamespace;
  if (payload.ingest) params.ingest = "true";

  const resp = await apiClient.post("/api/v1/file-assets/upload", form, {
    params,
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000,
  });
  const data = unwrapPayload<Record<string, unknown>>(resp.data);
  return normalizeFileAsset(data);
}

export async function deleteFileAsset(id: string): Promise<void> {
  await apiClient.delete(`/api/v1/file-assets/${encodeURIComponent(id)}`);
}

export async function getFileDownloadUrl(id: string): Promise<string> {
  const resp = await apiClient.get(
    `/api/v1/file-assets/${encodeURIComponent(id)}/download-url`,
    { params: { expiresIn: 3600 } },
  );
  const data = unwrapPayload<{ url: string }>(resp.data);
  return data.url;
}

/** 获取文本类文件原始内容（md/txt/csv/json 等） */
export async function fetchFileContent(id: string): Promise<string> {
  const blob = await fetchFileBlob(id);
  if (blob.type.includes("application/json")) {
    const text = await blob.text();
    try {
      const err = JSON.parse(text) as { message?: string };
      throw new Error(err.message || "加载文件内容失败");
    } catch (e) {
      if (e instanceof Error && e.message !== "加载文件内容失败" && !e.message.startsWith("Unexpected")) {
        throw e;
      }
      throw new Error("加载文件内容失败");
    }
  }
  return blob.text();
}

/** 获取文件 blob（图片/PDF 预览用） */
export async function fetchFileBlob(id: string): Promise<Blob> {
  const resp = await apiClient.get(
    `/api/v1/file-assets/${encodeURIComponent(id)}/download`,
    { responseType: "blob", timeout: 120_000 },
  );
  return resp.data instanceof Blob ? resp.data : new Blob([resp.data]);
}

/** 触发浏览器下载（经 API 代理读取对象存储，避免预签名 URL 超时/预览）。 */
export async function downloadFileAsset(id: string, fileName: string): Promise<void> {
  const resp = await apiClient.get(
    `/api/v1/file-assets/${encodeURIComponent(id)}/download`,
    { responseType: "blob", timeout: 120_000 },
  );
  const blob = resp.data instanceof Blob ? resp.data : new Blob([resp.data]);
  if (blob.type.includes("application/json")) {
    const text = await blob.text();
    try {
      const err = JSON.parse(text) as { message?: string };
      throw new Error(err.message || "下载失败");
    } catch (e) {
      if (e instanceof Error && e.message !== "下载失败" && !e.message.startsWith("Unexpected")) {
        throw e;
      }
      throw new Error("下载失败");
    }
  }
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fileName.trim() || "download";
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export async function triggerFileIngest(
  id: string,
  memoryNamespace?: string,
): Promise<FileAssetView> {
  const resp = await apiClient.post(
    `/api/v1/file-assets/${encodeURIComponent(id)}/ingest`,
    memoryNamespace ? { memoryNamespace } : {},
  );
  const data = unwrapPayload<Record<string, unknown>>(resp.data);
  return normalizeFileAsset(data);
}

export function useFileAssetsList(
  companyId: string | undefined,
  params: FileListQueryParams,
  enabled = true,
) {
  return useQuery({
    queryKey: fileAssetKeys.list(companyId, params),
    queryFn: () => listFileAssets(params),
    enabled: Boolean(companyId) && enabled,
    staleTime: 10_000,
  });
}

export function useFileAssetsStats(companyId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: fileAssetKeys.stats(companyId),
    queryFn: () => getFileAssetsStats(),
    enabled: Boolean(companyId) && enabled,
    staleTime: 10_000,
  });
}

export function useUploadFileAsset(companyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploadFileAsset,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: fileAssetKeys.all });
    },
  });
}

export function useDeleteFileAsset(companyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteFileAsset,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: fileAssetKeys.all });
    },
  });
}

export function useTriggerFileIngest(companyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, memoryNamespace }: { id: string; memoryNamespace?: string }) =>
      triggerFileIngest(id, memoryNamespace),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: fileAssetKeys.all });
    },
  });
}
