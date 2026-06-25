import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, FileText, Link2, Package } from "lucide-react";
import type { EmployeeDeliverableRichCard } from "@contracts/types/collaboration-2026";
import FileAssetDownloadLink from "./FileAssetDownloadLink";

function ArtifactIcon({ type }: { type: string }) {
  const t = type.toLowerCase();
  if (t.includes("http") || t === "url") return <Link2 className="h-3.5 w-3.5" />;
  if (t.includes("file")) return <FileText className="h-3.5 w-3.5" />;
  return <Package className="h-3.5 w-3.5" />;
}

function ArtifactRow({
  type,
  uri,
  content,
  label,
  fileAssetId,
}: {
  type: string;
  uri?: string;
  content?: string;
  label?: string;
  fileAssetId?: string;
}) {
  const title = label || type;
  const preview = content ? (content.length > 280 ? `${content.slice(0, 280)}…` : content) : null;
  const href = uri && /^https?:\/\//i.test(uri) ? uri : null;

  return (
    <div className="rounded-lg border border-emerald-100 bg-white/90 px-2.5 py-2">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-emerald-700">
          <ArtifactIcon type={type} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium text-gray-800">{title}</div>
          {preview ? <p className="mt-1 whitespace-pre-wrap break-words text-[11px] text-gray-600">{preview}</p> : null}
          {fileAssetId ? (
            <div className="mt-1.5">
              <FileAssetDownloadLink fileAssetId={fileAssetId} name={title} />
            </div>
          ) : href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-800 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              打开链接
            </a>
          ) : uri ? (
            <p className="mt-1 break-all text-[10px] text-gray-500">{uri}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function EmployeeDeliverableCard({
  card,
  onFocusTask,
}: {
  card: EmployeeDeliverableRichCard;
  onFocusTask?: (taskId: string) => void;
}) {
  const [expanded, setExpanded] = useState(card.artifacts.length <= 2);

  return (
    <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50/50 text-left shadow-sm">
      <div className="flex items-center gap-2 border-b border-emerald-100 px-3 py-2">
        <span className="text-[13px] font-semibold text-emerald-900">员工交付</span>
        {card.skillName ? (
          <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] text-emerald-800">{card.skillName}</span>
        ) : null}
        {card.status ? (
          <span className="ml-auto text-[10px] text-emerald-700">{card.status}</span>
        ) : null}
      </div>
      <div className="space-y-2 px-3 py-2.5">
        {(expanded ? card.artifacts : card.artifacts.slice(0, 1)).map((a, i) => (
          <ArtifactRow
            key={`${a.type}-${i}`}
            type={a.type}
            uri={a.uri}
            content={a.content}
            label={a.label}
            fileAssetId={a.fileAssetId}
          />
        ))}
        {card.artifacts.length > 1 ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-center gap-1 rounded-md py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100/60"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3" /> 收起
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" /> 查看全部 {card.artifacts.length} 项交付物
              </>
            )}
          </button>
        ) : null}
        {onFocusTask ? (
          <button
            type="button"
            onClick={() => onFocusTask(card.taskId)}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-emerald-900 hover:bg-emerald-50"
          >
            <ExternalLink className="h-3 w-3" />
            查看关联任务
          </button>
        ) : null}
      </div>
    </div>
  );
}
