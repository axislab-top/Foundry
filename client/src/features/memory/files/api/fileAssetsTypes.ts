export type FileAssetSourceType = "agent" | "user" | "system";
export type FileAssetCategory = "report" | "doc" | "reference" | "contract" | "other";
export type FileAssetIngestStatus = "none" | "pending" | "done" | "failed";

/** UI file type derived from content type / extension */
export type FileType = "pdf" | "word" | "excel" | "image" | "other";

/** UI category keys (legacy page labels) */
export type FileCategoryUi =
  | "all"
  | "agent-reports"
  | "project-docs"
  | "references"
  | "contracts"
  | "other";

export type FileAssetView = {
  id: string;
  name: string;
  type: FileType;
  size: number;
  uploadTime: string;
  source: string;
  sourceType: FileAssetSourceType;
  sourceAgentId?: string | null;
  sourceTaskId?: string | null;
  category: FileAssetCategory;
  categoryUi: FileCategoryUi;
  projectId?: string | null;
  projectName?: string | null;
  description?: string | null;
  ingestStatus: FileAssetIngestStatus;
  ingestChunkCount?: number | null;
  memoryNamespace?: string | null;
  storagePath: string;
};

export type FileListQueryParams = {
  q?: string;
  projectId?: string;
  projectFilter?: string;
  sourceType?: FileAssetSourceType;
  sourceTaskId?: string;
  category?: FileAssetCategory;
  sort?: "time" | "name" | "size";
  page?: number;
  pageSize?: number;
};

export type FileListResponse = {
  items: FileAssetView[];
  total: number;
  page: number;
  pageSize: number;
};

export type FileStatsResponse = {
  totalFiles: number;
  thisMonth: number;
  totalSizeBytes: number;
};

export type UploadFilePayload = {
  file: File;
  projectId?: string;
  category?: FileAssetCategory;
  description?: string;
  ingest?: boolean;
  memoryNamespace?: string;
};
