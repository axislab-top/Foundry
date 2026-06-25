import { useCallback, useRef, useState } from "react";
import { Download, Loader2, Eye } from "lucide-react";
import { downloadFileAsset } from "@/features/memory/files/api/fileAssetsApi";
import { isPreviewable, getPreviewMode } from "@/features/memory/files/utils/fileDisplay";
import FilePreviewModal from "@/features/memory/files/components/FilePreviewModal";

export default function FileAssetDownloadLink({
  fileAssetId,
  name,
  className,
  onError,
}: {
  fileAssetId: string;
  name: string;
  className?: string;
  onError?: (message: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDownload = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await downloadFileAsset(fileAssetId, name);
    } catch {
      const msg = "下载失败，请稍后重试";
      setError(msg);
      onError?.(msg);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setError(null), 5000);
    } finally {
      setLoading(false);
    }
  }, [loading, fileAssetId, name, onError]);

  const previewMode = getPreviewMode(name);

  return (
    <span className="inline-flex flex-col">
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={loading}
          className={
            className ??
            "inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-1 text-[11px] font-medium text-emerald-900 hover:bg-emerald-50 disabled:opacity-60"
          }
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
          {name}
        </button>
        {isPreviewable(name) && (
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="inline-flex items-center rounded-md border border-emerald-200 bg-white px-1.5 py-1 text-emerald-900 hover:bg-emerald-50"
            title="预览"
          >
            <Eye className="h-3 w-3" />
          </button>
        )}
      </span>
      {error ? <span className="mt-0.5 text-[10px] text-red-600">{error}</span> : null}
      <FilePreviewModal
        open={previewOpen}
        fileId={fileAssetId}
        fileName={name}
        previewMode={previewMode}
        onClose={() => setPreviewOpen(false)}
      />
    </span>
  );
}
