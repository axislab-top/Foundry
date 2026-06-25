import { AlertCircle } from "lucide-react";
import { slugDisplayLabel } from "../utils/dispatchPlanDependencies";

export type DispatchSkipRow = {
  departmentSlug: string;
  reason: string;
};

const REASON_LABEL: Record<string, string> = {
  no_room: "未配置部门群",
  no_director: "未绑定部门主管",
  non_dispatchable: "部门不可指派",
  no_org_node: "组织树无此部门",
  rpc_failed: "派发 RPC 失败",
  assign_failed: "创建子目标失败",
};

export default function DispatchFailureBanner({
  skipped,
  onRetry,
}: {
  skipped: DispatchSkipRow[];
  onRetry?: () => void;
}) {
  if (!skipped.length) return null;

  return (
    <div className="mb-3 shrink-0 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 shadow-sm">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-amber-950">
            部分部门未能自动派发（{skipped.length}）
          </div>
          <ul className="mt-1.5 space-y-1 text-[11px] text-amber-900">
            {skipped.slice(0, 6).map((row) => (
              <li key={`${row.departmentSlug}-${row.reason}`}>
                <span className="font-medium">{slugDisplayLabel(row.departmentSlug)}</span>
                <span className="text-amber-800/90">
                  {" "}
                  — {REASON_LABEL[row.reason] ?? row.reason}
                </span>
              </li>
            ))}
          </ul>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[10px] font-medium text-amber-900 hover:bg-amber-100"
            >
              在任务中心补发
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
