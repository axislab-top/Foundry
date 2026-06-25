import { useId, useState } from "react";
import { ChevronDown, ChevronRight, GitMerge } from "lucide-react";

export type DistributionDraftRow = { department: string; priority: string; deliverable: string };

function CollapsibleDeliverable({ text, rowId }: { text: string; rowId: string }) {
  const [open, setOpen] = useState(false);
  const lines = text.split(/\r?\n/);
  const isLong = text.length > 360 || lines.length > 6;
  const preview = isLong && !open ? lines.slice(0, 6).join("\n") + (lines.length > 6 ? "\n…" : "") : text;

  return (
    <div className="min-w-0">
      <p id={rowId} className="whitespace-pre-wrap break-words text-[var(--text-primary)]">
        {preview}
      </p>
      {isLong ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={rowId}
          onClick={() => setOpen(!open)}
          className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-medium text-[var(--primary-active)] hover:underline"
        >
          {open ? (
            <>
              <ChevronDown className="h-3 w-3" aria-hidden />
              收起全文
            </>
          ) : (
            <>
              <ChevronRight className="h-3 w-3" aria-hidden />
              展开全文
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}

/**
 * 主编排（Orchestration）草案：与后端「交付蓝图每一检查点 → 部门任务、依赖成链」对齐。
 */
export default function DistributionDraftTable({ rows }: { rows: DistributionDraftRow[] }) {
  const baseId = useId();

  return (
    <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200/90 bg-[var(--surface)] text-left shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/90 px-3 py-2">
        <GitMerge className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
        <span className="text-[12px] font-semibold text-slate-900">部门主编排草案</span>
        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600">
          {rows.length} 条任务
        </span>
      </div>
      <p className="border-b border-slate-100 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
        每<strong className="text-slate-800">一行</strong>对应交付蓝图中的<strong className="text-slate-800">一个检查点</strong>
        ，按步骤顺序推进。要改分工可在输入框说明；确认后回复「确认部门分工」或「下发各部门」。
      </p>
      <table className="w-full min-w-[300px] text-[11px]">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--surface)] text-[var(--text-tertiary)]">
            <th className="w-12 px-2 py-1.5 text-left font-medium">步骤</th>
            <th className="px-2 py-1.5 text-left font-medium">牵头部门</th>
            <th className="w-14 px-2 py-1.5 text-left font-medium">优先级</th>
            <th className="min-w-[140px] px-2 py-1.5 text-left font-medium">交付与验收说明</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.department}-${i}`} className="border-b border-[var(--border)] last:border-0">
              <td className="align-top px-2 py-2 font-mono text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">
                {String(i + 1).padStart(2, "0")}
              </td>
              <td className="align-top px-2 py-2 font-medium text-[var(--text-primary)]">{r.department}</td>
              <td className="align-top px-2 py-2 text-[var(--text-secondary)]">{r.priority}</td>
              <td className="align-top px-2 py-2">
                <CollapsibleDeliverable text={r.deliverable} rowId={`${baseId}-r${i}`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
