import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import type { CeoPipelineProgressMetadata } from "@contracts/types/collaboration-2026";
import { pipelineStageLabel } from "../utils/replayMetadata";

function statusIcon(status: CeoPipelineProgressMetadata["status"]) {
  switch (status) {
    case "started":
      return <Loader2 className="h-3 w-3 animate-spin text-blue-600" />;
    case "completed":
      return <CheckCircle2 className="h-3 w-3 text-emerald-600" />;
    case "failed":
      return <XCircle className="h-3 w-3 text-rose-600" />;
    case "awaiting_approval":
      return <Clock className="h-3 w-3 text-amber-600" />;
    default:
      return <Clock className="h-3 w-3 text-slate-400" />;
  }
}

function statusLabel(status: CeoPipelineProgressMetadata["status"]): string {
  switch (status) {
    case "started":
      return "进行中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "awaiting_approval":
      return "待审批";
    default:
      return status;
  }
}

export default function CeoPipelineProgressChip({
  progress,
}: {
  progress: CeoPipelineProgressMetadata;
}) {
  return (
    <div className="mt-1.5 inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-lg border border-blue-200/80 bg-blue-50/70 px-2 py-1 text-[11px] text-blue-900">
      {statusIcon(progress.status)}
      <span className="font-medium">CEO 管线</span>
      <span className="text-blue-700/80">·</span>
      <span>{pipelineStageLabel(progress.stage)}</span>
      <span className="text-blue-700/80">·</span>
      <span>{statusLabel(progress.status)}</span>
    </div>
  );
}
