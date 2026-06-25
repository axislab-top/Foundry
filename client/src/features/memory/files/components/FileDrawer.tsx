import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Trash2, X, RefreshCw, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import type { FileAssetView } from "../api/fileAssetsTypes";
import { categoryConfig, fileTypeConfig } from "../constants";
import { formatFileSize, formatTime, ingestStatusLabel, isPreviewable, getPreviewMode } from "../utils/fileDisplay";
import FilePreviewModal from "./FilePreviewModal";

type Props = {
  file: FileAssetView | null;
  onClose: () => void;
  onDownload: (file: FileAssetView) => void;
  onDelete: (file: FileAssetView) => void;
  onRetryIngest?: (file: FileAssetView) => void;
  ingesting?: boolean;
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm text-gray-700">{value}</span>
    </div>
  );
}

export default function FileDrawer({
  file,
  onClose,
  onDownload,
  onDelete,
  onRetryIngest,
  ingesting,
}: Props) {
  const [previewOpen, setPreviewOpen] = useState(false);

  if (!file) return null;

  const config = fileTypeConfig[file.type] ?? fileTypeConfig.other;
  const Icon = config.icon;
  const catLabel = categoryConfig[file.categoryUi]?.label ?? file.category;

  return (
    <AnimatePresence>
      {file && (
        <motion.div
          className="fixed inset-0 z-50 flex justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/30" onClick={onClose} />
          <motion.div
            className="relative w-96 bg-white shadow-xl overflow-y-auto"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="p-6 space-y-6">
              <button
                type="button"
                onClick={onClose}
                className="absolute right-4 top-4 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="flex items-start gap-4">
                <div className={`flex h-14 w-14 items-center justify-center rounded-xl ${config.bgColor}`}>
                  <Icon className={`h-7 w-7 ${config.color}`} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{file.name}</h3>
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${config.color} ${config.bgColor}`}
                  >
                    {config.label}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    file.ingestStatus === "done"
                      ? "bg-green-50 text-green-700"
                      : file.ingestStatus === "failed"
                        ? "bg-red-50 text-red-600"
                        : file.ingestStatus === "pending"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {ingestStatusLabel(file.ingestStatus)}
                  {file.ingestChunkCount != null && file.ingestStatus === "done"
                    ? ` · ${file.ingestChunkCount} 块`
                    : ""}
                </span>
                {(file.ingestStatus === "failed" || file.ingestStatus === "none") &&
                  onRetryIngest && (
                    <button
                      type="button"
                      disabled={ingesting}
                      onClick={() => onRetryIngest(file)}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline disabled:opacity-50"
                    >
                      <RefreshCw className="h-3 w-3" />
                      {ingesting ? "处理中…" : "加入记忆库"}
                    </button>
                  )}
              </div>

              <div className="space-y-3">
                <InfoRow label="文件大小" value={formatFileSize(file.size)} />
                <InfoRow label="来源" value={file.source} />
                {file.sourceAgentId && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Agent</span>
                    <Link
                      to={`/ai/agents/${file.sourceAgentId}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      查看 Agent
                    </Link>
                  </div>
                )}
                <InfoRow label="上传时间" value={formatTime(file.uploadTime)} />
                <InfoRow label="所属项目" value={file.projectName ?? "—"} />
                <InfoRow label="文件分类" value={catLabel} />
                {file.memoryNamespace && (
                  <InfoRow label="记忆命名空间" value={file.memoryNamespace} />
                )}
              </div>

              {file.description && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 mb-2">描述备注</h4>
                  <p className="text-sm text-gray-600 leading-relaxed">{file.description}</p>
                </div>
              )}

              <div className="flex gap-3">
                {isPreviewable(file.name) && (
                  <button
                    type="button"
                    onClick={() => setPreviewOpen(true)}
                    className="flex items-center justify-center gap-2 rounded-lg border border-[#1e3a5f] px-4 py-2.5 text-sm font-medium text-[#1e3a5f] hover:bg-gray-50"
                  >
                    <Eye className="h-4 w-4" />
                    预览
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDownload(file)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#1e3a5f] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#2d5a8e]"
                >
                  <Download className="h-4 w-4" />
                  下载文件
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(file)}
                  className="flex items-center justify-center rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      <FilePreviewModal
        open={previewOpen}
        fileId={file.id}
        fileName={file.name}
        previewMode={getPreviewMode(file.name)}
        onClose={() => setPreviewOpen(false)}
      />
    </AnimatePresence>
  );
}
