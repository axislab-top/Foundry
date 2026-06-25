import { useEffect, useState } from "react";
import { X, Download, Loader2 } from "lucide-react";
import type { PreviewMode } from "../utils/fileDisplay";
import { fetchFileContent, fetchFileBlob, downloadFileAsset } from "../api/fileAssetsApi";

type Props = {
  open: boolean;
  fileId: string;
  fileName: string;
  previewMode: PreviewMode;
  onClose: () => void;
};

export default function FilePreviewModal({ open, fileId, fileName, previewMode, onClose }: Props) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !previewMode) return;

    let revoked = false;
    let objectUrl: string | undefined;

    setLoading(true);
    setError(null);
    setTextContent(null);
    setBlobUrl(null);

    if (previewMode === "text") {
      fetchFileContent(fileId)
        .then((text) => {
          if (!revoked) setTextContent(text);
        })
        .catch(() => {
          if (!revoked) setError("加载文件内容失败");
        })
        .finally(() => {
          if (!revoked) setLoading(false);
        });
    } else {
      fetchFileBlob(fileId)
        .then((blob) => {
          if (revoked) return;
          objectUrl = URL.createObjectURL(blob);
          setBlobUrl(objectUrl);
        })
        .catch(() => {
          if (!revoked) setError("加载文件失败");
        })
        .finally(() => {
          if (!revoked) setLoading(false);
        });
    }

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, fileId, previewMode]);

  const handleDownload = () => {
    void downloadFileAsset(fileId, fileName);
  };

  if (!open || !previewMode) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h2 className="truncate text-sm font-semibold text-gray-900">{fileName}</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5" />
            下载
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        )}

        {error && (
          <div className="flex h-full items-center justify-center">
            <span className="text-sm text-red-500">{error}</span>
          </div>
        )}

        {!loading && !error && previewMode === "text" && textContent !== null && (
          <pre className="whitespace-pre-wrap break-words p-6 font-mono text-sm leading-relaxed text-gray-800">
            {textContent}
          </pre>
        )}

        {!loading && !error && previewMode === "image" && blobUrl && (
          <div className="flex h-full items-center justify-center p-4">
            <img
              src={blobUrl}
              alt={fileName}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        )}

        {!loading && !error && previewMode === "pdf" && blobUrl && (
          <iframe
            src={blobUrl}
            title={fileName}
            className="h-full w-full border-0"
          />
        )}
      </div>
    </div>
  );
}
