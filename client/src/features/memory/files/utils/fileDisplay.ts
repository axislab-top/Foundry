import type {
  FileAssetCategory,
  FileAssetSourceType,
  FileAssetView,
  FileCategoryUi,
  FileType,
} from "../api/fileAssetsTypes";

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function inferFileType(name: string, contentType: string): FileType {
  const lower = name.toLowerCase();
  const mime = contentType.toLowerCase();
  if (mime.includes("pdf") || lower.endsWith(".pdf")) return "pdf";
  if (
    mime.includes("word") ||
    mime.includes("document") ||
    lower.endsWith(".doc") ||
    lower.endsWith(".docx")
  ) {
    return "word";
  }
  if (
    mime.includes("sheet") ||
    mime.includes("excel") ||
    lower.endsWith(".xls") ||
    lower.endsWith(".xlsx") ||
    lower.endsWith(".csv")
  ) {
    return "excel";
  }
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(lower)) {
    return "image";
  }
  return "other";
}

export function categoryToUi(category: FileAssetCategory): FileCategoryUi {
  const map: Record<FileAssetCategory, FileCategoryUi> = {
    report: "agent-reports",
    doc: "project-docs",
    reference: "references",
    contract: "contracts",
    other: "other",
  };
  return map[category] ?? "other";
}

export function uiCategoryToApi(ui: FileCategoryUi): FileAssetCategory | undefined {
  if (ui === "all") return undefined;
  const map: Record<Exclude<FileCategoryUi, "all">, FileAssetCategory> = {
    "agent-reports": "report",
    "project-docs": "doc",
    references: "reference",
    contracts: "contract",
    other: "other",
  };
  return map[ui as Exclude<FileCategoryUi, "all">];
}

export function resolveSourceLabel(raw: {
  sourceType: FileAssetSourceType;
  sourceAgentName?: string | null;
  createdByUserId?: string | null;
}): string {
  if (raw.sourceType === "agent") {
    return raw.sourceAgentName?.trim() || "Agent 产出";
  }
  if (raw.sourceType === "user") return "手动上传";
  return "系统";
}

export function ingestStatusLabel(status: FileAssetView["ingestStatus"]): string {
  const labels: Record<FileAssetView["ingestStatus"], string> = {
    none: "未摄入",
    pending: "处理中",
    done: "已摄入",
    failed: "摄入失败",
  };
  return labels[status] ?? status;
}

/* ── File preview helpers ─────────────────────────────────────── */

export type PreviewMode = "text" | "image" | "pdf" | null;

/** 返回预览模式，null 表示不支持预览 */
export function getPreviewMode(name: string): PreviewMode {
  if (/\.(md|txt|csv|json|yaml|yml|xml|html|css|js|ts|tsx|jsx)$/i.test(name)) return "text";
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(name)) return "image";
  if (/\.pdf$/i.test(name)) return "pdf";
  return null;
}

export function isPreviewable(name: string): boolean {
  return getPreviewMode(name) !== null;
}
